import { EventEmitter } from 'node:events'

// In-memory top-of-book cache, keyed by `${exchange}:${symbol}`.
// Feeds write quotes in; strategies read them out and are notified per update.
export class QuoteBook extends EventEmitter {
  constructor({ maxQuoteAgeMs }) {
    super()
    this.maxQuoteAgeMs = maxQuoteAgeMs
    this.quotes = new Map()
    this.updateCount = 0
  }

  key(exchange, symbol) {
    return `${exchange}:${symbol}`
  }

  update(quote) {
    if (!(quote.bid > 0) || !(quote.ask > 0)) return
    this.quotes.set(this.key(quote.exchange, quote.symbol), quote)
    this.updateCount++
    this.emit('quote', quote)
  }

  // Returns the quote only if it's fresh enough to act on.
  get(exchange, symbol, now = Date.now()) {
    const q = this.quotes.get(this.key(exchange, symbol))
    if (!q || now - q.ts > this.maxQuoteAgeMs) return null
    return q
  }

  snapshot() {
    const now = Date.now()
    return [...this.quotes.values()]
      .map((q) => ({ ...q, stale: now - q.ts > this.maxQuoteAgeMs }))
      .sort((a, b) => a.exchange.localeCompare(b.exchange) || a.symbol.localeCompare(b.symbol))
  }
}
