# Godkendelsespakke: migrationsforslag MP-1 … MP-20 (tidl. udkast 00246/00247, 00252–00265 og FORSLAG) (2026-10-20)

**Status:** intet i dette dokument er kørt i prod eller på staging. Der er **ikke** oprettet eller anvendt nogen
migrationsfil (Henrik 2026-10-20: "Do NOT create or apply any migration yet"). Alt er `BLOCKED_APPROVAL` eller
`BLOCKED_PREREQUISITE`.

**Bestilling (Henrik 2026-10-20):** gruppér kun, hvor det er teknisk atomisk; konsolidér overlappende udkast til ét
kanonisk forslag pr. faktisk skema-/sikkerhedsændring. For hver: formål, skema/funktion, dataændring, roller/sikkerhed,
økonomi/forretningsadfærd, staging-resultat, rollback, rækkefølge/afhængigheder, pre- og post-check.

## Nummerering

- Den rigtige migrationsmappe `supabase/migrations/` slutter ved **`00233_lead_follow_up.sql`** (Glob
  `supabase/migrations/002[3-9]*` → 00230–00233). Numrene 00234–00265 findes **kun** i runbooks/udkast.
- **Der oprettes ingen migrationsfil med nummer 00252+.** Udkastnumre (00241, 00244, 00246, 00247, 00252–00265) er kun
  backlog-/referencenumre, aldrig filnavne.
- Hvert kanonisk forslag har et **reference-ID (MP-1 … MP-20)**. De gamle udkastnumre står som reference.
- **Det rigtige nummer (00234, 00235, …) tildeles fortløbende i godkendelsesrækkefølgen på godkendelsestidspunktet.**
  Planen nedenfor viser de forventede numre, men de er ikke reserveret.
- Når et forslag bliver en rigtig migration, opdateres krydsreferencerne i de runbooks, der nævner udkastnummeret
  (`next44-migrations-proposal.md`, `next45-46-migrations-proposal.md`, `next53-migrations-proposal.md`,
  `migrations-00252-00262-decision-table.md`, `security-2026-10-17-proposal.md`, `docs/AUTONOMOUS_BACKLOG.md`).
- Udkast i 00234–00251-området (fx 00241, 00244) er også kun udkast og må ikke forveksles med de rigtige numre.

## Regler

- **Godkendelse pr. forslag**, eller pr. atomisk gruppe hvor det står eksplicit (rigtigt nummer, formål, risiko, pre/post).
- **Forløb:** CODE → TEST → PUSH → MIGRATION (staging, derefter prod) → POST-CHECK. Undtagelser kræver dokumenteret
  bagudkompatibilitet.
- **Forslag med manglende kodeforudsætning (`BLOCKED_PREREQUISITE`)** følger altid:
  **kodeforudsætning → målrettede tests → staging → migrationsforslag (endelig SQL) → godkendelse → anvendelse.**
- **Anonym adgang genåbnes aldrig som en del af en rollback** (`anon`-grants, `TO public`-politikker, `USING (true)` uden
  `TO authenticated`) uden en separat vurdering. Rollback genskaber kun den tidligere *authenticated*-politik.
- **Prod kan afvige fra filerne** (jf. 00199). Hver pre-check starter med den aktuelle definition read-only via
  `scripts/prod-fn-def.ts`, `prod-fn-acl.ts`, `prod-table-policies.ts` og `prod-db-audit.ts`.
- Pre-/post-check-SQL er **kun SELECT**, køres via de read-only prod-scripts og giver aggregater uden personværdier.
- **Staging:** intet er kørt ("ikke kørt" i `migrations-00252-00262-decision-table.md`, "intet er kørt" i `next53-…`).

---

## 1. Oversigt

| Ref | Tidl. udkast-ID | Titel | Status | Risiko | Afhænger af |
|---|---|---|---|---|---|
| MP-1 | 00252 (RX-1) + 00247 (EM-7) | `user_role()` og `is_admin()` kun for aktive profiler | BLOCKED_APPROVAL | mellem | — |
| MP-2 | 00254 (LD-2 + PM2-2) | `leads`/`lead_activities` rolle-scope **inkl. SELECT** | BLOCKED_APPROVAL | mellem | MP-1; BESLUTNING (salg alle leads) |
| MP-3 | 00253 del a (TT-1) + 00246 (EM-2) | `time_logs`-prissætningstrigger: `start_time`, `IS DISTINCT FROM`, fakturalås | BLOCKED_APPROVAL | mellem | — |
| MP-4 | 00253 del b (TT-5) | `time_logs`: ingen overlappende registreringer (EXCLUDE) | **BLOCKED_PREREQUISITE** | mellem | 23P01-mapping i kode; overlap = 0; BESLUTNING kørende timere; MP-3 |
| MP-5 | 00255 (TT-6) | `time_logs.sale_*` ikke læsbare for authenticated | **BLOCKED_PREREQUISITE** (HOLD) | høj | alle `sale_*`-læsere flyttet |
| MP-6 | 00256 (RX-5) + 00264 (FC-7) | `v_customer_payment_summary`: DKK, 0,50-grænse, betalt netto (ét view) | BLOCKED_APPROVAL | lav | BESLUTNING (kun DKK); endelig view-SQL |
| MP-7 | 00257 (AI-2) | `calculation_feedback` INSERT kun admin/serviceleder | BLOCKED_APPROVAL | lav | — |
| MP-8 | 00258 (AS-3) | `revoke_user_sessions(uuid)` | **BLOCKED_PREREQUISITE** | mellem | MP-1; kode i `login-access.ts`; auth-typer på staging |
| MP-9 | 00259 (DL-1) | `document_confirmations` FK CASCADE → RESTRICT | BLOCKED_APPROVAL | lav | constraint-navn i prod |
| MP-10 | 00260 (DL-3) | `incoming_invoices.supplier_id` SET NULL → RESTRICT | BLOCKED_APPROVAL | lav | constraint-navn i prod |
| MP-11 | 00261 (RC-3) | Intet nyt job/ingen ny tid på lukket sag | BLOCKED_APPROVAL | mellem | script-tjek; P0001-sti testet |
| MP-12 | 00262 (RC-4, valgfri) | Unik mailtråd pr. tilbud | BLOCKED_APPROVAL | lav | dublet-pre-check = 0 |
| MP-13 | 00263 (FC-9/FC-10 = TZ-5) | `allocate_invoice_number`: dansk år + > 9.999 | **BLOCKED_PREREQUISITE** | lav | regex i `bank-payments.ts`; tekstsortering |
| MP-14 | 00265 (FIN2-10) | `create_invoice_from_offer`: forfald i dansk dato | BLOCKED_APPROVAL | lav | — |
| MP-15 | PM3-2 (FORSLAG) | SELECT-politikker på offers/service_cases/customer_tasks/offer_activities/incoming_emails | FORSLAG · BLOCKED_APPROVAL | høj | BESLUTNING + kode + MP-1 |
| MP-16 | PM3-11 fase 2 (FORSLAG) | drop `projects`/`project_tasks`/`time_entries` | FORSLAG · BLOCKED_APPROVAL | høj (irreversibel) | fase 1 deployet; eksport |
| MP-17 | PF3-7 (FORSLAG) | kundelistens tællinger som én RPC | FORSLAG · BLOCKED_APPROVAL | lav | MP-6 (læser viewet) |
| MP-18 | EM-8 DB-del (FORSLAG) | `integration_webhooks.headers` kun admin | FORSLAG · BLOCKED_APPROVAL | lav | udkast 00241 + kode |
| MP-19 | API-4/SEC2-6 (FORSLAG) | grænse pr. IP for kontaktformularen | FORSLAG · BLOCKED_APPROVAL | mellem (GDPR) | BESLUTNING (IP-hash) |
| MP-20 | CA-9 (FORSLAG) | `round_to` ceil vs. ROUND | FORSLAG · BLOCKED_APPROVAL | mellem (priser) | BESLUTNING: én regel |

Alle: ingen migrationsfil · ikke kørt på staging.

### Konsolideringer

- **MP-1 = 00252 + 00247.** Begge rettede samme fund (deaktiveret bruger beholder RLS-rettigheder). 00247 dækkede også
  `is_admin()`. Ét forslag ændrer begge funktioner; begge udkastnumre udgår.
