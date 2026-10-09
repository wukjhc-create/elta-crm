-- 00210 — Blank gemte, langlivede signerede download-links (dataændring; Henrik 2026-10-09: "STORED DOWNLOAD URLS GODKENDT").
--
-- Baggrund (storage-review 2026-10-08): customer_documents.file_url indeholdt signerede links med op til 1 års levetid.
-- Tabellen er læsbar for alle indloggede (USING true), og et signeret link virker til udløb uanset storage-RLS (00209).
-- Alle læsere signerer allerede friskt fra storage_path (getCustomerDocuments, getDocumentsForCase, getPortalDocuments,
-- getPortalFuldmagter, partner-download); outbound-attachments henter indhold via storage_path.
-- Kun URL-feltet ændres og KUN hvor storage_path findes (så filen fortsat kan signeres). file_url er NOT NULL → ''.
--
-- Pre/post (read-only): scripts/prod-stored-signed-urls.ts — pre 2026-10-09: 11 af 18 rækker, 0 uden storage_path,
-- tjeksum (id/storage_path/file_name/document_type/description) b622c07116563b7b7ac6b5b9acef2b77 → post: 0 signerede,
-- samme tjeksum. service_case_attachments/incoming_emails/roof_drawings: 0 gemte signerede links.
-- Rollback: ikke relevant (links regenereres ved visning; de gamle links var en lækage).

BEGIN;

UPDATE public.customer_documents
   SET file_url = ''
 WHERE file_url LIKE '%/storage/v1/object/sign/%'
   AND coalesce(storage_path, '') <> '';

COMMIT;
