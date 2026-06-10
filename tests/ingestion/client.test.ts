/**
 * PumpPortalClient tests against an in-process `ws` server — no external
 * network. Timeouts are injected short via config so reconnect / heartbeat
 * paths run in milliseconds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws';
import { PumpPortalClient } from '../../ingestion/client.js';

interface Conn {
  socket: ServerSocket;
  url: string;
  messages: unknown[];
}

interface TestServer {
  wss: WebSocketServer;
  url: string;
  connections: Conn[];
  close(): Promise<void>;
}

function startServer(): Promise<TestServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    const connections: Conn[] = [];
    wss.on('connection', (socket, req) => {
      const conn: Conn = { socket, url: req.url ?? '', messages: [] };
      connections.push(conn);
      socket.on('message', (data) => {
        conn.messages.push(JSON.parse(data.toString()));
      });
    });
    wss.on('listening', () => {
      const address = wss.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        wss,
        url: `ws://127.0.0.1:${port}`,
        connections,
        close: () =>
          new Promise<void>((done) => {
            for (const conn of connections) conn.socket.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}

const FAST = { heartbeatTimeoutMs: 5_000, backoffBaseMs: 10, backoffMaxMs: 50 };

let cleanup: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

function track(server: TestServer, client: PumpPortalClient): void {
  cleanup.push(() => client.shutdown());
  cleanup.push(() => server.close());
}

describe('PumpPortalClient — connect and subscribe', () => {
  it('connects and sends subscribeNewToken on open', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({ url: server.url, onMessage: () => undefined, ...FAST });
    track(server, client);
    client.connect();

    await vi.waitFor(() => {
      expect(server.connections[0]?.messages).toContainEqual({ method: 'subscribeNewToken' });
    });
    // Without an API key the URL carries no api-key parameter.
    expect(server.connections[0]?.url).not.toContain('api-key');
  });

  it('appends the API key as ?api-key=... when configured', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({
      url: server.url,
      apiKey: 'k123',
      onMessage: () => undefined,
      ...FAST,
    });
    track(server, client);
    client.connect();

    await vi.waitFor(() => expect(server.connections).toHaveLength(1));
    expect(server.connections[0]?.url).toContain('api-key=k123');
  });

  it('sends additive subscribeTokenTrade for new mints only', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({
      url: server.url,
      apiKey: 'k123',
      onMessage: () => undefined,
      ...FAST,
    });
    track(server, client);
    client.connect();
    await vi.waitFor(() => expect(client.isConnected()).toBe(true));

    client.subscribeTrades(['m1', 'm2']);
    client.subscribeTrades(['m2', 'm3']); // m2 already tracked — only m3 sent

    await vi.waitFor(() => {
      const msgs = server.connections[0]?.messages ?? [];
      expect(msgs).toContainEqual({ method: 'subscribeTokenTrade', keys: ['m1', 'm2'] });
      expect(msgs).toContainEqual({ method: 'subscribeTokenTrade', keys: ['m3'] });
    });
    expect(client.subscribedMints().sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('degraded mode: subscribeTrades no-ops without an API key', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({ url: server.url, onMessage: () => undefined, ...FAST });
    track(server, client);
    client.connect();
    await vi.waitFor(() => expect(client.isConnected()).toBe(true));

    client.subscribeTrades(['m1']);
    expect(client.subscribedMints()).toEqual([]);

    // Give any (wrong) frame time to arrive, then assert only newToken was sent.
    await new Promise((r) => setTimeout(r, 50));
    expect(server.connections[0]?.messages).toEqual([{ method: 'subscribeNewToken' }]);
  });
});

describe('PumpPortalClient — message dispatch', () => {
  it('parses JSON frames and hands them to onMessage with a receipt time', async () => {
    const server = await startServer();
    const received: { raw: unknown; receivedAt: number }[] = [];
    const client = new PumpPortalClient({
      url: server.url,
      onMessage: (raw, receivedAt) => received.push({ raw, receivedAt }),
      ...FAST,
    });
    track(server, client);
    client.connect();
    await vi.waitFor(() => expect(server.connections).toHaveLength(1));

    const before = Date.now();
    server.connections[0]?.socket.send(JSON.stringify({ txType: 'create', mint: 'M1' }));
    server.connections[0]?.socket.send('this is not json'); // dropped, not thrown

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.raw).toEqual({ txType: 'create', mint: 'M1' });
    expect(received[0]?.receivedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('PumpPortalClient — resilience', () => {
  it('reconnects when the heartbeat watchdog sees no frames', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({
      url: server.url,
      onMessage: () => undefined,
      heartbeatTimeoutMs: 80, // server stays silent → watchdog fires
      backoffBaseMs: 10,
      backoffMaxMs: 50,
    });
    track(server, client);
    client.connect();

    await vi.waitFor(() => expect(server.connections).toHaveLength(2), { timeout: 3_000 });
  });

  it('re-subscribes newToken AND the full trade-mint set after a server-side drop', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({
      url: server.url,
      apiKey: 'k123',
      onMessage: () => undefined,
      ...FAST,
    });
    track(server, client);
    client.connect();
    await vi.waitFor(() => expect(client.isConnected()).toBe(true));
    client.subscribeTrades(['m1', 'm2']);

    server.connections[0]?.socket.terminate(); // simulate remote drop

    await vi.waitFor(() => expect(server.connections).toHaveLength(2), { timeout: 3_000 });
    await vi.waitFor(() => {
      const msgs = server.connections[1]?.messages ?? [];
      expect(msgs).toContainEqual({ method: 'subscribeNewToken' });
      expect(msgs).toContainEqual({ method: 'subscribeTokenTrade', keys: ['m1', 'm2'] });
    });
  });

  it('shutdown closes the socket and prevents reconnects', async () => {
    const server = await startServer();
    const client = new PumpPortalClient({ url: server.url, onMessage: () => undefined, ...FAST });
    track(server, client);
    client.connect();
    await vi.waitFor(() => expect(client.isConnected()).toBe(true));

    client.shutdown();
    await vi.waitFor(() => expect(client.isConnected()).toBe(false));

    // No reconnect attempt arrives after shutdown.
    await new Promise((r) => setTimeout(r, 150));
    expect(server.connections).toHaveLength(1);
  });
});
