-- supabase/migrations/20260712000000_ai_feature_provider_overrides.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (touches the AI provider selection layer).
--
-- ORR-674: per-feature AI provider selection (Opportunity Generator, ticket 1/4).
--
-- Two changes, both idempotent:
--   1. Add the `opportunity_extraction` value to the ai_feature enum so the
--      extraction feature (ORR-675) can log usage into ai_usage.feature (a
--      public.ai_feature column — an insert with an unknown value would be
--      rejected by the enum).
--   2. Add ai_settings.feature_provider_overrides: a { feature -> provider } map
--      that lets an admin pin a specific provider per AI feature (e.g. route
--      opportunity_extraction to Claude) while every other feature keeps using
--      the global primary/priority chain. Reads DB-first via resolveProviderChain
--      (see lib/data/ai-providers.ts). Inherits ai_settings' admin-only RLS —
--      no new table, no new policy.
--
-- Note: ALTER TYPE ... ADD VALUE only adds the label here; it is never used in
-- SQL DDL in this file, so it is safe under the migration's transaction.

-- 1. Extend the ai_feature enum.
ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'opportunity_extraction';

-- 2. Per-feature provider override map on the singleton ai_settings row.
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS feature_provider_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_settings.feature_provider_overrides IS
  'ORR-674: { ai_feature -> provider } map. When a feature has an override and that provider is usable, resolveProviderChain moves it to the front of the fallback chain for that feature only. Non-secret; admin-managed.';
