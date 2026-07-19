-- ORR-800: denormalized sort keys for the Opportunities list.
--
-- The Account / Owner column sorts must order the PARENT opportunity rows. The
-- only way to order by an embedded relation in PostgREST is an `!inner` join —
-- but that inner-joins accounts / users UNDER RLS, and those SELECT policies are
-- deliberately narrow:
--
--   * accounts_select_scoped  = admin OR owner OR creator   (20260618000004)
--   * users_select_self_and_same_entity = self OR same-entity OR admin
--                                                           (20260505000000)
--
-- The opportunity_visibility model, by contrast, grants access ACROSS entities
-- (region / team / manager chain). So a caller can legitimately see an
-- opportunity whose account or owner row they cannot SELECT — and an `!inner`
-- sort would silently DROP that opportunity from the sorted+paginated result
-- (it would appear under every other sort), reintroducing the missing-rows bug
-- this ticket exists to fix.
--
-- Fix: denormalize the sortable names onto `opportunities` itself (a row the
-- caller can already read) and sort on those top-level columns. The columns are
-- kept current by:
--   1. a BEFORE INSERT/UPDATE trigger on opportunities (owner/account change);
--   2. AFTER UPDATE OF triggers on users.full_name / accounts.name (rename);
--   3. a one-time backfill below.
--
-- These are DISPLAY-INDEPENDENT: the list still renders the owner/account name
-- from the RLS-filtered embed (null → "—"), so this does not widen what names a
-- caller sees; it only defines a stable sort order. All trigger functions are
-- SECURITY DEFINER so they read the source-of-truth name regardless of the
-- writer's RLS visibility.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS owner_name   text;

COMMENT ON COLUMN public.opportunities.account_name IS
  'ORR-800: denormalized accounts.name for RLS-safe Account-column sorting. '
  'Maintained by triggers + backfill; NOT for display (use the RLS-scoped embed).';
COMMENT ON COLUMN public.opportunities.owner_name IS
  'ORR-800: denormalized users.full_name for RLS-safe Owner-column sorting. '
  'Maintained by triggers + backfill; NOT for display (use the RLS-scoped embed).';

-- Support the ORDER BY (name, id) sort path. Composite so the id tiebreaker is
-- covered by the same index.
CREATE INDEX IF NOT EXISTS idx_opportunities_account_name
  ON public.opportunities (account_name, id);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_name
  ON public.opportunities (owner_name, id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. MAINTENANCE TRIGGER ON opportunities (owner/account change)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_opportunity_sort_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- owner_user_id is NOT NULL, but the owner-default trigger (20260619000001)
  -- can populate it from auth.uid() on INSERT. Resolve it order-independently
  -- with the same COALESCE so this trigger does not rely on firing after it.
  IF TG_OP = 'INSERT'
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    SELECT u.full_name INTO NEW.owner_name
      FROM public.users u
     WHERE u.id = COALESCE(NEW.owner_user_id, auth.uid());
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    SELECT a.name INTO NEW.account_name
      FROM public.accounts a
     WHERE a.id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Name chosen so it fires AFTER opportunity_owner_default_trigger in the
-- BEFORE-trigger alphabetical order ('opportunity_o…' < 'opportunity_s…'), so
-- NEW.owner_user_id is already defaulted; the COALESCE above is a second guard.
DROP TRIGGER IF EXISTS opportunity_sort_names_trigger ON public.opportunities;
CREATE TRIGGER opportunity_sort_names_trigger
  BEFORE INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_opportunity_sort_names();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. RENAME PROPAGATION: users.full_name → opportunities.owner_name
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.propagate_user_name_to_opportunities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE public.opportunities
       SET owner_name = NEW.full_name
     WHERE owner_user_id = NEW.id
       AND owner_name IS DISTINCT FROM NEW.full_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_name_propagate_to_opps_trigger ON public.users;
CREATE TRIGGER user_name_propagate_to_opps_trigger
  AFTER UPDATE OF full_name ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_user_name_to_opportunities();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. RENAME PROPAGATION: accounts.name → opportunities.account_name
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.propagate_account_name_to_opportunities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.opportunities
       SET account_name = NEW.name
     WHERE account_id = NEW.id
       AND account_name IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_name_propagate_to_opps_trigger ON public.accounts;
CREATE TRIGGER account_name_propagate_to_opps_trigger
  AFTER UPDATE OF name ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_account_name_to_opportunities();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. BACKFILL
-- ═══════════════════════════════════════════════════════════════════════════════
-- The opportunities UPDATE below only touches account_name / owner_name, so the
-- statement-level visibility trigger (trg_opp_visibility_upd) sees no
-- owner/tier/confidentiality change and recomputes nothing.

UPDATE public.opportunities o
   SET owner_name = u.full_name
  FROM public.users u
 WHERE u.id = o.owner_user_id
   AND o.owner_name IS DISTINCT FROM u.full_name;

UPDATE public.opportunities o
   SET account_name = a.name
  FROM public.accounts a
 WHERE a.id = o.account_id
   AND o.account_name IS DISTINCT FROM a.name;
