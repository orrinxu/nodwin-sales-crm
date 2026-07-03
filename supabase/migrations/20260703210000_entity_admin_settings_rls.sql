-- supabase/migrations/20260703210000_entity_admin_settings_rls.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Two-tier admin write RLS (ORR-618), applied to the first org-settings surface:
-- reporting_currency_settings. Establishes the pattern other settings tables
-- adopt later.
--
--   Super Admin  ('admin')        — may write ANY row, including the group-wide
--                                   default (entity_id IS NULL).
--   Entity Admin ('entity_admin') — may write ONLY their own entity's row
--                                   (entity_id = current_user_entity_id(), never
--                                   the group-wide row).
--
-- Reads stay open to all authenticated (unchanged). current_user_role() and
-- current_user_entity_id() are the existing SECURITY DEFINER helpers.
--
-- Idempotent: drop-and-recreate.

-- Shared predicate as an inline expression in each policy (Postgres has no
-- policy-level function reuse); Super Admin any row, Entity Admin own entity only.

DROP POLICY IF EXISTS "reporting_currency_settings_insert_admin"
  ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_insert_admin_or_entity_admin"
  ON public.reporting_currency_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'entity_admin'
      AND entity_id IS NOT NULL
      AND entity_id = public.current_user_entity_id()
    )
  );

DROP POLICY IF EXISTS "reporting_currency_settings_update_admin"
  ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_update_admin_or_entity_admin"
  ON public.reporting_currency_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'entity_admin'
      AND entity_id IS NOT NULL
      AND entity_id = public.current_user_entity_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'entity_admin'
      AND entity_id IS NOT NULL
      AND entity_id = public.current_user_entity_id()
    )
  );

DROP POLICY IF EXISTS "reporting_currency_settings_delete_admin"
  ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_delete_admin_or_entity_admin"
  ON public.reporting_currency_settings
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'entity_admin'
      AND entity_id IS NOT NULL
      AND entity_id = public.current_user_entity_id()
    )
  );