- **MP-3 = 00253 (trigger-delen) + 00246.** Begge ændrer `trg_time_logs_cost_amount`/`time_logs_set_cost_amount()`.
  Kørt hver for sig ville den sidste overskrive den første. EXCLUDE-constraint'en fra 00253 er en selvstændig ændring
  (andet objekt, kan rulles tilbage alene) og er derfor **MP-4**.
- **MP-6 = 00256 + 00264.** Begge omdefinerer `public.v_customer_payment_summary` med `CREATE OR REPLACE VIEW`; den sidste
  ville overskrive den første. Ingen dokumenteret rækkefølgegrund til at holde dem adskilt → én view-definition.
- **Alt andet kan køres og rulles tilbage hver for sig.** Bølgerne i beslutningstabellen er planlægningsbølger, ikke
  atomiske grupper; hvert forslag kræver egen godkendelse.

---

## MP-1 — `user_role()` og `is_admin()` giver ingen rettigheder til deaktiverede/manglende profiler (tidl. 00252 + 00247; RX-1, EM-7, S2)

**Formål:** en deaktiveret bruger med gyldigt access-token (op til ca. 1 t) har i dag fulde RLS-rettigheder, og en
manglende profil giver `'montør'` i DB (appen fejler sikkert til "ingen adgang").

**Skema/funktion**
- `user_role`: prod-kroppen i dag (00108) er `COALESCE((SELECT role FROM profiles WHERE id = p_user_id), 'montør')`.
  Ny krop: `SELECT role FROM profiles WHERE id = p_user_id AND is_active = true`. Stadig `LANGUAGE sql STABLE SECURITY
  DEFINER SET search_path = public`; signatur og ACL uændrede (`GRANT EXECUTE … TO authenticated`).
- `is_admin`: kroppen i dag (00156:146) er `SELECT EXISTS (… WHERE p.id = auth.uid() AND p.role::text = 'admin')`. Ny krop
  tilføjer `AND p.is_active = true`. ACL uændret (00162:80–81: REVOKE FROM PUBLIC, anon; GRANT authenticated, service_role).

**Dataændring:** ingen. · **Roller/sikkerhed:**
- Alle politikker med `user_role() IN (...)` og `is_admin()` bliver NULL/falske for deaktiverede brugere og brugere uden
  profil.
- Politikker, der læser `profiles.role` direkte, er **ikke** dækket (fx `audit_logs`, 00019). Findes med grep før
  godkendelse.
- **`is_active` og NULL (verificeret read-only 2026-10-20):**
  - Prod: `profiles.is_active` = `boolean`, `is_nullable = NO`, default `true`. Fordeling: 3 admin + 2 montør, alle
    `true`, 0 NULL.
  - Staging: `is_nullable = NO`, default `true`; 45 profiler, alle `true` (17 admin, 2 bogholderi, 11 montør, 13 salg,
    2 serviceleder), 0 NULL.
  - Oprindelse: `supabase/migrations/00139_profiles_schema_sync.sql:37`
    `ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`. (00001:15 i filerne er uden `NOT NULL`; da
    `ADD COLUMN IF NOT EXISTS` ikke sætter `NOT NULL` på en eksisterende kolonne, er det den live verifikation, der
    bærer — derfor er pre-checket obligatorisk.)
  - Appen behandler kun `false` som inaktiv: `src/lib/auth/page-guard.ts:34` (`is_active === false`),
    `src/lib/actions/action-helpers.ts:74` (`is_active !== false`), `src/lib/auth/role-guard.ts:25`.
  - Scripts: `scripts/prod-profiles-is-active.ts` og `npx tsx scripts/test-harness/cli.ts profiles-is-active`.
  - **Anbefalet semantik:** NULL kan ikke forekomme (NOT NULL i begge miljøer). Under den constraint er `is_active =
    true` ækvivalent med appens `!== false`. **Ingen COALESCE.** Pre-check skal bekræfte `is_nullable = 'NO'` og 0 NULL;
    ellers stop og ny vurdering.

**Økonomi/forretningsadfærd:** deaktivering virker straks i DB, ikke først efter tokenudløb. De 17 kost-/avancetabeller
(00200/00201) lukker straks for en fratrådt admin/bogholder.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `CREATE OR REPLACE` med 00108-kroppen (COALESCE … 'montør') og 00156-kroppen for `is_admin()`. ACL røres
ikke. Ingen anon-effekt.

**Rækkefølge/afhængigheder:** først i sikkerhedsbølgen; MP-2, MP-8 og MP-15 bygger på den. Grep først i kode og
migrationer efter antagelser om `'montør'` som standard. Forslaget er **ikke godkendt**; den endelige SQL vises før
godkendelse.

**Pre-check (SQL, read-only)**
```sql
SELECT pg_get_functiondef('public.user_role(uuid)'::regprocedure);           -- forventet: 00108-kroppen
SELECT pg_get_functiondef('public.is_admin()'::regprocedure);                -- forventet: 00156-kroppen
SELECT data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active';  -- boolean / NO / true
SELECT count(*) FILTER (WHERE is_active IS FALSE) AS inaktive,
       count(*) FILTER (WHERE is_active IS NULL)  AS null_aktiv FROM public.profiles;      -- null_aktiv = 0
SELECT count(*) AS users_uden_profil FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;              -- forventet 0
SELECT count(*) AS sessioner_inaktive FROM auth.sessions s
  JOIN public.profiles p ON p.id = s.user_id WHERE p.is_active IS NOT TRUE;
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name IN ('user_role','is_admin');
```

**Post-check (SQL, read-only)** — desuden `check:rls-matrix` grøn og persona-probe (deaktiveret testbruger med gyldigt
token læser 0 rækker fra en kosttabel):
```sql
SELECT pg_get_functiondef('public.user_role(uuid)'::regprocedure) LIKE '%is_active%' AS user_role_ok,  -- true
       pg_get_functiondef('public.is_admin()'::regprocedure) LIKE '%is_active%' AS is_admin_ok;        -- true
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name IN ('user_role','is_admin');                         -- = pre
```

---

## MP-2 — `leads`/`lead_activities` som i appen, inkl. SELECT (tidl. 00254; LD-2 + PM2-2, S2)

**Formål:** prod har `"Users can view leads"` med `USING (true)` (`prod-table-policies.ts leads`); 00173 tillader montør
INSERT/UPDATE på alle leads; `lead_activities_insert_role` mangler `performed_by = auth.uid()`. Henrik (2026-10-19,
PM2-2): montør mister leads helt. **Henrik 2026-10-20:** forslaget godkendes ikke, hvis SELECT forbliver bredere end
rollemodellen.

**Tilsigtet rollemodel (evidens)**
- `src/lib/auth/permissions.ts:19–22`: `leads.view`, `leads.create`, `leads.edit` = admin, serviceleder, salg;
  `leads.delete` = admin. `inbox.view` (:26) = admin, serviceleder.
- Eneste læsning af `lead_activities` med bruger-klienten: `getLeadActivities` (`src/lib/actions/leads.ts:577–591`),
  gatet af `leads.view` (:582).
- Skrivninger med bruger-klienten er alle gatet til samme rollesæt og sætter `performed_by: userId`:
  `leads.ts:292/440/557/627/778/906` (gates :180/:217/:319/:516/:615/:697/:877), `lead-duplicates.ts:101` (gate :80),
  `incoming-emails.ts:1022` (`createCustomerFromEmail`, gate `inbox.view` :804), `:2161/:2209` (gate :2115).
- Service-/admin-klient (uden om RLS): `src/app/api/public/contact/route.ts:360` (`getServiceClient`, :185) og
  `src/lib/services/lead-won.ts:75` (`admin`).
- **Ingen kodevej lader montør eller bogholderi læse eller skrive `lead_activities`.** → **Option A**: SELECT strammes til
  samme rollesæt. Option B (bredere SELECT) har ingen evidens.

**Nuværende SELECT på `lead_activities`**
- Filerne: 00007:83 `"Users can view activities for their leads"` (lead-ejer/tildelt eller admin). 00173:169 dropper
  kun `lead_activities_select_authenticated` og opretter ingen SELECT-politik.
