import { describe, expect, it } from 'vitest';
import type { EnrichedCandidate } from '../../core/types.js';
import { renderCandidate, SYSTEM_PROMPT } from '../../decision/prompt.js';

function fixture(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    mint: 'MintFixture1111111111111111111111111111111',
    creator: 'CreatorFixture111111111111111111111111111',
    createdAt: 1_770_000_000_000,
    ageSeconds: 1500,
    symbol: 'TESTSYM',
    name: 'Test Token Name',
    bondingCurvePct: 72.5,
    uniqueHolders: 143,
    holderGrowthPerMin: 4.2,
    top10HolderPct: 18.3,
    devSoldPct: 5.5,
    devPriorLaunches: 2,
    devPriorRugs: 0,
    volumeAccelerating: true,
    currentMetaTags: ['dog', 'ai-agent'],
    ...overrides,
  };
}

describe('SYSTEM_PROMPT', () => {
  it('enforces SKIP as the default', () => {
    expect(SYSTEM_PROMPT).toMatch(/default to skip/i);
  });

  it('scopes the judgment to the graduation window and demands multiple signals', () => {
    expect(SYSTEM_PROMPT).toMatch(/graduation/i);
    expect(SYSTEM_PROMPT).toMatch(/multiple/i);
  });

  it('demands JSON-only output in the Decision verdict shape', () => {
    expect(SYSTEM_PROMPT).toContain('"action"');
    expect(SYSTEM_PROMPT).toContain('"confidence"');
    expect(SYSTEM_PROMPT).toContain('"reasoning"');
  });
});

describe('renderCandidate', () => {
  it('includes every load-bearing field of the EnrichedCandidate', () => {
    const block = renderCandidate(fixture());
    expect(block).toContain('MintFixture1111111111111111111111111111111');
    expect(block).toContain('TESTSYM');
    expect(block).toContain('Test Token Name');
    expect(block).toContain('age_seconds: 1500');
    expect(block).toContain('bonding_curve_pct: 72.5');
    expect(block).toContain('unique_holders: 143');
    expect(block).toContain('holder_growth_per_min: 4.2');
    expect(block).toContain('top10_holder_pct: 18.3');
    expect(block).toContain('dev_sold_pct: 5.5');
    expect(block).toContain('dev_prior_launches: 2');
    expect(block).toContain('dev_prior_rugs: 0');
    expect(block).toContain('volume_accelerating: yes');
  });

  it('includes the current meta tags', () => {
    const block = renderCandidate(fixture());
    expect(block).toContain('current_meta_tags: dog, ai-agent');
  });

  it('renders empty meta tags as none and false acceleration as no', () => {
    const block = renderCandidate(fixture({ currentMetaTags: [], volumeAccelerating: false }));
    expect(block).toContain('current_meta_tags: none');
    expect(block).toContain('volume_accelerating: no');
  });
});
