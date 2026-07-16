-- supabase/migrations/20260715080000_opportunity_line_items.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS + write path on client financial data).
--
-- ORR-749 (§B of ORR-704): per-deal line items.
--
-- Each opportunity gets N line items (product × quantity × unit price, with an
-- optional per-line % discount). All amounts are in the DEAL's currency — there
-- is no per-line currency (product-catalog prices in another currency are
-- converted once, at add-time, by the UI). `line_total` is a STORED generated
-- column so §C can sum it into the deal amount without float math.
--
-- Custom (off-catalog) lines are allowed: product_id is nullable and the line
-- carries its own `description` (also kept for catalog lines so the row is stable
-- if the catalog later changes).
--
-- RLS: reads/writes track the PARENT opportunity's visibility, with the same
-- confidential fence used by opportunity_splits — the explicit-visibility branch
-- is NOT fenced (a visibility row means the user is permitted, incl. execs on a
-- confidential deal), the admin / role-scope branches ARE.
--
-- Deal-amount recomputation from these rows is ORR-750 (§C); this migration is
-- the schema + atomic write primitive only.
--
-- Idempotent: safe to re-run.

-- ── Catalog cost (per the ORR-704 cost decision: store now, derive margin later)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_cost_amount numeric(20,4) NOT NULL DEFAULT 0
    CHECK (unit_cost_amount >= 0);

COMMENT ON COLUMN public.products.unit_cost_amount IS
  'Default unit cost (deal-currency-agnostic catalog figure) used to prefill a line item unit_cost. Margin derivation is a follow-up.';

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_line_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    uuid          NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  -- NULL = custom/off-catalog line; SET NULL keeps the (self-describing) line if
  -- the catalog product is later deleted.
  product_id        uuid          REFERENCES public.products(id) ON DELETE SET NULL,
  description       text          NOT NULL,
  quantity          numeric(20,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_amount numeric(20,4) NOT NULL DEFAULT 0 CHECK (unit_price_amount >= 0),
  unit_cost_amount  numeric(20,4) NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  discount_pct      numeric(5,2)  NOT NULL DEFAULT 0
                                  CHECK (discount_pct >= 0 AND discount_pct <= 100),
  position          integer       NOT NULL DEFAULT 0,
  -- Amounts are in the parent opportunity's currency.
  line_total        numeric(20,4) GENERATED ALWAYS AS
                      (round(quantity * unit_price_amount * (1 - discount_pct / 100), 4)) STORED,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opportunity_line_items IS
  'Per-deal line items (ORR-749). Amounts are in the parent opportunity currency; line_total = qty * unit_price * (1 - discount%). Deal amount rollup is ORR-750.';

CREATE INDEX IF NOT EXISTS idx_opportunity_line_items_opportunity_id
  ON public.opportunity_line_items (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_line_items_product_id
  ON public.opportunity_line_items (product_id)
  WHERE product_id IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_opportunity_line_items_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_line_items_timestamps ON public.opportunity_line_items;
CREATE TRIGGER opportunity_line_items_timestamps
  BEFORE UPDATE ON public.opportunity_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_opportunity_line_items_timestamps();

-- ── Audit ────────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.opportunity_line_items');

-- ── Write-access helper (single source of truth for write + the RPC) ─────────
-- SECURITY DEFINER so it reads opportunity_visibility regardless of RLS; pinned
-- to auth.uid(). An explicit visibility row means the user is permitted (incl.
-- execs on a confidential deal), so that branch is NOT confidential-fenced; the
-- admin fallback is.
CREATE OR REPLACE FUNCTION public.can_write_opportunity_line_items(_opportunity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = _opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(_opportunity_id)
    );
$$;
REVOKE ALL ON FUNCTION public.can_write_opportunity_line_items(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_write_opportunity_line_items(uuid) TO authenticated;

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.opportunity_line_items ENABLE ROW LEVEL SECURITY;

-- SELECT: mirrors opportunity_splits — visible via explicit visibility, or via
-- admin / role-scope on non-confidential deals.
DROP POLICY IF EXISTS "opportunity_line_items_select_via_opportunity" ON public.opportunity_line_items;
CREATE POLICY "opportunity_line_items_select_via_opportunity"
  ON public.opportunity_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_line_items.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_line_items.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.opportunity_line_items.opportunity_id)
        AND NOT public.opportunity_is_confidential(public.opportunity_line_items.opportunity_id))
  );

DROP POLICY IF EXISTS "opportunity_line_items_insert_via_write" ON public.opportunity_line_items;
CREATE POLICY "opportunity_line_items_insert_via_write"
  ON public.opportunity_line_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_opportunity_line_items(opportunity_id));

DROP POLICY IF EXISTS "opportunity_line_items_update_via_write" ON public.opportunity_line_items;
CREATE POLICY "opportunity_line_items_update_via_write"
  ON public.opportunity_line_items
  FOR UPDATE TO authenticated
  USING (public.can_write_opportunity_line_items(opportunity_id))
  WITH CHECK (public.can_write_opportunity_line_items(opportunity_id));

DROP POLICY IF EXISTS "opportunity_line_items_delete_via_write" ON public.opportunity_line_items;
CREATE POLICY "opportunity_line_items_delete_via_write"
  ON public.opportunity_line_items
  FOR DELETE TO authenticated
  USING (public.can_write_opportunity_line_items(opportunity_id));

DROP POLICY IF EXISTS "opportunity_line_items_service_role" ON public.opportunity_line_items;
CREATE POLICY "opportunity_line_items_service_role"
  ON public.opportunity_line_items
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Atomic replace RPC (the web write path) ──────────────────────────────────
-- DELETE + INSERT in one transaction so a mid-write failure can't leave the deal
-- with a partial line set. Mirrors replace_revenue_schedule (ORR #148). An empty
-- array clears all lines. line_total is generated, so it is never in the payload.
CREATE OR REPLACE FUNCTION public.replace_opportunity_line_items(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_write_opportunity_line_items(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to modify line items for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialise concurrent replaces on the same opportunity (last-write-wins).
  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;

  DELETE FROM public.opportunity_line_items WHERE opportunity_id = _opportunity_id;

  INSERT INTO public.opportunity_line_items
    (opportunity_id, product_id, description, quantity, unit_price_amount, unit_cost_amount, discount_pct, position)
  SELECT _opportunity_id,
         NULLIF(elem->>'product_id', '')::uuid,
         elem->>'description',
         (elem->>'quantity')::numeric,
         (elem->>'unit_price_amount')::numeric,
         COALESCE(NULLIF(elem->>'unit_cost_amount', ''), '0')::numeric,
         COALESCE(NULLIF(elem->>'discount_pct', ''), '0')::numeric,
         COALESCE(NULLIF(elem->>'position', ''), '0')::integer
  FROM jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) AS elem;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_opportunity_line_items(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_opportunity_line_items(uuid, jsonb) TO authenticated;
