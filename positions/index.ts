/**
 * Public surface of positions/ — the mechanical exit engine.
 *
 * Rules (pure, deterministic) live in rules.ts; the per-tick loop and bus
 * wiring live in engine.ts. No LLM call ever decides when to sell.
 */

export {
  checkHardStop,
  checkKillSwitch,
  checkTakeProfit,
  checkTimeStop,
  checkTrailingStop,
  defaultExitConfig,
  scalpExitConfig,
  selectExitConfig,
  evaluateExit,
} from './rules.js';
export type { ExitAction, ExitConfig, ExitReason, RuleInput } from './rules.js';

export { PositionEngine } from './engine.js';
export type { PositionEngineOptions, PositionExcursion, SellExecutor } from './engine.js';
