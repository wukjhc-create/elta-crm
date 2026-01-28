-- =====================================================
-- PROFESSIONAL ELECTRICIAN COMPONENT LIBRARY
-- Comprehensive seed data for Kalkia system
-- =====================================================

-- Create main category groups
INSERT INTO kalkia_nodes (id, path, depth, code, name, description, node_type, is_active, sort_order)
VALUES
  (gen_random_uuid(), 'installation', 0, 'INSTALL', 'Installationsarbejde', 'Alle typer el-installationer', 'group', true, 1),
  (gen_random_uuid(), 'tavler', 0, 'TAVLER', 'Tavlearbejde', 'Gruppetavler og hovedtavler', 'group', true, 2),
  (gen_random_uuid(), 'kabler', 0, 'KABLER', 'Kabeltræk', 'Kabelføring og installation', 'group', true, 3),
  (gen_random_uuid(), 'ror', 0, 'ROR', 'Rørføring', 'Installationsrør og kabelkanaler', 'group', true, 4),
  (gen_random_uuid(), 'belysning', 0, 'BELYSNING', 'Belysning', 'Lamper, spots og lysdæmpere', 'group', true, 5)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- STIKKONTAKTER (Outlets)
-- =====================================================

-- Parent group for outlets
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, difficulty_level, is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'INSTALL'),
  'installation.stikkontakter',
  1,
  'STIK',
  'Stikkontakter',
  'Installation af stikkontakter',
  'group',
  0,
  1,
  true,
  1,
  ARRAY['stikkontakt', 'outlet', 'el-punkt']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK');

-- Single outlet operation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK'),
  'installation.stikkontakter.enkelt',
  2,
  'STIK_ENKELT',
  'Enkelt stikkontakt',
  'Installation af 1-stikdåse inkl. tilslutning',
  'operation',
  1200,  -- 20 minutter basis
  85.00,
  265.00,
  1,
  true,
  1,
  ARRAY['stikkontakt', 'enkelt', '230v', 'schuko'],
  'Standard installation i forfræset dåse. Tid inkluderer tilslutning og test.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_ENKELT');

-- Double outlet operation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK'),
  'installation.stikkontakter.dobbelt',
  2,
  'STIK_DOBBELT',
  'Dobbelt stikkontakt',
  'Installation af 2-stikdåse inkl. tilslutning',
  'operation',
  1500,  -- 25 minutter basis
  125.00,
  365.00,
  1,
  true,
  2,
  ARRAY['stikkontakt', 'dobbelt', '230v', 'schuko'],
  'Standard installation i forfræset dåse. Tid inkluderer tilslutning og test.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_DOBBELT');

-- USB outlet operation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK'),
  'installation.stikkontakter.usb',
  2,
  'STIK_USB',
  'Stikkontakt med USB',
  'Installation af stikkontakt med integreret USB-lader',
  'operation',
  1500,
  185.00,
  485.00,
  2,
  true,
  3,
  ARRAY['stikkontakt', 'usb', 'lader', 'smart'],
  'USB A+C combo. Husk at tjekke strømforsyning.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_USB');

-- =====================================================
-- AFBRYDERE (Switches)
-- =====================================================

INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, difficulty_level, is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'INSTALL'),
  'installation.afbrydere',
  1,
  'AFBR',
  'Afbrydere',
  'Installation af kontakter og afbrydere',
  'group',
  0,
  1,
  true,
  2,
  ARRAY['afbryder', 'kontakt', 'switch']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'AFBR');

-- Single switch
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'AFBR'),
  'installation.afbrydere.tryk',
  2,
  'AFBR_TRYK',
  'Enkelt trykkontakt',
  'Installation af 1-pol afbryder/trykkontakt',
  'operation',
  900,  -- 15 minutter
  65.00,
  225.00,
  1,
  true,
  1,
  ARRAY['afbryder', 'trykkontakt', 'enkelt']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'AFBR_TRYK');

-- Double switch
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'AFBR'),
  'installation.afbrydere.serie',
  2,
  'AFBR_SERIE',
  'Serieafbryder (2-pol)',
  'Installation af 2-pol serieafbryder',
  'operation',
  1080,  -- 18 minutter
  95.00,
  295.00,
  2,
  true,
  2,
  ARRAY['afbryder', 'serie', 'dobbelt']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'AFBR_SERIE');

