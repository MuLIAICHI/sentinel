# Schema: wave3-ui

No DB/contract changes. ui/lib/types.ts mirrors the wire shapes (Position,
Decision, BotEvent variants, DailyStats, KillState, SnapshotPayload) with a
source-of-truth header pointing at core/types.ts + db/queries.ts.

DashState (reducer):
```ts
{
  conn: 'connecting' | 'open' | 'down';
  kill: { active: boolean; reason: string };
  stats: DailyStats | null;            // db snapshot baseline
  live: { tokensSeen: number; cheapPass: number; cheapFail: number;
          fullPass: number; fullFail: number };   // since-connect counts
  feed: FeedItem[];                    // cap 200, newest first
  decisions: Decision[];               // cap 100
  open: PositionView[];                // Position + lastPrice + peak
  closed: Position[];                  // cap 100
  seenFilterMints: Record<string, 1>;  // 1st vs 2nd candidate_filtered sighting
}
FeedItem = { at: number } & (
  | { kind: 'reject'; mint: string; symbol?: string; stage: 'cheap'|'full'; rules: string[] }
  | { kind: 'decision'; decision: Decision }
  | { kind: 'position'; event: 'opened'|'closed'; position: Position }
  | { kind: 'kill'; active: boolean; reason: string })
```
