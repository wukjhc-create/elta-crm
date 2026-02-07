-- =====================================================
-- 00044_supplier_credentials.sql
-- Secure Supplier Credential Storage
-- Encrypted API keys, usernames, passwords for AO/LM
-- =====================================================

-- =====================================================
-- 1. SUPPLIER CREDENTIALS TABLE
-- Separate table for sensitive credentials with encryption
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('api', 'ftp', 'web')),

  -- Connection details
  api_endpoint TEXT,

  -- Encrypted credentials (stored as encrypted JSON)
  -- Format: {"username": "...", "password": "...", "api_key": "...", "client_id": "...", "client_secret": "..."}
  credentials_encrypted TEXT NOT NULL,

  -- Encryption metadata
  encryption_key_id TEXT, -- Reference to which key was used
  encryption_algorithm TEXT DEFAULT 'aes-256-gcm',

  -- Connection status
  is_active BOOLEAN DEFAULT true,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT CHECK (last_test_status IN ('success', 'failed', 'timeout', 'invalid_credentials')),
  last_test_error TEXT,

  -- Token caching (for OAuth flows)
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_encrypted TEXT,

  -- Rate limiting
  rate_limit_remaining INTEGER,
  rate_limit_reset_at TIMESTAMPTZ,

  -- Metadata
  environment TEXT DEFAULT 'production' CHECK (environment IN ('production', 'sandbox', 'test')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(supplier_id, credential_type, environment)
);

CREATE INDEX IF NOT EXISTS idx_supplier_credentials_supplier_id ON supplier_credentials(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credentials_active ON supplier_credentials(is_active) WHERE is_active = true;

CREATE TRIGGER update_supplier_credentials_updated_at
  BEFORE UPDATE ON supplier_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. SUPPLIER MARGIN RULES TABLE
-- Configurable margin rules per supplier/category/product
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_margin_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

  -- Rule scope (more specific = higher priority)
  rule_type TEXT NOT NULL CHECK (rule_type IN ('supplier', 'category', 'subcategory', 'product', 'customer')),
  category TEXT, -- For category/subcategory rules
  sub_category TEXT,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE CASCADE, -- For product rules
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE, -- For customer rules

  -- Margin settings
  margin_percentage NUMERIC(5,2) NOT NULL,
  min_margin_percentage NUMERIC(5,2),
  max_margin_percentage NUMERIC(5,2),

  -- Additional pricing adjustments
  fixed_markup NUMERIC(12,2) DEFAULT 0, -- Fixed amount to add
  round_to NUMERIC(10,2), -- Round final price to nearest (e.g., 5 for 5 DKK)

  -- Validity
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true,

  -- Priority (higher = more important)
  priority INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_margin_rules_supplier_id ON supplier_margin_rules(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_margin_rules_type ON supplier_margin_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_supplier_margin_rules_category ON supplier_margin_rules(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_margin_rules_active ON supplier_margin_rules(is_active) WHERE is_active = true;

CREATE TRIGGER update_supplier_margin_rules_updated_at
  BEFORE UPDATE ON supplier_margin_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. SUPPLIER SYNC SCHEDULE TABLE
-- Cron-based sync scheduling per supplier
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_sync_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

  -- Schedule configuration
  schedule_name TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full_catalog', 'price_update', 'availability', 'incremental')),
  cron_expression TEXT NOT NULL, -- e.g., '0 3 * * *' for 3 AM daily
  timezone TEXT DEFAULT 'Europe/Copenhagen',

  -- Execution settings
  is_enabled BOOLEAN DEFAULT true,
  max_duration_minutes INTEGER DEFAULT 60,
  retry_on_failure BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,
  retry_delay_minutes INTEGER DEFAULT 15,

  -- Last execution info
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'partial', 'skipped', 'running')),
  last_run_duration_ms INTEGER,
  last_run_items_processed INTEGER,
  next_run_at TIMESTAMPTZ,

  -- Notifications
  notify_on_failure BOOLEAN DEFAULT true,
  notify_email TEXT,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(supplier_id, sync_type)
);

