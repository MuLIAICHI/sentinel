/**
 * Meta-tag computation — pure function over fixture rows, fully deterministic.
 * The DB loader is exercised with a mocked db/client.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ query: vi.fn(async () => mockRows) }));

import { query } from '../../db/client.js';
import {
  computeMetaTags,
  holderGrowthPerMin,
  loadCurrentMetaTags,
  META_WINDOW_MS,
  type TokenNameRow,
} from '../../enrichment/meta.js';

let mockRows: TokenNameRow[] = [];

const row = (name: string, symbol = ''): TokenNameRow => ({ name, symbol });

describe('computeMetaTags', () => {
  it('surfaces recurring theme words ranked by breadth across tokens', () => {
    const rows = [
      row('Dog Wif Hat', 'DWH'),
      row('FIRST DOG', 'FDOG'), // "dog" via name (case-insensitive)
      row('dog2moon', 'DM'), // "dog" via tokenization of dog2moon → dog, 2moon? no: [a-z0-9]+ keeps dog2moon whole
      row('doge dog', 'DOG'),
      row('dog season', 'DS'),
      row('AI Agent', 'AIA'),
      row('Super AI', 'SAI'),
      row('ai overlord', 'AIO'),
      row('Lonely Cat', 'CAT'), // appears once — below minCount
    ];
    const tags = computeMetaTags(rows, { minCount: 3 });
    expect(tags[0]).toBe('dog'); // 4 tokens — outranks ai's 3
    expect(tags).toContain('ai'); // 3 tokens
    expect(tags).not.toContain('cat'); // 1 token < minCount
  });

  it('counts a word once per token, not once per occurrence', () => {
    const rows = [row('baby baby baby', 'BABY'), row('baby shark', 'BS')];
    // "baby" appears in only 2 distinct tokens — below the default minCount of 3
    expect(computeMetaTags(rows)).toEqual([]);
  });

  it('filters stopwords, numbers, and 1-char fragments', () => {
    const rows = [
      row('The Coin of Pump', '42'),
      row('the token on solana', '7'),
      row('a coin for the pump', 'X'),
    ];
    expect(computeMetaTags(rows, { minCount: 2 })).toEqual([]);
  });

  it('keeps short theme carriers like "ai"', () => {
    const rows = [row('ai one'), row('ai two'), row('ai three')];
    // "ai" recurs in 3 tokens; one/two/three appear once each (< minCount)
    expect(computeMetaTags(rows)).toEqual(['ai']);
  });

  it('breaks count ties alphabetically and respects topN (deterministic)', () => {
    const rows = [
      row('zebra apple'),
      row('zebra apple'),
      row('zebra apple mango'),
      row('mango'),
      row('mango'),
    ];
    // zebra:3, apple:3, mango:3 → alphabetical within the tie
    expect(computeMetaTags(rows, { minCount: 3, topN: 2 })).toEqual(['apple', 'mango']);
  });

  it('returns [] for empty input', () => {
    expect(computeMetaTags([])).toEqual([]);
  });
});

describe('loadCurrentMetaTags', () => {
  it('queries raw_tokens with a 6h cutoff and feeds rows to computeMetaTags', async () => {
    mockRows = [row('dog a'), row('dog b'), row('dog c')];
    const now = 10_000_000_000_000;
    const tags = await loadCurrentMetaTags(META_WINDOW_MS, () => now);
    expect(tags).toEqual(['dog']);
    expect(vi.mocked(query)).toHaveBeenCalledWith(expect.stringContaining('raw_tokens'), [
      now - META_WINDOW_MS,
    ]);
  });
});

describe('holderGrowthPerMin', () => {
  it('is 0 with fewer than two samples (v1 single-enrichment reality)', () => {
    expect(holderGrowthPerMin()).toBe(0);
    expect(holderGrowthPerMin({ uniqueHolders: 100, atMs: 0 })).toBe(0);
  });

  it('computes holders gained per minute between two samples', () => {
    expect(
      holderGrowthPerMin(
        { uniqueHolders: 100, atMs: 0 },
        { uniqueHolders: 160, atMs: 2 * 60_000 },
      ),
    ).toBe(30);
  });

  it('is 0 for a non-positive time delta', () => {
    expect(
      holderGrowthPerMin({ uniqueHolders: 100, atMs: 60_000 }, { uniqueHolders: 200, atMs: 60_000 }),
    ).toBe(0);
  });
});
