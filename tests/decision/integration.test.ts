/**
 * Live smoke test — ONE real claude-haiku-4-5 call.
 *
 * Skipped entirely unless ANTHROPIC_API_KEY is present in the environment
 * (the human supplies it; agents never touch .env). Costs ≈ $0.001.
 *
 * Goes through callModel + validateModelOutput directly (not decide()) so no
 * database is required.
 */

import { describe, expect, it } from 'vitest';
import { optionalEnv } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import type { Decision, EnrichedCandidate } from '../../core/types.js';
import { callModel, MODEL_ID } from '../../decision/client.js';
import { renderCandidate, SYSTEM_PROMPT } from '../../decision/prompt.js';
import { validateModelOutput } from '../../decision/schema.js';

const log = createLogger('decision/integration-test');

const hasKey = optionalEnv('ANTHROPIC_API_KEY') !== undefined;

describe.skipIf(!hasKey)('decision live smoke test (needs ANTHROPIC_API_KEY)', () => {
  it(
    `one real ${MODEL_ID} call returns a valid Decision shape`,
    async () => {
      const fixture: EnrichedCandidate = {
        mint: 'SmokeMint11111111111111111111111111111111',
        creator: 'SmokeCreator1111111111111111111111111111',
        createdAt: Date.now() - 25 * 60 * 1000,
        ageSeconds: 1500,
        symbol: 'SMOKE',
        name: 'Smoke Test Doge',
        bondingCurvePct: 68,
        uniqueHolders: 180,
        holderGrowthPerMin: 6,
        top10HolderPct: 17,
        devSoldPct: 3,
        devPriorLaunches: 1,
        devPriorRugs: 0,
        volumeAccelerating: true,
        currentMetaTags: ['dog', 'retro'],
      };

      const result = await callModel(SYSTEM_PROMPT, renderCandidate(fixture));
      const verdict = validateModelOutput(result.text);

      expect(result.stopReason).toBe('end_turn');
      expect(verdict).not.toBeNull();
      if (verdict === null) return;

      const decision: Decision = {
        mint: fixture.mint,
        action: verdict.action,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        modelLatencyMs: result.latencyMs,
      };

      expect(['BUY', 'SKIP']).toContain(decision.action);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.reasoning.trim().length).toBeGreaterThan(0);
      expect(decision.modelLatencyMs).toBeGreaterThan(0);

      log.info('live smoke decision', {
        model: MODEL_ID,
        action: decision.action,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        latencyMs: decision.modelLatencyMs,
        usage: { in: result.inputTokens, out: result.outputTokens },
      });
    },
    30_000,
  );
});
