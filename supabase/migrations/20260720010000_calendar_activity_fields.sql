-- supabase/migrations/20260720010000_calendar_activity_fields.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-824 (data model for ORR-774: Google Calendar sync).
--
-- DECISION: meetings already live in public.activities (type='meeting'), so the
-- calendar model EXTENDS that table rather than introducing a parallel
-- calendar_events table. This migration:
--   1. adds calendar-shaped columns to public.activities (additive only — no RLS
--      change; activities is HIGH-RISK),
--   2. adds a PARTIAL UNIQUE index on activities.external_event_id — the real
--      idempotency key for calendar sync (external_thread_id is email-oriented
--      and intentionally non-unique, so it must not be reused for this),
--   3. adds a lower(email) index on public.contacts to support the
--      attendee->contact matching a later sync ticket needs (additive only —
--      contacts is HIGH-RISK, no RLS change),
--   4. creates public.google_calendar_sync_state — one row per user holding that
--      user's calendar sync cursor/status. Own-row RLS mirrors
--      google_oauth_connections (ORR-817): the background sync drain runs as the
--      service role, which bypasses RLS, so there is intentionally no
--      service_role policy.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. activities — calendar columns (additive; NO RLS change)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS starts_at         timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at           timestamptz,
  ADD COLUMN IF NOT EXISTS time_zone         text,
  ADD COLUMN IF NOT EXISTS all_day           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_event_id text;

COMMENT ON COLUMN public.activities.starts_at IS
  'Calendar event start (ORR-824). Null for non-calendar activities.';
COMMENT ON COLUMN public.activities.ends_at IS
  'Calendar event end (ORR-824). Null for non-calendar activities.';
COMMENT ON COLUMN public.activities.time_zone IS
  'IANA time zone the event was authored in (ORR-824), e.g. "Asia/Kolkata".';
COMMENT ON COLUMN public.activities.all_day IS
  'All-day calendar event flag (ORR-824).';
COMMENT ON COLUMN public.activities.external_event_id IS
  'Google Calendar event id (ORR-824). Idempotency key for calendar sync — '
  'UNIQUE when non-null. Distinct from external_thread_id (email thread id, '
  'non-unique).';

-- The idempotency key for calendar sync: at most one activity per Google event.
-- Partial so the many non-calendar activities (all NULL here) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_event_id
  ON public.activities (external_event_id)
  WHERE external_event_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. contacts — email lookup index (additive; NO RLS change)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Supports case-insensitive attendee-email -> contact matching during calendar
-- sync. contacts.email was previously unindexed.
CREATE INDEX IF NOT EXISTS idx_contacts_email
  ON public.contacts (lower(email))
  WHERE email IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. google_calendar_sync_state — per-user sync cursor + status
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.google_calendar_sync_state (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One sync-state row per user. ON DELETE CASCADE drops it with the user;
  -- UNIQUE so upsert-by-user is the write path.
  user_id       uuid        NOT NULL UNIQUE
                            REFERENCES public.users(id) ON DELETE CASCADE,
  calendar_id   text        NOT NULL DEFAULT 'primary',
  sync_enabled  boolean     NOT NULL DEFAULT false,
  -- Google incremental-sync cursor. Opaque; null before the first full sync.
  sync_token    text,
  last_sync_at  timestamptz,
  last_error    text,
  status        text        NOT NULL DEFAULT 'idle'
                            CHECK (status IN ('idle', 'syncing', 'error')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_calendar_sync_state IS
  'Per-user Google Calendar sync state (ORR-824, data model for ORR-774). One '
  'row per user (UNIQUE user_id): the incremental sync_token cursor, enable '
  'flag, last sync/error, and status. Own-row RLS; the service-role sync drain '
  'runs outside RLS.';

CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_state_user_id
  ON public.google_calendar_sync_state (user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER (mirrors set_google_oauth_connections_timestamps)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_google_calendar_sync_state_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS google_calendar_sync_state_timestamps ON public.google_calendar_sync_state;
CREATE TRIGGER google_calendar_sync_state_timestamps
  BEFORE UPDATE ON public.google_calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_google_calendar_sync_state_timestamps();

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.google_calendar_sync_state');

-- ============================================================================
-- ROW-LEVEL SECURITY — own-row only (mirrors public.google_oauth_connections)
-- ============================================================================

ALTER TABLE public.google_calendar_sync_state ENABLE ROW LEVEL SECURITY;

-- A user manages only their own calendar sync state. The background sync drain
-- runs on the service role (which bypasses RLS), so it is intentionally not
-- expressible as an RLS policy here.
CREATE POLICY google_calendar_sync_state_select_own ON public.google_calendar_sync_state
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY google_calendar_sync_state_insert_own ON public.google_calendar_sync_state
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY google_calendar_sync_state_update_own ON public.google_calendar_sync_state
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY google_calendar_sync_state_delete_own ON public.google_calendar_sync_state
  FOR DELETE USING (user_id = auth.uid());
