# pumpmolt Security Audit

| | |
|---|---|
| **Repository** | https://github.com/PlaydaDev/pumpmolt |
| **Audited commit** | `7119de434cfae38fbb5a1f2579c2b36d8aa9a6b1` (2026-01-31, "Add $POLT token burn skill with Token-2022 support") |
| **Audit date** | 2026-06-10 |
| **Auditor** | foundation agent (AY swarm), for human sign-off |
| **Method** | Full source read (7 files, ~1,190 LOC), systematic network-call grep, `npm install --ignore-scripts` + `npm audit`. No pumpmolt code was executed; no key material was involved. |
| **Verdict** | **SAFE-WITH-CHANGES** — see §5 |

The package is actually named `pump-fun-skill` — a MoltBot skill wrapping PumpPortal's
Local Transaction API, with library exports (`buyTokens`, `sellTokens`, `launchToken`,
`burnTokens`), a CLI, and Docker packaging. We would use only the library trade path.

## 1. Key handling — VERIFIED LOCAL, with one integration caveat

The full lifecycle of key material:

1. **Entry:** `src/config.ts:18` — `process.env.SOLANA_PRIVATE_KEY`, required, throws a
   clear error if missing. Read fresh on each `getConfig()` call.
2. **Construction:** `src/utils.ts:18-27` — `bs58.decode` → `Keypair.fromSecretKey`.
3. **Use:** `src/utils.ts:40-69` `signAndSendTransaction` — deserializes the PumpPortal
   transaction, `transaction.sign([keypair])`, submits via `connection.sendTransaction`
   to the **configured RPC only**. Same pattern in `launch.ts:201-210` (signs with
   creator + mint keypairs) and `burn.ts:152-161` (locally built tx).
4. **Egress: none.** The key and keypair never appear in any fetch body, log statement,
   or serialization. The only key-derived value transmitted is
   `keypair.publicKey.toBase58()` (`trade.ts:104`, `launch.ts:163`) — the public key,
   by design. All `console.log` calls were checked: they print mints, amounts,
   signatures, ATAs — never key material.

**Caveat (drives the verdict):** the key is read *inside* the library
(`getConfig()` called from `executeTrade` at `trade.ts:75`). Our hard rule says **only
`execution/signer.ts` ever reads the private key** — wrapping pumpmolt as an npm
dependency would put a second reader in the process. See §5, change 1.

## 2. Outbound network inventory — complete

| Endpoint | Where | Trigger | Data sent |
|---|---|---|---|
| `https://pumpportal.fun/api/trade-local` | config.ts:36; trade.ts:51; launch.ts:183 | every buy/sell/create | public key, action, mint, amount, slippage, priorityFee, pool — **no secrets** |
| Configured Solana RPC (default `api.mainnet-beta.solana.com`, config.ts:13) | utils.ts:34,58; burn.ts; launch.ts | tx submit + chain reads | signed transactions, queries |
| `https://pump.fun/api/ipfs` | config.ts:37; launch.ts:117 | **token launch only** | token metadata + image |
| User-supplied image URL | launch.ts:87 | launch with `imageUrl` only | GET fetch |

`solscan.io` / `pump.fun/<mint>` strings are display-only URLs, never fetched.
No telemetry, no analytics, no other endpoints. The Dockerfile clones
`github.com/moltbot/moltbot` at build time — container-only; we will not use their
Docker packaging, CLI, or MoltBot integration.

## 3. The real risk: blind signing of server-built transactions

`signAndSendTransaction` (utils.ts:46-49) signs **whatever bytes PumpPortal returns
without inspecting the instructions**. This is inherent to the trade-local design, but
it means a compromised or malicious pumpportal.fun response could be a wallet-draining
transaction and the library would sign it. `skipPreflight: false` simulates for
*validity*, not *intent*.

Mitigations in our architecture (already hard rules): burner wallet, ~$50 hard cap,
LIVE_TRADING double-gated. Additional recommendation in §5, change 3.

## 4. Dependency review

- **Tree:** 74 packages. Runtime deps: `@solana/spl-token`, `@solana/web3.js`, `bs58`,
  `form-data`, `node-fetch`.
- **Unused declared deps:** `form-data` and `node-fetch` are imported nowhere in src/
  (launch.ts deliberately uses Node's built-in FormData/fetch — comment at
  launch.ts:68). Dead attack surface; drop them when vendoring.
- **`npm audit`: 11 vulnerabilities (8 moderate, 3 high), all in the standard Solana
  stack**, none in pumpmolt's own code:
  - HIGH `bigint-buffer` buffer overflow via `toBigIntLE()` (GHSA-3gc7-fjrx-p6mg) —
    pulled in by `@solana/spl-token` → `@solana/buffer-layout-utils`. Ecosystem-wide;
    the "fix" downgrades spl-token to 0.1.8 (not viable).
  - MODERATE: `bn.js` infinite loop, `uuid` bounds check (via web3.js → jayson),
    `ws` 8.x memory disclosure (via rpc-websockets). Same advisories appear in
    virtually every Solana JS project today.
- **Lifecycle scripts in deps:** `bigint-buffer`, `bufferutil`, `utf-8-validate` —
  standard native-build (node-gyp) modules, expected. Install was run with
  `--ignore-scripts`; nothing executed during this audit.
- No typosquat-suspicious names; no runtime code fetching (`eval`/dynamic import of
  remote code: none found).

## 5. Verdict: SAFE-WITH-CHANGES

The code does what the README claims — local signing, no key egress, minimal surface.
Conditions for use in sentinel:

1. **Vendor the trade path; do not npm-install the package.** The needed surface is
   ~200 LOC (`fetchLocalTransaction` + `executeTrade` + `signAndSendTransaction`).
   Re-implement in `execution/` with **keypair injection**: functions take a `Keypair`
   argument supplied by `signer.ts`, so the key-read stays in one file per our hard
   rule. This also sheds the CLI, launch, burn, Docker, and the unused deps.
2. **Pin what we copy to commit `7119de43`** and record provenance in a header comment.
3. **Inspect before signing:** in our adapter, after deserializing the PumpPortal tx,
   verify it before signing — at minimum: fee payer is our pubkey and the tx targets
   expected program ids; reject otherwise. Cheap insurance against §3.
4. **Always set `SOLANA_RPC_URL`** — never fall back to their public-mainnet default.
5. **Do not use `launchToken`/`burnTokens`/CLI/Docker** — out of scope for sentinel.
6. Accept the Solana-stack `npm audit` findings as ecosystem-status-quo; re-run audit
   when `@solana/web3.js` is bumped in our own lockfile.

## 6. Notes for wave2-execution

- `buyTokens(mint, amountSol, {slippage, priorityFee, pool})` /
  `sellTokens(mint, amount|'N%', ...)` → `OperationResult<TradeResult>` with
  `{signature, explorerUrl, action, mint, amount}` — shape worth keeping in our adapter.
- PumpPortal request fields (trade.ts:36-45): `publicKey, action, mint, amount,
  denominatedInSol ('true'|'false' as strings), slippage, priorityFee, pool`.
- Their `safeExecute` logs errors via `console.error` — our adapter uses `core/logger`.
