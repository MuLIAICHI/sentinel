/**
 * decide(candidate) — the decision brain's single entry point.
 *
 * Pipeline (ADR-009): ceiling check → render → model call → defensive validate
 * → build the frozen Decision → emit { type: 'decision' } on the bus →
 * insertDecision(decision, candidate) per ADR-005 (await, but a DB failure
 * never fails the decision) → return.
 *
 * This module can only ever REDUCE risk: every failure mode (ceiling, API
 * error, refusal, truncation, malformed output) collapses to SKIP with
 * confidence 0. It never throws into the pipeline.
 */

import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import type { Decision, EnrichedCandidate } from '../core/types.js';
import { insertDecision } from '../db/queries.js';
import { callCeiling } from './ceiling.js';
import { callModel } from './client.js';
import { renderCandidate, SYSTEM_PROMPT } from './prompt.js';
import { validateModelOutput } from './schema.js';

const log = createLogger('decision/index');

/** claude-haiku-4-5 pricing (ADR-009): $1/M input, $5/M output. */
const COST_PER_INPUT_TOKEN_USD = 1 / 1_000_000;
const COST_PER_OUTPUT_TOKEN_USD = 5 / 1_000_000;

/** Process-lifetime cost telemetry (logged on every successful call). */
let totalCalls = 0;
let cumulativeCostUsd = 0;

type FallbackReason = 'parse_failure' | 'api_error' | 'call_ceiling';

function fallbackSkip(mint: string, reasoning: FallbackReason, modelLatencyMs: number): Decision {
  return { mint, action: 'SKIP', confidence: 0, reasoning, modelLatencyMs };
}

/**
 * Judge one enriched candidate. Always resolves with a valid Decision; emits
 * it on the bus and persists it (with the input snapshot) before returning.
 */
export async function decide(candidate: EnrichedCandidate): Promise<Decision> {
  const decision = await judge(candidate);
  bus.emit({ type: 'decision', payload: decision });
  try {
    await insertDecision(decision, candidate);
  } catch (err) {
    // ADR-005: decision/ owns the audit row, but a DB hiccup must not turn
    // into a pipeline failure — the decision already happened and was emitted.
    log.error('failed to persist decision row (decision still stands)', {
      mint: candidate.mint,
      error: String(err),
    });
  }
  return decision;
}

async function judge(candidate: EnrichedCandidate): Promise<Decision> {
  if (callCeiling.atCeiling()) {
    log.warn('hourly call ceiling reached — auto-SKIP without calling the API', {
      mint: candidate.mint,
      callsLastHour: callCeiling.callsLastHour(),
    });
    return fallbackSkip(candidate.mint, 'call_ceiling', 0);
  }

  // Count the attempt before the call so failed/timed-out calls still consume
  // ceiling budget — failures are exactly when runaway retry loops happen.
  callCeiling.recordCall();
  const started = Date.now();
  let result;
  try {
    result = await callModel(SYSTEM_PROMPT, renderCandidate(candidate));
  } catch (err) {
    const latencyMs = Date.now() - started;
    log.error('model call failed — SKIP', {
      mint: candidate.mint,
      latencyMs,
      error: String(err),
    });
    return fallbackSkip(candidate.mint, 'api_error', latencyMs);
  }

  totalCalls += 1;
  const estCostUsd =
    result.inputTokens * COST_PER_INPUT_TOKEN_USD +
    result.outputTokens * COST_PER_OUTPUT_TOKEN_USD;
  cumulativeCostUsd += estCostUsd;
  log.info('model call complete', {
    mint: candidate.mint,
    latencyMs: result.latencyMs,
    calls: totalCalls,
    callsLastHour: callCeiling.callsLastHour(),
    usage: { in: result.inputTokens, out: result.outputTokens },
    estCostUsd: Number(estCostUsd.toFixed(6)),
    cumCostUsd: Number(cumulativeCostUsd.toFixed(6)),
  });

  // Refusal or truncation — the text cannot be trusted even if it parses.
  if (result.stopReason !== 'end_turn') {
    log.warn('non-end_turn stop reason — SKIP', {
      mint: candidate.mint,
      stopReason: result.stopReason,
    });
    return fallbackSkip(candidate.mint, 'parse_failure', result.latencyMs);
  }

  const verdict = validateModelOutput(result.text);
  if (verdict === null) {
    log.warn('model output failed validation — SKIP', {
      mint: candidate.mint,
      rawLength: result.text.length,
    });
    return fallbackSkip(candidate.mint, 'parse_failure', result.latencyMs);
  }

  return {
    mint: candidate.mint,
    action: verdict.action,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
    modelLatencyMs: result.latencyMs,
  };
}
