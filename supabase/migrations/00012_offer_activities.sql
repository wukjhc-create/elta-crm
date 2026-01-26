-- =====================================================
-- MIGRATION 00012: Offer Activities
-- Description: Activity tracking/audit log for offers
-- =====================================================

-- Offer activities table (audit trail)
CREATE TABLE offer_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activities
CREATE INDEX idx_offer_activities_offer_id ON offer_activities(offer_id);
CREATE INDEX idx_offer_activities_created_at ON offer_activities(created_at DESC);
CREATE INDEX idx_offer_activities_performed_by ON offer_activities(performed_by);
CREATE INDEX idx_offer_activities_activity_type ON offer_activities(activity_type);

-- Enable RLS
ALTER TABLE offer_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view activities for offers they can view"
  ON offer_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE id = offer_activities.offer_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Users can create activities for their offers"
  ON offer_activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE id = offer_activities.offer_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Grant permissions
GRANT SELECT, INSERT ON offer_activities TO authenticated;
