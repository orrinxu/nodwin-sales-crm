-- supabase/migrations/20260715060000_drive_folder_sync.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
-- Idempotent: safe to re-run.
--
-- ORR-698 Google Drive server-side sync. Persists the Drive folder auto-created
-- for each opportunity so the sync is idempotent (a null id means "not yet
-- synced"; the drain picks those up). Nullable + no default: rows are unsynced
-- until the Drive integration is configured and runs.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS drive_folder_id text;
