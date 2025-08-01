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
  let wethToken = Token.load(WETH_ADDRESS)
  if (wethToken === null) {
    return ZERO_BD
  }

  // Get whitelist pairs for WETH
  let pairs = wethToken.whitelistPairs
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD

  // Go through each pair and find the one with most liquidity
  for (let i = 0; i < pairs.length; i++) {
    let pair = Pair.load(pairs[i])
    if (pair === null) continue

    // Check if this pair has a stablecoin
    let isToken0Stable = isStablecoin(pair.token0)
    let isToken1Stable = isStablecoin(pair.token1)
    
    if (!isToken0Stable && !isToken1Stable) continue

    if (pair.reserveETH.gt(largestLiquidityETH) && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      largestLiquidityETH = pair.reserveETH
      
      // Calculate price based on which token is WETH
      if (pair.token0 == WETH_ADDRESS && isToken1Stable) {
        priceSoFar = pair.token1Price
      } else if (pair.token1 == WETH_ADDRESS && isToken0Stable) {
        priceSoFar = pair.token0Price
      }
    }
  }

  return priceSoFar
}

// Find derived ETH price for a token
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }

  let pairs = token.whitelistPairs
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD

  // Loop through whitelist pairs
  for (let i = 0; i < pairs.length; i++) {
    let pair = Pair.load(pairs[i])
    if (pair === null) continue

    if (pair.reserveETH.gt(largestLiquidityETH)) {
      let token0 = Token.load(pair.token0)
      let token1 = Token.load(pair.token1)
      
      if (token0 === null || token1 === null) continue

      // Calculate derived ETH based on pair liquidity
      if (pair.token0 == token.id && token1.derivedETH !== null) {
        let derivedETH1 = token1.derivedETH as BigDecimal
        if (derivedETH1.gt(ZERO_BD)) {
          largestLiquidityETH = pair.reserveETH
          priceSoFar = pair.token1Price.times(derivedETH1)
        }
      } else if (pair.token1 == token.id && token0.derivedETH !== null) {
        let derivedETH0 = token0.derivedETH as BigDecimal
        if (derivedETH0.gt(ZERO_BD)) {
          largestLiquidityETH = pair.reserveETH
          priceSoFar = pair.token0Price.times(derivedETH0)
        }
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

  // Update ETH price
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

  // Update pair ETH reserve
  let derivedETH0 = token0.derivedETH as BigDecimal
  let derivedETH1 = token1.derivedETH as BigDecimal
  
  pair.reserveETH = pair.reserve0.times(derivedETH0)
                      .plus(pair.reserve1.times(derivedETH1))
  
  // Update pair USD reserves
  if (bundle.ethPrice.gt(ZERO_BD)) {
    pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)
  } else {
    pair.reserveUSD = ZERO_BD
  }

  pair.save()
}