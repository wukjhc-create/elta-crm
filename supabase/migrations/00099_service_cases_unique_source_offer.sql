-- =====================================================
-- Migration 00099: Idempotency guard for service_cases ↔ offers link
--
-- Adds a UNIQUE PARTIAL INDEX on service_cases(source_offer_id) so that
-- the database itself rejects a second sag from being created for the
-- same offer. This complements the application-level SELECT-then-INSERT
-- guard in src/lib/actions/offer-to-case.ts (Sprint 3B), which is open
-- to a race when multiple accept paths fire near-simultaneously.
--
-- Pre-flight check (Sprint 3D commit 1, scripts/inspect-source-offer-id-dupes.mjs):
--   - 3 service_cases total
--   - 1 has source_offer_id set
--   - 0 duplicates
--   → safe to apply.
--
-- Additive only. Does NOT drop the existing non-unique index from
-- migration 00098 (idx_service_cases_source_offer) — that's still
-- valid and will continue to serve plain lookups. Postgres can
-- use either index for SELECT, and the new one adds the uniqueness
-- guarantee.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_cases_source_offer_id
  ON service_cases(source_offer_id)
  WHERE source_offer_id IS NOT NULL;
