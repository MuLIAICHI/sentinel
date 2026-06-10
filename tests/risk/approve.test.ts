import { describe, expect, it } from 'vitest';
import type { Decision } from '../../core/types.js';
import { approve, type PortfolioState } from '../../risk/approve.js';
import {
  DAILY_LOSS_LIMIT_SOL,
  LIVE_TRADING,
  MAX_CONCURRENT,
  MAX_POSITION_SOL,
} from '../../risk/guards.js';
import { checkDailyLossKill } from '../../risk/index.js';

/** A BUY decision fixture; override fields per test. */
function buy(overrides: Partial<Decision> = {}): Decision {
  return {
    mint: 'MintAAA',
    action: 'BUY',
    confidence: 0.8,
    reasoning: 'fixture',
    modelLatencyMs: 120,
    ...overrides,
  };
}

/** A healthy portfolio fixture; override fields per test. */
function portfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    openPositionsCount: 0,
    dailyRealizedPnlSol: 0,
    killSwitchActive: false,
    ...overrides,
  };
}

describe('tripwire', () => {
  it('LIVE_TRADING is false — if this fails, someone flipped the live gate', () => {
    expect(LIVE_TRADING).toBe(false);
  });
});

describe('approve — happy path', () => {
  it('approves a BUY with valid confidence and a healthy portfolio', () => {
    const result = approve(buy({ confidence: 0.8 }), portfolio());
    expect(result.approved).toBe(true);
    if (result.approved) {
      expect(result.mint).toBe('MintAAA');
      expect(result.sizeSol).toBeCloseTo(MAX_POSITION_SOL * 0.8, 10);
      expect(result.confidence).toBe(0.8);
    }
  });

  it('sizes exactly at the cap for confidence 1', () => {
    const result = approve(buy({ confidence: 1 }), portfolio());
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.sizeSol).toBe(MAX_POSITION_SOL);
  });
});

describe('approve — kill switch', () => {
  it('blocks any entry while the kill switch is active', () => {
    const result = approve(buy(), portfolio({ killSwitchActive: true }));
    expect(result).toEqual({ approved: false, mint: 'MintAAA', reason: 'kill_switch_active' });
  });

  it('kill switch outranks every other check (perfect decision still blocked)', () => {
    const result = approve(buy({ confidence: 1 }), portfolio({ killSwitchActive: true }));
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.reason).toBe('kill_switch_active');
  });
});

describe('approve — action gate', () => {
  it('blocks SKIP decisions — only BUY can be sized', () => {
    const result = approve(buy({ action: 'SKIP' }), portfolio());
    expect(result).toEqual({ approved: false, mint: 'MintAAA', reason: 'not_a_buy' });
  });
});

describe('approve — daily loss limit', () => {
  it('blocks when realized losses sit exactly at -DAILY_LOSS_LIMIT_SOL', () => {
    const result = approve(buy(), portfolio({ dailyRealizedPnlSol: -DAILY_LOSS_LIMIT_SOL }));
    expect(result).toEqual({ approved: false, mint: 'MintAAA', reason: 'daily_loss_limit' });
  });

  it('blocks when losses exceed the limit', () => {
    const result = approve(buy(), portfolio({ dailyRealizedPnlSol: -DAILY_LOSS_LIMIT_SOL - 0.01 }));
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.reason).toBe('daily_loss_limit');
  });

  it('allows entry when losses are just under the limit', () => {
    const result = approve(
      buy(),
      portfolio({ dailyRealizedPnlSol: -(DAILY_LOSS_LIMIT_SOL - 0.001) }),
    );
    expect(result.approved).toBe(true);
  });
});

describe('approve — concurrency', () => {
  it('blocks when open positions are at MAX_CONCURRENT', () => {
    const result = approve(buy(), portfolio({ openPositionsCount: MAX_CONCURRENT }));
    expect(result).toEqual({ approved: false, mint: 'MintAAA', reason: 'max_concurrent' });
  });

  it('blocks when open positions somehow exceed MAX_CONCURRENT', () => {
    const result = approve(buy(), portfolio({ openPositionsCount: MAX_CONCURRENT + 1 }));
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.reason).toBe('max_concurrent');
  });

  it('allows entry at MAX_CONCURRENT - 1 open positions', () => {
    const result = approve(buy(), portfolio({ openPositionsCount: MAX_CONCURRENT - 1 }));
    expect(result.approved).toBe(true);
  });
});

describe('approve — confidence can only shrink size, never grow it', () => {
  it('caps size at MAX_POSITION_SOL for confidence 1.5', () => {
    const result = approve(buy({ confidence: 1.5 }), portfolio());
    expect(result.approved).toBe(true);
    if (result.approved) {
      expect(result.sizeSol).toBe(MAX_POSITION_SOL);
      expect(result.confidence).toBe(1);
    }
  });

  it('caps size at MAX_POSITION_SOL even for an absurd confidence', () => {
    const result = approve(buy({ confidence: 1_000_000 }), portfolio());
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.sizeSol).toBe(MAX_POSITION_SOL);
  });

  it('blocks confidence 0', () => {
    const result = approve(buy({ confidence: 0 }), portfolio());
    expect(result).toEqual({ approved: false, mint: 'MintAAA', reason: 'invalid_confidence' });
  });

  it('blocks negative confidence (never produces a negative size)', () => {
    const result = approve(buy({ confidence: -0.5 }), portfolio());
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.reason).toBe('invalid_confidence');
  });

  it('blocks NaN confidence', () => {
    const result = approve(buy({ confidence: Number.NaN }), portfolio());
    expect(result.approved).toBe(false);
    if (!result.approved) expect(result.reason).toBe('invalid_confidence');
  });

  it('blocks Infinity-driven trickery from growing size (clamped to the cap)', () => {
    const result = approve(buy({ confidence: Number.POSITIVE_INFINITY }), portfolio());
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.sizeSol).toBe(MAX_POSITION_SOL);
  });
});

describe('approve — size formula', () => {
  it('sizeSol = MAX_POSITION_SOL * confidence for in-range confidence', () => {
    for (const c of [0.1, 0.25, 0.5, 0.75, 0.99]) {
      const result = approve(buy({ confidence: c }), portfolio());
      expect(result.approved).toBe(true);
      if (result.approved) {
        expect(result.sizeSol).toBeCloseTo(MAX_POSITION_SOL * c, 10);
        expect(result.sizeSol).toBeLessThanOrEqual(MAX_POSITION_SOL);
        expect(result.sizeSol).toBeGreaterThan(0);
      }
    }
  });
});

describe('checkDailyLossKill', () => {
  it('trips at exactly -DAILY_LOSS_LIMIT_SOL', () => {
    expect(checkDailyLossKill(-DAILY_LOSS_LIMIT_SOL)).toBe(true);
  });

  it('trips beyond the limit', () => {
    expect(checkDailyLossKill(-DAILY_LOSS_LIMIT_SOL - 1)).toBe(true);
  });

  it('does not trip under the limit, at zero, or in profit', () => {
    expect(checkDailyLossKill(-(DAILY_LOSS_LIMIT_SOL - 0.001))).toBe(false);
    expect(checkDailyLossKill(0)).toBe(false);
    expect(checkDailyLossKill(0.5)).toBe(false);
  });
});
