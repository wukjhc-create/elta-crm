# Forslag 00251: kundeaftaler i `get_customer_product_price` (CA-3)

**Status:** BLOCKED_APPROVAL (særskilt godkendelse kræves). Ikke kørt.
**Kilde:** kalkule-review 2026-10-18 (NEXT-42, CA-3).
**Prod bekræftet read-only:** `scripts/prod-fn-def.ts get_customer_product_price` (2026-10-18). Prod har samme krop som
00043.

## Fund

Funktionen tester RECORD-variabler med `IF v_customer_price IS NOT NULL` og `IF v_customer_supplier IS NOT NULL`. For en
row-værdi er `IS NOT NULL` kun sand, når **alle** felter er ikke-NULL. Derfor springes to almindelige tilfælde over:

- **Leverandøraftale uden egen avance:** en aftale med fx 10 % rabat og `custom_margin_percentage` = NULL bruges ikke.
  Effektiv kost bliver listekost.
- **Delvis kundeproduktpris:** en pris med kun `custom_cost_price` udfyldt bruges ikke.

**Kaldere:**
- `material-catalog.ts` (startlinjer/pakker/auto-tilbud)
- `supplier-best-price.ts`
- `customer-pricing.ts` (visning af kundepris)

## SQL (kun de to tests ændres + deterministisk valg)

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.get_customer_product_price(p_customer_id uuid, p_supplier_product_id uuid)
RETURNS TABLE (
  effective_cost_price numeric(12,2), effective_list_price numeric(12,2), discount_percentage numeric(5,2),
  margin_percentage numeric(5,2), effective_sale_price numeric(12,2), price_source text
) AS $$
DECLARE
  v_product RECORD;
  v_customer_price RECORD;
  v_customer_supplier RECORD;
  v_supplier_settings RECORD;
  v_cost numeric(12,2);
  v_list numeric(12,2);
  v_discount numeric(5,2) := 0;
  v_margin numeric(5,2);
  v_source text := 'standard';
BEGIN
  SELECT sp.cost_price, sp.list_price, sp.margin_percentage, sp.supplier_id INTO v_product
  FROM supplier_products sp WHERE sp.id = p_supplier_product_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_cost := v_product.cost_price;
  v_list := v_product.list_price;
  v_margin := v_product.margin_percentage;

  SELECT cpp.custom_cost_price, cpp.custom_list_price, cpp.custom_discount_percentage INTO v_customer_price
  FROM customer_product_prices cpp
  WHERE cpp.customer_id = p_customer_id AND cpp.supplier_product_id = p_supplier_product_id AND cpp.is_active = true
    AND (cpp.valid_from IS NULL OR cpp.valid_from <= CURRENT_DATE) AND (cpp.valid_to IS NULL OR cpp.valid_to >= CURRENT_DATE)
  ORDER BY cpp.valid_from DESC NULLS LAST LIMIT 1;

  IF FOUND THEN                                   -- CA-3: før "v_customer_price IS NOT NULL" (alle felter ≠ NULL)
    v_source := 'customer_product';
    IF v_customer_price.custom_cost_price IS NOT NULL THEN v_cost := v_customer_price.custom_cost_price; END IF;
    IF v_customer_price.custom_list_price IS NOT NULL THEN v_list := v_customer_price.custom_list_price; END IF;
    IF v_customer_price.custom_discount_percentage IS NOT NULL THEN v_discount := v_customer_price.custom_discount_percentage; END IF;
  ELSE
    SELECT csp.discount_percentage, csp.custom_margin_percentage INTO v_customer_supplier
    FROM customer_supplier_prices csp
    WHERE csp.customer_id = p_customer_id AND csp.supplier_id = v_product.supplier_id AND csp.is_active = true
      AND (csp.valid_from IS NULL OR csp.valid_from <= CURRENT_DATE) AND (csp.valid_to IS NULL OR csp.valid_to >= CURRENT_DATE)
    ORDER BY csp.valid_from DESC NULLS LAST LIMIT 1;

    IF FOUND THEN                                 -- CA-3: før "v_customer_supplier IS NOT NULL"
      v_source := 'customer_supplier';
      v_discount := COALESCE(v_customer_supplier.discount_percentage, 0);
      IF v_customer_supplier.custom_margin_percentage IS NOT NULL THEN v_margin := v_customer_supplier.custom_margin_percentage; END IF;
    END IF;
  END IF;

  IF v_margin IS NULL THEN
    SELECT ss.default_margin_percentage INTO v_supplier_settings FROM supplier_settings ss WHERE ss.supplier_id = v_product.supplier_id;
    v_margin := COALESCE(v_supplier_settings.default_margin_percentage, 25.00);
  END IF;

  effective_cost_price := v_cost * (1 - v_discount / 100);
  effective_list_price := v_list;
  discount_percentage := v_discount;
  margin_percentage := v_margin;
  effective_sale_price := effective_cost_price * (1 + v_margin / 100);
  price_source := v_source;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
-- Bevar eksisterende ACL (tjek prod-fn-acl før/efter; REVOKE FROM PUBLIC, anon jf. supabase-function-acl)
COMMIT;
```

## Vurdering

- **Risiko:** lav-middel. Priserne **ændres** for kunder med en leverandøraftale uden egen avance. De får nu den aftalte
  rabat; det er tilsigtet, men det påvirker nye tilbudslinjer og prisvisninger.
- **Pre-tjek (prod read-only):**
  - antal aktive `customer_supplier_prices` med `custom_margin_percentage IS NULL`;
  - antal aktive `customer_product_prices` med NULL-felter (aggregat).
  - Begge er = antal aftaler, der i dag ignoreres.
- **Post-tjek:**
  - `prod-fn-def` viser `IF FOUND`;
  - `prod-fn-acl` er uændret;
  - stikprøve: en kunde med 10 % aftale giver `price_source = 'customer_supplier'` og kost × 0,9.
- **Rollback:** genskab 00043-kroppen (`CREATE OR REPLACE` med de oprindelige `IS NOT NULL`-tests).

## Relateret (ikke i denne migration)

- **CA-6 (præcedens):**
  - én implementering (kundeaftale/-regel > produkt > underkategori > kategori > leverandør > standard) i både TS
    (`supplier-line-pricing.ts`) og SQL (`get_effective_margin`, `calculate_sale_price`);
  - kræver en beslutning om rækkefølgen og en migration.
- **CA-9 (afrunding):** `round_to` er ceil i TS og ROUND i SQL. Kræver en beslutning om én regel og en migration til
  `calculate_sale_price`.
- **CA-7 (solar-kost):** se 00243-forslaget (`docs/runbooks/security-2026-10-17-proposal.md`).