- Prod (backlog L #8 + samme kilde som `"Users can view leads"`): `"Users can view lead activities" FOR SELECT TO
  authenticated USING (true)` fra den gamle samlede migration (`archive/FULL_MIGRATION_legacy.sql:682`). Det præcise
  navnesæt læses i pre-check; **alle** SELECT-politikker skal væk, fordi permissive politikker OR'es.

**Skema/funktion (kun politikker)**
- `leads`: DROP `"Users can view leads"` (og evt. 00007-politikken); CREATE `leads_select_role`. `leads_insert_role`
  (med `created_by = auth.uid()`) og `leads_update_role` genskabes uden montør. `leads_delete_role` (kun admin) røres ikke.
- `lead_activities`: DROP alle eksisterende SELECT-politikker; CREATE `lead_activities_select_role`;
  `lead_activities_insert_role` genskabes uden montør og med `performed_by = auth.uid()`. Ingen UPDATE/DELETE-politik
  (append-only, som 00173).

```sql
-- DRAFT — IKKE en migrationsfil, ikke godkendt. Politiknavne bekræftes mod prod i pre-check.
DROP POLICY IF EXISTS "Users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads assigned to them or created by them" ON public.leads;
CREATE POLICY leads_select_role ON public.leads FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin','serviceleder','salg'));
DROP POLICY IF EXISTS leads_insert_role ON public.leads;
CREATE POLICY leads_insert_role ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin','serviceleder','salg') AND created_by = auth.uid());
DROP POLICY IF EXISTS leads_update_role ON public.leads;
CREATE POLICY leads_update_role ON public.leads FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin','serviceleder','salg'))
  WITH CHECK (public.user_role() IN ('admin','serviceleder','salg'));

DROP POLICY IF EXISTS "Users can view lead activities" ON public.lead_activities;           -- legacy USING (true)
DROP POLICY IF EXISTS "Users can view activities for their leads" ON public.lead_activities; -- 00007
DROP POLICY IF EXISTS lead_activities_select_authenticated ON public.lead_activities;
CREATE POLICY lead_activities_select_role ON public.lead_activities FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin','serviceleder','salg'));
DROP POLICY IF EXISTS lead_activities_insert_role ON public.lead_activities;
CREATE POLICY lead_activities_insert_role ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin','serviceleder','salg') AND performed_by = auth.uid());
```

**Dataændring:** ingen. · **Roller/sikkerhed:**
- Montør og bogholderi mister SELECT/INSERT/UPDATE på `leads` **og SELECT/INSERT på `lead_activities`** via REST.
- Salg beholder alle leads og deres aktiviteter (som `getLeadActivities`, der kun gater på `leads.view`). Ændres
  BESLUTNINGEN til "salg kun egne leads", skal begge SELECT-politikker følge med (EXISTS mod `leads`).
- Aktiviteter kan ikke længere logges i en andens navn. `addLeadActivity` bruger `.insert().select()` (:626–635), så
  SELECT-politikken skal dække samme rollesæt — det gør den.

**Økonomi/forretningsadfærd:** ingen synlig ændring for salg, serviceleder og admin; montørens app-adgang er allerede
fjernet (PM2-2). Kontaktformularen og lead-vundet bruger service-/admin-klient og påvirkes ikke.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab 00173-politikkerne (med montør, `TO authenticated`). `"Users can view leads"` og `"Users can view
lead activities"` genskabes kun som `FOR SELECT TO authenticated USING (true)`, **aldrig** uden `TO`-klausul.

**Rækkefølge/afhængigheder:** efter MP-1. BESLUTNING: må salg se/opdatere ALLE leads (forslaget beholder "alle")?
Kodeforudsætninger er opfyldt (se evidens). Målrettet test: persona-probe pr. rolle + U194.

**Pre-check (SQL, read-only)**
```sql
SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('leads','lead_activities') ORDER BY 1, 2;
SELECT p.role, count(*) FROM public.lead_activities a JOIN public.profiles p ON p.id = a.performed_by
 WHERE a.created_at > now() - interval '90 days' GROUP BY 1;                 -- montør/bogholderi forventet 0
SELECT p.role, count(*) FROM public.leads l JOIN public.profiles p ON p.id = l.created_by
 WHERE l.created_at > now() - interval '90 days' GROUP BY 1;
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name IN ('leads','lead_activities') AND grantee = 'anon';   -- forventet 0
```

**Post-check (SQL, read-only)** — desuden `check:rls-matrix` grøn og persona-probe (montør 0 rækker på `leads` og
`lead_activities`; salg kan stadig læse og logge):
```sql
SELECT tablename, policyname, cmd, qual FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('leads','lead_activities') AND cmd = 'SELECT';
  -- forventet præcis leads_select_role og lead_activities_select_role; ingen qual = 'true'
SELECT tablename, policyname, with_check FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('leads','lead_activities') AND with_check LIKE '%montør%';  -- 0
```

---

## MP-3 — `time_logs`-prissætningstrigger: `start_time`, kun ved reel ændring, fakturalås (tidl. 00253 del a + 00246; TT-1, EM-2)

**Formål:** **TT-1:** triggeren fyrer ikke på `start_time` (rettet i koden; migrationen er værn nr. 2). **EM-2:** Postgres
udløser triggeren, når kolonnen står i SET-listen, også med samme værdi, så en REST-opdatering med uændret `end_time`
omprisser til dagens sats — også på fakturerede rækker.

**Skema/funktion**
- `DROP TRIGGER`/`CREATE TRIGGER trg_time_logs_cost_amount BEFORE INSERT OR UPDATE OF start_time, end_time, employee_id,
  pay_rate_type, employee_rate_id … EXECUTE FUNCTION time_logs_set_cost_amount()` (i dag uden `start_time`, 00142:140).
- `time_logs_set_cost_amount()`: ved UPDATE genberegnes kun, når mindst én af de fem kolonner er `IS DISTINCT FROM OLD`.
- Ny BEFORE UPDATE-guard: afviser ændring af tid/sats-kolonner, når `OLD.invoice_line_id IS NOT NULL`, medmindre kaldet
  er service-role. Frigivelse af `invoice_line_id` (kreditering, DF-5) er ikke en tid/sats-ændring.
- **Endelig SQL er ikke skrevet**; den genereres fra prod-definitionen af funktionen, ikke fra 00142.

**Dataændring:** ingen; fremover genprises ved reel ændring af `start_time`, aldrig ved uændret værdi. ·
**Roller/sikkerhed:** authenticated kan ikke længere ændre tid/sats på fakturerede rækker via REST.

**Økonomi/forretningsadfærd:** fakturerede timers kost ændres ikke længere utilsigtet. En ændret starttid giver ny pris.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab triggeren med 00142-kolonnelisten og funktionen med den aktuelle prod-krop (læst i pre-check);
`DROP TRIGGER` for guarden.

**Rækkefølge/afhængigheder**
- Kodeforudsætninger er på plads: `updateTimeLog` afviser fakturerede rækker (`src/lib/actions/time-logs.ts:462`, og
  `.is('invoice_line_id', null)` ved :610); appen udelader uændrede felter (EM-2). Godkendelse sker via admin-klienten
  (`time-approval.ts:205`) og ændrer ikke tid/sats.
- Målrettede tests: `rate-engine-check` (R6) og REST-probe på staging (uændret `end_time` → ingen ny `cost_amount`;
  faktureret række → afvist).
- Skal ligge før MP-4, som bygger på samme tabel.

**Pre-check (SQL, read-only)**
```sql
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_time_logs_cost_amount';
SELECT pg_get_functiondef('public.time_logs_set_cost_amount()'::regprocedure);
SELECT count(*) FILTER (WHERE invoice_line_id IS NOT NULL) AS fakturerede, count(*) AS i_alt FROM public.time_logs;
```

**Post-check (SQL, read-only)**
```sql
SELECT pg_get_triggerdef(oid) LIKE '%start_time%' FROM pg_trigger WHERE tgname = 'trg_time_logs_cost_amount';  -- true
SELECT pg_get_functiondef('public.time_logs_set_cost_amount()'::regprocedure) LIKE '%IS DISTINCT FROM%';       -- true
SELECT count(*) FILTER (WHERE invoice_line_id IS NOT NULL) FROM public.time_logs;                              -- = pre
```

---

## MP-4 — `time_logs`: ingen overlappende registreringer (tidl. 00253 del b; TT-5) — BLOCKED_PREREQUISITE

**Formål:** to samtidige registreringer for samme medarbejder kan overlappe (læs-så-skriv uden constraint).

**Skema/funktion**
- `CREATE EXTENSION IF NOT EXISTS btree_gist` (**uklart:** uden `WITH SCHEMA extensions` havner den i `public`; tjek
  `prod-db-audit`).
- `ALTER TABLE public.time_logs ADD CONSTRAINT time_logs_no_overlap EXCLUDE USING gist (employee_id WITH =,
  tstzrange(start_time, COALESCE(end_time,'infinity'), '[)') WITH &&) WHERE (approval_status <> 'rejected')`.

**Dataændring:** ingen; constraint'en fejler ved oprettelse, hvis der findes overlap. · **Roller/sikkerhed:** ingen
ændring.

**Økonomi/forretningsadfærd**
- Overlappende registreringer afvises med 23P01.
- **BESLUTNING: kørende timere.** En kørende timer (`end_time IS NULL`) tæller som `[start, ∞)`: mens den kører, kan der
  ikke registreres tid efter dens start, og en glemt timer fra i går blokerer alt nyere. Strengere end det delvise
  unikke indeks (00086). Bekræft at det er ønsket.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `ALTER TABLE public.time_logs DROP CONSTRAINT
time_logs_no_overlap`. `btree_gist` kan blive stående.

**Rækkefølge/afhængigheder (kodeforudsætning → tests → staging → forslag → godkendelse → anvendelse)**
1. **Kodeforudsætning:** 23P01 mappes til en dansk overlap-besked. I dag 0 forekomster af `23P01` i `src/`. Steder:
   den centrale `formatError` (`src/lib/actions/action-helpers.ts:165`) eller direkte i `createTimeLog`
   (`src/lib/actions/time-logs.ts:244`, insert :371) og `updateTimeLog` (:426, update :606) samt timer-start-stien
   (findes med grep før ændringen).
2. Målrettet test: unit-/harness-tjek af mappingen + dobbelt-insert-probe på staging (23P01 → dansk tekst).
3. Staging: overlap-pre-check = 0, derefter migration på staging.
4. Endelig SQL vises → godkendelse → prod. Efter MP-3.

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) AS overlap FROM public.time_logs a JOIN public.time_logs b
  ON a.employee_id = b.employee_id AND a.id < b.id
 AND a.approval_status <> 'rejected' AND b.approval_status <> 'rejected'
 AND tstzrange(a.start_time, COALESCE(a.end_time,'infinity'),'[)')
  && tstzrange(b.start_time, COALESCE(b.end_time,'infinity'),'[)');                    -- skal være 0
