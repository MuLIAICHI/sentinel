'use client';

/**
 * Password gate for the deployed dashboard. On mount it probes the API: if the
 * server requires a token and we don't have a valid one, it shows a login form;
 * otherwise it renders the dashboard. Locally (API has no token) the probe
 * returns 'ok' immediately and the gate is invisible.
 */

import { useEffect, useState } from 'react';
import { probeAuth } from '../lib/useStream.js';
import { setToken } from '../lib/auth.js';

type Phase = 'checking' | 'login' | 'ready';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    const r = await probeAuth();
    // 'down' still renders the dashboard — useStream shows the disconnect banner
    // and reconnects; only an explicit 401 means we need a password.
    setPhase(r === 'auth' ? 'login' : 'ready');
  }

  useEffect(() => {
    void check();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setToken(pw.trim());
    const r = await probeAuth();
    setBusy(false);
    if (r === 'ok') {
      setPhase('ready');
    } else if (r === 'auth') {
      setError('Incorrect password.');
    } else {
      setError('API unreachable — check the dashboard URL.');
    }
  }

  if (phase === 'checking') {
    return <div className="gate-screen">connecting…</div>;
  }

  if (phase === 'login') {
    return (
      <div className="gate-screen">
        <form className="gate-card" onSubmit={submit}>
          <div className="brand">
            <span className="brand-dot">◆</span>sentinel
          </div>
          <div className="gate-sub">enter dashboard password</div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="password"
            autoFocus
          />
          {error && <div className="gate-error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'checking…' : 'unlock'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
