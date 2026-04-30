-- =====================================================
-- Migration 00076: offer_line_items.material_id
--
-- Adds a structured FK from offer_line_items → materials so usage
-- tracking is a real COUNT(*) instead of an ILIKE on notes.
-- Backfills from notes "Material: <slug>" pattern.
-- =====================================================

ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS material_id UUID
    REFERENCES materials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offer_line_items_material_id
  ON offer_line_items(material_id)
  WHERE material_id IS NOT NULL;

-- Backfill: existing auto-draft rows wrote "Material: <slug>" into notes.
UPDATE offer_line_items oli
   SET material_id = m.id
  FROM materials m
 WHERE oli.material_id IS NULL
   AND m.slug IS NOT NULL
   AND oli.notes ILIKE 'Material: ' || m.slug || '%';
