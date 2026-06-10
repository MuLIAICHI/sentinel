/**
 * The one place the Anthropic SDK is touched (ADR-009, Gate 1 approved).
 *
 * - Model id is EXACTLY 'claude-haiku-4-5' — a constant defined here and
 *   nowhere else.
 * - Structured outputs via `output_config.format` (json_schema) constrain the
 *   response to the Decision contract; the defensive parse in schema.ts stays
 *   as the last line regardless.
 * - 10s timeout, maxRetries: 1 (the SDK retries 429/5xx internally — exactly
 *   one retry, then the error propagates and the caller SKIPs).
 * - No temperature/top_p, no thinking param.
 * - API key comes from requireEnv('ANTHROPIC_API_KEY'); the client is lazy so
 *   importing this module never throws when the key is absent (unit tests mock
 *   this module entirely).
 */

import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { DECISION_SCHEMA } from './schema.js';

/** ADR-009 approved model id. The single source of truth — never duplicated. */
export const MODEL_ID = 'claude-haiku-4-5';

/** The verdict is ~3 small fields; 512 tokens is generous headroom. */
export const MAX_TOKENS = 512;

const TIMEOUT_MS = 10_000;

const log = createLogger('decision/client');

let client: Anthropic | undefined;

/** Lazy singleton so the key is only required when a call actually happens. */
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return client;
}

export interface ModelCallResult {
  /** Concatenated text content of the response (the JSON verdict). */
  text: string;
  /** Raw stop_reason — anything other than 'end_turn' is suspect. */
  stopReason: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One structured-output call to claude-haiku-4-5. Throws on timeout/API error
 * (after the SDK's single internal retry) — the caller maps that to SKIP.
 */
export async function callModel(
  systemPrompt: string,
  candidateBlock: string,
): Promise<ModelCallResult> {
  const anthropic = getClient();
  const started = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    output_config: { format: { type: 'json_schema', schema: DECISION_SCHEMA } },
    messages: [{ role: 'user', content: candidateBlock }],
  });
  const latencyMs = Date.now() - started;
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  log.debug('model responded', {
    model: MODEL_ID,
    latencyMs,
    stopReason: response.stop_reason,
    usage: { in: response.usage.input_tokens, out: response.usage.output_tokens },
  });
  return {
    text,
    stopReason: response.stop_reason,
    latencyMs,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
