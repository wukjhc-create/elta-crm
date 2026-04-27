-- =====================================================
-- Migration 00066: Service Cases Smart Fields
-- Adds address, KSR/EAN, checklist, attachments, signature
-- =====================================================

-- 1. Add address fields to service_cases
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS floor_door TEXT; -- etage/side/portkode
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. Add KSR/EAN admin fields
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS ksr_number TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS ean_number TEXT;

-- 3. Add assigned_to field for montør
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 4. Checklist completion tracking (JSONB for flexibility)
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
-- Format: [{ "key": "inverter_photo", "label": "Foto af inverter", "required": true, "completed": false, "completed_at": null }]

-- 5. Digital signature for customer handover
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS customer_signature TEXT; -- base64 data URL
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS customer_signature_name TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- 6. Service case attachments table
CREATE TABLE IF NOT EXISTS service_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size INTEGER,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('inverter_photo', 'panel_photo', 'tavle_photo', 'before_photo', 'after_photo', 'signature', 'other')),
  notes TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sca_service_case_id ON service_case_attachments(service_case_id);
CREATE INDEX IF NOT EXISTS idx_sca_category ON service_case_attachments(category);

-- RLS for attachments
ALTER TABLE service_case_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_case_attachments' AND policyname = 'Auth users manage service case attachments') THEN
    CREATE POLICY "Auth users manage service case attachments"
      ON service_case_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON service_case_attachments TO authenticated;
GRANT ALL ON service_case_attachments TO service_role;

-- 7. Create storage bucket for service case files (if Supabase supports it)
-- This is typically done via dashboard, but we add a note:
-- Bucket: service-case-files (public: false)
