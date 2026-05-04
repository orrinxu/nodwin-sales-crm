-- Sandbox seed data — development and staging only.
-- Never run this against production.
-- All names, companies, and figures are fictional.

-- Truncate in dependency order before re-seeding.
TRUNCATE TABLE
  audit_log,
  opportunity_splits,
  opportunities,
  contacts,
  accounts
RESTART IDENTITY CASCADE;

-- Accounts
INSERT INTO accounts (id, name, entity, region, created_at) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Acme Corp',       'NG India',  'East Asia',   NOW()),
  ('a0000001-0000-0000-0000-000000000002', 'Globex Ltd',      'NG Spr',    'East Asia',   NOW()),
  ('a0000001-0000-0000-0000-000000000003', 'Initech Pte',     'Unpause',   'South Asia',  NOW());

-- Contacts
INSERT INTO contacts (id, account_id, first_name, last_name, email, created_at) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Alice', 'Tan',    'alice.tan@acme.example',    NOW()),
  ('c0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 'Bob',   'Lim',    'bob.lim@globex.example',     NOW()),
  ('c0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003', 'Carol', 'Singh',  'carol.singh@initech.example', NOW());

-- Opportunities
INSERT INTO opportunities (id, account_id, title, stage, amount, currency, close_date, created_at) VALUES
  ('o0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Acme Q3 Deal',    'qualification',  500000, 'SGD', NOW() + INTERVAL '60 days',  NOW()),
  ('o0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 'Globex Platform', 'proposal',      1200000, 'SGD', NOW() + INTERVAL '30 days',  NOW()),
  ('o0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003', 'Initech Renewal', 'negotiation',    300000, 'INR', NOW() + INTERVAL '14 days',  NOW());
