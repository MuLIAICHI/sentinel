/**
 * Live Helius round-trip. Auto-skips when HELIUS_API_KEY is not in the env —
 * deterministic without secrets, real verification when the human has
 * exported it (same pattern as tests/db/integration.test.ts).
 *
 * Spend: capped at 2 DAS pages → 2 HTTP calls, ~20 credits total.
 */

import { describe, expect, it } from 'vitest';
import { HeliusProvider } from '../../enrichment/helius.js';
import { HOLDER_COUNT_CAP } from '../../enrichment/provider.js';

const apiKey = process.env.HELIUS_API_KEY;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe.skipIf(!apiKey)('helius integration (live)', () => {
  it('USDC holder snapshot hits the truncation cap with sane concentration', async () => {
    const provider = new HeliusProvider({
      apiKey: apiKey!,
      // ADR-008: the Helius key doubles as the RPC URL when SOLANA_RPC_URL is unset.
      rpcUrl: process.env.SOLANA_RPC_URL ?? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      maxHolderPages: 2, // keep live spend to 2 calls / ~20 credits
    });

    const snap = await provider.holderSnapshot(USDC_MINT);

    // USDC has millions of holders — the capped sentinel must be reported.
    expect(snap.uniqueHolders).toBe(HOLDER_COUNT_CAP);
    expect(snap.top10HolderPct).toBeGreaterThan(0);
    expect(snap.top10HolderPct).toBeLessThanOrEqual(100);
  }, 60_000);
});

describe.skipIf(Boolean(apiKey))('helius integration (skipped)', () => {
  it('skipped: HELIUS_API_KEY not set — export it in the shell to run live tests', () => {
    expect(apiKey).toBeUndefined();
  });
});