-- Dimmer switch
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'AFBR'),
  'installation.afbrydere.dimmer',
  2,
  'AFBR_DIMMER',
  'Lysdæmper',
  'Installation af LED-kompatibel lysdæmper',
  'operation',
  1200,  -- 20 minutter
  285.00,
  595.00,
  2,
  true,
  3,
  ARRAY['dimmer', 'lysdaemper', 'led']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'AFBR_DIMMER');

-- Two-way switch (veksler)
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'AFBR'),
  'installation.afbrydere.veksler',
  2,
  'AFBR_VEKSLER',
  'Veksler (trappeafbryder)',
  'Installation af vekselkontakt til trappelys',
  'operation',
  1500,  -- 25 minutter
  125.00,
  385.00,
  2,
  true,
  4,
  ARRAY['veksler', 'trappe', 'gang']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'AFBR_VEKSLER');

-- =====================================================
-- LAMPEUDTAG (Lamp outlets)
-- =====================================================

INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, difficulty_level, is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'BELYSNING'),
  'belysning.lampeudtag',
  1,
  'LAMPE',
  'Lampeudtag',
  'Installation af lampeudtag og armaturer',
  'group',
  0,
  1,
  true,
  1,
  ARRAY['lampe', 'udtag', 'loft', 'belysning']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'LAMPE');

-- Ceiling lamp outlet
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'LAMPE'),
  'belysning.lampeudtag.loft',
  2,
  'LAMPE_LOFT',
  'Loftlampeudtag',
  'Installation af DCL loftsudtag',
  'operation',
  1080,  -- 18 minutter
  45.00,
  285.00,
  1,
  true,
  1,
  ARRAY['loft', 'dcl', 'lampeudtag']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'LAMPE_LOFT');

-- Wall lamp outlet
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'LAMPE'),
  'belysning.lampeudtag.vaeg',
  2,
  'LAMPE_VAEG',
  'Væglampeudtag',
  'Installation af væglampeudtag',
  'operation',
  1200,  -- 20 minutter
  55.00,
  325.00,
  2,
  true,
  2,
  ARRAY['vaeg', 'lampeudtag', 'armatur']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'LAMPE_VAEG');

-- =====================================================
-- SPOTS
-- =====================================================

INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, difficulty_level, is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'BELYSNING'),
  'belysning.spots',
  1,
  'SPOTS',
  'Spots',
  'Installation af indbygningsspots',
  'group',
  0,
  2,
  true,
  2,
  ARRAY['spot', 'indbygning', 'led']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'SPOTS');

-- Single spot installation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'SPOTS'),
  'belysning.spots.enkelt',
  2,
  'SPOT_ENKELT',
  'Enkelt spot',
  'Installation af indbygningsspot inkl. udspaering',
  'operation',
  1500,  -- 25 minutter
  165.00,
  425.00,
  2,
  true,
  1,
  ARRAY['spot', 'enkelt', 'indbygning', 'led'],
  'Inkluderer udskæring i loft, montering og tilslutning. LED driver separat.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'SPOT_ENKELT');

-- Spot string (3 spots)
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'SPOTS'),
  'belysning.spots.serie',
  2,
  'SPOT_SERIE',
  'Spot-serie (3 stk)',
  'Installation af 3 spots i serie med fælles driver',
  'operation',
  3600,  -- 60 minutter
  385.00,
  1195.00,
  2,
  true,
  2,
  ARRAY['spot', 'serie', 'indbygning', 'led']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'SPOT_SERIE');

-- =====================================================
-- TAVLER (Distribution boards)
-- =====================================================

-- Residential panel
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'TAVLER'),
  'tavler.gruppetavle',
  1,
  'TAVLE_GRUPPE',
  'Gruppetavle standard',
  'Installation af 12-modul gruppetavle inkl. opsætning',
  'operation',
  10800,  -- 3 timer
  1250.00,
  4500.00,
  3,
  true,
  1,
  ARRAY['tavle', 'gruppetavle', 'bolig', '12modul'],
  'Pris er ekskl. automatsikringer og HPFI. Inkluderer montering, tilslutning og måling.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'TAVLE_GRUPPE');

