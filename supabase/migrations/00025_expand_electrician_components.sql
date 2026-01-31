-- =====================================================
-- EXPAND ELECTRICIAN COMPONENT LIBRARY
-- Adds 40+ realistic electrician components
-- =====================================================

-- =====================================================
-- STIKKONTAKTER (Outlets)
-- =====================================================

-- Dobbelt stikkontakt
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Dobbelt stikkontakt',
  'STIK-DBL',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Dobbelt stikkontakt 230V 2-fag',
  40,
  1,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Murværk', 'MUR', 1.30, 10, false, 3),
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Træ', 'TRAE', 0.90, 0, false, 4);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Stikkontakt 2-fag', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Indmuringsdåse 2M', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-DBL'), 'Installationskabel 3G1.5', 6, 'm', 3);

-- Stikkontakt med USB
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Stikkontakt med USB',
  'STIK-USB',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Stikkontakt med integreret USB-A/C lader',
  35,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Murværk', 'MUR', 1.30, 10, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Stikkontakt m/USB', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Indmuringsdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-USB'), 'Installationskabel 3G1.5', 5, 'm', 3);

-- Gulvstikkontakt
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Gulvstikkontakt',
  'STIK-GULV',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Stikkontakt monteret i gulv med klap',
  60,
  3,
  1.3
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-GULV'), 'Trægulv', 'TRAE', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-GULV'), 'Betongulv', 'BETON', 1.80, 30, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-GULV'), 'Gulvboks m/kontakt', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-GULV'), 'Gulvdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-GULV'), 'Installationskabel 3G2.5', 8, 'm', 3);

-- =====================================================
-- AFBRYDERE (Switches)
-- =====================================================

-- Enkelt afbryder
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Afbryder enkelt',
  'AFB-1',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Standard tænd/sluk afbryder',
  25,
  1,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Murværk', 'MUR', 1.30, 10, false, 3),
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Træ', 'TRAE', 0.90, 0, false, 4);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Afbryder 1-pol', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Indmuringsdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-1'), 'Installationskabel 3G1.5', 4, 'm', 3);

-- Dobbelt afbryder (serie)
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Afbryder dobbelt (serie)',
  'AFB-2',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Serieafbryder til 2 lampegrupper',
  35,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Murværk', 'MUR', 1.30, 10, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Serieafbryder', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Indmuringsdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-2'), 'Installationskabel 4G1.5', 5, 'm', 3);

-- Korrespondanceafbryder (veksler)
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Korrespondanceafbryder',
  'AFB-KORR',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Veksler til betjening fra 2 steder',
  35,
  2,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Murværk', 'MUR', 1.30, 10, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Korrespondanceafbryder', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Indmuringsdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KORR'), 'Installationskabel 4G1.5', 6, 'm', 3);

-- Krydsafbryder
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Krydsafbryder',
  'AFB-KRYDS',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Krydsafbryder til betjening fra 3+ steder',
  40,
  3,
  1.3
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-KRYDS'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KRYDS'), 'Beton', 'BETON', 1.50, 15, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AFB-KRYDS'), 'Krydsafbryder', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KRYDS'), 'Indmuringsdåse', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'AFB-KRYDS'), 'Installationskabel 5G1.5', 6, 'm', 3);

-- Dimmer
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Lysdæmper (dimmer)',
  'DIM-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'Drejedimmer til gløde-/LED-lamper',
  30,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'Murværk', 'MUR', 1.30, 10, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'LED-dimmer', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'Indmuringsdåse dyb', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'DIM-STD'), 'Installationskabel 3G1.5', 4, 'm', 3);

-- Bevægelsessensor
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Bevægelsessensor',
  'PIR-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'switches'),
  'PIR sensor til automatisk lys',
  35,
  2,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'PIR-STD'), 'Væg', 'VAEG', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'PIR-STD'), 'Loft', 'LOFT', 1.20, 10, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'PIR-STD'), 'PIR-sensor 180°', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'PIR-STD'), 'Installationskabel 3G1.5', 5, 'm', 2);

-- =====================================================
-- BELYSNING (Lighting)
-- =====================================================

