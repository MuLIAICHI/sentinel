/** Pure routing tests — no database. Every BotEvent type must have a stated path. */

import { describe, expect, it } from 'vitest';
import type { BotEvent } from '../../core/types.js';
import { routeEvent } from '../../db/persist.js';
import {
  buyDecision,
  candidate,
  closedPosition,
  enriched,
  openPosition,
  rawToken,
  skipDecision,
} from './fixtures.js';

const kinds = (event: BotEvent): string[] => routeEvent(event).map((op) => op.kind);

describe('routeEvent', () => {
  it('raw_token → insert + tokens_seen bump', () => {
    const ops = routeEvent({ type: 'raw_token', payload: rawToken });
    expect(ops.map((o) => o.kind)).toEqual(['insert_raw_token', 'bump_daily']);
    expect(ops[1]).toMatchObject({ field: 'tokens_seen' });
  });

  it('candidate_filtered (passed) → passed_filter bump', () => {
    const ops = routeEvent({
      type: 'candidate_filtered',
      payload: { candidate, result: { passed: true, failedRules: [] } },
    });
    expect(ops).toEqual([expect.objectContaining({ kind: 'bump_daily', field: 'passed_filter' })]);
  });

  it('candidate_filtered (rejected) → no ops (visible as seen-minus-passed)', () => {
    const ops = routeEvent({
      type: 'candidate_filtered',
      payload: { candidate, result: { passed: false, failedRules: ['age_too_young'] } },
    });
    expect(ops).toEqual([]);
  });

  it('candidate_enriched → enriched bump', () => {
    expect(kinds({ type: 'candidate_enriched', payload: enriched })).toEqual(['bump_daily']);
  });

  it('decision BUY → buys bump only (row written by decision/ with snapshot)', () => {
    const ops = routeEvent({ type: 'decision', payload: buyDecision });
    expect(ops).toEqual([expect.objectContaining({ kind: 'bump_daily', field: 'buys' })]);
  });

  it('decision SKIP → skips bump', () => {
    const ops = routeEvent({ type: 'decision', payload: skipDecision });
    expect(ops).toEqual([expect.objectContaining({ kind: 'bump_daily', field: 'skips' })]);
  });

  it('position_opened → upsert + positions_opened bump', () => {
    const ops = routeEvent({ type: 'position_opened', payload: openPosition });
    expect(ops.map((o) => o.kind)).toEqual(['upsert_position', 'bump_daily']);
  });

  it('position_updated → upsert only', () => {
    expect(kinds({ type: 'position_updated', payload: openPosition })).toEqual([
      'upsert_position',
    ]);
  });

  it('position_closed → upsert + realized pnl accumulation', () => {
    const ops = routeEvent({ type: 'position_closed', payload: closedPosition });
    expect(ops.map((o) => o.kind)).toEqual(['upsert_position', 'add_realized_pnl']);
    expect(ops[1]).toMatchObject({ pnlSol: closedPosition.realizedPnlSol });
  });

  it('position_closed without realizedPnlSol → upsert only, no NaN pnl op', () => {
    const { realizedPnlSol: _omitted, ...rest } = closedPosition;
    const ops = routeEvent({ type: 'position_closed', payload: rest });
    expect(ops.map((o) => o.kind)).toEqual(['upsert_position']);
  });

  it('risk_block → risk_blocks bump', () => {
    const ops = routeEvent({
      type: 'risk_block',
      payload: { mint: rawToken.mint, reason: 'max_concurrent' },
    });
    expect(ops).toEqual([expect.objectContaining({ kind: 'bump_daily', field: 'risk_blocks' })]);
  });

  it('kill_switch activation → set state + kill_events bump', () => {
    const ops = routeEvent({
      type: 'kill_switch',
      payload: { active: true, reason: 'daily_loss' },
    });
    expect(ops.map((o) => o.kind)).toEqual(['set_kill_state', 'bump_daily']);
  });

  it('kill_switch release → set state only, no kill count', () => {
    const ops = routeEvent({ type: 'kill_switch', payload: { active: false, reason: 'human' } });
    expect(ops.map((o) => o.kind)).toEqual(['set_kill_state']);
  });

  it('every BotEvent type routes without throwing (exhaustiveness)', () => {
    const all: BotEvent[] = [
      { type: 'raw_token', payload: rawToken },
      { type: 'candidate_filtered', payload: { candidate, result: { passed: true, failedRules: [] } } },
      { type: 'candidate_enriched', payload: enriched },
      { type: 'decision', payload: buyDecision },
      { type: 'position_opened', payload: openPosition },
      { type: 'position_updated', payload: openPosition },
      { type: 'position_closed', payload: closedPosition },
      { type: 'risk_block', payload: { mint: rawToken.mint, reason: 'r' } },
      { type: 'kill_switch', payload: { active: true, reason: 'r' } },
    ];
    for (const event of all) {
      expect(() => routeEvent(event)).not.toThrow();
    }
    expect(all).toHaveLength(9); // one per BotEvent variant — update when contracts change (ADR required)
  });
});
