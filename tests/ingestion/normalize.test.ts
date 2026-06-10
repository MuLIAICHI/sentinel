import { describe, expect, it } from 'vitest';
import { bondingCurveProgressPct, normalize } from '../../ingestion/normalize.js';

const RECEIVED_AT = 1_750_000_000_000;

/** Exact live-captured new-token field list (ADR-007). */
const createEvent = {
  signature: '5sig111',
  mint: 'MintCreate111',
  traderPublicKey: 'CreatorWallet111',
  txType: 'create',
  initialBuy: 35_000_000,
  solAmount: 1.25,
  bondingCurveKey: 'CurveKey111',
  vTokensInBondingCurve: 1_040_000_000,
  vSolInBondingCurve: 31.25,
  marketCapSol: 30.5,
  name: 'Test Token',
  symbol: 'TST',
  uri: 'https://ipfs.io/ipfs/abc',
  is_mayhem_mode: false,
  pool: 'pump',
};

const buyEvent = {
  signature: '5sig222',
  mint: 'MintTrade222',
  traderPublicKey: 'BuyerWallet222',
  txType: 'buy',
  tokenAmount: 1_000_000,
  solAmount: 0.5,
  newTokenBalance: 1_000_000,
  bondingCurveKey: 'CurveKey222',
  vTokensInBondingCurve: 900_000_000,
  vSolInBondingCurve: 45,
  marketCapSol: 50,
  pool: 'pump',
};

describe('normalize — create events', () => {
  it('maps a valid create event to RawTokenEvent', () => {
    const result = normalize(createEvent, RECEIVED_AT);
    expect(result).toEqual({
      kind: 'token',
      event: {
        mint: 'MintCreate111',
        creator: 'CreatorWallet111', // traderPublicKey → creator
        createdAt: RECEIVED_AT, // no timestamp on the wire — receipt time
        symbol: 'TST',
        name: 'Test Token',
        initialBuySol: 1.25, // solAmount → initialBuySol
        source: 'pumpportal',
      },
    });
  });

  it('defaults missing name/symbol to empty strings but keeps the event', () => {
    const { name: _n, symbol: _s, ...noNames } = createEvent;
    const result = normalize(noNames, RECEIVED_AT);
    expect(result?.kind).toBe('token');
    if (result?.kind === 'token') {
      expect(result.event.name).toBe('');
      expect(result.event.symbol).toBe('');
    }
  });

  it('rejects a create event missing its mint', () => {
    const { mint: _m, ...noMint } = createEvent;
    expect(normalize(noMint, RECEIVED_AT)).toBeNull();
  });

  it('rejects a create event missing its creator', () => {
    const { traderPublicKey: _t, ...noCreator } = createEvent;
    expect(normalize(noCreator, RECEIVED_AT)).toBeNull();
  });
});

describe('normalize — trade events', () => {
  it('maps a valid buy to a TradeTick with price = solAmount/tokenAmount', () => {
    const result = normalize(buyEvent, RECEIVED_AT);
    expect(result).toEqual({
      kind: 'trade',
      tick: {
        mint: 'MintTrade222',
        side: 'buy',
        price: 0.5 / 1_000_000,
        solAmount: 0.5,
        tokenAmount: 1_000_000,
        vSol: 45,
        vTokens: 900_000_000,
        marketCapSol: 50,
        receivedAt: RECEIVED_AT,
      },
    });
  });

  it('maps a valid sell to a sell-side TradeTick', () => {
    const result = normalize({ ...buyEvent, txType: 'sell' }, RECEIVED_AT);
    expect(result?.kind).toBe('trade');
    if (result?.kind === 'trade') expect(result.tick.side).toBe('sell');
  });

  it('guards division by zero: zero tokenAmount falls back to reserve price', () => {
    const result = normalize({ ...buyEvent, tokenAmount: 0 }, RECEIVED_AT);
    expect(result?.kind).toBe('trade');
    if (result?.kind === 'trade') {
      expect(result.tick.price).toBe(45 / 900_000_000); // vSol / vTokens
    }
  });

  it('drops a trade with zero tokenAmount AND zero reserves (no derivable price)', () => {
    const result = normalize({ ...buyEvent, tokenAmount: 0, vTokensInBondingCurve: 0 }, RECEIVED_AT);
    expect(result).toBeNull();
  });

  it('rejects trades missing required numeric fields', () => {
    const { solAmount: _a, ...noSol } = buyEvent;
    expect(normalize(noSol, RECEIVED_AT)).toBeNull();
    expect(normalize({ ...buyEvent, tokenAmount: 'lots' }, RECEIVED_AT)).toBeNull();
    expect(normalize({ ...buyEvent, solAmount: Number.NaN }, RECEIVED_AT)).toBeNull();
  });
});

describe('normalize — unknown and malformed input', () => {
  it.each([
    ['string', 'hello'],
    ['number', 42],
    ['null', null],
    ['undefined', undefined],
    ['array', [1, 2, 3]],
    ['empty object', {}],
    ['subscription ack', { message: 'Successfully subscribed to token creation events.' }],
    ['unknown txType', { ...buyEvent, txType: 'mystery' }],
  ])('returns null for %s without throwing', (_label, input) => {
    expect(() => normalize(input, RECEIVED_AT)).not.toThrow();
    expect(normalize(input, RECEIVED_AT)).toBeNull();
  });
});

describe('bondingCurveProgressPct', () => {
  it('is 0 at the ~30 vSOL launch baseline', () => {
    expect(bondingCurveProgressPct(30)).toBe(0);
  });

  it('is 50 halfway through the ~85 vSOL graduation span', () => {
    expect(bondingCurveProgressPct(72.5)).toBe(50);
  });

  it('is 100 at ~115 vSOL', () => {
    expect(bondingCurveProgressPct(115)).toBe(100);
  });

  it('clamps below baseline and above graduation', () => {
    expect(bondingCurveProgressPct(10)).toBe(0);
    expect(bondingCurveProgressPct(500)).toBe(100);
  });

  it('returns 0 for non-finite input', () => {
    expect(bondingCurveProgressPct(Number.NaN)).toBe(0);
    expect(bondingCurveProgressPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
