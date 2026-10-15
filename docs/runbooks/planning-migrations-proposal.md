# Planlægning — migrationsforslag (fokus E, 2026-10-15) — IKKE GODKENDT

Code-only-delen er i prod (dobbeltbooking-varsel, belastning i ugevisning, montør-banner, .ics, mobil-agenda).
Resten kræver skemaændringer. **Hver migration kræver sin egen godkendelse** (nr., formål, risiko, pre/post).
Prod-tjek 2026-10-15: `work_orders.start_time/end_time/estimated_hours` og `employees.weekly_hours` findes ikke; ingen fraværstabel.

## Forslag A — 00227: tidspunkt og varighed på arbejdsordrer
**Formål:** dagsrækkefølge for montøren, "08:00–12:00" i kalenderen, ægte overlap-tjek i stedet for kun "N job samme dag".
```sql
ALTER TABLE public.work_orders
  ADD COLUMN start_time time,              -- lokal tid (Europe/Copenhagen) på scheduled_date
  ADD COLUMN estimated_hours numeric(5,2) CHECK (estimated_hours IS NULL OR (estimated_hours > 0 AND estimated_hours <= 24));
```
**Risiko:** lav — nullable kolonner, ingen data ændres, eksisterende RLS dækker (kolonner på eksisterende tabel).
**Pre/post:** kolonnerne findes ikke / findes; rækketal + checksum på work_orders uændret.
**Kode bagefter:** felter i planlægningsdialogerne, sortering pr. dag, overlap-varsel, ICS med klokkeslæt.

## Forslag B — 00228: fravær (ferie/sygdom/kursus)
**Formål:** advare (eller blokere) når en fraværende montør planlægges; vise fravær i kalenderen.
```sql
CREATE TABLE public.employee_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ferie','syg','kursus','afspadsering','andet')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_absences_emp_dates ON public.employee_absences (employee_id, start_date, end_date);
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
-- læs: planlæggere ser alle; montør ser egne (via employees.profile_id)
CREATE POLICY employee_absences_select ON public.employee_absences FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin','serviceleder','bogholderi')
         OR employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));
-- skriv: kun admin/serviceleder
CREATE POLICY employee_absences_write ON public.employee_absences FOR ALL TO authenticated
  USING (public.user_role() IN ('admin','serviceleder'))
  WITH CHECK (public.user_role() IN ('admin','serviceleder'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_absences TO authenticated;
REVOKE ALL ON public.employee_absences FROM anon;
```
**Risiko:** lav — ny tabel, ingen eksisterende data berøres. Sygdomsårsag er persondata → kun `kind`, fritekst-note valgfri.
**Pre/post:** tabel findes ikke / findes; RLS-matrix (salg/montør/bogholderi/serviceleder/admin) på staging; anon 42501.
**Beslutning til Henrik:** varsel (anbefalet) eller blokering ved planlægning på fraværsdag? Må bogholderi se fravær?
Helligdage: beregnes i kode (påske-baserede + faste) — ingen tabel nødvendig.

## Forslag C — 00229: ugentlige normtimer pr. medarbejder
**Formål:** kapacitet "hvem har plads næste uge" (planlagte timer mod normtimer — giver først mening med Forslag A).
```sql
ALTER TABLE public.employees
  ADD COLUMN weekly_hours numeric(4,1) CHECK (weekly_hours IS NULL OR (weekly_hours >= 0 AND weekly_hours <= 60));
```
**Risiko:** lav — nullable; standard 37 i kode hvis tom. Kolonnen er ikke kost/løn.
**Pre/post:** kolonnen findes ikke / findes; employees-checksum uændret.

## Anbefalet rækkefølge
A → B → C. Alle tre udarbejdes som migrationsfiler + staging-test først efter godkendelse af den enkelte.
