-- =====================================================
-- Migration 00232: eksplicit afregningsform på sager og tilbud (fast pris / regning)
--
-- STATUS: UDKAST — kræver Henriks EKSPLICITTE godkendelse (branch billing-model-00232). Ikke kørt i prod.
--
-- Baggrund (Henrik 2026-10-15): "kontraktsum ⇒ fast pris" må ikke være den langsigtede regel — alle sager fra tilbud får
-- en kontraktsum, så regningsarbejde kan klassificeres forkert. Ingen gæt.
-- Ændring:
--   service_cases.billing_model, offers.billing_model: 'fixed_price' | 'time_and_materials' | NULL (ikke valgt)
-- Data: KUN sikre sager klassificeres — sager uden kontraktsum og uden revideret beløb → 'time_and_materials'.
--   Alle andre (tvetydige) forbliver NULL og vælges manuelt (slutfaktura blokeres indtil da).
--   Prod-scan 2026-10-15: 4 sikre (sættes), 4 tvetydige (forbliver NULL), 0 sikre fast-pris.
-- RLS: kolonner på eksisterende tabeller → eksisterende politikker gælder.
-- Pre/post: npx tsx scripts/prod-billing-model-scan.ts (+ fordeling af billing_model efter)
-- Rollback:
--   ALTER TABLE public.service_cases DROP COLUMN IF EXISTS billing_model;
--   ALTER TABLE public.offers DROP COLUMN IF EXISTS billing_model;
-- =====================================================

BEGIN;

ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS billing_model text;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS billing_model text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_billing_model_check') THEN
    ALTER TABLE public.service_cases ADD CONSTRAINT service_cases_billing_model_check
      CHECK (billing_model IS NULL OR billing_model IN ('fixed_price', 'time_and_materials'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_billing_model_check') THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_billing_model_check
      CHECK (billing_model IS NULL OR billing_model IN ('fixed_price', 'time_and_materials'));
  END IF;
END $$;

-- KUN sikre sager: ingen kontraktsum og intet revideret beløb → regning
UPDATE public.service_cases SET billing_model = 'time_and_materials'
 WHERE billing_model IS NULL AND contract_sum IS NULL AND revised_sum IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