SELECT count(*) AS koerende_timere, min(start_time) AS aeldste FROM public.time_logs WHERE end_time IS NULL;
SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname = 'btree_gist';
```

**Post-check (SQL, read-only)**
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'time_logs_no_overlap';
```

---

## MP-5 — `time_logs.sale_amount`/`sale_rate_snapshot` ikke læsbare for authenticated (tidl. 00255; TT-6) — BLOCKED_PREREQUISITE (HOLD)

**Formål:** montører kan via REST læse kollegaers salgssatser på tildelte arbejdsordrer.

**Skema/funktion:** `REVOKE SELECT (sale_amount, sale_rate_snapshot) ON public.time_logs FROM authenticated` (00192-mønstret).

**Dataændring:** ingen. · **Roller/sikkerhed:** kolonne-SELECT fjernes for alle indloggede; læsning kun med
admin-klienten bag `invoices.view.own_cases`.

**Økonomi/forretningsadfærd:** uændret, *hvis* alle læsere er flyttet; ellers viser faktura, cockpit og sagsøkonomi 0
eller fejl.

**Staging-resultat:** ikke kørt på staging (ingen SQL-fil; koden er ikke klar). · **Rollback:** `GRANT SELECT (sale_amount, sale_rate_snapshot) ON public.time_logs TO authenticated`. Aldrig til anon.

**Rækkefølge/afhængigheder (kodeforudsætning → tests → staging → forslag → godkendelse → anvendelse)**
1. **Kodeforudsætning:** fjern `sale_rate_snapshot`/`sale_amount` fra `TIME_LOG_PUBLIC_COLUMNS`
   (`src/lib/time-logs/columns.ts`) og flyt alle læsere til admin-klienten bag gate: bl.a. `service-case-economy.ts`,
   `service-cases.ts`, `invoices.ts`, `unbilled-work.ts`, `close-readiness-batch.ts`, `employee-economy.ts`,
   `invoice-from-case.ts`, `invoice-stage.ts`, `order-planning-tab.tsx`, `work-order-time-logs.tsx` (grep 2026-10-20).
2. Målrettede tests: faktura-fra-sag, sagsøkonomi, cockpit som montør/salg/admin.
3. Staging → forslag → godkendelse → prod.

**Pre-check (SQL, read-only)**
```sql
SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'time_logs' AND column_name IN ('sale_amount','sale_rate_snapshot');
```

**Post-check (SQL, read-only):** samme forespørgsel. `authenticated` må ikke stå på de to kolonner, og kost-kolonnerne
fra 00192 skal være uændrede.

---

## MP-6 — `v_customer_payment_summary`: DKK, 0,50-grænse, betalt netto (tidl. 00256 + 00264; RX-5, FC-7) — én view-definition

**Formål:** viewet (00214, i prod siden 2026-10-10) bruges af kundelisten via `v_customers_with_payment_summary`, den
ugentlige betalingsrapport (`src/lib/services/payment-report.ts`) og CSV'en. Tre fejl: valutaer blandes under "(DKK)";
`overdue_count` bruger `o.open_amount > 0` (rykkere/overblik bruger 0,50 kr); `paid_total = SUM(i.final_amount)`, så en
krediteret del tælles som betalt.

**Skema/funktion**
- Ét `CREATE OR REPLACE VIEW public.v_customer_payment_summary WITH (security_invoker = true)` ud fra 00214. Kolonnenavne
  og -typer uændrede, så `v_customers_with_payment_summary` virker uændret.
- Valutafilter (`upper(i.currency) = 'DKK'`) i FILTER på `outstanding_total`, `overdue_total`, `overdue_count` og
  `paid_total`. `invoices.currency` er `TEXT NOT NULL DEFAULT 'DKK'` (00080:23); `upper()` fanger 'dkk'.
- `o.open_amount > 0` → `o.open_amount >= 0.5` i `overdue_count` (og `overdue_total`, jf. runbooken).
- `paid_total` netto af kreditnotaer fra samme LATERAL-join.
- **Uklart:** SQL'en er kun en skitse; formlen for netto betalt er ikke endelig. Den fulde view-tekst skal skrives og
  vises før godkendelse.

**Dataændring:** ingen (view). · **Roller/sikkerhed:** uændret; `security_invoker` bevares, så RLS på `invoices`
afgrænser stadig.

**Økonomi/forretningsadfærd:** udestående, forfaldent og betalt falder, hvor de i dag er for høje (EUR, under 0,50 kr,
krediterede dele). Kunder med kun et restbeløb under 0,50 kr mister "Forfaldne"-mærket. Ikke-DKK forsvinder fra
oversigten; fakturerer Elta i EUR, kræves i stedet en valutadimension.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab 00214-viewet med `CREATE OR REPLACE`, samme kolonner.

**Rækkefølge/afhængigheder:** BESLUTNING først (fakturerer Elta nogensinde i anden valuta end DKK?). CSV-kolonnerne er
uændrede. MP-17 læser viewet og følger automatisk.

**Pre-check (SQL, read-only)**
```sql
SELECT upper(currency), count(*) FROM public.invoices GROUP BY 1;
SELECT count(*) AS kunder, sum(outstanding_total) AS udestaaende, sum(overdue_count) AS forfaldne,
       sum(paid_total) AS betalt FROM public.v_customer_payment_summary;    -- baseline (aggregat)
SELECT md5(pg_get_viewdef('public.v_customer_payment_summary'::regclass));  -- = 00214
```

**Post-check (SQL, read-only):** samme aggregat. Hvis alt er DKK, må kun `overdue_count` og `paid_total` ændre sig, og kun
nedad. Viewdef-hashen skal være ændret.

---

## MP-7 — `calculation_feedback`: INSERT kun admin/serviceleder (tidl. 00257; AI-2)

**Formål:** feedback styrer kalibreringen af basistider og risikobuffer. Montør kan i dag indsætte rækker (00178:108).

**Skema/funktion:** `DROP POLICY`/`CREATE POLICY calculation_feedback_insert_role … FOR INSERT TO authenticated WITH CHECK
(public.user_role() IN ('admin','serviceleder'))`.

