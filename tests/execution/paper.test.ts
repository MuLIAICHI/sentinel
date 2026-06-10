import { describe, expect, it } from 'vitest';
import { Bus } from '../../core/bus.js';
import type { Position } from '../../core/types.js';
import type { RiskedOrder } from '../../risk/index.js';
import { defaultPaperFillConfig, paperBuy, paperSell } from '../../execution/paper.js';
import { createExecutor } from '../../execution/index.js';

const MINT = 'So11111111111111111111111111111111111111112';

const order: RiskedOrder = {
  approved: true,
  mint: MINT,
  sizeSol: 0.033,
  confidence: 1,
};

function openPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'paper-test-1',
    mint: MINT,
    symbol: 'TEST',
    mode: 'paper',
    entrySol: 0.033,
    entryPrice: 0.000001,
    entryAt: 1_000,
    amountTokens: 10_000,
    status: 'open',
    ...overrides,
  };
}

describe('paperBuy fill math', () => {
  // Hand-verified with defaults (fee 0.5%, priority 0.0005 SOL, slip 1.5%):
  //   netSol     = 0.033 * 0.995 - 0.0005       = 0.032335
  //   fillPrice  = 0.000001 * 1.015             = 0.000001015
  //   tokens     = 0.032335 / 0.000001015       = 31857.142857...
  it('applies the full haircut: fee + priority fee off SOL, adverse slippage on price', () => {
    const position = paperBuy(order, 0.000001, { symbol: 'TEST', now: () => 42 });

    expect(position.entryPrice).toBeCloseTo(0.000001015, 12);
    expect(position.amountTokens).toBeCloseTo(0.032335 / 0.000001015, 6);
    expect(position.amountTokens).toBeCloseTo(31857.142857, 4);
    // Strictly fewer tokens than a frictionless fill would give.
    expect(position.amountTokens).toBeLessThan(0.033 / 0.000001);
  });

  it('fills above the stream price (adverse slippage) and books all-in entrySol', () => {
    const streamPrice = 0.000002;
    const position = paperBuy(order, streamPrice);
    expect(position.entryPrice).toBeGreaterThan(streamPrice);
    expect(position.entrySol).toBe(order.sizeSol); // fees live inside entrySol
  });

  it('produces a well-formed paper Position', () => {
    const position = paperBuy(order, 0.000001, { symbol: 'TEST', now: () => 1234 });
    expect(position).toMatchObject({
      id: `paper-${MINT}-1234`,
      mint: MINT,
      symbol: 'TEST',
      mode: 'paper',
      entrySol: 0.033,
      entryAt: 1234,
      status: 'open',
    });
    expect(position.exitPrice).toBeUndefined();
  });

  it('defaults symbol to a mint prefix when none is provided', () => {
    const position = paperBuy(order, 0.000001);
    expect(position.symbol).toBe(MINT.slice(0, 8));
  });

  it('refuses invalid prices', () => {
    expect(() => paperBuy(order, 0)).toThrow(/invalid price/);
    expect(() => paperBuy(order, -1)).toThrow(/invalid price/);
    expect(() => paperBuy(order, Number.NaN)).toThrow(/invalid price/);
    expect(() => paperBuy(order, Number.POSITIVE_INFINITY)).toThrow(/invalid price/);
  });

  it('refuses orders too small to cover the modeled fees', () => {
    const dust: RiskedOrder = { ...order, sizeSol: 0.0004 }; // < priority fee alone
    expect(() => paperBuy(dust, 0.000001)).toThrow(/cannot cover modeled fees/);
  });
});

describe('paperSell fill math', () => {
  // Hand-verified with defaults, price 0.000002, fraction 0.5 of 10,000 tokens:
  //   soldTokens = 5000
  //   grossSol   = 5000 * 0.000002 * 0.985      = 0.00985
  //   netSol     = 0.00985 * 0.995 - 0.0005     = 0.00930075
  //   exitPrice  = 0.00930075 / 5000            = 0.00000186015
  it('returns a net-of-fees exit price (adverse slippage, fee, priority fee)', () => {
    const { exitPrice } = paperSell(openPosition(), 0.5, 0.000002, 'take_profit');
    expect(exitPrice).toBeCloseTo(0.00000186015, 14);
    expect(exitPrice).toBeLessThan(0.000002); // haircut is adverse on sells too
  });

  it('full exit uses the same per-token math', () => {
    //   soldTokens = 10000; grossSol = 10000 * 0.000002 * 0.985 = 0.0197
    //   netSol     = 0.0197 * 0.995 - 0.0005 = 0.0191015
    //   exitPrice  = 0.0191015 / 10000       = 0.00000191015
    const { exitPrice } = paperSell(openPosition(), 1, 0.000002, 'time_stop');
    expect(exitPrice).toBeCloseTo(0.00000191015, 14);
  });

  it('floors exitPrice at zero when fees swamp a dust sale', () => {
    const dust = openPosition({ amountTokens: 1 });
    const { exitPrice } = paperSell(dust, 1, 0.000002, 'hard_stop');
    expect(exitPrice).toBe(0);
  });

  it('refuses invalid prices and fractions', () => {
    expect(() => paperSell(openPosition(), 0.5, 0, 'hard_stop')).toThrow(/invalid price/);
    expect(() => paperSell(openPosition(), 0.5, Number.NaN, 'hard_stop')).toThrow(/invalid price/);
    expect(() => paperSell(openPosition(), 0, 0.000002, 'hard_stop')).toThrow(/invalid fraction/);
    expect(() => paperSell(openPosition(), 1.5, 0.000002, 'hard_stop')).toThrow(/invalid fraction/);
    expect(() => paperSell(openPosition({ amountTokens: 0 }), 1, 0.000002, 'hard_stop')).toThrow(
      /no tokens/,
    );
  });
});

describe('createExecutor (paper facade)', () => {
  it('buys via priceOf, emits position_opened, returns the position', async () => {
    const bus = new Bus();
    const opened: Position[] = [];
    bus.on('position_opened', (p) => opened.push(p));

    const executor = createExecutor({ priceOf: () => 0.000001, bus, now: () => 7 });
    const position = await executor.buy(order, 'TEST');

    expect(position.mode).toBe('paper');
    expect(position.id).toBe(`paper-${MINT}-7`);
    expect(opened).toEqual([position]);
  });

  it('sell satisfies the SellExecutor contract with a net exit price', async () => {
    const executor = createExecutor({ priceOf: () => 0.000002, bus: new Bus() });
    const { exitPrice } = await executor.sell(openPosition(), 0.5, 'take_profit');
    expect(exitPrice).toBeCloseTo(0.00000186015, 14);
  });

  it('refuses cleanly when priceOf has no price for the mint', async () => {
    const executor = createExecutor({ priceOf: () => undefined, bus: new Bus() });
    await expect(executor.buy(order)).rejects.toThrow(/no current price/);
    await expect(executor.sell(openPosition(), 1, 'hard_stop')).rejects.toThrow(
      /no current price/,
    );
  });

  it('haircut is visible end-to-end: paper fill price differs from raw stream price', async () => {
    const streamPrice = 0.000001;
    const executor = createExecutor({ priceOf: () => streamPrice, bus: new Bus() });
    const position = await executor.buy(order);
    expect(position.entryPrice / streamPrice).toBeCloseTo(1 + defaultPaperFillConfig.slippagePct, 10);
  });
});
