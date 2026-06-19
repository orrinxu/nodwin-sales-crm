-- supabase/tests/custom_fields.test.sql
-- pgTAP tests for field_definitions table, RLS policies,
-- validate_custom_data function, and entity triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(35);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@nodwin.com', 'Admin User', 'admin',     NULL),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rep@nodwin.com',   'Sales Rep',  'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET
  full_name     = EXCLUDED.full_name,
  primary_role  = EXCLUDED.primary_role;

-- Entity and business unit (needed for opportunity FK).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Test Account', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Test Opp', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'qualify', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard'
)
ON CONFLICT (id) DO NOTHING;

-- Seed a fixture field definition so SELECT RLS test has data.
INSERT INTO field_definitions (entity_type, key, label, data_type, display_order)
VALUES ('opportunity', 'fixture_field', 'Fixture Field', 'text', 0)
ON CONFLICT DO NOTHING;

-- ── 1. All authenticated users can read field_definitions ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM field_definitions WHERE key = 'fixture_field'$$,
  'rep can SELECT from field_definitions'
);

-- ── 2. Non-admin cannot insert ────────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO field_definitions (id, entity_type, key, label, data_type, options, required, default_value, visible_to_roles, editable_by_roles, visible_at_stages, display_order, active, created_at, updated_at, created_by, updated_by)
    VALUES (gen_random_uuid(), 'opportunity', 'test_field', 'Test Field', 'text', NULL, false, NULL, NULL, NULL, NULL, 0, true, now(), now(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)$$,
  '42501',
  NULL,
  'rep cannot INSERT into field_definitions'
);

-- ── 3. Admin can insert ──────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order)
    VALUES ('opportunity', 'deal_size', 'Deal Size', 'text', NULL, false, 1)$$,
  'admin can INSERT into field_definitions'
);

-- ── 4. Admin can update ──────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE field_definitions SET label = 'Deal Size Updated' WHERE key = 'deal_size'$$,
  'admin can UPDATE field_definitions'
);

-- ── 5. Non-admin cannot update ───────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$UPDATE field_definitions SET label = 'Hacked' WHERE key = 'deal_size' RETURNING id$$,
  'rep cannot UPDATE field_definitions (RLS blocks row)'
);

-- ── 6. Non-admin cannot delete ───────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$DELETE FROM field_definitions WHERE key = 'deal_size' RETURNING id$$,
  'rep cannot DELETE from field_definitions (RLS blocks row)'
);

-- ── 7. Admin can delete ──────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM field_definitions WHERE key = 'deal_size'$$,
  'admin can DELETE from field_definitions'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- validate_custom_data function tests
-- ═══════════════════════════════════════════════════════════════════════════════

-- Seed field definitions for testing.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order, active)
VALUES
  ('opportunity', 'deal_size',       'Deal Size',       'text',          NULL,                        false, 1, true),
  ('opportunity', 'expected_revenue', 'Expected Revenue', 'number',       NULL,                        false, 2, true),
  ('opportunity', 'decision_maker',   'Decision Maker',  'single_select', '["CEO","CFO","CTO","VP"]'::jsonb, false, 3, true),
  ('opportunity', 'tags',             'Tags',            'multi_select',  '["enterprise","midmarket","smb","strategic"]'::jsonb, false, 4, true),
  ('opportunity', 'old_field',        'Old Field',       'text',          NULL,                        false, 6, false),
  ('account',     'account_tier',     'Account Tier',    'single_select', '["tier1","tier2","tier3"]'::jsonb, false, 1, true);

-- ── 8. Valid text field passes ────────────────────────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"deal_size":"Enterprise"}'::jsonb),
  'text field value passes validation'
);

-- ── 9. Valid number field passes ──────────────────────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"expected_revenue":50000.00}'::jsonb),
  'number field value passes validation'
);

-- ── 10. Text value in number field fails ───────────────────────────────────────
SELECT is(
  public.validate_custom_data('opportunity', '{"expected_revenue":"fifty thousand"}'::jsonb),
  false,
  'string in number field fails validation'
);

-- ── 11. Valid single_select value passes ──────────────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"decision_maker":"CEO"}'::jsonb),
  'valid single_select value passes'
);

-- ── 12. Invalid single_select value fails ─────────────────────────────────────
SELECT is(
  public.validate_custom_data('opportunity', '{"decision_maker":"COO"}'::jsonb),
  false,
  'single_select value not in options fails'
);

-- ── 13. Valid multi_select value passes ───────────────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"tags":["enterprise","strategic"]}'::jsonb),
  'valid multi_select value passes'
);

-- ── 14. Invalid multi_select value fails ──────────────────────────────────────
SELECT is(
  public.validate_custom_data('opportunity', '{"tags":["enterprise","nonexistent"]}'::jsonb),
  false,
  'multi_select value not in options fails'
);

-- ── 15. Required field missing fails ──────────────────────────────────────────
-- Temporarily make mandatory_note required for this test.
INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order, active)
VALUES ('opportunity', 'mandatory_note', 'Mandatory Note', 'text', NULL, true, 5, true);

