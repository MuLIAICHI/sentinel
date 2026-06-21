# Sentinel

A complete automated trading bot for pump.fun memecoins. We built it, ran it on
live data in paper mode, and **killed it on purpose** because the data showed it
has no edge. This repo is the full system plus the post-mortem.

> **Read this first.** Sentinel is an **educational research artifact**, not a
> money-maker. Across 93 real trades it had **negative expectancy in every
> configuration**. It is published because the *negative result is useful* and
> the reason it fails is structural. It is **not financial advice**, comes with
> **no warranty**, and **loses money by design**. No real capital was ever
> traded by this code. Do not point it at a funded wallet expecting profit.

**Full write-up with charts:** see [`docs/POSTMORTEM.md`](docs/POSTMORTEM.md) and
the report site in [`report-site/`](report-site/).

---

## The one finding worth your time

We logged the exact on-chain price path for every exit. The hard stop was set at
**-18%**. The median price it actually **filled at was -84%.**

pump.fun coins do not slide through a stop. When they rug, the price gaps from
above the trigger straight to -80% or worse in a single tick, because there is no
liquidity at the stop price to sell into. A stop-loss is a label here, not a
guarantee. That single fact is why the strategy cannot be tuned into profit, and
why three separate "fixes" (tighter filter, tighter stop, take-profit ladder) all
failed on the data.

The one thing that clearly worked: a **free local pre-filter** that rejected over
99% of launches before any paid API call.

---

## Architecture

A decoupled, event-bus pipeline. Each stage emits events; modules subscribe. The
risk gate is hard and un-bypassable. Live trading is gated off by a human-edited
constant plus a runtime flag, and no automated path can enable it.

```
raw token (PumpPortal ws)
  → nursery        (ripen N minutes)
  → cheap filter   (FREE local ring-buffer signals; rejects >99%)
  → enrich         (PAID: Helius — holders, concentration, dev behavior)
  → full filter    (same rules, paid data)
  → decide         (Claude — BUY / SKIP, structured, rate-capped)
  → risk.approve   (hard gate; can only shrink size, never grow)
  → execute        (PAPER fill engine; live path is a locked door)
  → positions      (mechanical exits; no model can hold or override a sell)
```

| Module | Responsibility |
|---|---|
| `core/` | event bus, config, logger (secret-redacting) |
| `ingestion/` | PumpPortal websocket client + trade ring-buffer |
| `filter/` | six deterministic filter rules (pure functions) |
| `enrichment/` | Helius data provider behind a seam |
| `decision/` | Claude decision call, structured output, hourly ceiling |
| `risk/` | hard guards, approval gate, DB-backed kill switch |
| `positions/` | mechanical exit engine (pure rules + per-tick loop) |
| `execution/` | paper fill engine; gated live path (pumpmolt pattern) |
| `orchestrator/` | boot order, wiring, nursery, tick loop, graceful shutdown |
| `api/` | Express REST + websocket for the dashboard |
| `db/` | Postgres schema, migrations, typed queries |
| `ui/` | Next.js real-time dashboard |

## Tech stack

- **TypeScript** (strict, ESM + NodeNext), **Node 20**, event-bus + DI, ~330 **vitest** tests
- **Express 5** + **ws** (API + realtime), **PostgreSQL** via `pg` (Supabase)
- **Claude** via `@anthropic-ai/sdk` (decisions), **@solana/web3.js** + `bs58` (gated live path)
- **Next.js 15** + **React 19** dashboard, hand-written CSS
- Deploy: Railway (bot + dashboard), Supabase (Postgres), Vercel (report site)
- External data (bring your own keys): **PumpPortal**, **Helius**, **Anthropic**

## Quickstart (paper mode)

```bash
npm install
cp .env.example .env.local        # fill in YOUR keys; the app reads process.env
# populate your shell env from it, then:
npm run db:migrate                # apply the schema to your Postgres
npm start                         # boots the pipeline in paper mode
# dashboard:
cd ui && npm install && npm run dev
```

You need your own PumpPortal, Helius, and Anthropic keys, and a Postgres database.
Paper mode never signs transactions and never needs a wallet key.

**Going live is intentionally hard.** It requires hand-editing `LIVE_TRADING` in
`risk/guards.ts`, wiring the runtime confirmation flag, and providing a
`SOLANA_PRIVATE_KEY` you generated yourself, offline. Given the findings here, we
do not recommend it.

## Tests

```bash
npm test        # ~330 vitest tests (pure logic + a few live-DB ones, skipped without DATABASE_URL)
```

## Acknowledgements

The gated live-execution path follows the trade pattern from
[PlaydaDev/pumpmolt](https://github.com/PlaydaDev/pumpmolt) (MIT License),
reviewed in [`docs/audits/pumpmolt-audit.md`](docs/audits/pumpmolt-audit.md).

## License

MIT. See [`LICENSE`](LICENSE).
