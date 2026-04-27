-- =====================================================
-- Migration 00062: Service Cases Module
-- =====================================================

-- Sequence for case numbers
CREATE SEQUENCE IF NOT EXISTS service_case_number_seq START 1000;

CREATE TABLE IF NOT EXISTS service_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number TEXT NOT NULL DEFAULT ('SVC-' || LPAD(nextval('service_case_number_seq')::text, 5, '0')),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'pending', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('email', 'phone', 'portal', 'manual')),
  source_email_id UUID REFERENCES incoming_emails(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status_note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_cases_customer_id ON service_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_cases_status ON service_cases(status);
CREATE INDEX IF NOT EXISTS idx_service_cases_priority ON service_cases(priority);
CREATE INDEX IF NOT EXISTS idx_service_cases_created_at ON service_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_cases_assigned_to ON service_cases(assigned_to);

-- RLS
ALTER TABLE service_cases ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything
CREATE POLICY "Authenticated users can view service cases"
  ON service_cases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create service cases"
  ON service_cases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update service cases"
  ON service_cases FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete service cases"
  ON service_cases FOR DELETE TO authenticated USING (true);

-- Anon can view service cases (for portal)
CREATE POLICY "Anon can view service cases via portal"
  ON service_cases FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM portal_access_tokens
    WHERE portal_access_tokens.customer_id = service_cases.customer_id
    AND portal_access_tokens.is_active = true
  ));

GRANT ALL ON service_cases TO authenticated;
GRANT SELECT ON service_cases TO anon;
GRANT USAGE, SELECT ON SEQUENCE service_case_number_seq TO authenticated;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_service_case_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_cases_updated_at
  BEFORE UPDATE ON service_cases
  FOR EACH ROW EXECUTE FUNCTION update_service_case_updated_at();
