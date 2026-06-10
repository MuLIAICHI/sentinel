# Task: Wave 0 — Audit pumpmolt

## Dependencies

None — can run in parallel with Wave 1. This task is READY.

**Human-in-the-loop:** the spec (§7.1) says the human reviews this audit with the
agent before pumpmolt goes anywhere near a wallet. The deliverable is a report, not
code. Final approval is the human's.

## Files to Create

- `docs/audits/pumpmolt-audit.md` — the audit report

## Implementation

1. Clone `https://github.com/PlaydaDev/pumpmolt` into a scratch directory **outside
   this repo** (e.g. `/tmp/pumpmolt-audit`). Do not vendor it yet.
2. Read all of `src/`. Map every code path the private key touches.
3. Grep every outbound URL / network call. List each one with what data it sends.
4. Confirm the key never leaves the signing path — flag ANY logging, telemetry,
   serialization, or transmission of key material or derived secrets.
5. Run `npm audit` on its dependency tree; record findings.
6. Check dependency hygiene: typosquat-looking packages, install scripts, anything
   that fetches code at runtime.
7. Write `docs/audits/pumpmolt-audit.md`: outbound-call inventory, key-handling
   verdict, dependency findings, and a clear SAFE / UNSAFE / SAFE-WITH-CHANGES
   recommendation.

## Verification

- [ ] Report exists with the outbound-call inventory (every URL accounted for)
- [ ] Explicit verdict on key handling with file/line references
- [ ] `npm audit` output summarized with severity counts
- [ ] **Human has read the report and signed off** (record in DECISIONS.md)

## Unblocks

- `.ay/tasks/wave2-execution.md` (the live-adapter portion is blocked until this is DONE + approved)

Update BOARD.md when marking this DONE.
