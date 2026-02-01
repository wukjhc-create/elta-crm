-- =====================================================
-- SMS INTEGRATION (GatewayAPI)
-- =====================================================
-- Complete SMS system for ELTA CRM:
-- - sms_templates: Reusable SMS templates
-- - sms_messages: Individual SMS messages with tracking
-- - sms_events: Delivery status events
-- =====================================================

-- =====================================================
-- PART 1: SMS TEMPLATES
-- Reusable templates for different SMS types
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  code TEXT UNIQUE NOT NULL, -- 'offer_send', 'offer_reminder', 'offer_accepted'
  name TEXT NOT NULL,
  description TEXT,

  -- Template type
  template_type TEXT NOT NULL DEFAULT 'offer', -- offer, reminder, notification, custom

  -- Content (SMS is plain text only, max 160 chars for single SMS)
  message_template TEXT NOT NULL,

  -- Variables available (for UI hints)
  available_variables JSONB DEFAULT '[]'::jsonb,
  -- e.g., ["customer_name", "offer_number", "portal_link"]

  -- Settings
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one default per type
CREATE UNIQUE INDEX idx_sms_templates_default
ON sms_templates(template_type)
WHERE is_default = true;

-- =====================================================
-- PART 2: SMS MESSAGES
-- Individual SMS messages with full tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Recipient
  to_phone TEXT NOT NULL,
  to_name TEXT,

  -- Sender
  from_name TEXT, -- Sender ID (max 11 chars alphanumeric)

  -- Content
  message TEXT NOT NULL,

  -- Template used (if any)
  template_id UUID REFERENCES sms_templates(id),
  template_variables JSONB,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → queued → sent → delivered → failed

  -- GatewayAPI tracking
  gateway_id TEXT, -- GatewayAPI message ID
  gateway_status TEXT, -- Raw status from GatewayAPI

  -- Timestamps
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Error handling
  error_message TEXT,
  error_code TEXT,

  -- Cost tracking (in DKK øre)
  cost INTEGER,
  parts_count INTEGER DEFAULT 1, -- Number of SMS parts (for long messages)

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_messages_offer ON sms_messages(offer_id);
CREATE INDEX idx_sms_messages_customer ON sms_messages(customer_id);
CREATE INDEX idx_sms_messages_status ON sms_messages(status);
CREATE INDEX idx_sms_messages_gateway ON sms_messages(gateway_id);
CREATE INDEX idx_sms_messages_sent ON sms_messages(sent_at DESC);

