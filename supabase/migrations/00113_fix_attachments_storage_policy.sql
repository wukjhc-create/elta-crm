-- =====================================================
-- 00113: Fix RLS policies for "attachments" storage bucket
-- Sprint 9G — besigtigelse PDF-upload bugfix
--
-- ROOT CAUSE (verificeret via BESIGTIGELSE_DEBUG_UPLOAD-toast):
--   Upload til "attachments"-bucket fejler med
--   "new row violates row-level security policy" (status 403)
--   paa stier som "customer-documents/{customerId}/...".
--
-- Den eksisterende prod-policy paa storage.objects for bucket_id='attachments'
-- er konfigureret manuelt i Supabase Dashboard (ikke i nogen migration).
-- Sandsynligvis bruger den mønstret fra 00010_file_storage.sql linje 104:
--     auth.uid()::text = (storage.foldername(name))[1]
-- — dvs. kun stier hvor foerste mappe = brugerens UUID tillades.
-- Det blokerer ALLE eksisterende kode-stier:
--   - customer-documents/{customer_id}/...   (besigtigelse, customer docs)
--   - email-attachments/{message_id}/...     (incoming-emails)
--   - fuldmagt/{id}/...                      (fuldmagt)
--
-- FIX:
--   Tilfoej eksplicit-navngivne policies der tillader authenticated brugere
--   at INSERT/SELECT/UPDATE i "attachments"-bucket uden first-folder-restriktion.
--
--   PostgreSQL RLS kombinerer PERMISSIVE policies med logisk OR — saa de nye
--   policies KAN KUN AABNE ADGANG BREDERE. De fjerner ingen eksisterende
--   restriktioner og kan ikke goere noget mere restriktivt.
--
-- SIKKERHED:
--   - Bucket forbliver private (public=false). Filer er ikke offentligt laesbare.
--   - Adgang kraever authenticated session (employees) — anon kan stadig ikke laese.
--   - Klient laeser via signed URLs der genereres af server-side kode.
--   - Andre buckets (fx 'portal-attachments') paavirkes IKKE — vores
--     policies har eksplicit "bucket_id = 'attachments'"-filter.
--   - Eksisterende DELETE-policy beroeres ikke (vi tilfoejer ikke DELETE her).
--
-- IDEMPOTENS:
--   - ON CONFLICT (id) DO NOTHING paa bucket — eksisterende bucket-config bevares.
--   - DROP POLICY IF EXISTS for VORES policy-navne — sikrer migration kan
--     re-koeres uden "policy already exists"-fejl.
--   - Drop'er IKKE policies med andre navne (eksisterende dashboard-policies
--     forbliver intakte, kombineres OR-mæssigt med vores nye).
--
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Sikr at "attachments"-bucket eksisterer
-- =====================================================
-- Hvis bucket allerede findes (forventet i prod), bevares den nuvaerende
-- konfiguration (file_size_limit, allowed_mime_types) via DO NOTHING.
-- Hvis den ikke findes (fx i fresh local env), oprettes den med rimelige
-- defaults der matcher hvad app'en uploader.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false, -- private — adgang via signed URLs
  10485760, -- 10MB pr. fil
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 2. Drop kun VORES tidligere policies (idempotent re-run)
-- =====================================================
-- Drop'er IKKE policies med andre navne. Eksisterende dashboard-policies
-- (formentlig "Authenticated users can read files" / "...upload files" /
-- "Users can delete own files" fra 00010-kommentar) forbliver intakte.
-- De kombineres OR-maessigt med vores nye policies.

DROP POLICY IF EXISTS "attachments_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "attachments_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "attachments_authenticated_update" ON storage.objects;

-- =====================================================
-- 3. CREATE permissive policies for authenticated brugere
-- =====================================================
-- Disse policies aabner adgang for ALLE authenticated brugere paa
-- "attachments"-bucket. I et B2B-internt CRM hvor alle authenticated
-- brugere er medarbejdere er det forretningsmæssigt acceptabelt.

-- SELECT: lader signed-URL-generering og kode-stier laese metadata.
CREATE POLICY "attachments_authenticated_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

-- INSERT: tillader upload til ENHVER sti i "attachments"-bucket. Dette
-- er fix'et for besigtigelse-bug'en. Ingen first-folder-restriktion.
CREATE POLICY "attachments_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- UPDATE: kraeves fordi app-koden bruger `.upload(..., { upsert: true })`
-- som internt kan trigge UPDATE hvis objektet findes i forvejen. Uden
-- denne policy ville upsert-flows for eksisterende filer fejle.
CREATE POLICY "attachments_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments')
WITH CHECK (bucket_id = 'attachments');

-- =====================================================
-- 4. Refresh PostgREST schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
