-- supabase/migrations/20260715050000_salesforce_import.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
-- Idempotent: safe to re-run.
--
-- ORR-699 Salesforce migration importer. Adds the stable-key columns the importer
-- needs to be idempotent: a `legacy_salesforce_id` on accounts and contacts
-- (opportunities already has one, added in 20260505000007). A UNIQUE partial index
-- on each lets a re-import resolve "already imported" by the Salesforce 15/18-char
-- record Id instead of creating duplicates, and lets contacts/opportunities resolve
-- their parent Account by that same Salesforce Id.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS legacy_salesforce_id text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS legacy_salesforce_id text;

-- ── Idempotency indexes ──────────────────────────────────────────────────────
-- Partial UNIQUE so ordinary (non-imported) rows with NULL don't collide, and a
-- given Salesforce Id can only ever map to one CRM row.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_legacy_salesforce_id_key
  ON public.accounts (legacy_salesforce_id)
  WHERE legacy_salesforce_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_legacy_salesforce_id_key
  ON public.contacts (legacy_salesforce_id)
  WHERE legacy_salesforce_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_legacy_salesforce_id_key
  ON public.opportunities (legacy_salesforce_id)
  WHERE legacy_salesforce_id IS NOT NULL;
