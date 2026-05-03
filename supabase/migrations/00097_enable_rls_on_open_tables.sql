-- =====================================================
-- Migration 00097: Enable RLS on the 5 unprotected business tables.
--
-- Per PROJECT_REALITY_AUDIT.md (Critical #1), the following tables
-- have rowsecurity=false in production despite already having complete
-- policy sets defined:
--
--   customers   (8 policies, dormant)
--   leads       (4 policies, dormant)
--   offers      (6 policies, dormant)
--   projects    (4 policies, dormant)
--   messages    (4 policies, dormant)
--
-- The policies cover authenticated CRUD AND the anon paths needed for
-- the public portal/view-offer flows. No new policies are needed; this
-- migration simply activates the existing safety layer.
--
-- Audit basis (verified before applying):
--   - All 4 SQL ops covered (SELECT/INSERT/UPDATE/DELETE) for
--     authenticated role on each of the 5 tables.
--   - customers + offers have anon SELECT policies gated by portal
--     token / offer status — needed for /view-offer/[id] and
--     /portal/[token] which are public.
--   - offers has an anon UPDATE policy for status sent→viewed
--     transitions (used by the public offer-view "mark viewed" flow).
--   - No policy uses USING (false) anywhere → cannot lock auth users
--     out.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already on. Safe
-- to re-run.
-- =====================================================

ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages   ENABLE ROW LEVEL SECURITY;
