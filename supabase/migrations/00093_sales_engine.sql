-- =====================================================
-- Migration 00093: Sales engine — packages + options + text blocks (Phase 12)
--
-- Extends offer_packages with the fields needed for one-click solar
-- offer creation, plus a package_options table for tickable add-ons
-- and a sales_text_blocks table for editable intro/closing copy.
-- =====================================================

-- ---------- 1. offer_packages additions ----------

ALTER TABLE offer_packages
  ADD COLUMN IF NOT EXISTS base_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_text    TEXT,
  ADD COLUMN IF NOT EXISTS short_summary    TEXT,
  ADD COLUMN IF NOT EXISTS sort_order       INTEGER NOT NULL DEFAULT 0;

-- description + is_active already exist (00078).

CREATE INDEX IF NOT EXISTS idx_offer_packages_active_sort
  ON offer_packages(is_active, sort_order)
  WHERE is_active = true;

-- ---------- 2. package_options ----------

CREATE TABLE IF NOT EXISTS package_options (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id            UUID NOT NULL REFERENCES offer_packages(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  /** Per-line description appended to the offer text when picked. */
  offer_text            TEXT,
  price                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  /** When true, picking this option triggers the package's material
      auto-fill again (used for options that change BOM, e.g. battery). */
  affects_materials     BOOLEAN NOT NULL DEFAULT false,
  /** Optional explicit material list this option contributes. */
  material_id           UUID REFERENCES materials(id) ON DELETE SET NULL,
  quantity_multiplier   NUMERIC NOT NULL DEFAULT 1,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_options_package
  ON package_options(package_id, sort_order)
  WHERE is_active = true;

-- ---------- 3. sales_text_blocks ----------
-- Editable text snippets used by the offer builder. Slugs the engine
-- looks up: 'offer_intro_default', 'offer_closing_default'.
-- Operators may add per-jobType variants later.

CREATE TABLE IF NOT EXISTS sales_text_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the two default blocks the text builder reads.
INSERT INTO sales_text_blocks (slug, name, content) VALUES
  ('offer_intro_default',
   'Standard introduktion',
   'Tak fordi du har valgt at indhente tilbud hos Elta Solar. Nedenfor finder du vores forslag tilpasset dine behov. Tilbuddet er gældende i 14 dage.'),
  ('offer_closing_default',
   'Standard afslutning',
   'Vi står klar til at gennemføre opgaven så snart tilbuddet er accepteret. Har du spørgsmål, er du altid velkommen til at kontakte os på kontakt@eltasolar.dk eller +45 70 70 70 70.')
ON CONFLICT (slug) DO NOTHING;

-- ---------- RLS + grants ----------

ALTER TABLE package_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_text_blocks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_options_all_auth"   ON package_options;
DROP POLICY IF EXISTS "sales_text_blocks_all_auth" ON sales_text_blocks;

CREATE POLICY "package_options_all_auth"   ON package_options
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_text_blocks_all_auth" ON sales_text_blocks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON package_options    TO authenticated, service_role;
GRANT ALL ON sales_text_blocks  TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_package_options_updated_at ON package_options;
CREATE TRIGGER trg_package_options_updated_at BEFORE UPDATE ON package_options
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_text_blocks_updated_at ON sales_text_blocks;
CREATE TRIGGER trg_sales_text_blocks_updated_at BEFORE UPDATE ON sales_text_blocks
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