-- =====================================================
-- PART 3: SMS EVENTS (for webhook tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message_id UUID NOT NULL REFERENCES sms_messages(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL, -- 'queued', 'sent', 'delivered', 'failed', 'undelivered'

  -- Event metadata from GatewayAPI
  gateway_status TEXT,
  gateway_error_code TEXT,
  gateway_error_message TEXT,

  -- Raw webhook payload
  raw_payload JSONB,

  -- Timestamp
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_events_message ON sms_events(message_id);
CREATE INDEX idx_sms_events_type ON sms_events(event_type);

-- =====================================================
-- PART 4: FUNCTIONS & TRIGGERS
-- =====================================================

-- Update message status from events
CREATE OR REPLACE FUNCTION update_sms_message_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the message based on event type
  UPDATE sms_messages SET
    status = CASE
      WHEN NEW.event_type = 'delivered' THEN 'delivered'
      WHEN NEW.event_type = 'failed' THEN 'failed'
      WHEN NEW.event_type = 'undelivered' THEN 'failed'
      WHEN NEW.event_type = 'sent' THEN 'sent'
      WHEN NEW.event_type = 'queued' THEN 'queued'
      ELSE status
    END,
    delivered_at = CASE WHEN NEW.event_type = 'delivered' THEN NEW.occurred_at ELSE delivered_at END,
    failed_at = CASE WHEN NEW.event_type IN ('failed', 'undelivered') THEN NEW.occurred_at ELSE failed_at END,
    error_message = COALESCE(NEW.gateway_error_message, error_message),
    error_code = COALESCE(NEW.gateway_error_code, error_code),
    gateway_status = COALESCE(NEW.gateway_status, gateway_status),
    updated_at = NOW()
  WHERE id = NEW.message_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sms_event_update_status
AFTER INSERT ON sms_events
FOR EACH ROW
EXECUTE FUNCTION update_sms_message_status();

-- Update timestamps
CREATE TRIGGER set_sms_templates_updated_at
BEFORE UPDATE ON sms_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_sms_messages_updated_at
BEFORE UPDATE ON sms_messages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 5: RLS POLICIES
-- =====================================================

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_events ENABLE ROW LEVEL SECURITY;

-- SMS Templates: Authenticated users can manage
CREATE POLICY "sms_templates_select" ON sms_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_templates_insert" ON sms_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sms_templates_update" ON sms_templates
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "sms_templates_delete" ON sms_templates
  FOR DELETE TO authenticated USING (true);

-- SMS Messages: Authenticated users can manage
CREATE POLICY "sms_messages_select" ON sms_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_messages_insert" ON sms_messages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sms_messages_update" ON sms_messages
  FOR UPDATE TO authenticated USING (true);

-- SMS Events: Authenticated can read, anon can insert (for webhooks)
CREATE POLICY "sms_events_select" ON sms_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sms_events_insert_authenticated" ON sms_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sms_events_insert_anon" ON sms_events
  FOR INSERT TO anon WITH CHECK (true);

-- =====================================================
-- PART 6: SEED DEFAULT TEMPLATES
-- =====================================================

INSERT INTO sms_templates (code, name, description, template_type, message_template, available_variables, is_default, is_active) VALUES
(
  'offer_send',
  'Send tilbud',
  'SMS når tilbud sendes til kunde',
  'offer',
  'Hej {{customer_name}}! Vi har sendt dig et tilbud. Se det her: {{portal_link}} - Mvh {{company_name}}',
  '["customer_name", "offer_number", "portal_link", "company_name"]',
  true,
  true
),
(
  'offer_reminder',
  'Påmindelse om tilbud',
  'Påmindelse til kunde om ubesvaret tilbud',
  'reminder',
  'Hej {{customer_name}}! Husk at se dit tilbud fra {{company_name}}: {{portal_link}} - Gyldig til {{valid_until}}',
  '["customer_name", "offer_number", "portal_link", "company_name", "valid_until"]',
  true,
  true
),
(
  'offer_accepted',
  'Tilbud accepteret',
  'Bekræftelse når kunde accepterer tilbud',
  'notification',
  'Tak {{customer_name}}! Vi har modtaget din accept af tilbud {{offer_number}}. Vi kontakter dig snarest. - {{company_name}}',
  '["customer_name", "offer_number", "company_name"]',
  true,
  true
),
(
  'offer_rejected',
  'Tilbud afvist',
  'Opfølgning når kunde afviser tilbud',
  'followup',
  'Hej {{customer_name}}. Tak for din tilbagemelding på tilbud {{offer_number}}. Kontakt os gerne hvis du har spørgsmål. - {{company_name}}',
  '["customer_name", "offer_number", "company_name"]',
  false,
  true
);

-- =====================================================
-- PART 7: ADD SMS SETTINGS TO COMPANY_SETTINGS
-- =====================================================

-- Add SMS configuration columns to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS sms_gateway_api_key TEXT,
ADD COLUMN IF NOT EXISTS sms_gateway_secret TEXT,
ADD COLUMN IF NOT EXISTS sms_sender_name TEXT DEFAULT 'Elta Solar',
ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false;

-- =====================================================
-- GRANTS
-- =====================================================

GRANT ALL ON sms_templates TO authenticated;
GRANT ALL ON sms_messages TO authenticated;
GRANT ALL ON sms_events TO authenticated;
GRANT INSERT ON sms_events TO anon;
