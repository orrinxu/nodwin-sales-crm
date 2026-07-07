-- supabase/migrations/20260707020000_dashboard_layout.sql
--
-- Per-user customizable dashboard: store each user's widget grid layout.
--
-- A column on user_preferences (not a new table) — it is one-per-user display
-- state, exactly like the other preference columns, and inherits the table's
-- owner-only RLS + audit trigger unchanged. NULL => the default layout.
--
-- Shape: ordered jsonb array of { id, colSpan, rowSpan }. Re-validated in the app
-- layer (dashboardLayoutSchema) on read AND write — never trusted raw.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb;

COMMENT ON COLUMN public.user_preferences.dashboard_layout IS
  'Per-user dashboard widget grid layout: ordered [{id, colSpan, rowSpan}] on a '
  '12-column grid. NULL => default layout. Display-only; app-validated. Owner-only '
  'via the user_preferences RLS.';
