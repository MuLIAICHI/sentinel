/**
 * Live-database round-trips. Auto-skips when DATABASE_URL is not in the env —
 * deterministic without secrets, real verification when the human has exported it.
 *
 * NOTE: exercises real tables (insert/read/update). Run against the dev/paper
 * database, never anything holding data you care about.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bus } from '../../core/bus.js';
import { closePool, query } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import { attachPersistence } from '../../db/persist.js';
import {
  bumpDailyStat,
  getClosedPositions,
  getCreatorHistory,
  getDailyStats,
  getDecisions,
  getKillState,
  getOpenPositions,
  insertDecision,
  insertRawToken,
  setKillState,
  upsertPosition,
  utcDay,
} from '../../db/queries.js';
import { buyDecision, closedPosition, enriched, openPosition, rawToken } from './fixtures.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('db integration (live database)', () => {
  beforeAll(async () => {
    await migrate();
    // Clean any prior fixture residue so assertions are exact.
    await query('DELETE FROM positions WHERE id = $1', [openPosition.id]);
    await query('DELETE FROM decisions WHERE mint = $1', [rawToken.mint]);
    await query('DELETE FROM raw_tokens WHERE mint = $1', [rawToken.mint]);
    await query('DELETE FROM daily_stats WHERE day = $1', ['1999-01-01']);
  });

  afterAll(async () => {
    await setKillState(false, 'integration-teardown');
    await closePool();
  });

  it('migrate is idempotent — second run applies nothing', async () => {
    expect(await migrate()).toBe(0);
  });

  it('raw_token round-trips, and duplicate mint is ignored', async () => {
    await insertRawToken(rawToken);
    await insertRawToken(rawToken); // ON CONFLICT DO NOTHING
    const history = await getCreatorHistory(rawToken.creator);
    expect(history.launches).toBe(1);
  });

  it('position lifecycle: open → visible; close → gone from open, pnl stored', async () => {
    await upsertPosition(openPosition);
    const open = await getOpenPositions();
    expect(open.map((p) => p.id)).toContain(openPosition.id);

    await upsertPosition(closedPosition);
    const openAfter = await getOpenPositions();
    expect(openAfter.map((p) => p.id)).not.toContain(openPosition.id);

    const closed = await getClosedPositions();
    const mine = closed.find((p) => p.id === openPosition.id);
    expect(mine?.exitReason).toBe('take_profit');
    expect(mine?.realizedPnlSol).toBeCloseTo(closedPosition.realizedPnlSol!);
    expect(mine?.entryAt).toBe(openPosition.entryAt); // bigint mapping intact
  });

  it('decision with snapshot round-trips, latest first', async () => {
    await insertDecision(buyDecision, enriched);
    const decisions = await getDecisions(5);
    expect(decisions[0]).toMatchObject({ mint: buyDecision.mint, action: 'BUY' });
    const rows = await query<{ input_snapshot: Record<string, unknown> }>(
      'SELECT input_snapshot FROM decisions WHERE mint = $1 ORDER BY created_at DESC LIMIT 1',
      [buyDecision.mint],
    );
    expect(rows[0]?.input_snapshot).toMatchObject({ bondingCurvePct: 68 });
  });

  it('bumpDailyStat accumulates into a single day row', async () => {
    await bumpDailyStat('1999-01-01', 'tokens_seen');
    await bumpDailyStat('1999-01-01', 'tokens_seen');
    const stats = await getDailyStats('1999-01-01');
    expect(stats?.tokensSeen).toBe(2);
  });

  it('kill_state: seeded row reads, set round-trips, second row impossible', async () => {
    const initial = await getKillState();
    expect(typeof initial.active).toBe('boolean');

    await setKillState(true, 'integration-test');
    expect((await getKillState()).active).toBe(true);
    expect((await getKillState()).reason).toBe('integration-test');

    await expect(
      query("INSERT INTO kill_state (id, active, reason) VALUES (2, false, 'nope')"),
    ).rejects.toThrow(); // CHECK (id = 1)
  });

  it('attachPersistence: emitting on the bus lands a row ("log first")', async () => {
    const day = utcDay(Date.now());
    const before = (await getDailyStats(day))?.riskBlocks ?? 0;
    const bus = new Bus();
    attachPersistence(bus);
    bus.emit({ type: 'risk_block', payload: { mint: rawToken.mint, reason: 'integration' } });
    // The executor is fire-and-forget; give it a beat.
    await new Promise((r) => setTimeout(r, 300));
    const after = (await getDailyStats(day))?.riskBlocks ?? 0;
    expect(after).toBe(before + 1);
  });
});

describe.skipIf(hasDb)('db integration (skipped)', () => {
  it('skipped: DATABASE_URL not set — export it in the shell to run live tests', () => {
    expect(hasDb).toBe(false);
  });
});
