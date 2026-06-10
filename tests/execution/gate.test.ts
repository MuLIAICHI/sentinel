/**
 * THE TRIPWIRE SUITE — proves the live path is unreachable today.
 *
 * If any of these tests ever fails, someone has touched the live gate:
 * stop and get a human. LIVE_TRADING is a human-edited constant in
 * risk/guards.ts; no agent changes it, ever.
 */

import { describe, expect, it } from 'vitest';
import { LIVE_TRADING } from '../../risk/guards.js';
import * as live from '../../execution/live.js';
import { createExecutor } from '../../execution/index.js';
import type { Position } from '../../core/types.js';
import type { RiskedOrder } from '../../risk/index.js';

const order: RiskedOrder = {
  approved: true,
  mint: 'So11111111111111111111111111111111111111112',
  sizeSol: 0.033,
  confidence: 1,
};

const position: Position = {
  id: 'live-test-1',
  mint: order.mint,
  symbol: 'TEST',
  mode: 'live',
  entrySol: 0.033,
  entryPrice: 0.000001,
  entryAt: 1_000,
  amountTokens: 10_000,
  status: 'open',
};

describe('the live-trading gate', () => {
  it('LIVE_TRADING is false — the constant itself', () => {
    expect(LIVE_TRADING).toBe(false);
  });

  it('liveBuy rejects while LIVE_TRADING is false', async () => {
    await expect(live.liveBuy(order, 0.000001)).rejects.toThrow(/live trading disabled/);
  });

  it('liveSell rejects while LIVE_TRADING is false', async () => {
    await expect(live.liveSell(position, 1, 0.000001, 'hard_stop')).rejects.toThrow(
      /live trading disabled/,
    );
  });

  it('TRIPWIRE: every function exported from live.ts rejects', async () => {
    // Enumerates the module surface so a future export cannot dodge the gate
    // unnoticed: anything callable must throw while LIVE_TRADING is false.
    const exported = Object.entries(live as Record<string, unknown>).filter(
      (entry): entry is [string, (...args: unknown[]) => unknown] =>
        typeof entry[1] === 'function',
    );
    expect(exported.length).toBeGreaterThan(0);
    for (const [name, fn] of exported) {
      await expect(
        // Plausible-shaped args; the gate must fire before any of them matter.
        Promise.resolve().then(() => fn(order, 0.000001, {}, 'hard_stop')),
        `live.ts export "${name}" did not reject with LIVE_TRADING=false`,
      ).rejects.toThrow(/live trading disabled/);
    }
  });

  it("createExecutor refuses mode 'live' while LIVE_TRADING is false", () => {
    expect(() => createExecutor({ priceOf: () => 0.000001, mode: 'live' })).toThrow(
      /LIVE_TRADING is false/,
    );
  });

  it("createExecutor defaults to paper and never routes to live", async () => {
    const executor = createExecutor({ priceOf: () => 0.000001 });
    const filled = await executor.buy(order);
    expect(filled.mode).toBe('paper');
    expect(filled.id.startsWith('paper-')).toBe(true);
  });
});
