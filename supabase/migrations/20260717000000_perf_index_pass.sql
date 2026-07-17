-- supabase/migrations/20260717000000_perf_index_pass.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-770 (round-2 perf audit, db-plans / index dimension). This is the
-- index/EXPLAIN pass that was classifier-blocked during the ORR-764 sweep, run
-- against the live schema. Two structural index gaps confirmed by usage +
-- `EXPLAIN` (Seq Scan / no supporting index). Zero behaviour change — indexes
-- only. Idempotent: safe to re-run.
--
--   1. idx_users_manager_user_id — the reporting-chain recursion joins users on
--      `manager_user_id = <parent>` (team_member_ids(), which runs on EVERY
--      dashboard load via getTeamScope; recompute_visibility_for_opportunities()
--      subtree walk; direct-reports). `EXPLAIN` showed a Seq Scan on users for
--      that equality — no index existed. Partial (IS NOT NULL) because the
--      recursive join only ever matches non-null rows and root users are null,
--      mirroring idx_contacts_owner_user_id / idx_accounts_account_owner_user_id.
--
--   2. idx_accounts_created_at (partial) — the accounts list is sortable by
--      created_at (accounts.ts applyAccountSort → order("created_at")) with no
--      supporting index. This is the exact gap ORR-759 closed for contacts
--      (idx_contacts_created_at); accounts was missed. Partial WHERE
--      deleted_at IS NULL to match the list scope (getAccounts .is(deleted_at,
--      null)) and the idx_accounts_industry precedent.
--
-- Deliberately NOT indexed (documented so the next audit doesn't re-flag them):
--   • tasks.account_id / tasks.contact_id, opportunities.billing_entity_id /
--     ops_unit_id / revenue_recognition_unit_id, opportunity_team_members.added_by
--     — unindexed FKs, but write-only: no read path filters/joins on them.
--   • currency / lookup FKs (fx_rates.to_currency, sales_targets.currency,
--     products.unit_price_currency, user_preferences.*_currency, …) — reference
--     the 39-row currencies table; a child-side index buys nothing.
--   • users.primary_business_unit_id — only joined by the admin-only, infrequent
--     ai-usage by-BU aggregates over the small users table; a seq scan is fine.
--   • opportunities.name — sortable but non-default, and lists are RLS-scoped to
--     the caller's subset, so the scope filter dominates the plan; speculative.

CREATE INDEX IF NOT EXISTS idx_users_manager_user_id
  ON public.users (manager_user_id)
  WHERE manager_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_created_at
  ON public.accounts (created_at DESC)
  WHERE deleted_at IS NULL;
