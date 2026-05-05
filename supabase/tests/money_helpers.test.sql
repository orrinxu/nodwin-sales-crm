-- supabase/tests/money_helpers.test.sql
-- pgTAP tests for money_helpers (ORR-129).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(14);

-- ── money_eq: matching currencies, equal amounts ──────────────────────────────

SELECT ok(
  money_eq(100.0000, 'USD', 100.0000, 'USD'),
  'money_eq returns true for equal amounts and matching currency'
);

-- ── money_eq: matching currencies, unequal amounts ───────────────────────────

SELECT ok(
  NOT money_eq(100.0000, 'USD', 200.0000, 'USD'),
  'money_eq returns false for unequal amounts and matching currency'
);

-- ── money_eq: scale-normalised equivalence ────────────────────────────────────
-- numeric(20,4) comparison: 100 = 100.0000

SELECT ok(
  money_eq(100, 'INR', 100.0000, 'INR'),
  'money_eq treats integer and decimal representations as equal'
);

-- ── money_eq: negative amounts ────────────────────────────────────────────────

SELECT ok(
  money_eq(-50.2500, 'EUR', -50.2500, 'EUR'),
  'money_eq handles negative amounts correctly'
);

-- ── money_eq: currency mismatch raises data_exception ────────────────────────

SELECT throws_ok(
  $$SELECT money_eq(100.0000, 'USD', 100.0000, 'EUR')$$,
  '22000',
  NULL,
  'money_eq raises data_exception (22000) on currency mismatch'
);

-- ── money_eq: NULL currency raises data_exception ────────────────────────────
-- NULL IS DISTINCT FROM 'USD', so mismatched NULLs throw the same error.

SELECT throws_ok(
  $$SELECT money_eq(100.0000, NULL, 100.0000, 'USD')$$,
  '22000',
  NULL,
  'money_eq raises data_exception when a_currency is NULL'
);

-- ── money_add: correct sum, matching currencies ───────────────────────────────

SELECT is(
  (money_add(100.0000, 'USD', 250.5000, 'USD')).amount,
  350.5000::numeric,
  'money_add returns correct sum for matching currencies'
);

SELECT is(
  (money_add(100.0000, 'USD', 250.5000, 'USD')).currency,
  'USD',
  'money_add preserves currency in returned money_value'
);

-- ── money_add: zero addend ────────────────────────────────────────────────────

SELECT is(
  (money_add(99.9900, 'INR', 0.0000, 'INR')).amount,
  99.9900::numeric,
  'money_add with zero addend returns original amount'
);

-- ── money_add: negative amounts ───────────────────────────────────────────────

SELECT is(
  (money_add(-30.0000, 'GBP', 30.0000, 'GBP')).amount,
  0.0000::numeric,
  'money_add with negating amounts sums to zero'
);

-- ── money_add: high-precision amounts stay at scale ──────────────────────────

SELECT is(
  (money_add(0.0001, 'USD', 0.0001, 'USD')).amount,
  0.0002::numeric,
  'money_add preserves four decimal places of precision'
);

-- ── money_add: currency mismatch raises data_exception ───────────────────────

SELECT throws_ok(
  $$SELECT money_add(100.0000, 'USD', 100.0000, 'EUR')$$,
  '22000',
  NULL,
  'money_add raises data_exception (22000) on currency mismatch'
);

-- ── money_add: NULL currency raises data_exception ───────────────────────────

SELECT throws_ok(
  $$SELECT money_add(100.0000, 'USD', 100.0000, NULL)$$,
  '22000',
  NULL,
  'money_add raises data_exception when b_currency is NULL'
);

-- ── money_value composite type exists ────────────────────────────────────────

SELECT ok(
  EXISTS (
    SELECT 1
    FROM   pg_type      t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'money_value'
  ),
  'public.money_value composite type exists'
);

SELECT * FROM finish();

ROLLBACK;
