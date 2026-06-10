import { describe, expect, it } from 'vitest';
import { Bus } from '../../core/bus.js';
import type { Decision, RawTokenEvent } from '../../core/types.js';

const rawToken: RawTokenEvent = {
  mint: 'MintAAA',
  creator: 'CreatorAAA',
  createdAt: 1_700_000_000_000,
  symbol: 'TST',
  name: 'Test Token',
  initialBuySol: 0.5,
  source: 'pumpportal',
};

const decision: Decision = {
  mint: 'MintAAA',
  action: 'SKIP',
  confidence: 0.2,
  reasoning: 'fixture',
  modelLatencyMs: 120,
};

describe('Bus', () => {
  it('delivers a raw_token payload to its typed subscriber', () => {
    const bus = new Bus();
    const received: RawTokenEvent[] = [];
    bus.on('raw_token', (payload) => {
      // payload is narrowed to RawTokenEvent — field access typechecks.
      received.push(payload);
    });
    bus.emit({ type: 'raw_token', payload: rawToken });
    expect(received).toEqual([rawToken]);
  });

  it('does not fire subscribers of other event types', () => {
    const bus = new Bus();
    let decisionCalls = 0;
    bus.on('decision', () => {
      decisionCalls += 1;
    });
    bus.emit({ type: 'raw_token', payload: rawToken });
    expect(decisionCalls).toBe(0);
  });

  it('narrows payload types per event type', () => {
    const bus = new Bus();
    bus.on('decision', (payload) => {
      // Compile-time check: Decision fields are visible without casts.
      const action: 'BUY' | 'SKIP' = payload.action;
      expect(action).toBe('SKIP');
    });
    bus.emit({ type: 'decision', payload: decision });
  });

  it('isolates a throwing handler so later handlers still run', () => {
    const bus = new Bus();
    let secondHandlerRan = false;
    bus.on('raw_token', () => {
      throw new Error('boom');
    });
    bus.on('raw_token', () => {
      secondHandlerRan = true;
    });
    expect(() => bus.emit({ type: 'raw_token', payload: rawToken })).not.toThrow();
    expect(secondHandlerRan).toBe(true);
  });

  it('onAny receives every event with its type tag', () => {
    const bus = new Bus();
    const seen: string[] = [];
    bus.onAny((event) => {
      seen.push(event.type);
    });
    bus.emit({ type: 'raw_token', payload: rawToken });
    bus.emit({ type: 'decision', payload: decision });
    bus.emit({ type: 'kill_switch', payload: { active: true, reason: 'test' } });
    expect(seen).toEqual(['raw_token', 'decision', 'kill_switch']);
  });
});