-- Large panel
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'TAVLER'),
  'tavler.gruppetavle_stor',
  1,
  'TAVLE_STOR',
  'Gruppetavle stor (24 modul)',
  'Installation af 24-modul tavle til større boliger',
  'operation',
  14400,  -- 4 timer
  2450.00,
  7500.00,
  3,
  true,
  2,
  ARRAY['tavle', 'gruppetavle', 'stor', '24modul']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'TAVLE_STOR');

-- Automatsikring installation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'TAVLER'),
  'tavler.automat',
  1,
  'TAVLE_AUTOMAT',
  'Automatsikring',
  'Installation af automatsikring inkl. tilslutning',
  'operation',
  600,  -- 10 minutter
  85.00,
  195.00,
  2,
  true,
  3,
  ARRAY['automat', 'sikring', 'tavle']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'TAVLE_AUTOMAT');

-- HPFI installation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'TAVLER'),
  'tavler.hpfi',
  1,
  'TAVLE_HPFI',
  'HPFI-relæ',
  'Installation af HPFI-relæ (fejlstrømsafbryder)',
  'operation',
  1200,  -- 20 minutter
  485.00,
  895.00,
  3,
  true,
  4,
  ARRAY['hpfi', 'rcd', 'sikkerhed', 'fejlstrom']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'TAVLE_HPFI');

-- =====================================================
-- KABELTRÆK (Cable pulling)
-- =====================================================

-- Cable pulling per meter
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'KABLER'),
  'kabler.trek',
  1,
  'KABEL_TREK',
  'Kabeltræk pr. meter',
  'Trækning af installationskabel i rør/kanal',
  'operation',
  60,  -- 1 minut pr. meter
  5.50,
  25.00,
  1,
  true,
  1,
  ARRAY['kabel', 'traek', 'meter'],
  'Angiv antal meter. Tid er baseret på frit træk i eksisterende rør.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'KABEL_TREK');

-- Cable 3G1.5
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'KABLER'),
  'kabler.3g15',
  1,
  'KABEL_3G15',
  'Kabel 3G1.5 pr. meter',
  'Installationskabel NOIK-light 3G1.5mm²',
  'operation',
  30,  -- 30 sek pr meter inkl. klargøring
  8.50,
  18.00,
  1,
  true,
  2,
  ARRAY['kabel', '3g1.5', 'lys']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'KABEL_3G15');

-- Cable 3G2.5
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'KABLER'),
  'kabler.3g25',
  1,
  'KABEL_3G25',
  'Kabel 3G2.5 pr. meter',
  'Installationskabel NOIK-light 3G2.5mm²',
  'operation',
  30,
  12.50,
  28.00,
  1,
  true,
  3,
  ARRAY['kabel', '3g2.5', 'stik']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'KABEL_3G25');

-- Cable 5G2.5
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'KABLER'),
  'kabler.5g25',
  1,
  'KABEL_5G25',
  'Kabel 5G2.5 pr. meter',
  'Installationskabel NOIK-light 5G2.5mm²',
  'operation',
  40,
  24.00,
  48.00,
  2,
  true,
  4,
  ARRAY['kabel', '5g2.5', 'kraft', 'komfur']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'KABEL_5G25');

-- =====================================================
-- RØRFØRING (Conduit installation)
-- =====================================================

-- Plastic conduit per meter
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'ROR'),
  'ror.pvc',
  1,
  'ROR_PVC',
  'PVC-rør pr. meter',
  'Installation af PVC installationsrør',
  'operation',
  120,  -- 2 minutter pr. meter
  12.00,
  45.00,
  1,
  true,
  1,
  ARRAY['ror', 'pvc', 'installation']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'ROR_PVC');

-- Metal conduit per meter
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'ROR'),
  'ror.metal',
  1,
  'ROR_METAL',
  'Metalrør pr. meter',
  'Installation af metalinstallationsrør',
  'operation',
  240,  -- 4 minutter pr. meter
  28.00,
  85.00,
  2,
  true,
  2,
  ARRAY['ror', 'metal', 'installation', 'industri']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'ROR_METAL');

-- Cable tray per meter
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'ROR'),
  'ror.kabelbakke',
  1,
  'ROR_BAKKE',
  'Kabelbakke pr. meter',
  'Montering af kabelbakke 200mm',
  'operation',
  300,  -- 5 minutter pr. meter
  85.00,
  195.00,
  2,
  true,
  3,
  ARRAY['kabelbakke', 'bakke', 'installation']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'ROR_BAKKE');

