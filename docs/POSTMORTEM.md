# Sentinel — Post-Mortem of a pump.fun Trading Bot

*A build-and-kill report. We built a complete automated trading system for
pump.fun memecoins, ran it on live data in paper mode, and used it to answer one
question: is there an edge worth real money? The answer was no — and the
**reason** is the interesting part.*

> **Status:** project parked 2026-06-21. Paper mode only — no real capital was
> ever traded. Total realized (paper) P&L over 93 trades: **−0.31 ◎ (~$23)**.

---

## TL;DR

- We built a full pipeline: live ingestion → free pre-filter → paid on-chain
  enrichment → LLM decision → mechanical exits → paper execution → dashboard.
- The pre-filter was the one unambiguous win: it rejected **>99%** of tokens for
  free, before any paid API call.
- Across two strategy configurations and 93 trades, **expectancy was negative in
  both** (−0.0027 and −0.0038 ◎/trade).
- We backtested three "winning strategy" fixes (tighter filter, tighter stop,
  take-profit ladder). **All three failed** on real data.
- The structural reason, proven with exact on-chain fills: **a stop-loss cannot
  work on these coins.** They gap ~80% in a single tick when they dump, so a
  −18% stop fills at a median of **−84%**. There is no liquidity at the stop
  price. This is a property of the asset, not a tuning parameter.
- Conclusion: **no edge, and it cannot be engineered into one via entry/exit
  tuning.** We shut it down before risking real money.

---

## 1. What we built

A decoupled, event-bus pipeline (TypeScript / Node, ~330 tests). Each stage
emits events; modules subscribe. Strict separation of concerns and a hard,
un-bypassable risk gate.

```
raw token (PumpPortal websocket)
   → nursery (let it ripen N minutes)
   → cheap filter   (FREE local signals from a trade ring-buffer)
   → enrich         (PAID: Helius — holders, concentration, dev behavior)
   → full filter    (same rules, now with paid data)
   → decide         (Claude — BUY / SKIP, structured output, rate-capped)
   → risk.approve   (hard gate; can only shrink size, never grow)
   → execute        (PAPER fill engine)
   → positions      (mechanical exits; no LLM can hold or override a sell)
```

