-- Migration: Solar Products
-- Description: Create database-driven solar product catalog and assumptions
-- Date: 2026-01-28

-- =============================================================================
-- SOLAR PRODUCTS TABLE
-- =============================================================================

CREATE TABLE solar_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL CHECK (product_type IN ('panel', 'inverter', 'battery', 'mounting')),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Type-specific data stored as JSONB
  -- Panel: { "wattage": 400, "efficiency": 0.20 }
  -- Inverter: { "capacity": 5, "efficiency": 0.97, "inverter_type": "string" }
  -- Battery: { "capacity": 10 }
  -- Mounting: { "price_per_panel": 400, "labor_hours_per_panel": 0.5 }
  specifications JSONB NOT NULL DEFAULT '{}',

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_solar_products_product_type ON solar_products(product_type);
CREATE INDEX idx_solar_products_code ON solar_products(code);
CREATE INDEX idx_solar_products_is_active ON solar_products(is_active);
CREATE INDEX idx_solar_products_sort_order ON solar_products(sort_order);

-- Updated_at trigger
CREATE TRIGGER update_solar_products_updated_at
  BEFORE UPDATE ON solar_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE solar_products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read solar products
CREATE POLICY "Authenticated users can read solar products"
  ON solar_products
  FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can manage solar products
CREATE POLICY "Authenticated users can insert solar products"
  ON solar_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update solar products"
  ON solar_products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete solar products"
  ON solar_products
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant permissions
GRANT SELECT ON solar_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON solar_products TO authenticated;

-- =============================================================================
-- SEED DATA: SOLAR PANELS
-- =============================================================================

INSERT INTO solar_products (product_type, code, name, description, price, specifications, sort_order) VALUES
  ('panel', 'PANEL-STD', 'Standard (400W)', 'Standard solpanel med god ydelse til de fleste installationer', 1200,
   '{"wattage": 400, "efficiency": 0.20}', 1),
  ('panel', 'PANEL-PREMIUM', 'Premium (450W)', 'Premium solpanel med forbedret effektivitet', 1600,
   '{"wattage": 450, "efficiency": 0.22}', 2),
  ('panel', 'PANEL-HIGH-EFF', 'High Efficiency (500W)', 'Høj-effektiv solpanel til maksimal ydelse', 2200,
   '{"wattage": 500, "efficiency": 0.24}', 3);

-- =============================================================================
-- SEED DATA: INVERTERS
-- =============================================================================

INSERT INTO solar_products (product_type, code, name, description, price, specifications, sort_order) VALUES
  ('inverter', 'INV-STRING-3KW', 'String Inverter 3kW', 'Kompakt string inverter til mindre anlæg', 8000,
   '{"capacity": 3, "efficiency": 0.97, "inverter_type": "string"}', 1),
  ('inverter', 'INV-STRING-5KW', 'String Inverter 5kW', 'Standard string inverter til private boliger', 12000,
   '{"capacity": 5, "efficiency": 0.97, "inverter_type": "string"}', 2),
  ('inverter', 'INV-STRING-8KW', 'String Inverter 8kW', 'Kraftig string inverter til større anlæg', 18000,
   '{"capacity": 8, "efficiency": 0.97, "inverter_type": "string"}', 3),
  ('inverter', 'INV-STRING-10KW', 'String Inverter 10kW', 'Professionel string inverter til store anlæg', 22000,
   '{"capacity": 10, "efficiency": 0.97, "inverter_type": "string"}', 4),
  ('inverter', 'INV-HYBRID-5KW', 'Hybrid Inverter 5kW', 'Hybrid inverter med batteriunderstøttelse', 18000,
   '{"capacity": 5, "efficiency": 0.96, "inverter_type": "hybrid"}', 5),
  ('inverter', 'INV-HYBRID-10KW', 'Hybrid Inverter 10kW', 'Kraftig hybrid inverter til store batterisystemer', 32000,
   '{"capacity": 10, "efficiency": 0.96, "inverter_type": "hybrid"}', 6);

-- =============================================================================
-- SEED DATA: BATTERIES
-- =============================================================================

