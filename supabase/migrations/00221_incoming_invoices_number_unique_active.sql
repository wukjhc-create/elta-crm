-- =====================================================
-- Migration 00221: leverandørfakturaer — fakturanummer er kun unikt blandt AKTIVE fakturaer (L-10)
--
-- STATUS: UDKAST — BLOCKED_APPROVAL (Henrik). Branch l10-rejected-dup-00221 (kode + migration deployes samlet:
--         migration først, derefter merge/push af koden).
--
-- Baggrund (leverandørfaktura-review 2026-10-14, L-10): uq_incoming_invoices_supplier_number (00094) gælder også
-- afviste/annullerede fakturaer. Når en leverandør gensender en RETTET faktura med samme nummer som en faktura, vi har
-- afvist, finder matcheren den afviste og annullerer den nye som "dublet" — den rigtige faktura forsvinder.
--
-- Ændring: indekset udelader status 'rejected' og 'cancelled'. Koden (incoming-invoice-matcher.ts) behandler et
-- nummer-hit på en afvist faktura som "samme nr. som afvist" → manuel kontrol i stedet for annullering. Et hit på en
-- aktiv faktura (modtaget/afventer/godkendt/bogført) er fortsat en dublet. Samme fil (file_hash) er fortsat en dublet.
--
-- Data: ingen rækker ændres. Det nye indeks er en delmængde af det gamle → kan ikke fejle på eksisterende data.
-- Afvist/annulleret er sluttilstande (ingen kode flytter en faktura ud af dem).
--
-- Pre (prod read-only): antal fakturaer pr. status + antal (leverandør, nr.)-par der deles af afvist og anden række
-- Post: indeksdefinitionen indeholder "status <> ALL ('{rejected,cancelled}')"; samme rækkeantal/checksum
-- Rollback: DROP INDEX uq_incoming_invoices_supplier_number; genskab 00094-definitionen (lykkes kun hvis der ikke
--           findes to rækker med samme nr., hvoraf én er afvist)
-- =====================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_incoming_invoices_supplier_number;

CREATE UNIQUE INDEX uq_incoming_invoices_supplier_number
  ON public.incoming_invoices (supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL
    AND invoice_number IS NOT NULL
    AND status NOT IN ('rejected', 'cancelled');

COMMENT ON INDEX public.uq_incoming_invoices_supplier_number IS
  'L-10 (00221): leverandør + fakturanummer unikt blandt aktive fakturaer; afviste/annullerede optager ikke nummeret';

COMMIT;
