import { config } from '../config.js'
import { annualize } from './sources.js'

// Polls funding rates and runs the paper cash-and-carry position:
// long spot + short perp on the symbol with the best positive funding,
// accruing funding pro-rata between polls. Entry/exit costs are charged
// up front, so the position starts underwater and earns its way back —
// exactly how the real trade behaves.
export class FundingMonitor {
  constructor(fetchers) {
    this.fetchers = fetchers
    this.rates = []
    this.lastUpdated = null
    this.errors = []
    this.position = null
    this.realizedPnl = 0
    this.closedPositions = []
  }

  start() {
    this.poll()
    this.timer = setInterval(() => this.poll(), config.funding.pollIntervalMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
  }

  async poll() {
    const results = await Promise.allSettled(this.fetchers.map((f) => f()))
    const rows = []
    this.errors = []
    for (const r of results) {
      if (r.status === 'fulfilled') rows.push(...r.value)
      else this.errors.push(r.reason?.message ?? String(r.reason))
    }
    if (rows.length === 0) return

    const now = Date.now()
    this.rates = rows
      .filter((r) => Math.abs(r.rate) <= config.funding.maxAbsRatePerInterval)
      .sort((a, b) => annualize(b) - annualize(a))
    this.lastUpdated = now
    this.updateCarry(now)
  }

  updateCarry(now) {
    const cfg = config.funding
    if (this.position) {
      const p = this.position
      const cur = this.rates.find((r) => r.exchange === p.exchange && r.symbol === p.symbol)
      if (cur) {
        // Accrue funding pro-rata for the time elapsed since the last poll.
        p.accrued += p.notional * cur.rate * ((now - p.lastAccrualAt) / (cur.intervalHours * 3600e3))
        p.lastAccrualAt = now
        p.currentAnnualized = annualize(cur)
        if (p.currentAnnualized < cfg.exitAnnualizedBelow) this.close(p, now, 'funding fell below exit threshold')
      }
      return // one position at a time
    }

    const best = this.rates.find((r) => r.rate > 0)
    if (best && annualize(best) >= cfg.minAnnualizedToEnter) {
      this.position = {
        exchange: best.exchange,
        symbol: best.symbol,
        notional: cfg.carryNotional,
        entryCost: cfg.carryNotional * cfg.entryCostPct,
        entryAnnualized: annualize(best),
        currentAnnualized: annualize(best),
        accrued: 0,
        openedAt: now,
        lastAccrualAt: now,
      }
    }
  }

  close(p, now, reason) {
    const pnl = p.accrued - p.entryCost
    this.realizedPnl += pnl
    this.closedPositions.push({ ...p, closedAt: now, reason, pnl })
    if (this.closedPositions.length > 100) this.closedPositions.shift()
    this.position = null
  }

  snapshot() {
    const p = this.position
    return {
      lastUpdated: this.lastUpdated,
      errors: this.errors,
      rates: this.rates.slice(0, 12).map((r) => ({ ...r, annualized: annualize(r) })),
      position: p
        ? { ...p, unrealizedPnl: p.accrued - p.entryCost }
        : null,
      realizedPnl: this.realizedPnl,
      totalPnl: this.realizedPnl + (p ? p.accrued - p.entryCost : 0),
      closedPositions: this.closedPositions.slice(-10).reverse(),
    }
  }
}
