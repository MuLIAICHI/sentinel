/**
 * Hardcoded risk guards — the non-negotiable limits of the system.
 *
 * Per the project hard rules and SPEC §4, every value here is a CONSTANT:
 * never read from env, never from config, never from user input. Changing any
 * of them is a deliberate human edit to this file, reviewed by a human.
 *
 * Dollar equivalents below assume SOL = $150. That price assumption is a
 * snapshot, NOT a live quote — FLAGGED FOR HUMAN REVIEW: re-derive the SOL
 * amounts by hand if SOL moves materially before going live.
 */

/**
 * Master live-trading gate. HUMAN edits this by hand to go live — NO AGENT
 * EVER CHANGES THIS. Going live additionally requires a runtime confirmation
 * flag; this constant alone is never sufficient.
 */
export const LIVE_TRADING = false;

/** Maximum size of a single entry, in SOL. ≈ $5 at assumed SOL=$150. */
export const MAX_POSITION_SOL = 0.033;

/** Maximum number of simultaneously open positions. */
export const MAX_CONCURRENT = 2;

/**
 * Daily realized-loss kill threshold, in SOL. ≈ $15 at assumed SOL=$150.
 * When realized losses for the UTC day reach this, the kill switch trips and
 * all new entries are blocked for the rest of the day.
 */
export const DAILY_LOSS_LIMIT_SOL = 0.1;

/** Absolute ceiling on wallet exposure, in SOL. ≈ $50 at assumed SOL=$150. */
export const WALLET_HARD_CAP_SOL = 0.33;
