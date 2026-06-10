/**
 * Helius implementation of the DataProvider seam (ADR-008, free tier).
 *
 * Budget discipline (1M credits/month):
 * - holderSnapshot: DAS `getTokenAccounts` (10 credits/page, 1000 accounts/page,
 *   cursor pagination) capped at {@link DEFAULT_MAX_HOLDER_PAGES} pages →
 *   10–50 credits per call. Past the cap we report HOLDER_COUNT_CAP ("5000+")
 *   and compute top-10 from what we have (documented in provider.ts).
 * - devActivity: `getSignaturesForAddress` (1 credit) + up to
 *   {@link DEFAULT_MAX_TX_SCANS} selective `getTransaction` calls (1 credit
 *   each) → ≤16 credits per call.
 * - The Enhanced Transactions API (100 credits/call) is deliberately NOT used.
 *
 * Rate limits respected with simple min-interval limiters: DAS 2 req/s,
 * plain RPC 10 req/s. Retries are minimal and 429-aware only.
 *
 * devSoldPct heuristic (honest disclosure): we scan the creator's most recent
 * signatures, fetch up to N transactions, and read pre/post token balances
 * for (owner = creator, mint = candidate). The dev's "initial bag" is proxied
 * by the PEAK balance observed in the scanned window; the current bag is the
 * post-balance of the newest transaction touching the mint.
 * devSoldPct = (peak − current) / peak × 100, clamped to [0, 100].
 * Blind spots: activity older than the scanned window, bags moved to other
 * wallets (looks like a sale — conservative, acceptable), and devs with zero
 * visible activity (reported as 0). The signal is monotone in visible
 * selling, which is what the filter and the model need.
 */

import { requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import {
  HOLDER_COUNT_CAP,
  ProviderError,
  type DataProvider,
  type DevActivity,
  type HolderSnapshot,
} from './provider.js';

const log = createLogger('enrichment/helius');

export const DEFAULT_MAX_HOLDER_PAGES = 5; // × 1000 accounts = HOLDER_COUNT_CAP
export const DEFAULT_MAX_TX_SCANS = 15;
const DAS_PAGE_LIMIT = 1000;

export interface HeliusProviderOptions {
  /** Defaults to requireEnv('HELIUS_API_KEY'). */
  apiKey?: string;
  /** Defaults to requireEnv('SOLANA_RPC_URL') (the keyed Helius URL). */
  rpcUrl?: string;
  /** DAS endpoint; defaults to mainnet helius-rpc.com with the api key. */
  dasUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Default 10s. */
  timeoutMs?: number;
  /** Extra attempts after a 429. Default 2. */
  maxRetries?: number;
  /** Base backoff after a 429 without Retry-After. Default 1s. */
  retryDelayMs?: number;
  /** Pagination cap for getTokenAccounts. Default 5. */
  maxHolderPages?: number;
  /** getTransaction budget per devActivity call. Default 15. */
  maxTxScans?: number;
  /** How many recent signatures to list. Default 50. */
  signatureLimit?: number;
  /** Min ms between DAS calls. Default 500 (2 req/s). Tests pass 0. */
  dasMinIntervalMs?: number;
  /** Min ms between RPC calls. Default 100 (10 req/s). Tests pass 0. */
  rpcMinIntervalMs?: number;
}

/** Spaces calls at least `minIntervalMs` apart, FIFO. */
class IntervalLimiter {
  private nextSlot = 0;
  constructor(private readonly minIntervalMs: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + this.minIntervalMs;
    if (wait > 0) await sleep(wait);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface JsonRpcEnvelope {
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface TokenAccountsResult {
  token_accounts?: Array<{ owner?: string; amount?: number | string }>;
  cursor?: string;
}

interface SignatureInfo {
  signature: string;
  err: unknown;
}

interface TokenBalance {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string };
}

interface TransactionResult {
  meta?: {
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
}

export class HeliusProvider implements DataProvider {
  private readonly rpcUrl: string;
  private readonly dasUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly maxHolderPages: number;
  private readonly maxTxScans: number;
  private readonly signatureLimit: number;
  private readonly dasLimiter: IntervalLimiter;
  private readonly rpcLimiter: IntervalLimiter;

  constructor(opts: HeliusProviderOptions = {}) {
    const apiKey = opts.apiKey ?? requireEnv('HELIUS_API_KEY');
    this.rpcUrl = opts.rpcUrl ?? requireEnv('SOLANA_RPC_URL');
    this.dasUrl = opts.dasUrl ?? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    // Bind so a vi.stubGlobal'd fetch is picked up at call time in tests.
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 1_000;
    this.maxHolderPages = opts.maxHolderPages ?? DEFAULT_MAX_HOLDER_PAGES;
    this.maxTxScans = opts.maxTxScans ?? DEFAULT_MAX_TX_SCANS;
    this.signatureLimit = opts.signatureLimit ?? 50;
    this.dasLimiter = new IntervalLimiter(opts.dasMinIntervalMs ?? 500);
    this.rpcLimiter = new IntervalLimiter(opts.rpcMinIntervalMs ?? 100);
  }

  async holderSnapshot(mint: string): Promise<HolderSnapshot> {
    // Aggregate token-account balances per OWNER wallet. bigint: raw amounts
    // for 1e9-supply/6-decimal tokens overflow nothing, but stay exact.
    const byOwner = new Map<string, bigint>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = (await this.call(this.dasUrl, this.dasLimiter, 'getTokenAccounts', {
        mint,
        limit: DAS_PAGE_LIMIT,
        ...(cursor !== undefined ? { cursor } : {}),
      })) as TokenAccountsResult;
      const accounts = result.token_accounts ?? [];
      for (const acc of accounts) {
        if (!acc.owner) continue;
        let amount: bigint;
        try {
          amount = BigInt(acc.amount ?? 0);
        } catch {
          continue; // unparseable amount — skip the account, not the snapshot
        }
        if (amount <= 0n) continue;
        byOwner.set(acc.owner, (byOwner.get(acc.owner) ?? 0n) + amount);
      }
      cursor = accounts.length > 0 ? result.cursor : undefined;
      pages += 1;
    } while (cursor !== undefined && pages < this.maxHolderPages);

    const truncated = cursor !== undefined;
    const uniqueHolders = truncated ? HOLDER_COUNT_CAP : byOwner.size;

    // Largest owner ≈ the bonding-curve reserve; exclude it (see provider.ts).
    const balances = [...byOwner.values()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    const circulating = balances.slice(1); // drop largest
    const denominator = circulating.reduce((sum, b) => sum + b, 0n);
    let top10HolderPct = 0;
    if (denominator > 0n) {
      const top10 = circulating.slice(0, 10).reduce((sum, b) => sum + b, 0n);
      top10HolderPct = Number((top10 * 10_000n) / denominator) / 100;
    }

    log.debug('holder snapshot', { mint, uniqueHolders, top10HolderPct, pages, truncated });
    return { uniqueHolders, top10HolderPct };
  }

  async devActivity(creator: string, mint: string): Promise<DevActivity> {
    const sigs = (await this.call(this.rpcUrl, this.rpcLimiter, 'getSignaturesForAddress', [
      creator,
      { limit: this.signatureLimit },
    ])) as SignatureInfo[];

    let peak = 0;
    let current: number | undefined; // post-balance of the NEWEST tx touching the mint
    let scanned = 0;
    for (const sig of Array.isArray(sigs) ? sigs : []) {
      if (scanned >= this.maxTxScans) break;
      if (sig.err) continue; // failed txs moved nothing
      const tx = (await this.call(this.rpcUrl, this.rpcLimiter, 'getTransaction', [
        sig.signature,
        { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
      ])) as TransactionResult | null;
      scanned += 1;
      if (!tx?.meta) continue;
      const pre = creatorBalance(tx.meta.preTokenBalances, creator, mint);
      const post = creatorBalance(tx.meta.postTokenBalances, creator, mint);
      if (pre === undefined && post === undefined) continue; // tx didn't touch the mint
      peak = Math.max(peak, pre ?? 0, post ?? 0);
      if (current === undefined) current = post ?? 0; // signatures are newest-first
    }

    if (peak <= 0) {
      // No visible bag in the window — report 0, never guess upward.
      log.debug('dev activity: no observable bag', { mint, scanned });
      return { devSoldPct: 0 };
    }
    const devSoldPct = Math.min(100, Math.max(0, ((peak - (current ?? 0)) / peak) * 100));
    log.debug('dev activity', { mint, devSoldPct, peak, current, scanned });
    return { devSoldPct };
  }

  /** One JSON-RPC POST with timeout + minimal 429-aware retry. */
  private async call(
    url: string,
    limiter: IntervalLimiter,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      await limiter.acquire();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'sentinel', method, params }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new ProviderError('timeout', `${method} timed out after ${this.timeoutMs}ms`);
        }
        throw new ProviderError('network', `${method} fetch failed: ${String(err)}`);
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        if (attempt >= this.maxRetries) {
          throw new ProviderError('rate_limited', `${method} rate limited after retries`, 429);
        }
        const retryAfterSec = Number(res.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : this.retryDelayMs * (attempt + 1);
        log.warn('429 from provider, backing off', { method, attempt, delayMs: delay });
        await sleep(delay);
        continue;
      }
      if (!res.ok) {
        throw new ProviderError('http', `${method} HTTP ${res.status}`, res.status);
      }

      let envelope: JsonRpcEnvelope;
      try {
        envelope = (await res.json()) as JsonRpcEnvelope;
      } catch {
        throw new ProviderError('bad_response', `${method} returned unparseable JSON`);
      }
      if (envelope.error) {
        throw new ProviderError(
          'bad_response',
          `${method} JSON-RPC error: ${envelope.error.message ?? 'unknown'}`,
        );
      }
      return envelope.result ?? null;
    }
  }
}

/** Creator's raw balance of the mint from a pre/post token-balance array. */
function creatorBalance(
  balances: TokenBalance[] | undefined,
  creator: string,
  mint: string,
): number | undefined {
  const entry = balances?.find((b) => b.mint === mint && b.owner === creator);
  if (!entry?.uiTokenAmount?.amount) return entry ? 0 : undefined;
  const raw = Number(entry.uiTokenAmount.amount);
  return Number.isFinite(raw) ? raw : undefined;
}

/** Production factory: reads HELIUS_API_KEY + SOLANA_RPC_URL from the env. */
export function createHeliusProvider(opts: HeliusProviderOptions = {}): HeliusProvider {
  return new HeliusProvider(opts);
}