**Dataændring:** ingen. · **Roller/sikkerhed:** montør mister INSERT. SELECT (`calculation_feedback_select_authenticated`, `USING (true)`) er
uændret; den dækkes af udkast C-F3/00244 (ikke i denne pakke).

**Økonomi/forretningsadfærd:** ingen synlig ændring (koden kræver `projects.edit`). Lukker for forgiftning af
kalibreringen.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab 00178-politikken (admin, serviceleder, montør;
`TO authenticated`).

**Rækkefølge/afhængigheder:** uafhængig. (PM3-11 fase 1 flytter kodens feedback-gate til `tools.calculations`; påvirker
ikke migrationen.)

**Pre-check (SQL, read-only)** — 00045 har ingen opretter-kolonne, så "rækker oprettet af montører" kan ikke tælles:
```sql
SELECT policyname, cmd, with_check FROM pg_policies WHERE tablename = 'calculation_feedback';
SELECT count(*) FROM public.calculation_feedback;
```

**Post-check (SQL, read-only):** `with_check` for `calculation_feedback_insert_role` må ikke indeholde 'montør'. Desuden
persona-probe (montør INSERT → 42501) og `check:rls-matrix`.

---

## MP-8 — `revoke_user_sessions(uuid)`: sessioner tilbagekaldes ved deaktivering (tidl. 00258; AS-3) — BLOCKED_PREREQUISITE

**Formål:** deaktivering banner brugeren, men eksisterende refresh-tokens virker, indtil de udløber.

**Skema/funktion:** ny `public.revoke_user_sessions(p_user_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET
search_path = auth, public`, der sletter fra `auth.sessions` (`user_id = p_user_id`) og `auth.refresh_tokens`
(`user_id = p_user_id::text`). `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role`.

**Dataændring:** kun når funktionen kaldes: den brugers sessioner og refresh-tokens slettes (flygtige auth-data). ·
**Roller/sikkerhed:** kun service_role kan kalde funktionen. **Uklart (bekræftes på staging):** den rører Supabase-internt
`auth`-skema; `refresh_tokens.user_id` er varchar i nogle versioner; det er ikke verificeret, at migrationsrollen har
DELETE på `auth.sessions`/`auth.refresh_tokens` i vores version.

**Økonomi/forretningsadfærd:** en deaktiveret bruger logges ud ved næste refresh.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `DROP FUNCTION public.revoke_user_sessions(uuid)`. Kaldet i koden skal tåle en manglende funktion (se nedenfor).

**Rækkefølge/afhængigheder (kodeforudsætning → tests → staging → forslag → godkendelse → anvendelse)**
1. **Kodeforudsætning:** `setProfileLoginActive(profileId, false)` (`src/lib/auth/login-access.ts:21`) kalder
   `admin.rpc('revoke_user_sessions', …)` efter ban og `is_active`-opdatering (:33–51). I dag 0 forekomster i `src/`.
   Kaldet skal være bagudkompatibelt: en manglende funktion (PGRST202/42883) logges og blokerer ikke deaktiveringen,
   så koden kan deployes før migrationen (erstatter den tidligere undtagelse "migration før kode").
2. Målrettet test: unit-tjek af fallback + harness-tjek af de tre kaldere (`employees.ts:337`, `employee-login.ts:282`,
   `settings.ts:1145`).
3. Staging: migration + deaktivér testbruger → refresh mislykkes; auth-kolonnetyper og DELETE-privilegier bekræftet.
4. Endelig SQL → godkendelse → prod. Efter MP-1.

**Pre-check (SQL, read-only)**
```sql
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'auth' AND table_name IN ('sessions','refresh_tokens') AND column_name = 'user_id';
SELECT has_table_privilege(current_user, 'auth.sessions', 'DELETE'),
       has_table_privilege(current_user, 'auth.refresh_tokens', 'DELETE');
SELECT count(*) FROM pg_proc WHERE proname = 'revoke_user_sessions';           -- forventet 0
```

**Post-check (SQL, read-only)**
```sql
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_name = 'revoke_user_sessions';                                  -- kun service_role (+ ejer)
```

---

## MP-9 — `document_confirmations.customer_document_id`: CASCADE → RESTRICT (tidl. 00259; DL-1)

**Formål:** sletning af et dokument må ikke slette kundens underskrevne bekræftelser. I dag `ON DELETE CASCADE` (00120:49).

**Skema/funktion:** `DROP CONSTRAINT document_confirmations_customer_document_id_fkey` og `ADD CONSTRAINT … FOREIGN KEY
(customer_document_id) REFERENCES public.customer_documents(id) ON DELETE RESTRICT`.

**Dataændring:** ingen (`ADD CONSTRAINT` validerer rækker, som allerede opfylder FK'en). · **Roller/sikkerhed:** ingen.

**Økonomi/forretningsadfærd:** sletning af et dokument med bekræftelser giver 23503. Koden blokerer det allerede
(`document-deletable-test`).

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab FK'en med `ON DELETE CASCADE`.

**Rækkefølge/afhængigheder:** uafhængig. Constraint-navnet bekræftes i prod.

**Pre-check (SQL, read-only)**
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.document_confirmations'::regclass AND contype = 'f';
```

**Post-check (SQL, read-only):** samme forespørgsel; definitionen indeholder `ON DELETE RESTRICT`.

---

## MP-10 — `incoming_invoices.supplier_id`: SET NULL → RESTRICT (tidl. 00260; DL-3)

**Formål:** en slettet leverandør tog bogførte fakturaer ud af dublet-indekset `uq_incoming_invoices_supplier_number`.
I dag `ON DELETE SET NULL` (00094:30).

**Skema/funktion:** `DROP`/`ADD CONSTRAINT incoming_invoices_supplier_id_fkey … REFERENCES public.suppliers(id) ON DELETE
RESTRICT`.

**Dataændring:** ingen. · **Roller/sikkerhed:** ingen.

**Økonomi/forretningsadfærd:** en leverandør med fakturaer kan ikke slettes (koden blokerer allerede,
`supplier-delete-guard-check`). Bogføringshistorikken bevares.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** genskab FK'en med `ON DELETE SET NULL`.

**Rækkefølge/afhængigheder:** uafhængig; constraint-navnet bekræftes. `supplier_products.supplier_id` CASCADE er en separat
BESLUTNING.

**Pre-check (SQL, read-only)**
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.incoming_invoices'::regclass AND contype = 'f';
SELECT count(*) FROM public.incoming_invoices WHERE supplier_id IS NULL;      -- baseline (allerede afkoblede)
```

**Post-check (SQL, read-only):** FK-definitionen indeholder `ON DELETE RESTRICT`, og NULL-antallet er uændret.

---

## MP-11 — Intet nyt job og ingen ny tid på en lukket sag (tidl. 00261; RC-3)

**Formål:** oprettelse af job eller timer, mens en sag lukkes, er stadig læs-så-skriv i koden. Triggeren er værn nr. 2.

**Skema/funktion**
- Ny `public.reject_work_on_closed_case()` (plpgsql, SECURITY DEFINER, `search_path = public`, REVOKE fra
  PUBLIC/anon/authenticated). Tager `FOR SHARE` på `service_cases` og rejser `'Sagen er lukket'` (P0001) ved
  `status = 'closed'`.
- `trg_work_orders_closed_case`: BEFORE INSERT OR UPDATE OF status ON `work_orders` (skift til `'done'`/`'cancelled'`
  altid tilladt). `trg_time_logs_closed_case`: BEFORE INSERT ON `time_logs` (opslag via `work_order_id`).

**Dataændring:** ingen. · **Roller/sikkerhed:** gælder **alle** skrivere, også service_role. Harness-, backfill- og importscripts, der skriver på
lukkede sager, fejler.

**Økonomi/forretningsadfærd**
- "Sagen er lukket" ved oprettelse; færdigmelding og annullering virker stadig. Genåbning (`done → in_progress`) på en
  lukket sag blokeres også.
- **Uklart:** sager med status `'converted'` (00067) blokeres ikke. Bekræft at det er korrekt.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `DROP TRIGGER trg_work_orders_closed_case ON public.work_orders; DROP TRIGGER trg_time_logs_closed_case ON
public.time_logs; DROP FUNCTION public.reject_work_on_closed_case()`.

**Rækkefølge/afhængigheder**
- P0001-teksten: `action-helpers.ts` (LG-13) sender egne danske tekster videre; stien er ikke verificeret for DB-fejl →
  målrettet test før godkendelse.
- Scripts i `scripts/` tjekkes for skrivning på lukkede sager.

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) AS job_paa_lukkede FROM public.work_orders wo JOIN public.service_cases sc ON sc.id = wo.case_id
 WHERE sc.status = 'closed' AND wo.created_at > now() - interval '90 days';
