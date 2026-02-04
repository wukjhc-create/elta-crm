-- =====================================================
-- EXTERNAL ORDER SYSTEM INTEGRATIONS
-- =====================================================
-- Generic integration system for connecting to external
-- order management, ERP, and accounting systems
-- =====================================================

-- =====================================================
-- INTEGRATIONS TABLE
-- =====================================================
-- Stores configuration for each external integration

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  integration_type TEXT NOT NULL DEFAULT 'generic',
  -- Types: 'generic', 'economic', 'dinero', 'billy', 'webhook'

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- API Configuration
  base_url TEXT,
  api_key TEXT, -- Encrypted in production
  api_secret TEXT, -- Encrypted in production
  auth_type TEXT DEFAULT 'bearer',
  -- Auth types: 'none', 'bearer', 'basic', 'api_key', 'oauth2'
  auth_header_name TEXT DEFAULT 'Authorization',

  -- OAuth2 specific (if needed)
  oauth_token_url TEXT,
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMPTZ,

  -- Request configuration
  default_headers JSONB DEFAULT '{}',
  timeout_ms INTEGER DEFAULT 30000,
  retry_count INTEGER DEFAULT 3,

  -- Field mapping configuration
  field_mappings JSONB DEFAULT '{}',
  -- Structure: { "offer": { "local_field": "external_field" }, "project": {...} }

  -- Metadata
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INTEGRATION WEBHOOKS TABLE
-- =====================================================
-- Outbound webhook subscriptions - notify external systems on events

CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Webhook configuration
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',

  -- Event triggers
  event_type TEXT NOT NULL,
  -- Events: 'offer.created', 'offer.sent', 'offer.accepted', 'offer.rejected',
  --         'project.created', 'project.status_changed', 'project.completed',
  --         'invoice.created', 'custom'

  -- Filtering (optional)
  filter_conditions JSONB DEFAULT '{}',
  -- Example: { "status": ["accepted"], "min_amount": 10000 }

  -- Request configuration
  headers JSONB DEFAULT '{}',
  payload_template JSONB,
  -- If null, sends default payload; if set, uses template with {{variables}}

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Statistics
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INTEGRATION ENDPOINTS TABLE
-- =====================================================
-- Custom API endpoints for specific operations

CREATE TABLE IF NOT EXISTS integration_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Endpoint configuration
  name TEXT NOT NULL,
  description TEXT,
  endpoint_path TEXT NOT NULL,
  -- Relative to base_url, e.g., '/orders', '/invoices'

  http_method TEXT NOT NULL DEFAULT 'POST',

  -- Operation type
  operation TEXT NOT NULL,
  -- Operations: 'create_order', 'update_order', 'get_order', 'create_invoice',
  --             'sync_products', 'sync_customers', 'custom'

  -- Request/Response configuration
  request_template JSONB,
  response_mapping JSONB,
  -- Maps response fields back to local fields

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INTEGRATION LOGS TABLE
-- =====================================================
-- Activity and error logging for all integration operations

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,

  -- Log details
  log_type TEXT NOT NULL,
  -- Types: 'webhook_sent', 'webhook_received', 'api_call', 'sync', 'error'

  event_type TEXT,
  -- The event that triggered this log

  -- Related entities
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Request details
  request_url TEXT,
  request_method TEXT,
  request_headers JSONB,
  request_body JSONB,

  -- Response details
  response_status INTEGER,
  response_headers JSONB,
  response_body JSONB,

  -- Result
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,

  -- Metadata
  triggered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INTEGRATION QUEUE TABLE
-- =====================================================
-- Queue for async/retry operations

CREATE TABLE IF NOT EXISTS integration_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE CASCADE,

  -- Queue item details
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,

  -- Related entities
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  -- Statuses: 'pending', 'processing', 'completed', 'failed', 'cancelled'

  -- Retry handling
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  -- Timestamps
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- EXTERNAL ORDER REFERENCES TABLE
-- =====================================================
-- Maps local entities to external system IDs

CREATE TABLE IF NOT EXISTS external_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Local entity
  entity_type TEXT NOT NULL,
  -- Types: 'offer', 'project', 'customer', 'product', 'invoice'
  entity_id UUID NOT NULL,

  -- External reference
  external_id TEXT NOT NULL,
  external_number TEXT, -- Human-readable number if different
  external_url TEXT, -- Direct link to external system

  -- Sync status
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'synced',
  -- Statuses: 'synced', 'pending', 'conflict', 'error'

  -- Metadata from external system
  external_data JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one external ref per entity per integration
  UNIQUE(integration_id, entity_type, entity_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_integrations_active ON integrations(is_active) WHERE is_active = true;
CREATE INDEX idx_integration_webhooks_integration ON integration_webhooks(integration_id);
CREATE INDEX idx_integration_webhooks_event ON integration_webhooks(event_type) WHERE is_active = true;
CREATE INDEX idx_integration_endpoints_integration ON integration_endpoints(integration_id);
CREATE INDEX idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX idx_integration_logs_offer ON integration_logs(offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX idx_integration_logs_project ON integration_logs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_integration_queue_status ON integration_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_integration_queue_next_attempt ON integration_queue(next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_external_references_entity ON external_references(entity_type, entity_id);
CREATE INDEX idx_external_references_external ON external_references(integration_id, external_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_webhooks_updated_at
  BEFORE UPDATE ON integration_webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_endpoints_updated_at
  BEFORE UPDATE ON integration_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_references_updated_at
  BEFORE UPDATE ON external_references
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_references ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage integrations
CREATE POLICY "authenticated_manage_integrations"
  ON integrations FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_manage_integration_webhooks"
  ON integration_webhooks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_manage_integration_endpoints"
  ON integration_endpoints FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_integration_logs"
  ON integration_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_integration_logs"
  ON integration_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_manage_integration_queue"
  ON integration_queue FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_manage_external_references"
  ON external_references FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Service role for webhooks (anonymous inserts to logs)
CREATE POLICY "service_insert_integration_logs"
  ON integration_logs FOR INSERT TO anon
  WITH CHECK (true);

-- =====================================================
-- GRANTS
-- =====================================================

GRANT ALL ON integrations TO authenticated;
GRANT ALL ON integration_webhooks TO authenticated;
GRANT ALL ON integration_endpoints TO authenticated;
GRANT SELECT, INSERT ON integration_logs TO authenticated;
GRANT INSERT ON integration_logs TO anon;
GRANT ALL ON integration_queue TO authenticated;
GRANT ALL ON external_references TO authenticated;

-- =====================================================
-- SEED DEFAULT WEBHOOK EVENT TYPES (as comment reference)
-- =====================================================
-- Available event types:
-- Offers:
--   'offer.created'    - New offer created
--   'offer.updated'    - Offer modified
--   'offer.sent'       - Offer sent to customer
--   'offer.viewed'     - Customer viewed offer
--   'offer.accepted'   - Customer accepted offer
--   'offer.rejected'   - Customer rejected offer
--   'offer.expired'    - Offer validity expired
--
-- Projects:
--   'project.created'        - New project created
--   'project.updated'        - Project modified
--   'project.status_changed' - Project status changed
--   'project.completed'      - Project marked complete
--   'project.cancelled'      - Project cancelled
--
-- Customers:
--   'customer.created' - New customer created
--   'customer.updated' - Customer modified
--
-- Custom:
--   'custom' - Custom event with filter conditions
