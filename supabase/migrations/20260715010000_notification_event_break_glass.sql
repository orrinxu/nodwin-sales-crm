-- supabase/migrations/20260715010000_notification_event_break_glass.sql
--
-- Break-glass Confidential self-grant (ORR-716 / T-142) — part 1 of 2.
--
-- Adds the `confidential_break_glass` notification event type. This is split from
-- its routing seed (20260715020000) because Postgres forbids USING a newly-added
-- enum value in the same transaction that adds it ("unsafe use of new value").
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'confidential_break_glass';
