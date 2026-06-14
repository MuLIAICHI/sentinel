'use client';

/**
 * The single live data source for the dashboard: one websocket to the local
 * API, hydrated by the snapshot frame and kept current by the BotEvent stream.
 * Reconnects with capped backoff; surfaces connection state so the UI can show
 * a disconnect banner when the bot is stopped.
 *
 * This hook is the ONLY network code in the UI besides the two kill POSTs below.
 * There is deliberately no endpoint here that could enable live trading.
 */

import { useEffect, useReducer, useRef } from 'react';
import { reducer, initialState, type DashState } from './reducer.js';
import type { BotEvent, DailyStats, SnapshotPayload } from './types.js';

/** Base of the local API (override via NEXT_PUBLIC_API_BASE for non-default ports). */
const HTTP_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:3001';
const WS_URL = HTTP_BASE.replace(/^http/, 'ws');

const MAX_BACKOFF_MS = 10_000;

/** Trip the kill switch via the API. Returns true on a 2xx. */
export async function postKill(reason: string): Promise<boolean> {
  const res = await fetch(`${HTTP_BASE}/kill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return res.ok;
}

/** Release the kill switch via the API. Returns true on a 2xx. */
export async function postKillRelease(): Promise<boolean> {
  const res = await fetch(`${HTTP_BASE}/kill/release`, { method: 'POST' });
  return res.ok;
}

/** Connect to the live stream and reduce it into a {@link DashState}. */
export function useStream(): { state: DashState } {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const backoffRef = useRef(500);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      dispatch({ kind: 'conn', conn: 'connecting' });
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        backoffRef.current = 500;
        dispatch({ kind: 'conn', conn: 'open' });
      };

      socket.onmessage = (ev) => {
        let msg: { type: string; payload: unknown };
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return; // ignore malformed frames
        }
        if (msg.type === 'snapshot') {
          dispatch({ kind: 'snapshot', payload: msg.payload as SnapshotPayload, now: Date.now() });
        } else if (msg.type === 'snapshot_error') {
          // hydration failed server-side; the event stream will still flow
        } else {
          dispatch({ kind: 'event', event: msg as BotEvent, now: Date.now() });
        }
      };

      socket.onclose = () => {
        dispatch({ kind: 'conn', conn: 'down' });
        if (closedRef.current) return;
        reconnectTimer = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    // The websocket snapshot only hydrates the day stats once; the live event
    // stream carries the funnel but not the server's day totals. Poll /stats so
    // the stats panel stays current instead of freezing at the connect snapshot.
    async function pollStats() {
      try {
        const res = await fetch(`${HTTP_BASE}/stats`);
        if (!res.ok) return;
        const body = (await res.json()) as { stats: DailyStats | null };
        dispatch({ kind: 'stats', stats: body.stats ?? null });
      } catch {
        // transient; the next tick retries
      }
    }
    const statsTimer = setInterval(pollStats, 4000);

    return () => {
      closedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(statsTimer);
      socket?.close();
    };
  }, []);

  return { state };
}
