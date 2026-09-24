import fs from 'node:fs'
import path from 'node:path'

// Keeps recent activity in memory for the dashboard and appends everything
// to JSONL files so runs can be analyzed afterwards.
export class Store {
  constructor(dataDir) {
    this.opportunities = []
    this.trades = []
    this.pnlSeries = [] // [{ts, pnl}]
    this.opportunityCount = 0

    fs.mkdirSync(dataDir, { recursive: true })
    this.oppStream = fs.createWriteStream(path.join(dataDir, 'opportunities.jsonl'), { flags: 'a' })
    this.tradeStream = fs.createWriteStream(path.join(dataDir, 'trades.jsonl'), { flags: 'a' })
  }

  recordOpportunity(opp) {
    this.opportunityCount++
    this.opportunities.push(opp)
    if (this.opportunities.length > 200) this.opportunities.shift()
    this.oppStream.write(JSON.stringify(opp) + '\n')
  }

  recordTrade(trade) {
    this.trades.push(trade)
    if (this.trades.length > 500) this.trades.shift()
    this.pnlSeries.push({ ts: trade.ts, pnl: trade.cumulativePnl })
    if (this.pnlSeries.length > 2000) {
      // Thin the series rather than dropping history: keep every other point.
      this.pnlSeries = this.pnlSeries.filter((_, i) => i % 2 === 0)
    }
    this.tradeStream.write(JSON.stringify(trade) + '\n')
  }

  close() {
    this.oppStream.end()
    this.tradeStream.end()
  }
}
