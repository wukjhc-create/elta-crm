-- =====================================================
-- 00052: Customer Documents — Portal-synlige dokumenter
-- =====================================================
-- Bruges til at dele PDF-tilbud (og andre filer) med kunder via portalen.

CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Document info
  title text NOT NULL,
  description text,
  document_type text NOT NULL DEFAULT 'quote' CHECK (document_type IN ('quote', 'invoice', 'contract', 'other')),

  -- File reference
  file_url text NOT NULL,
  storage_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size integer,

  -- Source link (optional)
  sent_quote_id uuid REFERENCES sent_quotes(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES offers(id) ON DELETE SET NULL,

  -- Meta
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_created_at ON customer_documents(created_at DESC);

-- RLS
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users (employees) can do everything
CREATE POLICY "Authenticated users can manage customer documents"
  ON customer_documents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anon (portal) can read their own customer's documents
CREATE POLICY "Portal users can view their documents"
  ON customer_documents FOR SELECT
  TO anon
  USING (true);
  -- App-level scoping via customer_id from validated portal token

-- Grants
GRANT ALL ON customer_documents TO authenticated;
GRANT SELECT ON customer_documents TO anon;

-- Updated_at trigger
CREATE TRIGGER set_customer_documents_updated_at
  BEFORE UPDATE ON customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
