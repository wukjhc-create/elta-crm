# Forslag 00252–00256: migrationer fra review-bølge NEXT-44 (timer, leads, team/rapporter)

**Status:** BLOCKED_APPROVAL. Ingen af dem er kørt — hverken på staging eller prod. Hver migration kræver sin egen
godkendelse (nummer, formål, risiko, pre-/post-tjek). Rækkefølge efter vores regel: kompatibel kode er allerede pushet
→ migration → post-tjek.

**Kilde:** review-bølge 2026-10-18 formiddag (`docs/AUTONOMOUS_BACKLOG.md`, NEXT-44).
**Grundlag:** definitionerne er læst fra repoet (00108, 00142, 00173, 00214). Bekræft dem read-only mod prod med
`scripts/prod-fn-def.ts` / `prod-db-audit` før kørsel.

---

## 00252 — `user_role()` giver ingen rolle til deaktiverede brugere (RX-1, S2)

**Fund:** `user_role()` (00108) tjekker ikke `profiles.is_active`.
- En deaktiveret admin/bogholder beholder RLS-rettigheder, indtil deres access-token udløber (~1 time). Det gælder bl.a.
  de 17 kost-/avancetabeller og `audit_logs`.
- En manglende profil bliver til `'montør'` i databasen, mens appen fejler sikkert til "ingen adgang".

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.user_role(p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- RX-1: kun aktive profiler har en rolle; manglende profil = ingen rolle (før 'montør')
  SELECT role FROM profiles WHERE id = p_user_id AND is_active = true;
$$;
-- Politikker kalder funktionen som authenticated → EXECUTE skal blive hos authenticated (uændret ACL)
COMMIT;
```

**Risiko:** middel.
- Alle `user_role() IN (...)`-politikker bliver falske (NULL) for deaktiverede brugere. Det er tilsigtet.
- Politikker der sammenligner `profiles.role` direkte (fx `audit_logs`) er ikke dækket. De skal gennemgås separat.
- Kode der antager `'montør'` som standard, skal tjekkes: `grep "user_role()"` i migrations og kode.

**Pre-tjek:**
- `prod-fn-def user_role` viser 00108-kroppen.
- Antal profiler med `is_active = false`.
- Antal `auth.users` uden profil (bør være 0).

**Post-tjek:**
- `prod-fn-acl user_role`: authenticated EXECUTE uændret.
- Persona-probe: en deaktiveret testbruger med gyldigt token læser 0 rækker fra en kosttabel.
- `check:rls-matrix` er grøn.

**Rollback:** genskab 00108-kroppen.

---

## 00253 — `time_logs`: genberegning ved ændret starttid + ingen overlappende registreringer (TT-1, TT-5)

**Fund:**
- **TT-1:** sats-triggeren lytter ikke på `start_time`. Det er rettet i koden: en ændret starttid tager `end_time` med i
  SET-listen. Migrationen gør det robust for alle skrivere.
- **TT-5:** overlap-tjekket er læs-så-skriv. To samtidige registreringer for samme medarbejder kan overlappe, og der er
  ingen constraint.

```sql
BEGIN;
-- TT-1: triggeren fyrer også ved start_time (samme funktion som 00142/00230)
DROP TRIGGER IF EXISTS trg_time_logs_cost_amount ON public.time_logs;
CREATE TRIGGER trg_time_logs_cost_amount
  BEFORE INSERT OR UPDATE OF start_time, end_time, employee_id, pay_rate_type, employee_rate_id
  ON public.time_logs FOR EACH ROW EXECUTE FUNCTION time_logs_set_cost_amount();

-- TT-5: ingen overlap pr. medarbejder (afviste rækker undtaget; kørende timere = åben periode)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.time_logs
  ADD CONSTRAINT time_logs_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(start_time, COALESCE(end_time, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (approval_status <> 'rejected');
COMMIT;
```

**Risiko:** middel.
- Constraint'en fejler, hvis prod allerede har overlap. Pre-tjekket skal give 0.
- Koden skal mappe fejlkode 23P01 til den eksisterende overlap-besked. Den ændring laves før migrationen.
- `btree_gist` skal være tilladt i Supabase (det er det normalt).

**Pre-tjek (read-only):**
```sql
SELECT count(*) FROM time_logs a JOIN time_logs b
  ON a.employee_id = b.employee_id AND a.id < b.id
 AND a.approval_status <> 'rejected' AND b.approval_status <> 'rejected'
 AND tstzrange(a.start_time, COALESCE(a.end_time,'infinity'),'[)') && tstzrange(b.start_time, COALESCE(b.end_time,'infinity'),'[)');
```

**Post-tjek:**
- `rate-engine-check` (R6 skal stadig være grøn; efter migrationen genberegner kun start_time også).
- En dobbelt-insert-probe giver 23P01.

**Rollback:** genskab triggeren uden `start_time`, og `ALTER TABLE ... DROP CONSTRAINT time_logs_no_overlap`.

---

## 00254 — `leads`/`lead_activities`: skriveret som appen (LD-2, S2) — kræver også en BESLUTNING

**Fund (00173):**
- Montør kan INSERT/UPDATE alle leads i databasen, selvom appen ikke giver montør `leads.create`/`leads.edit`.
- `lead_activities` kan indsættes i en anden brugers navn, fordi der ikke er noget `performed_by = auth.uid()`-krav.
- Koden (LD-1) validerer nu vedhæftningsstier. Politikken er værn nr. 2.

```sql
BEGIN;
DROP POLICY IF EXISTS leads_insert_role ON public.leads;
DROP POLICY IF EXISTS leads_update_role ON public.leads;
CREATE POLICY leads_insert_role ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND created_by = auth.uid());
CREATE POLICY leads_update_role ON public.leads FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg'))
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

DROP POLICY IF EXISTS lead_activities_insert_role ON public.lead_activities;
CREATE POLICY lead_activities_insert_role ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND performed_by = auth.uid());
COMMIT;
```

**Beslutning for Henrik:**
- Skal salg kunne opdatere ALLE leads, eller kun egne/tildelte? Forslaget bevarer i dag "alle".
- Bekræft at montør ikke skal oprette leads (fx fra telefonen). Appen giver det ikke i dag.

**Risiko:** lav-middel.
- Server-kode der indsætter `lead_activities` med en anden `performed_by` end den indloggede, fejler. Pre-tjek: grep
  efter `lead_activities` inserts; system-skrivninger skal bruge admin-klienten.

**Pre-tjek:**
- Antal leads oprettet/ændret af montører de sidste 90 dage (aggregat).
- Grep efter `from('lead_activities').insert`.

**Post-tjek:**
- `check:rls-matrix` er grøn.
- Persona-probe: montør får 403 ved PATCH af et lead; salg kan stadig redigere.

**Rollback:** genskab 00173-politikkerne.

---

## 00255 — `time_logs`: salgsbeløb ikke læsbart for montør via REST (TT-6, rest)

**Fund:**
- Koden fjerner nu salg fra opret/ret-svar (TT-6, kode).
- `sale_amount`/`sale_rate_snapshot` er stadig kolonne-læsbare for authenticated. En montør kan derfor læse kollegaers
  satser på tildelte arbejdsordrer direkte over REST.

**Forslag:**
- `REVOKE SELECT (sale_amount, sale_rate_snapshot) ON time_logs FROM authenticated`.
- Salg læses med admin-klienten bag `invoices.view.own_cases`, som kost i 00192/00201.

**Forudsætning (kode før migration):** alle læsere af de to kolonner med bruger-klienten flyttes til admin-klienten:
- `TIME_LOG_PUBLIC_COLUMNS`
- fakturakladde og slutfaktura (læser allerede med admin-klienten)
- dashboard-cockpittet
- sagsøkonomi

Det er ikke lavet endnu, så migrationen er ikke klar.

**Risiko:** middel (bred kodeflade). Først når koden er flyttet og testet på staging.

---

## 00256 — `v_customer_payment_summary`: kun DKK (RX-5) — eller BESLUTNING om at kun DKK faktureres

**Fund:**
- Viewet (00214) summerer `final_amount`/`open_amount` på tværs af valutaer.
- Betalings-CSV'en og den ugentlige mail viser "(DKK)".

**Forslag:**
- Tilføj `AND COALESCE(upper(i.currency),'DKK') = 'DKK'` i viewets fakturafilter.
- Eller tilføj en valuta-dimension og mærk kolonnerne efter den.

**Beslutning:** fakturerer Elta nogensinde i anden valuta end DKK?
- Hvis nej: en simpel DKK-filtrering (eller en CHECK-constraint på `invoices.currency`) er nok.

**Risiko:** lav.
- **Pre-tjek:** `SELECT currency, count(*) FROM invoices GROUP BY 1`.
- **Post-tjek:** viewets totaler er uændrede, hvis alt er DKK.

---

## Ikke migrationer, men åbne beslutninger fra samme bølge

- **TT-2:** SQL-funktionen der fakturerer en arbejdsordre (00202) bruger live-sats og skjult fallback. Vælg mellem:
  - slå automatik-handlingen `create-invoice-from-work-order` fra (anbefalet indtil videre); eller
  - en ny funktion, der summerer frosne `sale_amount` og kræver `approval_status = 'approved'` (en større migration;
    skrives som eget forslag).
- **TT-3:** standard-overtidssatser seedes som faste beløb. Skal kun multiplikatoren seedes?
- **TT-9:** må en ventende/afvist række genprisses ved "Gem"?
- **LD-4:** standardtildeling af nye leads, og om "Kun mine" også skal matche oprettet af.
- **LD-8:** skal hjemmesideformularen oprette en kunde ved hver indsendelse, eller først ved konvertering?
- **LD-9:** skal en ny webhenvendelse fra en eksisterende kunde blive et lead?
- **LD-12:** må et lead oprettes direkte som vundet/tabt?
- **RX-2:** hvem må masseeksportere? (= NEXT-26 RP-6)
