-- supabase/migrations/20260707030000_roles_permissions.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (identity / RBAC + RLS).
--
-- Roles & Permissions administration (SOW §3: "the admin panel allows the group to
-- add or modify roles and permission layers without code changes").
--
-- DESIGN — "anchored to a base role" (no rewrite of the ~400 enum-based RLS policies):
--   * roles            — the 10 existing user_role enum values as non-deletable SYSTEM
--                        roles, plus admin-created CUSTOM roles. Every role carries a
--                        base_role (a real user_role) that anchors its row-level data
--                        access to the EXISTING RLS.
--   * permissions      — a code-defined catalogue (category.action). Admins TOGGLE these
--                        per role; they never invent keys. Seeded from lib/data/permissions.ts.
--   * role_permissions — the role × permission matrix.
--   * users.role_id    — the assigned role. A trigger keeps users.primary_role in sync with
--                        the assigned role's base_role, so current_user_role() and every
--                        existing enum-based policy keep working UNCHANGED.
--   * has_permission() — SECURITY DEFINER seam so RLS/app can gate on capabilities. Super
--                        Admin (primary_role='admin') always passes (never lock admins out).
--
-- Idempotent throughout (IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  description text,
  base_role   public.user_role NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid
);

COMMENT ON TABLE public.roles IS
  'Assignable roles. is_system=true rows mirror the user_role enum 1:1 (non-deletable). '
  'Custom roles are admin-created; base_role anchors a role to an enum value that drives '
  'existing RLS, while the role_permissions matrix layers app-level capabilities on top.';

CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  category    text NOT NULL,
  label       text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.permissions IS
  'Code-defined capability catalogue (category.action), seeded from lib/data/permissions.ts. '
  'Admins toggle these per role; the set of keys is managed only by migrations.';

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id        uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  PRIMARY KEY (role_id, permission_key)
);

COMMENT ON TABLE public.role_permissions IS 'Role × permission matrix (which roles hold which permissions).';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Audit-fields triggers (mirror set_user_preferences_audit_fields)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_roles_audit_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS roles_audit_fields_trigger ON public.roles;
CREATE TRIGGER roles_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_roles_audit_fields();

CREATE OR REPLACE FUNCTION public.set_role_permissions_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_created_by_trigger ON public.role_permissions;
CREATE TRIGGER role_permissions_created_by_trigger
  BEFORE INSERT ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_role_permissions_created_by();

-- Block deletion of system roles at the DB level (invariant holds for any caller).
CREATE OR REPLACE FUNCTION public.prevent_system_role_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System roles cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_system_role_delete_trigger ON public.roles;
CREATE TRIGGER prevent_system_role_delete_trigger
  BEFORE DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_system_role_delete();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Seed system roles (1:1 with the user_role enum; base_role = key)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.roles (key, label, description, base_role, is_system) VALUES
  ('sales_rep',        'Sales Rep',        'Individual contributor',              'sales_rep',        true),
  ('sales_manager',    'Sales Manager',    'Manages a team of reps',              'sales_manager',    true),
  ('regional_head',    'Regional Head',    'Regional leadership',                 'regional_head',    true),
  ('group_sales_lead', 'Group Sales Lead', 'Group-wide sales leadership',         'group_sales_lead', true),
  ('finance',          'Finance',          'Finance & revenue',                   'finance',          true),
  ('ops',              'Operations',       'Operations',                          'ops',              true),
  ('entity_admin',     'Entity Admin',     'Administrator scoped to one entity',  'entity_admin',     true),
  ('admin',            'Super Admin',      'Group-wide administrator',            'admin',            true),
  ('exec',             'Executive',        'Read-only executive dashboards',      'exec',             true),
  ('external_partner', 'External Partner', 'Limited external access',             'external_partner', true)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Seed the permission catalogue (mirrors lib/data/permissions.ts)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.permissions (key, category, label, description, sort_order) VALUES
  ('opportunities.view_all',   'Opportunities', 'View all deals',        'See all group opportunities, not just own/team',        10),
  ('opportunities.edit',       'Opportunities', 'Edit deals',            'Create and edit opportunities',                          11),
  ('opportunities.delete',     'Opportunities', 'Delete deals',          'Delete opportunities (incl. bulk)',                      12),
  ('opportunities.reassign',   'Opportunities', 'Reassign / split',      'Change owner, splits, and team members',                 13),
  ('opportunities.export',     'Opportunities', 'Export deals',          'Export opportunity data',                                14),
  ('approvals.submit',         'Approvals',     'Submit for approval',   'Submit an opportunity for approval',                     20),
  ('approvals.approve',        'Approvals',     'Approve / reject',      'Record an approval decision',                            21),
  ('approvals.reassign',       'Approvals',     'Reassign / cancel',     'Reassign approval steps or cancel an instance',          22),
  ('accounts.manage',          'Accounts',      'Manage accounts',       'Create and edit accounts and contacts',                  30),
  ('accounts.export',          'Accounts',      'Export accounts',       'Export account/contact data',                            31),
  ('reports.view',             'Reports',       'View reports',          'Access the reports area',                                40),
  ('reports.view_forecast',    'Reports',       'View forecast',         'View forecast and rep scorecards',                       41),
  ('knowledge.view',           'Knowledge',     'View knowledge base',   'Access the knowledge base',                              50),
  ('ai.use',                   'AI',            'Use AI features',       'Use the AI deal copilot',                                60),
  ('admin.manage_users',       'Administration','Manage users',          'Manage users and role assignment',                       70),
  ('admin.manage_roles',       'Administration','Manage roles',          'Manage roles and permissions (this area)',               71),
  ('admin.manage_entities',    'Administration','Manage entities',       'Manage entities, business units, org settings',          72),
  ('admin.manage_fields',      'Administration','Manage fields',         'Manage custom fields and relationship types',            73),
  ('admin.manage_approvals',   'Administration','Manage approvals',      'Manage approval workflows',                              74),
  ('admin.manage_ai',          'Administration','Manage AI config',      'Manage AI providers, settings, deal-health',             75),
  ('admin.manage_email',       'Administration','Manage email/domains',  'Manage email transport and allowed domains',             76),
  ('admin.data_management',    'Administration','Data management',       'Bulk data operations',                                   77)
