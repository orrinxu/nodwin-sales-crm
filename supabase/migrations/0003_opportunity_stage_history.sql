CREATE TYPE deal_stage AS ENUM (
  'qualify',
  'meet_and_present',
  'propose',
  'negotiate',
  'verbal_agreement',
  'closed_won',
  'closed_lost'
);

CREATE TABLE opportunity_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  from_stage deal_stage NOT NULL,
  to_stage deal_stage NOT NULL,
  event TEXT NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_osh_opportunity_id ON opportunity_stage_history (opportunity_id);
CREATE INDEX idx_osh_created_at ON opportunity_stage_history (created_at DESC);

ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stage history for their opportunities"
  ON opportunity_stage_history
  FOR SELECT
  USING (
    created_by = auth.uid()
  );

CREATE POLICY "Users can insert stage history for their opportunities"
  ON opportunity_stage_history
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
  );
