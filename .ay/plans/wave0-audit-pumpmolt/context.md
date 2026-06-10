# Context: wave0-audit-pumpmolt

- SPEC §7.1: "Audit pumpmolt (clone, read src/, grep every outbound URL, confirm
  the key never leaves the signer, npm audit). I'll do this review with you before
  it goes anywhere near a wallet."
- SPEC §0.2 / CLAUDE.md hard rule: only `execution/signer.ts` ever reads the
  private key. pumpmolt is the library wave2-execution's live.ts will wrap — so
  pumpmolt's own key handling must meet the same bar.
- pumpmolt is a PumpPortal **local-signing** client: the design claim is that keys
  sign locally and only signed transactions leave the machine. The audit's job is
  to verify that claim in the actual code, not trust the README.
- Consumer of the verdict: wave2-execution (BACKLOG until this is DONE + approved),
  whose Gate 1 sign-off will reference this report.
- Nothing in the sentinel repo is touched except creating docs/audits/.
