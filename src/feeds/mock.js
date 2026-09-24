import { EventEmitter } from 'node:events'

// Synthetic feed for demos and offline development. Random-walks realistic
// mid prices per market, keeps exchanges loosely tethered to a shared mid,
// and occasionally injects a short-lived cross-exchange dislocation so the
// detection -> paper-trade pipeline can be seen working end to end.
const BASE_MIDS = {
  'BTC/USDT': 112_000,
  'BTC/USD': 112_000,
  'ETH/USDT': 4_100,
  'ETH/USD': 4_100,
  'SOL/USDT': 210,
  'SOL/USD': 210,
  'XRP/USDT': 2.9,
  'ETH/BTC': 4_100 / 112_000,
  'SOL/BTC': 210 / 112_000,
  'XRP/BTC': 2.9 / 112_000,
}

export class MockFeed extends EventEmitter {
  constructor(exchange, symbols, book, shared) {
    super()
    this.name = exchange
    this.exchange = exchange
    this.symbols = symbols
    this.book = book
    this.shared = shared // shared mids across mock exchanges, keyed by asset group
    this.connected = false
    this.lastMessageAt = null
    this.offsets = new Map() // per-market deviation from the shared mid
    this.dislocation = null
  }

  groupKey(symbol) {
    // BTC/USDT and BTC/USD share one underlying mid.
    return symbol.split('/')[0] + (symbol.endsWith('/BTC') ? '/BTC' : '/$')
  }

  start() {
    this.connected = true
    this.timer = setInterval(() => this.tick(), 250)
  }

  tick() {
    const now = Date.now()
    this.lastMessageAt = now

    for (const symbol of this.symbols) {
      const key = this.groupKey(symbol)
      if (!this.shared.has(key)) this.shared.set(key, BASE_MIDS[symbol] ?? 100)
      // Shared random walk, ~3 bps per tick.
      let mid = this.shared.get(key) * (1 + (Math.random() - 0.5) * 0.0006)
      this.shared.set(key, mid)

      // Per-exchange mean-reverting offset, occasionally kicked into a
      // dislocation big enough to clear fees.
      let off = this.offsets.get(symbol) ?? 0
      off = off * 0.9 + (Math.random() - 0.5) * 0.0004
      if (Math.random() < 0.002) off += (Math.random() < 0.5 ? -1 : 1) * 0.02
      this.offsets.set(symbol, off)
      mid *= 1 + off

      const halfSpread = mid * 0.0002
      this.book.update({
        exchange: this.exchange,
        symbol,
        bid: mid - halfSpread,
        bidQty: 1 + Math.random() * 5,
        ask: mid + halfSpread,
        askQty: 1 + Math.random() * 5,
        ts: now,
      })
    }
  }

  stop() {
    this.connected = false
    clearInterval(this.timer)
  }

  status() {
    return { feed: this.name, connected: this.connected, lastMessageAt: this.lastMessageAt, mock: true }
  }
}
