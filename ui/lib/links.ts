/**
 * External links for a token mint. Pure string builders — no network. These are
 * read-only outbound links (the dashboard never calls these services; it just
 * lets you open them). The pump.fun coin page is where the live price chart lives.
 */

/** pump.fun coin page — the token's live chart + trade UI. */
export function pumpFunUrl(mint: string): string {
  return `https://pump.fun/coin/${mint}`;
}

/** Solscan token page — on-chain holders, transfers, metadata. */
export function solscanUrl(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

/** DexScreener — charting once a pair exists (post-graduation / indexed). */
export function dexScreenerUrl(mint: string): string {
  return `https://dexscreener.com/solana/${mint}`;
}
