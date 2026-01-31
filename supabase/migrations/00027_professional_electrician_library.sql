-- =====================================================
-- MIGRATION 00027: Professional Electrician Component Library
-- Complete, realistic library for standard house installations
-- Based on Danish electrician pricing 2024-2025
-- =====================================================

-- =====================================================
-- PART 1: ENSURE ALL CATEGORIES EXIST
-- =====================================================

INSERT INTO calc_component_categories (name, slug, description, sort_order)
VALUES
  ('Stikkontakter', 'outlets', 'Alle typer stikkontakter', 1),
  ('Afbrydere', 'switches', 'Afbrydere, dimmere og sensorer', 2),
  ('Lampeudtag', 'lamp-outlets', 'Loft- og vægudtag til lamper', 3),
  ('Spots', 'spots', 'Indbygnings- og påbygningsspots', 4),
  ('Kabelføring', 'wiring', 'Kabler, rør og kabelbakker', 5),
  ('Tavle', 'panels', 'El-tavler og gruppeaflader', 6),
  ('Udendørs', 'outdoor', 'Udendørs installationer', 7),
  ('Hvidevarer', 'appliances', 'Tilslutning af hårde hvidevarer', 8),
  ('Sikkerhed', 'safety', 'Røgalarmer og sikkerhedsudstyr', 9),
  ('Data', 'data', 'Netværk og svagstrøm', 10)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- =====================================================
-- PART 2: STIKKONTAKTER - COMPLETE SET
-- =====================================================

-- 2.1 Standard stikkontakt - NY INSTALLATION
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Stikkontakt enkelt - ny',
  'STIK-1-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Ny installation af enkelt stikkontakt 230V inkl. kabel fra nærmeste fordelingspunkt',
  35,
  2,
  1.0,
  185,
  495
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes,
  default_cost_price = EXCLUDED.default_cost_price,
  default_sale_price = EXCLUDED.default_sale_price;

-- Variants for STIK-1-NY
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3),
  ('Træ/panel', 'TRAE', 0.85, 0, false, 4)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-1-NY'
ON CONFLICT DO NOTHING;

