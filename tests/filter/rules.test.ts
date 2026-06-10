import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../core/types.js';
import type { FilterThresholds } from '../../core/config.js';
import { defaultThresholds } from '../../core/config.js';
import {
  RULE_IDS,
  age_too_young,
  bonding_curve_out_of_band,
  dead_volume,
  dev_dumped,
  dev_repeat_rugger,
  evaluate,
  holder_concentration,
} from '../../filter/index.js';
import type { FilterContext } from '../../filter/index.js';

/** Explicit thresholds for tests so a config-default change can't silently shift fixtures. */
const thresholds: FilterThresholds = {
  minAgeSeconds: 1200,
  curveMinPct: 55,
  curveMaxPct: 85,
  top10MaxPct: 25,
  devSoldMaxPct: 50,
};

/** A candidate that passes age_too_young; rule-specific data lives in the context. */
function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    mint: 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    creator: 'CreatorGoodaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    createdAt: 1_700_000_000_000,
    ageSeconds: 1800,
    symbol: 'TEST',
    name: 'Test Token',
    ...overrides,
  };
}

/** A context where every context-fed rule passes. */
function passingContext(overrides: Partial<FilterContext> = {}): FilterContext {
  return {
    knownBadCreators: new Set(['CreatorRuggerbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']),
    bondingCurvePct: 70,
    top10HolderPct: 15,
    devSoldPct: 10,
    volumeAccelerating: true,
    ...overrides,
  };
}

describe('age_too_young', () => {
  it('passes a token older than the minimum age', () => {
    expect(age_too_young(1800, thresholds)).toBeNull();
  });

  it('passes a token exactly at the minimum age (inclusive bound)', () => {
    expect(age_too_young(1200, thresholds)).toBeNull();
  });

  it('fails a token younger than the minimum age', () => {
    expect(age_too_young(300, thresholds)).toBe('age_too_young');
  });

  it('respects a non-default threshold (no hardcoding in the rule body)', () => {
    expect(age_too_young(1800, { ...thresholds, minAgeSeconds: 3600 })).toBe('age_too_young');
  });
});

describe('dev_repeat_rugger', () => {
  const badSet: ReadonlySet<string> = new Set(['rugger1', 'rugger2']);

  it('passes a creator not in the known-bad set', () => {
    expect(dev_repeat_rugger('honest-dev', badSet)).toBeNull();
  });

  it('fails a creator in the known-bad set', () => {
    expect(dev_repeat_rugger('rugger2', badSet)).toBe('dev_repeat_rugger');
  });

  it('passes everyone when the set is empty', () => {
    expect(dev_repeat_rugger('rugger1', new Set())).toBeNull();
  });
});

describe('bonding_curve_out_of_band', () => {
  it('passes inside the window', () => {
    expect(bonding_curve_out_of_band(70, thresholds)).toBeNull();
  });

  it('passes exactly at both bounds (inclusive window)', () => {
    expect(bonding_curve_out_of_band(55, thresholds)).toBeNull();
    expect(bonding_curve_out_of_band(85, thresholds)).toBeNull();
  });

  it('fails below the window', () => {
    expect(bonding_curve_out_of_band(40, thresholds)).toBe('bonding_curve_out_of_band');
  });

  it('fails above the window', () => {
    expect(bonding_curve_out_of_band(92, thresholds)).toBe('bonding_curve_out_of_band');
  });
});

describe('holder_concentration', () => {
  it('passes when top-10 hold less than the cap', () => {
    expect(holder_concentration(12, thresholds)).toBeNull();
  });

  it('passes exactly at the cap (strictly-greater fails)', () => {
    expect(holder_concentration(25, thresholds)).toBeNull();
  });

  it('fails when top-10 hold more than the cap', () => {
    expect(holder_concentration(40, thresholds)).toBe('holder_concentration');
  });
});

