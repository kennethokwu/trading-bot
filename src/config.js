import 'dotenv/config'

const bool = (v, dflt) => (v === undefined ? dflt : /^(1|true|yes)$/i.test(v))
const num = (v, dflt) => (v === undefined || v === '' ? dflt : Number(v))

export const config = {
  port: num(process.env.PORT, 5000),

  // Run against synthetic feeds instead of live exchange websockets.
  // Useful for demos, tests, and environments without exchange connectivity.
  mockFeeds: bool(process.env.MOCK_FEEDS, false),

  // Quotes older than this are ignored by the strategies. A spread against a
  // stale quote is the classic way a scanner hallucinates free money.
  maxQuoteAgeMs: num(process.env.MAX_QUOTE_AGE_MS, 10_000),

  // Taker fees by exchange (fraction, not percent). Defaults are the lowest
  // published no-volume tiers; set your real tier in .env.
  fees: {
    binance: num(process.env.FEE_BINANCE, 0.001), // 0.10%
    coinbase: num(process.env.FEE_COINBASE, 0.006), // 0.60% Advanced Trade taker
    kraken: num(process.env.FEE_KRAKEN, 0.004), // 0.40% taker
  },

  // Extra haircut applied to every simulated fill to model slippage beyond
  // top-of-book, adverse selection, and USD vs USDT basis. Per leg.
  slippageBufferPerLeg: num(process.env.SLIPPAGE_BUFFER, 0.0002), // 2 bps

  // An opportunity is logged when the net edge exceeds this...
  minNetEdgeToLog: num(process.env.MIN_NET_EDGE_LOG, 0),
  // ...and paper-traded when it exceeds this.
  minNetEdgeToTrade: num(process.env.MIN_NET_EDGE_TRADE, 0.0005), // 5 bps

  // Simulated position size per paper trade, in quote currency (USD/USDT).
  tradeNotional: num(process.env.TRADE_NOTIONAL, 1000),

  // Don't re-trade the same opportunity key more often than this. Real fills
  // would consume the book; without a cooldown the paper trader would count
  // one dislocation dozens of times before the feeds tick.
  tradeCooldownMs: num(process.env.TRADE_COOLDOWN_MS, 5_000),

  // Cross-exchange comparison groups. USD and USDT markets are compared
  // against each other deliberately — the slippage buffer absorbs the basis,
  // and each opportunity records the caveat.
  crossExchangeGroups: [
    {
      name: 'BTC',
      markets: [
        { exchange: 'binance', symbol: 'BTC/USDT' },
        { exchange: 'coinbase', symbol: 'BTC/USD' },
        { exchange: 'kraken', symbol: 'BTC/USD' },
      ],
    },
    {
      name: 'ETH',
      markets: [
        { exchange: 'binance', symbol: 'ETH/USDT' },
        { exchange: 'coinbase', symbol: 'ETH/USD' },
        { exchange: 'kraken', symbol: 'ETH/USD' },
      ],
    },
    {
      name: 'SOL',
      markets: [
        { exchange: 'binance', symbol: 'SOL/USDT' },
        { exchange: 'coinbase', symbol: 'SOL/USD' },
        { exchange: 'kraken', symbol: 'SOL/USD' },
      ],
    },
  ],

  // Triangular cycles on Binance, all bridged through BTC:
  // USDT -> BTC -> {base} -> USDT and the reverse.
  triangularBases: ['ETH', 'SOL', 'XRP'],

  // Funding-rate carry monitor: long spot + short perpetual, collecting the
  // funding payments perps pay around the clock. This is the "continuous
  // cumulative profit" strategy — slow, steady accrual rather than latency
  // races. The simulator holds at most one paper position at a time.
  funding: {
    pollIntervalMs: num(process.env.FUNDING_POLL_MS, 60_000),
    carryNotional: num(process.env.CARRY_NOTIONAL, 10_000),
    // Round-trip cost of entering + exiting (spot buy/sell + perp open/close),
    // charged up front — the position starts underwater and earns it back.
    entryCostPct: num(process.env.CARRY_ENTRY_COST, 0.002), // 0.20%
    minAnnualizedToEnter: num(process.env.CARRY_MIN_APR, 0.08), // 8% APR
    exitAnnualizedBelow: num(process.env.CARRY_EXIT_APR, 0),
    // Rates beyond this per interval are usually data glitches or death-spiral
    // alts; ignore them.
    maxAbsRatePerInterval: num(process.env.CARRY_MAX_RATE, 0.005),
  },

  // Persist opportunities and paper trades as JSONL under ./data
  dataDir: process.env.DATA_DIR || 'data',
}

// Every Binance symbol the triangular strategy needs.
export function binanceTriangularSymbols() {
  const symbols = new Set(['BTC/USDT'])
  for (const base of config.triangularBases) {
    symbols.add(`${base}/USDT`)
    symbols.add(`${base}/BTC`)
  }
  return [...symbols]
}

// All symbols per exchange, combining both strategies' needs.
export function symbolsByExchange() {
  const map = { binance: new Set(), coinbase: new Set(), kraken: new Set() }
  for (const group of config.crossExchangeGroups) {
    for (const m of group.markets) map[m.exchange]?.add(m.symbol)
  }
  for (const s of binanceTriangularSymbols()) map.binance.add(s)
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]))
}
