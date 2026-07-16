-- supabase/migrations/20260715110000_tasks.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-725: tasks / follow-ups with due dates.
--
-- A real task entity (distinct from the 'task' activity type, which has no due
-- date). A task can optionally link to a deal, account, or contact — or be a
-- standalone to-do — and is assignable to any user (defaults to the creator).
--
-- RLS: a user sees/edits tasks assigned to them or created by them; admins see
-- all. Creators can delete. (Not fenced by a linked deal's confidentiality — the
-- task is the assignee's own work item, keyed on user, not deal data.)
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.tasks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL CHECK (length(trim(title)) > 0),
  description      text,
  due_date         date,
  status           text        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'done')),
  priority         text        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low', 'normal', 'high')),
  assignee_user_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Optional polymorphic link — at most one is typically set; all nullable so a
  -- task can be standalone.
  opportunity_id   uuid        REFERENCES public.opportunities(id) ON DELETE CASCADE,
  account_id       uuid        REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id       uuid        REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS
  'Tasks / follow-ups with due dates (ORR-725). Assignable; optional link to a deal/account/contact.';

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_open
  ON public.tasks (assignee_user_id, due_date)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_opportunity_id
  ON public.tasks (opportunity_id) WHERE opportunity_id IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_tasks_timestamps()
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

DROP TRIGGER IF EXISTS tasks_timestamps ON public.tasks;
CREATE TRIGGER tasks_timestamps
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_tasks_timestamps();

-- ── Audit ────────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.tasks');

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
CREATE POLICY "tasks_select_own"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(opportunity_id))
  );

DROP POLICY IF EXISTS "tasks_insert_creator" ON public.tasks;
CREATE POLICY "tasks_insert_creator"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
CREATE POLICY "tasks_update_own"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(opportunity_id))
  )
  WITH CHECK (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(opportunity_id))
  );

DROP POLICY IF EXISTS "tasks_delete_creator" ON public.tasks;
CREATE POLICY "tasks_delete_creator"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(opportunity_id))
  );

DROP POLICY IF EXISTS "tasks_service_role" ON public.tasks;
CREATE POLICY "tasks_service_role"
  ON public.tasks
  TO service_role
  USING (true)
  WITH CHECK (true);
