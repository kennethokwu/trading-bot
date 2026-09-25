import { config } from '../config.js'

const fmtPrice = (v) => (v >= 100 ? v.toFixed(2) : v.toPrecision(6))

// Cross-exchange spot arbitrage: buy at the exchange with the lowest ask,
// sell at the exchange with the highest bid, both legs simultaneously.
// Assumes inventory is pre-funded on every venue (no per-trade transfers).
export class CrossExchangeStrategy {
  constructor(book, onOpportunity) {
    this.book = book
    this.onOpportunity = onOpportunity
    // Map "exchange:symbol" -> groups containing that market, so a quote
    // update only re-evaluates the groups it can affect.
    this.marketToGroups = new Map()
    for (const group of config.crossExchangeGroups) {
      for (const m of group.markets) {
        const key = `${m.exchange}:${m.symbol}`
        if (!this.marketToGroups.has(key)) this.marketToGroups.set(key, [])
        this.marketToGroups.get(key).push(group)
      }
    }
  }

  onQuote(quote) {
    const groups = this.marketToGroups.get(`${quote.exchange}:${quote.symbol}`)
    if (!groups) return
    const now = Date.now()
    for (const group of groups) this.evaluate(group, now)
  }

  evaluate(group, now) {
    const fresh = []
    for (const m of group.markets) {
      const q = this.book.get(m.exchange, m.symbol, now)
      if (q) fresh.push(q)
    }
    if (fresh.length < 2) return

    let best = null
    for (const buy of fresh) {
      for (const sell of fresh) {
        if (buy.exchange === sell.exchange) continue
        // Proceeds of 1 unit bought at `buy.ask` and sold at `sell.bid`,
        // net of both taker fees and a per-leg slippage buffer.
        const cost = buy.ask * (1 + config.fees[buy.exchange] + config.slippageBufferPerLeg)
        const proceeds = sell.bid * (1 - config.fees[sell.exchange] - config.slippageBufferPerLeg)
        const netEdge = proceeds / cost - 1
        if (!best || netEdge > best.netEdge) {
          best = { buy, sell, netEdge, grossEdge: sell.bid / buy.ask - 1 }
        }
      }
    }
    if (!best || best.netEdge < config.minNetEdgeToLog) return

    // Executable size is capped by top-of-book depth on both legs.
    const maxBase = Math.min(best.buy.askQty || Infinity, best.sell.bidQty || Infinity)
    const maxNotional = Number.isFinite(maxBase) ? maxBase * best.buy.ask : null

    this.onOpportunity({
      ts: now,
      strategy: 'cross-exchange',
      key: `xex:${group.name}:${best.buy.exchange}>${best.sell.exchange}`,
      asset: group.name,
      description:
        `Buy ${group.name} on ${best.buy.exchange} @ ${fmtPrice(best.buy.ask)} (${best.buy.symbol}), ` +
        `sell on ${best.sell.exchange} @ ${fmtPrice(best.sell.bid)} (${best.sell.symbol})`,
      grossEdge: best.grossEdge,
      netEdge: best.netEdge,
      maxNotional,
      note:
        best.buy.symbol.split('/')[1] !== best.sell.symbol.split('/')[1]
          ? 'USD vs USDT legs — edge includes stablecoin basis risk'
          : null,
    })
  }
}
