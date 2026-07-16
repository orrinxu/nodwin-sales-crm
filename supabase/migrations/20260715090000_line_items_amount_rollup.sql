-- supabase/migrations/20260715090000_line_items_amount_rollup.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (write path on client financial data).
--
-- ORR-750 (§C of ORR-704): derive opportunities.amount from line items.
--
-- Decisions (ratified 2026-07-16):
--   • Deal amount = Σ line_total − per-deal fixed discount, COMPUTED and stored
--     back into opportunities.amount so every existing rollup (forecast_*_agg,
--     stage-totals, reports, per-account) keeps reading one authoritative column.
--   • A per-deal OVERRIDE toggle lets a rep pin a manual amount (lines then
--     become informational). A deal with NO line items also stays manual.
--   • Per-deal discount is a FIXED amount in the deal currency; per-line discount
--     is the % already on opportunity_line_items.
--
-- Recompute is triggered from the two SECURITY DEFINER write paths (replacing the
-- lines, or changing the pricing) — never a table trigger, to keep it explicit
-- and off the hot read path.
--
-- Idempotent: safe to re-run.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS line_items_amount_overridden boolean NOT NULL DEFAULT false;
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS line_items_discount_amount numeric(20,4) NOT NULL DEFAULT 0
    CHECK (line_items_discount_amount >= 0);

COMMENT ON COLUMN public.opportunities.line_items_amount_overridden IS
  'When true, amount is a manual override and is NOT recomputed from line items.';
COMMENT ON COLUMN public.opportunities.line_items_discount_amount IS
  'Per-deal fixed discount (deal currency) subtracted from the line-item subtotal.';

-- ── Recompute helper (internal; called only by the write-path RPCs) ──────────
-- SECURITY DEFINER so it can write opportunities.amount; not granted to
-- authenticated — the RPCs below (owned by the same role) call it, and each
-- authorises via can_write_opportunity_line_items first.
CREATE OR REPLACE FUNCTION public.recompute_opportunity_amount_from_line_items(_opportunity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overridden boolean;
  v_discount   numeric(20,4);
  v_subtotal   numeric(20,4);
  v_count      integer;
BEGIN
  SELECT line_items_amount_overridden, line_items_discount_amount
    INTO v_overridden, v_discount
    FROM public.opportunities WHERE id = _opportunity_id;

  -- Manual-override mode → leave the amount as entered.
  IF NOT FOUND OR v_overridden THEN
    RETURN;
  END IF;

  SELECT count(*), COALESCE(SUM(line_total), 0)
    INTO v_count, v_subtotal
    FROM public.opportunity_line_items WHERE opportunity_id = _opportunity_id;

  -- No lines → amount stays manually editable (don't clobber it).
  IF v_count = 0 THEN
    RETURN;
  END IF;

  UPDATE public.opportunities
    SET amount = GREATEST(0, v_subtotal - COALESCE(v_discount, 0))
    WHERE id = _opportunity_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_opportunity_amount_from_line_items(uuid) FROM public;

-- ── Replace RPC: now recomputes the deal amount after swapping the lines ─────
-- (CREATE OR REPLACE of the ORR-749 function with the recompute call appended.)
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

  PERFORM public.recompute_opportunity_amount_from_line_items(_opportunity_id);
END;
$$;

-- ── Pricing RPC: set the per-deal discount + override toggle, then recompute ──
-- _discount_amount is text (a decimal string) and cast to numeric inside, so the
-- caller passes a Money.toAmount() string exactly — no float round-trip — the
-- same convention the jsonb line amounts use.
DROP FUNCTION IF EXISTS public.set_opportunity_line_items_pricing(uuid, numeric, boolean);
CREATE OR REPLACE FUNCTION public.set_opportunity_line_items_pricing(
  _opportunity_id  uuid,
  _discount_amount text,
  _overridden      boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_write_opportunity_line_items(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to modify line-item pricing for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;

  UPDATE public.opportunities
    SET line_items_discount_amount   = GREATEST(0, COALESCE(NULLIF(_discount_amount, '')::numeric, 0)),
        line_items_amount_overridden = COALESCE(_overridden, false)
    WHERE id = _opportunity_id;

  PERFORM public.recompute_opportunity_amount_from_line_items(_opportunity_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_opportunity_line_items_pricing(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_opportunity_line_items_pricing(uuid, text, boolean) TO authenticated;
