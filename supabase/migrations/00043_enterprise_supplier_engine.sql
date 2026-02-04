-- =====================================================
-- 00043_enterprise_supplier_engine.sql
-- Enterprise Supplier Integration Engine
-- Sync jobs, sync logs, customer pricing, enhanced views
-- =====================================================

-- =====================================================
-- 1. SUPPLIER SYNC JOBS
-- Configurable sync job definitions per supplier
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('full_catalog', 'price_update', 'availability_check', 'custom')),
  name TEXT NOT NULL,
  description TEXT,
  schedule_cron TEXT, -- cron expression, e.g. '0 6 * * 1' = every Monday at 06:00
  is_active BOOLEAN DEFAULT false,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('success', 'failed', 'partial')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  config JSONB DEFAULT '{}',
  -- Config example: {"source": "ftp", "file_pattern": "*.csv", "auto_approve": false}
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_sync_jobs_supplier_id ON supplier_sync_jobs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_jobs_is_active ON supplier_sync_jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_jobs_next_run ON supplier_sync_jobs(next_run_at) WHERE is_active = true;

CREATE TRIGGER update_supplier_sync_jobs_updated_at
  BEFORE UPDATE ON supplier_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. SUPPLIER SYNC LOGS
-- Execution log for every sync run
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID REFERENCES supplier_sync_jobs(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'running', 'completed', 'failed', 'cancelled')),
  trigger_type TEXT CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'api')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  new_items INTEGER DEFAULT 0,
  updated_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  skipped_items INTEGER DEFAULT 0,
  price_changes_count INTEGER DEFAULT 0,
  error_message TEXT,
  error_stack TEXT,
  details JSONB DEFAULT '{}',
  -- Details example: {"file": "catalog.csv", "encoding": "iso-8859-1", "price_increases": 12, "price_decreases": 5}
  import_batch_id UUID REFERENCES import_batches(id),
  triggered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_sync_logs_supplier_id ON supplier_sync_logs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_logs_sync_job_id ON supplier_sync_logs(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_logs_status ON supplier_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_logs_started_at ON supplier_sync_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_logs_job_type ON supplier_sync_logs(job_type);

-- =====================================================
-- 3. CUSTOMER-SPECIFIC SUPPLIER PRICING
-- Per-customer discount/margin agreements with suppliers
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_supplier_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  custom_margin_percentage NUMERIC(5,2),
  price_list_code TEXT, -- External price list reference from supplier
  notes TEXT,
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_supplier_prices_customer ON customer_supplier_prices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_supplier_prices_supplier ON customer_supplier_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_customer_supplier_prices_active ON customer_supplier_prices(is_active) WHERE is_active = true;

CREATE TRIGGER update_customer_supplier_prices_updated_at
  BEFORE UPDATE ON customer_supplier_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. CUSTOMER-SPECIFIC PRODUCT PRICES
-- Override prices for specific products per customer
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  custom_cost_price NUMERIC(12,2),
  custom_list_price NUMERIC(12,2),
  custom_discount_percentage NUMERIC(5,2),
  notes TEXT,
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true,
  source TEXT CHECK (source IN ('manual', 'import', 'api')) DEFAULT 'manual',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_customer ON customer_product_prices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_product_prices_product ON customer_product_prices(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_customer_product_prices_active ON customer_product_prices(is_active) WHERE is_active = true;

CREATE TRIGGER update_customer_product_prices_updated_at
  BEFORE UPDATE ON customer_product_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. ADD ADAPTER METADATA TO SUPPLIER SETTINGS
-- =====================================================

ALTER TABLE supplier_settings
  ADD COLUMN IF NOT EXISTS adapter_code TEXT,
  ADD COLUMN IF NOT EXISTS adapter_version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS sync_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS credential_encrypted BOOLEAN DEFAULT false;

-- =====================================================
-- 6. ADD SUPPLIER_PRODUCT EXTENDED FIELDS
-- =====================================================

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('active', 'discontinued', 'out_of_stock', 'pending')) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS dimensions JSONB, -- {length, width, height, unit}
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS data_source TEXT CHECK (data_source IN ('import', 'api', 'manual')) DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS external_id TEXT, -- ID from supplier's system
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_supplier_products_status ON supplier_products(status);
CREATE INDEX IF NOT EXISTS idx_supplier_products_external_id ON supplier_products(external_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_tags ON supplier_products USING GIN(tags);

-- =====================================================
-- 7. FUNCTION: Get Customer-Specific Price
-- Returns effective price for a product considering customer agreements
-- =====================================================

CREATE OR REPLACE FUNCTION get_customer_product_price(
  p_customer_id UUID,
  p_supplier_product_id UUID
)
RETURNS TABLE (
  effective_cost_price NUMERIC(12,2),
  effective_list_price NUMERIC(12,2),
  discount_percentage NUMERIC(5,2),
  margin_percentage NUMERIC(5,2),
  effective_sale_price NUMERIC(12,2),
  price_source TEXT
) AS $$
DECLARE
  v_product RECORD;
  v_customer_price RECORD;
  v_customer_supplier RECORD;
  v_supplier_settings RECORD;
  v_cost NUMERIC(12,2);
  v_list NUMERIC(12,2);
  v_discount NUMERIC(5,2) := 0;
  v_margin NUMERIC(5,2);
  v_source TEXT := 'standard';
BEGIN
  -- Get base product prices
  SELECT sp.cost_price, sp.list_price, sp.margin_percentage, sp.supplier_id
  INTO v_product
  FROM supplier_products sp
  WHERE sp.id = p_supplier_product_id;

  IF v_product IS NULL THEN
    RETURN;
  END IF;

  v_cost := v_product.cost_price;
  v_list := v_product.list_price;
  v_margin := v_product.margin_percentage;

  -- Check for customer-specific product price
  SELECT cpp.custom_cost_price, cpp.custom_list_price, cpp.custom_discount_percentage
  INTO v_customer_price
  FROM customer_product_prices cpp
  WHERE cpp.customer_id = p_customer_id
    AND cpp.supplier_product_id = p_supplier_product_id
    AND cpp.is_active = true
    AND (cpp.valid_from IS NULL OR cpp.valid_from <= CURRENT_DATE)
    AND (cpp.valid_to IS NULL OR cpp.valid_to >= CURRENT_DATE);

  IF v_customer_price IS NOT NULL THEN
    v_source := 'customer_product';
    IF v_customer_price.custom_cost_price IS NOT NULL THEN
      v_cost := v_customer_price.custom_cost_price;
    END IF;
    IF v_customer_price.custom_list_price IS NOT NULL THEN
      v_list := v_customer_price.custom_list_price;
    END IF;
    IF v_customer_price.custom_discount_percentage IS NOT NULL THEN
      v_discount := v_customer_price.custom_discount_percentage;
    END IF;
  ELSE
    -- Check for customer-supplier agreement
    SELECT csp.discount_percentage, csp.custom_margin_percentage
    INTO v_customer_supplier
    FROM customer_supplier_prices csp
    WHERE csp.customer_id = p_customer_id
      AND csp.supplier_id = v_product.supplier_id
      AND csp.is_active = true
      AND (csp.valid_from IS NULL OR csp.valid_from <= CURRENT_DATE)
      AND (csp.valid_to IS NULL OR csp.valid_to >= CURRENT_DATE);

    IF v_customer_supplier IS NOT NULL THEN
      v_source := 'customer_supplier';
      v_discount := COALESCE(v_customer_supplier.discount_percentage, 0);
      IF v_customer_supplier.custom_margin_percentage IS NOT NULL THEN
        v_margin := v_customer_supplier.custom_margin_percentage;
      END IF;
    END IF;
  END IF;

  -- If no margin set, get from supplier settings
  IF v_margin IS NULL THEN
    SELECT ss.default_margin_percentage
    INTO v_supplier_settings
    FROM supplier_settings ss
    WHERE ss.supplier_id = v_product.supplier_id;

    v_margin := COALESCE(v_supplier_settings.default_margin_percentage, 25.00);
  END IF;

  -- Calculate effective prices
  effective_cost_price := v_cost * (1 - v_discount / 100);
  effective_list_price := v_list;
  discount_percentage := v_discount;
  margin_percentage := v_margin;
  effective_sale_price := effective_cost_price * (1 + v_margin / 100);
  price_source := v_source;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. FUNCTION: Get Best Price With Customer Context
-- =====================================================

CREATE OR REPLACE FUNCTION get_best_price_for_customer(
  p_customer_id UUID,
  p_product_sku TEXT
)
RETURNS TABLE (
  supplier_product_id UUID,
  supplier_id UUID,
  supplier_name TEXT,
  supplier_code TEXT,
  base_cost_price NUMERIC(12,2),
  effective_cost_price NUMERIC(12,2),
  effective_sale_price NUMERIC(12,2),
  discount_percentage NUMERIC(5,2),
  is_preferred BOOLEAN,
  is_available BOOLEAN,
  price_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id AS supplier_product_id,
    sp.supplier_id,
    s.name AS supplier_name,
    s.code AS supplier_code,
    sp.cost_price AS base_cost_price,
    COALESCE(
      cpp.custom_cost_price,
      sp.cost_price * (1 - COALESCE(csp.discount_percentage, 0) / 100)
    ) AS effective_cost_price,
    COALESCE(
      cpp.custom_cost_price,
      sp.cost_price * (1 - COALESCE(csp.discount_percentage, 0) / 100)
    ) * (1 + COALESCE(
      sp.margin_percentage,
      csp.custom_margin_percentage,
      ss.default_margin_percentage,
      25
    ) / 100) AS effective_sale_price,
    COALESCE(csp.discount_percentage, cpp.custom_discount_percentage, 0) AS discount_percentage,
    COALESCE(ss.is_preferred, false) AS is_preferred,
    sp.is_available,
    CASE
      WHEN cpp.id IS NOT NULL THEN 'customer_product'
      WHEN csp.id IS NOT NULL THEN 'customer_supplier'
      ELSE 'standard'
    END AS price_source
  FROM supplier_products sp
  JOIN suppliers s ON sp.supplier_id = s.id
  LEFT JOIN supplier_settings ss ON sp.supplier_id = ss.supplier_id
  LEFT JOIN customer_supplier_prices csp ON csp.customer_id = p_customer_id
    AND csp.supplier_id = sp.supplier_id
    AND csp.is_active = true
    AND (csp.valid_from IS NULL OR csp.valid_from <= CURRENT_DATE)
    AND (csp.valid_to IS NULL OR csp.valid_to >= CURRENT_DATE)
  LEFT JOIN customer_product_prices cpp ON cpp.customer_id = p_customer_id
    AND cpp.supplier_product_id = sp.id
    AND cpp.is_active = true
    AND (cpp.valid_from IS NULL OR cpp.valid_from <= CURRENT_DATE)
    AND (cpp.valid_to IS NULL OR cpp.valid_to >= CURRENT_DATE)
  WHERE sp.supplier_sku = p_product_sku
    AND sp.is_available = true
    AND s.is_active = true
  ORDER BY
    COALESCE(ss.is_preferred, false) DESC,
    COALESCE(
      cpp.custom_cost_price,
      sp.cost_price * (1 - COALESCE(csp.discount_percentage, 0) / 100)
    ) ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. VIEW: Sync Jobs with last status
-- =====================================================

CREATE OR REPLACE VIEW v_supplier_sync_jobs AS
SELECT
  sj.*,
  s.name AS supplier_name,
  s.code AS supplier_code,
  s.is_active AS supplier_is_active,
  (
    SELECT COUNT(*)
    FROM supplier_sync_logs sl
    WHERE sl.sync_job_id = sj.id
  ) AS total_runs,
  (
    SELECT sl.started_at
    FROM supplier_sync_logs sl
    WHERE sl.sync_job_id = sj.id
    ORDER BY sl.started_at DESC
    LIMIT 1
  ) AS last_run_started_at,
  (
    SELECT sl.status
    FROM supplier_sync_logs sl
    WHERE sl.sync_job_id = sj.id
    ORDER BY sl.started_at DESC
    LIMIT 1
  ) AS last_run_status
FROM supplier_sync_jobs sj
JOIN suppliers s ON sj.supplier_id = s.id;

-- =====================================================
-- 10. RLS POLICIES
-- =====================================================

ALTER TABLE supplier_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_supplier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_product_prices ENABLE ROW LEVEL SECURITY;

-- Sync Jobs
CREATE POLICY "Authenticated users can view sync jobs"
  ON supplier_sync_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage sync jobs"
  ON supplier_sync_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sync jobs"
  ON supplier_sync_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete sync jobs"
  ON supplier_sync_jobs FOR DELETE TO authenticated USING (true);

-- Sync Logs
CREATE POLICY "Authenticated users can view sync logs"
  ON supplier_sync_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create sync logs"
  ON supplier_sync_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sync logs"
  ON supplier_sync_logs FOR UPDATE TO authenticated USING (true);

-- Customer Supplier Prices
CREATE POLICY "Authenticated users can view customer supplier prices"
  ON customer_supplier_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage customer supplier prices"
  ON customer_supplier_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customer supplier prices"
  ON customer_supplier_prices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customer supplier prices"
  ON customer_supplier_prices FOR DELETE TO authenticated USING (true);

-- Customer Product Prices
CREATE POLICY "Authenticated users can view customer product prices"
  ON customer_product_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage customer product prices"
  ON customer_product_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customer product prices"
  ON customer_product_prices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customer product prices"
  ON customer_product_prices FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 11. GRANTS
-- =====================================================

GRANT SELECT ON supplier_sync_jobs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_sync_jobs TO authenticated;

GRANT SELECT ON supplier_sync_logs TO anon, authenticated;
GRANT INSERT, UPDATE ON supplier_sync_logs TO authenticated;

GRANT SELECT ON customer_supplier_prices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON customer_supplier_prices TO authenticated;

GRANT SELECT ON customer_product_prices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON customer_product_prices TO authenticated;

GRANT SELECT ON v_supplier_sync_jobs TO anon, authenticated;
