import { Pair, Token, Bundle } from '../generated/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts'
import { 
  ZERO_BD, 
  ONE_BD, 
  WETH_ADDRESS,
  USDC_ADDRESS,
  USDBC_ADDRESS,
  DAI_ADDRESS,
  isStablecoin,
  MINIMUM_LIQUIDITY_THRESHOLD_ETH
} from './helpers'

// Get ETH price in USD from stablecoin pairs
export function getEthPriceInUSD(): BigDecimal {
  // Look for direct WETH-stablecoin pairs
  let usdcPair = Pair.load('0x88a43bbdf9d098eec7bceda4e2494615dfd9bb9c') // WETH-USDC pair address from your data
  if (usdcPair !== null) {
    if (usdcPair.token0 == WETH_ADDRESS) {
      // token0 is WETH, token1 is USDC
      // token0Price tells us how much USDC per WETH
      return usdcPair.token0Price
    } else if (usdcPair.token1 == WETH_ADDRESS) {
      // token1 is WETH, token0 is USDC
      // token1Price tells us how much USDC per WETH
      return usdcPair.token1Price
    }
  }

  // Fallback: look through all WETH pairs for stablecoins
  let wethToken = Token.load(WETH_ADDRESS)
  if (wethToken === null) {
    return ZERO_BD
  }

  let pairs = wethToken.whitelistPairs
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD

  for (let i = 0; i < pairs.length; i++) {
    let pair = Pair.load(pairs[i])
    if (pair === null) continue

    // Check if this pair has a stablecoin
    let isToken0Stable = isStablecoin(pair.token0)
    let isToken1Stable = isStablecoin(pair.token1)
    
    if (!isToken0Stable && !isToken1Stable) continue

    // Calculate actual ETH in the pair
    let ethReserve = ZERO_BD
    if (pair.token0 == WETH_ADDRESS) {
      ethReserve = pair.reserve0
    } else if (pair.token1 == WETH_ADDRESS) {
      ethReserve = pair.reserve1
    }

    if (ethReserve.gt(largestLiquidityETH) && ethReserve.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      largestLiquidityETH = ethReserve
      
      // Calculate price based on which token is WETH
      if (pair.token0 == WETH_ADDRESS && isToken1Stable) {
        priceSoFar = pair.token0Price // How much stable per WETH
      } else if (pair.token1 == WETH_ADDRESS && isToken0Stable) {
        priceSoFar = pair.token1Price // How much stable per WETH
      }
    }
  }

  return priceSoFar
}

