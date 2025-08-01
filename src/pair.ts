import { BigDecimal, Address, BigInt, log } from '@graphprotocol/graph-ts'
import {
  Pair,
  Token,
  Transaction,
  Mint as MintEvent,
  Burn as BurnEvent,
  Swap as SwapEvent,
  Bundle,
  Factory
} from '../generated/schema'
import {
  Mint,
  Burn,
  Swap,
  Transfer,
  Sync,
  Pair as PairContract
} from '../generated/templates/Pair/Pair'
import {
  convertTokenToDecimal,
  ZERO_BD,
  BI_18,
  ONE_BI,
  ZERO_BI,
  FACTORY_ADDRESS
} from './helpers'
import { updatePrices } from './pricing'

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export function handleTransfer(event: Transfer): void {
  // Initial liquidity transfers are Mint events
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return
  }

  // get pair and load contract
  let pair = Pair.load(event.address.toHexString())
  if (pair === null) {
    return
  }

  // Update liquidity provider count
  if (event.params.from.toHexString() == ADDRESS_ZERO) {
    pair.liquidityProviderCount = pair.liquidityProviderCount.plus(ONE_BI)
  }

  if (event.params.to.toHexString() == ADDRESS_ZERO && pair.liquidityProviderCount.gt(ZERO_BI)) {
    pair.liquidityProviderCount = pair.liquidityProviderCount.minus(ONE_BI)
  }

  pair.save()
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHex())
  if (pair === null) {
    return
  }
  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (token0 === null || token1 === null) {
    return
  }

  // Fetch the totalSupply from the pair contract
  let pairContract = PairContract.bind(event.address)
  let totalSupplyResult = pairContract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    pair.totalSupply = convertTokenToDecimal(totalSupplyResult.value, BI_18)
  }

  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals)
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals)

  // FIXED: Corrected price calculations
  // token0Price = how much token1 you get for 1 token0
  // token1Price = how much token0 you get for 1 token1
  if (pair.reserve0.notEqual(ZERO_BD)) pair.token0Price = pair.reserve1.div(pair.reserve0)
  else pair.token0Price = ZERO_BD
  if (pair.reserve1.notEqual(ZERO_BD)) pair.token1Price = pair.reserve0.div(pair.reserve1)
  else pair.token1Price = ZERO_BD

  pair.save()

  // Update all USD prices
  updatePrices(pair)
}

export function handleMint(event: Mint): void {
  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.burns = []
    transaction.swaps = []
  }

  let mints = transaction.mints
  let mint = new MintEvent(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(mints.length).toString())
  )

  let pair = Pair.load(event.address.toHex())
  if (pair === null) {
    return
  }

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (token0 === null || token1 === null) {
    return
  }

  // Update pair reserves
  pair.txCount = pair.txCount.plus(ONE_BI)

  // Fetch updated totalSupply after mint
  let pairContract = PairContract.bind(event.address)
  let totalSupplyResult = pairContract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    pair.totalSupply = convertTokenToDecimal(totalSupplyResult.value, BI_18)
  }

  // Create mint event
  mint.transaction = transaction.id
  mint.pair = pair.id
  mint.to = event.params.sender
  mint.liquidity = convertTokenToDecimal(event.params.amount0, token0.decimals)
  mint.timestamp = transaction.timestamp
  mint.transaction = transaction.id
  mint.save()

  // Update transaction mint array
  mints.push(mint.id)
  transaction.mints = mints
  transaction.save()

  pair.save()
}

export function handleBurn(event: Burn): void {
  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.burns = []
    transaction.swaps = []
  }

  let burns = transaction.burns
  let burn = new BurnEvent(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(burns.length).toString())
  )

  let pair = Pair.load(event.address.toHex())
  if (pair === null) {
    return
  }

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (token0 === null || token1 === null) {
    return
  }

  // Update pair
  pair.txCount = pair.txCount.plus(ONE_BI)

  // Fetch updated totalSupply after burn
  let pairContract = PairContract.bind(event.address)
  let totalSupplyResult = pairContract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    pair.totalSupply = convertTokenToDecimal(totalSupplyResult.value, BI_18)
  }

  // Create burn event
  burn.transaction = transaction.id
  burn.needsComplete = false
  burn.pair = pair.id
  burn.liquidity = convertTokenToDecimal(event.params.amount0, token0.decimals)
  burn.timestamp = transaction.timestamp
  burn.to = event.params.to
  burn.sender = event.params.sender
  burn.amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  burn.amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
  burn.transaction = transaction.id
  burn.save()

  // Update transaction burn array
  burns.push(burn.id)
  transaction.burns = burns
  transaction.save()

  pair.save()
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address.toHexString())
  if (pair === null) {
    return
  }

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (token0 === null || token1 === null) {
    return
  }

  let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals)
  let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals)
  let amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals)
  let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

  // Calculate volume
  let amount0Total = amount0Out.plus(amount0In)
  let amount1Total = amount1Out.plus(amount1In)

  // Get USD prices
  let bundle = Bundle.load('1')
  let amount0USD = ZERO_BD
  let amount1USD = ZERO_BD
  
  if (bundle !== null && bundle.ethPrice.gt(ZERO_BD)) {
    if (token0.derivedETH !== null) {
      amount0USD = amount0Total.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
    }
    if (token1.derivedETH !== null) {
      amount1USD = amount1Total.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
    }
  }

  // FIXED: Calculate tracked amount USD without double counting
  let trackedAmountUSD = ZERO_BD
  
  if (amount0USD.gt(ZERO_BD) && amount1USD.gt(ZERO_BD)) {
    // Both tokens have USD values, take the average
    trackedAmountUSD = amount0USD.plus(amount1USD).div(BigDecimal.fromString('2'))
  } else if (amount0USD.gt(ZERO_BD)) {
    // Only token0 has USD value
    trackedAmountUSD = amount0USD
  } else if (amount1USD.gt(ZERO_BD)) {
    // Only token1 has USD value
    trackedAmountUSD = amount1USD
  }

  // Update pair volume
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
  pair.txCount = pair.txCount.plus(ONE_BI)
  pair.save()

  // Update token volume
  token0.tradeVolume = token0.tradeVolume.plus(amount0Total)
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(amount0USD)
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.tradeVolume = token1.tradeVolume.plus(amount1Total)
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(amount1USD)
  token1.txCount = token1.txCount.plus(ONE_BI)
  token0.save()
  token1.save()

  // Create swap event
  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.blockNumber = event.block.number
    transaction.timestamp = event.block.timestamp
    transaction.mints = []
    transaction.burns = []
    transaction.swaps = []
  }
  let swaps = transaction.swaps
  let swap = new SwapEvent(
    event.transaction.hash
      .toHexString()
      .concat('-')
      .concat(BigInt.fromI32(swaps.length).toString())
  )

  // Swap event
  swap.transaction = transaction.id
  swap.pair = pair.id
  swap.timestamp = transaction.timestamp
  swap.transaction = transaction.id
  swap.sender = event.params.sender
  swap.amount0In = amount0In
  swap.amount1In = amount1In
  swap.amount0Out = amount0Out
  swap.amount1Out = amount1Out
  swap.to = event.params.to
  swap.from = event.transaction.from
  swap.amountUSD = trackedAmountUSD  // FIXED: Use tracked amount instead of sum
  swap.save()

  // Update transaction
  swaps.push(swap.id)
  transaction.swaps = swaps
  transaction.save()

  // Update factory
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory !== null) {
    factory.totalVolumeUSD = factory.totalVolumeUSD.plus(swap.amountUSD)
    factory.txCount = factory.txCount.plus(ONE_BI)
    factory.save()
  }
}