INSERT INTO solar_products (product_type, code, name, description, price, specifications, sort_order) VALUES
  ('battery', 'BAT-NONE', 'Ingen batteri', 'Anlæg uden batterilagring', 0,
   '{"capacity": 0}', 1),
  ('battery', 'BAT-5KWH', '5 kWh batteri', 'Kompakt batteri til grundlæggende lagring', 35000,
   '{"capacity": 5}', 2),
  ('battery', 'BAT-10KWH', '10 kWh batteri', 'Standard batteri til de fleste husstande', 60000,
   '{"capacity": 10}', 3),
  ('battery', 'BAT-15KWH', '15 kWh batteri', 'Stort batteri til maksimal selvforsyning', 85000,
   '{"capacity": 15}', 4);

-- =============================================================================
-- SEED DATA: MOUNTING TYPES
-- =============================================================================

INSERT INTO solar_products (product_type, code, name, description, price, specifications, sort_order) VALUES
  ('mounting', 'MOUNT-TILE', 'Tegltag', 'Montering på tegltag med specialbeslag', 400,
   '{"price_per_panel": 400, "labor_hours_per_panel": 0.5}', 1),
  ('mounting', 'MOUNT-FLAT', 'Fladt tag', 'Montering på fladt tag med vinklet stativ', 600,
   '{"price_per_panel": 600, "labor_hours_per_panel": 0.6}', 2),
  ('mounting', 'MOUNT-METAL', 'Metaltag', 'Montering på metaltag med klemmer', 350,
   '{"price_per_panel": 350, "labor_hours_per_panel": 0.4}', 3),
  ('mounting', 'MOUNT-GROUND', 'Jordmontering', 'Fritstående jordmonteret system', 800,
   '{"price_per_panel": 800, "labor_hours_per_panel": 0.8}', 4);

-- =============================================================================
-- SOLAR ASSUMPTIONS IN CALCULATION_SETTINGS
-- =============================================================================

INSERT INTO calculation_settings (setting_key, setting_value, category, description) VALUES
  ('solar_annual_sun_hours', '{"value": 1000, "unit": "hours", "label": "Solskinstimer pr. år"}',
   'solar_assumptions', 'Gennemsnitlige solskinstimer pr. år i Danmark'),

  ('solar_annual_degradation', '{"value": 0.005, "unit": "decimal", "label": "Årlig degradation"}',
   'solar_assumptions', 'Årlig systemdegradation (0.005 = 0.5%)'),

  ('solar_electricity_price', '{"value": 2.5, "unit": "DKK/kWh", "label": "Elpris"}',
   'solar_assumptions', 'Nuværende elpris pr. kWh'),

  ('solar_electricity_price_increase', '{"value": 0.03, "unit": "decimal", "label": "Årlig prisstigning"}',
   'solar_assumptions', 'Forventet årlig stigning i elpris (0.03 = 3%)'),

  ('solar_feed_in_tariff', '{"value": 0.8, "unit": "DKK/kWh", "label": "Afregningspris"}',
   'solar_assumptions', 'Afregningspris ved salg af overskudsstrøm til nettet'),

  ('solar_self_consumption_ratio', '{"value": 0.3, "unit": "decimal", "label": "Egetforbrug uden batteri"}',
   'solar_assumptions', 'Andel af produktion der forbruges selv uden batteri (0.3 = 30%)'),

  ('solar_self_consumption_ratio_battery', '{"value": 0.7, "unit": "decimal", "label": "Egetforbrug med batteri"}',
   'solar_assumptions', 'Andel af produktion der forbruges selv med batteri (0.7 = 70%)'),

  ('solar_labor_cost_per_hour', '{"value": 450, "unit": "DKK", "label": "Timepris installation"}',
   'solar_assumptions', 'Timepris for installationsarbejde'),

  ('solar_base_installation_cost', '{"value": 15000, "unit": "DKK", "label": "Basis installation"}',
   'solar_assumptions', 'Faste installationsomkostninger (tilslutning, el-arbejde, mv.)'),

  ('solar_system_lifetime', '{"value": 25, "unit": "years", "label": "Systemlevetid"}',
   'solar_assumptions', 'Forventet systemlevetid i år'),

  ('solar_co2_factor', '{"value": 0.4, "unit": "kg/kWh", "label": "CO2-faktor"}',
   'solar_assumptions', 'CO2-udledning sparet pr. kWh solenergi')
ON CONFLICT (setting_key) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE solar_products IS 'Database-driven catalog of solar system components';
COMMENT ON COLUMN solar_products.product_type IS 'Type of product: panel, inverter, battery, or mounting';
COMMENT ON COLUMN solar_products.code IS 'Unique product code for referencing in templates';
COMMENT ON COLUMN solar_products.specifications IS 'Type-specific specifications as JSONB';
