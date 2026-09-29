-- =====================================================================
-- 00167 — suppliers.vat_number (CVR/VAT) til leverandoermatch paa fakturaer (IC10)
--
-- Fund (P3 #19, prod read-only 2026-09-29, scripts/prod-precheck-00167.ts):
--   * Matcheren (incoming-invoice-matcher.ts) slaar CVR op i suppliers.vat_number, men kolonnen FINDES IKKE ->
--     CVR-match har aldrig virket (fejler stille; kun navne-match virker).
--   * prod: 2 leverandoerer, 0 CVR-data; 1 faktura med udtrukket CVR (ikke koblet).
--
-- Design:
--   * Kolonnen er valgfri (NULL = ukendt). Normaliseres ALTID af trigger via public.normalize_vat_number
--     (samme regel som src/lib/invoice-control/vat.ts og parserens udtraek): 8 cifre -> 'DK' + cifre.
--   * CHECK paa format. Opslags-indeks (partielt).
--   * INGEN UNIQUE: forretningsdata understoetter det ikke endnu (0 vaerdier, og samme CVR kan legitimt findes paa
--     flere leverandoer-raekker, fx afdelinger). Matcheren kraever praecis ét hit; flere = 'ambiguous_vat', intet gaet.
--     En unik-constraint kan tilfoejes senere, naar data er udfyldt og `prod-precheck-00167` viser 0 dubletter.
--   * Ingen data-udfyldning (ingen gaet): CVR indtastes af admin i leverandoerformularen.
--   * Grants: authenticated har tabel-grants paa suppliers (ikke kolonne-grants) -> ny kolonne er daekket.
--     Skriverettigheder strammes separat i 00168 (P-008).
--
-- Kode (deployet FOER, expand/contract): formularen sender kun vat_number naar feltet er udfyldt; matcheren
-- normaliserer parserens CVR med samme regel og haandterer manglende kolonne (ingen hit).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_suppliers_normalize_vat ON public.suppliers;
--   DROP FUNCTION IF EXISTS public.suppliers_normalize_vat();
--   ALTER TABLE public.suppliers DROP COLUMN IF EXISTS vat_number;   -- fjerner ogsaa CHECK + indeks
--   DROP FUNCTION IF EXISTS public.normalize_vat_number(text);
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_vat_number(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN s IS NULL OR s = '' THEN NULL
    WHEN s ~ '^[0-9]{8}$' THEN 'DK' || s
    WHEN s ~ '^45[0-9]{8}$' THEN 'DK' || substr(s, 3)
    ELSE s
  END
  FROM (SELECT upper(regexp_replace(raw, '[[:space:].\-/]', '', 'g')) AS s) x
$$;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vat_number TEXT;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_vat_number_format;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_vat_number_format
  CHECK (vat_number IS NULL OR vat_number ~ '^[A-Z]{2}[0-9A-Z]{2,13}$');

CREATE OR REPLACE FUNCTION public.suppliers_normalize_vat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.vat_number := public.normalize_vat_number(NEW.vat_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_normalize_vat ON public.suppliers;
CREATE TRIGGER trg_suppliers_normalize_vat
  BEFORE INSERT OR UPDATE OF vat_number ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_normalize_vat();

CREATE INDEX IF NOT EXISTS idx_suppliers_vat_number ON public.suppliers (vat_number) WHERE vat_number IS NOT NULL;

-- Hjaelpefunktionerne skal ikke kunne kaldes af anon (normalize er harmloes, men holdes lukket som resten).
REVOKE ALL ON FUNCTION public.normalize_vat_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_vat_number(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.suppliers_normalize_vat() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
