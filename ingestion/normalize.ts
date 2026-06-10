/**
 * Pure normalization of raw PumpPortal frames into pipeline types.
 *
 * Boundary rules:
 *  - `normalize` NEVER throws. Unknown or malformed input returns null; the
 *    caller decides how to log it.
 *  - Every field is validated — the raw shapes in types.ts are documentation,
 *    not trust.
 *  - PumpPortal frames carry no timestamp, so the caller passes receipt time.
 */

import type { RawTokenEvent } from '../core/types.js';
import type { NormalizedMessage, TradeTick } from './types.js';

/**
 * Bonding-curve baseline: a fresh pump.fun curve initializes with ~30 virtual
 * SOL in reserve (before any real SOL is deposited).
 */
const CURVE_BASELINE_VSOL = 30;

/**
 * SOL that must be deposited into the curve for graduation: graduation happens
 * around ~85 real SOL raised, i.e. ~115 total virtual SOL.
 */
const CURVE_GRADUATION_SPAN_VSOL = 85;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number, or undefined. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A non-empty string, or undefined. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Estimate bonding-curve progress toward graduation as a percentage (0..100)
 * from the curve's virtual SOL reserve.
 *
 * Formula: ((vSol - 30) / 85) * 100, clamped to [0, 100].
 *
 * ASSUMPTION (documented per ADR-007): pump.fun curves launch with ~30 virtual
 * SOL and graduate after ~85 real SOL has been added (~115 vSOL total). Both
 * constants are protocol conventions, not values read from chain, so this is
 * an ESTIMATE — enrichment consumes it as such and may replace it with an
 * on-chain reading.
 */
export function bondingCurveProgressPct(vSolInBondingCurve: number): number {
  if (!Number.isFinite(vSolInBondingCurve)) return 0;
  const pct = ((vSolInBondingCurve - CURVE_BASELINE_VSOL) / CURVE_GRADUATION_SPAN_VSOL) * 100;
  return Math.min(100, Math.max(0, pct));
}

function normalizeCreate(msg: Record<string, unknown>, receivedAt: number): NormalizedMessage | null {
  const mint = str(msg['mint']);
  const creator = str(msg['traderPublicKey']);
  if (mint === undefined || creator === undefined) return null;
  const event: RawTokenEvent = {
    mint,
    creator,
    createdAt: receivedAt, // no timestamp on the wire — receipt time (ADR-007)
    symbol: typeof msg['symbol'] === 'string' ? msg['symbol'] : '',
    name: typeof msg['name'] === 'string' ? msg['name'] : '',
    initialBuySol: num(msg['solAmount']) ?? 0,
    source: 'pumpportal',
  };
  return { kind: 'token', event };
}

function normalizeTrade(
  msg: Record<string, unknown>,
  side: 'buy' | 'sell',
  receivedAt: number,
): NormalizedMessage | null {
  const mint = str(msg['mint']);
  const solAmount = num(msg['solAmount']);
  const tokenAmount = num(msg['tokenAmount']);
  if (mint === undefined || solAmount === undefined || tokenAmount === undefined) return null;

  const vSol = num(msg['vSolInBondingCurve']) ?? 0;
  const vTokens = num(msg['vTokensInBondingCurve']) ?? 0;

  // Price: prefer the trade's own ratio; guard division by zero by falling
  // back to the post-trade virtual-reserve ratio. If neither is derivable the
  // tick is useless for mark-to-market — drop it.
  let price: number;
  if (tokenAmount > 0) {
    price = solAmount / tokenAmount;
  } else if (vTokens > 0) {
    price = vSol / vTokens;
  } else {
    return null;
  }

  const tick: TradeTick = {
    mint,
    side,
    price,
    solAmount,
    tokenAmount,
    vSol,
    vTokens,
    marketCapSol: num(msg['marketCapSol']) ?? 0,
    receivedAt,
  };
  return { kind: 'trade', tick };
}

/**
 * Normalize one parsed PumpPortal frame.
 *
 * @param raw        The JSON-parsed frame (any shape — fully validated here).
 * @param receivedAt Unix ms at receipt; becomes createdAt / receivedAt.
 * @returns A token event, a trade tick, or null for anything unrecognized
 *          (subscription acks, malformed frames, unknown txTypes). Never throws.
 */
export function normalize(raw: unknown, receivedAt: number): NormalizedMessage | null {
  if (!isRecord(raw)) return null;
  switch (raw['txType']) {
    case 'create':
      return normalizeCreate(raw, receivedAt);
    case 'buy':
      return normalizeTrade(raw, 'buy', receivedAt);
    case 'sell':
      return normalizeTrade(raw, 'sell', receivedAt);
    default:
      return null;
  }
}
