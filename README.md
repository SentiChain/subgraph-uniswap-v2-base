# Uniswap V2 Subgraph for Base Chain

This subgraph indexes all Uniswap V2 activity on Base chain, providing comprehensive real-time and historical data for all pools, tokens, and transactions.

## Overview

- **Network**: Base (Chain ID: 8453)
- **Factory Contract**: `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`
- **Start Block**: 6601915

## Features

### Pool Analytics
- Real-time pool reserves and token balances
- Pool creation events with timestamps
- Current exchange rates between token pairs
- Total supply tracking for LP tokens
- Liquidity provider count per pool

### Volume & Trading Metrics
- Trade volume in both tokens and USD (with proper single-counting to avoid duplication)
- Transaction counts (swaps, mints, burns)
- Individual swap data with amounts and addresses
- Token price tracking over time

### Liquidity Events
- Mint events (liquidity additions)
- Burn events (liquidity removals)
- Transfer tracking for LP tokens

### Historical Data
- Hourly and daily snapshots
- Historical reserves and volume
- Price history for all tokens

### USD Pricing
- Automatic USD calculation via ETH/stablecoin pairs
- Supports USDC (0x833589fcd6edb6e08f4c7c32d4f71b54bda02913), USDbC (0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca), and DAI (0x50c5725949a6f0c72e6c4a641f24049a917db0cb) for price derivation
- Real-time USD values for all pools
- Uses the most liquid WETH-stablecoin pair for ETH pricing

## Installation

```bash
# Clone the repository
git clone https://github.com/SentiChain/subgraph-uniswap-v2-base.git
cd subgraph-uniswap-v2-base

# Install dependencies
npm install

# Generate code from GraphQL schema
graph codegen

# Build the subgraph
graph build

# Deploy to The Graph (requires authentication)
graph deploy base-uniswap-v-2
```

## Query Examples

### Get top pools by volume

```graphql
{
  pairs(first: 10, orderBy: volumeUSD, orderDirection: desc) {
    id
    token0 {
      symbol
      name
    }
    token1 {
      symbol
      name
    }
    volumeUSD
    reserveUSD
    txCount
    liquidityProviderCount
  }
}
```

### Get token information

```graphql
{
  tokens(first: 10, orderBy: tradeVolumeUSD, orderDirection: desc) {
    id
    symbol
    name
    decimals
    tradeVolumeUSD
    totalLiquidity
    derivedETH
  }
}
```

### Get recent swaps

```graphql
{
  swaps(first: 10, orderBy: timestamp, orderDirection: desc) {
    pair {
      token0 { symbol }
      token1 { symbol }
    }
    amount0In
    amount1In
    amount0Out
    amount1Out
    amountUSD
    timestamp
  }
}
```

### Get pool historical data

```graphql
{
  pairDayDatas(first: 7, orderBy: date, orderDirection: desc, where: {pair: "PAIR_ADDRESS"}) {
    date
    dailyVolumeUSD
    reserveUSD
    dailyTxns
  }
}
```

### Find specific pool by token addresses

```graphql
{
  pairs(where: {
    or: [
      {
        token0: "0x4200000000000000000000000000000000000006"
        token1: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      },
      {
        token0: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        token1: "0x4200000000000000000000000000000000000006"
      }
    ]
  }) {
    id
    token0 { symbol }
    token1 { symbol }
    reserve0
    reserve1
    token0Price
    token1Price
    reserveUSD
  }
}
```

## Schema Overview

### Core Entities

- **Factory** - Singleton tracking overall protocol stats
- **Token** - ERC20 tokens with metadata and metrics
- **Pair** - Uniswap V2 pools with reserves, prices, and volume
- **Transaction** - Blockchain transactions containing swaps/mints/burns
- **Swap** - Individual token swaps
- **Mint** - Liquidity addition events
- **Burn** - Liquidity removal events
- **Bundle** - ETH price for USD calculations

### Time Series Data

- **PairDayData** - Daily aggregated data per pair
- **PairHourData** - Hourly aggregated data per pair
- **TokenDayData** - Daily aggregated data per token
- **FactoryDayData** - Daily protocol-wide data

## Important Notes

### Data Accuracy
This subgraph logs all on-chain events factually, including:
- Pairs with extreme token supplies or unusual decimals
- Abandoned or manipulated pools
- Test tokens and scam tokens

The subgraph's role is to provide an accurate historical record of all on-chain activity. Filtering and validation of token legitimacy should be performed by consuming applications.

### Volume Calculation
Volume is calculated using the average of both token amounts when both have USD values, preventing double-counting that would inflate metrics.

### Price Derivation
- WETH price is derived from the most liquid WETH-stablecoin pair
- Token prices are derived through their most liquid pairs with WETH or stablecoins
- Pairs with insufficient liquidity may have derived prices of zero