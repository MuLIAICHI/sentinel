/**
 * PumpPortal Local Transaction API adapter — VENDORED, not an npm dependency.
 *
 * PROVENANCE (per ADR-006 / docs/audits/pumpmolt-audit.md §5):
 *   Re-implemented from https://github.com/PlaydaDev/pumpmolt
 *   (package "pump-fun-skill"), commit 7119de434cfae38fbb5a1f2579c2b36d8aa9a6b1
 *   (2026-01-31), files src/trade.ts (request shape, trade-local fetch) and
 *   src/utils.ts (transaction handling). The launch/burn/CLI/Docker surfaces
 *   were deliberately NOT ported (audit §5 condition 5).
 *
 * Differences from upstream, mandated by the audit:
 *   - NO key handling here. Upstream reads the private-key env var inside
 *     the library (getConfig() from executeTrade); we do keypair injection —
 *     signing lives exclusively in execution/signer.ts.
 *   - verifyTransaction(): upstream blind-signs whatever bytes PumpPortal
 *     returns (audit §3). We verify fee payer + program-id allowlist BEFORE
 *     any signing.
 *   - No RPC default. Upstream falls back to public mainnet; our callers must
 *     use requireEnv('SOLANA_RPC_URL') (audit §5 condition 4).
 *   - Logging via core/logger, never console (audit §6).
 */

import { VersionedTransaction } from '@solana/web3.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('execution/pumpportal');

/** The only PumpPortal endpoint we call. Body carries the PUBLIC key only. */
export const TRADE_LOCAL_URL = 'https://pumpportal.fun/api/trade-local';

/**
 * Program-id allowlist for verifyTransaction — every instruction in a
 * PumpPortal-built trade must target one of these, or we refuse to sign.
 * FLAGGED FOR HUMAN REVIEW before any go-live: confirm each id against an
 * explorer; ids here are constants, never config.
 */
/** pump.fun bonding-curve program (buys/sells pre-graduation). */
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR8DkzSWvWZ2vXSEpKidekT9bcaJZNbtKB4';
/** Solana System Program (account creation, SOL transfers inside the trade). */
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
/** SPL Token Program (token transfers). */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
/** Compute Budget Program (priority fee / CU limit instructions). */
export const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
/** Associated Token Account Program (ATA creation for the traded mint). */
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/** The default allowlist used by the live path. */
export const ALLOWED_PROGRAM_IDS: ReadonlySet<string> = new Set([
  PUMP_FUN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
]);

/** Liquidity pool selector understood by PumpPortal (upstream trade.ts). */
export type TradePool = 'pump' | 'raydium' | 'auto';

/** Optional knobs for a trade request, with upstream-compatible defaults. */
export interface TradeOptions {
  /** Allowed slippage in percent (PumpPortal semantics). Default 10. */
  slippage?: number;
  /** Priority fee in SOL. Default 0.0005. */
  priorityFee?: number;
  /** Pool to route through. Default 'pump'. */
  pool?: TradePool;
}

/**
 * The exact request body PumpPortal's trade-local endpoint expects
 * (upstream trade.ts:36-45; audit §6). NOTE: `denominatedInSol` is the
 * STRING 'true'/'false', not a boolean — that is the upstream wire format.
 */
export interface TradeRequest {
  publicKey: string;
  action: 'buy' | 'sell';
  mint: string;
  /** SOL amount for buys; token amount (or 'N%' string) for sells. */
  amount: number | string;
  denominatedInSol: 'true' | 'false';
  slippage: number;
  priorityFee: number;
  pool: TradePool;
}

/**
 * Build a trade-local request body. Buys are denominated in SOL
 * (denominatedInSol: 'true'); sells in tokens ('false') — matching how
 * upstream buyTokens/sellTokens call executeTrade.
 */
export function buildTradeRequest(
  publicKey: string,
  action: 'buy' | 'sell',
  mint: string,
  amount: number | string,
  options: TradeOptions = {},
): TradeRequest {
  return {
    publicKey,
    action,
    mint,
    amount,
    denominatedInSol: action === 'buy' ? 'true' : 'false',
    slippage: options.slippage ?? 10,
    priorityFee: options.priorityFee ?? 0.0005,
    pool: options.pool ?? 'pump',
  };
}

/**
 * POST the trade request to PumpPortal and return the serialized (UNSIGNED)
 * transaction bytes. Only the public key and trade parameters leave the
 * process — never any key material (audit §2).
 */
export async function fetchLocalTransaction(request: TradeRequest): Promise<Uint8Array> {
  const response = await fetch(TRADE_LOCAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PumpPortal trade-local failed: ${response.status} ${text.slice(0, 200)}`);
  }
  const buffer = await response.arrayBuffer();
  log.debug('trade-local transaction fetched', {
    action: request.action,
    mint: request.mint,
    bytes: buffer.byteLength,
  });
  return new Uint8Array(buffer);
}

/**
 * Verify a PumpPortal-built transaction BEFORE it is signed (audit §3/§5
 * condition 3 — blind-signing mitigation). Accepts only when:
 *   1. the fee payer (first static account key) is OUR public key, and
 *   2. every compiled instruction targets a program in `allowedProgramIds`.
 * Transactions using address-table lookups are rejected outright: program ids
 * loaded from lookup tables cannot be verified offline.
 */
export function verifyTransaction(
  transaction: VersionedTransaction,
  expectedFeePayer: string,
  allowedProgramIds: ReadonlySet<string> = ALLOWED_PROGRAM_IDS,
): boolean {
  const message = transaction.message;

  if (message.addressTableLookups.length > 0) {
    log.warn('rejecting transaction: uses address table lookups (unverifiable offline)');
    return false;
  }

  const staticKeys = message.staticAccountKeys;
  const feePayer = staticKeys[0];
  if (!feePayer || feePayer.toBase58() !== expectedFeePayer) {
    log.warn('rejecting transaction: fee payer mismatch', {
      feePayer: feePayer?.toBase58() ?? '(none)',
    });
    return false;
  }

  for (const instruction of message.compiledInstructions) {
    const programKey = staticKeys[instruction.programIdIndex];
    if (!programKey) {
      log.warn('rejecting transaction: program id index out of bounds');
      return false;
    }
    const programId = programKey.toBase58();
    if (!allowedProgramIds.has(programId)) {
      log.warn('rejecting transaction: program id not in allowlist', { programId });
      return false;
    }
  }

  return true;
}