CREATE INDEX IF NOT EXISTS idx_supplier_sync_schedules_supplier_id ON supplier_sync_schedules(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_schedules_enabled ON supplier_sync_schedules(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_supplier_sync_schedules_next_run ON supplier_sync_schedules(next_run_at) WHERE is_enabled = true;

CREATE TRIGGER update_supplier_sync_schedules_updated_at
  BEFORE UPDATE ON supplier_sync_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. SUPPLIER PRODUCT CACHE TABLE
-- Cached product data for offline fallback
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_product_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,

  -- Cached data snapshot
  cached_cost_price NUMERIC(12,2),
  cached_list_price NUMERIC(12,2),
  cached_is_available BOOLEAN,
  cached_stock_quantity INTEGER,
  cached_lead_time_days INTEGER,

  -- Cache metadata
  cached_at TIMESTAMPTZ DEFAULT now(),
  cache_source TEXT CHECK (cache_source IN ('api', 'import', 'manual')),
  cache_expires_at TIMESTAMPTZ,
  is_stale BOOLEAN DEFAULT false,

  -- Fallback priority
  fallback_priority INTEGER DEFAULT 0, -- Higher = more recent/reliable

  UNIQUE(supplier_product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_product_cache_product_id ON supplier_product_cache(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_product_cache_stale ON supplier_product_cache(is_stale) WHERE is_stale = false;
CREATE INDEX IF NOT EXISTS idx_supplier_product_cache_expires ON supplier_product_cache(cache_expires_at);

-- =====================================================
-- 5. OFFER LINE ITEM SUPPLIER TRACKING
-- Track which supplier product was used in offers
-- =====================================================

ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS supplier_product_id UUID REFERENCES supplier_products(id),
  ADD COLUMN IF NOT EXISTS supplier_cost_price_at_creation NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS supplier_margin_applied NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS supplier_name_at_creation TEXT;

CREATE INDEX IF NOT EXISTS idx_offer_line_items_supplier_product ON offer_line_items(supplier_product_id) WHERE supplier_product_id IS NOT NULL;

-- =====================================================
-- 6. FUNCTION: Get Effective Margin for Product
-- Returns the applicable margin based on rules hierarchy
-- =====================================================

CREATE OR REPLACE FUNCTION get_effective_margin(
  p_supplier_id UUID,
  p_supplier_product_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_sub_category TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  margin_percentage NUMERIC(5,2),
  fixed_markup NUMERIC(12,2),
  round_to NUMERIC(10,2),
  rule_type TEXT,
  rule_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.margin_percentage,
    r.fixed_markup,
    r.round_to,
    r.rule_type,
    r.id AS rule_id
  FROM supplier_margin_rules r
  WHERE r.supplier_id = p_supplier_id
    AND r.is_active = true
    AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
    AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
    AND (
      -- Match by priority (most specific first)
      (r.rule_type = 'product' AND r.supplier_product_id = p_supplier_product_id)
      OR (r.rule_type = 'customer' AND r.customer_id = p_customer_id)
      OR (r.rule_type = 'subcategory' AND r.category = p_category AND r.sub_category = p_sub_category)
      OR (r.rule_type = 'category' AND r.category = p_category)
      OR (r.rule_type = 'supplier')
    )
  ORDER BY
    CASE r.rule_type
      WHEN 'product' THEN 1
      WHEN 'customer' THEN 2
      WHEN 'subcategory' THEN 3
      WHEN 'category' THEN 4
      WHEN 'supplier' THEN 5
    END,
    r.priority DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. FUNCTION: Calculate Sale Price with Margin
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_sale_price(
  p_cost_price NUMERIC(12,2),
  p_supplier_id UUID,
  p_supplier_product_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_sub_category TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS NUMERIC(12,2) AS $$
DECLARE
  v_margin RECORD;
  v_sale_price NUMERIC(12,2);
BEGIN
  -- Get effective margin
  SELECT * INTO v_margin
  FROM get_effective_margin(p_supplier_id, p_supplier_product_id, p_category, p_sub_category, p_customer_id);

  IF v_margin IS NULL THEN
    -- Default 25% margin if no rule found
    RETURN p_cost_price * 1.25;
  END IF;

  -- Calculate base sale price with margin
  v_sale_price := p_cost_price * (1 + v_margin.margin_percentage / 100);

  -- Add fixed markup
  v_sale_price := v_sale_price + COALESCE(v_margin.fixed_markup, 0);

  -- Round if specified
  IF v_margin.round_to IS NOT NULL AND v_margin.round_to > 0 THEN
    v_sale_price := ROUND(v_sale_price / v_margin.round_to) * v_margin.round_to;
  END IF;

  RETURN v_sale_price;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. FUNCTION: Get Cached Price (Fallback)
-- =====================================================

CREATE OR REPLACE FUNCTION get_cached_product_price(p_supplier_product_id UUID)
RETURNS TABLE (
  cost_price NUMERIC(12,2),
  list_price NUMERIC(12,2),
  is_available BOOLEAN,
  stock_quantity INTEGER,
  cached_at TIMESTAMPTZ,
  is_stale BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.cached_cost_price,
    pc.cached_list_price,
    pc.cached_is_available,
    pc.cached_stock_quantity,
    pc.cached_at,
    pc.is_stale OR pc.cache_expires_at < NOW()
  FROM supplier_product_cache pc
  WHERE pc.supplier_product_id = p_supplier_product_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. RLS POLICIES
-- =====================================================

ALTER TABLE supplier_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_margin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sync_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_product_cache ENABLE ROW LEVEL SECURITY;

-- Credentials (restricted access)
CREATE POLICY "Authenticated users can view supplier credentials"
  ON supplier_credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage supplier credentials"
  ON supplier_credentials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update supplier credentials"
  ON supplier_credentials FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete supplier credentials"
  ON supplier_credentials FOR DELETE TO authenticated USING (true);

-- Margin Rules
CREATE POLICY "Authenticated users can view margin rules"
  ON supplier_margin_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage margin rules"
  ON supplier_margin_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update margin rules"
  ON supplier_margin_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete margin rules"
  ON supplier_margin_rules FOR DELETE TO authenticated USING (true);

-- Sync Schedules
CREATE POLICY "Authenticated users can view sync schedules"
  ON supplier_sync_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage sync schedules"
  ON supplier_sync_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sync schedules"
  ON supplier_sync_schedules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sync schedules"
  ON supplier_sync_schedules FOR DELETE TO authenticated USING (true);

-- Product Cache
CREATE POLICY "Authenticated users can view product cache"
  ON supplier_product_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage product cache"
  ON supplier_product_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product cache"
  ON supplier_product_cache FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- 10. GRANTS
-- =====================================================

GRANT SELECT ON supplier_credentials TO authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_credentials TO authenticated;

GRANT SELECT ON supplier_margin_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_margin_rules TO authenticated;

GRANT SELECT ON supplier_sync_schedules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_sync_schedules TO authenticated;

GRANT SELECT ON supplier_product_cache TO authenticated;
GRANT INSERT, UPDATE ON supplier_product_cache TO authenticated;
