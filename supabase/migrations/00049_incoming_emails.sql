-- =====================================================
-- MIGRATION 00049: Incoming Emails (Mail Bridge)
-- Description: Graph API email ingestion with auto-linking
-- =====================================================

-- =====================================================
-- PART 1: EMAIL LINK STATUS ENUM
-- =====================================================

DO $$ BEGIN
  CREATE TYPE email_link_status AS ENUM (
    'linked',        -- Matched to a customer
    'unidentified',  -- No customer match found
    'ignored',       -- Manually marked as irrelevant
    'pending'        -- Not yet processed
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PART 2: INCOMING EMAILS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS incoming_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Microsoft Graph metadata
  graph_message_id TEXT UNIQUE,        -- Graph API message ID (dedup key)
  conversation_id TEXT,                -- Graph conversation thread ID

  -- Email headers
  subject TEXT NOT NULL DEFAULT '(Intet emne)',
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  original_sender_email TEXT,          -- Extracted from forwarded body
  original_sender_name TEXT,           -- Extracted from forwarded body
  to_email TEXT,                       -- Mailbox that received it
  cc TEXT[] DEFAULT '{}',
  reply_to TEXT,

  -- Content
  body_html TEXT,
  body_text TEXT,                      -- Plain-text fallback
  body_preview TEXT,                   -- First ~200 chars for list view

  -- Attachments
  attachment_urls JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"filename": "...", "contentType": "...", "size": 123, "url": "..."}]
  has_attachments BOOLEAN DEFAULT false,

  -- Customer linking
  link_status email_link_status NOT NULL DEFAULT 'pending',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL,
  linked_by TEXT DEFAULT 'auto',       -- 'auto' or 'manual'
  linked_at TIMESTAMPTZ,

  -- AO product detection
  ao_product_matches JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"sku": "12345", "name": "...", "found_in": "body|subject", "current_price": 123.45}]
  has_ao_matches BOOLEAN DEFAULT false,

  -- Processing metadata
  is_read BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  is_forwarded BOOLEAN DEFAULT false,  -- Detected as a forwarded email
  processed_at TIMESTAMPTZ,            -- When linker ran
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PART 3: INDEXES
-- =====================================================

CREATE INDEX idx_incoming_emails_sender ON incoming_emails(sender_email);
CREATE INDEX idx_incoming_emails_original_sender ON incoming_emails(original_sender_email);
CREATE INDEX idx_incoming_emails_link_status ON incoming_emails(link_status);
CREATE INDEX idx_incoming_emails_customer ON incoming_emails(customer_id);
CREATE INDEX idx_incoming_emails_received ON incoming_emails(received_at DESC);
CREATE INDEX idx_incoming_emails_is_read ON incoming_emails(is_read) WHERE is_read = false;
CREATE INDEX idx_incoming_emails_has_ao ON incoming_emails(has_ao_matches) WHERE has_ao_matches = true;
CREATE INDEX idx_incoming_emails_graph_id ON incoming_emails(graph_message_id);

-- =====================================================
-- PART 4: GRAPH SYNC STATE TABLE
-- Tracks polling cursor for incremental fetches
-- =====================================================

CREATE TABLE IF NOT EXISTS graph_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox TEXT NOT NULL UNIQUE,        -- e.g. 'crm@eltasolar.dk'
  delta_link TEXT,                      -- Graph API deltaLink for incremental sync
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT DEFAULT 'never',-- 'success', 'failed', 'never'
  last_sync_error TEXT,
  emails_synced_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default mailbox
INSERT INTO graph_sync_state (mailbox) VALUES ('crm@eltasolar.dk')
ON CONFLICT (mailbox) DO NOTHING;

-- =====================================================
-- PART 5: TRIGGERS
-- =====================================================

CREATE TRIGGER trg_incoming_emails_updated
  BEFORE UPDATE ON incoming_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_graph_sync_state_updated
  BEFORE UPDATE ON graph_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 6: RLS POLICIES
-- =====================================================

ALTER TABLE incoming_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_sync_state ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write incoming emails
CREATE POLICY "incoming_emails_select" ON incoming_emails
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "incoming_emails_insert" ON incoming_emails
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "incoming_emails_update" ON incoming_emails
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "incoming_emails_delete" ON incoming_emails
  FOR DELETE TO authenticated USING (true);

-- Graph sync state: authenticated only
CREATE POLICY "graph_sync_state_select" ON graph_sync_state
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "graph_sync_state_update" ON graph_sync_state
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "graph_sync_state_insert" ON graph_sync_state
  FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================
-- PART 7: GRANTS
-- =====================================================

GRANT ALL ON incoming_emails TO authenticated;
GRANT ALL ON graph_sync_state TO authenticated;

-- Also allow service_role for cron jobs (bypasses RLS)
GRANT ALL ON incoming_emails TO service_role;
GRANT ALL ON graph_sync_state TO service_role;
