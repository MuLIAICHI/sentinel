/**
 * Event persistence: "log first, act second — if it's not in the DB, it didn't happen."
 *
 * Split in two so the routing logic is deterministically testable without a
 * database:
 *   - routeEvent(event) — PURE: maps a BotEvent to the list of named ops.
 *   - attachPersistence(bus) — subscribes onAny and executes each op, catching
 *     and logging per-event failures so a bad row never kills the pipeline.
 */

import type { Bus } from '../core/bus.js';
import type { BotEvent } from '../core/types.js';
import { createLogger } from '../core/logger.js';
import {
  addRealizedPnl,
  bumpDailyStat,
  insertRawToken,
  setKillState,
  upsertPosition,
  utcDay,
  type DailyStatCounter,
} from './queries.js';

const log = createLogger('db/persist');

/** A named persistence operation — pure data, executed by `execute()`. */
export type DbOp =
  | { kind: 'insert_raw_token'; event: Extract<BotEvent, { type: 'raw_token' }>['payload'] }
  | { kind: 'upsert_position'; event: Extract<BotEvent, { type: 'position_opened' }>['payload'] }
  | { kind: 'bump_daily'; day: string; field: DailyStatCounter }
  | { kind: 'add_realized_pnl'; day: string; pnlSol: number }
  | { kind: 'set_kill_state'; active: boolean; reason: string };

const today = (): string => utcDay(Date.now());

/**
 * Map a BotEvent to its persistence ops. Every one of the 9 event types has an
 * explicit path; the `never` check makes adding a 10th type a compile error
 * until it is handled here.
 */
export function routeEvent(event: BotEvent): DbOp[] {
  switch (event.type) {
    case 'raw_token':
      return [
        { kind: 'insert_raw_token', event: event.payload },
        { kind: 'bump_daily', day: today(), field: 'tokens_seen' },
      ];
    case 'candidate_filtered':
      // Only survivors are counted; rejected candidates are visible in the
      // funnel as (tokens_seen - passed_filter). No per-rejection row — at
      // >95% rejection that table would be almost all noise.
      return event.payload.result.passed
        ? [{ kind: 'bump_daily', day: today(), field: 'passed_filter' }]
        : [];
    case 'candidate_enriched':
      return [{ kind: 'bump_daily', day: today(), field: 'enriched' }];
    case 'decision':
      // Counters only. The full decisions row (with the input snapshot, which
      // the bus-level Decision deliberately does not carry) is written by the
      // decision/ module itself via insertDecision(decision, snapshot).
      return [
        {
          kind: 'bump_daily',
          day: today(),
          field: event.payload.action === 'BUY' ? 'buys' : 'skips',
        },
      ];
    case 'position_opened':
      return [
        { kind: 'upsert_position', event: event.payload },
        { kind: 'bump_daily', day: today(), field: 'positions_opened' },
      ];
    case 'position_updated':
      return [{ kind: 'upsert_position', event: event.payload }];
    case 'position_closed': {
      const ops: DbOp[] = [{ kind: 'upsert_position', event: event.payload }];
      if (event.payload.realizedPnlSol !== undefined) {
        ops.push({ kind: 'add_realized_pnl', day: today(), pnlSol: event.payload.realizedPnlSol });
      }
      return ops;
    }
    case 'risk_block':
      return [{ kind: 'bump_daily', day: today(), field: 'risk_blocks' }];
    case 'kill_switch': {
      const ops: DbOp[] = [
        { kind: 'set_kill_state', active: event.payload.active, reason: event.payload.reason },
      ];
      if (event.payload.active) {
        ops.push({ kind: 'bump_daily', day: today(), field: 'kill_events' });
      }
      return ops;
    }
    default: {
      // Exhaustiveness: a new BotEvent type fails compilation here.
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/** Execute one op against the DB. */
async function execute(op: DbOp): Promise<void> {
  switch (op.kind) {
    case 'insert_raw_token':
      return insertRawToken(op.event);
    case 'upsert_position':
      return upsertPosition(op.event);
    case 'bump_daily':
      return bumpDailyStat(op.day, op.field);
    case 'add_realized_pnl':
      return addRealizedPnl(op.day, op.pnlSol);
    case 'set_kill_state':
      return setKillState(op.active, op.reason);
  }
}

/** Subscribe to every BotEvent and persist it. Call once at boot. */
export function attachPersistence(bus: Bus): void {
  bus.onAny((event) => {
    const ops = routeEvent(event);
    for (const op of ops) {
      void execute(op).catch((err) => {
        log.error('persist op failed', { eventType: event.type, op: op.kind, error: String(err) });
      });
    }
  });
}
