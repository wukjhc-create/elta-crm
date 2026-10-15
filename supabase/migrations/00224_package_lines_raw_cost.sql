-- =====================================================
-- Migration 00224: apply_package_to_offer — rå leverandørkost og faktisk avance på pakkelinjer (GP-6)
--
-- STATUS: UDKAST — BLOCKED_APPROVAL (Henrik). Branch package-pricing-00224 (TS sender raw_cost_price; funktionen
--         ignorerer feltet før migrationen → koden kan deployes før eller efter, men skal merges sammen).
--
-- Baggrund (grossist-review 2026-10-14, GP-6): pakke-/auto-tilbudsstien
--  1. gemte den KUNDERABATTEREDE kost som supplier_cost_price_at_creation → getOfferSupplierPriceChanges viste en falsk
--     "pris ændret +X %" lig med rabatten på hver pakkelinje;
--  2. gemte margin_percentage/supplier_margin_applied = 0 når ingen avanceregel fandtes, selvom calculate_sale_price
--     prissatte med standardavancen.
-- Ændring: definitionen er prod's (pg_get_functiondef 2026-10-14) med tre ændringer: nyt jsonb-felt raw_cost_price →
-- supplier_cost_price_at_creation; avance = faktisk (salgspris/kost − 1) når kost > 0; EXECUTE fjernet for anon/PUBLIC
-- (SECURITY INVOKER, RLS blokerede allerede — kun oprydning). Avancen holdes inden for NUMERIC(5,2) (±999,99). Afrunding (DB ROUND vs. TS ceil) er uændret.
--
-- Data: ingen rækker ændres (prod: 0 pakkelinjer, 14 pakker — scripts/prod-package-lines-usage.ts).
-- Pre/post (read-only): scripts/prod-fn-def.ts apply_package_to_offer (diff = de tre punkter) + prod-package-lines-usage
-- Rollback: genkør definitionen fra 00079 (UDEN at genåbne anon/PUBLIC — Henrik 2026-10-15: kræver særskilt vurdering)
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_package_to_offer(p_offer_id uuid, p_package_id uuid, p_customer_id uuid, p_lines jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pkg_slug   TEXT;
  v_start_pos  INTEGER;
  v_inserted   INTEGER := 0;
BEGIN
  -- Lock the package row so concurrent applies see consistent slug + state.
  SELECT slug INTO v_pkg_slug
    FROM offer_packages
   WHERE id = p_package_id AND is_active = true
   FOR SHARE;

  IF v_pkg_slug IS NULL THEN
    RAISE EXCEPTION 'apply_package_to_offer: package % not found or inactive', p_package_id;
  END IF;

  -- Find next position so we coexist with manually edited lines.
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_start_pos
    FROM offer_line_items
   WHERE offer_id = p_offer_id;

  -- Single batch insert. jsonb_to_recordset gives us a typed projection;
  -- get_effective_margin + calculate_sale_price are evaluated once per row.
  WITH input AS (
    SELECT
      row_number() OVER ()                            AS rn,
      x.material_id,
      x.supplier_id,
      x.supplier_product_id,
      x.supplier_name,
      x.category,
      x.sub_category,
      x.section,
      x.description,
      x.unit,
      GREATEST(COALESCE(x.quantity, 0), 0)::numeric   AS quantity,
      GREATEST(COALESCE(x.cost_price, 0), 0)::numeric AS cost_price,
      -- 00224 (GP-6): rå leverandørkost (før kundeaftale); mangler den, bruges den effektive
      GREATEST(COALESCE(x.raw_cost_price, x.cost_price, 0), 0)::numeric AS raw_cost_price,
      x.notes
    FROM jsonb_to_recordset(p_lines) AS x(
      material_id         UUID,
      supplier_id         UUID,
      supplier_product_id UUID,
      supplier_name       TEXT,
      category            TEXT,
      sub_category        TEXT,
      section             TEXT,
      description         TEXT,
      unit                TEXT,
      quantity            NUMERIC,
      cost_price          NUMERIC,
      raw_cost_price      NUMERIC,
      notes               TEXT
    )
  ),
  priced AS (
    SELECT
      i.*,
      (v_start_pos + i.rn - 1)::int AS position,
      m.margin_percentage           AS margin_pct,
      calculate_sale_price(
        i.cost_price,
        i.supplier_id,
        i.supplier_product_id,
        i.category,
        i.sub_category,
        p_customer_id
      ) AS sale_price
    FROM input i
    LEFT JOIN LATERAL get_effective_margin(
      i.supplier_id,
      i.supplier_product_id,
      i.category,
      i.sub_category,
      p_customer_id
    ) m ON TRUE
  ),
  ins AS (
    INSERT INTO offer_line_items (
      offer_id, position, section, line_type, description,
      quantity, unit,
      cost_price, margin_percentage, sale_price, unit_price,
      supplier_margin_applied, discount_percentage, total,
      material_id, supplier_product_id,
      supplier_cost_price_at_creation, supplier_name_at_creation,
      notes
    )
    SELECT
      p_offer_id,
      p.position,
      p.section,
      'product',
      p.description,
      p.quantity,
      COALESCE(p.unit, 'stk'),
      p.cost_price,
      -- 00224 (GP-6): den FAKTISKE avance (salgspris/kost), også når calculate_sale_price faldt tilbage til standard-
      -- avancen uden regel (før gemt som 0 %), og inkl. fast tillæg/afrunding
      CASE WHEN p.cost_price > 0 THEN LEAST(999.99, GREATEST(-999.99, ROUND(((p.sale_price / p.cost_price) - 1) * 100, 2))) ELSE COALESCE(p.margin_pct, 0) END,
      p.sale_price,
      p.sale_price,                       -- legacy mirror
      CASE WHEN p.cost_price > 0 THEN LEAST(999.99, GREATEST(-999.99, ROUND(((p.sale_price / p.cost_price) - 1) * 100, 2))) ELSE COALESCE(p.margin_pct, 0) END,  -- legacy mirror
      0,
      ROUND((p.sale_price * p.quantity)::numeric, 2),
      p.material_id,
      p.supplier_product_id,
      p.raw_cost_price,                   -- 00224 (GP-6): rå leverandørkost (før: rabatteret → falsk "pris ændret")
      p.supplier_name,
      COALESCE(p.notes, 'Package: ' || v_pkg_slug)
    FROM priced p
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.apply_package_to_offer(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_package_to_offer(uuid, uuid, uuid, jsonb) TO authenticated, service_role;

COMMIT;
