-- supabase/migrations/20260604000000_add_contact_status.sql
-- Add status column to contacts table.
-- (ORR-437)
--
-- Idempotent: safe to re-run.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Constrain to known status values.
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_status_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('active', 'inactive', 'lead', 'customer', 'archived'));
