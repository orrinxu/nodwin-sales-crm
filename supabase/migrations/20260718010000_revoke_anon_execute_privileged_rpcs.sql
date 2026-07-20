-- ORR-777: revoke the platform-default `anon` EXECUTE grant from privileged RPCs.
--
-- Background: this Supabase deployment grants EXECUTE on every new public
-- function to anon by default (verified: 259/260 public functions carry it),
-- and `REVOKE ... FROM PUBLIC` does not remove that explicit anon grant — anon
-- must be revoked by name (see 20260712010000_user_public_profile.sql). As a
-- result, several param-driven SECURITY DEFINER functions were callable
-- UNAUTHENTICATED via PostgREST `/rpc`, leaking data or allowing writes/DoS:
--   • AI-spend aggregates: get_todays_company_usage / _team_usage /
--     get_effective_user_caps / check_ai_caps
--   • org-chart / scope enumeration: team_member_ids, region_entity_ids
--   • confidentiality + approver oracles, break-glass, direct-report writes,
--     approval-decision writes, replace_* write RPCs, visibility recompute
--     (heavy write / DoS), inbound-email generation, pipeline-health logging.
--
-- Scope of THIS migration (deliberately conservative): revoke anon EXECUTE only
-- from explicit RPC / write / DoS functions that are NOT referenced by any RLS
-- policy and are NOT trigger functions — so this cannot break anon-reachable
-- table reads (policy evaluation) or trigger firing (trigger execution ignores
-- EXECUTE grants). Verified against pg_policies: none of these names appear in
-- any policy qual/with_check. `authenticated` retains EXECUTE throughout.
--
-- Deliberately NOT touched here (needs a staging login/signup smoke first, see
-- the ORR-777 follow-up): the RLS-helper DEFINER functions (current_user_role,
-- opportunity_is_confidential, has_permission, can_read_account, …), the
-- intentionally-anon is_email_domain_allowed (signup), trigger functions, and a
-- blanket ALTER DEFAULT PRIVILEGES sweep for future functions.

DO $$
DECLARE
  -- Privileged RPCs that must never be callable by anon. All overloads of each
  -- name are revoked. REVOKE of an absent grant is a harmless no-op, so this
  -- migration is idempotent and safe to re-apply.
  target_names text[] := ARRAY[
    'check_ai_caps',
    'get_effective_user_caps',
    'get_todays_company_usage',
    'get_todays_team_usage',
    'team_member_ids',
    'region_entity_ids',
    'job_pipeline_health_snapshot',
    'recompute_visibility_for_opportunities',
    'recompute_visibility_for_opportunity',
    'recompute_visibility_for_user',
    'recompute_visibility_for_user_subtree',
    'recompute_visibility_for_users_subtrees',
    'user_is_step_approver_for_instance',
    'user_triggered_instance_of_step',
    'confidential_opportunities_metadata',
    'confidential_break_glass_target',
    'assign_direct_report',
    'remove_direct_report',
    'break_glass_confidential',
    'record_approval_decision',
    'submit_opportunity_for_approval',
    'cancel_approval_instance',
    'reassign_approval_step',
    'replace_account_tax_ids',
    'replace_opportunity_line_items',
    'replace_opportunity_splits',
    'replace_opportunity_team_members',
    'replace_revenue_schedule',
    'replace_workflow_steps',
    'generate_user_crm_inbound_email'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (target_names)
  LOOP
    -- Revoke from PUBLIC too: several of these (the ai_usage helpers) never had
    -- their default PUBLIC EXECUTE stripped, so anon inherits access via PUBLIC
    -- and a FROM anon-only revoke is a no-op. Every target already has an
    -- explicit `authenticated` grant; the idempotent GRANT below guarantees
    -- authenticated is preserved even if some target relied on PUBLIC.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
