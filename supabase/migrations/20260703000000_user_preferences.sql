-- supabase/migrations/20260703000000_user_preferences.sql
--
-- Per-user settings/preferences (ORR-615).
--
-- A dedicated owner-only table rather than columns on public.users, which is a
-- HIGH-RISK identity/RBAC table with a role-escalation trigger. This mirrors the
-- existing per-user preference precedent, user_notification_overrides
-- (20260619000000): user_id FK, owner-or-admin RLS, audit-fields trigger.
--
-- Preferences are DISPLAY/ENTRY only — they never mutate stored deal data.
--   display_currency        NULL => fall back to the org reporting currency (USD)
--   entry_currency_default  NULL => "match display" (pre-fills the new-deal form)
-- Transaction currency stays immutable on the opportunity.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Localization
  display_currency       text REFERENCES public.currencies(code) ON DELETE SET NULL,
  entry_currency_default text REFERENCES public.currencies(code) ON DELETE SET NULL,
  timezone               text,
  number_format          text NOT NULL DEFAULT 'international',
  date_format            text NOT NULL DEFAULT 'iso',
  -- Appearance
  theme                  text NOT NULL DEFAULT 'system',
  -- Profile
  job_title              text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  CONSTRAINT chk_user_preferences_number_format
    CHECK (number_format IN ('international', 'indian')),
  CONSTRAINT chk_user_preferences_date_format
    CHECK (date_format IN ('iso', 'us', 'international')),
  CONSTRAINT chk_user_preferences_theme
    CHECK (theme IN ('light', 'dark', 'system'))
);

COMMENT ON TABLE public.user_preferences IS
  'Per-user display/entry preferences (currency, localization, theme, job title). '
  'Owner-only. Never mutates stored deal data — display_currency drives rollup '
  'rendering via getReportingCurrency(); entry_currency_default pre-fills the '
  'new-deal amount currency. NULL display_currency => org default; NULL '
  'entry_currency_default => match display.';

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
  ON public.user_preferences(user_id);

-- ── Audit fields trigger (mirrors set_user_notification_overrides_audit_fields) ──

CREATE OR REPLACE FUNCTION public.set_user_preferences_audit_fields()
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

DROP TRIGGER IF EXISTS user_preferences_audit_fields_trigger ON public.user_preferences;
CREATE TRIGGER user_preferences_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_preferences_audit_fields();

-- ── RLS: owner-only (mirrors user_notification_overrides) ───────────────────────

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own_or_admin" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own_or_admin"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_preferences_insert_own_or_admin" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own_or_admin"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_preferences_update_own_or_admin" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own_or_admin"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_preferences_delete_own_or_admin" ON public.user_preferences;
CREATE POLICY "user_preferences_delete_own_or_admin"
  ON public.user_preferences
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );
