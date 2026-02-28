-- =====================================================
-- 00051: Sent Quotes — "Den Gyldne Knap" quote logging
-- =====================================================

-- Sequence for quote reference numbers
CREATE SEQUENCE IF NOT EXISTS quote_ref_seq START 1;

-- Function to generate quote reference: TILBUD-YYYY-NNNN
CREATE OR REPLACE FUNCTION nextval_quote_ref()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val bigint;
  year_str text;
BEGIN
  seq_val := nextval('quote_ref_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'TILBUD-' || year_str || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- Main table
CREATE TABLE IF NOT EXISTS sent_quotes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reference
  quote_reference text NOT NULL UNIQUE DEFAULT nextval_quote_ref(),
  template_type text NOT NULL CHECK (template_type IN ('sales', 'installation')),

  -- Customer snapshot
  customer_email text NOT NULL,
  customer_name text,
  customer_company text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  incoming_email_id uuid REFERENCES incoming_emails(id) ON DELETE SET NULL,

  -- Content
  title text NOT NULL,
  description text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  solar_data jsonb,
  notes text,

  -- Financials
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_percentage numeric(5,2) NOT NULL DEFAULT 25,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 30,
  valid_until date,

  -- PDF
  pdf_storage_path text,
  pdf_public_url text,

  -- Sender
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sent_quotes_customer_email ON sent_quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_customer_id ON sent_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_created_at ON sent_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_incoming_email_id ON sent_quotes(incoming_email_id);

-- RLS
ALTER TABLE sent_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sent quotes"
  ON sent_quotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sent quotes"
  ON sent_quotes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT ON sent_quotes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE quote_ref_seq TO authenticated;

-- Updated_at trigger
CREATE TRIGGER set_sent_quotes_updated_at
  BEFORE UPDATE ON sent_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
