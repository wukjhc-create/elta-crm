-- =====================================================
-- Migration 00228: medarbejderfravær (ferie/sygdom/kursus …) — planlægning (fokus E)
--
-- STATUS: GODKENDT af Henrik 2026-10-15 ("00228 GODKENDT TIL PROD").
--
-- Regler (Henrik):
--   - planlægning på en fraværsdag = ADVARSEL + eksplicit override (admin/serviceleder, bekræftelse + audit) — ikke blokering
--   - bogholderi må se dato/periode og fraværstype — ALDRIG diagnose, medicinske oplysninger eller følsom fritekst
--   - gem ikke helbredsdetaljer → tabellen har bevidst INGEN fritekst-/note-kolonne (kun type + periode)
-- Adgang:
--   SELECT: admin, serviceleder, bogholderi (alle) · montør/andre: kun egne rækker (employees.profile_id = auth.uid())
--   INSERT/UPDATE/DELETE: admin, serviceleder
-- Data: ny, tom tabel. Ingen eksisterende rækker ændres.
-- Pre/post: npx tsx scripts/prod-check-00228.ts (tabel/politikker/ACL; anon uden adgang)
-- Rollback: DROP TABLE IF EXISTS public.employee_absences;  (fraværsdata tabes)
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_absences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('ferie', 'syg', 'kursus', 'afspadsering', 'andet')),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_absences_period_check CHECK (end_date >= start_date AND end_date - start_date <= 366)
);

CREATE INDEX IF NOT EXISTS idx_employee_absences_emp_dates ON public.employee_absences (employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_employee_absences_dates ON public.employee_absences (start_date, end_date);

ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_absences_select ON public.employee_absences;
CREATE POLICY employee_absences_select ON public.employee_absences FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('admin', 'serviceleder', 'bogholderi')
    OR employee_id IN (SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS employee_absences_insert ON public.employee_absences;
CREATE POLICY employee_absences_insert ON public.employee_absences FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

DROP POLICY IF EXISTS employee_absences_update ON public.employee_absences;
CREATE POLICY employee_absences_update ON public.employee_absences FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder'))
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

DROP POLICY IF EXISTS employee_absences_delete ON public.employee_absences;
CREATE POLICY employee_absences_delete ON public.employee_absences FOR DELETE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder'));

REVOKE ALL ON public.employee_absences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_absences TO authenticated;
GRANT ALL ON public.employee_absences TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
