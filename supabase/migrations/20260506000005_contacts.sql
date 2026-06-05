-- supabase/migrations/20260506000003_contacts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the contacts and contact_account_links tables per data model §4.5.
-- Includes RLS policies and audit log triggers.
-- (ORR-307 / T-022)
--
-- Idempotent: safe to re-run.

-- ── Table: public.contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             text        NOT NULL,
  primary_account_id    uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  title                 text,
  email                 text,
  phone                 text,
  socials               jsonb       NOT NULL DEFAULT '{}',
  notes                 text,
  owner_user_id         uuid REFERENCES public.users(id),
  custom_data           jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid
);

-- Indexes for common query patterns.
CREATE INDEX IF NOT EXISTS idx_contacts_full_name
  ON public.contacts(full_name);

CREATE INDEX IF NOT EXISTS idx_contacts_primary_account_id
  ON public.contacts(primary_account_id)
  WHERE primary_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_owner_user_id
  ON public.contacts(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- ── Table: public.contact_account_links ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_account_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate links between the same contact and account.
  UNIQUE (contact_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_account_links_contact_id
  ON public.contact_account_links(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_account_links_account_id
  ON public.contact_account_links(account_id);

-- ── Trigger: set created_by / updated_by on contacts ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_contact_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_audit_fields_trigger ON public.contacts;
CREATE TRIGGER contact_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_audit_fields();

-- ── Audit log ─────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.contacts');
SELECT audit.attach_trigger('public.contact_account_links');

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_account_links ENABLE ROW LEVEL SECURITY;

-- Contacts: scoped read (owner, creator, or admin).
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

-- Contacts: only admins can insert.
DROP POLICY IF EXISTS "contacts_insert_admin" ON public.contacts;
CREATE POLICY "contacts_insert_admin"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Contacts: only admins can update.
DROP POLICY IF EXISTS "contacts_update_admin" ON public.contacts;
CREATE POLICY "contacts_update_admin"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Contacts: only admins can delete.
DROP POLICY IF EXISTS "contacts_delete_admin" ON public.contacts;
CREATE POLICY "contacts_delete_admin"
  ON public.contacts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Contact account links: scoped read (user can see linked contact, or admin).
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

-- Contact account links: only admins can insert.
DROP POLICY IF EXISTS "contact_account_links_insert_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_insert_admin"
  ON public.contact_account_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Contact account links: only admins can update.
DROP POLICY IF EXISTS "contact_account_links_update_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_update_admin"
  ON public.contact_account_links
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Contact account links: only admins can delete.
DROP POLICY IF EXISTS "contact_account_links_delete_admin" ON public.contact_account_links;
CREATE POLICY "contact_account_links_delete_admin"
  ON public.contact_account_links
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
