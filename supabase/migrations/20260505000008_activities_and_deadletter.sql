-- supabase/migrations/20260505000008_activities_and_deadletter.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the activities and inbound_email_deadletter tables for the inbound
-- email pipeline (ORR-191 / T-026).
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. activities
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  opportunity_id     uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type               text NOT NULL,
  external_thread_id text,
  subject            text,
  body               text,
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid
);

-- Indexes for common query patterns.
CREATE INDEX IF NOT EXISTS idx_activities_account_id
  ON public.activities(account_id);

CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id
  ON public.activities(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_user_id
  ON public.activities(user_id);

CREATE INDEX IF NOT EXISTS idx_activities_type
  ON public.activities(type);

CREATE INDEX IF NOT EXISTS idx_activities_external_thread_id
  ON public.activities(external_thread_id)
  WHERE external_thread_id IS NOT NULL;

-- Trigger: set created_by / updated_by
CREATE OR REPLACE FUNCTION public.set_activity_audit_fields()
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

DROP TRIGGER IF EXISTS activity_audit_fields_trigger ON public.activities;
CREATE TRIGGER activity_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_activity_audit_fields();

-- Audit log
SELECT audit.attach_trigger('public.activities');

-- RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Scoped SELECT: user can read if they are the activity user, own/created the
-- related account, have visibility to the related opportunity, or are admin.
DROP POLICY IF EXISTS "activities_select_all_authenticated" ON public.activities;
DROP POLICY IF EXISTS "activities_select_scoped" ON public.activities;
CREATE POLICY "activities_select_scoped"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.activities.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- Users can insert activities where they are the author; admins can insert any.
DROP POLICY IF EXISTS "activities_insert_admin" ON public.activities;
CREATE POLICY "activities_insert_author_or_admin"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Users can update their own activities; admins can update any.
DROP POLICY IF EXISTS "activities_update_admin" ON public.activities;
CREATE POLICY "activities_update_author_or_admin"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Only admins can delete activities.
DROP POLICY IF EXISTS "activities_delete_admin" ON public.activities;
CREATE POLICY "activities_delete_admin"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. inbound_email_deadletter
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inbound_email_deadletter (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  from_address  text NOT NULL,
  to_address    text NOT NULL,
  subject       text,
  body          text,
  raw_payload   jsonb NOT NULL DEFAULT '{}',
  reason        text NOT NULL,
  alert_sent    boolean NOT NULL DEFAULT false
);

-- Indexes for admin review and alerting.
CREATE INDEX IF NOT EXISTS idx_deadletter_reason
  ON public.inbound_email_deadletter(reason);

CREATE INDEX IF NOT EXISTS idx_deadletter_alert_sent
  ON public.inbound_email_deadletter(alert_sent)
  WHERE alert_sent = false;

-- Audit log
SELECT audit.attach_trigger('public.inbound_email_deadletter');

-- RLS — admin only.
ALTER TABLE public.inbound_email_deadletter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deadletter_select_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_select_admin"
  ON public.inbound_email_deadletter
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_insert_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_insert_admin"
  ON public.inbound_email_deadletter
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_update_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_update_admin"
  ON public.inbound_email_deadletter
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_delete_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_delete_admin"
  ON public.inbound_email_deadletter
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
