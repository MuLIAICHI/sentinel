# Agent Handoffs

Write gotchas, API discoveries, and decisions here.
Other agents read this before starting work.

Format:
---
[YYYY-MM-DD HH:MM] agent-name > target-agent (or "all")
Subject: one-line summary
Detail: what you discovered, why it matters, what to do about it
---

---
[2026-06-10 13:30] first-contact > all
Subject: Board generated from docs/SPEC.md — read your agent file before starting
Detail: 13 tasks across Waves 0–3 are on BOARD.md. Each agent has a definition in
.claude/agents/<name>.md with scope, hard rules, and Gate 1 requirements baked in.
READY now: wave0-audit-pumpmolt and wave1-core (both foundation). Everything else is
BACKLOG until Wave 1 is DONE and the human freezes core/types.ts. Four tasks carry a
Gate 1 human pause (ingestion, enrichment, decision, execution) — do not start their
external wiring without sign-off. Open questions for the human are listed in the
First Contact summary: enrichment data provider, current Haiku-class model id, and
the dollar→SOL conversion for risk constants.
---

---
[2026-06-10 19:00] foundation > all
Subject: wave1-core DONE — core/ is built and core/types.ts is FROZEN (ADR-001)
Detail: What you code against:
- Types: import from 'core/types.js' — RawTokenEvent, Candidate, FilterResult,
  EnrichedCandidate, Decision, Position, BotEvent. Frozen; changes need an ADR.
- Bus: import { bus } from 'core/bus.js' (process-wide singleton). bus.emit(event),
  bus.on('decision', handler) with payload narrowed per type, bus.onAny(handler)
  for subscribe-to-all (api/, db/). Your handler errors are caught and logged —
  they won't crash the pipeline, but check logs.
- Config: import { defaultThresholds, requireEnv, optionalEnv } from 'core/config.js'.
  Env access ONLY via these helpers; the KnownEnvVar union is the closed list —
  need a new var? That's a contract change, raise it. No dotenv exists. Never
  touch .env.
- Logger: import { createLogger } from 'core/logger.js'; const log = createLogger('your/module').
  Never console.log. Fields named like key/secret/token/private/password/credential
  are auto-redacted.
Gotchas: repo is ESM with NodeNext — relative imports need the .js extension in TS
source. tsconfig include currently lists core/ and tests/ — ADD YOUR MODULE DIR to
"include" when you start (one line; not a contract change). Local Node is 20, spec
says 22 (ADR-003) — avoid Node-22-only APIs.
Unblocked: wave1-db (foundation continues there).
---

---
[2026-06-10 19:30] foundation > all
Subject: wave1-db DONE — Wave 1 complete, all of Wave 2 except execution is READY
Detail: The DB layer is live against Supabase project "sentinel-bot" (ADR-004).
What you code against (import from 'db/queries.js' / 'db/persist.js'):
- queries: insertRawToken, insertDecision(d, snapshot), upsertPosition,
  getOpenPositions, getClosedPositions, getDecisions, getDailyStats, bumpDailyStat,
  addRealizedPnl, getKillState/setKillState, getCreatorHistory, utcDay.
- persist: attachPersistence(bus) is called ONCE by the orchestrator at boot —
  leaf modules just emit events; rows happen.
- migrations: npm run db:migrate (idempotent); add NNN_name.sql under db/migrations/.
Per-agent notes:
- decision (D): you MUST call insertDecision(decision, enrichedSnapshot) yourself —
  the bus only counts buys/skips; your row carries the audit snapshot (ADR-005).
- risk (E): kill switch state = getKillState/setKillState (single DB row, CHECK id=1).
  Concurrency check = getOpenPositions().length.
- filter (B): getCreatorHistory(creator) gives launch counts for dev_repeat_rugger
  (rug labeling lands later via enrichment).
- Env: DATABASE_URL = Supabase session-pooler URI, human-supplied shell env only.
  Passwords with + $ / , must be percent-encoded in the URI.
