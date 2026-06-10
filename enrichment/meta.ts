/**
 * Meta-tag computation: what themes are hot on the launch stream right now.
 *
 * Algorithm (pure, deterministic — `computeMetaTags`):
 * 1. For each token, lowercase name+symbol and tokenize on runs of [a-z0-9].
 * 2. Drop pure numbers, words shorter than 2 chars, and stopwords (English
 *    function words + generic crypto filler like "coin"/"token"/"pump" that
 *    name no theme).
 * 3. Count each word ONCE per token (a token named "BABY BABY BABY" is one
 *    vote for "baby", not three) — we measure breadth across launches.
 * 4. Keep words appearing in >= minCount tokens (default 3 — a "theme" must
 *    recur), sort by count desc then alphabetically (deterministic ties),
 *    return the top N (default 5).
 *
 * The thin loader (`loadCurrentMetaTags`) feeds it the last 6h of raw_tokens.
 *
 * holderGrowthPerMin: growth needs two samples of the same mint. Version 1 of
 * the pipeline enriches each candidate once, so `enrich()` reports 0 (via the
 * no-sample call below) — documented data-quality gap. The function already
 * accepts two timestamped samples so the orchestrator can call holderSnapshot
 * twice later and wire real growth in without an interface change.
 */

import { query } from '../db/client.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('enrichment/meta');

/** The 6h SPEC window for "current meta". */
export const META_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface TokenNameRow {
  name: string;
  symbol: string;
}

export interface MetaOptions {
  /** Max tags returned. Default 5. */
  topN?: number;
  /** A word must appear in at least this many distinct tokens. Default 3. */
  minCount?: number;
}

/**
 * English function words + generic crypto filler. These never name a theme.
 * Deliberately NOT stopworded: theme carriers like inu/cat/dog/pepe/ai/baby.
 */
const STOPWORDS = new Set([
  // English function words
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it',
  'at', 'by', 'with', 'from', 'this', 'that', 'my', 'no', 'not', 'be', 'we',
  'up', 'do', 'go', 'me', 'so', 'as', 'if', 'its', 'are', 'was', 'you', 'your',
  // generic crypto filler — present in half the stream, names no theme
  'coin', 'token', 'meme', 'pump', 'fun', 'sol', 'solana', 'crypto', 'moon',
]);

/** Pure: rows in, ranked recurring theme words out. */
export function computeMetaTags(rows: TokenNameRow[], opts: MetaOptions = {}): string[] {
  const topN = opts.topN ?? 5;
  const minCount = opts.minCount ?? 3;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const words = new Set<string>(); // distinct per token — breadth, not volume
    const text = `${row.name} ${row.symbol}`.toLowerCase();
    for (const match of text.matchAll(/[a-z0-9]+/g)) {
      const word = match[0];
      if (word.length < 2) continue;
      if (/^[0-9]+$/.test(word)) continue;
      if (STOPWORDS.has(word)) continue;
      words.add(word);
    }
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort(([wordA, countA], [wordB, countB]) =>
      countB !== countA ? countB - countA : wordA < wordB ? -1 : 1,
    )
    .slice(0, topN)
    .map(([word]) => word);
}

/** Thin loader: last `windowMs` of raw_tokens → computeMetaTags. */
export async function loadCurrentMetaTags(
  windowMs: number = META_WINDOW_MS,
  now: () => number = Date.now,
): Promise<string[]> {
  const rows = await query<TokenNameRow>(
    'SELECT name, symbol FROM raw_tokens WHERE created_at >= $1',
    [now() - windowMs],
  );
  const tags = computeMetaTags(rows);
  log.debug('meta tags computed', { windowMs, rows: rows.length, tags });
  return tags;
}

export interface HolderSample {
  uniqueHolders: number;
  atMs: number;
}

/**
 * Holders gained per minute between two samples. With fewer than two samples
 * (the v1 single-enrichment reality) this is 0 by design — see module docs.
 */
export function holderGrowthPerMin(prev?: HolderSample, curr?: HolderSample): number {
  if (!prev || !curr) return 0;
  const minutes = (curr.atMs - prev.atMs) / 60_000;
  if (minutes <= 0) return 0;
  return (curr.uniqueHolders - prev.uniqueHolders) / minutes;
}
