-- supabase/migrations/20260506000003_deadletter_message_id.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Adds message_id to inbound_email_deadletter so the inbound email pipeline
-- can record the original email's Message-ID header for tracing and
-- deduplication (ORR-288 / T-010b).
--
-- Idempotent: safe to re-run.

-- ── Add message_id column ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inbound_email_deadletter'
      AND column_name = 'message_id'
  ) THEN
    ALTER TABLE public.inbound_email_deadletter
      ADD COLUMN message_id text;
  END IF;
END;
$$;

-- ── Index for message_id lookups ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deadletter_message_id
  ON public.inbound_email_deadletter(message_id)
  WHERE message_id IS NOT NULL;