// Find derived ETH price for a token (how much ETH is 1 token worth)
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }

  // For stablecoins, derive from ETH price
  if (isStablecoin(token.id)) {
    let ethPrice = getEthPriceInUSD()
    if (ethPrice.gt(ZERO_BD)) {
      return ONE_BD.div(ethPrice) // 1 USD / ETH price = ETH per USD
    }
  }

  let pairs = token.whitelistPairs
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD

  // Loop through whitelist pairs to find price
  for (let i = 0; i < pairs.length; i++) {
    let pair = Pair.load(pairs[i])
    if (pair === null) continue

    // Calculate actual ETH reserves in the pair
    let ethReserve = ZERO_BD
    if (pair.token0 == WETH_ADDRESS) {
      ethReserve = pair.reserve0
    } else if (pair.token1 == WETH_ADDRESS) {
      ethReserve = pair.reserve1
    } else {
      // No direct WETH in this pair, check if we can derive through the other token
      let token0 = Token.load(pair.token0)
      let token1 = Token.load(pair.token1)
      if (token0 === null || token1 === null) continue

      if (token0.derivedETH !== null) {
        let derivedETH0 = token0.derivedETH as BigDecimal
        if (derivedETH0.gt(ZERO_BD)) {
          ethReserve = pair.reserve0.times(derivedETH0)
        }
      } else if (token1.derivedETH !== null) {
        let derivedETH1 = token1.derivedETH as BigDecimal
        if (derivedETH1.gt(ZERO_BD)) {
          ethReserve = pair.reserve1.times(derivedETH1)
        }
      }
    }

    if (ethReserve.gt(largestLiquidityETH)) {
      // Calculate derived ETH based on pair
      if (pair.token0 == token.id) {
        if (pair.token1 == WETH_ADDRESS) {
          // Direct pair with WETH
          priceSoFar = pair.token1Price // ETH per token
        } else {
          // Derive through other token
          let token1 = Token.load(pair.token1)
          if (token1 !== null && token1.derivedETH !== null) {
            let derivedETH1 = token1.derivedETH as BigDecimal
            if (derivedETH1.gt(ZERO_BD)) {
              // token1Price = token1 per token0
              // derivedETH1 = ETH per token1
              // So ETH per token0 = (token1 per token0) * (ETH per token1)
              priceSoFar = pair.token1Price.times(derivedETH1)
            }
          }
        }
        largestLiquidityETH = ethReserve
      } else if (pair.token1 == token.id) {
        if (pair.token0 == WETH_ADDRESS) {
          // Direct pair with WETH
          priceSoFar = pair.token0Price // ETH per token
        } else {
          // Derive through other token
          let token0 = Token.load(pair.token0)
          if (token0 !== null && token0.derivedETH !== null) {
            let derivedETH0 = token0.derivedETH as BigDecimal
            if (derivedETH0.gt(ZERO_BD)) {
              // token0Price = token0 per token1
              // derivedETH0 = ETH per token0
              // So ETH per token1 = (token0 per token1) * (ETH per token0)
              priceSoFar = pair.token0Price.times(derivedETH0)
            }
          }
        }
        largestLiquidityETH = ethReserve
      }
    }
  }

  return priceSoFar
}

// Update all USD prices
export function updatePrices(pair: Pair): void {
  let bundle = Bundle.load('1')
  if (bundle === null) {
    bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
  }

  // Update ETH price first
  bundle.ethPrice = getEthPriceInUSD()
  bundle.save()

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  
  if (token0 === null || token1 === null) {
    return
  }

  // Calculate derived ETH prices
  token0.derivedETH = findEthPerToken(token0)
  token1.derivedETH = findEthPerToken(token1)

  token0.save()
  token1.save()

  // FIXED: Calculate reserveETH - only count actual ETH in the pool
  pair.reserveETH = ZERO_BD
  if (pair.token0 == WETH_ADDRESS) {
    pair.reserveETH = pair.reserve0.times(BigDecimal.fromString('2')) // Double counting for total pool value
  } else if (pair.token1 == WETH_ADDRESS) {
    pair.reserveETH = pair.reserve1.times(BigDecimal.fromString('2')) // Double counting for total pool value
  } else {
    // No WETH in pool, calculate ETH equivalent value
    if (token0.derivedETH !== null && token1.derivedETH !== null) {
      let derivedETH0 = token0.derivedETH as BigDecimal
      let derivedETH1 = token1.derivedETH as BigDecimal
      pair.reserveETH = pair.reserve0.times(derivedETH0).plus(pair.reserve1.times(derivedETH1))
    }
  }
  
  // FIXED: Calculate USD reserves based on ETH price
  if (bundle.ethPrice.gt(ZERO_BD) && pair.reserveETH.gt(ZERO_BD)) {
    pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)
  } else if (bundle.ethPrice.gt(ZERO_BD)) {
    // Try direct USD calculation for stablecoin pairs
    let usdReserve = ZERO_BD
    if (isStablecoin(pair.token0)) {
      usdReserve = usdReserve.plus(pair.reserve0.times(BigDecimal.fromString('2')))
    } else if (isStablecoin(pair.token1)) {
      usdReserve = usdReserve.plus(pair.reserve1.times(BigDecimal.fromString('2')))
    }
    
    if (usdReserve.gt(ZERO_BD)) {
      pair.reserveUSD = usdReserve
    } else {
      pair.reserveUSD = ZERO_BD
    }
  } else {
    pair.reserveUSD = ZERO_BD
  }

  // Set trackedReserveETH same as reserveETH for now
  pair.trackedReserveETH = pair.reserveETH

  pair.save()
}