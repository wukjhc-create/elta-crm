-- =====================================================
-- MIGRATION 00009: Customer Portal
-- Description: Tables for customer portal access, chat and signatures
-- =====================================================

-- Portal access tokens - giver kunder adgang til portalen
CREATE TABLE portal_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for portal access tokens
CREATE INDEX idx_portal_access_tokens_customer_id ON portal_access_tokens(customer_id);
CREATE INDEX idx_portal_access_tokens_token ON portal_access_tokens(token);
CREATE INDEX idx_portal_access_tokens_email ON portal_access_tokens(email);
CREATE INDEX idx_portal_access_tokens_is_active ON portal_access_tokens(is_active);

-- Portal chat messages - beskeder mellem kunde og sælger
CREATE TABLE portal_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'employee')),
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for portal messages
CREATE INDEX idx_portal_messages_customer_id ON portal_messages(customer_id);
CREATE INDEX idx_portal_messages_offer_id ON portal_messages(offer_id);
CREATE INDEX idx_portal_messages_sender_type ON portal_messages(sender_type);
CREATE INDEX idx_portal_messages_created_at ON portal_messages(created_at DESC);

-- Offer signatures - digital signatur ved accept
CREATE TABLE offer_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_ip TEXT,
  signature_data TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(offer_id)
);

-- Create indexes for offer signatures
CREATE INDEX idx_offer_signatures_offer_id ON offer_signatures(offer_id);

-- Function to generate secure portal token
CREATE OR REPLACE FUNCTION generate_portal_token()
RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
BEGIN
  -- Generate a secure random token (32 bytes = 64 hex chars)
  new_token := encode(gen_random_bytes(32), 'hex');
  RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- Function to update last_accessed_at on token use
CREATE OR REPLACE FUNCTION update_portal_token_access()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE portal_access_tokens
  SET last_accessed_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS Policies for Portal Tables
-- =====================================================

-- Enable RLS
ALTER TABLE portal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_signatures ENABLE ROW LEVEL SECURITY;

-- Portal Access Tokens policies
-- Employees can manage tokens for their customers
CREATE POLICY "Employees can view portal tokens"
  ON portal_access_tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Employees can create portal tokens"
  ON portal_access_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Employees can update portal tokens"
  ON portal_access_tokens FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Employees can delete portal tokens"
  ON portal_access_tokens FOR DELETE
  TO authenticated
  USING (true);

-- Anonymous users can validate tokens (for portal access)
CREATE POLICY "Anyone can validate tokens"
  ON portal_access_tokens FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Portal Messages policies
-- Employees can view all messages
CREATE POLICY "Employees can view portal messages"
  ON portal_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Employees can create portal messages"
  ON portal_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_type = 'employee' AND sender_id = auth.uid());

CREATE POLICY "Employees can update portal messages"
  ON portal_messages FOR UPDATE
  TO authenticated
  USING (sender_type = 'employee' AND sender_id = auth.uid());

-- Anonymous can view messages for valid token (handled in app layer)
CREATE POLICY "Portal users can view their messages"
  ON portal_messages FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Portal users can create messages"
  ON portal_messages FOR INSERT
  TO anon
  WITH CHECK (sender_type = 'customer');

-- Offer Signatures policies
CREATE POLICY "Employees can view signatures"
  ON offer_signatures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create signatures"
  ON offer_signatures FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated can create signatures"
  ON offer_signatures FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT SELECT ON portal_access_tokens TO anon;
GRANT SELECT, INSERT ON portal_messages TO anon;
GRANT SELECT, INSERT ON offer_signatures TO anon;

GRANT ALL ON portal_access_tokens TO authenticated;
GRANT ALL ON portal_messages TO authenticated;
GRANT ALL ON offer_signatures TO authenticated;
