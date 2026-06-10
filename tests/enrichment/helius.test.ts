/**
 * HeliusProvider unit tests — every network interaction mocked via
 * vi.stubGlobal('fetch', ...). No env vars, no credits, deterministic.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeliusProvider } from '../../enrichment/helius.js';
import { HOLDER_COUNT_CAP, ProviderError } from '../../enrichment/provider.js';

const MINT = 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CREATOR = 'CreatorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Provider with all pacing/backoff zeroed so tests run instantly. */
function fastProvider(overrides: ConstructorParameters<typeof HeliusProvider>[0] = {}) {
  return new HeliusProvider({
    apiKey: 'test-key',
    rpcUrl: 'https://rpc.test/',
    dasUrl: 'https://das.test/',
    dasMinIntervalMs: 0,
    rpcMinIntervalMs: 0,
    retryDelayMs: 1,
    ...overrides,
  });
}

type RpcHandler = (method: string, params: unknown, call: number) => Response;

/** Stub global fetch with a JSON-RPC-aware handler. Returns the call log. */
function stubRpc(handler: RpcHandler): { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: unknown };
    calls.push({ method: body.method, params: body.params });
    return handler(body.method, body.params, calls.length);
  });
  return { calls };
}

function rpcOk(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 'sentinel', result }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holderSnapshot', () => {
  it('paginates via cursor, aggregates per owner, excludes the largest (curve) from top-10', async () => {
    const page1 = {
      cursor: 'c1',
      token_accounts: [
        { owner: 'curve', amount: '1000' },
        { owner: 'a', amount: '5' },
        { owner: 'a', amount: '5' }, // second account, same owner — must aggregate
        { owner: 'b', amount: '10' },
        { owner: 'c', amount: '10' },
        { owner: 'd', amount: '10' },
        { owner: 'e', amount: '10' },
      ],
    };
    const page2 = {
      token_accounts: [
        { owner: 'f', amount: '10' },
        { owner: 'g', amount: '10' },
        { owner: 'h', amount: '10' },
        { owner: 'i', amount: '10' },
        { owner: 'j', amount: '10' },
        { owner: 'k', amount: '10' },
        { owner: 'dust', amount: '0' }, // zero balance — not a holder
      ],
    };
    const { calls } = stubRpc((method, params) => {
      expect(method).toBe('getTokenAccounts');
      const p = params as { cursor?: string };
      return rpcOk(p.cursor === 'c1' ? page2 : page1);
    });

    const snap = await fastProvider().holderSnapshot(MINT);

    expect(calls).toHaveLength(2);
    expect((calls[1]!.params as { cursor?: string }).cursor).toBe('c1');
    // curve + a..k = 12 distinct non-zero owners ('dust' excluded)
    expect(snap.uniqueHolders).toBe(12);
    // largest owner (curve, 1000) excluded; circulating = 11 × 10 = 110,
    // top-10 of the rest = 100 → 90.9%
    expect(snap.top10HolderPct).toBeCloseTo(90.9, 1);
  });

  it('caps pagination and reports HOLDER_COUNT_CAP ("5000+") when truncated', async () => {
    const { calls } = stubRpc(() =>
      rpcOk({
        cursor: 'more', // always claims another page exists
        token_accounts: [{ owner: 'x', amount: '1' }],
      }),
    );

    const snap = await fastProvider({ maxHolderPages: 2 }).holderSnapshot(MINT);

    expect(calls).toHaveLength(2); // hard page cap respected
    expect(snap.uniqueHolders).toBe(HOLDER_COUNT_CAP); // sentinel: "at least this many"
  });

  it('a single-owner token reports 0 concentration (no circulating supply observed)', async () => {
    stubRpc(() => rpcOk({ token_accounts: [{ owner: 'curve', amount: '1000' }] }));
    const snap = await fastProvider().holderSnapshot(MINT);
    expect(snap.uniqueHolders).toBe(1);
    expect(snap.top10HolderPct).toBe(0);
  });
});

