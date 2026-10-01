-- 00183 — N4: hurtig produktsøgning (tilbudslinjer, materialer) med trigram-indeks
--
-- Fund (prod read-only 2026-10-01, 323.860 varer): searchSupplierProducts bruger ILIKE '%term%' på supplier_sku,
-- supplier_name og ean. Kun B-tree-indeks findes → søgninger UDEN træf scanner hele tabellen:
--   'kabel' 472 ms · 'stikkontakt' 343 ms · '5701234' (EAN-del) 6.816 ms · 'zzqxw' 2.942 ms · 'NYM-J 3x1,5' 2.116 ms
-- En sælger der taster et varenr./EAN der ikke findes, venter flere sekunder pr. tastetryk.
--
-- Nu: pg_trgm + GIN-trigramindeks på de tre søgte kolonner (understøtter ILIKE '%x%' for termer >= 3 tegn).
-- Ingen kode- eller dataændring. Indeksene bygges i migrationens transaktion: SKRIVNINGER til supplier_products
-- blokeres mens de bygges (læsning virker) → kør i prod uden for natlig leverandør-sync (02:00).
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_supplier_products_sku_trgm, public.idx_supplier_products_name_trgm,
--     public.idx_supplier_products_ean_trgm;
--   (pg_trgm-udvidelsen kan blive stående — bruges ikke af andet)
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_supplier_products_sku_trgm ON public.supplier_products USING gin (supplier_sku extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_supplier_products_name_trgm ON public.supplier_products USING gin (supplier_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_supplier_products_ean_trgm ON public.supplier_products USING gin (ean extensions.gin_trgm_ops);

ANALYZE public.supplier_products;

COMMIT;
