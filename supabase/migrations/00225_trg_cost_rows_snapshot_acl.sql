-- =====================================================
-- Migration 00225: ACL-rettelse til 00222 — trg_cost_rows_snapshot_profit() kan ikke kaldes af anon/authenticated
--
-- Baggrund: 00222 (godkendt 2026-10-15) skrev `REVOKE ALL ... FROM PUBLIC`, men Supabases default privileges giver
-- anon/authenticated en EKSPLICIT EXECUTE på nye funktioner, så prod-DB-audit'en markerede funktionen HØJ ("anon kan
-- kalde SECURITY DEFINER"). Det er en trigger-funktion (Postgres afviser direkte kald uden for en trigger), så den var
-- ikke reelt udnyttelig — men ACL'en skal matche 00222's hensigt og mønstret fra 00171 (trg_invoice_snapshot_profit).
--
-- Ændring: kun ACL. Triggerne fyrer fortsat (EXECUTE kontrolleres ved CREATE TRIGGER, ikke når triggeren fyrer).
-- Data: ingen.
-- Pre/post: scripts/prod-fn-acl.ts trg_cost_rows_snapshot_profit (anon/authenticated forsvinder) + prod-db-audit (0/0/0)
-- Rollback: ingen grund til at genåbne (GENÅBN IKKE anon uden særskilt vurdering — Henrik 2026-10-15)
-- =====================================================

BEGIN;

REVOKE ALL ON FUNCTION public.trg_cost_rows_snapshot_profit() FROM PUBLIC, anon, authenticated;

COMMIT;
