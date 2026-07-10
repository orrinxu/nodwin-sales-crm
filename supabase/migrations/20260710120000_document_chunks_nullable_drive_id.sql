-- supabase/migrations/20260710120000_document_chunks_nullable_drive_id.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RAG ingestion fix (Storage byte source). document_chunks.drive_file_id was
-- NOT NULL from ORR-620, when documents were Drive-canonical. Since ORR-653 the
-- bytes live in Supabase Storage and a document may have no Drive id at all, so
-- chunks for a directly-uploaded document carry a null drive_file_id. Relax the
-- constraint — document_id remains the canonical provenance pointer.
--
-- Idempotent: DROP NOT NULL is a no-op if the column is already nullable.

ALTER TABLE public.document_chunks
  ALTER COLUMN drive_file_id DROP NOT NULL;
