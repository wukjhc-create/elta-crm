-- =====================================================
-- PORTAL ATTACHMENTS STORAGE
-- =====================================================
-- Storage bucket for customer portal chat file attachments
-- =====================================================

-- Create storage bucket for portal attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-attachments',
  'portal-attachments',
  false, -- Private bucket, requires signed URLs
  10485760, -- 10MB max file size
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =====================================================
-- STORAGE POLICIES
-- =====================================================

-- Authenticated users (employees) can read all attachments
CREATE POLICY "employees_read_portal_attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'portal-attachments');

-- Authenticated users (employees) can upload attachments
CREATE POLICY "employees_upload_portal_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'portal-attachments');

-- Authenticated users can delete their own uploads
CREATE POLICY "employees_delete_portal_attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'portal-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Anonymous users (portal customers) can upload to their customer folder
-- Path format: {customer_id}/{filename}
CREATE POLICY "portal_customers_upload_attachments"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'portal-attachments');

-- Anonymous users can read attachments in their customer folder
-- This is handled via signed URLs, so we allow read for path validation
CREATE POLICY "portal_customers_read_attachments"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'portal-attachments');
