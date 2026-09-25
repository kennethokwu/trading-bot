import { config, symbolsByExchange } from './config.js'
import { QuoteBook } from './quoteBook.js'
import { Store } from './store.js'
import { PaperTrader } from './paperTrader.js'
import { CrossExchangeStrategy } from './strategies/crossExchange.js'
import { TriangularStrategy } from './strategies/triangular.js'
import { BinanceFeed } from './feeds/binance.js'
import { CoinbaseFeed } from './feeds/coinbase.js'
import { KrakenFeed } from './feeds/kraken.js'
import { MockFeed } from './feeds/mock.js'
import { FundingMonitor } from './funding/monitor.js'
import { fetchBinanceFunding, fetchBybitFunding, mockFundingFetcher } from './funding/sources.js'
import { createServer } from './server.js'

const startedAt = Date.now()
const book = new QuoteBook({ maxQuoteAgeMs: config.maxQuoteAgeMs })
const store = new Store(config.dataDir)
const trader = new PaperTrader(store)

const onOpportunity = (opp) => trader.onOpportunity(opp)
const strategies = [
  new CrossExchangeStrategy(book, onOpportunity),
  new TriangularStrategy(book, onOpportunity),
]
book.on('quote', (q) => {
  for (const s of strategies) s.onQuote(q)
})

const symbols = symbolsByExchange()
let feeds
if (config.mockFeeds) {
  const shared = new Map()
  feeds = Object.entries(symbols).map(
    ([exchange, syms]) => new MockFeed(exchange, syms, book, shared)
  )
  console.log('Running with MOCK feeds — synthetic prices, no exchange connections.')
} else {
  feeds = [
    new BinanceFeed(symbols.binance, book),
    new CoinbaseFeed(symbols.coinbase, book),
    new KrakenFeed(symbols.kraken, book),
  ]
}

for (const feed of feeds) {
  feed.on?.('status', (s) =>
    console.log(`[feed] ${s.feed} ${s.connected ? 'connected' : 'disconnected'}`)
  )
  feed.on?.('error', (err) => console.error(`[feed] ${feed.name}:`, err.message))
  feed.start()
}

const funding = new FundingMonitor(
  config.mockFeeds ? [mockFundingFetcher()] : [fetchBinanceFunding, fetchBybitFunding]
)
funding.start()

const app = createServer({ book, store, trader, feeds, funding, startedAt })
app.listen(config.port, () =>
  console.log(`Dashboard on http://localhost:${config.port} (paper trading only — no real orders)`)
)

// Periodic console heartbeat so headless runs stay observable.
setInterval(() => {
  console.log(
    `[stats] quotes=${book.updateCount} opportunities=${store.opportunityCount} ` +
      `paperTrades=${trader.tradeCount} paperPnl=$${trader.pnl.toFixed(2)}`
  )
}, 30_000).unref()

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down.`)
    for (const feed of feeds) feed.stop()
    funding.stop()
    store.close()
    process.exit(0)
  })
}