SELECT count(*) AS timer_paa_lukkede FROM public.time_logs t JOIN public.work_orders wo ON wo.id = t.work_order_id
  JOIN public.service_cases sc ON sc.id = wo.case_id
 WHERE sc.status = 'closed' AND t.created_at > now() - interval '90 days';
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_work_orders_closed_case','trg_time_logs_closed_case');  -- 0
```

**Post-check (SQL, read-only)** — desuden UI-regression for sager, job og timer (U11/U63/U30/U183/U66):
```sql
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
 WHERE tgname IN ('trg_work_orders_closed_case','trg_time_logs_closed_case');
SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'reject_work_on_closed_case';
```

---

## MP-12 — Unik mailtråd pr. tilbud (tidl. 00262; RC-4, valgfri)

**Formål:** forhindre dobbelt førsteafsendelse af et tilbud. Koden ser allerede på alle tilbuddets tråde.

**Skema/funktion:** `CREATE UNIQUE INDEX uq_email_threads_offer_id ON public.email_threads(offer_id) WHERE offer_id IS NOT
NULL`. Det ikke-unikke `idx_email_threads_offer` (00033:84) bliver stående.

**Dataændring:** ingen i selve migrationen; den fejler ved dubletter. **Oprydning af dubletter er en separat
dataændring med egen godkendelse** (antal ukendt; ingen oprydnings-SQL skrevet). · **Roller/sikkerhed:** ingen.

**Økonomi/forretningsadfærd:** en anden tråd til samme tilbud afvises (23505). Verificér at alle oprettelsessteder genbruger
den eksisterende tråd.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `DROP INDEX public.uq_email_threads_offer_id`.

**Rækkefølge/afhængigheder:** dublet-pre-check = 0, ellers oprydning først (separat godkendelse).

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) AS tilbud_med_dubletter FROM (
  SELECT offer_id FROM public.email_threads WHERE offer_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;
```

**Post-check (SQL, read-only)**
```sql
SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_email_threads_offer_id';
```

---

## MP-13 — `allocate_invoice_number`: dansk kalenderår og > 9.999 pr. år (tidl. 00263; FC-9 + FC-10 = TZ-5) — BLOCKED_PREREQUISITE

**Formål:** **FC-10:** `EXTRACT(YEAR FROM NOW())` (00080:99) regnes i UTC, så en faktura oprettet 1/1 kl. 00–01 dansk tid
får forrige års serie (**rammer næste gang 2027-01-01**). **FC-9:** `LPAD(v_n::TEXT, 4, '0')` afkorter 10.000 til '1000'
(dublet); kun relevant ved mere end 9.999 fakturaer på et år.

**Skema/funktion:** `CREATE OR REPLACE FUNCTION allocate_invoice_number() RETURNS TEXT LANGUAGE plpgsql` (samme signatur,
stadig SECURITY INVOKER) med `v_year := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Copenhagen'))` og
`LPAD(v_n::TEXT, GREATEST(4, length(v_n::TEXT)), '0')`. Brugen af `invoice_number_counters` er uændret.

**Dataændring:** ingen; eksisterende numre og tællere røres ikke. · **Roller/sikkerhed:** ACL uændret (00080: `GRANT EXECUTE … TO authenticated, service_role`; `CREATE OR REPLACE` bevarer
den). Verificér mod prod.

**Økonomi/forretningsadfærd:** fakturaer oprettet kl. 00–01/02 nytårsnat får det nye års serie. Nummer 10.000+ bliver
`F-YYYY-10000` i stedet for en dublet, der blokerer al fakturering.

**Staging-resultat:** ikke kørt på staging. · **Rollback:** `CREATE OR REPLACE` med 00080-kroppen.

**Rækkefølge/afhængigheder (kodeforudsætning → tests → staging → forslag → godkendelse → anvendelse)**
1. **Kodeforudsætning:** `INVOICE_NUMBER_RE = /F-\d{4}-\d{4}/g` (`src/lib/services/bank-payments.ts:197`, brugt :360)
   udvides til `F-\d{4}-\d{4,}` med ordgrænse; tjek og ret steder, der sorterer `invoice_number` som tekst (samme
   fejltype som R3-10, commit 3447abb9).
2. Målrettet test: bankafstemning matcher `F-2027-0001` og `F-2027-10000`, ikke delstrenge.
3. Staging: `SELECT allocate_invoice_number()` i en transaktion med ROLLBACK (skriver til tælleren → kun staging).
4. Endelig SQL → godkendelse → prod. **Skal være i prod før 2026-12-31.**

**Pre-check (SQL, read-only)**
```sql
SELECT pg_get_functiondef('public.allocate_invoice_number()'::regprocedure);  -- = 00080
SELECT year, next_n FROM public.invoice_number_counters ORDER BY year;
SELECT grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name = 'allocate_invoice_number';
```

**Post-check (SQL, read-only):** definitionen indeholder `Europe/Copenhagen` og `GREATEST`; ACL og tællere er uændrede.

---

## MP-14 — `create_invoice_from_offer`: forfaldsdato i dansk dato (tidl. 00265; FIN2-10)

**Formål:** forfaldet beregnes fra `CURRENT_DATE` (00198:78, UTC), så en faktura oprettet kl. 00–02 dansk tid får forfald
én dag for tidligt; `rebaseDueDateOnSend` regner i dansk dato, så kunden får 13 i stedet for 14 dage.

**Skema/funktion:** `CREATE OR REPLACE FUNCTION create_invoice_from_offer(p_offer_id UUID, p_due_days INTEGER DEFAULT 14)
RETURNS UUID`, hvor `CURRENT_DATE` erstattes med `(now() AT TIME ZONE 'Europe/Copenhagen')::date`. **Fuld funktionstekst er
ikke skrevet**; den genereres fra den aktuelle prod-definition, ikke fra filen.

**Dataændring:** ingen; eksisterende fakturaer røres ikke. · **Roller/sikkerhed:** **uoverensstemmelse:** runbookens staging-trin 3 forventer "ingen EXECUTE for
PUBLIC/anon/authenticated", men 00198:98 giver `GRANT EXECUTE … TO authenticated, service_role`. Migrationen **bevarer**
den aktuelle prod-ACL; en stramning er et separat forslag.

**Økonomi/forretningsadfærd:** kunden får de aftalte betalingsdage, også kl. 00–02. Rammer for alvor, når DF-1
(automatisk fakturering) går live.

**Staging-resultat:** ikke kørt på staging (plan: migration, testtilbud, `prod-fn-acl`, UI U15/U29/U31). ·
**Rollback:** `CREATE OR REPLACE` med 00198-kroppen.

