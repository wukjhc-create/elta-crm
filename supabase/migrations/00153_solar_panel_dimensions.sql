-- Migration: Solar Panel Physical Dimensions
-- Description: Tilføj fysiske mål (width_mm/height_mm) til eksisterende solpaneler
--              i solar_products.specifications (JSONB). Bruges af den målfaste
--              solpanel-tegneflade til besigtigelser, så panelstørrelse kommer
--              fra ægte, redigerbar data i stedet for en hardcode.
-- Date: 2026-06-25
--
-- Note: Målene er plausible standardværdier for halvcelle-moduler og BØR
--       bekræftes mod rigtige datablade. De kan til enhver tid rettes i UI'et
--       under /dashboard/settings/solar (panel-editoren).

UPDATE solar_products
SET specifications = specifications || '{"width_mm": 1722, "height_mm": 1134}'::jsonb
WHERE product_type = 'panel' AND code = 'PANEL-STD';

UPDATE solar_products
SET specifications = specifications || '{"width_mm": 1722, "height_mm": 1134}'::jsonb
WHERE product_type = 'panel' AND code = 'PANEL-PREMIUM';

UPDATE solar_products
SET specifications = specifications || '{"width_mm": 1956, "height_mm": 1134}'::jsonb
WHERE product_type = 'panel' AND code = 'PANEL-HIGH-EFF';
