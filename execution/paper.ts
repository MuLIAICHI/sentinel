/**
 * Paper trading engine — the DEFAULT and, today, the only reachable path.
 *
 * Simulates fills at the current stream price with a modeled haircut so paper
 * P&L tracks what live trading would actually cost (SPEC §4):
 *
 *   THE HAIRCUT MODEL (all three components configurable, defaults below):
 *     1. PumpPortal platform fee: 0.5% of the SOL side of every trade.
 *     2. Priority fee: flat SOL per transaction (default 0.0005 SOL — the
 *        same default the vendored trade path sends to PumpPortal).
 *     3. Slippage: 1.5% ADVERSE price move — fills are assumed to happen
 *        against us (buy higher, sell lower) on a thin bonding curve.
 *
 *   BUY (order.sizeSol is the all-in SOL spent → Position.entrySol):
 *     netSol     = sizeSol × (1 − fee) − priorityFee     [SOL that buys tokens]
 *     fillPrice  = price × (1 + slippage)                 [we buy HIGHER]
 *     tokens     = netSol / fillPrice
 *     entryPrice = fillPrice  (per-token price actually paid; the SOL-side
 *                  fees are captured in entrySol, so realized P&L
 *                  Σ(proceeds) − entrySol is net of everything)
 *
 *   SELL (returns exitPrice NET of fees, per the positions/ SellExecutor
 *   contract — the engine adds no fee terms of its own):
 *     soldTokens = position.amountTokens × fraction
 *     grossSol   = soldTokens × price × (1 − slippage)    [we sell LOWER]
 *     netSol     = grossSol × (1 − fee) − priorityFee
 *     exitPrice  = max(netSol / soldTokens, 0)
 *
 * Prices are INJECTED by the caller (the index facade's priceOf) — this
 * module never imports ingestion/ or any other Wave 2 module.
 */

import type { Position } from '../core/types.js';
import type { RiskedOrder } from '../risk/index.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('execution/paper');

/** Tunable fill-model parameters. Defaults are the SPEC/audit numbers. */
export interface PaperFillConfig {
  /** PumpPortal platform fee on the SOL side of a trade. Default 0.005 (0.5%). */
  feePct: number;
  /** Flat priority fee per transaction, in SOL. Default 0.0005. */
  priorityFeeSol: number;
  /** Adverse slippage applied to the fill price. Default 0.015 (1.5%). */
  slippagePct: number;
}

export const defaultPaperFillConfig: PaperFillConfig = {
  feePct: 0.005,
  priorityFeeSol: 0.0005,
  slippagePct: 0.015,
};

function assertValidPrice(price: number, context: string): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`paper ${context}: invalid price ${price} — refusing to fill`);
  }
}

/**
 * Simulate a buy fill for a risk-approved order at the current stream price.
 * Throws (refuses to fill) on a missing/invalid price or when the order is
 * too small to cover the modeled fees.
 */
export function paperBuy(
  order: RiskedOrder,
  currentPrice: number,
  options: { symbol?: string; config?: Partial<PaperFillConfig>; now?: () => number } = {},
): Position {
  assertValidPrice(currentPrice, 'buy');
  const cfg = { ...defaultPaperFillConfig, ...options.config };
  const now = options.now ?? Date.now;

  // SOL left to buy tokens after the platform fee and the priority fee.
  const netSol = order.sizeSol * (1 - cfg.feePct) - cfg.priorityFeeSol;
  if (netSol <= 0) {
    throw new Error(
      `paper buy: order size ${order.sizeSol} SOL cannot cover modeled fees — refusing to fill`,
    );
  }

  // Adverse slippage: assume the curve moved against us between tick and fill.
  const fillPrice = currentPrice * (1 + cfg.slippagePct);
  const amountTokens = netSol / fillPrice;
  const at = now();

  const position: Position = {
    id: `paper-${order.mint}-${at}`,
    mint: order.mint,
    symbol: options.symbol ?? order.mint.slice(0, 8),
    mode: 'paper',
    entrySol: order.sizeSol, // all-in SOL spent, fees included
    entryPrice: fillPrice,
    entryAt: at,
    amountTokens,
    status: 'open',
  };

  log.info('paper buy filled', {
    id: position.id,
    mint: position.mint,
    sizeSol: order.sizeSol,
    streamPrice: currentPrice,
    fillPrice,
    amountTokens,
  });
  return position;
}

/**
 * Simulate selling `fraction` (0..1] of a position at the current stream
 * price. Returns the per-token exit price NET of the full haircut, as the
 * positions/ SellExecutor contract requires.
 */
export function paperSell(
  position: Position,
  fraction: number,
  currentPrice: number,
  reason: string,
  config: Partial<PaperFillConfig> = {},
): { exitPrice: number } {
  assertValidPrice(currentPrice, 'sell');
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new Error(`paper sell: invalid fraction ${fraction} — refusing to fill`);
  }
  const cfg = { ...defaultPaperFillConfig, ...config };

  const soldTokens = position.amountTokens * fraction;
  if (soldTokens <= 0) {
    throw new Error(`paper sell: position ${position.id} has no tokens to sell`);
  }

  // Adverse slippage (we sell LOWER), then the platform fee on the SOL
  // proceeds, then the flat priority fee — amortized back into a per-token
  // price. Floored at 0: a dust sale can cost more in fees than it returns.
  const grossSol = soldTokens * currentPrice * (1 - cfg.slippagePct);
  const netSol = grossSol * (1 - cfg.feePct) - cfg.priorityFeeSol;
  const exitPrice = Math.max(netSol / soldTokens, 0);

  log.info('paper sell filled', {
    id: position.id,
    mint: position.mint,
    reason,
    fraction,
    streamPrice: currentPrice,
    exitPrice,
    soldTokens,
  });
  return { exitPrice };
}
