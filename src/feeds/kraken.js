import { ReconnectingFeed } from './reconnectingFeed.js'

// Kraken public websocket v1, "ticker" channel.
export class KrakenFeed extends ReconnectingFeed {
  constructor(symbols, book) {
    super('kraken')
    this.symbols = symbols // canonical, e.g. "BTC/USD"
    this.book = book
    // Kraken names BTC "XBT" on the wire: "XBT/USD" -> "BTC/USD".
    this.pairMap = new Map(symbols.map((s) => [s.replace('BTC/', 'XBT/'), s]))
  }

  url() {
    return 'wss://ws.kraken.com'
  }

  onOpen(ws) {
    ws.send(
      JSON.stringify({
        event: 'subscribe',
        pair: [...this.pairMap.keys()],
        subscription: { name: 'ticker' },
      })
    )
  }

  handleMessage(msg) {
    // Ticker updates arrive as arrays: [channelID, data, "ticker", "XBT/USD"]
    if (!Array.isArray(msg) || msg[2] !== 'ticker') return
    const symbol = this.pairMap.get(msg[3])
    const d = msg[1]
    if (!symbol || !d?.a || !d?.b) return
    this.book.update({
      exchange: 'kraken',
      symbol,
      bid: Number(d.b[0]),
      bidQty: Number(d.b[2]),
      ask: Number(d.a[0]),
      askQty: Number(d.a[2]),
      ts: Date.now(),
    })
  }
}
