-- =====================================================================
-- 00133: β.2.5 — Privatisér storage-buckets
--        'attachments' + 'service-case-files'
-- =====================================================================
--
-- FORMÅL
--   Sæt public=false på de to buckets, så objekter ikke længere kan
--   tilgås via direkte /object/public/-URL uden authentication. Adgang
--   sker fremover udelukkende via signed URLs, der genereres af app-
--   koden (src/lib/storage/signed-url.ts).
--
-- FORUDSÆTNINGER (allerede deployet)
--   - β.2.2: alle producers gemmer signed URL + storage_path
--   - β.2.3: hoved-consumers lazy-refresher fra storage_path
--   - β.2.4B: getServiceCaseAttachments + getDocumentsForCase lazy-refresher
--   - β.2.4A audit: 0 reelt døde rows (alle legacy public-URLs har storage_path)
--
-- SCOPE (bevidst minimal)
--   - KUN bucket public-flag for de to navngivne buckets.
--   - INGEN data-vask (file_url/pdf_public_url-rows røres ikke).
--   - INGEN refactor, INGEN andre schema-ændringer.
--   - INGEN policy-ændringer — RLS-policies fra 00113/00132 er uændrede.
--
-- ROLLBACK (kør denne hvis noget brækker)
--   UPDATE storage.buckets SET public = true WHERE name IN ('attachments', 'service-case-files');
--
-- VERIFIKATION (efter kørsel)
--   SELECT name, public FROM storage.buckets
--   WHERE name IN ('attachments', 'service-case-files');
--   -> begge skal vise public = false
-- =====================================================================

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE name IN ('attachments', 'service-case-files');

COMMIT;
