/**
 * The dashboard state machine — PURE. Given the previous {@link DashState} and
 * an {@link Action}, it returns the next state. No clock, no I/O: the wall time
 * for feed entries arrives via `action.now`, injected by the stream hook, so
 * the reducer is deterministic and fully unit-testable.
 *
 * Stage inference: the pipeline emits `candidate_filtered` twice per mint — once
 * for the cheap (pre-enrichment) pass and once for the full pass. We label the
 * first sighting of a mint `cheap` and the second `full`.
 */

import type {
  BotEvent,
  Decision,
  EnrichedCandidate,
  FeedItem,
  KillState,
  Position,
  PositionView,
  SnapshotPayload,
  DailyStats,
} from './types.js';

/** Connection state of the underlying websocket. */
export type ConnState = 'connecting' | 'open' | 'down';

/** Live, since-connect funnel counters (the snapshot stats are the day baseline). */
export interface LiveCounts {
  tokensSeen: number;
  cheapPass: number;
  cheapFail: number;
  enriched: number;
  fullPass: number;
  fullFail: number;
}

/** Everything the dashboard renders from. */
export interface DashState {
  conn: ConnState;
  kill: KillState;
  stats: DailyStats | null;
  live: LiveCounts;
  feed: FeedItem[];
  decisions: Decision[];
  open: PositionView[];
  closed: Position[];
  /** Recent enriched candidates with full tokenomics (newest first, capped). */
  enrichedTokens: EnrichedCandidate[];
  /** Mints seen in a prior candidate_filtered, to label cheap (1st) vs full (2nd). */
  seenFilterMints: Record<string, 1>;
}

export type Action =
  | { kind: 'conn'; conn: ConnState }
  | { kind: 'snapshot'; payload: SnapshotPayload; now: number }
  | { kind: 'event'; event: BotEvent; now: number }
  | { kind: 'stats'; stats: DailyStats | null };

const FEED_CAP = 200;
const DECISIONS_CAP = 100;
const CLOSED_CAP = 100;
const ENRICHED_CAP = 40;

/** The empty dashboard, before any snapshot or event. */
export function initialState(): DashState {
  return {
    conn: 'connecting',
    kill: { active: false, reason: '', updatedAt: '' },
    stats: null,
    live: { tokensSeen: 0, cheapPass: 0, cheapFail: 0, enriched: 0, fullPass: 0, fullFail: 0 },
    feed: [],
    decisions: [],
    open: [],
    closed: [],
    enrichedTokens: [],
    seenFilterMints: {},
  };
}

/** Prepend an item and cap the array length (newest first). */
function capped<T>(item: T, list: T[], cap: number): T[] {
  const next = [item, ...list];
  return next.length > cap ? next.slice(0, cap) : next;
}

/** Wrap a raw Position into a PositionView with price tracking seeded at entry. */
function toView(position: Position): PositionView {
  return { ...position, lastPrice: position.entryPrice, peakPrice: position.entryPrice };
}

/** Apply one connection-state change. */
function onConn(state: DashState, conn: ConnState): DashState {
  return state.conn === conn ? state : { ...state, conn };
}

/** Hydrate from the snapshot frame, preserving the live connection state. */
function onSnapshot(state: DashState, payload: SnapshotPayload): DashState {
  return {
    ...state,
    kill: payload.kill,
    stats: payload.stats,
    decisions: payload.decisions.slice(0, DECISIONS_CAP),
    open: payload.open.map(toView),
    closed: payload.closed.slice(0, CLOSED_CAP),
  };
}

/** Apply a single BotEvent. `now` stamps any feed entry it produces. */
function onEvent(state: DashState, event: BotEvent, now: number): DashState {
  switch (event.type) {
    case 'raw_token':
      return { ...state, live: { ...state.live, tokensSeen: state.live.tokensSeen + 1 } };

    case 'candidate_filtered': {
      const { candidate, result } = event.payload;
      const isFull = state.seenFilterMints[candidate.mint] === 1;
      const stage: 'cheap' | 'full' = isFull ? 'full' : 'cheap';
      const live = { ...state.live };
      if (result.passed) {
        if (stage === 'cheap') live.cheapPass += 1;
        else live.fullPass += 1;
      } else if (stage === 'cheap') {
        live.cheapFail += 1;
      } else {
        live.fullFail += 1;
      }
      const seenFilterMints = isFull
        ? state.seenFilterMints
        : { ...state.seenFilterMints, [candidate.mint]: 1 as const };
      // Only rejects produce feed noise; passes advance quietly toward a decision.
      const feed = result.passed
        ? state.feed
        : capped<FeedItem>(
            { at: now, kind: 'reject', mint: candidate.mint, symbol: candidate.symbol, stage, rules: result.failedRules },
            state.feed,
            FEED_CAP,
          );
      return { ...state, live, seenFilterMints, feed };
    }

    case 'candidate_enriched':
      return {
        ...state,
        live: { ...state.live, enriched: state.live.enriched + 1 },
        enrichedTokens: capped(event.payload, state.enrichedTokens, ENRICHED_CAP),
      };

    case 'decision': {
      const decision = event.payload;
      return {
        ...state,
        decisions: capped(decision, state.decisions, DECISIONS_CAP),
        feed: capped<FeedItem>({ at: now, kind: 'decision', decision }, state.feed, FEED_CAP),
      };
    }

    case 'position_opened': {
      const position = event.payload;
      return {
        ...state,
        open: [toView(position), ...state.open],
        feed: capped<FeedItem>({ at: now, kind: 'position', event: 'opened', position }, state.feed, FEED_CAP),
      };
    }

    case 'position_updated': {
      const position = event.payload;
      return {
        ...state,
        open: state.open.map((p) =>
          p.id === position.id ? { ...p, ...position, lastPrice: p.lastPrice, peakPrice: p.peakPrice } : p,
        ),
      };
    }

    case 'position_closed': {
      const position = event.payload;
      return {
        ...state,
        open: state.open.filter((p) => p.id !== position.id),
        closed: capped(position, state.closed, CLOSED_CAP),
        feed: capped<FeedItem>({ at: now, kind: 'position', event: 'closed', position }, state.feed, FEED_CAP),
      };
    }

    case 'kill_switch': {
      const { active, reason } = event.payload;
      return {
        ...state,
        kill: { active, reason, updatedAt: state.kill.updatedAt },
        feed: capped<FeedItem>({ at: now, kind: 'kill', active, reason }, state.feed, FEED_CAP),
      };
    }

    case 'risk_block':
      // Counted in daily stats server-side; no dedicated feed lane in the UI.
      return state;

    default:
      // Unknown event type — ignore, never throw on unexpected wire data.
      return state;
  }
}

/** The reducer: pure (DashState, Action) → DashState. */
export function reducer(state: DashState, action: Action): DashState {
  switch (action.kind) {
    case 'conn':
      return onConn(state, action.conn);
    case 'snapshot':
      return onSnapshot(state, action.payload);
    case 'event':
      return onEvent(state, action.event, action.now);
    case 'stats':
      // Live refresh of the server-side day totals (polled), so the stats panel
      // tracks the bot instead of freezing at the connect-time snapshot.
      return state.stats === action.stats ? state : { ...state, stats: action.stats };
    default:
      return state;
  }
}
