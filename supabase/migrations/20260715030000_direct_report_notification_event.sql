-- supabase/migrations/20260715030000_direct_report_notification_event.sql
--
-- Direct-reports self-service roster (ORR-715 / T-141) — part 1 of 2.
--
-- Adds the `direct_report_reassigned` notification event type, split from its
-- routing seed (part 2) because Postgres forbids USING a newly-added enum value in
-- the same transaction that adds it.
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'direct_report_reassigned';