-- Channel installation
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'ROR'),
  'ror.kanal',
  1,
  'ROR_KANAL',
  'Kabelkanal pr. meter',
  'Installation af kabelkanal',
  'operation',
  180,  -- 3 minutter pr. meter
  35.00,
  95.00,
  1,
  true,
  4,
  ARRAY['kabelkanal', 'kanal', 'paavaeg']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'ROR_KANAL');

-- Chasing (fræsning)
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'ROR'),
  'ror.fraesning',
  1,
  'ROR_FRAES',
  'Fræsning pr. meter',
  'Fræsning af rille i væg for skjult installation',
  'operation',
  600,  -- 10 minutter pr. meter
  15.00,
  145.00,
  3,
  true,
  5,
  ARRAY['fraesning', 'rille', 'skjult']
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'ROR_FRAES');

-- =====================================================
-- CREATE VARIANTS FOR WALL TYPES
-- =====================================================

-- Variants for STIK_ENKELT (single outlet)
INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK_ENKELT'),
  'GIPS',
  'Gipsvæg',
  'Installation i gipsvæg (hurtigst)',
  0.80,
  0,
  0.95,
  true,
  1
WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_ENKELT')
  AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = 'STIK_ENKELT' AND v.code = 'GIPS');

INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK_ENKELT'),
  'TRAE',
  'Trævæg',
  'Installation i træ/spær',
  1.00,
  0,
  1.00,
  false,
  2
WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_ENKELT')
  AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = 'STIK_ENKELT' AND v.code = 'TRAE');

INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK_ENKELT'),
  'MUR',
  'Muret væg',
  'Installation i murværk',
  1.30,
  300,
  1.25,
  false,
  3
WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_ENKELT')
  AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = 'STIK_ENKELT' AND v.code = 'MUR');

INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'STIK_ENKELT'),
  'BETON',
  'Betonvæg',
  'Installation i beton (sværest)',
  1.60,
  600,
  1.50,
  false,
  4
WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'STIK_ENKELT')
  AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = 'STIK_ENKELT' AND v.code = 'BETON');

-- Copy similar variants to other outlet types
DO $$
DECLARE
  v_node_codes TEXT[] := ARRAY['STIK_DOBBELT', 'STIK_USB', 'AFBR_TRYK', 'AFBR_SERIE', 'AFBR_DIMMER', 'AFBR_VEKSLER', 'LAMPE_LOFT', 'LAMPE_VAEG', 'SPOT_ENKELT'];
  v_code TEXT;
BEGIN
  FOREACH v_code IN ARRAY v_node_codes
  LOOP
    -- Gips variant
    INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
    SELECT gen_random_uuid(), (SELECT id FROM kalkia_nodes WHERE code = v_code), 'GIPS', 'Gipsvæg', 'Installation i gipsvæg', 0.80, 0, 0.95, true, 1
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = v_code AND v.code = 'GIPS');

    -- Træ variant
    INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
    SELECT gen_random_uuid(), (SELECT id FROM kalkia_nodes WHERE code = v_code), 'TRAE', 'Trævæg', 'Installation i træ/spær', 1.00, 0, 1.00, false, 2
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = v_code AND v.code = 'TRAE');

    -- Mur variant
    INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
    SELECT gen_random_uuid(), (SELECT id FROM kalkia_nodes WHERE code = v_code), 'MUR', 'Muret væg', 'Installation i murværk', 1.30, 300, 1.25, false, 3
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = v_code AND v.code = 'MUR');

    -- Beton variant
    INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, extra_time_seconds, price_multiplier, is_default, sort_order)
    SELECT gen_random_uuid(), (SELECT id FROM kalkia_nodes WHERE code = v_code), 'BETON', 'Betonvæg', 'Installation i beton', 1.60, 600, 1.50, false, 4
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (SELECT 1 FROM kalkia_variants v JOIN kalkia_nodes n ON v.node_id = n.id WHERE n.code = v_code AND v.code = 'BETON');
  END LOOP;
END $$;

-- =====================================================
-- ADD MATERIALS TO VARIANTS
-- =====================================================

-- Materials for STIK_ENKELT - GIPS variant
INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Stikkontakt Fuga 1M',
  1,
  'stk',
  45.00,
  85.00,
  false,
  1
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'GIPS'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Stikkontakt Fuga 1M'
  );

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Indbygningsdåse Ø68mm',
  1,
  'stk',
  12.00,
  25.00,
  false,
  2
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'GIPS'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Indbygningsdåse Ø68mm'
  );

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Afdækningsramme Fuga hvid',
  1,
  'stk',
  28.00,
  55.00,
  false,
  3
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'GIPS'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Afdækningsramme Fuga hvid'
  );

