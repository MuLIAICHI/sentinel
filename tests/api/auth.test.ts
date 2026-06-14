import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApiServer, tokenMatches, type ApiServer } from '../../api/server.js';
import { makeDeps } from './fakes.js';

const TOKEN = 's3cret-validation-token';

let server: ApiServer | undefined;
let base = '';
let port = 0;

async function start() {
  server = createApiServer(makeDeps({ authToken: TOKEN }));
  port = await server.start(0);
  base = `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('tokenMatches', () => {
  it('accepts the exact token and rejects anything else', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abd')).toBe(false);
    expect(tokenMatches('abc', 'ab')).toBe(false);
    expect(tokenMatches('abc', undefined)).toBe(false);
    expect(tokenMatches('abc', 123)).toBe(false);
  });
});

describe('REST auth (when authToken is set)', () => {
  it('lets /health through without a token (health-check)', async () => {
    await start();
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('401s data routes without a token', async () => {
    await start();
    expect((await fetch(`${base}/stats`)).status).toBe(401);
    expect((await fetch(`${base}/positions`)).status).toBe(401);
  });

  it('401s the kill switch without a token', async () => {
    await start();
    const res = await fetch(`${base}/kill`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid token via header', async () => {
    await start();
    const res = await fetch(`${base}/stats`, { headers: { 'x-api-token': TOKEN } });
    expect(res.status).toBe(200);
  });

  it('accepts a valid token via query param', async () => {
    await start();
    expect((await fetch(`${base}/stats?token=${TOKEN}`)).status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    await start();
    const res = await fetch(`${base}/stats`, { headers: { 'x-api-token': 'nope' } });
    expect(res.status).toBe(401);
  });
});

describe('websocket auth', () => {
  it('rejects a ws connection without a token', async () => {
    await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => {});
    });
    expect(code).toBe(1008);
  });

  it('accepts a ws connection with the right token and sends a snapshot', async () => {
    await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${TOKEN}`);
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('close', () => reject(new Error('closed before message')));
      ws.on('error', reject);
    });
    ws.close();
    expect(JSON.parse(msg).type).toBe('snapshot');
  });
});

describe('no auth configured (local rig)', () => {
  it('serves data routes without any token', async () => {
    const s = createApiServer(makeDeps()); // no authToken
    const p = await s.start(0);
    try {
      expect((await fetch(`http://127.0.0.1:${p}/stats`)).status).toBe(200);
    } finally {
      await s.stop();
    }
  });
});
