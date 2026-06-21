/**
 * The API server: Express REST + a websocket sharing the same HTTP server.
 * Runs INSIDE the orchestrator process — the event bus is in-process, and
 * forwarding BotEvents to the UI requires being on it.
 *
 * Binds 127.0.0.1 by default (local paper rig). When deployed (Railway) it can
 * bind 0.0.0.0 — and in that case an `authToken` MUST be injected: it gates the
 * kill switch and every data route behind a shared secret so the publicly
 * reachable surface is not an open "flatten everything" button. `/health` stays
 * open so the platform health-check works.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { Bus } from '../core/bus.js';
import type { Decision, Position } from '../core/types.js';
import type { DailyStats, ExcursionView, KillState } from '../db/queries.js';
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
  /** Closed-position price paths (peak/trough) for fill/slippage analysis. */
  excursions(limit?: number): Promise<ExcursionView[]>;
  activateKill(reason: string): Promise<void>;
  releaseKill(reason: string): Promise<void>;
  /** When set, REST (except /health) and the websocket require this token. */
  authToken?: string | undefined;
  /** Extra CORS origin to allow (the deployed dashboard URL). */
  dashboardOrigin?: string | undefined;
}

export interface ApiServer {
  /** Start listening; resolves the actual port (useful with port 0 in tests). */
  start(port?: number, host?: string): Promise<number>;
  /** Close the websocket clients and the HTTP server. */
  stop(): Promise<void>;
}

/** Loopback dev origins always allowed (the Next dashboard, `npm run dev`). */
const BASE_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/** Constant-time token comparison; false on any length/charset mismatch. */
export function tokenMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pull a bearer-ish token from the `x-api-token` header or `?token=` query. */
function tokenFromReq(req: express.Request): unknown {
  const header = req.headers['x-api-token'];
  if (typeof header === 'string') return header;
  return req.query.token;
}

/** Build (but do not start) the API server over the injected deps. */
export function createApiServer(deps: ApiDeps): ApiServer {
  const app = express();
  const startedAt = Date.now();
  const allowedOrigins = new Set(
    deps.dashboardOrigin ? [...BASE_ORIGINS, deps.dashboardOrigin] : BASE_ORIGINS,
  );

  // CORS — loopback dev origins plus the optional deployed dashboard origin.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-token');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Auth — only when a token is configured. /health stays open for health-checks.
  if (deps.authToken) {
    const token = deps.authToken;
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      if (tokenMatches(token, tokenFromReq(req))) return next();
      res.status(401).json({ error: 'unauthorized' });
    });
  }

  app.use(buildRouter(deps, startedAt));

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ server });
  attachStream(wss, deps, deps.authToken);

  return {
    start(port = DEFAULT_PORT, host = '127.0.0.1'): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          const actual = typeof address === 'object' && address !== null ? address.port : port;
          log.info('api listening', { host, port: actual, auth: Boolean(deps.authToken) });
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
