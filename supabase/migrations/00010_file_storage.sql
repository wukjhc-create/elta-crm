-- Migration: File Storage System
-- Description: Creates files table and storage bucket for file attachments

-- Create entity type enum
CREATE TYPE entity_type AS ENUM ('lead', 'customer', 'offer', 'project', 'message', 'portal');

-- Files table to track uploaded files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'attachments',
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT positive_file_size CHECK (size > 0)
);

-- Indexes for fast queries
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_created_at ON files(created_at DESC);

-- Enable RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for files
-- Authenticated users can view files for entities they have access to
CREATE POLICY "Authenticated users can view files"
  ON files FOR SELECT
  TO authenticated
  USING (true);  -- Access control is handled at the entity level

-- Authenticated users can upload files
CREATE POLICY "Authenticated users can upload files"
  ON files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

-- Users can delete their own uploaded files
CREATE POLICY "Users can delete own files"
  ON files FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

-- Admins can delete any file
CREATE POLICY "Admins can delete any file"
  ON files FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON files TO authenticated;

-- Create storage bucket for attachments (run this in Supabase dashboard or via API)
-- Note: Storage buckets are typically created via Supabase dashboard or Storage API
-- The following is a reference for manual setup:

/*
Storage Bucket Configuration:
- Bucket name: attachments
- Public: false (use signed URLs for access)
- File size limit: 10MB (10485760 bytes)
- Allowed MIME types:
  - application/pdf
  - application/msword
  - application/vnd.openxmlformats-officedocument.wordprocessingml.document
  - application/vnd.ms-excel
  - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  - image/jpeg
  - image/png

Storage Policies (create in Supabase dashboard):

1. SELECT policy (allow authenticated users to read):
   CREATE POLICY "Authenticated users can read files"
   ON storage.objects FOR SELECT
   TO authenticated
   USING (bucket_id = 'attachments');

2. INSERT policy (allow authenticated users to upload):
   CREATE POLICY "Authenticated users can upload files"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'attachments');

3. DELETE policy (allow file owners to delete):
   CREATE POLICY "Users can delete own files"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
*/

-- Comment for documentation
COMMENT ON TABLE files IS 'Tracks all uploaded files and their associations to various entities';
COMMENT ON COLUMN files.entity_type IS 'Type of entity this file is attached to';
COMMENT ON COLUMN files.entity_id IS 'ID of the entity this file is attached to';
COMMENT ON COLUMN files.path IS 'Full path in Supabase Storage';
COMMENT ON COLUMN files.url IS 'Public or signed URL for accessing the file';
