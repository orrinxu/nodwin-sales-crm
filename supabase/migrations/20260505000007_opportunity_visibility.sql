-- supabase/migrations/20260505000007_opportunity_visibility.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Combined migration for opportunity visibility materialised table and
-- opportunity schema (opportunities, opportunity_splits, opportunity_team_members).
--
-- This migration also creates minimal stub tables for entities and business_units
-- because they are referenced by the opportunities table and have not yet been
-- created by T-019.  When T-019 ships, it can extend these stubs with the full
-- column set and RLS policies.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

-- deal_stage (needed by opportunities; already exists on main but not this branch)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'deal_stage'
  ) THEN
    CREATE TYPE public.deal_stage AS ENUM (
      'qualify',
      'meet_and_present',
      'propose',
      'negotiate',
      'verbal_agreement',
      'closed_won',
      'closed_lost'
    );
  END IF;
END;
$$;

-- visibility_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'visibility_tier'
  ) THEN
    CREATE TYPE public.visibility_tier AS ENUM (
      'standard',
      'restricted',
      'confidential'
    );
  END IF;
END;
$$;

-- opportunity_team_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'opportunity_team_role'
  ) THEN
    CREATE TYPE public.opportunity_team_role AS ENUM (
      'owner',
      'contributor',
      'viewer',
      'approver'
    );
  END IF;
END;
$$;

-- project_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'project_type'
  ) THEN
    CREATE TYPE public.project_type AS ENUM (
      'ip',
      'white_label',
      'media_rights',
      'd2c_retail',
      'd2c_pins',
      'd2c_touring',
      'consulting_tech',
      'consulting_ideas',
      'talent_management',
      'pr_services',
      'other'
    );
  END IF;
END;
$$;

-- revenue_category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'revenue_category'
  ) THEN
    CREATE TYPE public.revenue_category AS ENUM (
      'live',
      'content'
    );
  END IF;
END;
$$;

-- recurring_split_kind
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'recurring_split_kind'
  ) THEN
    CREATE TYPE public.recurring_split_kind AS ENUM (
      'flat',
      'custom'
    );
  END IF;
END;
$$;

