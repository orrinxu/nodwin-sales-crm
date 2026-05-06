-- supabase/seed/seed-test-data.sql
-- Seed data for local development and test fixtures.
-- Run via: supabase db seed  (or supabase db reset --seed)
--
-- Currencies are seeded in migration 20260505000002_currencies.sql.
-- This file seeds entities and business_units for the Nodwin Group.
--
-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE).

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENTITIES — Nodwin Group legal entities
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.entities (id, name, legal_name, country, base_currency, fiscal_year_start_month, active, custom_data)
VALUES
  ('e1111111-1111-1111-1111-111111111111',
   'NG India',
   'Nodwin Gaming Sports Private Limited',
   'IN',
   'INR',
   4,
   true,
   '{"timezone":"Asia/Kolkata","region":"APAC","test":"entity_seed_01"}'::jsonb),

  ('e2222222-2222-2222-2222-222222222222',
   'NG Singapore',
   'Nodwin Gaming Pte Ltd',
   'SG',
   'SGD',
   4,
   true,
   '{"timezone":"Asia/Singapore","region":"APAC","test":"entity_seed_02"}'::jsonb),

  ('e3333333-3333-3333-3333-333333333333',
   'NG Dubai',
   'Nodwin Gaming FZ-LLC',
   'AE',
   'AED',
   1,
   true,
   '{"timezone":"Asia/Dubai","region":"MENA","test":"entity_seed_03"}'::jsonb),

  ('e4444444-4444-4444-4444-444444444444',
   'NG US',
   'Nodwin Gaming US Inc',
   'US',
   'USD',
   1,
   true,
   '{"timezone":"America/New_York","region":"AMER","test":"entity_seed_04"}'::jsonb),

  ('e5555555-5555-5555-5555-555555555555',
   'NG Europe',
   'Nodwin Gaming Europe GmbH',
   'DE',
   'EUR',
   1,
   true,
   '{"timezone":"Europe/Berlin","region":"EMEA","test":"entity_seed_05"}'::jsonb),

  ('e6666666-6666-6666-6666-666666666666',
   'NG Inactive',
   'Nodwin Gaming Inactive Entity',
   'US',
   'USD',
   1,
   false,
   '{"test":"entity_seed_inactive"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name           = EXCLUDED.name,
  legal_name     = EXCLUDED.legal_name,
  country        = EXCLUDED.country,
  base_currency  = EXCLUDED.base_currency,
  active         = EXCLUDED.active,
  custom_data    = EXCLUDED.custom_data;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BUSINESS UNITS — per-entity sales, ops, and revenue recognition units
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.business_units (id, name, entity_id, kind, parent_id, manager_user_id, active, custom_data)
VALUES
  -- India
  ('b1111111-1111-1111-1111-111111111111',
   'India Sales',
   'e1111111-1111-1111-1111-111111111111',
   'sales',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_india_sales"}'::jsonb),

  ('b1111111-2222-1111-1111-111111111111',
   'India Ops',
   'e1111111-1111-1111-1111-111111111111',
   'ops',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_india_ops"}'::jsonb),

  ('b1111111-3333-1111-1111-111111111111',
   'India Revenue Recognition',
   'e1111111-1111-1111-1111-111111111111',
   'revenue_recognition',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_india_revrec"}'::jsonb),

  -- Singapore
  ('b2222222-1111-2222-2222-222222222222',
   'Singapore Sales',
   'e2222222-2222-2222-2222-222222222222',
   'sales',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_sg_sales"}'::jsonb),

  ('b2222222-2222-2222-2222-222222222222',
   'Singapore Ops',
   'e2222222-2222-2222-2222-222222222222',
   'ops',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_sg_ops"}'::jsonb),

  -- Dubai
  ('b3333333-1111-3333-3333-333333333333',
   'Dubai Sales',
   'e3333333-3333-3333-3333-333333333333',
   'sales',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_dubai_sales"}'::jsonb),

  ('b3333333-2222-3333-3333-333333333333',
   'Dubai Revenue Recognition',
   'e3333333-3333-3333-3333-333333333333',
   'revenue_recognition',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_dubai_revrec"}'::jsonb),

  -- US
  ('b4444444-1111-4444-4444-444444444444',
   'US Sales',
   'e4444444-4444-4444-4444-444444444444',
   'sales',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_us_sales"}'::jsonb),

  ('b4444444-2222-4444-4444-444444444444',
   'US Shared Services',
   'e4444444-4444-4444-4444-444444444444',
   'shared',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_us_shared"}'::jsonb),

  -- Europe
  ('b5555555-1111-5555-5555-555555555555',
   'Europe Sales',
   'e5555555-5555-5555-5555-555555555555',
   'sales',
   NULL,
   NULL,
   true,
   '{"test":"bu_seed_europe_sales"}'::jsonb),

  -- Inactive business unit
  ('b6666666-1111-6666-6666-666666666666',
   'Inactive BU',
   'e1111111-1111-1111-1111-111111111111',
   'sales',
   NULL,
   NULL,
   false,
   '{"test":"bu_seed_inactive"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  entity_id  = EXCLUDED.entity_id,
  kind       = EXCLUDED.kind,
  parent_id  = EXCLUDED.parent_id,
  active     = EXCLUDED.active,
  custom_data = EXCLUDED.custom_data;
