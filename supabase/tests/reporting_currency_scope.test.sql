-- supabase/tests/reporting_currency_scope.test.sql
-- pgTAP: the group/entity scope integrity on reporting_currency_settings (ORR-616).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(4);

-- Fixtures (service role, bypass RLS). Currencies USD/INR come from the seed.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('e1111111-1111-1111-1111-111111111111', 'Test Entity A', 'USD'),
  ('e2222222-2222-2222-2222-222222222222', 'Test Entity B', 'USD')
ON CONFLICT (id) DO NOTHING;

-- 1. The first group-wide row (entity_id IS NULL) is allowed.
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES (NULL, 'USD')$$,
  'first group-wide reporting currency row allowed'
);

-- 2. A second group-wide row is rejected by the partial unique index.
SELECT throws_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES (NULL, 'INR')$$,
  '23505',
  NULL,
  'second group-wide row rejected (only one group default)'
);

-- 3. A per-entity override is allowed.
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES ('e1111111-1111-1111-1111-111111111111', 'INR')$$,
  'per-entity override allowed'
);

-- 4. A second override for the SAME entity is rejected.
SELECT throws_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES ('e1111111-1111-1111-1111-111111111111', 'USD')$$,
  '23505',
  NULL,
  'duplicate override for the same entity rejected'
);

SELECT * FROM finish();

ROLLBACK;