Supporting pieces: a Postgres (Supabase) persistence layer ("log first, act
second"), a real-time dashboard (Next.js) with a kill switch, env-overridable
strategy thresholds, and cloud deploy (Railway). Live trading was hard-gated off
the entire time and required a manual code edit + a runtime flag to enable — by
design, no automated path could turn it on.

### The filter (six deterministic rules)
`age_too_young`, `bonding_curve_out_of_band`, `holder_concentration` (top-10 %),
`dev_dumped` (dev-sold %), `dev_repeat_rugger`, `dead_volume`. Run **twice**: a
cheap pass on free ring-buffer signals rejects the vast majority before any paid
Helius call; a full pass re-checks with paid enrichment.

### The exits (mechanical, pure functions)
Precedence: `kill_switch > hard_stop > time_stop > trailing_stop > take_profit`.
Two configurations were tested (see §3).

---

## 2. The one thing that clearly worked: the pre-filter

Live, pump.fun launches **~28 tokens/minute**. Enriching every one via Helius
would be expensive and pointless. The free pre-filter — derived entirely from a
local trade ring-buffer (bonding-curve progress, volume acceleration) — rejected
**>99%** of candidates before a single paid call.

| Funnel (baseline run snapshot) | Count | % of prior |
|---|---|---|
| Tokens seen | 138,922 | — |
| Passed cheap (free) filter | 808 | 0.6% |
| Enriched (paid) | 740 | — |
| Bought | 38 | — |

**Takeaway:** if you ever build in this space, a free local pre-filter is
non-negotiable. It's the difference between a viable cost structure and lighting
money on fire on API calls.

---

## 3. The trading results

Two configurations, same machinery, different parameters.

### Cohort A — "Survivor" (original SPEC-ish, moderate-loosened)
Enter after a **20-minute** ripen; exit on TP +80% (sell 50%), 25% trailing
stop, −35% hard stop, 45-min time stop.

| Metric | Value |
|---|---|
| Trades | 38 |
| Win rate | 26.3% |
| Net P&L | −0.101 ◎ |
| Expectancy | −0.0027 ◎ / trade |
| Avg hold | 7.1 min |

Exits: trailing_stop 27 (+0.030 ◎) · **hard_stop 10 (−0.127 ◎)** · time_stop 1.

### Cohort B — "Scalp" (earlier entry + fast exit)
Enter after **4 minutes**; exit on TP +40% (sell 60%), **15%** trailing, **−18%**
hard stop, **8-min** time stop. This was the deliberate experiment after Cohort A
showed where the money leaked.

| Metric | Value | vs A |
|---|---|---|
| Trades | 55 | — |
| Win rate | **34.5%** | ↑ from 26.3% |
| Net P&L | −0.209 ◎ | worse |
| Expectancy | **−0.0038 ◎ / trade** | ↓ worse |
| Avg hold | 2.4 min | faster |

Exits: trailing_stop 33 (+0.015 ◎) · **hard_stop 17 (−0.263 ◎)** · time_stop 5
(**+0.039 ◎**).

**Combined: 93 trades, 31% win rate, −0.31 ◎, negative expectancy in both.**

### What worked / what didn't
- ✅ **Earlier entry raised the win rate** (26% → 34.5%). The thesis that "by the
  time you enter at 20 min the move is over" was partially correct — on-chain
  data showed we entered **after the price peak 72% of the time** at 20 min, and
  gave up a median **~3.6×** of the curve versus entering at the first swap.
- ✅ **The 8-minute time-stop bucket was net positive** (+0.039 ◎) — coins that
  drifted up without mooning or rugging got banked.
- ❌ **Hard stops were the entire loss, and tightening them made it worse**
  (−0.263 over 17 trades at −18% vs −0.127 over 10 at −35%). See §5 for why.
- ❌ **Winners were too small to carry the book.** Only 2 of 55 scalp trades ever
  reached 3×; none reached 5×. ~84% of entries faded to ~1.0× almost immediately.

---

## 4. Three "winning strategies" we backtested — all failed

Before concluding, we backtested the most-cited memecoin strategies against the
real trade data (reconstructing on-chain price paths via Helius).

| Strategy | Result | Flipped positive? |
|---|---|---|
| **Re-tighten the entry filter** | Winners and losers were statistically *indistinguishable* on every captured feature (curve %, top-10 %, dev-sold %, holders). `dev-sold` was 0 on 35/38; `volume-accelerating` true on 100%. No threshold set helped. | ❌ |
| **Tighter stop-loss** | Best case (−15%) cut the loss ~37% but never positive, and the result hinged on a *single* trade. | ❌ |
| **Take-profit ladder + moonbag** | Marginally *worse* — there was no fat tail to capture (0/38 reached 5×). | ❌ |

Every fix targeted the wrong layer. The problem was never entry selection or
profit-taking. It was the exits — specifically, that they don't fill.

---

## 5. The structural wall (the headline finding)

We logged the **exact intra-trade price path** for every scalp trade
(max-favorable and max-adverse excursion), then compared the modeled exit fills
to reality.

**Hard stops are set at −18%. The median actual fill was −84%.**

| Hard stops (17 trades) | |
|---|---|
| Stop trigger | −18% |
| Median fill recorded | **−84%** |
| Median actual trough | −81.5% |
| Crash occurred at/before our exit | 17 / 17 |

These coins do not *slide* through a stop. When they rug, the price **gaps from
above −18% straight to −80%+ in a single tick** — liquidity is pulled or a whale
dumps, and there is simply no order book at −18% to sell into. The next price the
bot observes is −84%, and that's the fill.

Consequences:
- A "−18% stop" that fills at −84% is not a stop. It's a label.
- The "if it filled at −18%" P&L (−0.073 ◎) is a **fantasy** — it requires
  liquidity that does not exist.
- **Our paper model was not optimistic.** Recorded hard-stop P&L (−0.263 ◎) was
  at or *beyond* the worst-case "fill at the trough" scenario (−0.247 ◎). If
  anything, live would be *worse*, because paper doesn't model your own
  market-sell impact pushing the price down further.
- Even **trailing stops slipped** ~7 points past their 15% giveback target — same
  cause, smaller magnitude.

**This is the whole story.** The dominant loss driver is fill quality on dumps,
and it is a structural property of pump.fun liquidity, not a parameter. No stop
level, entry time, or exit ladder fixes it. That's why three independent fixes
all failed and why earlier entry (thinner books) made it *worse*.

---

## 6. A security lesson that cost $12

The wallet we generated for eventual live trading
(`BJLZ…bqsr`, public on Solscan) was created via PumpPortal's **"generate
wallet"** button — a custodial "Lightning" wallet. That means **the service
generated and holds the private key.** It was being drained from the first hour:
~0.01 ◎ siphoned to a single address every ~72 minutes, automated, for 9 days
straight. The on-chain trace showed the drain began essentially at funding.

Because native SOL can only move with the private key, a wallet you didn't
generate yourself is not yours.

**Rule:** never use a service-generated ("click to generate") wallet for funds
you care about. Generate the keypair yourself, offline, on a clean device
(`solana-keygen` or a reputable wallet), and use non-custodial signing. Cost of
the lesson here: $12. Cost if we'd funded it for live trading: a lot more.

---

## 7. What I'd tell the next person

1. **Build the free pre-filter first.** It's the only part of this that's
   unambiguously correct, and it dictates whether your cost structure survives.
2. **Don't trust a stop-loss on an illiquid asset.** Test fills, not triggers.
   Log the real price path early — reconstructing it after the fact is painful.
3. **The edge is not in the exit.** We spent most of our effort there and proved
   it can't be tuned. If an edge exists in this space, it's upstream: a *signal*
   the fast co-located bots don't have, or a different asset/timeframe entirely.
4. **Let the data say no.** The hardest and most valuable discipline was
   pre-committing to a kill rule and honoring the negative result instead of
   moving the goalposts.
5. **Self-custody, always.**

---

## 8. Honest caveats

- **Sample size:** 93 trades over ~9 days, two configs, one market regime. The
  structural finding (gap-through fills) is robust; the exact P&L figures are
  directional, not statistically definitive.
- **Paper, not live:** modeled fills used real tick prices but did not model our
  own market impact — so live results would likely be *worse*, not better.
- **Not financial advice.** This is an engineering post-mortem.

---

*Built and dismantled honestly. The bot worked exactly as a research tool should:
it told the truth before any real money was at risk.*
