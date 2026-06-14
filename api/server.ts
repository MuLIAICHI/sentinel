/**
 * The API server: Express REST + a websocket sharing the same HTTP server.
 * Runs INSIDE the orchestrator process — the event bus is in-process, and
 * forwarding BotEvents to the UI requires being on it.
 *
 * Binds 127.0.0.1 only: this is a local paper rig and the kill switch does
 * not belong on a network interface.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { Bus } from '../core/bus.js';
import type { Decision, Position } from '../core/types.js';
import type { DailyStats, KillState } from '../db/queries.js';
import { createLogger } from '../core/logger.js';
import { buildRouter } from './routes.js';
import { attachStream } from './stream.js';

const log = createLogger('api/server');

/** Default port for the local dashboard API. */
export const DEFAULT_PORT = 3001;

/** Everything the API needs, injected — api/ reads no env and touches no module directly. */
export interface ApiDeps {
  bus: Bus;
  openPositions(): Promise<Position[]>;
  closedPositions(limit?: number): Promise<Position[]>;
  decisions(limit?: number): Promise<Decision[]>;
  dailyStats(): Promise<DailyStats | undefined>;
  killState(): Promise<KillState>;
  activateKill(reason: string): Promise<void>;
  releaseKill(reason: string): Promise<void>;
}

export interface ApiServer {
  /** Start listening; resolves the actual port (useful with port 0 in tests). */
  start(port?: number, host?: string): Promise<number>;
  /** Close the websocket clients and the HTTP server. */
  stop(): Promise<void>;
}

/** Local dev origins allowed to call the API (the Next dashboard, `npm run dev`). */
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

/**
 * CORS for the local dashboard only. The bot binds 127.0.0.1 and this allowlist
 * is limited to the dev UI's loopback origins — it does not open the rig to the
 * network. Needed so the browser's preflight on the kill POSTs succeeds.
 */
function cors(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

/** Build (but do not start) the API server over the injected deps. */
export function createApiServer(deps: ApiDeps): ApiServer {
  const app = express();
  const startedAt = Date.now();
  app.use(cors);
  app.use(buildRouter(deps, startedAt));

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ server });
  attachStream(wss, deps);

  return {
    start(port = DEFAULT_PORT, host = '127.0.0.1'): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          const actual = typeof address === 'object' && address !== null ? address.port : port;
          log.info('api listening', { host, port: actual });
          resolve(actual);
        });
      });
    },
    stop(): Promise<void> {
      for (const client of wss.clients) client.terminate();
      return new Promise((resolve) => {
        wss.close(() => {
          // Drop keep-alive sockets too, or close() can wait forever.
          server.closeAllConnections();
          server.close(() => resolve());
        });
      });
    },
  };
}