-- Spot indbygning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Spot indbygning',
  'SPOT-IND',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'Indbygningsspot LED',
  20,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'Træloft', 'TRAE', 0.90, 0, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'Akustikloft', 'AKUST', 0.80, 0, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'LED-spot komplet', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'Installationskabel 3G1.5', 3, 'm', 2),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-IND'), 'Klemme 3-pol', 1, 'stk', 3);

-- Spot påbygning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Spot påbygning',
  'SPOT-PAA',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'Påbygningsspot LED',
  25,
  1,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-PAA'), 'Beton/gips', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-PAA'), 'Skinne', 'SKINNE', 0.70, 0, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-PAA'), 'LED-spot påbygning', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-PAA'), 'Installationskabel 3G1.5', 3, 'm', 2);

-- LED-panel
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'LED-panel 60x60',
  'LED-PANEL',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'LED-panel til nedhængt loft 60x60cm',
  30,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'LED-PANEL'), 'Nedhængt loft', 'NEDH', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'LED-PANEL'), 'Påbygning', 'PAABY', 1.30, 10, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'LED-PANEL'), 'LED-panel 60x60 40W', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'LED-PANEL'), 'Driver', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'LED-PANEL'), 'Installationskabel 3G1.5', 4, 'm', 3);

-- Væglampe
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Væglampe udtag',
  'VAEG-UD',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'Udtag til væglampe',
  30,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VAEG-UD'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'VAEG-UD'), 'Beton', 'BETON', 1.60, 20, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'VAEG-UD'), 'Murværk', 'MUR', 1.40, 15, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VAEG-UD'), 'Lampedåse', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'VAEG-UD'), 'Installationskabel 3G1.5', 5, 'm', 2);

-- =====================================================
-- KABEL OG RØRFØRING (Cable and Conduit)
-- =====================================================

-- Kabelføring synlig
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Kabelføring synlig (pr. meter)',
  'KABEL-SYN',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Synlig kabelføring med clips',
  5,
  1,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SYN'), 'Træ/gips', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SYN'), 'Beton', 'BETON', 1.80, 2, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SYN'), 'Installationskabel 3G1.5', 1, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SYN'), 'Kabelclips', 3, 'stk', 2);

-- Kabelføring skjult
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Kabelføring skjult (pr. meter)',
  'KABEL-SKJ',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Skjult kabelføring i væg/loft',
  12,
  2,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SKJ'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SKJ'), 'Murværk', 'MUR', 1.50, 3, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SKJ'), 'Beton', 'BETON', 2.00, 5, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SKJ'), 'Installationskabel 3G1.5', 1.1, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'KABEL-SKJ'), 'Flexrør 16mm', 1, 'm', 2);

-- Installationsrør
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Installationsrør synlig (pr. meter)',
  'ROR-SYN',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Synlig rørføring med bøjler',
  8,
  1,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'ROR-SYN'), 'Træ/gips', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'ROR-SYN'), 'Beton', 'BETON', 1.60, 2, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'ROR-SYN'), 'Installationsrør 20mm', 1, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'ROR-SYN'), 'Rørbøjle', 3, 'stk', 2);

-- Kabelbakke
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Kabelbakke (pr. meter)',
  'BAKKE',
  (SELECT id FROM calc_component_categories WHERE slug = 'wiring'),
  'Kabelbakke til loft/væg',
  10,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'BAKKE'), 'Standard', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'BAKKE'), 'Med låg', 'LAG', 1.30, 2, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'BAKKE'), 'Kabelbakke 100mm', 1, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'BAKKE'), 'Bæringer', 2, 'stk', 2);

-- =====================================================
-- TAVLE OG GRUPPER (Panels and Groups)
-- =====================================================

-- Automatsikring
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Automatsikring (tilføj gruppe)',
  'AUTO-GRP',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Tilføj ny gruppe med automatsikring',
  20,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'B10', 'B10', 1.00, 0, false, 1),
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'B16', 'B16', 1.00, 0, true, 2),
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'C16', 'C16', 1.00, 0, false, 3),
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'B20', 'B20', 1.00, 0, false, 4);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'Automatsikring', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'AUTO-GRP'), 'Fordelingsskinne', 0.1, 'm', 2);

