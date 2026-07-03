-- supabase/migrations/20260703100000_reporting_currency_scope.sql
--
-- Org-wide reporting currency: scope integrity (ORR-616, org-admin settings).
--
-- reporting_currency_settings (20260618000002) already has the right shape —
-- nullable entity_id where NULL = group-wide default, non-null = per-entity
-- override — but nothing enforced "at most one group-wide row" or "at most one
-- row per entity", and nothing consumed it (getReportingCurrency was hardcoded).
--
-- This migration standardizes the group/entity scope discriminator on this table
-- with partial unique indexes. Writes remain admin-gated by the existing RLS
-- (the entity_admin role + entity-scoped write RLS land in a separate ticket).
--
-- Idempotent: safe to re-run.

-- At most one group-wide default row (entity_id IS NULL). A plain UNIQUE(entity_id)
-- would treat NULLs as distinct and allow many group rows, so use a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reporting_currency_settings_group
  ON public.reporting_currency_settings ((entity_id IS NULL))
  WHERE entity_id IS NULL;

-- At most one override row per entity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reporting_currency_settings_entity
  ON public.reporting_currency_settings (entity_id)
  WHERE entity_id IS NOT NULL;

COMMENT ON INDEX public.uq_reporting_currency_settings_group IS
  'Enforces a single group-wide reporting currency row (entity_id IS NULL).';
COMMENT ON INDEX public.uq_reporting_currency_settings_entity IS
  'Enforces a single reporting currency override per entity.';
