-- =====================================================================
-- 00165 — price_history.change_source: tillad FTP-kilderne (datafejl fundet i P3 #17)
--
-- Fund: CHECK tillader kun ('import','manual','api_sync','email_detection'), men FTP-stierne skriver 'ftp_sync'
-- (lemu-sync cron, supplier-sync cron, lemu-sync action) og 'ftp_manual' (admin ftp-import). Indsaetningen fejler
-- og logges kun -> prisaendringer fra den ugentlige LM-FTP-import registreres ALDRIG (prod: price_history er tom
-- trods 322.517 LM-produkter synkroniseret ugentligt).
-- Kun constraint aendres; ingen data. Ingen adfaerdsaendring udover at historikken nu gemmes.
--
-- Rollback (kun hvis ingen raekker med de nye vaerdier findes):
--   ALTER TABLE public.price_history DROP CONSTRAINT price_history_change_source_check;
--   ALTER TABLE public.price_history ADD CONSTRAINT price_history_change_source_check
--     CHECK (change_source = ANY (ARRAY['import','manual','api_sync','email_detection']));
-- =====================================================================

BEGIN;

ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_change_source_check;
ALTER TABLE public.price_history ADD CONSTRAINT price_history_change_source_check
  CHECK (change_source = ANY (ARRAY['import', 'manual', 'api_sync', 'email_detection', 'ftp_sync', 'ftp_manual']));

COMMIT;
