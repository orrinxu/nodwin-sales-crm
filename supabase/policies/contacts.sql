-- supabase/policies/contacts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.contacts and public.contact_account_links tables.
-- These are also embedded in 0006_contacts.sql so the migration is self-contained.
-- This file exists for security-review readability.

-- ── contacts ───────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_scoped" ON public.contacts;
CREATE POLICY "contacts_select_scoped"
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "contacts_insert_admin" ON public.contacts;
CREATE POLICY "contacts_insert_admin"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "contacts_update_admin" ON public.contacts;
CREATE POLICY "contacts_update_admin"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "contacts_delete_admin" ON public.contacts;
CREATE POLICY "contacts_delete_admin"
  ON public.contacts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── contact_account_links ──────────────────────────────────────────────────────
ALTER TABLE public.contact_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_account_links_select_scoped" ON public.contact_account_links;
CREATE POLICY "contact_account_links_select_scoped"
  ON public.contact_account_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE id = contact_account_links.contact_id
        AND (owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "contact_account_links_insert_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_insert_admin"
  ON public.contact_account_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "contact_account_links_update_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_update_admin"
  ON public.contact_account_links
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "contact_account_links_delete_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_delete_admin"
  ON public.contact_account_links
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
