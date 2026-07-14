-- ORR-743: reclassify existing 'failed' documents whose failure was a
-- missing-source download error (the row has a storage_path/drive_file_id but the
-- underlying object is gone) as 'skipped'. These are un-indexable and were never
-- going to succeed on retry; leaving them 'failed' is permanent noise in the ops
-- view. Matches the exact messages the worker/data-layer store:
--   - "Failed to download document bytes: Object not found"   (Storage object missing)
--   - "... Object not found"                                   (defensive)
--   - "Document has neither a storage_path nor a drive_file_id" (no source at all)
-- Genuine extraction/embedding failures keep 'failed' (they may pass on retry).
UPDATE public.documents
SET index_status = 'skipped'
WHERE index_status = 'failed'
  AND (
    index_error ILIKE '%download document bytes%'
    OR index_error ILIKE '%object not found%'
    OR index_error ILIKE '%neither a storage_path nor a drive_file_id%'
  );