-- HPFI-relæ
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'HPFI-relæ installation',
  'HPFI-INST',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Installation af HPFI fejlstrømsafbryder',
  30,
  3,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'HPFI-INST'), '40A 30mA', '40A', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'HPFI-INST'), '63A 30mA', '63A', 1.10, 5, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'HPFI-INST'), '40A Type B', 'B40', 1.20, 10, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'HPFI-INST'), 'HPFI-relæ', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'HPFI-INST'), 'Fordelingsskinne', 0.2, 'm', 2);

-- Kombiafbryder
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Kombiafbryder HPFI+MCB',
  'KOMBI',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Kombineret HPFI og automatsikring',
  25,
  3,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KOMBI'), 'B16 30mA', 'B16', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'KOMBI'), 'C16 30mA', 'C16', 1.00, 0, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KOMBI'), 'Kombiafbryder', 1, 'stk', 1);

-- =====================================================
-- UDENDØRS (Outdoor)
-- =====================================================

-- Udendørs lampeudtag
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Udendørs lampeudtag',
  'UD-LAMPE',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Lampeudtag IP44 til udendørs',
  40,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'UD-LAMPE'), 'Træ/puds', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'UD-LAMPE'), 'Mursten', 'MUR', 1.30, 10, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'UD-LAMPE'), 'Beton', 'BETON', 1.60, 20, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'UD-LAMPE'), 'Lampeudtag IP44', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'UD-LAMPE'), 'Installationskabel 3G1.5', 6, 'm', 2);

-- Havelampe
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Havelampe med kabel',
  'HAVE-LAMPE',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Havelampe inkl. jordkabel',
  60,
  2,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'HAVE-LAMPE'), 'Blød jord', 'BLOD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'HAVE-LAMPE'), 'Hård jord/fliser', 'HAARD', 1.50, 20, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'HAVE-LAMPE'), 'Pullertlampe', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'HAVE-LAMPE'), 'Jordkabel 3G1.5', 10, 'm', 2),
  ((SELECT id FROM calc_components WHERE code = 'HAVE-LAMPE'), 'Samledåse IP68', 1, 'stk', 3);

-- EV-lader forberedelse
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'EV-lader forberedelse',
  'EV-FORB',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Forberedelse til elbillader (kabel + sikring)',
  90,
  3,
  1.3
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), 'Under 10m', 'KORT', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), '10-20m', 'MELLEM', 1.40, 30, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), 'Over 20m', 'LANG', 1.80, 60, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), 'Installationskabel 5G6', 12, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), 'Kombiafbryder B32 Type B', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'EV-FORB'), 'Stikdåse 32A', 1, 'stk', 3);

-- =====================================================
-- SPECIALINSTALLATIONER
-- =====================================================

-- Emhætte tilslutning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Emhætte tilslutning',
  'EMH-TILSL',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Tilslutning af emhætte',
  30,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'EMH-TILSL'), 'Standard', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'EMH-TILSL'), 'Skjult kabel', 'SKJ', 1.40, 15, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'EMH-TILSL'), 'Installationskabel 3G1.5', 4, 'm', 1),
  ((SELECT id FROM calc_components WHERE code = 'EMH-TILSL'), 'Stikprop m/jord', 1, 'stk', 2);

-- Komfur tilslutning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Komfur tilslutning',
  'KOMF-TILSL',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Tilslutning af el-komfur/kogesektion',
  45,
  3,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KOMF-TILSL'), 'Ny installation', 'NY', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'KOMF-TILSL'), 'Udskiftning', 'UDSK', 0.60, 0, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'KOMF-TILSL'), 'Komfurudtag', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'KOMF-TILSL'), 'Installationskabel 5G2.5', 3, 'm', 2);

-- Vaskemaskine tilslutning
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Vaskemaskine tilslutning',
  'VASK-TILSL',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Dedikeret gruppe til vaskemaskine',
  35,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VASK-TILSL'), 'Synlig', 'SYN', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'VASK-TILSL'), 'Skjult', 'SKJ', 1.40, 15, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VASK-TILSL'), 'Stikkontakt 1-fag', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'VASK-TILSL'), 'Installationskabel 3G2.5', 6, 'm', 2),
  ((SELECT id FROM calc_components WHERE code = 'VASK-TILSL'), 'Automatsikring B16', 1, 'stk', 3);

