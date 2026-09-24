import { ReconnectingFeed } from './reconnectingFeed.js'

// Coinbase Exchange websocket, "ticker" channel: includes best bid/ask.
export class CoinbaseFeed extends ReconnectingFeed {
  constructor(symbols, book) {
    super('coinbase')
    this.symbols = symbols // canonical, e.g. "BTC/USD"
    this.book = book
    // "BTC-USD" -> "BTC/USD"
    this.productMap = new Map(symbols.map((s) => [s.replace('/', '-'), s]))
  }

  url() {
    return 'wss://ws-feed.exchange.coinbase.com'
  }

  onOpen(ws) {
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        product_ids: [...this.productMap.keys()],
        channels: ['ticker'],
      })
    )
  }

  handleMessage(msg) {
    if (msg.type !== 'ticker') return
    const symbol = this.productMap.get(msg.product_id)
    if (!symbol) return
    this.book.update({
      exchange: 'coinbase',
      symbol,
      bid: Number(msg.best_bid),
      bidQty: Number(msg.best_bid_size ?? 0),
      ask: Number(msg.best_ask),
      askQty: Number(msg.best_ask_size ?? 0),
      ts: Date.now(),
    })
  }
}
