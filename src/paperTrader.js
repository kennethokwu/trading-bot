import { config } from './config.js'

// Turns detected opportunities into simulated trades and tracks cumulative
// paper P&L. No orders are ever sent anywhere.
export class PaperTrader {
  constructor(store) {
    this.store = store
    this.lastTradeAt = new Map() // opportunity key -> ts
    this.pnl = 0
    this.tradeCount = 0
  }

  onOpportunity(opp) {
    this.store.recordOpportunity(opp)
    if (opp.netEdge < config.minNetEdgeToTrade) return

    const last = this.lastTradeAt.get(opp.key) ?? 0
    if (opp.ts - last < config.tradeCooldownMs) return
    this.lastTradeAt.set(opp.key, opp.ts)

    const notional = Math.min(
      config.tradeNotional,
      opp.maxNotional ?? config.tradeNotional
    )
    if (notional <= 0) return

    const profit = notional * opp.netEdge
    this.pnl += profit
    this.tradeCount++

    this.store.recordTrade({
      ts: opp.ts,
      strategy: opp.strategy,
      key: opp.key,
      asset: opp.asset,
      description: opp.description,
      netEdge: opp.netEdge,
      notional,
      profit,
      cumulativePnl: this.pnl,
      note: opp.note,
    })
  }
}
