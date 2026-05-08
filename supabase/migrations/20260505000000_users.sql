-- supabase/migrations/0004_users.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the public.users table linked to Supabase auth.users.
-- Includes crm_inbound_email generation via trigger.
-- (ORR-188 / T-020)
--
-- NOTE: Foreign-key constraints to entities (primary_entity_id) and
-- business_units (primary_business_unit_id) are deferred to T-019;
-- those tables do not yet exist.  The columns are nullable and
-- unconstrained so that T-020 can ship independently.

-- ── Enum: user_role ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM (
      'sales_rep',
      'sales_manager',
      'regional_head',
      'group_sales_lead',
      'finance',
      'ops',
      'admin',
      'exec',
      'external_partner'
    );
  END IF;
END;
$$;

-- ── Table: public.users ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                    text        NOT NULL UNIQUE,
  full_name                text,
  primary_role             public.user_role NOT NULL DEFAULT 'sales_rep',
  primary_entity_id        uuid,                 -- FK deferred to T-019
  primary_business_unit_id uuid,                 -- FK deferred to T-019
  manager_user_id          uuid REFERENCES public.users(id),
  crm_inbound_email        text UNIQUE,
  ai_daily_soft_cap_usd    numeric(10,2),
  ai_daily_hard_cap_usd    numeric(10,2),
  active                   boolean     NOT NULL DEFAULT true,
  custom_data              jsonb       NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Index for fast inbound-email lookup (used by inbound email pipeline).
CREATE INDEX IF NOT EXISTS idx_users_crm_inbound_email
  ON public.users(crm_inbound_email);

-- Index for entity-based visibility queries.
CREATE INDEX IF NOT EXISTS idx_users_primary_entity_id
  ON public.users(primary_entity_id)
  WHERE primary_entity_id IS NOT NULL;

-- ── Trigger: generate crm_inbound_email on insert ─────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_user_crm_inbound_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  _token text;
  _email text;
BEGIN
  LOOP
    _token := encode(extensions.gen_random_bytes(6), 'hex');
    _email := _token || '@crm.nodwin.com';
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE crm_inbound_email = _email) THEN
      EXIT;
    END IF;
  END LOOP;

  NEW.crm_inbound_email := _email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_crm_inbound_email_trigger ON public.users;
CREATE TRIGGER generate_crm_inbound_email_trigger
  BEFORE INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.crm_inbound_email IS NULL)
  EXECUTE FUNCTION public.generate_user_crm_inbound_email();

-- ── Trigger: prevent non-admins from escalating role or changing manager ──────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid;
BEGIN
  _current_user_id := auth.uid();

  -- Allow system/backend contexts (no JWT) to change anything.
  IF _current_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow admins to change anything.
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _current_user_id AND primary_role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.primary_role IS DISTINCT FROM OLD.primary_role THEN
    RAISE EXCEPTION 'Only admins can change primary_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id THEN
    RAISE EXCEPTION 'Only admins can change manager_user_id'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.users;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ── Trigger: sync auth.users INSERT into public.users ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ── Audit log ─────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.users');

-- ── RLS helper functions (SECURITY DEFINER to avoid infinite recursion) ───────
CREATE OR REPLACE FUNCTION public.current_user_entity_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT primary_entity_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT primary_role FROM public.users WHERE id = auth.uid();
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop-and-recreate for idempotency.
DROP POLICY IF EXISTS "users_select_self_and_same_entity" ON public.users;
CREATE POLICY "users_select_self_and_same_entity"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      primary_entity_id IS NOT NULL
      AND primary_entity_id = public.current_user_entity_id()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "admins_update_all" ON public.users;
CREATE POLICY "admins_update_all"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admins_insert" ON public.users;
CREATE POLICY "admins_insert"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admins_delete" ON public.users;
CREATE POLICY "admins_delete"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
