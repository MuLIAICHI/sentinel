# Schema: wave3-api

No DB changes, no contract changes. Wire shapes only (see api-reference.md):
- snapshot frame: {type:'snapshot', payload:{open, closed, decisions, stats, kill}}
- event frames: BotEvent passed through verbatim ({type, payload})
- error responses: {error: string} with 4xx/5xx status

DailyStats / KillState come from db/queries.ts types; Position/Decision/BotEvent
from the frozen core contracts.