describe('dev_dumped', () => {
  it('passes when the dev still holds most of their bag', () => {
    expect(dev_dumped(5, thresholds)).toBeNull();
  });

  it('passes exactly at the cap (strictly-greater fails)', () => {
    expect(dev_dumped(50, thresholds)).toBeNull();
  });

  it('fails when the dev sold more than the cap', () => {
    expect(dev_dumped(80, thresholds)).toBe('dev_dumped');
  });
});

describe('dead_volume', () => {
  it('passes when volume is re-accelerating', () => {
    expect(dead_volume(true)).toBeNull();
  });

  it('fails when volume is not re-accelerating', () => {
    expect(dead_volume(false)).toBe('dead_volume');
  });
});

describe('evaluate', () => {
  it('passes a clean candidate with full context', () => {
    const result = evaluate(makeCandidate(), passingContext(), thresholds);
    expect(result).toEqual({ passed: true, failedRules: [] });
  });

  it('collects ALL failed rule ids, not just the first', () => {
    const candidate = makeCandidate({
      ageSeconds: 60,
      creator: 'CreatorRuggerbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const context = passingContext({
      bondingCurvePct: 10,
      top10HolderPct: 60,
      devSoldPct: 95,
      volumeAccelerating: false,
    });
    const result = evaluate(candidate, context, thresholds);
    expect(result.passed).toBe(false);
    expect(result.failedRules).toEqual([
      'age_too_young',
      'dev_repeat_rugger',
      'bonding_curve_out_of_band',
      'holder_concentration',
      'dev_dumped',
      'dead_volume',
    ]);
    // every emitted id is a declared rule id
    for (const id of result.failedRules) expect(RULE_IDS).toContain(id);
  });

  it('reports a single failure without dragging in passing rules', () => {
    const result = evaluate(
      makeCandidate(),
      passingContext({ devSoldPct: 99 }),
      thresholds,
    );
    expect(result).toEqual({ passed: false, failedRules: ['dev_dumped'] });
  });

  it('skips context-fed rules whose data is absent (pre-enrichment call)', () => {
    // Only the Candidate is available: age passes, everything else is skipped.
    const result = evaluate(makeCandidate(), {}, thresholds);
    expect(result).toEqual({ passed: true, failedRules: [] });
  });

  it('still fails age_too_young with an empty context (age always runs)', () => {
    const result = evaluate(makeCandidate({ ageSeconds: 30 }), {}, thresholds);
    expect(result).toEqual({ passed: false, failedRules: ['age_too_young'] });
  });

  it('defaults thresholds to core/config defaultThresholds when omitted', () => {
    const candidate = makeCandidate({ ageSeconds: defaultThresholds.minAgeSeconds - 1 });
    const result = evaluate(candidate, passingContext());
    expect(result.passed).toBe(false);
    expect(result.failedRules).toEqual(['age_too_young']);
  });

  it('rejects >95% of a representative fixture batch', () => {
    // 100 candidates modeled on the firehose: overwhelmingly fresh snipes,
    // ruggers, dumped devs, dead volume, and off-window curves; a few real setups.
    const badCreators = new Set(['serial-rugger']);
    const batch: Array<{ candidate: Candidate; context: FilterContext }> = [];
    for (let i = 0; i < 100; i++) {
      const good = i < 4; // 4 survivors expected
      batch.push({
        candidate: makeCandidate({
          mint: `mint-${i}`,
          ageSeconds: good ? 2400 : i % 3 === 0 ? 45 : 2400,
          creator: !good && i % 5 === 0 ? 'serial-rugger' : `creator-${i}`,
        }),
        context: {
          knownBadCreators: badCreators,
          bondingCurvePct: good ? 65 : i % 2 === 0 ? 20 : 95,
          top10HolderPct: good ? 12 : 48,
          devSoldPct: good ? 5 : 75,
          volumeAccelerating: good,
        },
      });
    }
    const passed = batch.filter(
      ({ candidate, context }) => evaluate(candidate, context, thresholds).passed,
    ).length;
    expect(passed).toBe(4);
    expect(1 - passed / batch.length).toBeGreaterThan(0.95);
  });
});
