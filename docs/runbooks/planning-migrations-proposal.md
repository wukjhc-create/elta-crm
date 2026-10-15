# Planlægning — migrationsforslag (fokus E, 2026-10-15) — IKKE GODKENDT

Code-only-delen er i prod (dobbeltbooking-varsel, belastning i ugevisning, montør-banner, .ics, mobil-agenda).
Resten kræver skemaændringer. **Hver migration kræver sin egen godkendelse** (nr., formål, risiko, pre/post).
Prod-tjek 2026-10-15: `work_orders.start_time/end_time/estimated_hours` og `employees.weekly_hours` findes ikke; ingen fraværstabel.

## Beslutningstabel (Henrik 2026-10-15)

| | **00227** tidspunkt/varighed | **00228** fravær | **00229** normtimer |
|---|---|---|---|
| **Schema** | `work_orders` + `start_time time NULL`, `estimated_hours numeric(5,2) NULL` (0–24) | Ny tabel `employee_absences` (medarbejder, type, fra–til, note) + indeks + RLS + GRANT | `employees` + `weekly_hours numeric(4,1) NULL` (0–60) |
| **Data changes** | Ingen — nye kolonner er tomme | Ingen — tom tabel | Ingen — tom kolonne |
| **Eksisterende rækker ændres?** | Nej (work_orders uændret, checksum) | Nej | Nej (employees uændret, checksum) |
| **Business behavior** | Kun når udfyldt: klokkeslæt i kalender/ICS, sortering pr. dag, overlap-varsel. Tomt = som i dag (heldag) | Fravær vises i kalenderen; planlægning på fraværsdag giver varsel (eller blokering — din beslutning) | "Planlagt X / norm Y t" pr. uge i ugevisningen; tom = "normtid ikke sat" |
| **Risiko** | Lav (additivt, nullable) | Lav; persondata (sygdom) → kun type + valgfri note, læs kun planlæggere + egen montør | Lav (additivt) |
| **Staging-tests** | Pre/post kolonner + checksum; UI: opret/omplanlæg med tid, overlap-varsel, ICS med tid; regression U43/U11/U30 | RLS-matrix 5 roller + anon 42501; CRUD som admin/serviceleder, montør ser kun egne, salg intet; varsel i planlægning | Pre/post + checksum; UI ugevisning med/uden norm |
| **Rollback** | `ALTER TABLE work_orders DROP COLUMN start_time, DROP COLUMN estimated_hours` (kun data i de nye kolonner tabes) | `DROP TABLE employee_absences` (fraværsdata tabes) | `ALTER TABLE employees DROP COLUMN weekly_hours` |
| **Afhængigheder** | Ingen | Ingen (varsel bruger samme planlægningsdialoger som E-1) | Giver først fuld værdi med 00227 (planlagte timer kræver `estimated_hours`) |

**Rækkefølge:** 00227 → 00228 → 00229 (00229 efter 00227). Hver kræver særskilt godkendelse.

## Forslag D — 00230: ingen skjult standardpris i tids-triggeren (PR-4b, DB-delen)
Appen blokerer allerede registrering uden timepris (commit 59650486). Triggeren `time_logs_set_cost_amount` (00137) har dog
stadig `COALESCE(hourly_rate, 495)` / `COALESCE(cost_rate, 400)` — en række skrevet uden om appen fryses stille med 495/400.
| | **00230** |
|---|---|
| **Schema** | `CREATE OR REPLACE FUNCTION time_logs_set_cost_amount()`: uden sats → `RAISE EXCEPTION 'Medarbejderen mangler timepris'` (salg); kost: [H] samme regel eller NULL-snapshot? |
| **Data changes** | Ingen — kun nye/ændrede afsluttede rækker; eksisterende frosne snapshots røres ikke |
| **Business behavior** | DB håndhæver det appen gør: ingen tid uden sats |
| **Risiko** | Middel: andre skrivere (SQL-funktioner, scripts) fejler i stedet for at fryse 495 — derfor staging-test af alle skrivestier |
| **Staging-tests** | Insert/update med og uden sats; `create_invoice_from_work_order`; U11/U155/U31/U32 |
| **Rollback** | Genskab funktionen fra 00137 (COALESCE) |
| **ACL** | `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` (trigger-funktion) |

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
**Risiko:** lav — nullable. Tom = "normtid ikke sat" (ingen kapacitetsberegning — ingen gættet standard). Kolonnen er ikke kost/løn.
**Pre/post:** kolonnen findes ikke / findes; employees-checksum uændret.

## Anbefalet rækkefølge
A → B → C. Alle tre udarbejdes som migrationsfiler + staging-test først efter godkendelse af den enkelte.
