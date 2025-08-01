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
  // Check USDC pair first (native USDC)
  let usdcPairs = findPairsWithTokens(WETH_ADDRESS, USDC_ADDRESS)
  if (usdcPairs.length > 0) {
    let usdcPair = Pair.load(usdcPairs[0])
    if (usdcPair !== null && usdcPair.reserve0.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      if (usdcPair.token0 == WETH_ADDRESS) {
        return usdcPair.token1Price
      } else {
        return usdcPair.token0Price
      }
    }
  }

  // Check USDbC pair (bridged USDC)
  let usdbcPairs = findPairsWithTokens(WETH_ADDRESS, USDBC_ADDRESS)
  if (usdbcPairs.length > 0) {
    let usdbcPair = Pair.load(usdbcPairs[0])
    if (usdbcPair !== null && usdbcPair.reserve0.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      if (usdbcPair.token0 == WETH_ADDRESS) {
        return usdbcPair.token1Price
      } else {
        return usdbcPair.token0Price
      }
    }
  }

  // Check DAI pair
  let daiPairs = findPairsWithTokens(WETH_ADDRESS, DAI_ADDRESS)
  if (daiPairs.length > 0) {
    let daiPair = Pair.load(daiPairs[0])
    if (daiPair !== null && daiPair.reserve0.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      if (daiPair.token0 == WETH_ADDRESS) {
        return daiPair.token1Price
      } else {
        return daiPair.token0Price
      }
    }
  }

  return ZERO_BD
}

// Helper to find pairs containing both tokens
function findPairsWithTokens(token0: string, token1: string): string[] {
  // In a real implementation, you'd query for pairs
  // For now, we'll check known pair addresses
  let pairs: string[] = []
  
  // Check if pair exists with token0-token1 order
  let pair = Pair.load(token0.concat('-').concat(token1))
  if (pair !== null) {
    pairs.push(pair.id)
  }
  
  // Check if pair exists with token1-token0 order
  pair = Pair.load(token1.concat('-').concat(token0))
  if (pair !== null) {
    pairs.push(pair.id)
  }
  
  return pairs
}

// Update all USD prices
export function updatePrices(pair: Pair): void {
  let bundle = Bundle.load('1')
  if (bundle === null) {
    bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
  }

  // Update ETH price
  let ethPrice = getEthPriceInUSD()
  if (ethPrice.gt(ZERO_BD)) {
    bundle.ethPrice = ethPrice
  }
  bundle.save()

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  
  if (token0 === null || token1 === null) {
    return
  }

  // Calculate derived ETH prices
  if (token0.id == WETH_ADDRESS) {
    token1.derivedETH = pair.token0Price
  } else if (token1.id == WETH_ADDRESS) {
    token0.derivedETH = pair.token1Price
  } else if (isStablecoin(token0.id) && bundle.ethPrice.gt(ZERO_BD)) {
    // If token0 is stablecoin, derive token1's ETH price
    token1.derivedETH = pair.token0Price.div(bundle.ethPrice)
  } else if (isStablecoin(token1.id) && bundle.ethPrice.gt(ZERO_BD)) {
    // If token1 is stablecoin, derive token0's ETH price
    token0.derivedETH = pair.token1Price.div(bundle.ethPrice)
  }

  // If we don't have derived ETH for tokens, set to zero
  if (token0.derivedETH === null) {
    token0.derivedETH = ZERO_BD
  }
  if (token1.derivedETH === null) {
    token1.derivedETH = ZERO_BD
  }

  // Update USD reserves and volume
  if (bundle.ethPrice.gt(ZERO_BD)) {
    let reserve0USD = pair.reserve0.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
    let reserve1USD = pair.reserve1.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
    pair.reserveUSD = reserve0USD.plus(reserve1USD)
    pair.reserveETH = pair.reserve0.times(token0.derivedETH as BigDecimal)
                        .plus(pair.reserve1.times(token1.derivedETH as BigDecimal))
  }

  token0.save()
  token1.save()
  pair.save()
}
