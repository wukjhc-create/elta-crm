-- 00193 — DATA (R0): kontraktsum ekskl. moms på 3 sager oprettet fra tilbud før rettelsen i 07c990e
--
-- Godkendt af Henrik i chat 2026-10-05 ("R0 CONTRACT SUM — Godkendt efter sidste read-only verification").
-- Read-only verifikation umiddelbart før (scripts/prod-r0-contract-sum-preview.ts):
--   SVC-01003  131,34   → 105,07
--   SVC-01019  2.214,00 → 1.771,20
--   SVC-01228  6.250,00 → 5.000,00
--   SVC-01002  0        → uændret (0 moms)
-- Værn: kun de 3 navngivne sager, kun hvis nuværende værdi er præcis den forventede; præcis 3 rækker ellers rulles alt
-- tilbage. Ingen fakturaer ændres (ingen af dem er rater på kontraktsummen).
--
-- Rollback (manuelt, kun hvis nødvendigt):
--   UPDATE service_cases SET contract_sum = 131.34 WHERE case_number = 'SVC-01003';
--   UPDATE service_cases SET contract_sum = 2214.00 WHERE case_number = 'SVC-01019';
--   UPDATE service_cases SET contract_sum = 6250.00 WHERE case_number = 'SVC-01228';

BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.service_cases s
     SET contract_sum = v.ny, updated_at = now()
    FROM (VALUES ('SVC-01003', 131.34::numeric, 105.07::numeric),
                 ('SVC-01019', 2214.00::numeric, 1771.20::numeric),
                 ('SVC-01228', 6250.00::numeric, 5000.00::numeric)) AS v(case_number, gammel, ny)
   WHERE s.case_number = v.case_number
     AND s.contract_sum = v.gammel;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN
    RAISE EXCEPTION '00193: forventede præcis 3 opdaterede sager, fik % — intet ændret', n;
  END IF;
END $$;

COMMIT;