**Rækkefølge/afhængigheder:** ingen; koden er kompatibel. DF-12 (andre RPC'er med `CURRENT_DATE`) er ikke med.

**Pre-check (SQL, read-only)**
```sql
SELECT pg_get_functiondef('public.create_invoice_from_offer(uuid,integer)'::regprocedure) LIKE '%CURRENT_DATE%';  -- true
SELECT grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name = 'create_invoice_from_offer';
```

**Post-check (SQL, read-only):** definitionen indeholder `Europe/Copenhagen` og ikke `CURRENT_DATE`. ACL er lig med pre.

---

## MP-15 — PM3-2: SELECT-politikker smallere end i dag (incoming_emails, service_cases, offers, customer_tasks, offer_activities)

**FORSLAG — ingen SQL skrevet.** Ved godkendelse bliver det én migration pr. tabel (MP-15a–e), hver med eget rigtigt
nummer.

**Formål:** DB-læsepolitikkerne er bredere end appen (S2). Bekræftet i prod 2026-10-19 (`prod-table-policies`):
`service_cases`, `offers` og `customer_tasks` har SELECT `USING (true)`; `incoming_emails` kan læses af
admin/serviceleder/salg/bogholderi (salg alle mails) og montør inden for scope; anon har fulde tabel-grants på
`incoming_emails` og `customer_tasks` (RLS stopper dem i dag).

**Skema/funktion (hvad migrationen skal indeholde)**
- Pr. tabel: ny `<tabel>_select_role`-politik `TO authenticated`, der afspejler app-scope (fx salg kun egne tilbud som
  API-2, montør kun sager/opgaver på egne arbejdsordrer); DROP af den nuværende `USING (true)`-politik (navne fra prod).
- `REVOKE ALL … FROM anon` på `incoming_emails` og `customer_tasks`.
- `offer_activities`: nuværende politik er ikke dokumenteret og læses først.

**Dataændring:** ingen. · **Roller/sikkerhed:** salg, montør og bogholderi mister REST-læsning uden for deres scope;
anon-grants fjernes.

**Økonomi/forretningsadfærd:** ingen tilsigtet app-ændring, hvis appen allerede gater. Risiko for tomme lister, hvor
server-kode læser med bruger-klienten på tværs af scope (cockpit, rapporter, søgning); kræver read-site-tjek
(`scripts/rls/read-sites.ts`).

**Staging-resultat:** ikke kørt (ingen SQL). · **Rollback:** genskab den tidligere `TO authenticated`-politik.
**anon-grants genskabes ikke.**

**Rækkefølge/afhængigheder:** BESLUTNING om scope pr. rolle (især "salg: alle mails eller kun koblede/egne", jf. LC-9) →
kode til admin-klienten, hvor der læses på tværs af scope → migration. Efter MP-1.

**Pre-check (SQL, read-only)**
```sql
SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public'
 AND tablename IN ('incoming_emails','service_cases','offers','customer_tasks','offer_activities') AND cmd IN ('SELECT','ALL');
SELECT table_name, string_agg(privilege_type, ',') FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee = 'anon'
   AND table_name IN ('incoming_emails','service_cases','offers','customer_tasks','offer_activities') GROUP BY 1;
```

**Post-check (SQL, read-only):** samme forespørgsler. Ingen `qual = 'true'` for SELECT og ingen anon-grants. Desuden
`check:rls-matrix` og persona-probes pr. rolle.

---

## MP-16 — PM3-11 fase 2: drop af det gamle projektmodul (`projects`, `project_tasks`, `time_entries`)

**FORSLAG — ingen SQL skrevet.** Kilde: `docs/runbooks/pm3-11-legacy-projects-retirement.md`.

**Formål:** modulet afvikles (Henrik 2026-10-19), og sagerne er sandheden. Fase 1 (kode) er DONE.

**Skema/funktion (hvad migrationen skal indeholde)**
- FK-kolonner og constraints mod `projects(id)` droppes: `messages.project_id` (00003:23, SET NULL),
  `integration_logs.project_id`/`integration_queue.project_id` (00036:158/199, SET NULL) og
  `calculation_feedback.project_id` (00045:127, uden ON DELETE).
- Derefter `DROP TABLE` af `time_entries`, `project_tasks` og `projects` (triggerne følger med).
- Forældreløse funktioner: `update_project_actual_hours()`, `update_task_actual_hours()`, `generate_project_number()`
  (00006). Afhængigheder findes med `pg_depend` før kørsel (ikke gjort).

**Dataændring:** **irreversibel sletning.** Tidligere prod-optælling: 1 projekt, 1 projektopgave, 0 time_entries, 0
beskeder med projekt. Skal tælles igen. `project_id`-værdier i andre tabeller forsvinder også.

**Roller/sikkerhed:** tabellerne og politikkerne forsvinder. `rls-lockdown.ts`, `write-matrix.ts` og prod-scriptenes
tabellister trimmes bagefter.

**Økonomi/forretningsadfærd:** ingen; fase 1 har fjernet alle læsere. · **Staging-resultat:** ikke kørt (ingen SQL).
**Rollback:** kun genskabelse fra eksport og skema fra 00006 m.fl. Prod-data arkiveres først (CSV/JSON til Henrik).

**Rækkefølge/afhængigheder:** fase 1 deployet, ny optælling, eksport leveret og godkendt. Sidst i pakken.

**Pre-check (SQL, read-only)**
```sql
SELECT (SELECT count(*) FROM public.projects) AS projekter, (SELECT count(*) FROM public.project_tasks) AS opgaver,
       (SELECT count(*) FROM public.time_entries) AS time_entries,
       (SELECT count(*) FROM public.messages WHERE project_id IS NOT NULL) AS beskeder,
       (SELECT count(*) FROM public.calculation_feedback WHERE project_id IS NOT NULL) AS feedback;
SELECT conrelid::regclass, conname FROM pg_constraint WHERE confrelid = 'public.projects'::regclass;
SELECT DISTINCT classid::regclass, objid FROM pg_depend WHERE refobjid = 'public.projects'::regclass;
```

**Post-check (SQL, read-only)** — desuden `prod-db-audit` 0/0/0 og UI-crawl U101/U102 (redirect):
```sql
SELECT to_regclass('public.projects'), to_regclass('public.project_tasks'), to_regclass('public.time_entries');  -- NULL ×3
```

---

## MP-17 — PF3-7: kundelistens tællinger som én RPC

**FORSLAG — ingen SQL skrevet.**

**Formål:** `getCustomersWithPaymentState` (`src/lib/actions/customers.ts`) sender pr. visning en datarække-query plus 5
COUNT-queries mod `v_customers_with_payment_summary`; viewet evalueres 6 gange.

**Skema/funktion (hvad migrationen skal indeholde)**
- Ny funktion (fx `customer_payment_counts(p_search text, p_is_active boolean, p_origin_auto boolean, p_customer_ids
  uuid[])`), der returnerer de 5 tal med `COUNT(*) FILTER (...)`.
- **SECURITY INVOKER**, så RLS og `security_invoker` på viewet stadig afgrænser pr. rolle.
- Søgefiltret genskaber præcis `applyFilters` (ilike på 6 felter + telefoncifre, `AUTO_CREATED_FILTER`).
- ACL: `REVOKE … FROM PUBLIC, anon`; `GRANT EXECUTE … TO authenticated`.

**Dataændring:** ingen. · **Roller/sikkerhed:** uændret, hvis INVOKER. SECURITY DEFINER ville lække tal på tværs af
scope og må ikke bruges.

**Økonomi/forretningsadfærd:** ingen; kun hurtigere kundeliste. Tallene skal være identiske med de 5 queries.

**Staging-resultat:** ikke kørt (ingen SQL). · **Rollback:** `DROP FUNCTION`. Koden falder tilbage til de 5 queries, hvis den bygges med fallback.

**Rækkefølge/afhængigheder:** kode med fallback først (tåler manglende funktion), derefter migration. Efter MP-6. Lav
prioritet.

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) FILTER (WHERE overdue_count > 0), count(*) FILTER (WHERE outstanding_total > 0),
       count(*) FILTER (WHERE payment_status = 'late_payer'), count(*) FILTER (WHERE payment_status = 'on_time'),
       count(*) FILTER (WHERE payment_status = 'no_data') FROM public.v_customers_with_payment_summary;   -- baseline
```

**Post-check (SQL, read-only):** funktionens resultat uden filtre er lig med baseline. `prosecdef = false` i `pg_proc`, og
ACL er uden anon.

---

## MP-18 — EM-8 (DB-del): `integration_webhooks.headers` kun læsbar for admin

**FORSLAG — ingen SQL skrevet.** Kilde: `security-2026-10-17-proposal.md` § "(følger 00241)".

**Formål:** webhook-headers kan indeholde API-nøgler eller tokens. App-delen er DONE (commit 32955433): maskering i
`getWebhooks`/`getIntegration`, og en maske gemmes aldrig over den rigtige værdi. I DB er kolonnen stadig læsbar.

**Skema/funktion (hvad migrationen skal indeholde):** kolonne-REVOKE af `headers` på `public.integration_webhooks` for
`authenticated` (00192-mønstret). SELECT-politikken strammes i udkast 00241 (`integration_webhooks_select_role`:
admin/serviceleder/bogholderi; ikke i denne pakke).

**Dataændring:** ingen; prod har 0 webhooks (`scripts/prod-webhook-urls.ts`). · **Roller/sikkerhed:** kun admin-klienten (service_role) læser `headers`. · **Økonomi/forretningsadfærd:** ingen;
webhook-dispatch bruger service-role.

**Staging-resultat:** ikke kørt (ingen SQL). · **Rollback:** `GRANT SELECT (headers) … TO authenticated`. Aldrig til anon.

**Rækkefølge/afhængigheder:** efter udkast 00241. Kode først: `getWebhooks`/`getIntegration` læser `headers` med
admin-klienten bag `settings.economic`/admin, og redigeringsformularen sender headers separat.

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) FROM public.integration_webhooks;
SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
 WHERE table_name = 'integration_webhooks' AND column_name = 'headers';
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'integration_webhooks';
```

