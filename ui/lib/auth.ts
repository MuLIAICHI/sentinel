'use client';

/**
 * Dashboard auth: a shared token kept in localStorage. The deployed API requires
 * it (it guards the kill switch); locally the API has no token and these become
 * no-ops. Not a high-value secret — it's the dashboard password the operator
 * types in — so localStorage is acceptable.
 */

const KEY = 'sentinel_token';

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY) ?? '';
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

/** Header to attach to authenticated REST calls (empty when no token set). */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { 'x-api-token': t } : {};
}

/** Query suffix carrying the token on the websocket URL (empty when unset). */
export function wsTokenQuery(): string {
  const t = getToken();
  return t ? `?token=${encodeURIComponent(t)}` : '';
}