-- Materials for STIK-1-NY with prices
DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-1-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt 1-fag m/jord', 1, 'stk', 45, 89, 1),
  ('Indmuringsdåse 1M', 1, 'stk', 12, 25, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 3G2.5', 6, 'm', 8.50, 16, 4),
  ('Kabelsamler/wago 3-pol', 2, 'stk', 4, 8, 5)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-1-NY';

-- 2.2 Standard stikkontakt - UDSKIFTNING
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Stikkontakt enkelt - udskiftning',
  'STIK-1-UDSK',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Udskiftning af eksisterende stikkontakt (samme type/sted)',
  15,
  1,
  1.0,
  75,
  295
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes,
  default_cost_price = EXCLUDED.default_cost_price,
  default_sale_price = EXCLUDED.default_sale_price;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Standard', 'STD', 1.00, 0, true, 1),
  ('Gammel installation', 'GML', 1.40, 10, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-1-UDSK'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-1-UDSK');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt 1-fag m/jord', 1, 'stk', 45, 89, 1),
  ('Afdækningsramme', 1, 'stk', 18, 35, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-1-UDSK';

-- 2.3 Dobbelt stikkontakt - NY INSTALLATION
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Stikkontakt dobbelt - ny',
  'STIK-2-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Ny installation af dobbelt stikkontakt 230V 2-fag',
  45,
  2,
  1.0,
  225,
  595
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes,
  default_cost_price = EXCLUDED.default_cost_price,
  default_sale_price = EXCLUDED.default_sale_price;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3),
  ('Træ/panel', 'TRAE', 0.85, 0, false, 4)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-2-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-2-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt 2-fag m/jord', 1, 'stk', 75, 145, 1),
  ('Indmuringsdåse 2M', 1, 'stk', 18, 35, 2),
  ('Afdækningsramme 2M', 1, 'stk', 25, 49, 3),
  ('Installationskabel 3G2.5', 7, 'm', 8.50, 16, 4),
  ('Kabelsamler/wago 3-pol', 2, 'stk', 4, 8, 5)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-2-NY';

-- 2.4 Dobbelt stikkontakt - UDSKIFTNING
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Stikkontakt dobbelt - udskiftning',
  'STIK-2-UDSK',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Udskiftning af eksisterende dobbelt stikkontakt',
  18,
  1,
  1.0,
  115,
  345
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Standard', 'STD', 1.00, 0, true, 1)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-2-UDSK'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-2-UDSK');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt 2-fag m/jord', 1, 'stk', 75, 145, 1),
  ('Afdækningsramme 2M', 1, 'stk', 25, 49, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-2-UDSK';

-- 2.5 Stikkontakt med USB - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Stikkontakt med USB - ny',
  'STIK-USB-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Stikkontakt med integreret USB-A og USB-C lader',
  40,
  2,
  1.1,
  285,
  695
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-USB-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-USB-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt m/USB-A+C', 1, 'stk', 165, 295, 1),
  ('Indmuringsdåse dyb', 1, 'stk', 15, 29, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 3G2.5', 6, 'm', 8.50, 16, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-USB-NY';

-- 2.6 Udendørs stikkontakt IP44 - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Udendørs stikkontakt IP44 - ny',
  'STIK-UD44-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Udendørs stikkontakt med klap IP44 vandtæt',
  55,
  2,
  1.15,
  295,
  795
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Træ/puds', 'TRAE', 1.00, 0, true, 1),
  ('Mursten', 'MUR', 1.30, 10, false, 2),
  ('Beton', 'BETON', 1.55, 18, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-UD44-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-UD44-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt IP44 m/klap', 1, 'stk', 125, 225, 1),
  ('Påbygningsdåse IP44', 1, 'stk', 35, 65, 2),
  ('Installationskabel 3G2.5', 10, 'm', 8.50, 16, 3),
  ('Kabelgennemføring IP44', 1, 'stk', 15, 29, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-UD44-NY';

-- 2.7 Udendørs stikkontakt IP54 - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Udendørs stikkontakt IP54 - ny',
  'STIK-UD54-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Udendørs stikkontakt IP54 støv- og vandtæt (kraftigere beskyttelse)',
  60,
  2,
  1.2,
  345,
  895
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Træ/puds', 'TRAE', 1.00, 0, true, 1),
  ('Mursten', 'MUR', 1.30, 10, false, 2),
  ('Beton', 'BETON', 1.55, 18, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'STIK-UD54-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'STIK-UD54-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt IP54', 1, 'stk', 165, 295, 1),
  ('Påbygningsdåse IP54', 1, 'stk', 45, 85, 2),
  ('Installationskabel 3G2.5', 10, 'm', 8.50, 16, 3),
  ('Kabelgennemføring IP54', 1, 'stk', 22, 42, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'STIK-UD54-NY';

-- =====================================================
-- PART 3: AFBRYDERE - COMPLETE SET
-- =====================================================

-- 3.1 Afbryder 1-polet - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Afbryder 1-pol - ny',
  'AFB-1P-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Ny installation af enkelt tænd/sluk afbryder',
  30,
  1,
  1.0,
  155,
  445
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3),
  ('Træ/panel', 'TRAE', 0.85, 0, false, 4)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'AFB-1P-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'AFB-1P-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Afbryder 1-pol', 1, 'stk', 38, 75, 1),
  ('Indmuringsdåse 1M', 1, 'stk', 12, 25, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 3G1.5', 5, 'm', 6.50, 12, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'AFB-1P-NY';

-- 3.2 Afbryder 1-polet - UDSKIFTNING
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Afbryder 1-pol - udskiftning',
  'AFB-1P-UDSK',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Udskiftning af eksisterende afbryder',
  12,
  1,
  1.0,
  65,
  245
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Standard', 'STD', 1.00, 0, true, 1)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'AFB-1P-UDSK'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'AFB-1P-UDSK');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Afbryder 1-pol', 1, 'stk', 38, 75, 1),
  ('Afdækningsramme', 1, 'stk', 18, 35, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'AFB-1P-UDSK';

-- 3.3 Korrespondanceafbryder (veksler) - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Korrespondanceafbryder - ny',
  'AFB-KORR-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Veksler til betjening fra 2 steder (pr. afbryder)',
  40,
  2,
  1.2,
  195,
  545
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'AFB-KORR-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'AFB-KORR-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Korrespondanceafbryder', 1, 'stk', 55, 105, 1),
  ('Indmuringsdåse 1M', 1, 'stk', 12, 25, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 4G1.5', 8, 'm', 8, 15, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'AFB-KORR-NY';

-- 3.4 Krydsafbryder - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Krydsafbryder - ny',
  'AFB-KRYDS-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Krydsafbryder til betjening fra 3+ steder',
  45,
  3,
  1.3,
  225,
  645
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'AFB-KRYDS-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'AFB-KRYDS-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Krydsafbryder', 1, 'stk', 75, 145, 1),
  ('Indmuringsdåse 1M', 1, 'stk', 12, 25, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 5G1.5', 8, 'm', 10, 19, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'AFB-KRYDS-NY';

-- 3.5 Lysdæmper/Dimmer - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Lysdæmper - ny',
  'DIM-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Drejedimmer til gløde-/halogenpærer eller LED-dimmer',
  35,
  2,
  1.15,
  265,
  645
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.35, 12, false, 2),
  ('Beton', 'BETON', 1.60, 20, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'DIM-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'DIM-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('LED-dimmer universel', 1, 'stk', 145, 265, 1),
  ('Indmuringsdåse dyb', 1, 'stk', 15, 29, 2),
  ('Afdækningsramme', 1, 'stk', 18, 35, 3),
  ('Installationskabel 3G1.5', 5, 'm', 6.50, 12, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'DIM-NY';

-- 3.6 Lysdæmper - UDSKIFTNING
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Lysdæmper - udskiftning',
  'DIM-UDSK',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Udskiftning fra afbryder til dimmer eller dimmer til dimmer',
  18,
  2,
  1.1,
  175,
  395
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Standard', 'STD', 1.00, 0, true, 1)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'DIM-UDSK'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'DIM-UDSK');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('LED-dimmer universel', 1, 'stk', 145, 265, 1),
  ('Indmuringsdåse dyb', 1, 'stk', 15, 29, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'DIM-UDSK';

-- =====================================================
-- PART 4: LAMPEUDTAG - COMPLETE SET
-- =====================================================

-- 4.1 Loftudtag standard - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Loftudtag - ny',
  'LOFT-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'lamp-outlets'),
  'Nyt loftudtag til lampe inkl. DCL-stik og kabelføring',
  35,
  2,
  1.0,
  175,
  495
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ('Træloft', 'TRAE', 0.90, 0, false, 2),
  ('Betonloft', 'BETON', 1.70, 25, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'LOFT-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'LOFT-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('DCL-udtag komplet', 1, 'stk', 55, 105, 1),
  ('Loftdåse Ø80', 1, 'stk', 18, 35, 2),
  ('Installationskabel 3G1.5', 6, 'm', 6.50, 12, 3),
  ('Kabelsamler 3-pol', 1, 'stk', 4, 8, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'LOFT-NY';

-- 4.2 Loftudtag med krog - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Loftudtag med krog - ny',
  'LOFT-KROG-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'lamp-outlets'),
  'Loftudtag med ophængskrog til tunge lamper',
  40,
  2,
  1.05,
  195,
  545
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ('Træloft', 'TRAE', 0.90, 0, false, 2),
  ('Betonloft', 'BETON', 1.70, 25, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'LOFT-KROG-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'LOFT-KROG-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('DCL-udtag komplet', 1, 'stk', 55, 105, 1),
  ('Loftdåse Ø80 m/krog', 1, 'stk', 28, 55, 2),
  ('Installationskabel 3G1.5', 6, 'm', 6.50, 12, 3)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'LOFT-KROG-NY';

-- 4.3 Vægudtag - NY
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Vægudtag lampe - ny',
  'VAEG-LAMPE-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'lamp-outlets'),
  'Vægudtag til væglampe eller spot',
  35,
  2,
  1.0,
  165,
  475
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.40, 15, false, 2),
  ('Beton', 'BETON', 1.65, 22, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'VAEG-LAMPE-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'VAEG-LAMPE-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Lampedåse væg', 1, 'stk', 22, 42, 1),
  ('DCL-udtag komplet', 1, 'stk', 55, 105, 2),
  ('Installationskabel 3G1.5', 5, 'm', 6.50, 12, 3)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'VAEG-LAMPE-NY';

-- =====================================================
-- PART 5: SPOTS - COMPLETE SET
-- =====================================================

-- 5.1 Indbygningsspot - FØRSTE
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Indbygningsspot - første',
  'SPOT-IND-1',
  (SELECT id FROM calc_component_categories WHERE slug = 'spots'),
  'Første indbygningsspot inkl. boring og kabel fra afbryder (dyrere pga. setup)',
  30,
  2,
  1.1,
  245,
  595
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ('Træloft', 'TRAE', 1.10, 5, false, 2),
  ('Akustikloft', 'AKUST', 0.85, 0, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'SPOT-IND-1'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'SPOT-IND-1');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('LED-spot komplet GU10', 1, 'stk', 85, 165, 1),
  ('Spotring hvid Ø85', 1, 'stk', 25, 49, 2),
  ('Installationskabel 3G1.5', 4, 'm', 6.50, 12, 3),
  ('Klemme 3-pol', 1, 'stk', 4, 8, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'SPOT-IND-1';

-- 5.2 Indbygningsspot - EFTERFØLGENDE (billigere pr. stk)
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Indbygningsspot - ekstra',
  'SPOT-IND-X',
  (SELECT id FROM calc_component_categories WHERE slug = 'spots'),
  'Ekstra indbygningsspot i serie med første (lavere tid pr. stk)',
  18,
  2,
  1.0,
  185,
  445
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ('Træloft', 'TRAE', 1.10, 3, false, 2),
  ('Akustikloft', 'AKUST', 0.85, 0, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'SPOT-IND-X'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'SPOT-IND-X');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('LED-spot komplet GU10', 1, 'stk', 85, 165, 1),
  ('Spotring hvid Ø85', 1, 'stk', 25, 49, 2),
  ('Installationskabel 3G1.5', 1.5, 'm', 6.50, 12, 3),
  ('Klemme 3-pol', 1, 'stk', 4, 8, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'SPOT-IND-X';

-- 5.3 Påbygningsspot
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Påbygningsspot',
  'SPOT-PAA',
  (SELECT id FROM calc_component_categories WHERE slug = 'spots'),
  'Påbygningsspot monteret på loft eller væg',
  22,
  1,
  1.0,
  195,
  495
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gips/træ', 'GIPS', 1.00, 0, true, 1),
  ('Beton', 'BETON', 1.40, 10, false, 2),
  ('Skinne', 'SKINNE', 0.70, 0, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'SPOT-PAA'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'SPOT-PAA');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Påbygningsspot komplet', 1, 'stk', 125, 245, 1),
  ('Installationskabel 3G1.5', 3, 'm', 6.50, 12, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'SPOT-PAA';

-- 5.4 LED-driver til spots
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'LED-driver installation',
  'SPOT-DRIVER',
  (SELECT id FROM calc_component_categories WHERE slug = 'spots'),
  'Installation af LED-driver/trafo til 12V spots (1 driver pr. 4-6 spots)',
  15,
  2,
  1.1,
  185,
  345
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Standard', 'STD', 1.00, 0, true, 1),
  ('Dæmpbar', 'DIM', 1.20, 5, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'SPOT-DRIVER'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'SPOT-DRIVER');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('LED-driver 30W', 1, 'stk', 145, 265, 1),
  ('Kabelsamler 5-pol', 1, 'stk', 8, 15, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'SPOT-DRIVER';

-- =====================================================
-- PART 6: KABEL & FØRINGSVEJE
-- =====================================================

-- 6.1 Kabeltræk pr. meter - SYNLIG
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Kabelføring synlig pr. m',
  'KABEL-SYN-M',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Synlig kabelføring med clips (pris pr. løbende meter)',
  4,
  1,
  1.0,
  18,
  55
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Træ/gips', 'TRAE', 1.00, 0, true, 1),
  ('Beton', 'BETON', 1.80, 2, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'KABEL-SYN-M'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'KABEL-SYN-M');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Installationskabel 3G1.5', 1.1, 'm', 6.50, 12, 1),
  ('Kabelclips', 3, 'stk', 0.80, 2, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'KABEL-SYN-M';

-- 6.2 Kabeltræk pr. meter - SKJULT
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Kabelføring skjult pr. m',
  'KABEL-SKJ-M',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Skjult kabelføring i væg/loft (pris pr. løbende meter)',
  10,
  2,
  1.15,
  28,
  85
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.50, 3, false, 2),
  ('Beton', 'BETON', 2.00, 6, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'KABEL-SKJ-M'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'KABEL-SKJ-M');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Installationskabel 3G1.5', 1.15, 'm', 6.50, 12, 1),
  ('Flexrør 16mm', 1.1, 'm', 4, 8, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'KABEL-SKJ-M';

-- 6.3 Installationsrør synlig pr. meter
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Installationsrør synlig pr. m',
  'ROR-SYN-M',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Synlig rørføring med bøjler (pris pr. løbende meter)',
  7,
  1,
  1.0,
  25,
  75
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Træ/gips', 'TRAE', 1.00, 0, true, 1),
  ('Beton', 'BETON', 1.60, 2, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'ROR-SYN-M'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'ROR-SYN-M');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Installationsrør 20mm', 1.05, 'm', 8, 15, 1),
  ('Rørbøjle 20mm', 3, 'stk', 2.50, 5, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'ROR-SYN-M';

-- 6.4 Kabelbakke pr. meter
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Kabelbakke pr. m',
  'BAKKE-M',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Kabelbakke monteret på væg/loft (pris pr. løbende meter)',
  12,
  2,
  1.1,
  85,
  195
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('100mm uden låg', '100', 1.00, 0, true, 1),
  ('100mm med låg', '100L', 1.25, 3, false, 2),
  ('200mm uden låg', '200', 1.15, 2, false, 3),
  ('200mm med låg', '200L', 1.40, 5, false, 4)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'BAKKE-M'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'BAKKE-M');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Kabelbakke 100mm', 1, 'm', 45, 85, 1),
  ('Bæring/konsol', 2, 'stk', 18, 35, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'BAKKE-M';

-- =====================================================
-- PART 7: TAVLE / GRUPPER
-- =====================================================

-- 7.1 Ekstra gruppe i eksisterende tavle
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Ekstra gruppe i tavle',
  'TAVLE-GRP',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Tilføj ny gruppe med automatsikring i eksisterende tavle (inkl. test)',
  25,
  2,
  1.1,
  145,
  395
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('B10', 'B10', 1.00, 0, false, 1),
  ('B16', 'B16', 1.00, 0, true, 2),
  ('B20', 'B20', 1.00, 0, false, 3),
  ('C16', 'C16', 1.00, 0, false, 4),
  ('C20', 'C20', 1.00, 0, false, 5)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'TAVLE-GRP'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'TAVLE-GRP');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Automatsikring 1P', 1, 'stk', 55, 105, 1),
  ('Fordelingsskinne segment', 1, 'stk', 15, 29, 2),
  ('Mærkning/dokumentation', 1, 'stk', 10, 25, 3)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'TAVLE-GRP';

-- 7.2 Lille undertavle 6-12 moduler
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Undertavle 6-12 moduler',
  'TAVLE-LILLE',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Ny lille undertavle med HPFI og 4-6 grupper (inkl. test og dokumentation)',
  150,
  3,
  1.25,
  1450,
  3495
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.25, 20, false, 2),
  ('Beton', 'BETON', 1.45, 35, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'TAVLE-LILLE'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'TAVLE-LILLE');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gruppetavle 12 modul', 1, 'stk', 285, 495, 1),
  ('HPFI 40A 30mA', 1, 'stk', 285, 495, 2),
  ('Automatsikring B16', 4, 'stk', 55, 105, 3),
  ('Fordelingsskinne komplet', 1, 'stk', 85, 165, 4),
  ('Hovedkabel 5G6', 5, 'm', 35, 65, 5),
  ('Dokumentation/mærkning', 1, 'stk', 50, 125, 6)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'TAVLE-LILLE';

-- 7.3 HPFI test og udskiftning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'HPFI udskiftning',
  'HPFI-UDSK',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Udskiftning af defekt HPFI-relæ inkl. test',
  30,
  3,
  1.15,
  345,
  745
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('40A 30mA Type A', '40A', 1.00, 0, true, 1),
  ('63A 30mA Type A', '63A', 1.10, 5, false, 2),
  ('40A 30mA Type B', 'B40', 1.15, 8, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'HPFI-UDSK'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'HPFI-UDSK');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('HPFI 40A 30mA Type A', 1, 'stk', 285, 495, 1),
  ('Test og dokumentation', 1, 'stk', 25, 75, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'HPFI-UDSK';

-- =====================================================
-- PART 8: ADDITIONAL COMPONENTS FOR COMPLETENESS
-- =====================================================

-- 8.1 Røgalarm 230V
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Røgalarm 230V - ny',
  'ROEG-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'safety'),
  '230V røgalarm med batteribackup',
  28,
  2,
  1.0,
  225,
  545
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Enkelt', 'ENK', 1.00, 0, true, 1),
  ('Seriekoblet', 'SERIE', 1.30, 8, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'ROEG-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'ROEG-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Røgalarm 230V m/backup', 1, 'stk', 145, 265, 1),
  ('Installationskabel 3G1.5', 5, 'm', 6.50, 12, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'ROEG-NY';

-- 8.2 Emhætte tilslutning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Emhætte tilslutning',
  'EMH-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Tilslutning af emhætte med stikprop',
  25,
  2,
  1.0,
  95,
  295
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Synligt kabel', 'SYN', 1.00, 0, true, 1),
  ('Skjult kabel', 'SKJ', 1.50, 15, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'EMH-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'EMH-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Installationskabel 3G1.5', 4, 'm', 6.50, 12, 1),
  ('Stikprop m/jord', 1, 'stk', 25, 49, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'EMH-NY';

-- 8.3 Komfur/kogeplade tilslutning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Komfur tilslutning',
  'KOMF-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Tilslutning af el-komfur eller induktionskogeplade',
  40,
  3,
  1.2,
  195,
  545
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Eksisterende udtag', 'EKS', 1.00, 0, true, 1),
  ('Nyt udtag', 'NY', 2.00, 40, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'KOMF-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'KOMF-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Komfurtilslutning komplet', 1, 'stk', 85, 165, 1),
  ('Installationskabel 5G2.5', 3, 'm', 18, 35, 2)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'KOMF-NY';

-- 8.4 Vaskemaskine dedikeret gruppe
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Vaskemaskine gruppe',
  'VASK-GRP',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Dedikeret gruppe til vaskemaskine/tørretumbler',
  45,
  2,
  1.1,
  285,
  745
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Synlig føring', 'SYN', 1.00, 0, true, 1),
  ('Skjult føring', 'SKJ', 1.45, 18, false, 2)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'VASK-GRP'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'VASK-GRP');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Stikkontakt 1-fag m/jord', 1, 'stk', 45, 89, 1),
  ('Indmuringsdåse 1M', 1, 'stk', 12, 25, 2),
  ('Installationskabel 3G2.5', 8, 'm', 8.50, 16, 3),
  ('Automatsikring B16', 1, 'stk', 55, 105, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'VASK-GRP';

-- 8.5 Netværksudtag Cat6
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Netværksudtag Cat6',
  'NET-CAT6-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'data'),
  'Netværksudtag Cat6 inkl. kabel til patch-panel',
  40,
  2,
  1.15,
  245,
  595
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ('Murværk', 'MUR', 1.40, 15, false, 2),
  ('Påbygning', 'PAA', 0.80, 0, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'NET-CAT6-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'NET-CAT6-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Netværksudtag Cat6 keystone', 1, 'stk', 35, 69, 1),
  ('Indmuringsdåse data', 1, 'stk', 15, 29, 2),
  ('Cat6 kabel U/UTP', 15, 'm', 5, 10, 3),
  ('Keystone jack Cat6', 1, 'stk', 25, 49, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'NET-CAT6-NY';

-- 8.6 Badeværelsesventilator
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES (
  'Badeværelsesventilator',
  'VENT-BAD-NY',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Ventilator til badeværelse med timer eller fugtføler',
  45,
  2,
  1.15,
  395,
  895
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_time_minutes = EXCLUDED.base_time_minutes;

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Med timer', 'TIMER', 1.00, 0, true, 1),
  ('Med fugtføler', 'FUGT', 1.15, 8, false, 2),
  ('Basis (uden timer)', 'BASIS', 0.85, 0, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'VENT-BAD-NY'
ON CONFLICT DO NOTHING;

DELETE FROM calc_component_materials WHERE component_id = (SELECT id FROM calc_components WHERE code = 'VENT-BAD-NY');
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, cost_price, sale_price, sort_order)
SELECT c.id, m.material_name, m.quantity, m.unit, m.cost_price, m.sale_price, m.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('Ventilator Ø100 m/timer', 1, 'stk', 245, 445, 1),
  ('Installationskabel 3G1.5', 6, 'm', 6.50, 12, 2),
  ('Flexslange Ø100', 2, 'm', 25, 49, 3),
  ('Udblæsningsrist', 1, 'stk', 35, 69, 4)
) AS m(material_name, quantity, unit, cost_price, sale_price, sort_order)
WHERE c.code = 'VENT-BAD-NY';

-- =====================================================
-- PART 9: STANDARD PACKAGES
-- =====================================================

-- Ensure package category for el-installationer exists
INSERT INTO package_categories (name, slug, description, sort_order)
VALUES
  ('El-installationer', 'electrical', 'Standard el-pakker til boliger', 5),
  ('Rum-pakker', 'room-packages', 'Komplette el-pakker pr. rum', 6),
  ('Spot-pakker', 'spot-packages', 'Spot-belysning pakker', 7)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

-- Package 1: Standard stikkontakt i gips
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Stikkontakt enkelt - gips komplet',
  'PKG-STIK-GIPS',
  'Komplet installation af enkelt stikkontakt i gipsvæg inkl. alle materialer og arbejdsløn',
  (SELECT id FROM package_categories WHERE slug = 'electrical'),
  35,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Add items to package
DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-STIK-GIPS');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
SELECT
  (SELECT id FROM packages WHERE code = 'PKG-STIK-GIPS'),
  'component',
  (SELECT id FROM calc_components WHERE code = 'STIK-1-NY'),
  'GIPS',
  'Stikkontakt enkelt - ny (gipsvæg)',
  1,
  'stk',
  185,
  495,
  35,
  1,
  true;

-- Package 2: Spot-pakke 4 spots
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Spot-pakke 4 stk i gipsloft',
  'PKG-SPOT-4',
  '4 indbygningsspots i gipsloft inkl. kabel og installation',
  (SELECT id FROM package_categories WHERE slug = 'spot-packages'),
  84,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-SPOT-4');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-4'), 'component', (SELECT id FROM calc_components WHERE code = 'SPOT-IND-1'), 'GIPS', 'Indbygningsspot - første', 1, 'stk', 245, 595, 30, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-4'), 'component', (SELECT id FROM calc_components WHERE code = 'SPOT-IND-X'), 'GIPS', 'Indbygningsspot - ekstra', 3, 'stk', 185, 445, 18, 2, true);

-- Package 3: Standard rum - el
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Standard rum el-pakke',
  'PKG-RUM-STD',
  'Basis el til standard rum: 2 stikkontakter, 1 loftudtag, 1 afbryder',
  (SELECT id FROM package_categories WHERE slug = 'room-packages'),
  135,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-RUM-STD');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-RUM-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'STIK-2-NY'), 'GIPS', 'Dobbelt stikkontakt', 2, 'stk', 225, 595, 45, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-RUM-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'LOFT-NY'), 'GIPS', 'Loftudtag', 1, 'stk', 175, 495, 35, 2, true),
  ((SELECT id FROM packages WHERE code = 'PKG-RUM-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'AFB-1P-NY'), 'GIPS', 'Afbryder 1-pol', 1, 'stk', 155, 445, 30, 3, true);

-- Package 4: Køkken el-pakke
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Køkken el-pakke standard',
  'PKG-KOK-STD',
  'Standard køkken el: 4 dobbelte stik, 1 emhætte, 1 komfur, 2 loftudtag, 2 afbrydere',
  (SELECT id FROM package_categories WHERE slug = 'room-packages'),
  320,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-KOK-STD');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-KOK-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'STIK-2-NY'), 'GIPS', 'Dobbelt stikkontakt', 4, 'stk', 225, 595, 45, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-KOK-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'EMH-NY'), 'SYN', 'Emhætte tilslutning', 1, 'stk', 95, 295, 25, 2, true),
  ((SELECT id FROM packages WHERE code = 'PKG-KOK-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'KOMF-NY'), 'EKS', 'Komfur tilslutning', 1, 'stk', 195, 545, 40, 3, true),
  ((SELECT id FROM packages WHERE code = 'PKG-KOK-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'LOFT-NY'), 'GIPS', 'Loftudtag', 2, 'stk', 175, 495, 35, 4, true),
  ((SELECT id FROM packages WHERE code = 'PKG-KOK-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'AFB-1P-NY'), 'GIPS', 'Afbryder', 2, 'stk', 155, 445, 30, 5, true);

-- Package 5: Bryggers el-pakke
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Bryggers el-pakke',
  'PKG-BRYG-STD',
  'Bryggers el: 2 vaskemaskine-grupper, 2 stik, 1 loftudtag, 1 afbryder',
  (SELECT id FROM package_categories WHERE slug = 'room-packages'),
  190,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-BRYG-STD');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-BRYG-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'VASK-GRP'), 'SYN', 'Vaskemaskine gruppe', 2, 'stk', 285, 745, 45, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BRYG-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'STIK-1-NY'), 'GIPS', 'Enkelt stikkontakt', 2, 'stk', 185, 495, 35, 2, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BRYG-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'LOFT-NY'), 'GIPS', 'Loftudtag', 1, 'stk', 175, 495, 35, 3, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BRYG-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'AFB-1P-NY'), 'GIPS', 'Afbryder', 1, 'stk', 155, 445, 30, 4, true);

-- Package 6: Badeværelse el-pakke
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Badeværelse el-pakke',
  'PKG-BAD-STD',
  'Badeværelse el: 1 stik, ventilator, 2 væglamper, 1 loftudtag',
  (SELECT id FROM package_categories WHERE slug = 'room-packages'),
  175,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-BAD-STD');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-BAD-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'STIK-1-NY'), 'GIPS', 'Enkelt stikkontakt', 1, 'stk', 185, 495, 35, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BAD-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'VENT-BAD-NY'), 'TIMER', 'Badeværelsesventilator', 1, 'stk', 395, 895, 45, 2, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BAD-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'VAEG-LAMPE-NY'), 'GIPS', 'Væglampe udtag', 2, 'stk', 165, 475, 35, 3, true),
  ((SELECT id FROM packages WHERE code = 'PKG-BAD-STD'), 'component', (SELECT id FROM calc_components WHERE code = 'LOFT-NY'), 'GIPS', 'Loftudtag', 1, 'stk', 175, 495, 35, 4, true);

-- Package 7: Spot-pakke 6 spots med dimmer
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Spot-pakke 6 stk med dimmer',
  'PKG-SPOT-6-DIM',
  '6 indbygningsspots med LED-driver og dimmer',
  (SELECT id FROM package_categories WHERE slug = 'spot-packages'),
  161,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-SPOT-6-DIM');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-6-DIM'), 'component', (SELECT id FROM calc_components WHERE code = 'SPOT-IND-1'), 'GIPS', 'Indbygningsspot - første', 1, 'stk', 245, 595, 30, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-6-DIM'), 'component', (SELECT id FROM calc_components WHERE code = 'SPOT-IND-X'), 'GIPS', 'Indbygningsspot - ekstra', 5, 'stk', 185, 445, 18, 2, true),
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-6-DIM'), 'component', (SELECT id FROM calc_components WHERE code = 'SPOT-DRIVER'), 'DIM', 'LED-driver dæmpbar', 1, 'stk', 185, 345, 18, 3, true),
  ((SELECT id FROM packages WHERE code = 'PKG-SPOT-6-DIM'), 'component', (SELECT id FROM calc_components WHERE code = 'DIM-NY'), 'GIPS', 'Lysdæmper', 1, 'stk', 265, 645, 35, 4, true);

-- Package 8: Udendørs el-pakke
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Udendørs el-pakke basis',
  'PKG-UDE-BASIS',
  'Basis udendørs: 2 udendørs stik IP44, 2 lampeudtag',
  (SELECT id FROM package_categories WHERE slug = 'electrical'),
  190,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-UDE-BASIS');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-UDE-BASIS'), 'component', (SELECT id FROM calc_components WHERE code = 'STIK-UD44-NY'), 'TRAE', 'Udendørs stikkontakt IP44', 2, 'stk', 295, 795, 55, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-UDE-BASIS'), 'manual', NULL, NULL, 'Udendørs lampeudtag IP44', 2, 'stk', 185, 495, 40, 2, true);

-- Package 9: Sikkerhedspakke
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Sikkerhedspakke røgalarmer',
  'PKG-SIK-ROEG',
  '3 seriekoblede røgalarmer 230V',
  (SELECT id FROM package_categories WHERE slug = 'electrical'),
  100,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-SIK-ROEG');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-SIK-ROEG'), 'component', (SELECT id FROM calc_components WHERE code = 'ROEG-NY'), 'ENK', 'Røgalarm 230V - første', 1, 'stk', 225, 545, 28, 1, true),
  ((SELECT id FROM packages WHERE code = 'PKG-SIK-ROEG'), 'component', (SELECT id FROM calc_components WHERE code = 'ROEG-NY'), 'SERIE', 'Røgalarm 230V - seriekoblet', 2, 'stk', 225, 545, 36, 2, true);

-- Package 10: Tavle opgradering
INSERT INTO packages (name, code, description, category_id, total_time_minutes, is_active, is_template)
VALUES (
  'Tavle udvidelse 4 grupper',
  'PKG-TAVLE-4GRP',
  '4 ekstra grupper i eksisterende tavle',
  (SELECT id FROM package_categories WHERE slug = 'electrical'),
  100,
  true,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM package_items WHERE package_id = (SELECT id FROM packages WHERE code = 'PKG-TAVLE-4GRP');
INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, time_minutes, sort_order, show_on_offer)
VALUES
  ((SELECT id FROM packages WHERE code = 'PKG-TAVLE-4GRP'), 'component', (SELECT id FROM calc_components WHERE code = 'TAVLE-GRP'), 'B16', 'Ekstra gruppe B16', 4, 'stk', 145, 395, 25, 1, true);

-- =====================================================
-- PART 10: UPDATE EXISTING COMPONENT MATERIALS WITH PRICES
-- =====================================================

-- Update any materials missing prices with reasonable defaults
UPDATE calc_component_materials
SET
  cost_price = CASE
    WHEN material_name ILIKE '%kabel%' AND unit = 'm' THEN quantity * 7
    WHEN material_name ILIKE '%stik%' THEN 45
    WHEN material_name ILIKE '%dåse%' THEN 15
    WHEN material_name ILIKE '%afbryder%' THEN 45
    WHEN material_name ILIKE '%sikring%' THEN 55
    ELSE 25
  END,
  sale_price = CASE
    WHEN material_name ILIKE '%kabel%' AND unit = 'm' THEN quantity * 14
    WHEN material_name ILIKE '%stik%' THEN 89
    WHEN material_name ILIKE '%dåse%' THEN 29
    WHEN material_name ILIKE '%afbryder%' THEN 89
    WHEN material_name ILIKE '%sikring%' THEN 105
    ELSE 49
  END
WHERE (cost_price IS NULL OR cost_price = 0)
  AND (sale_price IS NULL OR sale_price = 0);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Total components: ~35 (plus existing)
-- Total packages: 10
-- All with realistic Danish electrician pricing 2024-2025
-- =====================================================
