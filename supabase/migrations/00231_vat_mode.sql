-- =====================================================
-- Migration 00231: momsmodel — eksplicit momsmode på kunde, tilbud og faktura (PR-10)
--
-- STATUS: GODKENDT af Henrik 2026-10-15 ("00231 GODKENDT SOM VAT-DATAMODEL").
--
-- Modes (ingen gæt):
--   standard_25     25 % moms (standard)
--   zero            0 % moms (fx momsfritaget/eksport)
--   reverse_charge  omvendt betalingspligt (0 % + påtegning; kræver købers momsnr.)
-- Eksisterende prod-data: alle rækker = standard_25 (prod 2026-10-15: 15/15 tilbud og 5/5 fakturaer er 25 %).
-- Adfærd (kode): 25 %-flowet uændret. zero/reverse_charge er BLOKERET for automatisk fakturering, indtil fakturatekst og
--   e-conomic-mapping er godkendt (lib/invoices/vat-guard.ts).
-- RLS: kolonner på eksisterende tabeller → eksisterende politikker gælder. vat_number er ikke kost.
-- Pre/post: npx tsx scripts/prod-check-00231.ts (kolonner + fordeling; checksum på beløb uændret)
-- Rollback:
--   ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_vat_mode_rate_check, DROP COLUMN IF EXISTS vat_rate, DROP COLUMN IF EXISTS vat_mode;
--   ALTER TABLE public.offers DROP COLUMN IF EXISTS vat_mode;
--   ALTER TABLE public.customers DROP COLUMN IF EXISTS vat_number, DROP COLUMN IF EXISTS vat_mode;
-- =====================================================

BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'standard_25';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS vat_mode text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'standard_25';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 25;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_vat_mode_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_vat_mode_check CHECK (vat_mode IN ('standard_25', 'zero', 'reverse_charge'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_vat_mode_check') THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_vat_mode_check CHECK (vat_mode IS NULL OR vat_mode IN ('standard_25', 'zero', 'reverse_charge'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_vat_mode_rate_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_vat_mode_rate_check CHECK (
      (vat_mode = 'standard_25' AND vat_rate = 25) OR (vat_mode IN ('zero', 'reverse_charge') AND vat_rate = 0)
    );
  END IF;
END $$;

-- Eksisterende tilbud: eksplicit standard_25 (alle er 25 % i prod); tilbud med anden sats sættes IKKE (forbliver NULL =
-- tvetydig → blokeret af værnet, som i dag)
UPDATE public.offers SET vat_mode = 'standard_25' WHERE vat_mode IS NULL AND coalesce(tax_percentage, 25) = 25;

NOTIFY pgrst, 'reload schema';

COMMIT;
