-- Calculator templates table (simple JSONB structure)
CREATE TABLE IF NOT EXISTS calculator_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calculator_templates_created_by ON calculator_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_calculator_templates_is_default ON calculator_templates(is_default);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_calculator_templates_updated_at ON calculator_templates;
CREATE TRIGGER update_calculator_templates_updated_at
  BEFORE UPDATE ON calculator_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE calculator_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all templates" ON calculator_templates;
DROP POLICY IF EXISTS "Users can create templates" ON calculator_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON calculator_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON calculator_templates;

-- Everyone can view templates
CREATE POLICY "Users can view all templates"
  ON calculator_templates FOR SELECT
  TO authenticated
  USING (true);

-- Users can create templates
CREATE POLICY "Users can create templates"
  ON calculator_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own templates, admins can update all
CREATE POLICY "Users can update own templates"
  ON calculator_templates FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can delete their own templates, admins can delete all
CREATE POLICY "Users can delete own templates"
  ON calculator_templates FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
