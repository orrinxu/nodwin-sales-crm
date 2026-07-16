-- pgTAP: Drive folder sync schema (ORR-698)
-- Verifies the drive_folder_id column added by 20260715060000_drive_folder_sync.sql.
BEGIN;
SELECT plan(2);

SELECT has_column('public', 'opportunities', 'drive_folder_id', 'opportunities has drive_folder_id');
SELECT col_is_null('public', 'opportunities', 'drive_folder_id', 'drive_folder_id is nullable (unsynced until the drain runs)');

SELECT * FROM finish();
ROLLBACK;