-- Datanetværk udtag
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Netværksudtag Cat6',
  'NET-CAT6',
  (SELECT id FROM calc_component_categories WHERE slug = 'data'),
  'Netværksudtag Cat6 inkl. kabel',
  35,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Gipsvæg', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Påbygning', 'PAA', 0.80, 0, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Netværksudtag Cat6', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Cat6 kabel', 15, 'm', 2),
  ((SELECT id FROM calc_components WHERE code = 'NET-CAT6'), 'Indmuringsdåse', 1, 'stk', 3);

-- Røgalarm
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Røgalarm 230V',
  'ROEG-230',
  (SELECT id FROM calc_component_categories WHERE slug = 'safety'),
  '230V røgalarm med batteribackup',
  25,
  2,
  1.0
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'ROEG-230'), 'Enkelt', 'ENK', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'ROEG-230'), 'Seriekoblet', 'SERIE', 1.30, 10, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'ROEG-230'), 'Røgalarm 230V', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'ROEG-230'), 'Installationskabel 3G1.5', 4, 'm', 2);

-- Ventilator
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Badeværelsesventilator',
  'VENT-BAD',
  (SELECT id FROM calc_component_categories WHERE slug = 'appliances'),
  'Ventilator til badeværelse',
  40,
  2,
  1.1
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Uden timer', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Med timer', 'TIMER', 1.20, 10, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Med fugtføler', 'FUGT', 1.30, 15, false, 3);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Ventilator Ø100', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Installationskabel 3G1.5', 5, 'm', 2),
  ((SELECT id FROM calc_components WHERE code = 'VENT-BAD'), 'Flexslange Ø100', 2, 'm', 3);

-- Gulvvarme termostat
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor)
VALUES (
  'Gulvvarme termostat',
  'GULV-TERM',
  (SELECT id FROM calc_component_categories WHERE slug = 'heating'),
  'Digital termostat til el-gulvvarme',
  35,
  3,
  1.2
);

INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'GULV-TERM'), 'Standard', 'STD', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'GULV-TERM'), 'Smart/WiFi', 'WIFI', 1.30, 15, false, 2);

INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'GULV-TERM'), 'Termostat digital', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'GULV-TERM'), 'Indmuringsdåse dyb', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'GULV-TERM'), 'Følerledning', 3, 'm', 3);

-- =====================================================
-- Ensure all new categories exist
-- =====================================================

INSERT INTO calc_component_categories (name, slug, description, sort_order)
VALUES
  ('Afbrydere', 'switches', 'Afbrydere, dimmere og sensorer', 2),
  ('Kabelføring', 'wiring', 'Kabler, rør og kabelbakker', 5),
  ('Hårde hvidevarer', 'appliances', 'Tilslutning af hårde hvidevarer', 6),
  ('Data og netværk', 'data', 'Netværk og svagstrøm', 7),
  ('Sikkerhed', 'safety', 'Røgalarmer og sikkerhedsudstyr', 8),
  ('Varme', 'heating', 'Varmeinstallationer', 9)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- Update component category references for new categories
-- =====================================================

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'switches')
WHERE code IN ('AFB-1', 'AFB-2', 'AFB-KORR', 'AFB-KRYDS', 'DIM-STD', 'PIR-STD');

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'wiring')
WHERE code IN ('KABEL-SYN', 'KABEL-SKJ', 'ROR-SYN', 'BAKKE');

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'appliances')
WHERE code IN ('EMH-TILSL', 'KOMF-TILSL', 'VASK-TILSL', 'VENT-BAD');

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'data')
WHERE code IN ('NET-CAT6');

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'safety')
WHERE code IN ('ROEG-230');

UPDATE calc_components SET category_id = (SELECT id FROM calc_component_categories WHERE slug = 'heating')
WHERE code IN ('GULV-TERM');