-- Materials for beton variant (additional items)
INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Betondåse til indmuring',
  1,
  'stk',
  35.00,
  65.00,
  false,
  1
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'BETON'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Betondåse til indmuring'
  );

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Stikkontakt Fuga 1M',
  1,
  'stk',
  45.00,
  85.00,
  false,
  2
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'BETON'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Stikkontakt Fuga 1M'
  );

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Afdækningsramme Fuga hvid',
  1,
  'stk',
  28.00,
  55.00,
  false,
  3
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'STIK_ENKELT' AND v.code = 'BETON'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Afdækningsramme Fuga hvid'
  );

-- Materials for spots
INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'LED Spot 7W hvid',
  1,
  'stk',
  125.00,
  265.00,
  false,
  1
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'SPOT_ENKELT' AND v.code = 'GIPS'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'LED Spot 7W hvid'
  );

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'LED Driver 350mA',
  1,
  'stk',
  85.00,
  165.00,
  false,
  2
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'SPOT_ENKELT' AND v.code = 'GIPS'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'LED Driver 350mA'
  );

-- Materials for Gruppetavle
INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Gruppetavle 12 modul',
  1,
  'stk',
  650.00,
  1250.00,
  false,
  1
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'TAVLE_GRUPPE'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Gruppetavle 12 modul'
  )
LIMIT 1;

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Jordskinne',
  1,
  'stk',
  85.00,
  165.00,
  false,
  2
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'TAVLE_GRUPPE'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Jordskinne'
  )
LIMIT 1;

INSERT INTO kalkia_variant_materials (id, variant_id, material_name, quantity, unit, cost_price, sale_price, is_optional, sort_order)
SELECT
  gen_random_uuid(),
  v.id,
  'Nulskinne',
  1,
  'stk',
  65.00,
  125.00,
  false,
  3
FROM kalkia_variants v
JOIN kalkia_nodes n ON v.node_id = n.id
WHERE n.code = 'TAVLE_GRUPPE'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variant_materials m WHERE m.variant_id = v.id AND m.material_name = 'Nulskinne'
  )
LIMIT 1;

-- =====================================================
-- ADD LABOR RULES (Conditional adjustments)
-- =====================================================

-- Height rules for all installation nodes
DO $$
DECLARE
  v_node_codes TEXT[] := ARRAY['STIK_ENKELT', 'STIK_DOBBELT', 'STIK_USB', 'AFBR_TRYK', 'AFBR_SERIE', 'AFBR_DIMMER', 'LAMPE_LOFT', 'LAMPE_VAEG', 'SPOT_ENKELT', 'SPOT_SERIE'];
  v_code TEXT;
BEGIN
  FOREACH v_code IN ARRAY v_node_codes
  LOOP
    -- Height > 3m rule
    INSERT INTO kalkia_rules (id, node_id, rule_name, rule_type, condition, time_multiplier, extra_time_seconds, description, priority, is_active)
    SELECT
      gen_random_uuid(),
      (SELECT id FROM kalkia_nodes WHERE code = v_code),
      'Arbejdshøjde > 3 meter',
      'height',
      '{"height_min": 3}'::jsonb,
      1.25,
      300,
      'Tillæg for arbejde i højden (kræver stige/lift)',
      10,
      true
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (
        SELECT 1 FROM kalkia_rules r
        JOIN kalkia_nodes n ON r.node_id = n.id
        WHERE n.code = v_code AND r.rule_name = 'Arbejdshøjde > 3 meter'
      );

    -- Quantity discount rule
    INSERT INTO kalkia_rules (id, node_id, rule_name, rule_type, condition, time_multiplier, extra_time_seconds, description, priority, is_active)
    SELECT
      gen_random_uuid(),
      (SELECT id FROM kalkia_nodes WHERE code = v_code),
      'Mængderabat > 10 stk',
      'quantity',
      '{"quantity_min": 10}'::jsonb,
      0.90,
      0,
      'Effektivisering ved mange ens opgaver',
      5,
      true
    WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = v_code)
      AND NOT EXISTS (
        SELECT 1 FROM kalkia_rules r
        JOIN kalkia_nodes n ON r.node_id = n.id
        WHERE n.code = v_code AND r.rule_name = 'Mængderabat > 10 stk'
      );
  END LOOP;
