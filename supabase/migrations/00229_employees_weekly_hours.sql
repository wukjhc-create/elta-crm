-- =====================================================
-- Migration 00229: ugentlige normtimer pr. medarbejder (kapacitet i planlægningen)
--
-- STATUS: GODKENDT af Henrik 2026-10-15 ("00229 GODKENDT TIL PROD").
--
-- Ændring: én valgfri kolonne. Tom = "Norm ikke sat" — INGEN fallback til 37 timer, intet gæt, ingen backfill.
-- RLS: kolonne på eksisterende tabel → eksisterende politikker gælder. Ikke kost/løn.
-- Pre/post: npx tsx scripts/prod-check-00229.ts (kolonne + employees-checksum uændret)
-- Rollback: ALTER TABLE public.employees DROP COLUMN IF EXISTS weekly_hours;
-- =====================================================

BEGIN;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS weekly_hours numeric(4,1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_weekly_hours_check') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_weekly_hours_check CHECK (weekly_hours IS NULL OR (weekly_hours >= 0 AND weekly_hours <= 60));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