ON CONFLICT (key) DO UPDATE
  SET category = EXCLUDED.category, label = EXCLUDED.label,
      description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Seed default role_permissions for SYSTEM roles (ON CONFLICT DO NOTHING — never
--    clobbers later admin edits). Admin gets EVERY permission.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, v.permission_key
FROM (VALUES
  -- sales_rep
  ('sales_rep','opportunities.edit'),('sales_rep','approvals.submit'),('sales_rep','accounts.manage'),
  ('sales_rep','reports.view'),('sales_rep','knowledge.view'),('sales_rep','ai.use'),
  -- sales_manager
  ('sales_manager','opportunities.view_all'),('sales_manager','opportunities.edit'),('sales_manager','opportunities.reassign'),
  ('sales_manager','opportunities.export'),('sales_manager','approvals.submit'),('sales_manager','approvals.approve'),
  ('sales_manager','approvals.reassign'),('sales_manager','accounts.manage'),('sales_manager','accounts.export'),
  ('sales_manager','reports.view'),('sales_manager','reports.view_forecast'),('sales_manager','knowledge.view'),('sales_manager','ai.use'),
  -- regional_head
  ('regional_head','opportunities.view_all'),('regional_head','opportunities.edit'),('regional_head','opportunities.reassign'),
  ('regional_head','opportunities.export'),('regional_head','approvals.submit'),('regional_head','approvals.approve'),
  ('regional_head','approvals.reassign'),('regional_head','accounts.manage'),('regional_head','accounts.export'),
  ('regional_head','reports.view'),('regional_head','reports.view_forecast'),('regional_head','knowledge.view'),('regional_head','ai.use'),
  -- group_sales_lead
  ('group_sales_lead','opportunities.view_all'),('group_sales_lead','opportunities.edit'),('group_sales_lead','opportunities.delete'),
  ('group_sales_lead','opportunities.reassign'),('group_sales_lead','opportunities.export'),('group_sales_lead','approvals.submit'),
  ('group_sales_lead','approvals.approve'),('group_sales_lead','approvals.reassign'),('group_sales_lead','accounts.manage'),
  ('group_sales_lead','accounts.export'),('group_sales_lead','reports.view'),('group_sales_lead','reports.view_forecast'),
  ('group_sales_lead','knowledge.view'),('group_sales_lead','ai.use'),('group_sales_lead','admin.manage_approvals'),
  -- finance
  ('finance','opportunities.view_all'),('finance','opportunities.export'),('finance','approvals.approve'),
  ('finance','accounts.export'),('finance','reports.view'),('finance','reports.view_forecast'),
  ('finance','knowledge.view'),('finance','ai.use'),
  -- ops
  ('ops','opportunities.view_all'),('ops','opportunities.export'),('ops','accounts.manage'),('ops','accounts.export'),
  ('ops','reports.view'),('ops','knowledge.view'),('ops','ai.use'),('ops','admin.manage_ai'),('ops','admin.manage_email'),
  -- entity_admin (RLS still confines WHICH rows to their entity)
  ('entity_admin','opportunities.view_all'),('entity_admin','opportunities.edit'),('entity_admin','opportunities.delete'),
  ('entity_admin','opportunities.reassign'),('entity_admin','opportunities.export'),('entity_admin','approvals.submit'),
  ('entity_admin','approvals.approve'),('entity_admin','approvals.reassign'),('entity_admin','accounts.manage'),
  ('entity_admin','accounts.export'),('entity_admin','reports.view'),('entity_admin','reports.view_forecast'),
  ('entity_admin','knowledge.view'),('entity_admin','ai.use'),('entity_admin','admin.manage_users'),
  ('entity_admin','admin.manage_entities'),('entity_admin','admin.manage_fields'),('entity_admin','admin.manage_approvals'),
  ('entity_admin','admin.manage_ai'),('entity_admin','admin.manage_email'),
  -- exec (read-only)
  ('exec','opportunities.view_all'),('exec','opportunities.export'),('exec','accounts.export'),
  ('exec','reports.view'),('exec','reports.view_forecast'),('exec','knowledge.view'),
  -- external_partner (very limited)
  ('external_partner','knowledge.view')
) AS v(role_key, permission_key)
JOIN public.roles r ON r.key = v.role_key
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Backfill users.role_id from their current primary_role
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.users u
SET role_id = r.id
FROM public.roles r
WHERE r.is_system = true AND r.key = u.primary_role::text AND u.role_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. has_permission() / my_permissions() — SECURITY DEFINER (bypass RLS, no recursion)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_permission(perm_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.role_permissions rp ON rp.role_id = u.role_id
      WHERE u.id = auth.uid() AND rp.permission_key = perm_key
    );
