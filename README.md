# Arbitrage Scanner & Paper Trader

A crypto arbitrage **opportunity scanner** that runs continuously, detects two
kinds of arbitrage in real time, simulates the trades on paper, and shows
everything on a live dashboard. It never places real orders and needs **no API
keys** — all market data comes from public exchange websockets.

The point of this app is to answer the question that matters before risking
money: *after fees and slippage, is there actually an edge at my size?* Run it
for a few weeks, then look at the paper P&L and the opportunity log.

## Strategies

**Cross-exchange spot arbitrage.** Compares top-of-book for BTC, ETH and SOL
across Binance (USDT), Coinbase (USD) and Kraken (USD). When buying on the
cheapest venue and selling on the richest one is profitable *after both taker
fees and a slippage buffer*, it logs the opportunity. USD-vs-USDT legs are
compared deliberately and flagged, since the stablecoin basis is part of the
real-world risk. The simulation assumes inventory is pre-funded on every venue
(both legs execute simultaneously; nothing is transferred per trade).

**Triangular arbitrage on Binance.** Evaluates USDT → BTC → {ETH, SOL, XRP} →
USDT and the reverse direction on every relevant tick, with taker fees applied
to all three legs.

**Funding-rate carry (the around-the-clock one).** Perpetual futures pay
funding every interval, continuously, around the clock. Holding spot and
shorting the perp collects that funding while staying price-neutral — the
closest thing crypto has to a persistent, cumulative income stream, and how
most market-neutral crypto funds actually earn. The monitor polls funding
rates across every USDT perp on Binance and Bybit, ranks them by annualized
yield, and simulates one carry position at a time: it enters when the best
positive funding clears a configurable APR threshold, charges realistic
entry/exit costs up front, accrues funding pro-rata, and exits when funding
decays below the exit threshold. Not risk-free — funding can flip negative
(the exit rule handles that) and you carry exchange/counterparty risk — but
it is a structural edge rather than a latency race.

## Running it

```bash
npm install
cp .env.example .env   # optional — defaults are sensible
npm start              # live exchange feeds
```

Open http://localhost:5000 for the dashboard: paper P&L, live top-of-book,
recent opportunities and simulated trades. Every opportunity and trade is also
appended to `data/opportunities.jsonl` and `data/trades.jsonl` for later
analysis.

No exchange connectivity (or just want to see it work)? Run with synthetic
feeds that occasionally inject dislocations:

```bash
npm run start:mock
```

## Configuration

Everything is tuned via `.env` (see `.env.example`): fee tiers per exchange,
the per-leg slippage buffer, the minimum net edge to paper-trade, trade
notional, cooldown, and quote staleness limit. Markets and triangles are
defined in `src/config.js`.

## Architecture

```
src/
  index.js                 wiring + heartbeat + shutdown
  config.js                markets, fees, thresholds
  quoteBook.js             in-memory top-of-book with staleness checks
  feeds/
    binance.js             bookTicker websocket stream
    coinbase.js            ticker channel websocket
    kraken.js              ticker channel websocket
    reconnectingFeed.js    shared reconnect/backoff lifecycle
    mock.js                synthetic feeds for demos/offline
  strategies/
    crossExchange.js       best-bid vs best-ask across venues, net of fees
    triangular.js          three-leg cycles on Binance, net of fees
  paperTrader.js           simulated fills, cooldowns, cumulative P&L
  store.js                 ring buffers + JSONL persistence
  server.js                REST API for the dashboard
public/index.html          live dashboard (no build step)
```

## Honest caveats

- **Paper fills are optimistic.** They assume you capture the top-of-book
  price on every leg instantly. Real fills face latency, queue position, and
  competition from faster participants — treat paper P&L as an *upper bound*
  on the edge, and the slippage buffer as the knob to make it conservative.
- **Cross-exchange trades assume pre-funded inventory** on all venues, which
  carries its own risks (exchange risk, inventory drift, rebalancing costs)
  that the simulation does not model.
- **Arbitrage is competitive.** Persistent large edges in the log usually mean
  a data problem (stale quote, wrong fee tier), not free money. The staleness
  guard and fee config exist to keep the scanner honest — keep them accurate.
- If you later add real execution, start with the triangular strategy (single
  venue, no transfers), tiny size, and API keys **without withdrawal
  permissions**, funded only with money you can afford to lose.

## History

The original repo contained a tutorial bot targeting Uniswap V1 on the Ropsten
testnet, both of which no longer exist. That code was replaced by this scanner;
it's still available in the git history.
