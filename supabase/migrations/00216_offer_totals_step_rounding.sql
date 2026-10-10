-- 00216: tilbudstotaler afrundes trinvis — samme formel som appens recomputeOfferTotals (lib/services/offer-pricing.ts).
-- Tilbuds-review 2026-10-09 (#9, S4): triggeren (00005) beregnede moms og total ud fra et UAFRUNDET nettobeløb og lod
-- kolonnetypen afrunde hvert felt for sig → 1-øres afvigelser: linjer 100,04 med 12,5 % rabat gav rabat 12,51, moms
-- 21,88, total 109,42, mens PDF/mail viser 100,04 − 12,51 + 21,88 = 109,41 (og contract_sum blev 87,54 i stedet for
-- 87,53). Samme tilbud fik 109,41 efter en hovedredigering (appen) og 109,42 efter en linjeredigering (triggeren).
--   rabat = round(linjesum × rabat% / 100, 2); netto = linjesum − rabat; moms = round(netto × moms% / 100, 2);
--   total = netto + moms   (manglende moms% = 25 som i appen)
-- Kun funktionskroppen ændres (triggeren er uændret). Eksisterende tilbud genberegnes IKKE (ingen dataændring) — de
-- får ny afrunding ved næste linjeændring (kun kladder kan ændres).

BEGIN;

CREATE OR REPLACE FUNCTION public.update_offer_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_offer_id uuid;
  v_sum numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_offer_id := OLD.offer_id;
  ELSE
    v_offer_id := NEW.offer_id;
  END IF;

  SELECT ROUND(COALESCE(SUM(total), 0), 2) INTO v_sum
  FROM public.offer_line_items
  WHERE offer_id = v_offer_id;

  UPDATE public.offers o
  SET
    total_amount = v_sum,
    discount_amount = ROUND(v_sum * (COALESCE(o.discount_percentage, 0) / 100), 2),
    tax_amount = ROUND((v_sum - ROUND(v_sum * (COALESCE(o.discount_percentage, 0) / 100), 2)) * (COALESCE(o.tax_percentage, 25) / 100), 2),
    final_amount = (v_sum - ROUND(v_sum * (COALESCE(o.discount_percentage, 0) / 100), 2))
      + ROUND((v_sum - ROUND(v_sum * (COALESCE(o.discount_percentage, 0) / 100), 2)) * (COALESCE(o.tax_percentage, 25) / 100), 2)
  WHERE o.id = v_offer_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
