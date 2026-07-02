-- supabase/migrations/20260702120000_reps_manage_accounts_contacts.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS change on accounts/contacts).
--
-- Product change (ORR-608): sales reps can now create and edit accounts and
-- contacts, not just admins. Previously insert/update were admin-only, which
-- mismatched the UI (the create/edit forms were shown to everyone) and left
-- reps with raw 403s and phantom writes.
--
-- This mirrors how opportunities already work: a rep can INSERT a record they
-- own/created and UPDATE records they own or created; DELETE stays admin-only
-- (destructive master-data removal), matching opportunities_delete_admin.
-- account_relationships (structural hierarchy) also stays admin-only.
--
-- Anti-spoofing: the INSERT WITH CHECK requires created_by = auth.uid(). The
-- set_*_audit_fields trigger defaults created_by to auth.uid() when omitted
-- (COALESCE), so a rep just omits it and passes, but cannot attribute a row to
-- another user. On UPDATE the trigger pins created_by = OLD.created_by, so the
-- creator branch is stable.
--
-- The SELECT policies already grant visibility to owner/creator, so the
-- INSERT ... RETURNING that supabase-js issues for `.insert().select()`
-- succeeds for the creator (no repeat of the opportunities RETURNING bug).

-- ── accounts ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "accounts_insert_admin" ON public.accounts;
CREATE POLICY "accounts_insert_own_or_admin"
  ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "accounts_update_admin" ON public.accounts;
CREATE POLICY "accounts_update_own_or_admin"
  ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'admin'
    OR account_owner_user_id = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    current_user_role() = 'admin'
    OR account_owner_user_id = auth.uid()
    OR created_by = auth.uid()
  );

-- ── contacts ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts_insert_admin" ON public.contacts;
CREATE POLICY "contacts_insert_own_or_admin"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "contacts_update_admin" ON public.contacts;
CREATE POLICY "contacts_update_own_or_admin"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'admin'
    OR owner_user_id = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    current_user_role() = 'admin'
    OR owner_user_id = auth.uid()
    OR created_by = auth.uid()
  );

-- ── contact_account_links ────────────────────────────────────────────────────
-- Reps manage the account links of contacts they own/created (needed by the
-- create/edit contact form). Mirrors the existing links SELECT policy. Unlike
-- contacts themselves, link DELETE is allowed for the contact's owner/creator
-- because unlinking is part of ordinary editing (not master-data deletion).
DROP POLICY IF EXISTS "contact_account_links_insert_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_insert_own_or_admin"
  ON public.contact_account_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
        AND (c.owner_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "contact_account_links_update_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_update_own_or_admin"
  ON public.contact_account_links
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
        AND (c.owner_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  )
  WITH CHECK (
    current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
        AND (c.owner_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "contact_account_links_delete_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_delete_own_or_admin"
  ON public.contact_account_links
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
        AND (c.owner_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  );
