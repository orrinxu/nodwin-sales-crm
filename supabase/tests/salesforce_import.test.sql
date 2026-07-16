-- pgTAP: Salesforce importer schema (ORR-699)
-- Verifies the legacy_salesforce_id idempotency columns + unique partial indexes
-- added by 20260715050000_salesforce_import.sql.
BEGIN;
SELECT plan(8);

-- ── Columns exist ────────────────────────────────────────────────────────────
SELECT has_column('public', 'accounts', 'legacy_salesforce_id', 'accounts has legacy_salesforce_id');
SELECT has_column('public', 'contacts', 'legacy_salesforce_id', 'contacts has legacy_salesforce_id');

-- ── Unique indexes exist ─────────────────────────────────────────────────────
SELECT has_index('public', 'accounts', 'accounts_legacy_salesforce_id_key', 'accounts legacy id is indexed');
SELECT has_index('public', 'contacts', 'contacts_legacy_salesforce_id_key', 'contacts legacy id is indexed');
SELECT has_index('public', 'opportunities', 'opportunities_legacy_salesforce_id_key', 'opportunities legacy id is indexed');

-- ── Uniqueness is actually enforced (service_role bypasses RLS) ───────────────
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$INSERT INTO public.accounts (name, legacy_salesforce_id) VALUES ('Acme', 'SF-DUP-1')$$,
  'first account with a Salesforce id inserts'
);
SELECT throws_ok(
  $$INSERT INTO public.accounts (name, legacy_salesforce_id) VALUES ('Acme Clone', 'SF-DUP-1')$$,
  '23505', NULL,
  're-importing the same Salesforce id is rejected as a duplicate'
);
-- Partial index: ordinary rows (NULL legacy id) never collide.
SELECT lives_ok(
  $$INSERT INTO public.accounts (name) VALUES ('No SF id A'), ('No SF id B')$$,
  'multiple accounts without a Salesforce id are allowed'
);

SELECT * FROM finish();
ROLLBACK;
