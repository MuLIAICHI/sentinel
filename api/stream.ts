/**
 * Websocket stream: snapshot-on-connect, then every BotEvent forwarded
 * verbatim. The snapshot lets the UI hydrate instantly; the event stream
 * keeps it live. Dead clients are dropped silently — a UI tab closing must
 * never affect the pipeline.
 */

import type { WebSocket, WebSocketServer } from 'ws';
import { createLogger } from '../core/logger.js';
import type { ApiDeps } from './server.js';

const log = createLogger('api/stream');

/** Wire the websocket server to the bus and the snapshot sources. */
export function attachStream(wss: WebSocketServer, deps: ApiDeps): void {
  // One bus subscription total; fan out to whoever is connected.
  deps.bus.onAny((event) => {
    if (wss.clients.size === 0) return;
    const frame = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(frame, (err) => {
          if (err) client.terminate();
        });
      }
    }
  });

  wss.on('connection', (socket: WebSocket) => {
    log.info('ws client connected', { clients: wss.clients.size });
    void sendSnapshot(socket, deps);
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      log.info('ws client disconnected', { clients: wss.clients.size });
    });
  });
}

async function sendSnapshot(socket: WebSocket, deps: ApiDeps): Promise<void> {
  try {
    const [open, closed, decisions, stats, kill] = await Promise.all([
      deps.openPositions(),
      deps.closedPositions(50),
      deps.decisions(100),
      deps.dailyStats(),
      deps.killState(),
    ]);
    socket.send(
      JSON.stringify({
        type: 'snapshot',
        payload: { open, closed, decisions, stats: stats ?? null, kill },
      }),
    );
  } catch (err) {
    log.error('snapshot failed', { error: String(err) });
    socket.send(JSON.stringify({ type: 'snapshot_error', payload: {} }));
  }
}
