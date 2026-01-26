-- =====================================================
-- MIGRATION 00013: Company Settings
-- Description: Singleton table for company configuration
-- =====================================================

-- Company settings table (singleton)
CREATE TABLE company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Company info
  company_name TEXT NOT NULL DEFAULT 'Elta Solar ApS',
  company_address TEXT,
  company_city TEXT,
  company_postal_code TEXT,
  company_country TEXT DEFAULT 'Danmark',
  company_phone TEXT,
  company_email TEXT,
  company_vat_number TEXT,
  company_logo_url TEXT,
  company_website TEXT,

  -- SMTP settings (encrypted in production)
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_from_email TEXT,
  smtp_from_name TEXT,

  -- Default values
  default_tax_percentage DECIMAL(5, 2) DEFAULT 25.0,
  default_currency TEXT DEFAULT 'DKK',
  default_offer_validity_days INTEGER DEFAULT 30,
  default_terms_and_conditions TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists (singleton pattern)
CREATE UNIQUE INDEX company_settings_singleton ON company_settings ((true));

-- Insert default row
INSERT INTO company_settings (
  company_name,
  company_email,
  company_vat_number,
  default_terms_and_conditions
) VALUES (
  'Elta Solar ApS',
  'kontakt@eltasolar.dk',
  '12345678',
  'Betalingsbetingelser: Netto 14 dage.
Leveringsbetingelser: Levering sker ab fabrik.
Forbehold: Der tages forbehold for prisændringer, trykfejl og udsolgte varer.
Ejendomsforbehold: Varen forbliver sælgers ejendom indtil fuld betaling er modtaget.'
);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - All authenticated users can read
CREATE POLICY "All authenticated users can view company settings"
  ON company_settings FOR SELECT
  USING (true);

-- Only admins can update
CREATE POLICY "Only admins can update company settings"
  ON company_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT ON company_settings TO authenticated;
GRANT UPDATE ON company_settings TO authenticated;
