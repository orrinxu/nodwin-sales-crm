-- supabase/migrations/20260505000001_accounts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the accounts and account_relationships tables per data model.
-- Includes RLS policies and audit log triggers.
-- (ORR-189 / T-021)
--
-- Idempotent: safe to re-run.

-- ── Enum: account_relationship_kind ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'account_relationship_kind'
  ) THEN
    CREATE TYPE public.account_relationship_kind AS ENUM (
      'subsidiary_of',
      'procurement_via',
      'partner_with',
      'parent_of',
      'sister_company'
    );
  END IF;
END;
$$;

-- ── Table: public.accounts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  legal_name            text,
  website               text,
  country               text,
  industry              text,
  description           text,
  account_owner_user_id uuid REFERENCES public.users(id),
  email_domains         text[],
  custom_data           jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid
);

-- Indexes for common query patterns.
CREATE INDEX IF NOT EXISTS idx_accounts_name
  ON public.accounts(name);

CREATE INDEX IF NOT EXISTS idx_accounts_account_owner_user_id
  ON public.accounts(account_owner_user_id)
  WHERE account_owner_user_id IS NOT NULL;

-- GIN index for email_domains array (used by inbound email matching).
CREATE INDEX IF NOT EXISTS idx_accounts_email_domains
  ON public.accounts USING GIN(email_domains);

-- ── Table: public.account_relationships ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_relationships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  to_account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind            public.account_relationship_kind NOT NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate relationships of the same kind between the same pair.
  UNIQUE (from_account_id, to_account_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_account_relationships_from_account_id
  ON public.account_relationships(from_account_id);

CREATE INDEX IF NOT EXISTS idx_account_relationships_to_account_id
  ON public.account_relationships(to_account_id);

-- ── Trigger: set created_by / updated_by ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_account_audit_fields()
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

DROP TRIGGER IF EXISTS account_audit_fields_trigger ON public.accounts;
CREATE TRIGGER account_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_account_audit_fields();

-- ── Audit log ─────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.accounts');
SELECT audit.attach_trigger('public.account_relationships');

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_relationships ENABLE ROW LEVEL SECURITY;

-- Accounts: scoped read (owner, creator, or admin).
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

-- Accounts: only admins can insert.
DROP POLICY IF EXISTS "accounts_insert_admin" ON public.accounts;
CREATE POLICY "accounts_insert_admin"
  ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Accounts: only admins can update.
DROP POLICY IF EXISTS "accounts_update_admin" ON public.accounts;
CREATE POLICY "accounts_update_admin"
  ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Accounts: only admins can delete.
DROP POLICY IF EXISTS "accounts_delete_admin" ON public.accounts;
CREATE POLICY "accounts_delete_admin"
  ON public.accounts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Account relationships: scoped read (user can see at least one linked account, or admin).
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

-- Account relationships: only admins can insert.
DROP POLICY IF EXISTS "account_relationships_insert_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_insert_admin"
  ON public.account_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Account relationships: only admins can update.
DROP POLICY IF EXISTS "account_relationships_update_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_update_admin"
  ON public.account_relationships
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Account relationships: only admins can delete.
DROP POLICY IF EXISTS "account_relationships_delete_admin" ON public.account_relationships;
CREATE POLICY "account_relationships_delete_admin"
  ON public.account_relationships
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
