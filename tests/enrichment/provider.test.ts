/**
 * The provider seam + enrich() composition — all dependencies injected,
 * no network, no DB, no env.
 */

import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../../core/bus.js';
import type { Candidate, EnrichedCandidate } from '../../core/types.js';
import { enrich, type EnrichDeps } from '../../enrichment/index.js';
import type { DataProvider } from '../../enrichment/provider.js';

const candidate: Candidate = {
  mint: 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  creator: 'CreatorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  createdAt: 1_700_000_000_000,
  ageSeconds: 1500,
  symbol: 'DWH',
  name: 'dog wif hat',
};

function fakeProvider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    holderSnapshot: vi.fn(async () => ({ uniqueHolders: 140, top10HolderPct: 18.5 })),
    devActivity: vi.fn(async () => ({ devSoldPct: 12 })),
    ...overrides,
  };
}

function deps(overrides: Partial<EnrichDeps> = {}): EnrichDeps {
  return {
    provider: fakeProvider(),
    volumeAccelerating: () => true,
    bondingCurvePct: () => 72,
    creatorHistory: async () => ({ launches: 3 }),
    metaTags: () => ['dog', 'ai'],
    bus: new Bus(),
    ...overrides,
  };
}

describe('enrich()', () => {
  it('composes provider + injected signals + history into an EnrichedCandidate', async () => {
    const d = deps();
    const result = await enrich(candidate, d);

    expect(result).toEqual({
      ...candidate,
      bondingCurvePct: 72,
      uniqueHolders: 140,
      holderGrowthPerMin: 0, // v1: single sample — documented
      top10HolderPct: 18.5,
      devSoldPct: 12,
      devPriorLaunches: 2, // launches(3) − the candidate's own launch
      devPriorRugs: 0, // unknown until position outcomes exist — documented
      volumeAccelerating: true,
      currentMetaTags: ['dog', 'ai'],
    });
  });

  it('emits candidate_enriched on the bus with the returned payload', async () => {
    const bus = new Bus();
    const seen: EnrichedCandidate[] = [];
    bus.on('candidate_enriched', (payload) => seen.push(payload));

    const result = await enrich(candidate, deps({ bus }));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(result);
  });

  it('floors devPriorLaunches at 0 when history is empty', async () => {
    const result = await enrich(candidate, deps({ creatorHistory: async () => ({ launches: 0 }) }));
    expect(result?.devPriorLaunches).toBe(0);
  });

  it('supports async meta tags', async () => {
    const result = await enrich(candidate, deps({ metaTags: async () => ['pepe'] }));
    expect(result?.currentMetaTags).toEqual(['pepe']);
  });

  it('returns null (never throws) when a provider call fails, and does not emit', async () => {
    const bus = new Bus();
    const seen: EnrichedCandidate[] = [];
    bus.on('candidate_enriched', (payload) => seen.push(payload));

    const result = await enrich(
      candidate,
      deps({
        bus,
        provider: fakeProvider({
          holderSnapshot: async () => {
            throw new Error('provider down');
          },
        }),
      }),
    );

    expect(result).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it('returns null when an injected signal throws', async () => {
    const result = await enrich(
      candidate,
      deps({
        volumeAccelerating: () => {
          throw new Error('ring buffer not warmed up');
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('spends no provider credits when the cheap DB step already failed', async () => {
    const provider = fakeProvider();
    const result = await enrich(
      candidate,
      deps({
        provider,
        creatorHistory: async () => {
          throw new Error('db down');
        },
      }),
    );
    expect(result).toBeNull();
    expect(provider.holderSnapshot).not.toHaveBeenCalled();
    expect(provider.devActivity).not.toHaveBeenCalled();
  });
});
