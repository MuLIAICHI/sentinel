/**
 * Structured-output schema + defensive validation for the model's verdict.
 *
 * DECISION_SCHEMA constrains the API response to the frozen Decision contract
 * minus `mint` and `modelLatencyMs` (we add those ourselves — the model is
 * never asked to echo the mint). Structured outputs do not support numerical
 * range constraints (`minimum`/`maximum`), so the 0..1 bound on confidence is
 * enforced here, client-side, as the LAST line of defense.
 *
 * validateModelOutput is deliberately paranoid: anything that is not exactly
 * the expected shape returns null, and the caller treats null as SKIP.
 */

/** What the model returns: the Decision contract minus mint/modelLatencyMs. */
export interface ModelVerdict {
  action: 'BUY' | 'SKIP';
  confidence: number; // 0..1
  reasoning: string;
}

/**
 * JSON schema for `output_config.format`. All objects must set
 * `additionalProperties: false` per the structured-outputs contract.
 */
export const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['BUY', 'SKIP'],
      description: 'The trade judgment. Default to SKIP.',
    },
    confidence: {
      type: 'number',
      description: 'Conviction between 0 and 1.',
    },
    reasoning: {
      type: 'string',
      description: 'One short sentence for the log/UI.',
    },
  },
  required: ['action', 'confidence', 'reasoning'],
  additionalProperties: false,
} as const;

/** Strip a single surrounding ```/```json fence, if present. */
function stripFences(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return match?.[1] ?? text;
}

/**
 * Validate an untrusted model output (raw string or already-parsed value)
 * into a ModelVerdict, or null on ANY deviation from the expected shape.
 *
 * - strings get fence-stripping + JSON.parse (plain-text fallback path)
 * - action must be exactly 'BUY' or 'SKIP'
 * - confidence must be a finite number within [0, 1] (clamped on the way out
 *   to absorb float drift)
 * - reasoning must be a non-empty string
 */
export function validateModelOutput(raw: unknown): ModelVerdict | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(stripFences(raw).trim());
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const action = obj['action'];
  const confidence = obj['confidence'];
  const reasoning = obj['reasoning'];
  if (action !== 'BUY' && action !== 'SKIP') return null;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  if (confidence < 0 || confidence > 1) return null;
  if (typeof reasoning !== 'string' || reasoning.trim().length === 0) return null;
  return {
    action,
    confidence: Math.min(1, Math.max(0, confidence)),
    reasoning,
  };
}
