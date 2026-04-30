-- =====================================================
-- Migration 00073: case_notes
--
-- Stores notes attached to service_cases — including
-- AI-generated summaries from email intelligence.
-- =====================================================

CREATE TABLE IF NOT EXISTS case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',     -- 'note' | 'ai_summary' | 'system'
  urgency TEXT,                          -- 'low' | 'normal' | 'high' | 'urgent' | null
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_kind ON case_notes(kind);
CREATE INDEX IF NOT EXISTS idx_case_notes_created ON case_notes(created_at DESC);

ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_notes_select" ON case_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_notes_insert" ON case_notes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "case_notes_update" ON case_notes
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "case_notes_delete" ON case_notes
  FOR DELETE TO authenticated USING (true);

GRANT ALL ON case_notes TO authenticated;
GRANT ALL ON case_notes TO service_role;