describe('devActivity heuristic', () => {
  const sig = (signature: string, err: unknown = null) => ({ signature, err });
  const bal = (owner: string, mint: string, amount: string) => ({
    owner,
    mint,
    uiTokenAmount: { amount },
  });

  it('devSoldPct = (peak − latest) / peak over scanned txs touching the mint', async () => {
    const txs: Record<string, unknown> = {
      // newest first: dev went 600 → 300 here
      s1: { meta: { preTokenBalances: [bal(CREATOR, MINT, '600')], postTokenBalances: [bal(CREATOR, MINT, '300')] } },
      // unrelated mint — must be ignored entirely
      s2: { meta: { preTokenBalances: [bal(CREATOR, 'OtherMint', '999')], postTokenBalances: [bal(CREATOR, 'OtherMint', '1')] } },
      // older: peak bag of 1000 observed
      s3: { meta: { preTokenBalances: [bal(CREATOR, MINT, '1000')], postTokenBalances: [bal(CREATOR, MINT, '600')] } },
    };
    stubRpc((method, params) => {
      if (method === 'getSignaturesForAddress') {
        return rpcOk([sig('s1'), sig('s2'), sig('sFailed', { code: 1 }), sig('s3')]);
      }
      const [signature] = params as [string];
      expect(signature).not.toBe('sFailed'); // failed txs are never fetched
      return rpcOk(txs[signature]);
    });

    const result = await fastProvider().devActivity(CREATOR, MINT);
    // peak = 1000, latest = 300 → 70% sold
    expect(result.devSoldPct).toBeCloseTo(70, 5);
  });

  it('reports 0 when no scanned transaction touches the mint', async () => {
    stubRpc((method) =>
      method === 'getSignaturesForAddress'
        ? rpcOk([sig('s1')])
        : rpcOk({ meta: { preTokenBalances: [], postTokenBalances: [] } }),
    );
    const result = await fastProvider().devActivity(CREATOR, MINT);
    expect(result.devSoldPct).toBe(0);
  });

  it('respects the getTransaction scan budget', async () => {
    const { calls } = stubRpc((method) =>
      method === 'getSignaturesForAddress'
        ? rpcOk([sig('s1'), sig('s2'), sig('s3'), sig('s4'), sig('s5')])
        : rpcOk({ meta: { preTokenBalances: [], postTokenBalances: [] } }),
    );
    await fastProvider({ maxTxScans: 2 }).devActivity(CREATOR, MINT);
    expect(calls.filter((c) => c.method === 'getTransaction')).toHaveLength(2);
  });
});

describe('transport behavior', () => {
  it('retries once after a 429 and then succeeds', async () => {
    const { calls } = stubRpc((_method, _params, call) =>
      call === 1 ? new Response('slow down', { status: 429 }) : rpcOk({ token_accounts: [] }),
    );
    const snap = await fastProvider().holderSnapshot(MINT);
    expect(calls).toHaveLength(2);
    expect(snap.uniqueHolders).toBe(0);
  });

  it('throws ProviderError(rate_limited) when 429 persists through retries', async () => {
    stubRpc(() => new Response('slow down', { status: 429 }));
    const err = await fastProvider({ maxRetries: 1 })
      .holderSnapshot(MINT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('rate_limited');
  });

  it('throws ProviderError(timeout) when the request exceeds timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const err = await fastProvider({ timeoutMs: 25 })
      .holderSnapshot(MINT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('timeout');
  });

  it('throws ProviderError(http) on a 500', async () => {
    stubRpc(() => new Response('boom', { status: 500 }));
    const err = await fastProvider()
      .holderSnapshot(MINT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('http');
    expect((err as ProviderError).status).toBe(500);
  });

  it('throws ProviderError(bad_response) on a JSON-RPC error envelope', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 'sentinel', error: { code: -32602, message: 'bad params' } }), {
        status: 200,
      }),
    );
    const err = await fastProvider()
      .holderSnapshot(MINT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('bad_response');
  });
});
