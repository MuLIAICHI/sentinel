/**
 * risk/ — module entry point. The final authority on entries.
 *
 * Public surface:
 * - guards: the hardcoded constants (LIVE_TRADING, position/loss/wallet caps)
 * - approve(): pure entry gate, Decision + PortfolioState → RiskedOrder | RiskBlock
 * - kill switch: DB-backed isKillActive / activateKill / releaseKill
 * - checkDailyLossKill(): pure helper deciding when the daily-loss kill trips
 */

import { DAILY_LOSS_LIMIT_SOL } from './guards.js';

export {
  LIVE_TRADING,
  MAX_POSITION_SOL,
  MAX_CONCURRENT,
  DAILY_LOSS_LIMIT_SOL,
  WALLET_HARD_CAP_SOL,
} from './guards.js';
export { approve } from './approve.js';
export type { PortfolioState, RiskedOrder, RiskBlock } from './approve.js';
export { isKillActive, activateKill, releaseKill } from './killswitch.js';

/**
 * True when the day's realized losses have reached DAILY_LOSS_LIMIT_SOL.
 * Pure helper: callers (orchestrator/positions) pass the day's realized P&L
 * (losses negative) and, on true, call activateKill('daily_loss').
 */
export function checkDailyLossKill(dailyRealizedPnlSol: number): boolean {
  return dailyRealizedPnlSol <= -DAILY_LOSS_LIMIT_SOL;
}
