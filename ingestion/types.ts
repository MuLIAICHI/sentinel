/**
 * Internal types for the ingestion module.
 *
 * Raw message shapes are transcribed from live-captured PumpPortal frames
 * (ADR-007). They describe what the feed sends; everything that crosses the
 * boundary into the rest of the pipeline goes through normalize.ts and is
 * validated defensively — never trust these shapes at runtime.
 */

import type { RawTokenEvent } from '../core/types.js';

/**
 * A normalized trade observation for one mint. This is what the ring buffer
 * stores and what enrichment / positions / execution read.
 */
export interface TradeTick {
  mint: string;
  side: 'buy' | 'sell';
  /** SOL per token — solAmount/tokenAmount, or vSol/vTokens fallback. */
  price: number;
  solAmount: number;
  tokenAmount: number;
  /** Virtual SOL reserve of the bonding curve after this trade. */
  vSol: number;
  /** Virtual token reserve of the bonding curve after this trade. */
  vTokens: number;
  marketCapSol: number;
  /** Unix ms, assigned at receipt — PumpPortal frames carry no timestamp. */
  receivedAt: number;
}

/**
 * PumpPortal new-token event, exact field list live-captured (ADR-007).
 * Note: NO timestamp field — receipt time is assigned by us.
 */
export interface RawCreateMessage {
  signature: string;
  mint: string;
  /** The creator wallet. */
  traderPublicKey: string;
  txType: 'create';
  /** Creator's initial buy in tokens. */
  initialBuy: number;
  /** Creator's initial buy in SOL. */
  solAmount: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  name: string;
  symbol: string;
  uri: string;
  is_mayhem_mode: boolean;
  pool: string;
}

/**
 * PumpPortal trade event (medium-high confidence per ADR-007 — normalize.ts
 * validates every field it uses rather than trusting this shape).
 */
export interface RawTradeMessage {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'buy' | 'sell';
  tokenAmount: number;
  solAmount: number;
  newTokenBalance: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  pool: string;
}

/** Result of normalizing one raw frame: a new-token event or a trade tick. */
export type NormalizedMessage =
  | { kind: 'token'; event: RawTokenEvent }
  | { kind: 'trade'; tick: TradeTick };
