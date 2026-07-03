-- supabase/migrations/20260703320000_account_tax_ids_select_deleted_at.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS on client data).
--
-- Follow-up to 20260703310000 (ORR-622 Ticket 2), GH #149.
--
-- The account_tax_ids SELECT policy reused can_write_account, which mirrors the
-- account WRITE rule (admin OR owner OR creator) but NOT the account READ rule.
-- The parent read policy (accounts_select_scoped, see 20260618000004) also
-- requires deleted_at IS NULL, so the child SELECT diverged: an owner/creator of
-- a SOFT-DELETED account could still read that account's tax IDs even though they
-- can no longer see the account itself.
--
-- Fix: give SELECT its own helper that mirrors the READ rule exactly (adds the
-- deleted_at IS NULL guard). Writes keep mirroring the WRITE rule via
-- can_write_account (writing to a soft-deleted account's children stays
-- consistent with the accounts UPDATE policy, which likewise has no deleted_at
-- guard — that is a separate concern, out of scope here).
--
-- Idempotent: safe to re-run.

-- ── Account-read helper (mirrors accounts_select_scoped incl. deleted_at) ─────
-- SECURITY DEFINER so it reads accounts regardless of RLS, applying the same
-- rule as accounts_select_scoped explicitly. Pinned to auth.uid(), so it can
-- only ever reveal whether the CURRENT user may read the given account.
CREATE OR REPLACE FUNCTION public.can_read_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = _account_id
        AND a.deleted_at IS NULL
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION public.can_read_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_read_account(uuid) TO authenticated;

-- ── Repoint the SELECT policy at the read helper ─────────────────────────────
DROP POLICY IF EXISTS "account_tax_ids_select_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_select_via_account"
  ON public.account_tax_ids FOR SELECT TO authenticated
  USING (public.can_read_account(account_id));
