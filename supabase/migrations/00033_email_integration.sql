-- =====================================================
-- EMAIL INTEGRATION
-- =====================================================
-- Complete email system for ELTA CRM:
-- - email_templates: Reusable email templates
-- - email_threads: Conversation threads per offer/customer
-- - email_messages: Individual email messages with tracking
-- =====================================================

-- =====================================================
-- PART 1: EMAIL TEMPLATES
-- Reusable templates for different email types
-- =====================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  code TEXT UNIQUE NOT NULL, -- 'offer_send', 'offer_reminder', 'offer_accepted'
  name TEXT NOT NULL,
  description TEXT,

  -- Template type
  template_type TEXT NOT NULL DEFAULT 'offer', -- offer, reminder, notification, custom

  -- Content
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT,

  -- Variables available (for UI hints)
  available_variables JSONB DEFAULT '[]'::jsonb,
  -- e.g., ["customer_name", "offer_number", "total_amount", "portal_link"]

  -- Settings
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one default per type
CREATE UNIQUE INDEX idx_email_templates_default
ON email_templates(template_type)
WHERE is_default = true;

-- =====================================================
-- PART 2: EMAIL THREADS
-- Conversation threads linking offers and customers
-- =====================================================

CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,

  -- Thread info
  subject TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft → sent → opened → replied → closed

  -- Timestamps
  last_message_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,

  -- Metadata
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_threads_offer ON email_threads(offer_id);
CREATE INDEX idx_email_threads_customer ON email_threads(customer_id);
CREATE INDEX idx_email_threads_status ON email_threads(status);

-- =====================================================
-- PART 3: EMAIL MESSAGES
-- Individual emails with full tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent thread
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,

  -- Direction
  direction TEXT NOT NULL, -- 'outbound', 'inbound'

  -- Email headers
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  reply_to TEXT,
  cc TEXT[], -- Array of CC addresses
  bcc TEXT[], -- Array of BCC addresses

  -- Content
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,

  -- Template used (if any)
  template_id UUID REFERENCES email_templates(id),
  template_variables JSONB, -- Variables used when rendering

  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"filename": "tilbud.pdf", "size": 12345, "url": "..."}]

  -- Status & Tracking
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft → queued → sent → delivered → opened → clicked → bounced → failed

  -- External tracking
  message_id TEXT, -- SMTP Message-ID header
  tracking_id TEXT UNIQUE, -- For open/click tracking

  -- Timestamps
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Tracking stats
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- For inbound emails
  raw_email TEXT, -- Store raw email for debugging
  parsed_intent TEXT, -- 'accept', 'reject', 'question', 'unknown'

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX idx_email_messages_status ON email_messages(status);
CREATE INDEX idx_email_messages_tracking ON email_messages(tracking_id);
CREATE INDEX idx_email_messages_sent ON email_messages(sent_at DESC);

