/**
 * Live execution — A LOCKED DOOR. Unreachable today by construction.
 *
 * EVERY exported function begins with assertLiveAllowed():
 *   1. LIVE_TRADING (risk/guards.ts, human-edited constant, currently false)
 *      must be true — otherwise throw immediately. No network, no env reads,
 *      no signer touch happen before this check.
 *   2. The runtime kill switch must be off (risk/killswitch.js, DB-backed).
 * Both gates are HUMAN-controlled; no agent ever opens them.
 *
 * Flow when (someday) reachable, per ADR-006:
 *   build request (pumpportal.ts) → fetch unsigned tx from PumpPortal →
 *   deserialize → verifyTransaction (fee payer === our pubkey, program ids
 *   within ALLOWED_PROGRAM_IDS) → REJECT on any mismatch → only then hand the
 *   bytes to signer.signAndSend. The Keypair never enters this file.
 *
 * RPC comes exclusively from requireEnv('SOLANA_RPC_URL') — never a
 * hardcoded public default (audit §5 condition 4).
 *
 * KNOWN GAP, FLAGGED FOR HUMAN REVIEW BEFORE ANY GO-LIVE: fill price and
 * token amount below are ESTIMATES using the same haircut model as paper —
 * real fills must be reconciled from the confirmed transaction's balance
 * changes. Acceptable only because this path is unreachable today.
 */

import { Connection, VersionedTransaction } from '@solana/web3.js';
import type { Position } from '../core/types.js';
import { requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { LIVE_TRADING } from '../risk/guards.js';
import { isKillActive } from '../risk/killswitch.js';
import type { RiskedOrder } from '../risk/index.js';
import { getSigner } from './signer.js';
import {
  ALLOWED_PROGRAM_IDS,
  buildTradeRequest,
  fetchLocalTransaction,
  verifyTransaction,
} from './pumpportal.js';
import { defaultPaperFillConfig } from './paper.js';
import type { PaperFillConfig } from './paper.js';

const log = createLogger('execution/live');

// Widen the literal `false` type once; the guard logic stays honest.
const liveTradingEnabled: boolean = LIVE_TRADING;

/**
 * The double gate. Called first in EVERY exported function.
 * Today this always throws at step 1, because LIVE_TRADING === false.
 */
async function assertLiveAllowed(): Promise<void> {
  if (!liveTradingEnabled) {
    throw new Error(
      'live trading disabled: LIVE_TRADING is false (risk/guards.ts — human-edited only)',
    );
  }
  if (await isKillActive()) {
    throw new Error('live trading blocked: kill switch is active');
  }
}

/** Fetch, verify, sign, send — the shared verified-signing pipeline. */
async function executeVerifiedTrade(
  action: 'buy' | 'sell',
  mint: string,
  amount: number | string,
  priorityFeeSol: number,
): Promise<string> {
  const signer = getSigner();
  const publicKey = signer.publicKey();
  const connection = new Connection(requireEnv('SOLANA_RPC_URL'), 'confirmed');

  const request = buildTradeRequest(publicKey, action, mint, amount, {
    priorityFee: priorityFeeSol,
    pool: 'pump',
  });
  const serializedTx = await fetchLocalTransaction(request);

  // VERIFY BEFORE SIGNING (audit §3): inspect the server-built transaction;
  // refuse to sign anything not shaped like the trade we asked for.
  const transaction = VersionedTransaction.deserialize(serializedTx);
  if (!verifyTransaction(transaction, publicKey, ALLOWED_PROGRAM_IDS)) {
    throw new Error(
      `live ${action}: PumpPortal transaction failed verification (fee payer / program allowlist) — refusing to sign`,
    );
  }

  const signature = await signer.signAndSend(serializedTx, connection);
  log.info('live trade submitted', { action, mint, signature });
  return signature;
}

/**
 * Live buy. GATED: throws unless LIVE_TRADING is true AND the kill switch is
 * off — i.e. always throws today.
 */
export async function liveBuy(
  order: RiskedOrder,
  currentPrice: number,
  options: { symbol?: string; config?: Partial<PaperFillConfig> } = {},
): Promise<Position> {
  await assertLiveAllowed();

  const signature = await executeVerifiedTrade(
    'buy',
    order.mint,
    order.sizeSol,
    (options.config?.priorityFeeSol ?? defaultPaperFillConfig.priorityFeeSol),
  );

  // ESTIMATED fill (see header) — same haircut math as paper.ts.
  const cfg = { ...defaultPaperFillConfig, ...options.config };
  const netSol = order.sizeSol * (1 - cfg.feePct) - cfg.priorityFeeSol;
  const fillPrice = currentPrice * (1 + cfg.slippagePct);
  const at = Date.now();

  const position: Position = {
    id: `live-${order.mint}-${at}`,
    mint: order.mint,
    symbol: options.symbol ?? order.mint.slice(0, 8),
    mode: 'live',
    entrySol: order.sizeSol,
    entryPrice: fillPrice,
    entryAt: at,
    amountTokens: netSol / fillPrice,
    status: 'open',
  };
  log.info('live buy filled', { id: position.id, mint: position.mint, signature });
  return position;
}

/**
 * Live sell of `fraction` (0..1] of the position. GATED: throws unless
 * LIVE_TRADING is true AND the kill switch is off — i.e. always throws today.
 * Returns the estimated per-token exit price NET of fees (SellExecutor
 * contract), pending real fill reconciliation (see header).
 */
export async function liveSell(
  position: Position,
  fraction: number,
  currentPrice: number,
  reason: string,
  config: Partial<PaperFillConfig> = {},
): Promise<{ exitPrice: number }> {
  await assertLiveAllowed();

  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new Error(`live sell: invalid fraction ${fraction}`);
  }
  const cfg = { ...defaultPaperFillConfig, ...config };
  const soldTokens = position.amountTokens * fraction;

  const signature = await executeVerifiedTrade(
    'sell',
    position.mint,
    soldTokens,
    cfg.priorityFeeSol,
  );

  // ESTIMATED net exit price — same haircut math as paper.ts.
  const grossSol = soldTokens * currentPrice * (1 - cfg.slippagePct);
  const netSol = grossSol * (1 - cfg.feePct) - cfg.priorityFeeSol;
  const exitPrice = Math.max(netSol / soldTokens, 0);
  log.info('live sell filled', { id: position.id, mint: position.mint, reason, signature });
  return { exitPrice };
}
