-- Migration: Roof Drawings
-- Description: Målfast solpanel-tegneflade til besigtigelser. Hver række er én
--              tagflade: et uploadet billede + målestok + placerede paneler.
--              Geometri gemmes i JSONB (drawing_data); kun title/panel_count
--              er denormaliseret til hurtig listevisning og summering pr. sag.
-- Date: 2026-06-25
--
-- Keyed til customer_id (påkrævet) + service_case_id (nullable), så tegninger
-- lever uafhængigt af besigtigelses-PDF'en men kobles til sagen når der er én.

CREATE TABLE roof_drawings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_case_id    UUID REFERENCES service_cases(id) ON DELETE SET NULL,
  title              TEXT NOT NULL DEFAULT 'Tagflade',
  image_storage_path TEXT NOT NULL,            -- sti i bucket 'service-case-files'
  image_width        INTEGER NOT NULL,         -- naturlige px (til SVG viewBox)
  image_height       INTEGER NOT NULL,
  panel_product_code TEXT,                     -- valgt panel fra solar_products.code
  panel_count        INTEGER NOT NULL DEFAULT 0,
  -- {
  --   referenceLine: { x1, y1, x2, y2, realLengthMeters } | null,
  --   mmPerPx: number | null,
  --   panelWidthMm: number, panelHeightMm: number,
  --   panels: [{ id, x, y, rotation: 0|90 }]   -- x/y i naturlige billed-px
  -- }
  drawing_data       JSONB NOT NULL DEFAULT '{}',
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roof_drawings_service_case ON roof_drawings(service_case_id);
CREATE INDEX idx_roof_drawings_customer ON roof_drawings(customer_id);

CREATE TRIGGER update_roof_drawings_updated_at
  BEFORE UPDATE ON roof_drawings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Samme mønster som customer_documents: kun authenticated medarbejdere.
-- Ingen anon/portal-adgang i v1.

ALTER TABLE roof_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage roof drawings"
  ON roof_drawings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON roof_drawings TO authenticated;

COMMENT ON TABLE roof_drawings IS 'Målfaste tagtegninger med solpanel-layout pr. besigtigelse/sag';
COMMENT ON COLUMN roof_drawings.drawing_data IS 'Geometri (referencelinje, mmPerPx, panelmål, panel-placeringer) som JSONB';
COMMENT ON COLUMN roof_drawings.panel_count IS 'Denormaliseret antal paneler til hurtig summering pr. sag';