**Post-check (SQL, read-only):** `authenticated` står ikke på `headers`, og integration-webhook-check er grøn.

---

## MP-19 — API-4 / SEC2-6: grænse pr. IP for den offentlige kontaktformular

**FORSLAG — ingen SQL skrevet.** Kræver en BESLUTNING om GDPR og skema.

**Formål:** `src/app/api/public/contact/route.ts` har kun et globalt loft (`MAX_SUBMISSIONS_PER_HOUR = 30`) og et
dubletvindue på 10 min pr. e-mail. En bot kan lukke formularen for alle i en time.

**Skema/funktion (hvad migrationen skal indeholde)**
- Ny tabel, fx `public_contact_rate_limits`, med en **hash** af IP-adressen (HMAC med server-hemmelighed, aldrig rå IP),
  tidsstempel og evt. tæller. Indeks på (hash, tidspunkt).
- RLS slået til **uden** politikker for anon/authenticated; kun service-role (ruten bruger `getServiceClient()`).
- `REVOKE ALL … FROM anon, authenticated`.
- Oprydningsjob/TTL (fx 24 t) — løbende datasletning, kræver godkendelse.
- Alternativ uden migration: KV/Upstash eller Turnstile (driftsbeslutning).

**Dataændring:** ny tabel; eksisterende data ændres ikke. · **Roller/sikkerhed:** en IP-hash er et pseudonym og dermed persondata (formål, opbevaringstid, privatlivspolitik). Ingen
adgang for anon og authenticated.

**Økonomi/forretningsadfærd:** én afsender kan ikke længere lukke formularen for alle. Det globale loft kan hæves.

**Staging-resultat:** ikke kørt (ingen SQL). · **Rollback:** `DROP TABLE`; ruten falder tilbage til det globale loft.

**Rækkefølge/afhængigheder:** BESLUTNING (lagring, TTL, Turnstile/KV) → kode, der tåler manglende tabel → migration.

**Pre-check (SQL, read-only)**
```sql
SELECT date_trunc('hour', created_at) AS time, count(*) FROM public.leads
 WHERE source = 'website' AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
```

**Post-check (SQL, read-only):** tabellen findes med RLS slået til og 0 politikker for anon/authenticated. Desuden
`public-contact-limit-check`.

---

## MP-20 — CA-9: `round_to` — ceil i TS, ROUND i SQL

**FORSLAG — ingen SQL skrevet.** Kræver en BESLUTNING om én regel.

**Formål:** samme avanceregel med `round_to` giver forskellig salgspris afhængigt af kodevej:

| Implementering | Afrunding |
|---|---|
| `src/lib/logic/pricing.ts:46` (bruges af `supplier-line-pricing.ts`) | `Math.ceil` |
| `src/lib/services/price-engine.ts:242` | `Math.round` |
| SQL `calculate_sale_price` (00044:293) | `ROUND(v_sale_price / round_to) * round_to` |

**Skema/funktion (hvad migrationen skal indeholde):** kun hvis der vælges ceil: `CREATE OR REPLACE FUNCTION
calculate_sale_price(...)` med `CEIL`. Signatur og ACL uændrede. Vælges ROUND, er det en ren kodeændring i `pricing.ts`
og **ingen migration**.

**Dataændring:** ingen; gemte priser på tilbudslinjer røres ikke. · **Roller/sikkerhed:** ingen.

**Økonomi/forretningsadfærd:** nye priser fra den ene kodevej flytter op til ét `round_to`-trin. Påvirker kun regler med
`round_to > 0`. CA-6 (avance-præcedens) bør afgøres samtidig, men er et separat forslag.

**Staging-resultat:** ikke kørt (ingen SQL). · **Rollback:** `CREATE OR REPLACE` med 00044-kroppen (eller prod-kroppen fra pre-check).

**Rækkefølge/afhængigheder:** BESLUTNING (ceil eller round) → kode og evt. migration. Prod-kroppen læses først.

**Pre-check (SQL, read-only)**
```sql
SELECT count(*) FILTER (WHERE round_to > 0) AS regler_med_afrunding, count(*) AS regler
  FROM public.supplier_margin_rules WHERE is_active = true;
SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'calculate_sale_price';
```

**Post-check (SQL, read-only):** definitionen indeholder den valgte afrunding. Stikprøve (staging): samme kost og regel
giver samme pris i TS og SQL.

---

## Anbefalet godkendelsesrækkefølge

Rigtige numre er **planlagte og tildeles ved godkendelse**, fortløbende fra 00234 i den rækkefølge, forslagene faktisk
godkendes. Godkendes et forslag senere eller springes over, rykker de efterfølgende numre op. Et `BLOCKED_PREREQUISITE`-
forslag kan først få et nummer, når dets kodeforudsætning, tests og staging er gennemført.

| # | Ref (tidl. udkast) | Planlagt nr. (tildeles ved godkendelse) | Grund |
|---|---|---|---|
| 1 | MP-13 (00263) | 00234 | Lav risiko; skal i prod før nytår 2026/27. Først regex-/sorteringskoden (BLOCKED_PREREQUISITE). |
| 2 | MP-14 (00265) | 00235 | Lav risiko, samme mønster (dansk dato). Klar før DF-1 går live. |
| 3 | MP-1 (00252 + 00247) | 00236 | S2-grundlag for MP-2/MP-8/MP-15. NULL-spørgsmålet er afklaret (NOT NULL i begge miljøer). |
| 4 | MP-7 (00257) | 00237 | Lav risiko, uafhængig. |
| 5 | MP-9 (00259) | 00238 | Lav risiko, beskytter underskrevne bekræftelser. Bekræft constraint-navnet. |
| 6 | MP-10 (00260) | 00239 | Lav risiko, beskytter bogførte leverandørfakturaer. Bekræft constraint-navnet. |
| 7 | MP-2 (00254) | 00240 | S2 inkl. SELECT-stramning af `lead_activities`. Efter MP-1 og beslutning om salg. |
| 8 | MP-3 (00253a + 00246) | 00241 | Prissætningstrigger + fakturalås; kodeforudsætninger opfyldt. |
| 9 | MP-8 (00258) | 00242 | Efter MP-1 og kodeforudsætning i `login-access.ts` (BLOCKED_PREREQUISITE). |
| 10 | MP-6 (00256 + 00264) | 00243 | Kræver DKK-beslutning og endelig view-SQL. |
| 11 | MP-11 (00261) | 00244 | Efter script-tjek og P0001-test. Bekræft `'converted'`. |
| 12 | MP-4 (00253b) | 00245 | Efter MP-3, 23P01-mapping (BLOCKED_PREREQUISITE), overlap = 0 og timer-beslutning. |
| 13 | MP-12 (00262) | 00246 | Valgfri; kun når dublet-tjek = 0. |
| 14 | MP-15a–e (PM3-2) | 00247–00251 | Højeste sikkerhedsværdi blandt FORSLAG; SQL og scope-beslutning mangler. Én tabel ad gangen. |
| 15 | MP-18 (EM-8 DB) | 00252 | Efter udkast 00241 og kodeflytning af `headers`-læsning. Latent (0 webhooks). |
| 16 | MP-17 (PF3-7) | 00253 | Ren performance; efter MP-6. |
| 17 | MP-20 (CA-9) | 00254 | Kun hvis ceil vælges; ellers ingen migration og intet nummer. |
| 18 | MP-19 (API-4/SEC2-6) | 00255 | Kræver GDPR-beslutning, eller KV/Turnstile i stedet (intet nummer). |
| 19 | MP-16 (PM3-11 fase 2) | 00256 | Irreversibel. Sidst, efter eksport og ny optælling. |
| — | MP-5 (00255) | — | **BLOCKED_PREREQUISITE (HOLD)**, indtil alle `sale_*`-læsere er flyttet til admin-klienten. |

**Bemærk:** planlagte numre (fx 00241, 00246, 00252) falder sammen med gamle udkastnumre. Ved godkendelse skrives både
rigtigt nummer og MP-ID i commit, migrationsfilens header og de berørte runbooks.
