-- =====================================================
-- 00132: Phase β.1 — portal-attachments anon lockdown + storage.objects
-- anon grants revoke
--
-- Drop'er de to anon-policies paa storage.objects der gav portal-side
-- direkte SELECT + INSERT-adgang til storage:
--
--   1. "portal_customers_upload_attachments" (INSERT, qual=true)
--      — wide-open: anon kunne INSERT'e til ENHVER bucket, ikke kun
--        portal-attachments. Bucket-navnet i policy-navnet var
--        misvisende; check'et findes ikke i qual.
--
--   2. "portal_customers_read_attachments" (SELECT, bucket_id-scoped)
--      — bucket-scoped MEN ikke kunde-scoped. Anon med vilkaarlig sti
--        i portal-attachments kunne downloade andre kunders chat-
--        vedhaeftninger (sti er `${customer_id}/${ts}-${name}`).
--
-- Refactored kode der allerede er deployed FOER denne migration:
--   - portal.ts uploadPortalAttachment  -> createAdminClient + path
--                                          konstrueret server-side ud fra
--                                          session.customer_id
--   - portal.ts getAttachmentUrl        -> createAdminClient + path-praefiks-
--                                          tjek (path.startsWith(customerId+'/'))
--                                          + traversal-tjek (..)
--
-- Vi revoker ogsaa alle anon-grants paa storage.objects (legacy
-- GRANT ALL leftover). Authenticated + service_role grants bevares.
--
-- Authenticated employee-policies uberoert:
--   - employees_upload_portal_attachments
--   - employees_read_portal_attachments
--   - employees_delete_portal_attachments (note: har broken qual, fixes i β.5)
--   - attachments_authenticated_select/insert/update
--   - Auth users manage service case files
--
-- Idempotent. Ingen data-aendring. Ingen bucket-aendring.
-- =====================================================

BEGIN;

-- 1. Drop anon INSERT-policy (qual=true)
DROP POLICY IF EXISTS "portal_customers_upload_attachments" ON storage.objects;

-- 2. Drop anon SELECT-policy (bucket-scoped, ikke customer-scoped)
DROP POLICY IF EXISTS "portal_customers_read_attachments" ON storage.objects;

-- 3. Revoke alle anon-grants paa storage.objects
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON storage.objects FROM anon;

COMMENT ON TABLE storage.objects IS
  'Phase beta.1 (00132): anon-policies + grants fjernet paa storage.objects. Portal-flow (uploadPortalAttachment, getAttachmentUrl) bruger admin-client efter validatePortalToken + eksplicit customer_id-scope i path. Authenticated employee + service_role policies uberoert.';

NOTIFY pgrst, 'reload schema';

COMMIT;
