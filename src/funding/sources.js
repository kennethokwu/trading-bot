// Public REST sources for perpetual-futures funding rates. No API keys.
// Each fetcher returns [{exchange, symbol, rate, intervalHours, markPrice,
// nextFundingTime}], where `rate` is the funding rate per interval
// (positive = longs pay shorts, i.e. the carry position collects).

export const annualize = (r) => r.rate * (24 / r.intervalHours) * 365

// One call returns every USDT-margined perp on Binance.
export async function fetchBinanceFunding() {
  const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex')
  if (!res.ok) throw new Error(`binance funding: HTTP ${res.status}`)
  const rows = await res.json()
  return rows
    .filter((r) => r.symbol?.endsWith('USDT') && Number.isFinite(Number(r.lastFundingRate)))
    .map((r) => ({
      exchange: 'binance',
      symbol: r.symbol,
      rate: Number(r.lastFundingRate),
      intervalHours: 8,
      markPrice: Number(r.markPrice),
      nextFundingTime: Number(r.nextFundingTime) || null,
    }))
}

// One call returns every linear (USDT) perp on Bybit.
export async function fetchBybitFunding() {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear')
  if (!res.ok) throw new Error(`bybit funding: HTTP ${res.status}`)
  const j = await res.json()
  const list = j?.result?.list ?? []
  return list
    .filter((r) => r.symbol?.endsWith('USDT') && Number.isFinite(Number(r.fundingRate)))
    .map((r) => ({
      exchange: 'bybit',
      symbol: r.symbol,
      rate: Number(r.fundingRate),
      intervalHours: 8,
      markPrice: Number(r.markPrice),
      nextFundingTime: Number(r.nextFundingTime) || null,
    }))
}

// Synthetic funding rates for mock mode: random walk around realistic levels
// with an occasional spike, so the carry simulator visibly enters and accrues.
export function mockFundingFetcher() {
  const state = new Map([
    ['BTCUSDT', 0.0001],
    ['ETHUSDT', 0.00012],
    ['SOLUSDT', 0.00018],
    ['DOGEUSDT', 0.00025],
  ])
  const marks = { BTCUSDT: 112_000, ETHUSDT: 4_100, SOLUSDT: 210, DOGEUSDT: 0.24 }
  return async function fetchMockFunding() {
    const now = Date.now()
    const out = []
    for (const [symbol, prev] of state) {
      let rate = prev * 0.98 + (Math.random() - 0.48) * 0.00003
      if (Math.random() < 0.01) rate += 0.0004 // funding spike
      rate = Math.max(-0.001, Math.min(0.002, rate))
      state.set(symbol, rate)
      out.push({
        exchange: 'mock',
        symbol,
        rate,
        intervalHours: 8,
        markPrice: marks[symbol],
        nextFundingTime: now + (8 * 3600e3 - (now % (8 * 3600e3))),
      })
    }
    return out
  }
}
