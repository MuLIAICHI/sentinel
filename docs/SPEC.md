# Trading Bot — Build Spec (for Claude Code, multi-agent)

> **Working codename:** `sentinel` (the brain's main job is to say *no*). Rename freely.
> **Stack:** TypeScript / Node 22 · Express · PostgreSQL · `ws` · PM2 · Next.js (UI) · Anthropic SDK
> **Execution layer:** wraps [`pumpmolt`](https://github.com/PlaydaDev/pumpmolt) (PumpPortal local-signing).
> **Status target of this spec:** ship a **paper-trading** system that is feature-complete and observable. Live trading is gated and OFF.

---

## 0. Read this first (non-negotiable guardrails)

These are encoded as code-level constraints, not config toggles. Any agent building a module must respect them.

1. **`LIVE_TRADING` is `false` by default and cannot be enabled by an env var alone.** Going live requires editing a constant in `risk/guards.ts` AND a runtime confirmation flag set from the UI. Two human actions, on purpose.
2. **The private key is never read by any module except `execution/signer.ts`.** No other file imports it, logs it, or sends it anywhere. The signer only ever calls `Keypair.fromSecretKey` + signs + submits to the configured RPC.
3. **The risk manager is the final authority.** Claude proposes; the risk manager disposes. Claude's output can only ever *reduce* risk, never increase position size, concurrency, or override a stop.
4. **Exits are mechanical.** No LLM call decides when to sell. Ever.
5. **One burner wallet, $50 ceiling, hardcoded.** Position size, concurrency, and daily-loss kill are constants, not user input.
6. **Never touch `.env`.** Agents that need a secret must list the variable name and ask the human to populate it.

---

## 1. The idea in one paragraph

A real-time pipeline ingests new pump.fun tokens from PumpPortal's websocket, kills 95%+ of them with cheap deterministic filters, enriches the survivors with on-chain context (holders, dev behavior, bonding-curve progress, current meta), and asks a Haiku-class model for a BUY/SKIP judgment on a **minutes-scale graduation-window setup** (not a latency game). Approved entries are sized and gated by a hardcoded risk manager, executed in **paper mode** (simulated fills) by default, and managed out by mechanical exit rules. Every decision, fill, and P&L tick streams to a Next.js dashboard with a live kill switch.

---

## 2. Module map & build order (this is the multi-agent plan)

Build in **three waves**. Wave 1 is the foundation everything imports — build it alone, first, and freeze it. Then Wave 2 modules can each be assigned to a **separate Claude Code agent in parallel** because they only touch their own folder and the shared contracts. Wave 3 integrates.

### Wave 1 — Foundation (one agent, build & freeze before anything else)
- **`core/`** — shared TypeScript types, the event-bus interface, config loader, logger.
- **`db/`** — Postgres schema + migrations + typed query helpers.

### Wave 2 — Leaf modules (parallel agents, one per folder)
- **Agent A → `ingestion/`** — PumpPortal websocket subscriber → emits `RawTokenEvent`.
- **Agent B → `filter/`** — pure functions, `Candidate → FilterResult`. No I/O, no LLM. Trivially unit-testable.
- **Agent C → `enrichment/`** — on-chain data fetch + meta computation → `EnrichedCandidate`.
- **Agent D → `decision/`** — Anthropic SDK call, prompt, JSON parse → `Decision`.
- **Agent E → `risk/`** — hardcoded guards, sizing, concurrency, daily-loss kill, kill switch.
- **Agent F → `execution/`** — paper simulator + (gated) pumpmolt live adapter + signer.
- **Agent G → `positions/`** — mechanical exit engine.

### Wave 3 — Integration (one agent)
- **`orchestrator/`** — wires the pipeline, owns the event loop.
- **`api/`** — Express + websocket server exposing state to the UI.
- **`ui/`** — Next.js dashboard.

> **Why contracts-first matters for multi-agent:** every Wave 2 agent is told "import your types from `core/`, read/write through `db/`, never import another Wave 2 module directly." They communicate only through the event bus and DB. That's what lets them be built simultaneously without merge hell.

---

## 3. Shared contracts (`core/types.ts`) — build these literally first

```ts
// The raw thing off the websocket
export interface RawTokenEvent {
  mint: string;
  creator: string;
  createdAt: number;          // unix ms
  symbol: string;
  name: string;
  initialBuySol: number;
  source: 'pumpportal';
}

// After cheap filters decide it's worth enriching
export interface Candidate {
  mint: string;
  creator: string;
  createdAt: number;
  ageSeconds: number;
  symbol: string;
  name: string;
}

export interface FilterResult {
  passed: boolean;
  failedRules: string[];      // e.g. ['age_too_young', 'dev_repeat_rugger']
}

// After we pull on-chain context
export interface EnrichedCandidate extends Candidate {
  bondingCurvePct: number;    // 0..100, progress toward graduation
  uniqueHolders: number;
  holderGrowthPerMin: number;
  top10HolderPct: number;     // concentration
  devSoldPct: number;         // how much of dev's bag is gone
  devPriorLaunches: number;
  devPriorRugs: number;
  volumeAccelerating: boolean;
  currentMetaTags: string[];  // themes hot in last 6h, computed from the stream
}

// What Claude returns — STRICTLY this shape
export interface Decision {
  mint: string;
  action: 'BUY' | 'SKIP';
  confidence: number;         // 0..1
  reasoning: string;          // short, for the log/UI
  modelLatencyMs: number;
}

// A position (paper or live)
export interface Position {
  id: string;
  mint: string;
  symbol: string;
  mode: 'paper' | 'live';
  entrySol: number;
  entryPrice: number;
  entryAt: number;
  amountTokens: number;
  status: 'open' | 'closed';
  exitPrice?: number;
  exitAt?: number;
  exitReason?: 'take_profit' | 'trailing_stop' | 'hard_stop' | 'time_stop' | 'kill_switch';
  realizedPnlSol?: number;
}

export type BotEvent =
  | { type: 'raw_token'; payload: RawTokenEvent }
  | { type: 'candidate_filtered'; payload: { candidate: Candidate; result: FilterResult } }
  | { type: 'candidate_enriched'; payload: EnrichedCandidate }
  | { type: 'decision'; payload: Decision }
  | { type: 'position_opened'; payload: Position }
  | { type: 'position_updated'; payload: Position }
  | { type: 'position_closed'; payload: Position }
  | { type: 'risk_block'; payload: { mint: string; reason: string } }
  | { type: 'kill_switch'; payload: { active: boolean; reason: string } };
```

The event bus is just a typed `EventEmitter` wrapper in `core/bus.ts`. Every module emits/subscribes to `BotEvent`. The API server subscribes to all of them and forwards to the UI websocket. The DB layer subscribes and persists.

---

## 4. Module specs

### `ingestion/` (Agent A)
- Connect to PumpPortal websocket. Subscribe to new-token and token-trade streams.
- Auto-reconnect with backoff. Heartbeat watchdog (reconnect if no message in N seconds).
- Normalize each message into `RawTokenEvent` / trade ticks, emit on the bus.
- Maintain an in-memory ring buffer of recent trades per mint (the enrichment + meta layers read from it).
- **Env needed (ask human):** `PUMPPORTAL_WS_URL`.

### `filter/` (Agent B)
Pure, deterministic, no network. Reject early, reject often. Suggested rules (all configurable thresholds in `core/config.ts`):
- `age_too_young` — younger than ~20 min (we deliberately skip the sniper bloodbath).
- `dev_repeat_rugger` — creator appears in a known-bad set (seeded from enrichment over time).
- `bonding_curve_out_of_band` — not in the 55–85% window.
- `holder_concentration` — top-10 > ~25%.
- `dev_dumped` — devSoldPct above threshold.
- `dead_volume` — no volume re-acceleration.
Output `FilterResult`. Target: **>95% rejection rate.** Unit tests cover each rule with a fixture.

### `enrichment/` (Agent C)
- For survivors only (cost control), fetch: holder count & distribution, dev wallet history, bonding-curve %, recent volume slope.
- **Data source = an integration to confirm with the human.** Free Solana RPC covers basics; holder distribution + dev history realistically needs an indexer (Helius / Birdeye / Moralis free tier). **Flag this and get sign-off before wiring — it's an external API per the hard rules.**
- Compute `currentMetaTags`: scan the last 6h of new tokens from the stream, cluster names/symbols, surface hot themes. This is what we feed Claude so it isn't blind to the meta.
- **Env needed (ask human):** `SOLANA_RPC_URL`, `INDEXER_API_KEY` (name TBD by chosen provider).

### `decision/` (Agent D)
- Anthropic SDK. **Haiku-class model** for speed+cost (confirm current model id with the human; do not hardcode a stale string).
- Input: the `EnrichedCandidate` rendered as a compact structured block + the meta tags.
- System prompt enforces: judge ONLY the graduation-window setup; default to SKIP; a BUY requires multiple confirming signals; return **only** the `Decision` JSON, no prose.
- Parse defensively (strip fences, validate shape, on any parse failure → treat as SKIP).
- Record `modelLatencyMs`. Emit `decision`.
- **Cost guard:** never call the model for anything that failed the filter. Add a hard per-hour call ceiling.
- **Env needed (ask human):** `ANTHROPIC_API_KEY`.

### `risk/` (Agent E) — the boss
`risk/guards.ts` holds constants (NOT env):
```ts
export const LIVE_TRADING = false;          // human edits this by hand to go live
export const MAX_POSITION_SOL = /* ≈ $5 */;
export const MAX_CONCURRENT = 2;
export const DAILY_LOSS_LIMIT_SOL = /* ≈ $15 */;
export const WALLET_HARD_CAP_SOL = /* ≈ $50 */;
```
- `approve(decision, portfolioState): RiskedOrder | RiskBlock` — only entity allowed to authorize an entry.
- Enforces concurrency, sizing, daily-loss kill (trips → emits `kill_switch`, blocks all new entries for the day).
- Global kill switch: a flag in DB the UI can flip; when active, no entries, and optionally flatten all positions.
- Claude's `confidence` may only *shrink* size below the cap, never grow it.

### `execution/` (Agent F)
- **`signer.ts`** — the only file touching the key. Read once at startup, never logged.
- **`paper.ts`** — default. Simulates a fill at current stream price + a modeled slippage/fee haircut (include PumpPortal's 0.5% + priority fee + realistic slippage). Marks positions to market off the trade stream.
- **`live.ts`** — thin wrapper over pumpmolt's `buyTokens`/`sellTokens`. **Unreachable unless `LIVE_TRADING === true` AND runtime kill switch is off.** Guarded at the top of every function.
- A single `execute(order)` facade routes to paper or live based on the guard.

### `positions/` (Agent G) — mechanical exits, no LLM
Per open position, evaluate on every price tick:
- **Take profit:** sell 50% at +80–100%.
- **Trailing stop:** trail the remainder (e.g. give back 25% from peak).
- **Hard stop:** −35%.
- **Time stop:** flat after 45 min.
- **Kill-switch flatten:** exit immediately if global kill trips.
Emit `position_updated` / `position_closed` with `exitReason` + realized P&L.

### `orchestrator/` + `api/` (Wave 3)
- Orchestrator owns the loop: `raw_token → filter → (pass) → enrich → decide → (BUY) → risk.approve → execute → positions`.
- API: Express REST for snapshots (`/positions`, `/decisions`, `/stats`, `/health`) + a websocket that forwards every `BotEvent` to the UI. POST `/kill` and POST `/kill/release` flip the switch (these are the only state-changing endpoints).

---

## 5. The monitoring UI (`ui/`, Next.js)

Single dashboard, dark, real-time over websocket. You want to *watch everything* — so:

- **Header:** mode badge (PAPER / LIVE — LIVE is red), wallet balance, today's P&L, big **KILL SWITCH** button (and release).
- **Live decision feed:** streaming list — each candidate with filter result, enriched stats, Claude's action + confidence + reasoning, color-coded BUY/SKIP. This is the thing you'll stare at to judge the brain.
- **Open positions table:** entry, current price, unrealized P&L, age, distance to each exit trigger.
- **Closed positions / history:** with exit reason and realized P&L.
- **Stats panel:** SKIP rate (should be ~95%+), win rate, avg hold, fees paid, model calls + cost today, hypothetical-vs-actual for paper validation.
- **Funnel counter:** tokens seen → passed filter → enriched → BUY → executed. Tells you instantly where the pipeline is choking.

No write actions from the UI except the kill switch. The UI cannot enable live trading.

---

## 6. DB schema (`db/`) — minimum tables

- `raw_tokens` — audit of everything seen.
- `decisions` — every Claude call: input snapshot, action, confidence, reasoning, latency, cost.
- `positions` — full `Position` records.
- `daily_stats` — per-day P&L, counts, kill events.
- `kill_state` — single row, current switch state + reason.

Log first, act second — if it's not in the DB, it didn't happen.

---

## 7. Build sequence for you, concretely

1. **Audit pumpmolt** (clone, read `src/`, grep every outbound URL, confirm the key never leaves the signer, `npm audit`). I'll do this review with you before it goes anywhere near a wallet.
2. Spin **one** Claude Code agent on **Wave 1** (`core/` + `db/`). Review the contracts yourself — they're the API every other agent codes against, so freeze them deliberately.
3. Spin **Agents A–G in parallel** on Wave 2, each scoped to its folder, each handed `core/types.ts` + this spec's module section.
4. Spin **one** integration agent on Wave 3.
5. Run **paper mode for 3–4 days.** Read the decision feed. If paper SKIPs were right and paper BUYs would've printed after fees → consider funding. If not → you spent $0 learning the edge isn't there.

---

## 8. Honest expectations

$50 on pump.fun most likely bleeds to fees and variance even with a good brain — PumpPortal takes 0.5% per trade plus priority fees, and on ~$5 positions that's several percent round-trip before any edge. The real return here is the **system**: the websocket pipeline, the filter discipline, the gated execution, the decision logging. Treat the SOL as tuition, prove the edge in paper, and only then risk real money — two deliberate human actions away.
