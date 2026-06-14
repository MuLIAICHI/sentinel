import { describe, it, expect } from 'vitest';
import {
  fmtSol,
  fmtPct,
  fmtAge,
  fmtPrice,
  unrealizedPnl,
  distanceToExits,
  EXIT_CONFIG,
} from '../../ui/lib/format.js';
import type { Position } from '../../ui/lib/types.js';

function openPosition(over: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    mint: 'mintAAA',
    symbol: 'AAA',
    mode: 'paper',
    entrySol: 0.033,
    entryPrice: 1e-6,
    entryAt: 1_000_000,
    amountTokens: 33_000,
    status: 'open',
    ...over,
  };
}

describe('fmtSol', () => {
  it('signs positive, negative, and zero', () => {
    expect(fmtSol(0.0123)).toBe('+0.0123 ◎');
    expect(fmtSol(-0.05)).toBe('−0.0500 ◎');
    expect(fmtSol(0)).toBe('0.0000 ◎');
  });
  it('guards non-finite', () => {
    expect(fmtSol(NaN)).toBe('—');
  });
});

describe('fmtPct', () => {
  it('formats fractions with sign and one decimal', () => {
    expect(fmtPct(0.8)).toBe('+80.0%');
    expect(fmtPct(-0.35)).toBe('−35.0%');
    expect(fmtPct(0)).toBe('0.0%');
  });
});

describe('fmtAge', () => {
  it('formats sub-minute, minutes, and hours', () => {
    expect(fmtAge(12_000)).toBe('12s');
    expect(fmtAge(184_000)).toBe('3m 04s');
    expect(fmtAge(3_720_000)).toBe('1h 02m');
  });
  it('guards negatives', () => {
    expect(fmtAge(-5)).toBe('—');
  });
});

describe('fmtPrice', () => {
  it('uses exponential for tiny prices and precision otherwise', () => {
    expect(fmtPrice(1e-6)).toBe('1.00e-6');
    expect(fmtPrice(0)).toBe('0');
    expect(fmtPrice(1.23456)).toBe('1.235');
  });
});

describe('unrealizedPnl', () => {
  it('computes (price - entry) * tokens', () => {
    const p = openPosition();
    // (2e-6 - 1e-6) * 33000 = 0.033
    expect(unrealizedPnl(p, 2e-6)).toBeCloseTo(0.033, 10);
    // at entry, zero
    expect(unrealizedPnl(p, 1e-6)).toBeCloseTo(0, 12);
    // below entry, negative
    expect(unrealizedPnl(p, 5e-7)).toBeCloseTo(-0.0165, 10);
  });
});

describe('distanceToExits', () => {
  it('computes TP and hard-stop distances from current price', () => {
    const p = openPosition(); // entry 1e-6
    const d = distanceToExits(p, 1e-6, 1e-6, p.entryAt);
    // TP trigger = 1.8e-6; (1.8e-6 - 1e-6)/1e-6 = 0.8
    expect(d.takeProfitPct).toBeCloseTo(0.8, 10);
    // hard floor = 0.65e-6; (1e-6 - 0.65e-6)/1e-6 = 0.35
    expect(d.hardStopPct).toBeCloseTo(0.35, 10);
  });

  it('clamps to zero once a trigger is already breached', () => {
    const p = openPosition();
    const past = distanceToExits(p, 2e-6, 2e-6, p.entryAt); // above TP trigger
    expect(past.takeProfitPct).toBe(0);
  });

  it('arms the trailing stop only when peak exceeds entry', () => {
    const p = openPosition();
    expect(distanceToExits(p, 1e-6, 1e-6, p.entryAt).trailingPct).toBeNull();

    // peak 2e-6 → trail trigger 1.5e-6; at price 1.8e-6 cushion = (1.8-1.5)/1.8
    const armed = distanceToExits(p, 1.8e-6, 2e-6, p.entryAt);
    expect(armed.trailingPct).toBeCloseTo((1.8 - 1.5) / 1.8, 10);
  });

  it('counts down the time stop from entry', () => {
    const p = openPosition();
    const half = distanceToExits(p, 1e-6, 1e-6, p.entryAt + EXIT_CONFIG.timeStopMs / 2);
    expect(half.timeStopMsLeft).toBe(EXIT_CONFIG.timeStopMs / 2);
    const expired = distanceToExits(p, 1e-6, 1e-6, p.entryAt + EXIT_CONFIG.timeStopMs + 10_000);
    expect(expired.timeStopMsLeft).toBe(0);
  });
});
