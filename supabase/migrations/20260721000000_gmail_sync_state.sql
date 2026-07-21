-- supabase/migrations/20260721000000_gmail_sync_state.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-830 (data model for ORR-775: Gmail sync).
--
-- DECISION: inbound/outbound emails already live in public.activities
-- (type='email_inbound' / 'email_outbound'), so the Gmail model EXTENDS that
-- table rather than introducing a parallel emails table. This mirrors the
-- calendar data model (ORR-824). This migration:
--   1. adds public.activities.external_message_id — the per-MESSAGE idempotency
--      key for Gmail sync — with a PARTIAL UNIQUE index (additive only; NO RLS
--      change — activities is HIGH-RISK). external_thread_id stays as-is
--      (Gmail thread id, intentionally non-unique for thread grouping) and must
--      not be reused as the message-level key,
--   2. creates public.google_gmail_sync_state — one row per user holding that
--      user's Gmail History-API cursor (history_id) + status. Own-row RLS
--      mirrors google_calendar_sync_state (ORR-824) / google_oauth_connections
--      (ORR-817): the background sync drain runs as the service role, which
--      bypasses RLS, so there is intentionally no service_role policy.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. activities — Gmail per-message idempotency key (additive; NO RLS change)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS external_message_id text;

COMMENT ON COLUMN public.activities.external_message_id IS
  'Gmail message id (ORR-830). Per-MESSAGE idempotency key for Gmail sync — '
  'UNIQUE when non-null. Distinct from external_thread_id (Gmail thread id, '
  'non-unique, used to group messages of a conversation).';

-- The idempotency key for Gmail sync: at most one activity per Gmail message.
-- Partial so the many non-email activities (all NULL here) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_message_id
  ON public.activities (external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. google_gmail_sync_state — per-user History-API cursor + status
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.google_gmail_sync_state (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One sync-state row per user. ON DELETE CASCADE drops it with the user;
  -- UNIQUE so upsert-by-user is the write path.
  user_id       uuid        NOT NULL UNIQUE
                            REFERENCES public.users(id) ON DELETE CASCADE,
  -- Gmail History-API cursor (historyId). Opaque; null before the first sync.
  history_id    text,
  sync_enabled  boolean     NOT NULL DEFAULT false,
  last_sync_at  timestamptz,
  last_error    text,
  status        text        NOT NULL DEFAULT 'idle'
                            CHECK (status IN ('idle', 'syncing', 'error')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_gmail_sync_state IS
  'Per-user Gmail sync state (ORR-830, data model for ORR-775). One row per '
  'user (UNIQUE user_id): the History-API history_id cursor, enable flag, last '
  'sync/error, and status. Own-row RLS; the service-role sync drain runs '
  'outside RLS.';

CREATE INDEX IF NOT EXISTS idx_google_gmail_sync_state_user_id
  ON public.google_gmail_sync_state (user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER (mirrors set_google_calendar_sync_state_timestamps)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_google_gmail_sync_state_timestamps()
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

DROP TRIGGER IF EXISTS google_gmail_sync_state_timestamps ON public.google_gmail_sync_state;
CREATE TRIGGER google_gmail_sync_state_timestamps
  BEFORE UPDATE ON public.google_gmail_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_google_gmail_sync_state_timestamps();

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.google_gmail_sync_state');

-- ============================================================================
-- ROW-LEVEL SECURITY — own-row only (mirrors public.google_calendar_sync_state)
-- ============================================================================

ALTER TABLE public.google_gmail_sync_state ENABLE ROW LEVEL SECURITY;

-- A user manages only their own Gmail sync state. The background sync drain
-- runs on the service role (which bypasses RLS), so it is intentionally not
-- expressible as an RLS policy here.
CREATE POLICY google_gmail_sync_state_select_own ON public.google_gmail_sync_state
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY google_gmail_sync_state_insert_own ON public.google_gmail_sync_state
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY google_gmail_sync_state_update_own ON public.google_gmail_sync_state
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY google_gmail_sync_state_delete_own ON public.google_gmail_sync_state
  FOR DELETE USING (user_id = auth.uid());
