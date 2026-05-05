-- supabase/policies/accounts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.accounts and public.account_relationships tables.
-- These are also embedded in 0005_accounts.sql so the migration is self-contained.
-- This file exists for security-review readability.

-- ── accounts ──────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select_all_authenticated" ON public.accounts;
CREATE POLICY "accounts_select_all_authenticated"
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING (
    account_owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "accounts_insert_admin" ON public.accounts;
CREATE POLICY "accounts_insert_admin"
  ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "accounts_update_admin" ON public.accounts;
CREATE POLICY "accounts_update_admin"
  ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "accounts_delete_admin" ON public.accounts;
CREATE POLICY "accounts_delete_admin"
  ON public.accounts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── account_relationships ─────────────────────────────────────────────────────
ALTER TABLE public.account_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_relationships_select_all_authenticated" ON public.account_relationships;
CREATE POLICY "account_relationships_select_all_authenticated"
  ON public.account_relationships
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = account_relationships.from_account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = account_relationships.to_account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "account_relationships_insert_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_insert_admin"
  ON public.account_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "account_relationships_update_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_update_admin"
  ON public.account_relationships
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "account_relationships_delete_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_delete_admin"
  ON public.account_relationships
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
