import { describe, expect, it } from 'vitest';
import { TradeRingBuffer } from '../../ingestion/ringbuffer.js';
import type { TradeTick } from '../../ingestion/types.js';

const T0 = 1_750_000_000_000;

function tick(overrides: Partial<TradeTick> = {}): TradeTick {
  return {
    mint: 'MintA',
    side: 'buy',
    price: 0.000001,
    solAmount: 0.1,
    tokenAmount: 100_000,
    vSol: 40,
    vTokens: 950_000_000,
    marketCapSol: 45,
    receivedAt: T0,
    ...overrides,
  };
}

describe('TradeRingBuffer — push and read', () => {
  it('returns pushed ticks in chronological order', () => {
    const buf = new TradeRingBuffer();
    const a = tick({ receivedAt: T0 });
    const b = tick({ receivedAt: T0 + 1000, side: 'sell' });
    buf.push(a);
    buf.push(b);
    expect(buf.recentTicks('MintA')).toEqual([a, b]);
  });

  it('keeps mints separate', () => {
    const buf = new TradeRingBuffer();
    buf.push(tick({ mint: 'MintA' }));
    buf.push(tick({ mint: 'MintB', price: 9 }));
    expect(buf.recentTicks('MintA')).toHaveLength(1);
    expect(buf.recentTicks('MintB')).toHaveLength(1);
    expect(buf.trackedMints().sort()).toEqual(['MintA', 'MintB']);
  });

  it('returns empty array and undefined price for unknown mints', () => {
    const buf = new TradeRingBuffer();
    expect(buf.recentTicks('Nope')).toEqual([]);
    expect(buf.latestPrice('Nope')).toBeUndefined();
  });
});

describe('TradeRingBuffer — latestPrice', () => {
  it('returns the price of the most recent tick', () => {
    const buf = new TradeRingBuffer();
    buf.push(tick({ price: 1, receivedAt: T0 }));
    buf.push(tick({ price: 2, receivedAt: T0 + 1 }));
    expect(buf.latestPrice('MintA')).toBe(2);
  });
});

describe('TradeRingBuffer — sinceMs filtering', () => {
  it('only returns ticks at or after the absolute cutoff', () => {
    const buf = new TradeRingBuffer();
    buf.push(tick({ receivedAt: T0 }));
    buf.push(tick({ receivedAt: T0 + 5_000 }));
    buf.push(tick({ receivedAt: T0 + 10_000 }));
    const since = buf.recentTicks('MintA', T0 + 5_000);
    expect(since.map((t) => t.receivedAt)).toEqual([T0 + 5_000, T0 + 10_000]);
  });
});

describe('TradeRingBuffer — volumeStats', () => {
  it('counts buys/sells and sums SOL volume over the window', () => {
    const buf = new TradeRingBuffer();
    const now = T0 + 60_000;
    buf.push(tick({ side: 'buy', solAmount: 1, receivedAt: now - 50_000 }));
    buf.push(tick({ side: 'sell', solAmount: 2, receivedAt: now - 40_000 }));
    buf.push(tick({ side: 'buy', solAmount: 3, receivedAt: now - 10_000 }));
    // Outside the window — excluded.
    buf.push(tick({ side: 'buy', solAmount: 100, receivedAt: now - 120_000 }));
    const stats = buf.volumeStats('MintA', 60_000, now);
    expect(stats.buyCount).toBe(2);
    expect(stats.sellCount).toBe(1);
    expect(stats.solVolume).toBe(6);
  });

  it('flags accelerating=true when the latest half-window out-volumes the earlier half', () => {
    const buf = new TradeRingBuffer();
    const now = T0 + 60_000;
    buf.push(tick({ solAmount: 1, receivedAt: now - 50_000 })); // earlier half
    buf.push(tick({ solAmount: 5, receivedAt: now - 10_000 })); // latest half
    expect(buf.volumeStats('MintA', 60_000, now).accelerating).toBe(true);
  });

  it('flags accelerating=false when volume is fading', () => {
    const buf = new TradeRingBuffer();
    const now = T0 + 60_000;
    buf.push(tick({ solAmount: 5, receivedAt: now - 50_000 })); // earlier half
    buf.push(tick({ solAmount: 1, receivedAt: now - 10_000 })); // latest half
    expect(buf.volumeStats('MintA', 60_000, now).accelerating).toBe(false);
  });

  it('is all-zero and not accelerating for an empty window', () => {
    const buf = new TradeRingBuffer();
    expect(buf.volumeStats('MintA', 60_000, T0)).toEqual({
      buyCount: 0,
      sellCount: 0,
      solVolume: 0,
      accelerating: false,
    });
  });
});

describe('TradeRingBuffer — eviction', () => {
  it('caps each mint at perMintCapacity, dropping the oldest', () => {
    const buf = new TradeRingBuffer({ perMintCapacity: 4 });
    for (let i = 0; i < 6; i += 1) {
      buf.push(tick({ price: i, receivedAt: T0 + i }));
    }
    const ticks = buf.recentTicks('MintA');
    expect(ticks).toHaveLength(4);
    expect(ticks.map((t) => t.price)).toEqual([2, 3, 4, 5]);
    expect(buf.latestPrice('MintA')).toBe(5);
  });

  it('evictStale drops mints with no tick for staleMintMs and returns them', () => {
    const buf = new TradeRingBuffer({ staleMintMs: 60_000 });
    buf.push(tick({ mint: 'Old', receivedAt: T0 }));
    buf.push(tick({ mint: 'Fresh', receivedAt: T0 + 55_000 }));
    const dropped = buf.evictStale(T0 + 61_000);
    expect(dropped).toEqual(['Old']);
    expect(buf.trackedMints()).toEqual(['Fresh']);
    expect(buf.latestPrice('Old')).toBeUndefined();
  });

  it('sweeps stale mints opportunistically during push', () => {
    const buf = new TradeRingBuffer({ staleMintMs: 60_000 });
    buf.push(tick({ mint: 'Old', receivedAt: T0 }));
    // A much later tick on another mint triggers the internal sweep.
    buf.push(tick({ mint: 'Fresh', receivedAt: T0 + 120_000 }));
    expect(buf.trackedMints()).toEqual(['Fresh']);
  });
});
