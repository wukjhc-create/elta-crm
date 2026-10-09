-- 00209 — Storage: ingen direkte fil-adgang for indloggede brugere (S1, storage-review 2026-10-08).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- Fund (prod read-only, scripts/prod-storage-policies.ts): politikkerne på storage.objects tjekker KUN bucket_id →
-- enhver indlogget bruger (montør, salg, bogholderi) kan via storage-API'et med egen session liste, hente og OVERSKRIVE
-- alle filer i 'attachments' (prod: 122 mailvedhæftninger, 20 kundedokumenter inkl. underskrevne fuldmagter med CPR,
-- 7 tilbuds-PDF'er) og har ALL på 'service-case-files'. Det omgår kost-lockdown (00200/00201), mail-scope (00180/00186)
-- og alle app-gates.
--
-- App-forudsætning (deployet 2026-10-08, commit "storage via service-klient"): al fil-adgang i server-koden går via
-- service-klienten bag action-gaten (besigtigelse, kundedokumenter, tagtegninger, sagsbilag, avatar/logo, portal,
-- fuldmagt, mail-/tilbudstjenester); ingen klient-komponent bruger storage direkte. service_role omgår RLS → efter
-- denne migration virker appen uændret, men direkte REST/storage-adgang med en bruger-session afvises.
--
-- Pre/post: scripts/prod-storage-policies.ts (post: ingen authenticated-politikker på attachments/service-case-files/
-- portal-attachments SELECT/INSERT/UPDATE). Staging-persona: montør storage.from('attachments').list('email-attachments')
-- → tom/afvist; UI-regression på upload-flows (U12/U17/U20/U23/U25/U59/U66/U68/U69/U71/U92/U115/U134/U136/U137).
-- Rollback: genskab politikkerne fra 00113 (attachments_authenticated_select/insert/update), "Auth users manage service
-- case files" og employees_read/upload_portal_attachments.

BEGIN;

DROP POLICY IF EXISTS attachments_authenticated_select ON storage.objects;
DROP POLICY IF EXISTS attachments_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS attachments_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS "Auth users manage service case files" ON storage.objects;
DROP POLICY IF EXISTS employees_read_portal_attachments ON storage.objects;
DROP POLICY IF EXISTS employees_upload_portal_attachments ON storage.objects;
DROP POLICY IF EXISTS employees_delete_portal_attachments ON storage.objects;

COMMIT;
