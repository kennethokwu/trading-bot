import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createServer({ book, store, trader, feeds, funding, startedAt }) {
  const app = express()
  app.use(express.static(path.join(__dirname, '..', 'public')))

  // Quotes/sec over a rolling window.
  let lastCount = 0
  let lastAt = Date.now()
  let quotesPerSec = 0
  setInterval(() => {
    const now = Date.now()
    quotesPerSec = ((book.updateCount - lastCount) / (now - lastAt)) * 1000
    lastCount = book.updateCount
    lastAt = now
  }, 2000).unref()

  app.get('/api/state', (req, res) => {
    res.json({
      now: Date.now(),
      startedAt,
      mock: config.mockFeeds,
      quotesPerSec: Math.round(quotesPerSec * 10) / 10,
      totalQuotes: book.updateCount,
      feeds: feeds.map((f) => f.status()),
      quotes: book.snapshot(),
      opportunityCount: store.opportunityCount,
      opportunities: store.opportunities.slice(-50).reverse(),
      trades: store.trades.slice(-50).reverse(),
      tradeCount: trader.tradeCount,
      pnl: trader.pnl,
      pnlSeries: store.pnlSeries,
      funding: funding.snapshot(),
      config: {
        fees: config.fees,
        slippageBufferPerLeg: config.slippageBufferPerLeg,
        minNetEdgeToTrade: config.minNetEdgeToTrade,
        tradeNotional: config.tradeNotional,
        carryMinApr: config.funding.minAnnualizedToEnter,
      },
    })
  })

  return app
}