-- =====================================================
-- PART 4: EMAIL EVENTS (for detailed tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'

  -- Event metadata
  ip_address TEXT,
  user_agent TEXT,
  link_url TEXT, -- For click events
  bounce_type TEXT, -- 'hard', 'soft'
  bounce_reason TEXT,

  -- Timestamp
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_events_message ON email_events(message_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);

-- =====================================================
-- PART 5: FUNCTIONS & TRIGGERS
-- =====================================================

-- Update thread stats when message is added
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE email_threads SET
      message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.thread_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_thread_stats
AFTER INSERT ON email_messages
FOR EACH ROW EXECUTE FUNCTION update_thread_stats();

-- Update thread status when message status changes
CREATE OR REPLACE FUNCTION update_thread_on_message_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update thread when message is sent
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    UPDATE email_threads SET
      status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
      updated_at = NOW()
    WHERE id = NEW.thread_id;
  END IF;

  -- Update thread when message is opened
  IF NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL THEN
    UPDATE email_threads SET
      status = CASE WHEN status IN ('draft', 'sent') THEN 'opened' ELSE status END,
      last_opened_at = NEW.opened_at,
      updated_at = NOW()
    WHERE id = NEW.thread_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_thread_on_message_status
AFTER UPDATE ON email_messages
FOR EACH ROW EXECUTE FUNCTION update_thread_on_message_status();

-- Update message stats when event is logged
CREATE OR REPLACE FUNCTION update_message_on_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'opened' THEN
    UPDATE email_messages SET
      open_count = open_count + 1,
      opened_at = COALESCE(opened_at, NEW.occurred_at),
      status = CASE WHEN status IN ('sent', 'delivered') THEN 'opened' ELSE status END,
      updated_at = NOW()
    WHERE id = NEW.message_id;
  ELSIF NEW.event_type = 'clicked' THEN
    UPDATE email_messages SET
      click_count = click_count + 1,
      clicked_at = COALESCE(clicked_at, NEW.occurred_at),
      status = CASE WHEN status IN ('sent', 'delivered', 'opened') THEN 'clicked' ELSE status END,
      updated_at = NOW()
    WHERE id = NEW.message_id;
  ELSIF NEW.event_type = 'delivered' THEN
    UPDATE email_messages SET
      delivered_at = COALESCE(delivered_at, NEW.occurred_at),
      status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
      updated_at = NOW()
    WHERE id = NEW.message_id;
  ELSIF NEW.event_type = 'bounced' THEN
    UPDATE email_messages SET
      bounced_at = NEW.occurred_at,
      status = 'bounced',
      error_message = NEW.bounce_reason,
      updated_at = NOW()
    WHERE id = NEW.message_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_message_on_event
AFTER INSERT ON email_events
FOR EACH ROW EXECUTE FUNCTION update_message_on_event();

-- Auto-update updated_at
CREATE TRIGGER trg_email_templates_updated
BEFORE UPDATE ON email_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_email_threads_updated
BEFORE UPDATE ON email_threads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_email_messages_updated
BEFORE UPDATE ON email_messages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 6: RLS POLICIES
-- =====================================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Templates: all authenticated can read, only admins can modify
CREATE POLICY "email_templates_select" ON email_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_templates_insert" ON email_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "email_templates_update" ON email_templates
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "email_templates_delete" ON email_templates
  FOR DELETE TO authenticated USING (true);

-- Threads: authenticated users only
CREATE POLICY "email_threads_select" ON email_threads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_threads_insert" ON email_threads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "email_threads_update" ON email_threads
  FOR UPDATE TO authenticated USING (true);

-- Messages: authenticated users only
CREATE POLICY "email_messages_select" ON email_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_messages_insert" ON email_messages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "email_messages_update" ON email_messages
  FOR UPDATE TO authenticated USING (true);

-- Events: authenticated can read, system can write
CREATE POLICY "email_events_select" ON email_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_events_insert" ON email_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow anonymous for tracking pixel (public insert for events)
CREATE POLICY "email_events_anon_insert" ON email_events
  FOR INSERT TO anon WITH CHECK (true);

-- =====================================================
-- PART 7: SEED DEFAULT TEMPLATES
-- =====================================================

INSERT INTO email_templates (code, name, description, template_type, subject_template, body_html_template, body_text_template, available_variables, is_default, is_active) VALUES
(
  'offer_send',
  'Send tilbud',
  'Standard skabelon til at sende tilbud til kunder',
  'offer',
  'Tilbud {{offer_number}} fra {{company_name}}',
  E'<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #1a56db; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; background: #f9fafb; }
    .offer-box { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .amount { font-size: 28px; font-weight: bold; color: #1a56db; }
    .btn { display: inline-block; background: #1a56db; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .btn:hover { background: #1e40af; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .valid { color: #059669; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{company_name}}</h1>
  </div>
  <div class="content">
    <p>Kære {{customer_name}},</p>

    <p>Tak for din henvendelse. Vi har udarbejdet følgende tilbud til dig:</p>

    <div class="offer-box">
      <h2 style="margin-top: 0;">{{offer_title}}</h2>
      <p><strong>Tilbudsnummer:</strong> {{offer_number}}</p>
      <p class="amount">{{total_amount}}</p>
      <p class="valid">Gyldigt til: {{valid_until}}</p>
    </div>

    {{#if offer_description}}
    <p>{{offer_description}}</p>
    {{/if}}

    <p>Du kan se det fulde tilbud og acceptere det online ved at klikke på knappen nedenfor:</p>

    <p style="text-align: center;">
      <a href="{{portal_link}}" class="btn">Se tilbud</a>
    </p>

    <p>Har du spørgsmål, er du velkommen til at kontakte os.</p>

    <p>Med venlig hilsen,<br>
    {{sender_name}}<br>
    {{company_name}}</p>
  </div>
  <div class="footer">
    <p>{{company_name}} | {{company_email}} | {{company_phone}}</p>
    <p>{{company_address}}</p>
  </div>
  <img src="{{tracking_pixel}}" width="1" height="1" style="display:none" alt="">
</body>
</html>',
  E'Kære {{customer_name}},

Tak for din henvendelse. Vi har udarbejdet følgende tilbud til dig:

TILBUD: {{offer_title}}
Tilbudsnummer: {{offer_number}}
Beløb: {{total_amount}}
Gyldigt til: {{valid_until}}

{{offer_description}}

Se det fulde tilbud og accepter online:
{{portal_link}}

Har du spørgsmål, er du velkommen til at kontakte os.

Med venlig hilsen,
{{sender_name}}
{{company_name}}
{{company_email}} | {{company_phone}}',
  '["customer_name", "offer_number", "offer_title", "offer_description", "total_amount", "valid_until", "portal_link", "company_name", "company_email", "company_phone", "company_address", "sender_name", "tracking_pixel"]',
  true,
  true
),
(
  'offer_reminder',
  'Tilbudspåmindelse',
  'Påmindelse om tilbud der snart udløber',
  'reminder',
  'Påmindelse: Dit tilbud {{offer_number}} udløber snart',
  E'<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; background: #f9fafb; }
    .offer-box { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .urgent { color: #dc2626; font-weight: bold; font-size: 18px; }
    .btn { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Påmindelse</h1>
  </div>
  <div class="content">
    <p>Kære {{customer_name}},</p>

    <p>Vi vil gerne minde dig om, at dit tilbud snart udløber:</p>

    <div class="offer-box">
      <h2 style="margin-top: 0;">{{offer_title}}</h2>
      <p><strong>Tilbudsnummer:</strong> {{offer_number}}</p>
      <p><strong>Beløb:</strong> {{total_amount}}</p>
      <p class="urgent">Udløber: {{valid_until}}</p>
    </div>

    <p>Ønsker du at acceptere tilbuddet, kan du gøre det her:</p>

    <p style="text-align: center;">
      <a href="{{portal_link}}" class="btn">Se og accepter tilbud</a>
    </p>

    <p>Har du spørgsmål eller ønsker ændringer, så kontakt os gerne.</p>

    <p>Med venlig hilsen,<br>
    {{sender_name}}<br>
    {{company_name}}</p>
  </div>
  <div class="footer">
    <p>{{company_name}} | {{company_email}}</p>
  </div>
  <img src="{{tracking_pixel}}" width="1" height="1" style="display:none" alt="">
</body>
</html>',
  NULL,
  '["customer_name", "offer_number", "offer_title", "total_amount", "valid_until", "portal_link", "company_name", "company_email", "sender_name", "tracking_pixel"]',
  true,
  true
),
(
  'offer_accepted',
  'Tilbud accepteret - bekræftelse',
  'Bekræftelse når kunde accepterer tilbud',
  'notification',
  'Bekræftelse: Tilbud {{offer_number}} er accepteret',
  E'<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #059669; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; background: #f9fafb; }
    .success-box { background: #ecfdf5; border: 2px solid #059669; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .checkmark { font-size: 48px; color: #059669; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Tilbud accepteret!</h1>
  </div>
  <div class="content">
    <p>Kære {{customer_name}},</p>

    <div class="success-box">
      <div class="checkmark">✓</div>
      <h2>Tak for din ordre!</h2>
      <p>Tilbud {{offer_number}} er nu accepteret.</p>
    </div>

    <p><strong>Næste skridt:</strong></p>
    <ul>
      <li>Vi kontakter dig snarest for at aftale opstartsdato</li>
      <li>Du modtager en ordrebekræftelse separat</li>
      <li>Ved spørgsmål kan du altid kontakte os</li>
    </ul>

    <p>Vi glæder os til samarbejdet!</p>

    <p>Med venlig hilsen,<br>
    {{sender_name}}<br>
    {{company_name}}</p>
  </div>
  <div class="footer">
    <p>{{company_name}} | {{company_email}} | {{company_phone}}</p>
  </div>
</body>
</html>',
  NULL,
  '["customer_name", "offer_number", "company_name", "company_email", "company_phone", "sender_name"]',
  true,
  true
),
(
  'offer_rejected',
  'Tilbud afvist - opfølgning',
  'Opfølgning når kunde afviser tilbud',
  'notification',
  'Vedr. tilbud {{offer_number}}',
  E'<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #1a56db; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; background: #f9fafb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{company_name}}</h1>
  </div>
  <div class="content">
    <p>Kære {{customer_name}},</p>

    <p>Vi har registreret, at du har valgt ikke at gå videre med tilbud {{offer_number}}.</p>

    <p>Vi vil gerne høre, om der er noget, vi kan gøre anderledes, eller om du har spørgsmål til tilbuddet.</p>

    <p>Du er altid velkommen til at kontakte os, hvis du ønsker:</p>
    <ul>
      <li>Et revideret tilbud</li>
      <li>Yderligere information</li>
      <li>Alternative løsninger</li>
    </ul>

    <p>Tak fordi du overvejede os.</p>

    <p>Med venlig hilsen,<br>
    {{sender_name}}<br>
    {{company_name}}</p>
  </div>
  <div class="footer">
    <p>{{company_name}} | {{company_email}}</p>
  </div>
</body>
</html>',
  NULL,
  '["customer_name", "offer_number", "company_name", "company_email", "sender_name"]',
  false,
  true
);

-- =====================================================
-- GRANTS
-- =====================================================

GRANT ALL ON email_templates TO authenticated;
GRANT ALL ON email_threads TO authenticated;
GRANT ALL ON email_messages TO authenticated;
GRANT ALL ON email_events TO authenticated;
GRANT INSERT ON email_events TO anon;
