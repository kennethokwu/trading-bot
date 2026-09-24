import { ReconnectingFeed } from './reconnectingFeed.js'

// Binance combined bookTicker stream: best bid/ask per symbol, pushed on change.
export class BinanceFeed extends ReconnectingFeed {
  constructor(symbols, book) {
    super('binance')
    this.symbols = symbols // canonical, e.g. "ETH/BTC"
    this.book = book
    // "ETHBTC" -> "ETH/BTC"
    this.symbolMap = new Map(symbols.map((s) => [s.replace('/', ''), s]))
  }

  url() {
    const streams = this.symbols
      .map((s) => `${s.replace('/', '').toLowerCase()}@bookTicker`)
      .join('/')
    return `wss://stream.binance.com:9443/stream?streams=${streams}`
  }

  onOpen() {
    // Subscription is encoded in the URL; nothing to send.
  }

  handleMessage(msg) {
    const d = msg.data
    if (!d?.s) return
    const symbol = this.symbolMap.get(d.s)
    if (!symbol) return
    this.book.update({
      exchange: 'binance',
      symbol,
      bid: Number(d.b),
      bidQty: Number(d.B),
      ask: Number(d.a),
      askQty: Number(d.A),
      ts: Date.now(),
    })
  }
}
