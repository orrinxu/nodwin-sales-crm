-- supabase/tests/opportunity_extraction_provenance.test.sql
-- pgTAP tests for public.opportunity_extraction_provenance RLS (ORR-682).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Proves the provenance table follows the same visibility rules as documents:
-- creator + deal viewers can read; admins are fenced from Confidential deals;
-- a caller can only insert rows attributed to themselves.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep',  'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep',  'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Seed the rest as service role (bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);

INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rep Account', ARRAY['rep.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- A standard-tier and a Confidential-tier opportunity, both owned by the rep.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Std Opp',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard'),
  ('00000000-0000-0000-0000-000000000009', 'Conf Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500000, 'USD', 'confidential');

INSERT INTO public.opportunity_visibility (opportunity_id, user_id, reason)
VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('00000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT (opportunity_id, user_id, reason) DO NOTHING;

-- Provenance rows created by the rep on both opportunities.
INSERT INTO public.opportunity_extraction_provenance (id, opportunity_id, feature, model, source_kind, fields, notes, created_by)
VALUES
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'opportunity_extraction', 'claude-opus-4-8', 'document', '{"name":{"status":"ok","confidence":0.9,"source":"subject","raw":"Std Opp"}}'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('f0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'opportunity_extraction', 'claude-opus-4-8', 'text',     '{}'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-111111111111');

-- ── 1. Creator/owner can read provenance on their standard opportunity ────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_extraction_provenance WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'$$,
  'creator/owner can read provenance on their opportunity'
);

-- ── 2. Unrelated rep cannot read it ───────────────────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_extraction_provenance WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'$$,
  'unrelated rep cannot read provenance for an opp they cannot see'
);

-- ── 3. Admin can read provenance on a standard opportunity ────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_extraction_provenance WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'$$,
  'admin can read provenance on a standard opportunity'
);

-- ── 4. Admin is fenced from Confidential-tier provenance ──────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_extraction_provenance WHERE opportunity_id = '00000000-0000-0000-0000-000000000009'$$,
  'admin cannot read Confidential-tier provenance (fence)'
);

-- ── 5. Authorised owner still sees their own Confidential provenance ──────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_extraction_provenance WHERE opportunity_id = '00000000-0000-0000-0000-000000000009'$$,
  'owner can read own Confidential-tier provenance'
);

-- ── 6. A user can insert provenance attributed to themselves ──────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunity_extraction_provenance (id, opportunity_id, feature, source_kind, created_by)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'opportunity_extraction', 'text', '11111111-1111-1111-1111-111111111111')$$,
  'user can insert provenance attributed to themselves'
);

-- ── 7. A user cannot insert provenance attributed to another user ─────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_extraction_provenance (id, opportunity_id, feature, source_kind, created_by)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'opportunity_extraction', 'text', '33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'user cannot insert provenance attributed to another user'
);

-- ── 8. source_kind CHECK rejects an unknown value ─────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_extraction_provenance (id, opportunity_id, feature, source_kind, created_by)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'opportunity_extraction', 'bogus', '11111111-1111-1111-1111-111111111111')$$,
  '23514',
  NULL,
  'source_kind CHECK rejects an unknown value'
);

SELECT * FROM finish();
ROLLBACK;
