# Deploy — 4-day paper validation on Railway

This is a **paper-mode** deployment. It never trades real money:
`LIVE_TRADING` stays `false` in `risk/guards.ts`, and the wallet private key
(`SOLANA_PRIVATE_KEY`) is **deliberately NOT set** anywhere on Railway — paper
mode never signs, so it isn't needed. Do not add it.

Two services in one Railway project, both deployed from this repo:

| Service | Root dir | What it is |
|---------|----------|------------|
| `sentinel-bot` | repo root | the pipeline + the API/websocket (listens on `$PORT`) |
| `sentinel-ui`  | `ui/`     | the Next.js dashboard |

The bot makes only **outbound** connections (PumpPortal, Helius, Anthropic,
Supabase) plus the inbound dashboard API, which is gated by `API_TOKEN`.

---

## 1. Create the project and push the code

You drive this (the repo is never pushed to a remote on your behalf). Either:

- **Railway CLI** (no git remote needed):
  ```
  npm i -g @railway/cli
  railway login
  railway init            # create the project
  railway up              # deploys the repo root → the bot service
  ```
- **or** connect the GitHub repo in the Railway dashboard (requires the repo on
  GitHub).

Then add a **second service** in the same project for the UI with root
directory `ui/`.

## 2. Bot service — environment variables

Set these on the **sentinel-bot** service. Paste secret VALUES yourself; they
are listed here by NAME only.

**Secrets (same values as your local `~/.sentinel-env`):**
```
DATABASE_URL=…            # Supabase Postgres connection string
PUMPPORTAL_WS_URL=…
PUMPPORTAL_API_KEY=…
HELIUS_API_KEY=…
SOLANA_RPC_URL=…          # keyed Helius RPC endpoint
ANTHROPIC_API_KEY=…
```
**Deploy / network:**
```
API_HOST=0.0.0.0          # bind publicly inside the container (default is 127.0.0.1)
API_TOKEN=<long-random>   # dashboard password — REQUIRED before exposing publicly
DASHBOARD_ORIGIN=https://<your-ui-service>.up.railway.app   # CORS allowlist
```
> `PORT` is injected by Railway automatically — do **not** set it.
> Do **NOT** set `SOLANA_PRIVATE_KEY`.

**Validation thresholds (the "moderate" loosen, so the run actually trades):**
```
FILTER_CURVE_MIN=40
FILTER_CURVE_MAX=92
FILTER_TOP10_MAX=40
FILTER_DEV_SOLD_MAX=70
# FILTER_MIN_AGE_SEC left unset → stays 1200 (20 min)
```
To return to the strict live strategy later, just **delete these five** vars —
the code defaults back to the SPEC values (55–85 / 25% / 50%).

After setting vars, **Generate Domain** on the bot service so the API has a
public URL. Confirm `https://<bot>.up.railway.app/health` returns
`{"ok":true,...}` (health is the only unauthenticated route).

## 3. UI service — environment variables

Set on the **sentinel-ui** service (root dir `ui/`):
```
NEXT_PUBLIC_API_BASE=https://<your-bot-service>.up.railway.app
```
Railway builds it with `next build` and serves with `next start` on `$PORT`.
Generate a domain for it too — that public URL is your dashboard.

## 4. Open the dashboard

Visit the UI domain. It will prompt for the **dashboard password** — that's the
`API_TOKEN` value. After unlocking, the feed, funnel, tokenomics, and kill
switch work against the live bot.

---

## Notes

- **Keep your Mac out of it.** Once this is on Railway, stop the local PM2/tsx
  instance so two bots don't double-write to the same Supabase tables.
- **Cost:** the free pre-filter keeps Helius/Anthropic spend small; the moderate
  loosen will increase enrichments and Claude decisions somewhat — watch the
  `enriched`/`buys` counters the first day.
- **Going live later is a separate, manual step** you take by hand: edit
  `LIVE_TRADING` in `risk/guards.ts`, wire the runtime confirmation flag, and
  only then provision `SOLANA_PRIVATE_KEY` on the signer. No deploy here does any
  of that.
