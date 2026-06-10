import { describe, expect, it } from 'vitest';
import type { Position } from '../../core/types.js';
import {
  defaultExitConfig,
  evaluateExit,
  type RuleInput,
} from '../../positions/index.js';

/** Entry at price 1.0, 10 SOL in, opened at a fixed instant. */
const ENTRY_AT = 1_700_000_000_000;

const position: Position = {
  id: 'pos-1',
  mint: 'MintAAA',
  symbol: 'TST',
  mode: 'paper',
  entrySol: 10,
  entryPrice: 1.0,
  entryAt: ENTRY_AT,
  amountTokens: 10,
  status: 'open',
};

/** A quiet tick shortly after entry — no rule should trigger from this base. */
function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    position,
    currentPrice: 1.1,
    peakPrice: 1.1,
    nowMs: ENTRY_AT + 60_000,
    takenProfit: false,
    killSwitchActive: false,
    config: defaultExitConfig,
    ...overrides,
  };
}

describe('take_profit', () => {
  it('sells 50% at exactly +80% from entry', () => {
    const action = evaluateExit(input({ currentPrice: 1.8, peakPrice: 1.8 }));
    expect(action).toEqual({ kind: 'sell', fraction: 0.5, reason: 'take_profit' });
  });

  it('does not trigger just below +80%', () => {
    expect(evaluateExit(input({ currentPrice: 1.79, peakPrice: 1.79 }))).toEqual({ kind: 'none' });
  });

  it('fires only once per position (takenProfit guard)', () => {
    const action = evaluateExit(input({ currentPrice: 1.9, peakPrice: 1.9, takenProfit: true }));
    expect(action).toEqual({ kind: 'none' });
  });
});

describe('trailing_stop', () => {
  it('sells the remainder when price gives back 25% from peak', () => {
    // Peak 2.0 → trigger at 2.0 × 0.75 = 1.5. TP also triggers at 1.5 < 1.8? No:
    // 1.5 < 1.8 so only the trail fires here.
    const action = evaluateExit(input({ currentPrice: 1.5, peakPrice: 2.0, takenProfit: true }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'trailing_stop' });
  });

  it('does not trigger while give-back is under 25%', () => {
    expect(
      evaluateExit(input({ currentPrice: 1.51, peakPrice: 2.0, takenProfit: true })),
    ).toEqual({ kind: 'none' });
  });

  it('is not armed before a peak above entry exists', () => {
    // Flat peak at entry, price −25%: hard stop territory only (and −25% > −35%).
    expect(evaluateExit(input({ currentPrice: 0.75, peakPrice: 1.0 }))).toEqual({ kind: 'none' });
  });
});

describe('hard_stop', () => {
  it('sells everything when price gaps straight through −35%', () => {
    // Gap straight to 0.5 (−50%) in one tick — no intermediate prints needed.
    // Peak held at entry so only the hard stop is in play.
    const action = evaluateExit(input({ currentPrice: 0.5, peakPrice: 1.0 }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'hard_stop' });
  });

  it('triggers at exactly −35%', () => {
    const action = evaluateExit(input({ currentPrice: 0.65, peakPrice: 1.0 }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'hard_stop' });
  });

  it('does not trigger just above −35%', () => {
    expect(evaluateExit(input({ currentPrice: 0.66, peakPrice: 1.0 }))).toEqual({ kind: 'none' });
  });
});

describe('time_stop', () => {
  it('sells everything at exactly 45 minutes after entry', () => {
    const action = evaluateExit(input({ nowMs: ENTRY_AT + 45 * 60 * 1000 }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'time_stop' });
  });

  it('does not trigger one millisecond before expiry', () => {
    expect(evaluateExit(input({ nowMs: ENTRY_AT + 45 * 60 * 1000 - 1 }))).toEqual({ kind: 'none' });
  });
});

describe('kill_switch', () => {
  it('flattens immediately regardless of price or age (kill mid-flight)', () => {
    // Price comfortably in profit, position young — kill still flattens.
    const action = evaluateExit(input({ currentPrice: 1.4, peakPrice: 1.4, killSwitchActive: true }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'kill_switch' });
  });
});

describe('precedence — multiple rules on one tick', () => {
  it('kill_switch beats hard_stop', () => {
    const action = evaluateExit(input({ currentPrice: 0.5, peakPrice: 1.1, killSwitchActive: true }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'kill_switch' });
  });

  it('hard_stop beats time_stop', () => {
    const action = evaluateExit(
      input({ currentPrice: 0.5, peakPrice: 1.1, nowMs: ENTRY_AT + 60 * 60 * 1000 }),
    );
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'hard_stop' });
  });

  it('time_stop beats trailing_stop', () => {
    // Trail armed (peak 2.0) and given back 25%, but the clock also expired.
    const action = evaluateExit(
      input({ currentPrice: 1.5, peakPrice: 2.0, nowMs: ENTRY_AT + 45 * 60 * 1000 }),
    );
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'time_stop' });
  });

  it('trailing_stop beats take_profit', () => {
    // Price +80% (TP eligible) but peak 2.5 means a 28% give-back — trail wins.
    const action = evaluateExit(input({ currentPrice: 1.8, peakPrice: 2.5 }));
    expect(action).toEqual({ kind: 'sell', fraction: 1, reason: 'trailing_stop' });
  });
});

describe('no trigger', () => {
  it('returns none on a quiet tick', () => {
    expect(evaluateExit(input())).toEqual({ kind: 'none' });
  });
});