$$;

COMMENT ON FUNCTION public.has_permission(text) IS
  'True if the current user holds the permission. Super Admin (primary_role=admin) always '
  'passes so the matrix can never lock admins out. SECURITY DEFINER to avoid RLS recursion.';

-- One round-trip for the app layer: all permission keys the current user holds.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.key FROM public.permissions p
  WHERE EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin')
  UNION
  SELECT rp.permission_key
  FROM public.users u JOIN public.role_permissions rp ON rp.role_id = u.role_id
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

-- Atomic replace of a role's permission set (SECURITY INVOKER → admin-only RLS applies).
CREATE OR REPLACE FUNCTION public.set_role_permissions(_role_id uuid, _keys text[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM public.role_permissions WHERE role_id = _role_id;
  INSERT INTO public.role_permissions (role_id, permission_key)
  SELECT _role_id, k FROM unnest(_keys) AS k
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_role_permissions(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_role_permissions(uuid, text[]) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Keep users.primary_role in sync with the assigned role's base_role.
--    Named 'a_…' so it fires BEFORE prevent_role_escalation (row triggers run
--    alphabetically) — the escalation guard then sees the DERIVED primary_role.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_primary_role_from_role_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role_id IS NOT NULL AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT base_role INTO NEW.primary_role FROM public.roles WHERE id = NEW.role_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_sync_primary_role_from_role_id ON public.users;
CREATE TRIGGER a_sync_primary_role_from_role_id
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_role_from_role_id();

-- Extend the escalation guard to also block non-admins changing role_id.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current_user_id uuid;
BEGIN
  _current_user_id := auth.uid();
  IF _current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = _current_user_id AND primary_role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_role IS DISTINCT FROM OLD.primary_role THEN
    RAISE EXCEPTION 'Only admins can change primary_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id THEN
    RAISE EXCEPTION 'Only admins can change manager_user_id' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    RAISE EXCEPTION 'Only admins can change role_id' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- New auth users get the sales_rep system role (primary_role already defaults to sales_rep).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role_id)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    (SELECT id FROM public.roles WHERE key = 'sales_rep' AND is_system = true)
  );
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. RLS (mirror the user_preferences drop-and-recreate idiom)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- roles: everyone authenticated may read (needed to render user-edit dropdowns); only Super Admin writes.
DROP POLICY IF EXISTS "roles_select_authenticated" ON public.roles;
CREATE POLICY "roles_select_authenticated" ON public.roles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "roles_insert_admin" ON public.roles;
CREATE POLICY "roles_insert_admin" ON public.roles
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "roles_update_admin" ON public.roles;
CREATE POLICY "roles_update_admin" ON public.roles
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "roles_delete_admin" ON public.roles;
CREATE POLICY "roles_delete_admin" ON public.roles
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

-- permissions: read-only catalogue for everyone authenticated; no write policy (migration-managed).
DROP POLICY IF EXISTS "permissions_select_authenticated" ON public.permissions;
CREATE POLICY "permissions_select_authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

-- role_permissions: read for everyone authenticated; only Super Admin writes.
DROP POLICY IF EXISTS "role_permissions_select_authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions_select_authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "role_permissions_insert_admin" ON public.role_permissions;
CREATE POLICY "role_permissions_insert_admin" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "role_permissions_delete_admin" ON public.role_permissions;
CREATE POLICY "role_permissions_delete_admin" ON public.role_permissions
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
