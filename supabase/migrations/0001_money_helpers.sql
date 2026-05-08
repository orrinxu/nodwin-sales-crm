-- supabase/migrations/0001_money_helpers.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Money column type and helpers for Postgres (ORR-129).
--
-- Convention for all money columns in this schema:
--   amount   numeric(20,4)  — the quantity (4 decimal places, never float)
--   currency text           — ISO 4217 code, e.g. 'USD', 'INR', 'EUR'
--
-- DO NOT use float, real, double precision, or numeric without scale for
-- money.  See AGENTS.md.
--
-- Provides:
--   • Type     public.money_value  — composite (amount, currency) for
--                                    function return values and local vars
--   • Function public.money_eq()   — compare two amounts; throws on
--                                    currency mismatch
--   • Function public.money_add()  — sum two amounts; throws on
--                                    currency mismatch
--
-- Idempotent: safe to re-run.

-- ── Composite type ────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS in Postgres; wrap in a DO block to make
-- this migration idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type      t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'money_value'
  ) THEN
    CREATE TYPE public.money_value AS (
      amount   numeric(20,4),
      currency text
    );
  END IF;
END;
$$;

-- ── money_eq ──────────────────────────────────────────────────────────────────
--
-- Returns TRUE when a_amount = b_amount and currencies match.
-- Raises data_exception (SQLSTATE 22000) when currencies differ.
--
-- Example:
--   SELECT money_eq(deal.amount, deal.currency, 500.0000, 'USD');

CREATE OR REPLACE FUNCTION public.money_eq(
  a_amount   numeric,
  a_currency text,
  b_amount   numeric,
  b_currency text
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF a_currency IS DISTINCT FROM b_currency THEN
    RAISE EXCEPTION
      'money_eq: currency mismatch — cannot compare % and %',
      a_currency, b_currency
      USING ERRCODE = 'data_exception';
  END IF;
  RETURN a_amount = b_amount;
END;
$$;

-- ── money_add ─────────────────────────────────────────────────────────────────
--
-- Returns a money_value (amount, currency) representing a + b.
-- Raises data_exception (SQLSTATE 22000) when currencies differ.
--
-- Example:
--   SELECT (money_add(l1.amount, l1.currency, l2.amount, l2.currency)).amount;

CREATE OR REPLACE FUNCTION public.money_add(
  a_amount   numeric,
  a_currency text,
  b_amount   numeric,
  b_currency text
) RETURNS public.money_value
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF a_currency IS DISTINCT FROM b_currency THEN
    RAISE EXCEPTION
      'money_add: currency mismatch — cannot add % and %',
      a_currency, b_currency
      USING ERRCODE = 'data_exception';
  END IF;
  RETURN ROW(a_amount + b_amount, a_currency)::public.money_value;
END;
$$;
