import { config } from '../config.js'

// Triangular arbitrage on a single exchange (Binance), bridged through BTC:
//   forward:  USDT -> BTC -> BASE -> USDT
//   reverse:  USDT -> BASE -> BTC -> USDT
// All three legs are taker orders on one venue, so there is no transfer or
// inventory problem — only fees, slippage, and being fast enough.
export class TriangularStrategy {
  constructor(book, onOpportunity) {
    this.book = book
    this.onOpportunity = onOpportunity
    this.exchange = 'binance'
    // Map symbol -> triangles it participates in.
    this.symbolToBases = new Map()
    for (const base of config.triangularBases) {
      for (const s of ['BTC/USDT', `${base}/BTC`, `${base}/USDT`]) {
        if (!this.symbolToBases.has(s)) this.symbolToBases.set(s, new Set())
        this.symbolToBases.get(s).add(base)
      }
    }
  }

  onQuote(quote) {
    if (quote.exchange !== this.exchange) return
    const bases = this.symbolToBases.get(quote.symbol)
    if (!bases) return
    const now = Date.now()
    for (const base of bases) this.evaluate(base, now)
  }

  evaluate(base, now) {
    const btcUsdt = this.book.get(this.exchange, 'BTC/USDT', now)
    const baseBtc = this.book.get(this.exchange, `${base}/BTC`, now)
    const baseUsdt = this.book.get(this.exchange, `${base}/USDT`, now)
    if (!btcUsdt || !baseBtc || !baseUsdt) return

    const feeFactor = 1 - config.fees[this.exchange] - config.slippageBufferPerLeg

    // Start each direction with 1 USDT and see what comes back.
    const forward =
      ((((1 / btcUsdt.ask) * feeFactor) / baseBtc.ask) * feeFactor) *
      baseUsdt.bid *
      feeFactor
    const reverse =
      (((1 / baseUsdt.ask) * feeFactor) * baseBtc.bid * feeFactor) *
      btcUsdt.bid *
      feeFactor

    for (const [direction, result] of [
      ['forward', forward],
      ['reverse', reverse],
    ]) {
      const netEdge = result - 1
      if (netEdge < config.minNetEdgeToLog) continue
      const path =
        direction === 'forward'
          ? `USDT→BTC→${base}→USDT`
          : `USDT→${base}→BTC→USDT`
      this.onOpportunity({
        ts: now,
        strategy: 'triangular',
        key: `tri:${base}:${direction}`,
        asset: base,
        description: `${path} on ${this.exchange}`,
        grossEdge: netEdge + 3 * (config.fees[this.exchange] + config.slippageBufferPerLeg),
        netEdge,
        maxNotional: null,
        note: null,
      })
    }
  }
}
