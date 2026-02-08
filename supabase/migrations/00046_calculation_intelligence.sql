-- =====================================================
-- CALCULATION INTELLIGENCE ENGINE
-- Advanced calculation capabilities for professional
-- electrician estimating
-- =====================================================

-- =====================================================
-- Installation Types (gips/beton/træ/mur etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS installation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Time multipliers
  time_multiplier NUMERIC(4,2) DEFAULT 1.00 NOT NULL,
  difficulty_multiplier NUMERIC(4,2) DEFAULT 1.00 NOT NULL,

  -- Material adjustments
  material_waste_multiplier NUMERIC(4,2) DEFAULT 1.00 NOT NULL,
  extra_materials JSONB DEFAULT '[]', -- [{material_name, quantity_per_unit, unit}]

  -- Tool requirements
  required_tools JSONB DEFAULT '[]', -- [{tool_name, is_special}]

  -- Metadata
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default installation types for Danish electricians
INSERT INTO installation_types (code, name, description, time_multiplier, difficulty_multiplier, material_waste_multiplier, extra_materials, required_tools) VALUES
  ('GIPS', 'Gipsvæg', 'Installation i gipsplader/letbeton', 1.0, 1.0, 1.05,
   '[{"material_name": "Gipsskruer", "quantity_per_unit": 2, "unit": "stk"}, {"material_name": "Gipsdåse", "quantity_per_unit": 1, "unit": "stk"}]',
   '[{"tool_name": "Hulbor gips", "is_special": false}]'),
  ('BETON', 'Beton', 'Installation i beton/armeret beton', 2.2, 2.0, 1.10,
   '[{"material_name": "Betonskruer", "quantity_per_unit": 4, "unit": "stk"}, {"material_name": "Rawlplugs", "quantity_per_unit": 2, "unit": "stk"}]',
   '[{"tool_name": "Borehammer SDS", "is_special": false}, {"tool_name": "Betonsavklinge", "is_special": true}]'),
  ('TRAE', 'Træ', 'Installation i træskelet/trævæg', 0.9, 0.8, 1.03,
   '[{"material_name": "Træskruer", "quantity_per_unit": 3, "unit": "stk"}]',
   '[{"tool_name": "Spadeborssæt", "is_special": false}]'),
  ('MUR', 'Murstensværk', 'Installation i mursten/tegl', 1.8, 1.6, 1.08,
   '[{"material_name": "Murplugs", "quantity_per_unit": 2, "unit": "stk"}, {"material_name": "Murbor", "quantity_per_unit": 0.1, "unit": "stk"}]',
   '[{"tool_name": "Borehammer", "is_special": false}, {"tool_name": "Murmejsel", "is_special": false}]'),
  ('GASBETON', 'Gasbeton/Lecablokke', 'Installation i gasbeton eller lecablokke', 1.3, 1.2, 1.06,
   '[{"material_name": "Gasbetonplugs", "quantity_per_unit": 2, "unit": "stk"}]',
   '[{"tool_name": "Gasbetonbor", "is_special": false}]'),
  ('UDVENDIG', 'Udvendig', 'Udvendig installation (facade, tag)', 1.5, 1.5, 1.15,
   '[{"material_name": "Rustfri skruer", "quantity_per_unit": 4, "unit": "stk"}, {"material_name": "Silikonefuge", "quantity_per_unit": 0.05, "unit": "tube"}]',
   '[{"tool_name": "Stillads/lift", "is_special": true}]'),
  ('FORSÆNKET', 'Forsænket installation', 'Skjult/forsænket kabelføring', 2.5, 2.2, 1.12,
   '[{"material_name": "Spartel", "quantity_per_unit": 0.1, "unit": "kg"}, {"tool_name": "Rillefræser", "is_special": true}]',
   '[{"tool_name": "Rillefræser", "is_special": true}, {"tool_name": "Støvsuger industri", "is_special": false}]'),
  ('SYNLIG', 'Synlig installation', 'Synlig/påbygning kabelføring', 0.7, 0.6, 1.15,
   '[{"material_name": "Kabelkanal", "quantity_per_unit": 1.1, "unit": "m"}, {"material_name": "Kanalskruer", "quantity_per_unit": 3, "unit": "stk"}]',
   '[]')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Room Templates
-- =====================================================

CREATE TABLE IF NOT EXISTS room_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  room_type TEXT NOT NULL, -- 'bathroom', 'kitchen', 'bedroom', 'living', 'office', 'hallway', 'utility', 'garage', 'outdoor'

  -- Default electrical points
  default_points JSONB DEFAULT '{}' NOT NULL,
  -- Example: {"outlets": 6, "switches": 2, "ceiling_lights": 1, "spots": 4, "data_points": 1}

  -- Default sizing
  typical_size_m2 NUMERIC(6,2),

  -- Recommendations
  recommended_circuit_groups INTEGER DEFAULT 1,
  recommended_rcd BOOLEAN DEFAULT true,
  special_requirements JSONB DEFAULT '[]', -- [{requirement, description}]

  -- Metadata
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Danish room templates
INSERT INTO room_templates (code, name, description, room_type, default_points, typical_size_m2, recommended_circuit_groups, recommended_rcd, special_requirements) VALUES
  ('BATHROOM', 'Badeværelse', 'Standard badeværelse med vådrum', 'bathroom',
   '{"outlets": 2, "switches": 2, "ceiling_lights": 1, "spots": 4, "ventilation": 1, "gulvvarme_tilslutning": 1}',
   8.0, 2, true,
   '[{"requirement": "IP44 minimum", "description": "Alle installationer i zone 1+2 skal være IP44 eller bedre"}, {"requirement": "HPFI 30mA", "description": "Dedikeret HPFI gruppe påkrævet"}]'),
  ('KITCHEN', 'Køkken', 'Standard køkken med hvidevarer', 'kitchen',
   '{"outlets": 8, "outlets_countertop": 4, "switches": 3, "ceiling_lights": 1, "spots": 6, "emhætte_tilslutning": 1, "opvaskemaskine": 1, "ovn_tilslutning": 1, "induktion_tilslutning": 1}',
   15.0, 3, true,
   '[{"requirement": "Separat gruppe til ovn", "description": "Ovn/komfur skal have egen 3-faset gruppe"}, {"requirement": "Separat gruppe til induktion", "description": "Induktionskogeplade kræver egen gruppe"}]'),
  ('BEDROOM', 'Soveværelse', 'Standard soveværelse', 'bedroom',
   '{"outlets": 6, "switches": 2, "ceiling_lights": 1, "data_points": 1}',
   14.0, 1, false, '[]'),
  ('LIVING', 'Stue', 'Standard stue/opholdsstue', 'living',
   '{"outlets": 10, "switches": 3, "ceiling_lights": 1, "spots": 6, "tv_udtag": 1, "data_points": 2}',
   25.0, 2, false, '[]'),
  ('OFFICE', 'Kontor/arbejdsværelse', 'Hjemmekontor', 'office',
   '{"outlets": 8, "switches": 2, "ceiling_lights": 1, "spots": 4, "data_points": 2}',
   12.0, 1, false,
   '[{"requirement": "Datanetværk", "description": "Min. 2 CAT6 forbindelser anbefales"}]'),
  ('HALLWAY', 'Gang/entre', 'Gang eller entre', 'hallway',
   '{"outlets": 2, "switches": 3, "ceiling_lights": 2, "spots": 4}',
   10.0, 1, false, '[]'),
  ('UTILITY', 'Bryggers/vaskerum', 'Bryggers med vaskemaskine', 'utility',
   '{"outlets": 4, "switches": 2, "ceiling_lights": 1, "vaskemaskine": 1, "tørretumbler": 1}',
   8.0, 2, true,
   '[{"requirement": "Separat gruppe", "description": "Vaskemaskine og tørretumbler bør have separate grupper"}]'),
  ('GARAGE', 'Garage', 'Standard garage med elbils-lader', 'garage',
   '{"outlets": 4, "switches": 2, "ceiling_lights": 2, "elbil_lader": 1}',
   30.0, 2, true,
   '[{"requirement": "Elbilslader", "description": "11-22kW lader kræver 3-faset tilslutning og separat gruppe"}]'),
  ('OUTDOOR', 'Udendørs', 'Udendørs belysning og stik', 'outdoor',
   '{"outlets_ip44": 2, "switches": 1, "udendørs_lamper": 3, "havepæle": 2}',
   0, 1, true,
   '[{"requirement": "IP44+", "description": "Alle udendørs installationer skal være min. IP44"}]'),
  ('TAVLE', 'El-tavle', 'Hovedtavle/gruppetavle', 'panel',
   '{"gruppeafbrydere": 12, "hpfi_afbrydere": 4, "hovedafbryder": 1, "overspændingsbeskyttelse": 1}',
   1.0, 0, false,
   '[{"requirement": "Dimensionering", "description": "Tavle skal dimensioneres efter DS/HD 60364"}]')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Component Time Intelligence
-- Maps components to installation types with time data
-- =====================================================

CREATE TABLE IF NOT EXISTS component_time_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What component
  component_type TEXT NOT NULL, -- 'outlet', 'switch', 'spot', 'cable', 'panel', etc.
  component_subtype TEXT, -- 'single', 'double', 'dimmer', 'data', etc.

  -- Installation context
  installation_type_id UUID REFERENCES installation_types(id) ON DELETE CASCADE,

  -- Time data (in seconds)
  base_install_time_seconds INTEGER NOT NULL DEFAULT 900, -- 15 min default
  wiring_time_seconds INTEGER NOT NULL DEFAULT 600, -- 10 min default
  finishing_time_seconds INTEGER NOT NULL DEFAULT 300, -- 5 min default

  -- Cable requirements
  cable_meters_per_unit NUMERIC(6,2) DEFAULT 3.0,
  cable_type TEXT DEFAULT 'PVT 3x1.5mm²',

  -- Material consumption
  materials_per_unit JSONB DEFAULT '[]', -- [{name, sku_pattern, quantity, unit}]

  -- Per-unit cost estimates (fallback)
  material_cost_estimate NUMERIC(10,2) DEFAULT 0,

  -- Metadata
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(component_type, component_subtype, installation_type_id)
);

