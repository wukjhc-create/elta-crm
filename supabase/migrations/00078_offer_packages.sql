-- =====================================================
-- Migration 00078: Offer Packages
--
-- Defines reusable bundles of materials that can be auto-applied to
-- a fresh offer draft based on detected job type.
-- =====================================================

CREATE TABLE IF NOT EXISTS offer_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,                -- 'solar' | 'service' | 'installation' | 'project' | 'general'
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_packages_job_type
  ON offer_packages(job_type)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS offer_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES offer_packages(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity_multiplier NUMERIC NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_package_items_package
  ON offer_package_items(package_id, position);

-- RLS / grants
ALTER TABLE offer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_packages_select" ON offer_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "offer_packages_insert" ON offer_packages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "offer_packages_update" ON offer_packages
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "offer_packages_delete" ON offer_packages
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "offer_package_items_select" ON offer_package_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "offer_package_items_insert" ON offer_package_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "offer_package_items_update" ON offer_package_items
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "offer_package_items_delete" ON offer_package_items
  FOR DELETE TO authenticated USING (true);

GRANT ALL ON offer_packages TO authenticated;
GRANT ALL ON offer_packages TO service_role;
GRANT ALL ON offer_package_items TO authenticated;
GRANT ALL ON offer_package_items TO service_role;

-- =====================================================
-- Seed default packages
-- =====================================================

INSERT INTO offer_packages (slug, name, job_type, description) VALUES
  ('solar_basic',         'Solcellepakke - basis',     'solar',        'Standard solcelleanlæg: panels, inverter, mounting, kabel'),
  ('service_standard',    'Servicepakke - standard',   'service',      'Standard servicebesøg + fejlsøgning'),
  ('installation_basic',  'Installationspakke - basis','installation', 'Basis el-installation: gruppeafbrydere, kabel, RCD')
ON CONFLICT (slug) DO NOTHING;

-- Wire materials into packages (best-effort; only inserts when both rows exist).
INSERT INTO offer_package_items (package_id, material_id, quantity_multiplier, position)
SELECT p.id, m.id, 1, m_pos.pos
  FROM offer_packages p
  JOIN (VALUES
    ('solar_basic',        'solar_panel',          0),
    ('solar_basic',        'solar_inverter',       1),
    ('solar_basic',        'solar_mounting',       2),
    ('solar_basic',        'solar_cable',          3),
    ('service_standard',   'service_visit',        0),
    ('service_standard',   'service_diagnose',     1),
    ('installation_basic', 'install_breaker',      0),
    ('installation_basic', 'install_cable_3x25',   1),
    ('installation_basic', 'install_rcd',          2)
  ) AS m_pos(pkg_slug, mat_slug, pos) ON m_pos.pkg_slug = p.slug
  JOIN materials m ON m.slug = m_pos.mat_slug
ON CONFLICT (package_id, material_id) DO NOTHING;
