/**
 * REST routes. Read-only snapshots plus the ONLY two state-changing endpoints
 * in the system: POST /kill and POST /kill/release. Both go through risk/'s
 * kill functions (injected) — never the DB directly.
 *
 * There is NO endpoint that can enable live trading, and none may be added.
 */

import { Router, json } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '../core/logger.js';
import type { ApiDeps } from './server.js';

const log = createLogger('api/routes');

/** Wrap a handler so any throw becomes a 500 JSON error, never a crash. */
function safe(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    handler(req, res).catch((err) => {
      log.error('route failed', { path: req.path, error: String(err) });
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    });
  };
}

/** Build the REST router over the injected dependencies. */
export function buildRouter(deps: ApiDeps, startedAt: number): Router {
  const router = Router();
  router.use(json());

  router.get(
    '/health',
    safe(async (_req, res) => {
      const kill = await deps.killState();
      const open = await deps.openPositions();
      res.json({
        ok: true,
        killActive: kill.active,
        openPositions: open.length,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      });
    }),
  );

  router.get(
    '/positions',
    safe(async (_req, res) => {
      const [open, closed] = await Promise.all([deps.openPositions(), deps.closedPositions()]);
      res.json({ open, closed });
    }),
  );

  router.get(
    '/decisions',
    safe(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      res.json(await deps.decisions(limit));
    }),
  );

  router.get(
    '/stats',
    safe(async (_req, res) => {
      const [stats, kill] = await Promise.all([deps.dailyStats(), deps.killState()]);
      res.json({ stats: stats ?? null, kill });
    }),
  );

  router.post(
    '/kill',
    safe(async (req, res) => {
      const reason =
        typeof req.body === 'object' && req.body !== null && typeof req.body.reason === 'string'
          ? req.body.reason
          : 'manual_ui';
      log.warn('kill switch requested via API', { reason });
      await deps.activateKill(reason);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/kill/release',
    safe(async (_req, res) => {
      log.warn('kill switch release requested via API');
      await deps.releaseKill('manual_ui_release');
      res.json({ ok: true });
    }),
  );

  return router;
}
