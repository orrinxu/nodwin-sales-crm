-- supabase/migrations/20260702000000_activities_contact_id.sql
-- Tier-1 #3: log activities from the contact view.
--
-- Adds an optional contact_id to public.activities so an activity can be logged
-- against a specific contact (not just an account/opportunity). Purely additive:
-- the column is nullable and existing rows are unaffected.
--
-- Visibility: no RLS change. Contact-scoped activities are created with the
-- contact's primary account_id populated, so the existing account-level SELECT
-- policy (see 20260619000006_confidential_tier_admin_masking.sql) plus the
-- author fallback (user_id = auth.uid()) already covers who can read them.
-- The activities INSERT policy remains author-or-admin (user_id = auth.uid()).

ALTER TABLE public.activities
  ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_activities_contact_id
  ON public.activities (contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN public.activities.contact_id IS
  'Optional contact this activity is logged against (Tier-1 #3). Visibility flows through account_id + author; see confidential-tier SELECT policy.';
