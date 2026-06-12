import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiServer, type ApiServer } from '../../api/server.js';
import { makeDeps } from './fakes.js';

let server: ApiServer | undefined;
let base = '';

async function startWith(deps = makeDeps()) {
  server = createApiServer(deps);
  const port = await server.start(0);
  base = `http://127.0.0.1:${port}`;
  return deps;
}

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('api routes', () => {
  it('GET /health reports kill state, open count, uptime', async () => {
    await startWith();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, killActive: false, openPositions: 1 });
    expect(typeof body.uptimeSec).toBe('number');
  });

  it('GET /positions returns open and closed', async () => {
    await startWith();
    const body = await (await fetch(`${base}/positions`)).json();
    expect(body.open).toHaveLength(1);
    expect(body.open[0].id).toBe('paper-FAKE-1');
    expect(body.closed).toEqual([]);
  });

  it('GET /decisions passes the limit through (default 100)', async () => {
    const deps = await startWith();
    await fetch(`${base}/decisions?limit=5`);
    expect(deps.decisions).toHaveBeenCalledWith(5);
    await fetch(`${base}/decisions`);
    expect(deps.decisions).toHaveBeenCalledWith(100);
  });

  it('GET /stats returns stats and kill state', async () => {
    await startWith();
    const body = await (await fetch(`${base}/stats`)).json();
    expect(body.stats.tokensSeen).toBe(100);
    expect(body.kill.active).toBe(false);
  });

  it('POST /kill calls activateKill with the given reason', async () => {
    const deps = await startWith();
    const res = await fetch(`${base}/kill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'testing' }),
    });
    expect(res.status).toBe(200);
    expect(deps.activateKill).toHaveBeenCalledWith('testing');
  });

  it('POST /kill without a body defaults the reason', async () => {
    const deps = await startWith();
    await fetch(`${base}/kill`, { method: 'POST' });
    expect(deps.activateKill).toHaveBeenCalledWith('manual_ui');
  });

  it('POST /kill/release calls releaseKill', async () => {
    const deps = await startWith();
    const res = await fetch(`${base}/kill/release`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(deps.releaseKill).toHaveBeenCalledWith('manual_ui_release');
  });

  it('a throwing dependency yields 500 and the server survives', async () => {
    await startWith(
      makeDeps({
        openPositions: vi.fn(async () => {
          throw new Error('db down');
        }),
      }),
    );
    const res = await fetch(`${base}/positions`);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeDefined();
    // Server still answers other routes.
    expect((await fetch(`${base}/decisions`)).status).toBe(200);
  });

  it('unknown route is 404', async () => {
    await startWith();
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
