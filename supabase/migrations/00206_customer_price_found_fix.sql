-- 00206 — get_customer_product_price: kunderabat ignoreret når aftalen ikke har egen avance (review 2026-10-08).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- Fejl: efter SELECT … INTO <record> tjekkede funktionen `IF <record> IS NOT NULL`. I PL/pgSQL er det kun sandt når
-- ALLE felter er ikke-NULL → en leverandøraftale med rabat men uden custom_margin_percentage (det normale) blev
-- ignoreret, og effektiv kostpris = råkost. Staging-bevis: `cli.ts customer-price-rpc-check` — rabat 10 % uden avance
-- → 100 (forventet 90); med avance 20 % → 90. Rettelse: `IF FOUND` (sat af den umiddelbart forudgående SELECT INTO).
-- Definitionen er staging's pg_get_functiondef, KUN de to IF-linjer er ændret.
--
-- Effekt: kundeaftaler (rabat) slår igennem i pris-værktøjet, auto-tilbud og materialekatalog. Pre: tæl aktive
-- customer_supplier_prices uden custom_margin_percentage i prod (read-only) for at kende omfanget.
-- Rollback: genkør definitionen fra 00043 (CREATE OR REPLACE).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_product_price(p_customer_id uuid, p_supplier_product_id uuid)
 RETURNS TABLE(effective_cost_price numeric, effective_list_price numeric, discount_percentage numeric, margin_percentage numeric, effective_sale_price numeric, price_source text)
 LANGUAGE plpgsql
AS $function$
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

  IF FOUND THEN -- 00206: før 'v_customer_price IS NOT NULL' (falsk når ét felt er NULL)
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

    IF FOUND THEN -- 00206: før 'v_customer_supplier IS NOT NULL' (falsk når custom_margin_percentage er NULL → rabat ignoreret)
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
$function$
;

COMMIT;
