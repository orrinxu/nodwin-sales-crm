-- supabase/seed/sandbox.sql
-- Sandbox seed data for local development and test fixtures.
-- Run via: supabase db seed  (or supabase db reset --seed)
--
-- Currencies are seeded in migration 20260505000002_currencies.sql.
-- This file seeds entities, business_units, test users, accounts,
-- and opportunities per ORR-312 / T-035.
--
-- All data is clearly fake (Acme Corp, Test Industries, etc.).
-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE / DO NOTHING).

-- ===========================================================================
-- 1. ENTITIES -- 10 Nodwin Group legal entities
-- ===========================================================================

INSERT INTO public.entities (
  id, name, legal_name, country, base_currency,
  fiscal_year_start_month, active, custom_data
) VALUES
  ('e0000001-0001-0001-0001-000000000001', 'NG India', 'Nodwin Gaming Sports Private Limited', 'IN', 'INR', 4, true, '{"timezone":"Asia/Kolkata","region":"APAC"}'::jsonb),
  ('e0000002-0002-0002-0002-000000000002', 'NG Spr', 'Nodwin Gaming Singapore Pte Ltd', 'SG', 'SGD', 4, true, '{"timezone":"Asia/Singapore","region":"APAC"}'::jsonb),
  ('e0000003-0003-0003-0003-000000000003', 'Unpause', 'Unpause Media FZ-LLC', 'AE', 'AED', 1, true, '{"timezone":"Asia/Dubai","region":"MENA"}'::jsonb),
  ('e0000004-0004-0004-0004-000000000004', 'PSH', 'PSH Events LLC', 'SA', 'SAR', 1, true, '{"timezone":"Asia/Riyadh","region":"MENA"}'::jsonb),
  ('e0000005-0005-0005-0005-000000000005', 'Trinity', 'Trinity Gaming UK Ltd', 'GB', 'GBP', 4, true, '{"timezone":"Europe/London","region":"EMEA"}'::jsonb),
  ('e0000006-0006-0006-0006-000000000006', 'AFK', 'AFK Esports (Pty) Ltd', 'ZA', 'ZAR', 3, true, '{"timezone":"Africa/Johannesburg","region":"EMEA"}'::jsonb),
  ('e0000007-0007-0007-0007-000000000007', 'Branded', 'Branded Media Inc', 'US', 'USD', 1, true, '{"timezone":"America/New_York","region":"AMER"}'::jsonb),
  ('e0000008-0008-0008-0008-000000000008', 'Nodwin Mena', 'Nodwin Gaming MENA FZ-LLC', 'AE', 'AED', 1, true, '{"timezone":"Asia/Dubai","region":"MENA"}'::jsonb),
  ('e0000009-0009-0009-0009-000000000009', 'Starladder', 'Starladder Ltd', 'CY', 'EUR', 1, true, '{"timezone":"Asia/Nicosia","region":"EMEA"}'::jsonb),
  ('e0000010-0010-0010-0010-000000000010', 'Comic Con', 'Comic Con India Pvt Ltd', 'IN', 'INR', 4, true, '{"timezone":"Asia/Kolkata","region":"APAC"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
  country = EXCLUDED.country, base_currency = EXCLUDED.base_currency,
  fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
  active = EXCLUDED.active, custom_data = EXCLUDED.custom_data;

-- ===========================================================================
-- 2. BUSINESS UNITS -- per-entity sales, ops, and revenue recognition units
-- ===========================================================================

INSERT INTO public.business_units (
  id, name, entity_id, kind, parent_id, manager_user_id, active, custom_data
) VALUES
  ('b0000001-0001-0001-0001-000000000001', 'India Sales', 'e0000001-0001-0001-0001-000000000001', 'sales', NULL, NULL, true, '{"test":"bu_india_sales"}'::jsonb),
  ('b0010002-0002-0002-0002-000000000002', 'India Ops', 'e0000001-0001-0001-0001-000000000001', 'ops', NULL, NULL, true, '{"test":"bu_india_ops"}'::jsonb),
  ('b0010003-0003-0003-0003-000000000003', 'India RevRec', 'e0000001-0001-0001-0001-000000000001', 'revenue_recognition', NULL, NULL, true, '{"test":"bu_india_revrec"}'::jsonb),
  ('b0020001-0001-0001-0001-000000000001', 'NG Spr Sales', 'e0000002-0002-0002-0002-000000000002', 'sales', NULL, NULL, true, '{"test":"bu_spr_sales"}'::jsonb),
  ('b0020002-0002-0002-0002-000000000002', 'NG Spr RevRec', 'e0000002-0002-0002-0002-000000000002', 'revenue_recognition', NULL, NULL, true, '{"test":"bu_spr_revrec"}'::jsonb),
  ('b00000e1-00e1-00e1-00e1-00e100e100e1', 'East Asia', 'e0000001-0001-0001-0001-000000000001', 'sales', NULL, NULL, true, '{"test":"bu_east_asia"}'::jsonb),
  ('b00000e2-00e2-00e2-00e2-00e200e200e2', 'East Asia Ops', 'e0000001-0001-0001-0001-000000000001', 'ops', NULL, NULL, true, '{"test":"bu_east_asia_ops"}'::jsonb),
  ('b00000b1-00b1-00b1-00b1-00b100b100b1', 'Trimax', 'e0000007-0007-0007-0007-000000000007', 'sales', NULL, NULL, true, '{"test":"bu_trimax"}'::jsonb),
  ('b00000a1-00a1-00a1-00a1-00a100a100a1', 'Sages', 'e0000005-0005-0005-0005-000000000005', 'sales', NULL, NULL, true, '{"test":"bu_sages"}'::jsonb),
  ('b0030001-0001-0001-0001-000000000001', 'Unpause Sales', 'e0000003-0003-0003-0003-000000000003', 'sales', NULL, NULL, true, '{"test":"bu_unpause_sales"}'::jsonb),
  ('b0040001-0001-0001-0001-000000000001', 'PSH Sales', 'e0000004-0004-0004-0004-000000000004', 'sales', NULL, NULL, true, '{"test":"bu_psh_sales"}'::jsonb),
  ('b0070001-0001-0001-0001-000000000001', 'Branded Sales', 'e0000007-0007-0007-0007-000000000007', 'sales', NULL, NULL, true, '{"test":"bu_branded_sales"}'::jsonb),
  ('b0080001-0001-0001-0001-000000000001', 'MENA Sales', 'e0000008-0008-0008-0008-000000000008', 'sales', NULL, NULL, true, '{"test":"bu_mena_sales"}'::jsonb),
  ('b0090001-0001-0001-0001-000000000001', 'Starladder Sales', 'e0000009-0009-0009-0009-000000000009', 'sales', NULL, NULL, true, '{"test":"bu_starladder_sales"}'::jsonb),
  ('b0100001-0001-0001-0001-000000000001', 'Comic Con Sales', 'e0000010-0010-0010-0010-000000000010', 'sales', NULL, NULL, true, '{"test":"bu_comiccon_sales"}'::jsonb),
  ('b00000ff-00ff-00ff-00ff-00ff00ff00ff', 'Inactive BU', 'e0000001-0001-0001-0001-000000000001', 'sales', NULL, NULL, false, '{"test":"bu_inactive"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, entity_id = EXCLUDED.entity_id,
  kind = EXCLUDED.kind, parent_id = EXCLUDED.parent_id,
  manager_user_id = EXCLUDED.manager_user_id,
  active = EXCLUDED.active, custom_data = EXCLUDED.custom_data;

-- ===========================================================================
-- 3. TEST USERS -- 5 fake users with realistic role distribution
-- ===========================================================================

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('a0000001-0001-0001-0001-000000000001', 'alice.admin@nodwin-test.example', '{"full_name":"Alice Admin"}'::jsonb),
  ('a0000002-0002-0002-0002-000000000002', 'bob.manager@nodwin-test.example', '{"full_name":"Bob Manager"}'::jsonb),
  ('a0000003-0003-0003-0003-000000000003', 'charlie.rep@nodwin-test.example', '{"full_name":"Charlie Rep"}'::jsonb),
  ('a0000004-0004-0004-0004-000000000004', 'diana.rep@nodwin-test.example', '{"full_name":"Diana Rep"}'::jsonb),
  ('a0000005-0005-0005-0005-000000000005', 'eva.finance@nodwin-test.example', '{"full_name":"Eva Finance"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users to set roles, entities, BUs, and manager chain.
INSERT INTO public.users (
  id, email, full_name, primary_role,
  primary_entity_id, primary_business_unit_id, manager_user_id
) VALUES
  ('a0000001-0001-0001-0001-000000000001', 'alice.admin@nodwin-test.example', 'Alice Admin', 'admin', 'e0000001-0001-0001-0001-000000000001', 'b0000001-0001-0001-0001-000000000001', NULL),
  ('a0000002-0002-0002-0002-000000000002', 'bob.manager@nodwin-test.example', 'Bob Manager', 'sales_manager', 'e0000001-0001-0001-0001-000000000001', 'b0000001-0001-0001-0001-000000000001', 'a0000001-0001-0001-0001-000000000001'),
  ('a0000003-0003-0003-0003-000000000003', 'charlie.rep@nodwin-test.example', 'Charlie Rep', 'sales_rep', 'e0000001-0001-0001-0001-000000000001', 'b0000001-0001-0001-0001-000000000001', 'a0000002-0002-0002-0002-000000000002'),
  ('a0000004-0004-0004-0004-000000000004', 'diana.rep@nodwin-test.example', 'Diana Rep', 'sales_rep', 'e0000002-0002-0002-0002-000000000002', 'b0020001-0001-0001-0001-000000000001', 'a0000002-0002-0002-0002-000000000002'),
  ('a0000005-0005-0005-0005-000000000005', 'eva.finance@nodwin-test.example', 'Eva Finance', 'finance', 'e0000001-0001-0001-0001-000000000001', 'b0010003-0003-0003-0003-000000000003', 'a0000001-0001-0001-0001-000000000001')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, full_name = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id,
  primary_business_unit_id = EXCLUDED.primary_business_unit_id,
  manager_user_id = EXCLUDED.manager_user_id;

-- ===========================================================================
-- 4. ACCOUNTS -- 10 fake test accounts
-- ===========================================================================

INSERT INTO public.accounts (
  id, name, legal_name, website, country, industry,
  description, account_owner_user_id, custom_data
) VALUES
  ('c0000001-0001-0001-0001-000000000001', 'Acme Corp', 'Acme Corporation', 'https://acme-test.example', 'IN', 'media', 'Fake seed account.', 'a0000003-0003-0003-0003-000000000003', '{"test":"seed_account_01"}'::jsonb),
  ('c0000002-0002-0002-0002-000000000002', 'Test Industries LLC', 'Test Industries LLC', 'https://testindustries-test.example', 'US', 'technology', 'Fake seed account.', 'a0000004-0004-0004-0004-000000000004', '{"test":"seed_account_02"}'::jsonb),
  ('c0000003-0003-0003-0003-000000000003', 'Beta Gaming Ltd', 'Beta Gaming Holdings Ltd', 'https://betagaming-test.example', 'SG', 'gaming', 'Fake seed account.', 'a0000003-0003-0003-0003-000000000003', '{"test":"seed_account_03"}'::jsonb),
  ('c0000004-0004-0004-0004-000000000004', 'Gamma Media Group', 'Gamma Media Group SA', 'https://gammamedia-test.example', 'AE', 'media', 'Fake seed account.', 'a0000002-0002-0002-0002-000000000002', '{"test":"seed_account_04"}'::jsonb),
  ('c0000005-0005-0005-0005-000000000005', 'Delta Entertainment', 'Delta Entertainment Pvt Ltd', 'https://deltaent-test.example', 'IN', 'entertainment', 'Fake seed account.', 'a0000003-0003-0003-0003-000000000003', '{"test":"seed_account_05"}'::jsonb),
  ('c0000006-0006-0006-0006-000000000006', 'Epsilon Esports', 'Epsilon Esports Inc', 'https://epsilon-test.example', 'US', 'gaming', 'Fake seed account.', 'a0000004-0004-0004-0004-000000000004', '{"test":"seed_account_06"}'::jsonb),
  ('c0000007-0007-0007-0007-000000000007', 'Zeta Productions', 'Zeta Productions Ltd', 'https://zetaprod-test.example', 'GB', 'media', 'Fake seed account.', 'a0000002-0002-0002-0002-000000000002', '{"test":"seed_account_07"}'::jsonb),
  ('c0000008-0008-0008-0008-000000000008', 'Eta Digital Solutions', 'Eta Digital Solutions GmbH', 'https://etadigital-test.example', 'DE', 'technology', 'Fake seed account.', 'a0000004-0004-0004-0004-000000000004', '{"test":"seed_account_08"}'::jsonb),
  ('c0000009-0009-0009-0009-000000000009', 'Theta Broadcasting Inc', 'Theta Broadcasting Corporation', 'https://theta-test.example', 'ZA', 'media', 'Fake seed account.', 'a0000002-0002-0002-0002-000000000002', '{"test":"seed_account_09"}'::jsonb),
  ('c0000010-0010-0010-0010-000000000010', 'Iota Interactive Media', 'Iota Interactive Media FZ-LLC', 'https://iota-test.example', 'AE', 'media', 'Fake seed account.', 'a0000003-0003-0003-0003-000000000003', '{"test":"seed_account_10"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
  website = EXCLUDED.website, country = EXCLUDED.country,
  industry = EXCLUDED.industry, description = EXCLUDED.description,
  account_owner_user_id = EXCLUDED.account_owner_user_id,
  custom_data = EXCLUDED.custom_data;

-- ===========================================================================
-- 5. OPPORTUNITIES -- 30 fake opportunities at various stages
-- ===========================================================================

INSERT INTO public.opportunities (
  id, name, account_id, stage, probability_pct,
  sales_initiator_user_id, owner_user_id, sales_unit_id,
  billing_entity_id, amount, currency,
  service_period_start, service_period_end, close_date,
  project_type, revenue_category, recurring, description,
  visibility_tier, custom_data
) VALUES
  ('d0000001-0001-0001-0001-000000000001', 'Q1 Enterprise Deal - Acme', 'c0000001-0001-0001-0001-000000000001', 'qualify', 10,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 150000.0000, 'USD',
   '2026-07-01', '2026-12-31', '2026-05-31',
   'ip', 'live', false,
   'Fake seed opportunity - Q1 Enterprise Deal - Acme.',
   'standard', '{"test":"seed_opp_01"}'::jsonb),
  ('d0000002-0002-0002-0002-000000000002', 'Spring Campaign - Test Industries', 'c0000002-0002-0002-0002-000000000002', 'qualify', 10,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 85000.0000, 'SGD',
   '2026-06-01', '2026-08-31', '2026-05-15',
   'white_label', 'content', false,
   'Fake seed opportunity - Spring Campaign - Test Industries.',
   'standard', '{"test":"seed_opp_02"}'::jsonb),
  ('d0000003-0003-0003-0003-000000000003', 'Beta Gaming Tournament Sponsorship', 'c0000003-0003-0003-0003-000000000003', 'qualify', 10,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b00000e1-00e1-00e1-00e1-00e100e100e1',
   'e0000001-0001-0001-0001-000000000001', 200000.0000, 'USD',
   '2026-08-01', '2026-10-31', '2026-06-30',
   'media_rights', 'live', false,
   'Fake seed opportunity - Beta Gaming Tournament Sponsorship.',
   'standard', '{"test":"seed_opp_03"}'::jsonb),
  ('d0000004-0004-0004-0004-000000000004', 'Gamma Media Fest 2026', 'c0000004-0004-0004-0004-000000000004', 'qualify', 10,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b0030001-0001-0001-0001-000000000001',
   'e0000003-0003-0003-0003-000000000003', 300000.0000, 'AED',
   '2026-10-01', '2026-10-15', '2026-07-31',
   'ip', 'live', false,
   'Fake seed opportunity - Gamma Media Fest 2026.',
   'standard', '{"test":"seed_opp_04"}'::jsonb),
  ('d0000005-0005-0005-0005-000000000005', 'Delta Entertainment Brand Deal', 'c0000005-0005-0005-0005-000000000005', 'qualify', 10,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 95000.0000, 'INR',
   '2026-06-15', '2026-09-15', '2026-05-20',
   'd2c_retail', 'content', false,
   'Fake seed opportunity - Delta Entertainment Brand Deal.',
   'standard', '{"test":"seed_opp_05"}'::jsonb),
  ('d0000006-0006-0006-0006-000000000006', 'Epsilon Esports League Partnership', 'c0000006-0006-0006-0006-000000000006', 'qualify', 15,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0070001-0001-0001-0001-000000000001',
   'e0000007-0007-0007-0007-000000000007', 175000.0000, 'USD',
   '2026-09-01', '2027-03-31', '2026-08-01',
   'ip', 'live', true,
   'Fake seed opportunity - Epsilon Esports League Partnership.',
   'standard', '{"test":"seed_opp_06"}'::jsonb),
  ('d0000007-0007-0007-0007-000000000007', 'Zeta Productions Series A', 'c0000007-0007-0007-0007-000000000007', 'qualify', 10,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b00000a1-00a1-00a1-00a1-00a100a100a1',
   'e0000005-0005-0005-0005-000000000005', 120000.0000, 'GBP',
   '2026-07-01', '2026-11-30', '2026-06-15',
   'consulting_tech', 'content', false,
   'Fake seed opportunity - Zeta Productions Series A.',
   'standard', '{"test":"seed_opp_07"}'::jsonb),
  ('d0000008-0008-0008-0008-000000000008', 'Eta Digital Platform Migration', 'c0000008-0008-0008-0008-000000000008', 'qualify', 10,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 65000.0000, 'EUR',
   '2026-08-15', '2026-12-15', '2026-07-01',
   'consulting_tech', 'content', false,
   'Fake seed opportunity - Eta Digital Platform Migration.',
   'standard', '{"test":"seed_opp_08"}'::jsonb),
  ('d0000009-0009-0009-0009-000000000009', 'Acme Corp Annual Summit', 'c0000001-0001-0001-0001-000000000001', 'meet_and_present', 25,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 250000.0000, 'USD',
   '2026-09-01', '2026-09-15', '2026-07-15',
   'ip', 'live', false,
   'Fake seed opportunity - Acme Corp Annual Summit.',
   'standard', '{"test":"seed_opp_09"}'::jsonb),
  ('d0010000-0000-0000-0000-000000000000', 'Test Industries Product Launch', 'c0000002-0002-0002-0002-000000000002', 'meet_and_present', 30,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 110000.0000, 'SGD',
   '2026-08-01', '2026-08-15', '2026-06-15',
   'd2c_pins', 'content', false,
   'Fake seed opportunity - Test Industries Product Launch.',
   'standard', '{"test":"seed_opp_10"}'::jsonb),
  ('d0010001-0001-0001-0001-000000000001', 'Beta Gaming Seasonal Pass', 'c0000003-0003-0003-0003-000000000003', 'meet_and_present', 20,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b00000e1-00e1-00e1-00e1-00e100e100e1',
   'e0000001-0001-0001-0001-000000000001', 145000.0000, 'USD',
   '2026-10-01', '2027-03-31', '2026-08-30',
   'media_rights', 'live', false,
   'Fake seed opportunity - Beta Gaming Seasonal Pass.',
   'standard', '{"test":"seed_opp_11"}'::jsonb),
  ('d0010002-0002-0002-0002-000000000002', 'Gamma Ramadan Campaign', 'c0000004-0004-0004-0004-000000000004', 'meet_and_present', 25,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b0030001-0001-0001-0001-000000000001',
   'e0000003-0003-0003-0003-000000000003', 225000.0000, 'AED',
   '2027-03-01', '2027-04-15', '2026-12-15',
   'ip', 'live', false,
   'Fake seed opportunity - Gamma Ramadan Campaign.',
   'standard', '{"test":"seed_opp_12"}'::jsonb),
  ('d0010003-0003-0003-0003-000000000003', 'Delta Entertainment Studio Deal', 'c0000005-0005-0005-0005-000000000005', 'meet_and_present', 35,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 420000.0000, 'INR',
   '2026-07-01', '2027-06-30', '2026-06-01',
   'd2c_retail', 'content', true,
   'Fake seed opportunity - Delta Entertainment Studio Deal.',
   'standard', '{"test":"seed_opp_13"}'::jsonb),
  ('d0010004-0004-0004-0004-000000000004', 'Epsilon Esports Merch Deal', 'c0000006-0006-0006-0006-000000000006', 'propose', 40,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0070001-0001-0001-0001-000000000001',
   'e0000007-0007-0007-0007-000000000007', 198000.0000, 'USD',
   '2026-11-01', '2027-04-30', '2026-09-15',
   'd2c_pins', 'content', false,
   'Fake seed opportunity - Epsilon Esports Merch Deal.',
   'standard', '{"test":"seed_opp_14"}'::jsonb),
  ('d0010005-0005-0005-0005-000000000005', 'Zeta Productions Studio B', 'c0000007-0007-0007-0007-000000000007', 'propose', 45,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b00000a1-00a1-00a1-00a1-00a100a100a1',
   'e0000005-0005-0005-0005-000000000005', 185000.0000, 'GBP',
   '2026-09-01', '2027-02-28', '2026-07-01',
   'ip', 'live', false,
   'Fake seed opportunity - Zeta Productions Studio B.',
   'standard', '{"test":"seed_opp_15"}'::jsonb),
  ('d0010006-0006-0006-0006-000000000006', 'Acme Corp Influencer Programme', 'c0000001-0001-0001-0001-000000000001', 'propose', 50,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 75000.0000, 'USD',
   '2026-08-01', '2026-11-30', '2026-06-30',
   'talent_management', 'content', false,
   'Fake seed opportunity - Acme Corp Influencer Programme.',
   'standard', '{"test":"seed_opp_16"}'::jsonb),
  ('d0010007-0007-0007-0007-000000000007', 'Iota Interactive Digital Campaign', 'c0000010-0010-0010-0010-000000000010', 'propose', 40,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0030001-0001-0001-0001-000000000001',
   'e0000003-0003-0003-0003-000000000003', 135000.0000, 'AED',
   '2026-09-01', '2026-12-31', '2026-07-15',
   'white_label', 'content', false,
   'Fake seed opportunity - Iota Interactive Digital Campaign.',
   'standard', '{"test":"seed_opp_17"}'::jsonb),
  ('d0010008-0008-0008-0008-000000000008', 'Theta Broadcasting Rights Package', 'c0000009-0009-0009-0009-000000000009', 'propose', 50,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b0080001-0001-0001-0001-000000000001',
   'e0000008-0008-0008-0008-000000000008', 275000.0000, 'AED',
   '2027-01-01', '2027-12-31', '2026-10-01',
   'media_rights', 'live', true,
   'Fake seed opportunity - Theta Broadcasting Rights Package.',
   'standard', '{"test":"seed_opp_18"}'::jsonb),
  ('d0010009-0009-0009-0009-000000000009', 'Epsilon Esports Content Hub', 'c0000006-0006-0006-0006-000000000006', 'negotiate', 60,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0070001-0001-0001-0001-000000000001',
   'e0000007-0007-0007-0007-000000000007', 320000.0000, 'USD',
   '2026-10-01', '2027-06-30', '2026-08-15',
   'ip', 'live', false,
   'Fake seed opportunity - Epsilon Esports Content Hub.',
   'standard', '{"test":"seed_opp_19"}'::jsonb),
  ('d0020000-0000-0000-0000-000000000000', 'Beta Gaming Season 3', 'c0000003-0003-0003-0003-000000000003', 'negotiate', 55,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b00000e1-00e1-00e1-00e1-00e100e100e1',
   'e0000001-0001-0001-0001-000000000001', 390000.0000, 'USD',
   '2027-01-01', '2027-06-30', '2026-09-30',
   'media_rights', 'live', false,
   'Fake seed opportunity - Beta Gaming Season 3.',
   'standard', '{"test":"seed_opp_20"}'::jsonb),
  ('d0020001-0001-0001-0001-000000000001', 'Acme Corp Global Tour', 'c0000001-0001-0001-0001-000000000001', 'negotiate', 65,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 500000.0000, 'USD',
   '2027-03-01', '2027-09-30', '2026-12-01',
   'd2c_touring', 'live', false,
   'Fake seed opportunity - Acme Corp Global Tour.',
   'standard', '{"test":"seed_opp_21"}'::jsonb),
  ('d0020002-0002-0002-0002-000000000002', 'Test Industries H2 Roadmap', 'c0000002-0002-0002-0002-000000000002', 'negotiate', 60,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 165000.0000, 'SGD',
   '2026-10-01', '2027-03-31', '2026-08-30',
   'consulting_tech', 'content', false,
   'Fake seed opportunity - Test Industries H2 Roadmap.',
   'standard', '{"test":"seed_opp_22"}'::jsonb),
  ('d0020003-0003-0003-0003-000000000003', 'Delta Entertainment Festival Series', 'c0000005-0005-0005-0005-000000000005', 'verbal_agreement', 80,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 680000.0000, 'INR',
   '2026-11-01', '2027-02-28', '2026-09-01',
   'ip', 'live', false,
   'Fake seed opportunity - Delta Entertainment Festival Series.',
   'standard', '{"test":"seed_opp_23"}'::jsonb),
  ('d0020004-0004-0004-0004-000000000004', 'Zeta Productions Live Stream Deal', 'c0000007-0007-0007-0007-000000000007', 'verbal_agreement', 85,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b00000a1-00a1-00a1-00a1-00a100a100a1',
   'e0000005-0005-0005-0005-000000000005', 240000.0000, 'GBP',
   '2026-09-15', '2027-03-15', '2026-08-01',
   'media_rights', 'live', false,
   'Fake seed opportunity - Zeta Productions Live Stream Deal.',
   'standard', '{"test":"seed_opp_24"}'::jsonb),
  ('d0020005-0005-0005-0005-000000000005', 'Iota Interactive MEA Expansion', 'c0000010-0010-0010-0010-000000000010', 'verbal_agreement', 90,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0080001-0001-0001-0001-000000000001',
   'e0000008-0008-0008-0008-000000000008', 450000.0000, 'AED',
   '2027-01-01', '2027-12-31', '2026-10-31',
   'ip', 'live', true,
   'Fake seed opportunity - Iota Interactive MEA Expansion.',
   'standard', '{"test":"seed_opp_25"}'::jsonb),
  ('d0020006-0006-0006-0006-000000000006', 'Acme Corp Legacy Deal', 'c0000001-0001-0001-0001-000000000001', 'closed_won', 100,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b0000001-0001-0001-0001-000000000001',
   'e0000001-0001-0001-0001-000000000001', 98000.0000, 'USD',
   '2026-01-01', '2026-06-30', '2025-12-15',
   'ip', 'live', false,
   'Fake seed opportunity - Acme Corp Legacy Deal.',
   'standard', '{"test":"seed_opp_26"}'::jsonb),
  ('d0020007-0007-0007-0007-000000000007', 'Beta Gaming Q1 Campaign', 'c0000003-0003-0003-0003-000000000003', 'closed_won', 100,
   'a0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'b00000e1-00e1-00e1-00e1-00e100e100e1',
   'e0000001-0001-0001-0001-000000000001', 215000.0000, 'USD',
   '2026-02-01', '2026-05-31', '2026-01-15',
   'white_label', 'content', false,
   'Fake seed opportunity - Beta Gaming Q1 Campaign.',
   'standard', '{"test":"seed_opp_27"}'::jsonb),
  ('d0020008-0008-0008-0008-000000000008', 'Test Industries Partnership 2025', 'c0000002-0002-0002-0002-000000000002', 'closed_won', 100,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 295000.0000, 'SGD',
   '2025-09-01', '2026-03-31', '2025-08-01',
   'ip', 'live', false,
   'Fake seed opportunity - Test Industries Partnership 2025.',
   'standard', '{"test":"seed_opp_28"}'::jsonb),
  ('d0020009-0009-0009-0009-000000000009', 'Gamma Media Rejected Proposal', 'c0000004-0004-0004-0004-000000000004', 'closed_lost', 0,
   'a0000002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'b0030001-0001-0001-0001-000000000001',
   'e0000003-0003-0003-0003-000000000003', 500000.0000, 'AED',
   '2026-03-01', '2026-06-30', '2026-02-15',
   'ip', 'live', false,
   'Fake seed opportunity - Gamma Media Rejected Proposal.',
   'standard', '{"test":"seed_opp_29"}'::jsonb),
  ('d0030000-0000-0000-0000-000000000000', 'Eta Digital Budget Cut', 'c0000008-0008-0008-0008-000000000008', 'closed_lost', 0,
   'a0000004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'b0020001-0001-0001-0001-000000000001',
   'e0000002-0002-0002-0002-000000000002', 45000.0000, 'EUR',
   '2026-05-01', '2026-08-31', '2026-04-15',
   'consulting_tech', 'content', false,
   'Fake seed opportunity - Eta Digital Budget Cut.',
   'standard', '{"test":"seed_opp_30"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, account_id = EXCLUDED.account_id,
  stage = EXCLUDED.stage, probability_pct = EXCLUDED.probability_pct,
  sales_initiator_user_id = EXCLUDED.sales_initiator_user_id,
  owner_user_id = EXCLUDED.owner_user_id,
  sales_unit_id = EXCLUDED.sales_unit_id,
  billing_entity_id = EXCLUDED.billing_entity_id,
  amount = EXCLUDED.amount, currency = EXCLUDED.currency,
  service_period_start = EXCLUDED.service_period_start,
  service_period_end = EXCLUDED.service_period_end,
  close_date = EXCLUDED.close_date,
  project_type = EXCLUDED.project_type,
  revenue_category = EXCLUDED.revenue_category,
  recurring = EXCLUDED.recurring,
  description = EXCLUDED.description,
  visibility_tier = EXCLUDED.visibility_tier,
  custom_data = EXCLUDED.custom_data;

-- ===========================================================================
-- 6. OPPORTUNITY TEAM MEMBERS - owner as team member for visibility
-- ===========================================================================

INSERT INTO public.opportunity_team_members (
  id, opportunity_id, user_id, role
) VALUES
  ('f0000001-0001-0001-0001-000000000001', 'd0000001-0001-0001-0001-000000000001', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000002-0002-0002-0002-000000000002', 'd0000002-0002-0002-0002-000000000002', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000003-0003-0003-0003-000000000003', 'd0000003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000004-0004-0004-0004-000000000004', 'd0000004-0004-0004-0004-000000000004', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000005-0005-0005-0005-000000000005', 'd0000005-0005-0005-0005-000000000005', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000006-0006-0006-0006-000000000006', 'd0000006-0006-0006-0006-000000000006', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000007-0007-0007-0007-000000000007', 'd0000007-0007-0007-0007-000000000007', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000008-0008-0008-0008-000000000008', 'd0000008-0008-0008-0008-000000000008', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000009-0009-0009-0009-000000000009', 'd0000009-0009-0009-0009-000000000009', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000010-0010-0010-0010-000000000010', 'd0010000-0000-0000-0000-000000000000', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000011-0011-0011-0011-000000000011', 'd0010001-0001-0001-0001-000000000001', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000012-0012-0012-0012-000000000012', 'd0010002-0002-0002-0002-000000000002', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000013-0013-0013-0013-000000000013', 'd0010003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000014-0014-0014-0014-000000000014', 'd0010004-0004-0004-0004-000000000004', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000015-0015-0015-0015-000000000015', 'd0010005-0005-0005-0005-000000000005', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000016-0016-0016-0016-000000000016', 'd0010006-0006-0006-0006-000000000006', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000017-0017-0017-0017-000000000017', 'd0010007-0007-0007-0007-000000000007', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000018-0018-0018-0018-000000000018', 'd0010008-0008-0008-0008-000000000008', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000019-0019-0019-0019-000000000019', 'd0010009-0009-0009-0009-000000000009', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000020-0020-0020-0020-000000000020', 'd0020000-0000-0000-0000-000000000000', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000021-0021-0021-0021-000000000021', 'd0020001-0001-0001-0001-000000000001', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000022-0022-0022-0022-000000000022', 'd0020002-0002-0002-0002-000000000002', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000023-0023-0023-0023-000000000023', 'd0020003-0003-0003-0003-000000000003', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000024-0024-0024-0024-000000000024', 'd0020004-0004-0004-0004-000000000004', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000025-0025-0025-0025-000000000025', 'd0020005-0005-0005-0005-000000000005', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000026-0026-0026-0026-000000000026', 'd0020006-0006-0006-0006-000000000006', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000027-0027-0027-0027-000000000027', 'd0020007-0007-0007-0007-000000000007', 'a0000003-0003-0003-0003-000000000003', 'owner'),
  ('f0000028-0028-0028-0028-000000000028', 'd0020008-0008-0008-0008-000000000008', 'a0000004-0004-0004-0004-000000000004', 'owner'),
  ('f0000029-0029-0029-0029-000000000029', 'd0020009-0009-0009-0009-000000000009', 'a0000002-0002-0002-0002-000000000002', 'owner'),
  ('f0000030-0030-0030-0030-000000000030', 'd0030000-0000-0000-0000-000000000000', 'a0000004-0004-0004-0004-000000000004', 'owner')
ON CONFLICT (id) DO UPDATE SET
  opportunity_id = EXCLUDED.opportunity_id,
  user_id = EXCLUDED.user_id,
  role = EXCLUDED.role;
