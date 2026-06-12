import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApiServer, type ApiServer } from '../../api/server.js';
import { makeDeps, fakeDecision } from './fakes.js';

let server: ApiServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

/**
 * A ws client whose message listener is attached BEFORE any await, queueing
 * everything — otherwise a message arriving between connect and listener
 * attachment is silently lost (events are not buffered).
 */
function client(port: number): {
  ws: WebSocket;
  next(): Promise<any>;
  count(): number;
} {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: any[] = [];
  const waiters: Array<(m: any) => void> = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });
  return {
    ws,
    next() {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        waiters.push(resolve);
        ws.once('error', reject);
      });
    },
    count: () => queue.length,
  };
}

describe('api stream', () => {
  it('sends a snapshot first, then forwards bus events in order', async () => {
    const deps = makeDeps();
    server = createApiServer(deps);
    const port = await server.start(0);

    const c = client(port);
    const snapshot = await c.next();
    expect(snapshot.type).toBe('snapshot');
    expect(snapshot.payload.open).toHaveLength(1);
    expect(snapshot.payload.kill.active).toBe(false);

    deps.bus.emit({ type: 'decision', payload: fakeDecision });
    deps.bus.emit({ type: 'kill_switch', payload: { active: true, reason: 't' } });

    expect((await c.next()).type).toBe('decision');
    expect((await c.next()).type).toBe('kill_switch');
    c.ws.close();
  });

  it('fans out to multiple clients and survives one closing', async () => {
    const deps = makeDeps();
    server = createApiServer(deps);
    const port = await server.start(0);

    const a = client(port);
    const b = client(port);
    expect((await a.next()).type).toBe('snapshot');
    expect((await b.next()).type).toBe('snapshot');

    // Close a fully, then emit — only b should receive.
    await new Promise<void>((resolve) => {
      a.ws.once('close', () => resolve());
      a.ws.close();
    });
    deps.bus.emit({ type: 'decision', payload: fakeDecision });

    const msg = await b.next();
    expect(msg.type).toBe('decision');
    expect(a.count()).toBe(0);
    b.ws.close();
  });
});
