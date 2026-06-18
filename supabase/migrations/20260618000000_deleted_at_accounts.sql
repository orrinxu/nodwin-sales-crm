-- supabase/migrations/20260618000000_deleted_at_accounts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-471: Add deleted_at column to accounts table for soft-delete support.
--
-- Changes:
--   1. Add nullable deleted_at timestamptz column.
--   2. Add partial index on deleted_at (non-null) for efficient deletion queries.
--   3. Update SELECT RLS policy so non-admins cannot see soft-deleted accounts.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Add deleted_at column
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Partial index for finding soft-deleted records
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at
  ON public.accounts(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Update SELECT RLS policy — exclude soft-deleted rows from non-admins
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "accounts_select_scoped" ON public.accounts;
CREATE POLICY "accounts_select_scoped"
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      deleted_at IS NULL
      AND (
        account_owner_user_id = auth.uid()
        OR created_by = auth.uid()
      )
    )
  );
