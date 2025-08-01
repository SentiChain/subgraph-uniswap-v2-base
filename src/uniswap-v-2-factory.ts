import { PairCreated } from '../generated/UniswapV2Factory/UniswapV2Factory'
import { Pair, Token, Factory, Bundle } from '../generated/schema'
import { Pair as PairTemplate } from '../generated/templates'
import { Pair as PairContract } from '../generated/templates/Pair/Pair'
import { BigInt, log } from '@graphprotocol/graph-ts'
import {
  FACTORY_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  fetchTokenSymbol,
  fetchTokenName,
  fetchTokenDecimals,
  fetchTokenTotalSupply,
  WETH_ADDRESS,
  isStablecoin,
  convertTokenToDecimal,
  BI_18
} from './helpers'

export function handlePairCreated(event: PairCreated): void {
  // load factory
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory === null) {
    factory = new Factory(FACTORY_ADDRESS)
    factory.pairCount = 0
    factory.totalVolumeUSD = ZERO_BD
    factory.totalLiquidityUSD = ZERO_BD
    factory.txCount = ZERO_BI
  }
  factory.pairCount = factory.pairCount + 1
  factory.save()

  // create the tokens
  let token0 = Token.load(event.params.token0.toHexString())
  let token1 = Token.load(event.params.token1.toHexString())

  // fetch info if null
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHexString())
    token0.symbol = fetchTokenSymbol(event.params.token0)
    token0.name = fetchTokenName(event.params.token0)
    token0.decimals = fetchTokenDecimals(event.params.token0)
    token0.totalSupply = fetchTokenTotalSupply(event.params.token0)
    token0.derivedETH = ZERO_BD
    token0.tradeVolume = ZERO_BD
    token0.tradeVolumeUSD = ZERO_BD
    token0.txCount = ZERO_BI
    token0.totalLiquidity = ZERO_BD
    token0.whitelistPairs = []
  }

  if (token1 === null) {
    token1 = new Token(event.params.token1.toHexString())
    token1.symbol = fetchTokenSymbol(event.params.token1)
    token1.name = fetchTokenName(event.params.token1)
    token1.decimals = fetchTokenDecimals(event.params.token1)
    token1.totalSupply = fetchTokenTotalSupply(event.params.token1)
    token1.derivedETH = ZERO_BD
    token1.tradeVolume = ZERO_BD
    token1.tradeVolumeUSD = ZERO_BD
    token1.txCount = ZERO_BI
    token1.totalLiquidity = ZERO_BD
    token1.whitelistPairs = []
  }

  // create the tracked contract based on the template
  PairTemplate.create(event.params.pair)

  // create pair
  let pair = new Pair(event.params.pair.toHexString()) as Pair
  pair.token0 = token0.id
  pair.token1 = token1.id
  pair.liquidityProviderCount = ZERO_BI
  pair.createdAtTimestamp = event.block.timestamp
  pair.createdAtBlockNumber = event.block.number
  pair.txCount = ZERO_BI
  pair.reserve0 = ZERO_BD
  pair.reserve1 = ZERO_BD
  pair.trackedReserveETH = ZERO_BD
  pair.reserveETH = ZERO_BD
  pair.reserveUSD = ZERO_BD
  pair.totalSupply = ZERO_BD
  pair.volumeToken0 = ZERO_BD
  pair.volumeToken1 = ZERO_BD
  pair.volumeUSD = ZERO_BD
  pair.token0Price = ZERO_BD
  pair.token1Price = ZERO_BD

  // Try to fetch initial totalSupply (usually 0 at creation, but good to check)
  let pairContract = PairContract.bind(event.params.pair)
  let totalSupplyResult = pairContract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    pair.totalSupply = convertTokenToDecimal(totalSupplyResult.value, BI_18)
  }

  // Update whitelist pairs - add this pair to relevant tokens
  let isToken0Whitelist = token0.id == WETH_ADDRESS || isStablecoin(token0.id)
  let isToken1Whitelist = token1.id == WETH_ADDRESS || isStablecoin(token1.id)

  if (isToken0Whitelist || isToken1Whitelist) {
    // Add to token0 whitelist if token1 is WETH or stablecoin
    if (isToken1Whitelist) {
      let whitelist0 = token0.whitelistPairs
      whitelist0.push(pair.id)
      token0.whitelistPairs = whitelist0
    }
    
    // Add to token1 whitelist if token0 is WETH or stablecoin
    if (isToken0Whitelist) {
      let whitelist1 = token1.whitelistPairs
      whitelist1.push(pair.id)
      token1.whitelistPairs = whitelist1
    }
  }

  // create the bundle
  let bundle = Bundle.load('1')
  if (bundle === null) {
    bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
    bundle.save()
  }

  token0.save()
  token1.save()
  pair.save()
}