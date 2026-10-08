-- 00198 — UDKAST (BLOCKED_APPROVAL, Henrik) — IKKE kørt på staging eller prod.
--
-- Problem (tilbuds-review 2026-10-07, S1 penge): create_invoice_from_offer prissætter linjer med
-- COALESCE(li.sale_price, li.unit_price, 0). offer_line_items.sale_price er NOT NULL DEFAULT 0 (00077), og de manuelle
-- linjeflows (og 10+ andre skrivesteder) gemmer kun unit_price → sale_price = 0 → linjen faktureres til 0 kr (eller en
-- forældet pris efter redigering). Automatik-reglen "Auto-faktura ved tilbud accepteret" er AKTIV i prod og SENDER
-- fakturaen ved portal-accept. Prod read-only (scripts/prod-offer-invoice-price-exposure.ts): 6 linjer på 5 tilbud,
-- heraf 1 åbent tilbud; 0 fakturaer oprettet fra tilbud endnu; ingen linje hvor sale_price ≠ unit_price når begge er sat.
--
-- Midlertidig beskyttelse (deployet, ingen DB-ændring): createInvoiceFromOffer afviser tilbud med sådanne linjer.
--
-- Denne migration:
--   1) Funktionen prissætter med unit_price (samme grundlag som tilbuddets totaler i update_offer_totals), sale_price
--      kun som fallback.
--   2) Data: sale_price := unit_price hvor sale_price = 0 og unit_price ≠ 0 (de 6 prod-linjer).
--
-- Rollback: genkør funktionsdefinitionen fra 00080 (COALESCE(li.sale_price, li.unit_price, 0)); data-rettelsen er
-- harmløs at beholde (sale_price var 0 = ugyldig).

BEGIN;

CREATE OR REPLACE FUNCTION create_invoice_from_offer(
  p_offer_id  UUID,
  p_due_days  INTEGER DEFAULT 14
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_offer       RECORD;
  v_existing_id UUID;
  v_invoice_id  UUID;
  v_invoice_no  TEXT;
  v_total       NUMERIC(12,2);
  v_tax_pct     NUMERIC(5,2);
  v_tax         NUMERIC(12,2);
  v_final       NUMERIC(12,2);
  v_currency    TEXT;
BEGIN
  SELECT id, status, customer_id, currency, tax_percentage
    INTO v_offer
    FROM offers
   WHERE id = p_offer_id
   FOR UPDATE;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'create_invoice_from_offer: offer % not found', p_offer_id;
  END IF;

  IF v_offer.status <> 'accepted' THEN
    RAISE EXCEPTION 'create_invoice_from_offer: offer % is %, expected accepted', p_offer_id, v_offer.status;
  END IF;

  SELECT id INTO v_existing_id FROM invoices WHERE offer_id = p_offer_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- 00198: unit_price er tilbuddets pris (update_offer_totals bygger på den); sale_price kun som fallback
  SELECT COALESCE(SUM(ROUND((COALESCE(li.unit_price, li.sale_price, 0) * li.quantity)::numeric, 2)), 0)
    INTO v_total
    FROM offer_line_items li
   WHERE li.offer_id = p_offer_id;

  v_tax_pct  := COALESCE(v_offer.tax_percentage, 25);
  v_tax      := ROUND((v_total * v_tax_pct / 100)::numeric, 2);
  v_final    := ROUND((v_total + v_tax)::numeric, 2);
  v_currency := COALESCE(v_offer.currency, 'DKK');

  v_invoice_no := allocate_invoice_number();

  INSERT INTO invoices (
    invoice_number, customer_id, offer_id, status,
    total_amount, tax_amount, final_amount, currency, due_date
  ) VALUES (
    v_invoice_no, v_offer.customer_id, p_offer_id, 'draft',
    v_total, v_tax, v_final, v_currency,
    (CURRENT_DATE + (GREATEST(COALESCE(p_due_days, 14), 0) || ' days')::interval)::date
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit, unit_price, total_price)
  SELECT
    v_invoice_id,
    COALESCE(li.position, ROW_NUMBER() OVER (ORDER BY li.position NULLS LAST, li.id)),
    COALESCE(li.description, ''),
    COALESCE(li.quantity, 0),
    li.unit,
    COALESCE(li.unit_price, li.sale_price, 0),
    ROUND((COALESCE(li.unit_price, li.sale_price, 0) * COALESCE(li.quantity, 0))::numeric, 2)
    FROM offer_line_items li
   WHERE li.offer_id = p_offer_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice_from_offer(UUID, INTEGER) TO authenticated, service_role;

UPDATE offer_line_items
   SET sale_price = unit_price
 WHERE coalesce(sale_price, 0) = 0
   AND coalesce(unit_price, 0) <> 0;

COMMIT;
