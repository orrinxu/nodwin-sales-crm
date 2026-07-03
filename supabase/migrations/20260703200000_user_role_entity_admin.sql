-- supabase/migrations/20260703200000_user_role_entity_admin.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Two-tier admin (ORR-618): adds the 'entity_admin' role. Kept in its OWN
-- migration because a new enum value cannot be USED in the same transaction that
-- adds it — the policies/logic that reference 'entity_admin' live in the next
-- migration (20260703210000), which runs as a separate transaction.
--
-- Super Admin stays the existing 'admin' value (all-powerful; every policy,
-- requireRole, and the prevent_role_escalation trigger already treat it so).
-- Entity Admin is scoped to users.primary_entity_id via current_user_entity_id().
--
-- Idempotent: ADD VALUE IF NOT EXISTS is a no-op on re-run.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'entity_admin';
