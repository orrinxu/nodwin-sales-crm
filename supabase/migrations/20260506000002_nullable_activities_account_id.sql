-- supabase/migrations/20260506000002_nullable_activities_account_id.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Makes activities.account_id nullable so that inbound emails from senders with
-- no known matching account can still be recorded as activities (ORR-286).
-- The FK to accounts is preserved — it simply does not enforce on NULL values.
--
-- Idempotent: safe to re-run.

-- ── Make account_id nullable ──────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'account_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.activities ALTER COLUMN account_id DROP NOT NULL;
  END IF;
END;
$$;
