-- 00190 — Faktura fra tilbud = det kunden accepterede (faktura-review B7 + salgs-review T2, 2026-10-04)
--
-- Problem (prod-definitionen læst read-only 2026-10-04):
--   * Linjer prissættes med COALESCE(sale_price, unit_price). sale_price er NOT NULL DEFAULT 0, og manuelle linjer,
--     produkter, kalkulationer og leverandørlinjer sætter den aldrig → fakturalinjen bliver 0 kr. Rettede linjer
--     (unit_price ændret) faktureres til den gamle pris.
--   * Linjerabat (offer_line_items.discount_percentage) og tilbudsrabat (offers.discount_percentage) ignoreres →
--     fakturaen bliver højere end det accepterede tilbud.
--   * Forfaldsdato = CURRENT_DATE (UTC) → en dag for tidligt mellem kl. 00 og 02 dansk tid.
--
-- Ny model: fakturaen = tilbuddets egne totaler, som kunden så og accepterede (DB-triggeren update_offer_totals):
--   * linjens beløb = offer_line_items.total (antal × enhedspris × (1 − linjerabat)); enhedspris = total / antal
--   * tilbudsrabat som egen negativ linje "Rabat (x %)" = −offers.discount_amount
--   * total_amount = offers.total_amount − offers.discount_amount, tax_amount = offers.tax_amount,
--     final_amount = offers.final_amount  (præcis det accepterede beløb)
--   * forfald = dansk dato + p_due_days
-- Signatur, idempotens (én faktura pr. tilbud), låsning og status-tjek er uændrede.
--
-- Prod før (read-only 2026-10-04): 0 fakturaer fra tilbud, 0 tilbud med rabat; automatikreglen kører dry_run.
-- Ingen eksisterende data ændres.
--
-- Rollback: genskab funktionen fra 00080_invoices.sql (afsnittet create_invoice_from_offer).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_invoice_from_offer(p_offer_id uuid, p_due_days integer DEFAULT 14)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_offer       RECORD;
  v_existing_id UUID;
  v_invoice_id  UUID;
  v_invoice_no  TEXT;
  v_discount    NUMERIC(12,2);
  v_next_pos    INTEGER;
BEGIN
  SELECT id, status, customer_id, currency, tax_percentage, total_amount, discount_percentage, discount_amount,
         tax_amount, final_amount
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

  v_discount := ROUND(COALESCE(v_offer.discount_amount, 0)::numeric, 2);
  v_invoice_no := allocate_invoice_number();

  INSERT INTO invoices (
    invoice_number, customer_id, offer_id, status,
    total_amount, tax_amount, final_amount, currency, due_date
  ) VALUES (
    v_invoice_no, v_offer.customer_id, p_offer_id, 'draft',
    ROUND((COALESCE(v_offer.total_amount, 0) - v_discount)::numeric, 2),
    ROUND(COALESCE(v_offer.tax_amount, 0)::numeric, 2),
    ROUND(COALESCE(v_offer.final_amount, 0)::numeric, 2),
    COALESCE(v_offer.currency, 'DKK'),
    ((now() AT TIME ZONE 'Europe/Copenhagen')::date + GREATEST(COALESCE(p_due_days, 14), 0))
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit, unit_price, total_price)
  SELECT
    v_invoice_id,
    ROW_NUMBER() OVER (ORDER BY li.position NULLS LAST, li.id),
    COALESCE(li.description, ''),
    COALESCE(li.quantity, 0),
    li.unit,
    CASE WHEN COALESCE(li.quantity, 0) <> 0
      THEN ROUND((COALESCE(li.total, 0) / li.quantity)::numeric, 2)
      ELSE ROUND(COALESCE(li.unit_price, 0)::numeric, 2) END,
    ROUND(COALESCE(li.total, 0)::numeric, 2)
    FROM offer_line_items li
   WHERE li.offer_id = p_offer_id;

  IF v_discount <> 0 THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos FROM invoice_lines WHERE invoice_id = v_invoice_id;
    INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit, unit_price, total_price)
    VALUES (v_invoice_id, v_next_pos,
            'Rabat (' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM COALESCE(v_offer.discount_percentage, 0)::text)) || ' %)',
            1, NULL, -v_discount, -v_discount);
  END IF;

  RETURN v_invoice_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verifikation (staging, efter godkendelse): npm run harness -- offer-invoice-amounts
--   tilbud 10 % tilbudsrabat + 15 % linjerabat + manuel linje (sale_price 0) → faktura.final_amount = offers.final_amount,
--   sum(invoice_lines.total_price) = invoices.total_amount, rabatlinje = −discount_amount, forfald = dansk dato + 14.