END $$;

-- Access restriction rule for certain nodes
INSERT INTO kalkia_rules (id, node_id, rule_name, rule_type, condition, time_multiplier, extra_time_seconds, description, priority, is_active)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'TAVLE_GRUPPE'),
  'Begrænset adgang',
  'access',
  '{"access_type": "restricted"}'::jsonb,
  1.15,
  600,
  'Tillæg for vanskelig adgang til installationssted',
  8,
  true
WHERE EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'TAVLE_GRUPPE')
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_rules r
    JOIN kalkia_nodes n ON r.node_id = n.id
    WHERE n.code = 'TAVLE_GRUPPE' AND r.rule_name = 'Begrænset adgang'
  );

-- =====================================================
-- CREATE COMPOSITE NODES (Packages/Bundles)
-- =====================================================

-- Complete bathroom package
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'INSTALL'),
  'installation.badpakke',
  1,
  'PKG_BAD',
  'Badeværelsespakke',
  'Komplet el-installation til badeværelse: 3 spots, 2 stikkontakter, 1 afbryder',
  'composite',
  9000,  -- 2.5 timer
  985.00,
  3495.00,
  3,
  true,
  10,
  ARRAY['pakke', 'badevaerelse', 'komplet'],
  'Inkluderer: 3x spot, 2x stikkontakt (IP44), 1x afbryder. Kabel separat.'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'PKG_BAD');

-- Kitchen package
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM kalkia_nodes WHERE code = 'INSTALL'),
  'installation.kokken',
  1,
  'PKG_KOK',
  'Køkkenpakke standard',
  'El-installation til køkken: spots over bordplade, stikkontakter, afbryder',
  'composite',
  14400,  -- 4 timer
  1450.00,
  5295.00,
  3,
  true,
  11,
  ARRAY['pakke', 'kokken', 'komplet'],
  'Inkluderer: 5x spot, 6x stikkontakt, 2x afbryder, LED-strip udtag'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'PKG_KOK');

-- New house complete package
INSERT INTO kalkia_nodes (
  id, parent_id, path, depth, code, name, description, node_type,
  base_time_seconds, default_cost_price, default_sale_price, difficulty_level,
  is_active, sort_order, ai_tags, notes
)
SELECT
  gen_random_uuid(),
  NULL,
  'nybygpakke',
  0,
  'PKG_NYBYG',
  'Nybyggeri-pakke 140m²',
  'Komplet el-pakke til nybyggeri ca. 140m²',
  'composite',
  144000,  -- 40 timer
  18500.00,
  65000.00,
  4,
  true,
  20,
  ARRAY['pakke', 'nybyggeri', 'komplet', 'hus'],
  'Omfatter: Gruppetavle, alle udtag, spots i bad/køkken, kabling'
WHERE NOT EXISTS (SELECT 1 FROM kalkia_nodes WHERE code = 'PKG_NYBYG');

-- Default variants for tavler (no wall type needed)
INSERT INTO kalkia_variants (id, node_id, code, name, description, time_multiplier, is_default, sort_order)
SELECT
  gen_random_uuid(),
  n.id,
  'DEFAULT',
  'Standard',
  'Standard installation',
  1.00,
  true,
  1
FROM kalkia_nodes n
WHERE n.code IN ('TAVLE_GRUPPE', 'TAVLE_STOR', 'TAVLE_AUTOMAT', 'TAVLE_HPFI', 'KABEL_TREK', 'KABEL_3G15', 'KABEL_3G25', 'KABEL_5G25', 'ROR_PVC', 'ROR_METAL', 'ROR_BAKKE', 'ROR_KANAL', 'ROR_FRAES', 'SPOT_SERIE', 'PKG_BAD', 'PKG_KOK', 'PKG_NYBYG')
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variants v WHERE v.node_id = n.id
  );

-- =====================================================
-- REFRESH MATERIALIZED VIEWS / STATISTICS
-- =====================================================

-- Analyze tables for query optimization
ANALYZE kalkia_nodes;
ANALYZE kalkia_variants;
ANALYZE kalkia_variant_materials;
ANALYZE kalkia_rules;