Open: RLS hardening SQL pending human decision (see diff-from-plan #5).
---

---
[2026-06-10 20:10] foundation > execution
Subject: pumpmolt audit DONE (SAFE-WITH-CHANGES, ADR-006) — your task is READY with conditions
Detail: Read docs/audits/pumpmolt-audit.md before planning. Binding conditions
(already merged into .ay/tasks/wave2-execution.md): VENDOR the ~200-LOC trade path
at commit 7119de43 with keypair injection — do not npm-install pumpmolt (it reads
the key env var internally; that breaks signer isolation). Verify fee payer +
program ids before signing (it blind-signs PumpPortal responses). §6 of the report
has the API shapes worth keeping (PumpPortal request fields, OperationResult).
Your Gate 1 (integration plan sign-off) still applies before writing live.ts.
---

---
[2026-06-10 21:15] filter > all
Subject: wave2-filter DONE — evaluate(candidate, context, thresholds?) → FilterResult
Detail: Six pure rules from 'filter/index.js'; ALL failure ids collected in
RULE_IDS order. FilterContext fields are optional: rules with missing context
SKIP (neither pass nor fail) — evaluate() works pre-enrichment (only age rule
runs) and post-enrichment (all six). Orchestrator: run it twice for the SPEC
funnel (cheap pass with empty context, full pass after enrichment by mapping
EnrichedCandidate fields into FilterContext). dev_repeat_rugger only fires if
you inject knownBadCreators (build the set from db/enrichment — filter never
reads the DB). Boundaries: age == min passes; curve [55,85] inclusive;
top10/devSold fail strictly above threshold. 26 tests incl. >95% batch rejection.
---

---
[2026-06-10 21:15] risk > all
Subject: wave2-risk DONE — approve() is the only entry ticket; kill switch live
Detail: From 'risk/index.js': approve(decision, portfolio) → RiskedOrder
({approved:true, mint, sizeSol, confidence}) | RiskBlock ({approved:false, mint,
reason}) — pure, state injected via PortfolioState {openPositionsCount,
dailyRealizedPnlSol, killSwitchActive}. Caller emits risk_block itself.
sizeSol = MAX_POSITION_SOL × clamp(confidence,0,1), double-capped. Kill switch:
isKillActive/activateKill/releaseKill (DB-backed, emits kill_switch on bus; DB
write precedes emit). checkDailyLossKill(pnl) → caller activates 'daily_loss'.
Day-rollover release is the ORCHESTRATOR's job. Constants assume SOL=$150 —
flagged for human review pre-live. WALLET_HARD_CAP_SOL is exported but enforced
at execution/wallet level, not in approve() (no balance in PortfolioState).
LIVE_TRADING=false has a tripwire test. 28 tests.
---

---
[2026-06-10 21:15] positions > all
Subject: wave2-positions DONE — mechanical exit engine, SellExecutor contract for execution
Detail: From 'positions/index.js': PositionEngine({executor, bus?, config?, now?}),
engine.onTick(mint, price, nowMs?), auto-opens from position_opened bus events
(or direct open()). Precedence per tick: kill_switch > hard_stop > time_stop >
trailing_stop > take_profit; one action per position per tick. Trailing arms when
peak > entry (so a flat position hits the −35% hard stop, not a −25% trail).
Kill-switch latches: positions opened/ticked while latched are flattened.
Re-entrancy safe (per-position pending flag). P&L = Σ(soldTokens×exitPrice) −
entrySol, accumulated across partials. EXECUTION AGENT: you must implement
SellExecutor = (position, fraction, reason) => Promise<{exitPrice}> where
exitPrice is NET of fees/slippage — the engine adds no fee terms. Engine never
writes DB; persistence rides position_updated/position_closed events. 22 tests.
---

---
[2026-06-10 23:30] ingestion > all
Subject: wave2-ingestion DONE — single-socket PumpPortal client + trade ring buffer
Detail: start(bus) once at boot (requireEnv PUMPPORTAL_WS_URL, optionalEnv
PUMPPORTAL_API_KEY — keyless = newToken only, subscribeTrades no-ops with warning).
Emits raw_token. Read API: tradeBuffer.latestPrice(mint), recentTicks(mint, sinceMs),
volumeStats(mint, windowMs) → {buyCount, sellCount, solVolume, accelerating},
evictStale() → dropped mints (orchestrator should unsubscribe those).
subscribeTrades/unsubscribeTrades additive, reconnect-safe (auto re-subscribe).
bondingCurveProgressPct(vSol) exported: clamp(((vSol−30)/85)×100) — documented
estimate. No wire timestamps: receivedAt assigned locally. Eviction: 256 ticks/mint,
15-min stale drop. Live smoke PASS (15/16 frames normalized).
---

---
[2026-06-10 23:30] enrichment > all
Subject: wave2-enrichment DONE — Helius provider behind DataProvider seam
Detail: enrich(candidate, deps) → EnrichedCandidate | null (never throws; emits
candidate_enriched). REQUIRED injections: provider (createHeliusProvider()),
volumeAccelerating(mint) and bondingCurvePct(mint) — both from ingestion's read
API; orchestrator wires them. devSoldPct = peak-vs-latest balance over last 50
creator signatures (monotone heuristic). top10HolderPct EXCLUDES the largest
owner (bonding-curve reserve) — else every pre-grad token trips the 25% filter.
uniqueHolders caps at 5000 sentinel. holderGrowthPerMin = 0 in v1 (two-sample fn
exists); devPriorRugs = 0 (= unknown). Budget ~26–66 Helius credits/token →
~650 enrichments/day on free tier. Moralis adapter: implement DataProvider
semantics exactly, MORALIS_API_KEY already registered.
---

---
[2026-06-10 23:30] decision > all
Subject: wave2-decision DONE — claude-haiku-4-5, structured outputs, 100/hr ceiling
Detail: decide(enrichedCandidate) → Promise<Decision> — NEVER throws/rejects; call
it only for filter survivors. Internally: emits {type:'decision'} AND persists via
insertDecision(decision, snapshot) (ADR-005) — do not re-persist. SKIP fallbacks:
'call_ceiling' (no API call, budget consumed before calls so errors can't bypass),
'api_error', 'parse_failure' (incl. refusal/truncation). Cost logged per call as
estCostUsd/cumCostUsd (~$0.0008/call; ceiling-saturated ≈ $1.9/day). Live smoke:
run tests/decision/integration.test.ts once ANTHROPIC_API_KEY is set.
---

---
[2026-06-10 23:30] execution > all
Subject: wave2-execution DONE — paper engine live; live path double-gated + vendored
Detail: createExecutor({priceOf: (mint)=>tradeBuffer.latestPrice(mint), bus}) →
{buy(riskedOrder, symbol?), sell: SellExecutor}. Hand executor.sell straight to
PositionEngine. buy emits position_opened; pass candidate symbol or positions get
a placeholder. Haircut: 0.5% fee + 0.0005 SOL priority + 1.5% adverse slippage,
both directions; sell exitPrice is NET (positions contract). Refuses cleanly when
priceOf returns undefined (engine retries next tick). Key isolation grep-verified:
SOLANA_PRIVATE_KEY only in signer.ts (lazy read — paper mode needs no key).
GO-LIVE WOULD REQUIRE (flagged): human edits LIVE_TRADING + kill off + explicit
mode:'live' + keys populated + reconcile-real-fills gap closed + pump.fun program
id explorer-checked + WALLET_HARD_CAP balance enforcement added.
---

---
[2026-06-12 21:45] integration > all (esp. api/ui)
Subject: wave3-orchestrator DONE — sentinel runs live in paper mode
Detail: boot()/shutdown() in orchestrator/index.ts; entry = `source ~/.sentinel-env
&& npx tsx orchestrator/index.ts` or pm2 start ecosystem.config.cjs (pm2 not yet
installed/exercised). Live-verified ~90 min against the real feed: zero errors,
graceful SIGINT shutdown, 500+ candidates evaluated.
LIVE FINDINGS the api/ui must know:
- pump.fun launch rate ~28 tokens/min (~40k/day). The funnel's first stage
  (free local signals: curve + volume from the ring buffer) kills ~99% of
  ripened candidates BEFORE enrichment; only ~1-2% reach the paid stage.
- daily_stats.passed_filter counts BOTH filter passes (cheap + full emitted per
  surviving candidate) — UI should show stages separately: tokens_seen →
  cheap-passes (passed_filter − full-passes... derive carefully or read
  candidate_filtered events live) → enriched → decisions → positions.
- Decision rows are rare by design (only tokens surviving everything reach
  Claude). Hours can pass without one at quiet times; that is health, not a bug.
- Kill switch: state is DB row + kill_switch bus event; the orchestrator caches
  it and PositionEngine auto-flattens. api/ POST /kill must call risk
  activateKill (never write kill_state directly) — flipping it live is still
  UNTESTED end-to-end; do that as part of wave3-api verification.
- The websocket forwarder: bus.onAny — every BotEvent. Snapshot-on-connect from
  db queries (getOpenPositions, getDecisions, getDailyStats(utcDay(now))).
---

---
[2026-06-12 22:05] integration > ui
Subject: wave3-api DONE — your data source is live on 127.0.0.1:3001
Detail: REST: GET /health {ok,killActive,openPositions,uptimeSec}; GET /positions
{open,closed}; GET /decisions?limit=N (Decision[], latest first); GET /stats
{stats: DailyStats|null, kill: KillState}. WS on the same port: first frame
{type:'snapshot', payload:{open,closed,decisions,stats,kill}}, then every
BotEvent verbatim {type,payload}. Writes: POST /kill {reason?} and POST
/kill/release ONLY — the UI must not offer anything that enables live trading
(none exists server-side either). Kill flip live-verified end to end (api →
risk → bus → engine/orchestrator → db). Gotchas for the UI: stats.passedFilter
counts BOTH filter passes (label as "filter passes", or derive stages from
candidate_filtered events on the ws); decisions are RARE by design (~1-2% of
candidates reach Claude) — the decision feed should also show candidate_filtered
events or it will look frozen at quiet hours; kill.reason is the last raw string
written (label, don't parse). Hydrate from snapshot, then apply events;
reconnect with visible 'stream disconnected' state per the task file.
---
