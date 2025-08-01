import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'
import { ERC20 } from '../generated/UniswapV2Factory/ERC20'
import { ERC20SymbolBytes } from '../generated/UniswapV2Factory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../generated/UniswapV2Factory/ERC20NameBytes'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

// WETH address on Base
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'

// Stablecoin addresses on Base
export const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // Native USDC on Base
export const USDBC_ADDRESS = '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca' // USDbC (Bridged USDC)
export const DAI_ADDRESS = '0x50c5725949a6f0c72e6c4a641f24049a917db0cb' // DAI on Base

// Minimum liquidity threshold for price updates
export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('50')
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('0.01')

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString('1000000000000000000')
}

export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(exponentToBigDecimal(BI_18))
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function equalToZero(value: BigDecimal): boolean {
  const formattedVal = parseFloat(value.toString())
  const zero = parseFloat(ZERO_BD.toString())
  if (zero == formattedVal) {
    return true
  }
  return false
}

export function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001'
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  let symbolValue = 'unknown'
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

export function fetchTokenName(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  let nameValue = 'unknown'
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    return totalSupplyResult.value
  }
  return BigInt.fromI32(0)
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  let decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    return BigInt.fromI32(decimalResult.value)
  }
  return BigInt.fromI32(18) // Default to 18 decimals
}

// List of stablecoin addresses for price derivation
export function isStablecoin(address: string): boolean {
  return address == USDC_ADDRESS || 
         address == USDBC_ADDRESS || 
         address == DAI_ADDRESS
}