-- business_unit_kind
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'business_unit_kind'
  ) THEN
    CREATE TYPE public.business_unit_kind AS ENUM (
      'sales',
      'revenue_recognition',
      'ops',
      'shared'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. STUB TABLES (prerequisites not yet created by T-019)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Minimal entities table — T-019 will extend with full columns and RLS.
CREATE TABLE IF NOT EXISTS public.entities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  legal_name            text,
  country               text,
  base_currency         text        NOT NULL DEFAULT 'USD',
  fiscal_year_start_month int       NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  active                boolean     NOT NULL DEFAULT true,
  custom_data           jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Minimal business_units table — T-019 will extend with full columns and RLS.
CREATE TABLE IF NOT EXISTS public.business_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  entity_id       uuid REFERENCES public.entities(id),
  kind            public.business_unit_kind NOT NULL DEFAULT 'sales',
  parent_id       uuid REFERENCES public.business_units(id),
  manager_user_id uuid REFERENCES public.users(id),
  active          boolean     NOT NULL DEFAULT true,
  custom_data     jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_units_entity_id
  ON public.business_units(entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_manager_user_id
  ON public.business_units(manager_user_id)
  WHERE manager_user_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CORE OPPORTUNITY TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table: public.opportunities ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunities (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text        NOT NULL,
  account_id                  uuid        NOT NULL REFERENCES public.accounts(id),
  primary_contact_id          uuid,
  stage                       public.deal_stage NOT NULL DEFAULT 'qualify',
  probability_pct             numeric(5,2) NOT NULL DEFAULT 0,
  sales_initiator_user_id     uuid        NOT NULL REFERENCES public.users(id),
  owner_user_id               uuid        NOT NULL REFERENCES public.users(id),
  sales_unit_id               uuid        NOT NULL REFERENCES public.business_units(id),
  revenue_recognition_unit_id uuid REFERENCES public.business_units(id),
  ops_unit_id                 uuid REFERENCES public.business_units(id),
  billing_entity_id           uuid REFERENCES public.entities(id),
  amount                      numeric(20,4) NOT NULL DEFAULT 0,
  currency                    text        NOT NULL DEFAULT 'USD',
  service_period_start        date,
  service_period_end          date,
  close_date                  date,
  execution_date              date,
  estimated_gross_margin_pct  numeric(5,2),
  country_execution           text,
  project_type                public.project_type,
  revenue_category            public.revenue_category,
  recurring                   boolean     NOT NULL DEFAULT false,
  recurring_split_kind        public.recurring_split_kind,
  description                 text,
  loss_reason                 text,
  visibility_tier             public.visibility_tier NOT NULL DEFAULT 'standard',
  confidentiality_override_user_ids uuid[] NOT NULL DEFAULT '{}',
  legacy_salesforce_id        text,
  custom_data                 jsonb       NOT NULL DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_by                  uuid
);

CREATE INDEX IF NOT EXISTS idx_opportunities_account_id
  ON public.opportunities(account_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_owner_user_id
  ON public.opportunities(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_stage
  ON public.opportunities(stage);

CREATE INDEX IF NOT EXISTS idx_opportunities_sales_unit_id
  ON public.opportunities(sales_unit_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_close_date
  ON public.opportunities(close_date)
  WHERE close_date IS NOT NULL;

-- GIN index for confidentiality_override_user_ids array.
CREATE INDEX IF NOT EXISTS idx_opportunities_conf_override
  ON public.opportunities USING GIN(confidentiality_override_user_ids);

-- ── Table: public.opportunity_splits ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_splits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  sales_unit_id   uuid NOT NULL REFERENCES public.business_units(id),
  user_id         uuid REFERENCES public.users(id),
  pct             numeric(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_splits_opportunity_id
  ON public.opportunity_splits(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_splits_sales_unit_id
  ON public.opportunity_splits(sales_unit_id);

-- ── Table: public.opportunity_team_members ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_team_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id),
  role            public.opportunity_team_role NOT NULL DEFAULT 'viewer',
  added_by        uuid REFERENCES public.users(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_team_members_opportunity_id
  ON public.opportunity_team_members(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_team_members_user_id
  ON public.opportunity_team_members(user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. OPPORTUNITY VISIBILITY (MATERIALISED)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table: public.opportunity_visibility ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_visibility (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id),
  reason          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, user_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_visibility_opportunity_user
  ON public.opportunity_visibility(opportunity_id, user_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_visibility_user
  ON public.opportunity_visibility(user_id);

-- ── Function: recompute_visibility_for_opportunity ────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_opportunity(_opportunity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _visibility_tier visibility_tier;
  _owner_id uuid;
BEGIN
  -- Load opportunity metadata.
  SELECT visibility_tier, owner_user_id
    INTO _visibility_tier, _owner_id
    FROM public.opportunities
   WHERE id = _opportunity_id;

  IF _owner_id IS NULL THEN
    RETURN;
  END IF;

  -- Wipe existing visibility rows for this opportunity.
  DELETE FROM public.opportunity_visibility
   WHERE opportunity_id = _opportunity_id;

  -- Rebuild visibility based on tier rules.
  INSERT INTO public.opportunity_visibility (opportunity_id, user_id, reason)
  SELECT _opportunity_id, user_id, reason
    FROM (
      -- 1. Owner always sees the deal.
      SELECT _owner_id AS user_id, 'owner'::text AS reason

      UNION

      -- 2. Confidentiality overrides always see the deal.
      SELECT unnest(confidentiality_override_user_ids), 'confidentiality_override'
        FROM public.opportunities
       WHERE id = _opportunity_id
         AND cardinality(confidentiality_override_user_ids) > 0

      UNION

      -- 3. Team members see the deal (standard + restricted only).
      SELECT tm.user_id, 'team:' || tm.role::text
        FROM public.opportunity_team_members tm
       WHERE tm.opportunity_id = _opportunity_id
         AND _visibility_tier IN ('standard', 'restricted')

      UNION

      -- 4. Manager chain (standard tier only).
      SELECT mc.manager_user_id, 'manager_chain'
        FROM (
          WITH RECURSIVE chain AS (
            -- Anchor: owner's managers AND team members' managers.
            SELECT u.manager_user_id
              FROM public.users u
             WHERE u.id = _owner_id
               AND u.manager_user_id IS NOT NULL

            UNION

            SELECT u.manager_user_id
              FROM public.users u
              JOIN public.opportunity_team_members tm ON tm.user_id = u.id
             WHERE tm.opportunity_id = _opportunity_id
               AND u.manager_user_id IS NOT NULL

            UNION ALL

            -- Recursive: walk up the manager chain.
            SELECT u.manager_user_id
              FROM public.users u
              JOIN chain c ON u.id = c.manager_user_id
             WHERE u.manager_user_id IS NOT NULL
          )
          SELECT manager_user_id FROM chain
        ) mc
       WHERE _visibility_tier = 'standard'

      UNION

      -- 5. Split-unit managers (standard tier only).
      SELECT bu.manager_user_id, 'split_unit_manager'
        FROM public.opportunity_splits os
        JOIN public.business_units bu ON bu.id = os.sales_unit_id
       WHERE os.opportunity_id = _opportunity_id
         AND bu.manager_user_id IS NOT NULL
         AND _visibility_tier = 'standard'
    ) visibility_sources
   WHERE user_id IS NOT NULL;
END;
$$;

-- ── Function: recompute_visibility_for_user ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opp_id uuid;
BEGIN
  FOR _opp_id IN
    SELECT DISTINCT o.id
      FROM public.opportunities o
     WHERE o.owner_user_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.opportunity_team_members tm
           WHERE tm.opportunity_id = o.id AND tm.user_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.opportunity_splits os
           WHERE os.opportunity_id = o.id AND os.user_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.opportunity_splits os
           JOIN public.business_units bu ON bu.id = os.sales_unit_id
           WHERE os.opportunity_id = o.id AND bu.manager_user_id = _user_id
        )
  LOOP
    PERFORM public.recompute_visibility_for_opportunity(_opp_id);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Trigger: maintain visibility when opportunity metadata changes.
CREATE OR REPLACE FUNCTION public.trigger_recompute_opportunity_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.opportunity_visibility WHERE opportunity_id = OLD.id;
    RETURN OLD;
  ELSE
    PERFORM public.recompute_visibility_for_opportunity(NEW.id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_visibility_trigger ON public.opportunities;
CREATE TRIGGER opportunity_visibility_trigger
  AFTER INSERT OR UPDATE OF owner_user_id, visibility_tier, confidentiality_override_user_ids
  ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_opportunity_visibility();

-- Trigger: maintain visibility when team membership changes.
CREATE OR REPLACE FUNCTION public.trigger_recompute_team_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_visibility_for_opportunity(OLD.opportunity_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_visibility_for_opportunity(NEW.opportunity_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_team_visibility_trigger ON public.opportunity_team_members;
CREATE TRIGGER opportunity_team_visibility_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.opportunity_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_team_visibility();

-- Trigger: maintain visibility when splits change.
CREATE OR REPLACE FUNCTION public.trigger_recompute_splits_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_visibility_for_opportunity(OLD.opportunity_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_visibility_for_opportunity(NEW.opportunity_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_splits_visibility_trigger ON public.opportunity_splits;
CREATE TRIGGER opportunity_splits_visibility_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.opportunity_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_splits_visibility();

-- Trigger: maintain visibility when a user's manager changes.
CREATE OR REPLACE FUNCTION public.trigger_recompute_user_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id THEN
    PERFORM public.recompute_visibility_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_manager_visibility_trigger ON public.users;
CREATE TRIGGER user_manager_visibility_trigger
  AFTER UPDATE OF manager_user_id
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_user_visibility();

-- Trigger: stage transition guard.
CREATE OR REPLACE FUNCTION public.check_stage_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_stage deal_stage;
  _new_stage deal_stage;
  _old_idx int;
  _new_idx int;
  _user_role public.user_role;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  _old_stage := OLD.stage;
  _new_stage := NEW.stage;

  IF _old_stage = _new_stage THEN
    RETURN NEW;
  END IF;

  -- Map stages to ordinal positions.
  _old_idx := ARRAY_POSITION(ARRAY['qualify','meet_and_present','propose','negotiate','verbal_agreement','closed_won','closed_lost']::deal_stage[], _old_stage);
  _new_idx := ARRAY_POSITION(ARRAY['qualify','meet_and_present','propose','negotiate','verbal_agreement','closed_won','closed_lost']::deal_stage[], _new_stage);

  -- Admins can force any transition.
  BEGIN
    _user_role := public.current_user_role();
  EXCEPTION WHEN OTHERS THEN
    _user_role := NULL;
  END;

  IF _user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Terminal stages can only be exited via REOPEN (to a non-terminal stage).
  IF _old_stage IN ('closed_won', 'closed_lost') THEN
    IF _new_stage NOT IN ('qualify','meet_and_present','propose','negotiate','verbal_agreement') THEN
      RAISE EXCEPTION 'Cannot transition from % to % without admin override', _old_stage, _new_stage;
    END IF;
    RETURN NEW;
  END IF;

  -- Moving to closed_lost is always allowed from non-terminal stages.
  IF _new_stage = 'closed_lost' THEN
    RETURN NEW;
  END IF;

  -- Forward moves (including skips) are allowed.
  IF _new_idx > _old_idx THEN
    RETURN NEW;
  END IF;

  -- Backward by exactly one step is allowed (MOVE_BACKWARD).
  IF _new_idx = _old_idx - 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal stage transition from % to %', _old_stage, _new_stage;
END;
$$;

DROP TRIGGER IF EXISTS stage_transition_trigger ON public.opportunities;
CREATE TRIGGER stage_transition_trigger
  BEFORE UPDATE OF stage ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stage_transition();

-- Trigger: splits sum validation.
CREATE OR REPLACE FUNCTION public.check_opportunity_splits_sum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total numeric(5,2);
  _opp_id uuid;
BEGIN
  _opp_id := COALESCE(NEW.opportunity_id, OLD.opportunity_id);

  SELECT COALESCE(SUM(pct), 0) INTO _total
    FROM public.opportunity_splits
   WHERE opportunity_id = _opp_id;

  IF _total <> 100 THEN
    RAISE EXCEPTION 'Opportunity splits must sum to exactly 100 (current: %)', _total;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS opportunity_splits_sum_trigger ON public.opportunity_splits;
CREATE TRIGGER opportunity_splits_sum_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.opportunity_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.check_opportunity_splits_sum();

-- Trigger: set created_by / updated_by on opportunities.
CREATE OR REPLACE FUNCTION public.set_opportunity_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_audit_fields_trigger ON public.opportunities;
CREATE TRIGGER opportunity_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_opportunity_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.opportunities');
SELECT audit.attach_trigger('public.opportunity_splits');
SELECT audit.attach_trigger('public.opportunity_team_members');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_visibility ENABLE ROW LEVEL SECURITY;

-- Stub RLS on entities / business_units so they are not completely open.
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

-- ── opportunities SELECT ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunities_select_via_visibility" ON public.opportunities;
CREATE POLICY "opportunities_select_via_visibility"
  ON public.opportunities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunities.id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- ── opportunities INSERT ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunities_insert_authenticated" ON public.opportunities;
CREATE POLICY "opportunities_insert_authenticated"
  ON public.opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    OR sales_initiator_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
  );

-- ── opportunities UPDATE ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunities_update_owner_or_team_or_admin" ON public.opportunities;
CREATE POLICY "opportunities_update_owner_or_team_or_admin"
  ON public.opportunities
  FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
    OR EXISTS (
      SELECT 1 FROM public.opportunity_team_members
      WHERE opportunity_id = public.opportunities.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'contributor')
    )
  );

-- ── opportunities DELETE ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunities_delete_admin" ON public.opportunities;
CREATE POLICY "opportunities_delete_admin"
  ON public.opportunities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── opportunity_splits SELECT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunity_splits_select_via_opportunity" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_select_via_opportunity"
  ON public.opportunity_splits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_splits.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- ── opportunity_splits INSERT / UPDATE / DELETE ───────────────────────────────
DROP POLICY IF EXISTS "opportunity_splits_write_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_write_admin"
  ON public.opportunity_splits
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── opportunity_team_members SELECT ───────────────────────────────────────────
DROP POLICY IF EXISTS "opportunity_team_members_select_via_opportunity" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_select_via_opportunity"
  ON public.opportunity_team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_team_members.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- ── opportunity_team_members INSERT / UPDATE / DELETE ─────────────────────────
DROP POLICY IF EXISTS "opportunity_team_members_write_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_write_admin"
  ON public.opportunity_team_members
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── opportunity_visibility SELECT ─────────────────────────────────────────────
DROP POLICY IF EXISTS "opportunity_visibility_select_all_authenticated" ON public.opportunity_visibility;
CREATE POLICY "opportunity_visibility_select_all_authenticated"
  ON public.opportunity_visibility
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- ── stub policies for entities / business_units ───────────────────────────────
-- NOTE: T-019 will replace these stubs with fully-scoped RLS policies.
DROP POLICY IF EXISTS "entities_select_all_authenticated" ON public.entities;
CREATE POLICY "entities_select_all_authenticated"
  ON public.entities
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "business_units_select_all_authenticated" ON public.business_units;
CREATE POLICY "business_units_select_all_authenticated"
  ON public.business_units
  FOR SELECT
  TO authenticated
  USING (
    manager_user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );
