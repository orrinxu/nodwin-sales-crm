-- supabase/migrations/20260715020000_break_glass_confidential.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Break-glass Confidential self-grant (ORR-716 / T-142) — part 2 of 2.
--
-- O3 (ratified 2026-07-13): a founder-level principal may self-grant access to
-- ONE specific Confidential deal, every grant audit-logged with actor + reason and
-- notifying the deal's existing named list. Never a blanket role: the grant is a
-- per-deal append to that deal's `confidentiality_override_user_ids`, which the
-- existing visibility recompute turns into a single opportunity_visibility row for
-- the caller — exactly the same durable mechanism the owner + named list use.
--
-- The DEFAULT firewall is untouched (owner + confidentiality_override_user_ids,
-- centralized in #280/#288). A principal who never invokes break-glass sees no
-- change; everyone who is not a permitted principal — admins included — still
-- cannot read a Confidential deal at all. pgTAP (break_glass_confidential.test.sql)
-- proves both the grant path and that the fence still holds for non-invokers.
--
-- Permitted principal = `exec` only (O3 "Founder/named role"; tightest reading —
-- widening to more roles or an RBAC permission is a one-line change to the guard).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. The break-glass grant — SECURITY DEFINER (bypasses RLS), guarded internally.
-- ════════════════════════════════════════════════════════════════════════════════
-- Returns the named list to notify (owner + prior overrides, minus the caller) and
-- the deal name, so the app layer can fire notifications through the normal
-- pipeline. The grant + audit happen atomically here; notifications are a
-- best-effort follow-up (a delivery failure must not roll back an emergency grant).
CREATE OR REPLACE FUNCTION public.break_glass_confidential(
  _opportunity_id uuid,
  _reason         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller    uuid := auth.uid();
  _name      text;
  _owner     uuid;
  _tier      public.visibility_tier;
  _overrides uuid[];
  _notify    uuid[];
BEGIN
  -- Capability gate: exec only. Admins and every other role are refused — the
  -- Confidential firewall is not something an admin can pierce (that is the whole
  -- point of #280/#288); break-glass is an accountable exception for founders.
  IF public.current_user_role() IS DISTINCT FROM 'exec' THEN
    RAISE EXCEPTION 'not authorised to break-glass into a Confidential deal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A reason is mandatory — this is the accountability record.
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'a reason is required to break-glass'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the deal and read its tier / owner / current named list.
  SELECT name, owner_user_id, visibility_tier, confidentiality_override_user_ids
    INTO _name, _owner, _tier, _overrides
    FROM public.opportunities
   WHERE id = _opportunity_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity % not found', _opportunity_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Break-glass only applies to Confidential deals; Standard/Restricted access is
  -- governed by the ordinary visibility rules, not this emergency door.
  IF _tier IS DISTINCT FROM 'confidential' THEN
    RAISE EXCEPTION 'break-glass only applies to Confidential deals'
      USING ERRCODE = 'check_violation';
  END IF;

  -- No-op guard: the caller is already on the named list (owner or override).
  IF _caller = _owner OR _caller = ANY (COALESCE(_overrides, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'you already have access to this deal'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- The grant: append the caller to THIS deal's override list. The AFTER UPDATE OF
  -- confidentiality_override_user_ids trigger recomputes opportunity_visibility,
  -- giving the caller a single 'confidentiality_override' visibility row. Per-deal,
  -- never a role change.
  UPDATE public.opportunities
     SET confidentiality_override_user_ids =
           array_append(confidentiality_override_user_ids, _caller)
   WHERE id = _opportunity_id;

  -- Audit, same transaction — the grant cannot exist without its record.
  INSERT INTO public.audit_log (operation, table_name, row_id, actor_user_id, actor_source, new_data)
  VALUES (
    'UPDATE', 'opportunities', _opportunity_id, _caller, 'user',
    jsonb_build_object(
      'break_glass',     true,
      'granted_user_id', _caller,
      'granted_role',    'exec',
      'reason',          _reason
    )
  );

  -- The named list to notify: owner + PRIOR overrides, excluding the caller.
  SELECT array_agg(DISTINCT uid)
    INTO _notify
    FROM unnest(array_append(COALESCE(_overrides, ARRAY[]::uuid[]), _owner)) AS uid
   WHERE uid IS NOT NULL AND uid <> _caller;

  RETURN jsonb_build_object(
    'opportunity_id',   _opportunity_id,
    'opportunity_name', _name,
    'notify_user_ids',  COALESCE(to_jsonb(_notify), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.break_glass_confidential(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.break_glass_confidential(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. Break-glass target probe — lets the deal page offer the door to an exec who
--    has a Confidential deal's link but no access yet, WITHOUT leaking existence
--    to anyone else. Returns a row only when: caller is exec, the deal is
--    Confidential, and the caller is not already entitled. Everyone else (and every
--    non-Confidential id) gets zero rows → the page shows a normal 404.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confidential_break_glass_target(_opportunity_id uuid)
RETURNS TABLE (opportunity_name text, owner_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name, u.full_name
    FROM public.opportunities o
    LEFT JOIN public.users u ON u.id = o.owner_user_id
   WHERE o.id = _opportunity_id
     AND o.visibility_tier = 'confidential'
     AND public.current_user_role() = 'exec'
     AND NOT EXISTS (
       SELECT 1 FROM public.opportunity_visibility v
        WHERE v.opportunity_id = _opportunity_id
          AND v.user_id = auth.uid()
     );
$$;

REVOKE ALL ON FUNCTION public.confidential_break_glass_target(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confidential_break_glass_target(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. Default routing for the new event type (org-wide, entity_id IS NULL). A
--    security event, so in_app + email default ON. Idempotent: the UNIQUE
--    (event_type, channel, entity_id) treats NULL entity_id as distinct, so guard
--    with NOT EXISTS rather than ON CONFLICT.
-- ════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.notification_routing (event_type, channel, enabled)
SELECT 'confidential_break_glass'::public.notification_event_type, ch, true
  FROM (VALUES ('in_app'::public.notification_channel), ('email'::public.notification_channel)) AS c(ch)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.notification_routing r
    WHERE r.event_type = 'confidential_break_glass'
      AND r.channel = c.ch
      AND r.entity_id IS NULL
 );
