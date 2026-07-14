-- ═══════════════════════════════════════════════════════════════════════════════
-- ORR-717 — Entity-scope options for the Opportunities scope selector.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- The unified Opportunities surface (ORR-711) has an owner axis (My Pipeline /
-- All Deals / Closing This Month). This adds an orthogonal ENTITY axis: chips
-- that narrow the visible list to a single selling entity (opportunities.
-- entity_sales_id). Like every other scope filter it may only NARROW within RLS,
-- never widen.
--
-- Option A (O4, ratified): the entity chips auto-derive from the caller's
-- RLS-visible deals — an entity appears only if the caller can already see at
-- least one deal in it. That makes "options ⊆ All Deals" true by construction.
--
-- WHY A FUNCTION (not a client-side reduce): deriving the distinct set by
-- fetching every visible entity_sales_id into the app and de-duping in JS would
-- silently truncate at PostgREST's 1000-row cap — an entity whose deals all sit
-- beyond row 1000 would vanish from the chip list. DISTINCT is done server-side
-- here so the result is complete regardless of pipeline size.
--
-- WHY SECURITY INVOKER: the option set must be exactly the entities the caller
-- can see. Running under the caller means RLS on `opportunities` applies, so the
-- DISTINCT is taken over the caller's visible rows only. SECURITY DEFINER would
-- bypass RLS and expose entities from deals the caller cannot see — a widening,
-- which is precisely what this feature must never do.
--
-- SEAM for Option B: to switch to "entities the caller's ROLE grants" (regional_
-- head → every entity in their region, etc.) later, replace this body with a
-- role/region query (see can_view_opportunity_by_role_scope for the region
-- join). The signature and the app-side caller (getEntityScopeOptions) stay
-- identical, so it is a drop-in swap.

CREATE OR REPLACE FUNCTION public.list_visible_sales_entities()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT e.id, e.name
  FROM public.opportunities o
  JOIN public.entities e ON e.id = o.entity_sales_id
  ORDER BY e.name;
$$;

COMMENT ON FUNCTION public.list_visible_sales_entities() IS
  'ORR-717: distinct selling entities (opportunities.entity_sales_id) across the '
  'caller''s RLS-visible deals, for the Opportunities entity-scope chips. '
  'SECURITY INVOKER so the set can never exceed what the caller can already see.';

REVOKE ALL ON FUNCTION public.list_visible_sales_entities() FROM public;
GRANT EXECUTE ON FUNCTION public.list_visible_sales_entities() TO authenticated, service_role;
