-- 00201 — Kost-lockdown bølge 2b (Henrik 2026-10-07: HIGH PRIORITY, staging først, ingen prod uden approval).
--
-- Tabeller som salg OGSÅ læser (read-site-analyse) — derfor ikke ren rolle-scoping som 00200:
--   * product_catalog: salg bladrer i kataloget (salgspriser) → kolonne-niveau som 00192: cost_price har ingen
--     kolonne-SELECT for authenticated; appen læser kost med admin-klienten bag products.view.cost_prices
--     (src/lib/products/product-columns.ts, products.ts withProductCost).
--   * customer_supplier_prices (kunderabat/-avance): salgs-stierne læser nu med admin-klienten bag offers.edit/view
--     (kun server-side prisberegning) → rolle-scopet SELECT som 00200.
--   * calculations: salgs-stien (importCalculationToOffer) læser nu med admin-klienten → rolle-scopet SELECT.
-- Anon er allerede uden adgang (scripts/prod-anon-cost-exposure.ts). Skrive-politikker uændrede.
--
-- Rollback: GRANT SELECT ON public.product_catalog TO authenticated; genskab
--   "Authenticated users can view customer supplier prices" / "Users can view own calculations" (FOR SELECT USING (true))
--   og DROP de nye *_select_cost_roles-politikker.

BEGIN;

-- product_catalog: kolonne-niveau (alle kolonner undtagen cost_price)
REVOKE SELECT ON public.product_catalog FROM authenticated;
GRANT SELECT (id, sku, name, description, category_id, list_price, unit, specifications, is_active, created_by, created_at, updated_at)
  ON public.product_catalog TO authenticated;

-- customer_supplier_prices
DROP POLICY IF EXISTS "Authenticated users can view customer supplier prices" ON public.customer_supplier_prices;
CREATE POLICY customer_supplier_prices_select_cost_roles ON public.customer_supplier_prices FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- calculations
DROP POLICY IF EXISTS "Users can view own calculations" ON public.calculations;
CREATE POLICY calculations_select_cost_roles ON public.calculations FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

COMMIT;
