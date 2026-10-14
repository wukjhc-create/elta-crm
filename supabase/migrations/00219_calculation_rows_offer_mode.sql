-- 00219: kalkulationsrækker får en EKSPLICIT tilbudstilstand (Henrik 2026-10-10, kalkulations-review #3).
--   visible          vises som tilbudslinje (som i dag med "Vis på tilbud" = til)
--   hidden_included  vises IKKE som egen linje, men indgår i kalkulationens total/DB OG i kundens tilbudspris
--                    (samles i én linje "Øvrige ydelser" ved import — ingen stille bortfald af kost eller pris)
--   excluded         påvirker hverken kalkulationens total eller tilbudsprisen (fx fravalgt option/notat-række);
--                    kosten vises stadig på rækken, men tælles ikke med
-- Før: "Vis på tilbud" = fra betød "skjult" i tilbuddet, men rækken talte stadig i kalkulationens total → tilbuddet blev
-- lavere end kalkulationen (14.400 → 12.000) uden at nogen så det.
--
-- Backfill: show_on_offer = false → 'hidden_included' (nærmest dagens kalkulationstotal; nu også med i tilbudsprisen).
-- show_on_offer bevares (= offer_mode = 'visible') for bagudkompatibilitet.
-- update_calculation_totals: udelukker 'excluded'; dækningsbidrag (gross_profit) beregnes nu efter avance og rabat
-- (review #9a: før på subtotal alene → 2.000 / 20 % i stedet for 2.800 / 25,9 %).
-- Dataændring: kun backfill af den nye kolonne; totaler genberegnes ved næste rækkeændring.

BEGIN;

ALTER TABLE public.calculation_rows
  ADD COLUMN IF NOT EXISTS offer_mode text NOT NULL DEFAULT 'visible';

DO $$ BEGIN
  ALTER TABLE public.calculation_rows
    ADD CONSTRAINT calculation_rows_offer_mode_check CHECK (offer_mode IN ('visible', 'hidden_included', 'excluded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.calculation_rows SET offer_mode = 'hidden_included'
  WHERE show_on_offer = false AND offer_mode = 'visible';

COMMENT ON COLUMN public.calculation_rows.offer_mode IS
  'visible = tilbudslinje; hidden_included = ingen egen linje men med i total/tilbudspris (samlelinje); excluded = hverken total eller tilbudspris';

CREATE OR REPLACE FUNCTION update_calculation_totals()
RETURNS TRIGGER AS $$
DECLARE
  calc_id UUID;
  v_subtotal DECIMAL(12, 2);
  v_materials DECIMAL(12, 2);
  v_labor DECIMAL(12, 2);
  v_other DECIMAL(12, 2);
  v_variable DECIMAL(12, 2);
  v_fixed DECIMAL(12, 2);
  v_total_cost DECIMAL(12, 2);
  v_cm DECIMAL(12, 2);
  v_cm_ratio DECIMAL(5, 2);
  v_gross_profit DECIMAL(12, 2);
  v_gross_margin DECIMAL(5, 2);
  v_margin_pct DECIMAL(5, 2);
  v_discount_pct DECIMAL(5, 2);
  v_tax_pct DECIMAL(5, 2);
  v_margin_amt DECIMAL(12, 2);
  v_discount_amt DECIMAL(12, 2);
  v_pre_discount DECIMAL(12, 2);
  v_pre_tax DECIMAL(12, 2);
  v_tax_amt DECIMAL(12, 2);
  v_final DECIMAL(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    calc_id := OLD.calculation_id;
  ELSE
    calc_id := NEW.calculation_id;
  END IF;

  SELECT margin_percentage, discount_percentage, tax_percentage
  INTO v_margin_pct, v_discount_pct, v_tax_pct
  FROM calculations WHERE id = calc_id;

  -- 00219: 'excluded'-rækker tæller hverken i pris eller kost
  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(CASE WHEN section = 'Materialer' THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN section IN ('Arbejdslon', 'Arbejdsløn') THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN section NOT IN ('Materialer', 'Arbejdslon', 'Arbejdsløn') THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cost_category = 'variable' OR cost_category IS NULL THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cost_category = 'fixed' THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(COALESCE(cost_price, 0) * quantity), 0)
  INTO v_subtotal, v_materials, v_labor, v_other, v_variable, v_fixed, v_total_cost
  FROM calculation_rows WHERE calculation_id = calc_id AND offer_mode <> 'excluded';

  v_margin_amt := v_subtotal * COALESCE(v_margin_pct, 0) / 100;
  v_pre_discount := v_subtotal + v_margin_amt;
  v_discount_amt := v_pre_discount * COALESCE(v_discount_pct, 0) / 100;
  v_pre_tax := v_pre_discount - v_discount_amt;
  v_tax_amt := v_pre_tax * COALESCE(v_tax_pct, 25) / 100;
  v_final := v_pre_tax + v_tax_amt;

  -- 00219 (review #9a): dækningsbidrag på nettosalget (efter avance og rabat)
  v_cm := v_pre_tax - v_variable;
  v_cm_ratio := CASE WHEN v_pre_tax > 0 THEN (v_cm / v_pre_tax) * 100 ELSE 0 END;
  v_gross_profit := v_pre_tax - v_total_cost;
  v_gross_margin := CASE WHEN v_pre_tax > 0 THEN (v_gross_profit / v_pre_tax) * 100 ELSE 0 END;

  UPDATE calculations SET
    subtotal = v_subtotal,
    total_materials_cost = v_materials,
    total_labor_cost = v_labor,
    total_other_costs = v_other,
    total_variable_costs = v_variable,
    total_fixed_costs = v_fixed,
    contribution_margin = v_cm,
    contribution_margin_ratio = v_cm_ratio,
    gross_profit = v_gross_profit,
    gross_profit_margin = v_gross_margin,
    margin_amount = v_margin_amt,
    discount_amount = v_discount_amt,
    tax_amount = v_tax_amt,
    final_amount = v_final,
    updated_at = NOW()
  WHERE id = calc_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';

COMMIT;
