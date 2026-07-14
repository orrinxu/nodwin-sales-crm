-- ORR-733 (Voice/Text Record Generator, ORR-732 Track A) — add the account and
-- contact extraction AI features so per-feature provider selection + ai_usage
-- logging work for them, mirroring `opportunity_extraction` (ORR-674).
--
-- ADD VALUE is idempotent and kept in its own migration (a new enum value can't
-- be used in the same transaction it's added in).

ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'account_extraction';
ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'contact_extraction';
