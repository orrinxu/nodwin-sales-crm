-- supabase/migrations/20260620000002_seed_account_custom_fields.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Seeds v1 custom fields for entity_type=account into field_definitions
-- per ORR-549. These are Finance/Ops fields defined in the Account
-- Gold Standard spec (ORR-547 §D–E).
--
-- Idempotent: uses ON CONFLICT (entity_type, key) DO UPDATE.

INSERT INTO public.field_definitions
  (entity_type, key, label, data_type, options, required, default_value, display_order, active)
VALUES
  ('account', 'payment_terms',   'Payment Terms',        'single_select', '["Net 30","Net 45","Net 60","Net 90"]'::jsonb, false, NULL,        1, true),
  ('account', 'tax_gst_in',      'GST Number (India)',   'text',          NULL,                                               false, NULL,        2, true),
  ('account', 'tax_pan_in',      'PAN (India)',          'text',          NULL,                                               false, NULL,        3, true),
  ('account', 'tax_vat_eu',      'VAT Number (EU)',      'text',          NULL,                                               false, NULL,        4, true),
  ('account', 'tax_trn_mena',    'TRN (MENA)',           'text',          NULL,                                               false, NULL,        5, true),
  ('account', 'phone_main',      'Main Phone',           'text',          NULL,                                               false, NULL,        6, true),
  ('account', 'hq_address',      'HQ / Registered Address', 'rich_text',  NULL,                                               false, NULL,        7, true),
  ('account', 'credit_risk_flag','Credit Risk Flag',     'boolean',       NULL,                                               false, 'false'::jsonb, 8, true)
ON CONFLICT (entity_type, key) DO UPDATE SET
  label         = EXCLUDED.label,
  data_type     = EXCLUDED.data_type,
  options       = EXCLUDED.options,
  required      = EXCLUDED.required,
  default_value = EXCLUDED.default_value,
  display_order = EXCLUDED.display_order,
  active        = EXCLUDED.active,
  updated_at    = now();