SELECT is(
  public.validate_custom_data('opportunity', '{"deal_size":"Enterprise"}'::jsonb),
  false,
  'missing required field fails validation'
);

-- ── 16. Required field present passes ─────────────────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"deal_size":"Enterprise","mandatory_note":"hello"}'::jsonb),
  'required field present passes validation'
);

-- Remove mandatory_note so it does not interfere with subsequent tests.
DELETE FROM field_definitions WHERE key = 'mandatory_note';

-- ── 17. Soft-deleted (inactive) field data is allowed ─────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"old_field":"legacy data"}'::jsonb),
  'inactive field data passes validation (soft-delete preserves data)'
);

-- ── 18. Unknown key without definition is allowed ─────────────────────────────
SELECT ok(
  public.validate_custom_data('opportunity', '{"unknown_field":"some value"}'::jsonb),
  'unknown key without matching definition passes (preserved data)'
);

-- ── 19. boolean type validation ───────────────────────────────────────────────
INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order, active)
VALUES ('opportunity', 'is_strategic', 'Is Strategic', 'boolean', NULL, false, 7, true);

SELECT ok(
  public.validate_custom_data('opportunity', '{"is_strategic":true}'::jsonb),
  'boolean true passes'
);
SELECT ok(
  public.validate_custom_data('opportunity', '{"is_strategic":false}'::jsonb),
  'boolean false passes'
);
SELECT is(
  public.validate_custom_data('opportunity', '{"is_strategic":"yes"}'::jsonb),
  false,
  'string in boolean field fails'
);

-- ── 20. date type validation ──────────────────────────────────────────────────
INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order, active)
VALUES ('opportunity', 'follow_up_date', 'Follow-up Date', 'date', NULL, false, 8, true);

SELECT ok(
  public.validate_custom_data('opportunity', '{"follow_up_date":"2026-06-15"}'::jsonb),
  'valid date passes'
);
SELECT is(
  public.validate_custom_data('opportunity', '{"follow_up_date":"not-a-date"}'::jsonb),
  false,
  'invalid date format fails'
);

-- ── 21. url type validation ───────────────────────────────────────────────────
INSERT INTO field_definitions (entity_type, key, label, data_type, options, required, display_order, active)
VALUES ('opportunity', 'reference_url', 'Reference URL', 'url', NULL, false, 9, true);

SELECT ok(
  public.validate_custom_data('opportunity', '{"reference_url":"https://example.com"}'::jsonb),
  'url value passes'
);
SELECT is(
  public.validate_custom_data('opportunity', '{"reference_url":42}'::jsonb),
  false,
  'number in url field fails'
);

-- ── 22. Empty custom_data with no required fields passes ──────────────────────
SELECT ok(
  public.validate_custom_data('account', '{}'::jsonb),
  'empty custom_data with no required fields passes'
);

-- ── 23. NULL custom_data passes ───────────────────────────────────────────────
SELECT ok(
  public.validate_custom_data('account', NULL::jsonb),
  'NULL custom_data passes'
);

-- ── 24. account entity type validates correctly ───────────────────────────────
SELECT ok(
  public.validate_custom_data('account', '{"account_tier":"tier1"}'::jsonb),
  'account entity validation works'
);
SELECT is(
  public.validate_custom_data('account', '{"account_tier":"tier5"}'::jsonb),
  false,
  'invalid account field fails'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger tests: validate on insert/update
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 25. Opportunity INSERT with valid custom_data succeeds ────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT lives_ok(
  $$UPDATE public.opportunities
    SET custom_data = '{"deal_size":"Enterprise","mandatory_note":"required"}'::jsonb
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'opportunity UPDATE with valid custom_data succeeds'
);

-- ── 26. Opportunity UPDATE with invalid custom_data fails ─────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$UPDATE public.opportunities
    SET custom_data = '{"expected_revenue":"not-a-number"}'::jsonb
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  '23514',
  NULL,
  'opportunity UPDATE with invalid custom_data raises check_violation'
);

-- ── 27. Account INSERT with valid custom_data succeeds ────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT lives_ok(
  $$UPDATE public.accounts
    SET custom_data = '{"account_tier":"tier1"}'::jsonb
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'account UPDATE with valid custom_data succeeds'
);

-- ── 28. Account UPDATE with invalid custom_data fails ─────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$UPDATE public.accounts
    SET custom_data = '{"account_tier":"invalid_tier"}'::jsonb
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514',
  NULL,
  'account UPDATE with invalid custom_data raises check_violation'
);

-- ── 29. Opportunity with empty custom_data succeeds ───────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
-- Clear custom_data on the test opportunity.
UPDATE public.opportunities SET custom_data = '{}'::jsonb WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SELECT lives_ok(
  $$UPDATE public.opportunities
    SET custom_data = '{}'::jsonb
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'opportunity with empty custom_data passes trigger'
);

-- ── 30. Opportunity with unknown keys but valid data passes ───────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT lives_ok(
  $$UPDATE public.opportunities
    SET custom_data = '{"old_field":"preserved","mandatory_note":"present"}'::jsonb
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'opportunity with inactive field data and required field passes trigger'
);

SELECT * FROM finish();
