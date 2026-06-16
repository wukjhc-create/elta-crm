-- =====================================================
-- Migration: 00149_offers_converted_link.sql
-- Sprint Ø7.0 — Tilbud → sag-konvertering: eksplicit forward-link.
-- Date: 2026-06-16
--
-- Additiv, ikke-destruktiv. service_cases.source_offer_id (sag→tilbud)
-- findes allerede; her tilføjes den modsatte retning på offers, så
-- konverteringsstatus kan vises O(1) i tilbudsoversigt/detalje uden join,
-- og som ekstra dublet-sikring (ud over source_offer_id som sandhedskilde).
--
--   offers.converted_case_id  → service_cases.id (sagen tilbuddet blev til)
--   offers.converted_at       → tidspunkt for konvertering
--
-- Backfill: sæt felterne for tilbud der ALLEREDE har en koblet sag.
--
-- COST-FREE: ingen kost/margin/DB-data.
--
-- Rollback:
--   ALTER TABLE offers DROP COLUMN IF EXISTS converted_case_id;
--   ALTER TABLE offers DROP COLUMN IF EXISTS converted_at;
-- =====================================================

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS converted_case_id UUID REFERENCES service_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

COMMENT ON COLUMN offers.converted_case_id IS
  'Sprint Ø7.0 — sagen dette tilbud blev konverteret til (forward-link; sandhedskilde er service_cases.source_offer_id).';
COMMENT ON COLUMN offers.converted_at IS
  'Sprint Ø7.0 — tidspunkt for konvertering af tilbud til sag.';

-- Backfill eksisterende konverterede tilbud (vælg ældste koblede sag pr. tilbud).
UPDATE offers o
SET converted_case_id = sc.id,
    converted_at = COALESCE(o.converted_at, sc.created_at)
FROM (
  SELECT DISTINCT ON (source_offer_id) source_offer_id, id, created_at
  FROM service_cases
  WHERE source_offer_id IS NOT NULL
  ORDER BY source_offer_id, created_at ASC
) sc
WHERE sc.source_offer_id = o.id
  AND o.converted_case_id IS NULL;
