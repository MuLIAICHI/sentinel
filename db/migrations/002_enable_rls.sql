-- Close the anon-key REST path. No policies on purpose: the bot connects directly
-- as the postgres role (bypasses RLS); nothing should reach these tables via PostgREST.
ALTER TABLE public.raw_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
