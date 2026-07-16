-- supabase/migrations/20260715070000_products.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-748 (§A of ORR-704): product catalog.
--
-- A small admin-managed catalog of sellable products/services. Per-deal line
-- items (ORR-749, §B) will reference products.id, so this uses a uuid PK. The
-- unit price follows the repo Money pattern: an (amount numeric(20,4), currency)
-- column pair.
--
-- RLS: read = all authenticated; write = admin only; service_role = full access.
-- Audit: generic audit.attach_trigger() (uuid PK).
-- Idempotent: safe to re-run.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text          NOT NULL,
  sku                 text,
  description         text,
  unit_price_amount   numeric(20,4) NOT NULL DEFAULT 0
                                    CHECK (unit_price_amount >= 0),
  unit_price_currency text          NOT NULL DEFAULT 'USD'
                                    REFERENCES public.currencies(code),
  active              boolean       NOT NULL DEFAULT true,
  display_order       integer       NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.products IS
  'Admin-managed catalog of sellable products/services. Referenced by opportunity line items (ORR-749). Unit price is an (amount, currency) Money pair.';

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Distinct SKUs where present; NULL SKUs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key
  ON public.products (sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_products_display_order
  ON public.products (display_order);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_products_timestamps()
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

DROP TRIGGER IF EXISTS products_timestamps ON public.products;
CREATE TRIGGER products_timestamps
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_products_timestamps();

-- ── Audit ────────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.products');

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_auth" ON public.products;
CREATE POLICY "products_select_auth"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
CREATE POLICY "products_insert_admin"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "products_update_admin" ON public.products;
CREATE POLICY "products_update_admin"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
CREATE POLICY "products_delete_admin"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "products_service_role" ON public.products;
CREATE POLICY "products_service_role"
  ON public.products
  TO service_role
  USING (true)
  WITH CHECK (true);