-- Seed component time intelligence for common types
-- Base times in gips (standard), other types use their multipliers
INSERT INTO component_time_intelligence (component_type, component_subtype, installation_type_id, base_install_time_seconds, wiring_time_seconds, finishing_time_seconds, cable_meters_per_unit, cable_type, materials_per_unit, material_cost_estimate)
SELECT
  ct.component_type, ct.component_subtype, it.id, ct.base_time, ct.wiring_time, ct.finishing_time, ct.cable_meters, ct.cable_type, ct.materials::JSONB, ct.cost_estimate
FROM (VALUES
  ('outlet', 'single', 900, 600, 300, 3.0, 'PVT 3x2.5mm²', '[{"name":"Stikkontakt enkel","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 85.0),
  ('outlet', 'double', 1080, 600, 360, 3.0, 'PVT 3x2.5mm²', '[{"name":"Stikkontakt dobbelt","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 120.0),
  ('outlet', 'data', 1200, 900, 360, 4.0, 'CAT6', '[{"name":"Dataudtag RJ45","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"},{"name":"CAT6 kabel","quantity":4,"unit":"m"}]', 180.0),
  ('outlet', 'ip44', 1200, 600, 420, 4.0, 'PVT 3x2.5mm²', '[{"name":"Stikkontakt IP44","quantity":1,"unit":"stk"},{"name":"Påbygningsdåse IP44","quantity":1,"unit":"stk"}]', 150.0),
  ('switch', 'single', 720, 480, 240, 2.5, 'PVT 3x1.5mm²', '[{"name":"Afbryder enkelt","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 95.0),
  ('switch', 'double', 840, 600, 300, 3.0, 'PVT 3x1.5mm²', '[{"name":"Afbryder dobbelt","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 130.0),
  ('switch', 'dimmer', 900, 600, 300, 3.0, 'PVT 3x1.5mm²', '[{"name":"Lysdæmper LED","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 350.0),
  ('switch', 'motion_sensor', 1080, 720, 360, 3.5, 'PVT 3x1.5mm²', '[{"name":"Bevægelsessensor","quantity":1,"unit":"stk"},{"name":"Indmuringsdåse","quantity":1,"unit":"stk"}]', 450.0),
  ('light', 'ceiling', 1200, 600, 360, 2.0, 'PVT 3x1.5mm²', '[{"name":"DCL udtag","quantity":1,"unit":"stk"},{"name":"Loftkrog","quantity":1,"unit":"stk"}]', 65.0),
  ('light', 'spot', 900, 480, 300, 2.5, 'PVT 3x1.5mm²', '[{"name":"Spotindbygning","quantity":1,"unit":"stk"},{"name":"LED spot GU10","quantity":1,"unit":"stk"},{"name":"GU10 fatning","quantity":1,"unit":"stk"}]', 180.0),
  ('light', 'outdoor_wall', 1500, 900, 480, 5.0, 'PVT 3x1.5mm²', '[{"name":"Udendørs væglampe IP44","quantity":1,"unit":"stk"},{"name":"Monteringsbeslag","quantity":1,"unit":"stk"}]', 350.0),
  ('light', 'garden_pole', 2400, 1200, 600, 8.0, 'PVT 3x1.5mm²', '[{"name":"Havepæl","quantity":1,"unit":"stk"},{"name":"Jordkabel XPLE","quantity":8,"unit":"m"}]', 800.0),
  ('cable', 'pvt_1.5', 0, 180, 0, 1.0, 'PVT 3x1.5mm²', '[{"name":"PVT 3x1.5mm²","quantity":1,"unit":"m"}]', 8.5),
  ('cable', 'pvt_2.5', 0, 200, 0, 1.0, 'PVT 3x2.5mm²', '[{"name":"PVT 3x2.5mm²","quantity":1,"unit":"m"}]', 12.0),
  ('cable', 'pvt_4.0', 0, 240, 0, 1.0, 'PVT 5x4mm²', '[{"name":"PVT 5x4mm²","quantity":1,"unit":"m"}]', 28.0),
  ('cable', 'pvt_10', 0, 360, 0, 1.0, 'PVT 5x10mm²', '[{"name":"PVT 5x10mm²","quantity":1,"unit":"m"}]', 65.0),
  ('panel', 'group_breaker', 1800, 600, 300, 0, '', '[{"name":"Gruppeafbryder C16","quantity":1,"unit":"stk"}]', 85.0),
  ('panel', 'rcd', 2400, 900, 360, 0, '', '[{"name":"HPFI relæ 30mA","quantity":1,"unit":"stk"}]', 650.0),
  ('panel', 'main_breaker', 3600, 1200, 600, 0, '', '[{"name":"Hovedafbryder","quantity":1,"unit":"stk"}]', 450.0),
  ('panel', 'surge_protection', 1800, 600, 300, 0, '', '[{"name":"Overspændingsbeskyttelse T2","quantity":1,"unit":"stk"}]', 1200.0),
  ('appliance', 'oven_3phase', 2400, 1200, 600, 6.0, 'PVT 5x2.5mm²', '[{"name":"Komfurudtag 3-faset","quantity":1,"unit":"stk"},{"name":"PVT 5x2.5mm²","quantity":6,"unit":"m"}]', 250.0),
  ('appliance', 'induction', 2400, 1200, 600, 6.0, 'PVT 5x4mm²', '[{"name":"CEE udtag","quantity":1,"unit":"stk"},{"name":"PVT 5x4mm²","quantity":6,"unit":"m"}]', 350.0),
  ('appliance', 'ev_charger', 7200, 3600, 1800, 15.0, 'PVT 5x6mm²', '[{"name":"Elbilslader 11kW","quantity":1,"unit":"stk"},{"name":"PVT 5x6mm²","quantity":15,"unit":"m"},{"name":"CEE udtag 16A","quantity":1,"unit":"stk"}]', 8500.0),
  ('appliance', 'ventilation', 1800, 900, 480, 3.0, 'PVT 3x1.5mm²', '[{"name":"Ventilator","quantity":1,"unit":"stk"}]', 650.0),
  ('appliance', 'floor_heating', 3600, 1800, 900, 2.0, 'PVT 3x1.5mm²', '[{"name":"Gulvvarme termostat","quantity":1,"unit":"stk"},{"name":"Følerledning","quantity":3,"unit":"m"}]', 750.0)
) AS ct(component_type, component_subtype, base_time, wiring_time, finishing_time, cable_meters, cable_type, materials, cost_estimate)
CROSS JOIN (SELECT id FROM installation_types WHERE code = 'GIPS') AS it
ON CONFLICT (component_type, component_subtype, installation_type_id) DO NOTHING;

-- =====================================================
-- Room Calculations (project-level)
-- =====================================================

CREATE TABLE IF NOT EXISTS room_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL, -- References kalkia_calculations or calculations

  -- Room info
  room_name TEXT NOT NULL,
  room_template_id UUID REFERENCES room_templates(id),
  room_type TEXT NOT NULL,
  size_m2 NUMERIC(8,2),
  floor_number INTEGER DEFAULT 0,

  -- Installation context
  installation_type_id UUID REFERENCES installation_types(id),
  ceiling_height_m NUMERIC(4,2) DEFAULT 2.50,

  -- Electrical points in this room
  points JSONB DEFAULT '{}' NOT NULL,
  -- Example: {"outlets": 6, "switches": 2, "spots": 4, "ceiling_lights": 1}

  -- Calculated results
  total_time_seconds INTEGER DEFAULT 0,
  total_material_cost NUMERIC(12,2) DEFAULT 0,
  total_cable_meters NUMERIC(8,2) DEFAULT 0,
  total_labor_cost NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,

  -- Breakdown per component
  component_breakdown JSONB DEFAULT '[]',
  -- [{type, subtype, quantity, time_seconds, material_cost, cable_meters, materials: [...]}]

  -- Notes
  notes TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Material Recommendations
-- Maps components to recommended supplier products
-- =====================================================

CREATE TABLE IF NOT EXISTS material_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What component
  component_type TEXT NOT NULL,
  component_subtype TEXT,

  -- Recommended products (priority ordered)
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1, -- Lower = higher priority

  -- Context
  installation_type_id UUID REFERENCES installation_types(id),
  quality_tier TEXT DEFAULT 'standard', -- 'budget', 'standard', 'premium'

  -- Metadata
  reason TEXT, -- Why this is recommended
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(component_type, component_subtype, supplier_product_id, installation_type_id, quality_tier)
);

-- =====================================================
-- Calculation Anomaly Log
-- Tracks unusual patterns in calculations
-- =====================================================

CREATE TABLE IF NOT EXISTS calculation_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL,

  -- Anomaly info
  anomaly_type TEXT NOT NULL, -- 'price_deviation', 'time_outlier', 'missing_material', 'margin_warning', 'missing_rcd', 'undersized_cable'
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',

  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Offer Generation Templates
-- =====================================================

CREATE TABLE IF NOT EXISTS offer_text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template info
  name TEXT NOT NULL,
  template_type TEXT NOT NULL, -- 'intro', 'scope', 'terms', 'warranty', 'disclaimer', 'obs_point'
  language TEXT DEFAULT 'da',

  -- Template content with placeholders
  template_text TEXT NOT NULL,
  -- Placeholders: {{customer_name}}, {{project_type}}, {{total_amount}}, etc.

  -- Conditions for when to use
  applicable_building_types TEXT[] DEFAULT '{}', -- empty = all
  applicable_project_types TEXT[] DEFAULT '{}',
  min_amount NUMERIC(12,2),
  max_amount NUMERIC(12,2),

  -- Metadata
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Danish offer text templates
INSERT INTO offer_text_templates (name, template_type, template_text, sort_order) VALUES
  ('Standard intro', 'intro', 'Tak for jeres henvendelse. Vi har hermed fornøjelsen af at fremsende tilbud på el-installation som beskrevet nedenfor.', 1),
  ('Renovering intro', 'intro', 'I forlængelse af vores besigtigelse af ejendommen, fremsender vi hermed tilbud på el-renovation som beskrevet nedenfor.', 2),
  ('Nybyggeri intro', 'intro', 'Med reference til det fremsendte tegningsmateriale, fremsender vi hermed tilbud på komplet el-installation som beskrevet nedenfor.', 3),
  ('Standard omfang', 'scope', 'Tilbuddet omfatter levering og montering af alle angivne materialer samt al nødvendig kabelføring. Arbejdet udføres af autoriserede elektrikere iht. gældende Stærkstrømsbekendtgørelse og DS/HD 60364.', 1),
  ('Standard vilkår 30 dage', 'terms', 'Tilbuddet er gældende i 30 dage fra tilbudsdato. Priser er ekskl. moms. Betalingsbetingelser: Netto 14 dage. Ved arbejdets afslutning udstedes slutfaktura.', 1),
  ('Standard garanti', 'warranty', 'Der ydes 5 års garanti på det udførte arbejde iht. AB18. Garanti på materialer følger producentens garantibetingelser.', 1),
  ('Standard ansvarsfraskrivelse', 'disclaimer', 'Eventuelle skjulte installationer, asbest eller andre uforudsete forhold er ikke inkluderet i tilbuddet. Tillægsarbejde faktureres efter medgået tid og materialer.', 1),
  ('OBS: Ældre installation', 'obs_point', 'OBS: Ved ældre installationer kan der forekomme behov for udskiftning af eksisterende kabler og dåser, som ikke er inkluderet i dette tilbud.', 1),
  ('OBS: Tavleplads', 'obs_point', 'OBS: Tilbuddet forudsætter tilstrækkelig plads i eksisterende el-tavle. Evt. tavleudvidelse eller ny tavle er ikke inkluderet.', 2),
  ('OBS: Malerarbejde', 'obs_point', 'OBS: Malerarbejde og reetablering af overflader efter kabelføring er ikke inkluderet i tilbuddet.', 3),
  ('OBS: Byggetilladelse', 'obs_point', 'OBS: Eventuel byggetilladelse eller anmeldelse til kommune er bygherrens ansvar.', 4),
  ('OBS: Beton', 'obs_point', 'OBS: Ved boring/fræsning i beton kan der forekomme støjgener. Vi anbefaler at informere naboer.', 5)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Price Alert Configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS price_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert conditions
  alert_type TEXT NOT NULL, -- 'price_increase', 'price_decrease', 'margin_below', 'supplier_offline'
  threshold_percentage NUMERIC(6,2), -- e.g., 5.0 means alert if price changes > 5%
  threshold_amount NUMERIC(12,2), -- absolute threshold

  -- Scope
  supplier_id UUID REFERENCES suppliers(id),
  category TEXT,

  -- Notification
  notify_email TEXT,
  notify_in_app BOOLEAN DEFAULT true,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default alert rules
INSERT INTO price_alert_rules (alert_type, threshold_percentage, notify_in_app) VALUES
  ('price_increase', 10.0, true),
  ('price_decrease', 15.0, true),
  ('margin_below', 15.0, true),
  ('supplier_offline', NULL, true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Alerts log
-- =====================================================

CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert info
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',

  -- Reference
  entity_type TEXT, -- 'supplier_product', 'calculation', 'offer', 'supplier'
  entity_id UUID,

  -- Status
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES profiles(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_component_time_intel_type ON component_time_intelligence(component_type, component_subtype);
CREATE INDEX IF NOT EXISTS idx_component_time_intel_install ON component_time_intelligence(installation_type_id);
CREATE INDEX IF NOT EXISTS idx_room_calculations_calc ON room_calculations(calculation_id);
CREATE INDEX IF NOT EXISTS idx_material_recommendations_type ON material_recommendations(component_type, component_subtype);
CREATE INDEX IF NOT EXISTS idx_calculation_anomalies_calc ON calculation_anomalies(calculation_id);
CREATE INDEX IF NOT EXISTS idx_calculation_anomalies_unresolved ON calculation_anomalies(is_resolved) WHERE NOT is_resolved;
CREATE INDEX IF NOT EXISTS idx_system_alerts_unread ON system_alerts(is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_offer_text_templates_type ON offer_text_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_price_alert_rules_type ON price_alert_rules(alert_type);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE installation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_time_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_text_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read installation_types" ON installation_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read room_templates" ON room_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read component_time_intelligence" ON component_time_intelligence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read room_calculations" ON room_calculations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read material_recommendations" ON material_recommendations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read calculation_anomalies" ON calculation_anomalies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read offer_text_templates" ON offer_text_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read price_alert_rules" ON price_alert_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read system_alerts" ON system_alerts FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users
CREATE POLICY "Authenticated users can insert room_calculations" ON room_calculations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update room_calculations" ON room_calculations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete room_calculations" ON room_calculations FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert calculation_anomalies" ON calculation_anomalies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update calculation_anomalies" ON calculation_anomalies FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert system_alerts" ON system_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update system_alerts" ON system_alerts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage offer_text_templates" ON offer_text_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage price_alert_rules" ON price_alert_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage installation_types" ON installation_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage room_templates" ON room_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage component_time_intelligence" ON component_time_intelligence FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage material_recommendations" ON material_recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- GRANT statements
-- =====================================================

GRANT SELECT ON installation_types TO authenticated;
GRANT SELECT ON room_templates TO authenticated;
GRANT SELECT ON component_time_intelligence TO authenticated;
GRANT ALL ON room_calculations TO authenticated;
GRANT ALL ON material_recommendations TO authenticated;
GRANT ALL ON calculation_anomalies TO authenticated;
GRANT ALL ON offer_text_templates TO authenticated;
GRANT ALL ON price_alert_rules TO authenticated;
GRANT ALL ON system_alerts TO authenticated;
