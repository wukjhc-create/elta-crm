# ELTA CRM/ERP — Data Model Risks

> Prioriteret risiko-liste på datamodel-niveau. Hver risiko er konkret, sporbar og har en anbefalet handling.
> Sidst opdateret: Sprint 10A.

## R1 — Forretningskritisk: `customer_id`-only flows respekterer ikke sagspartner-roller

**Berørte tabeller:** `offers`, `invoices`, `customer_tasks`, `customer_documents`

**Beskrivelse:** Det forretningsmæssige Mikma-scenarie (Mikma er bestiller + betaler, Lars Peter er anlægsejer + kontakt-på-stedet) understøttes IKKE på tværs af systemet. Kun `service_cases` har parti-rolle-FK'er (migration 00112). `offers`, `invoices`, `customer_tasks` og `customer_documents` har kun `customer_id`.

**Konsekvens:**
- Tilbud sendes altid til `offer.customer_id`-customer.email (eller billing-contact under den) — ikke bestilleren
- Faktura sendes til `invoice.customer_id` — kan være forkert hvis betaler ≠ kunde-på-sagen
- Besigtigelses-rapport kan ikke sendes til både kontakt-på-stedet OG betaler ud fra dokumentet alene
- Opgaver kan ikke kobles til en specifik sag

**Anbefalet handling:**
- Phase 6c: migration tilføjer parti-roller til `invoices`
- Phase 6d: migration tilføjer parti-roller til `offers`
- Sprint 10F (kommende): `customer_tasks.service_case_id` FK
- Sprint 9H Phase A: `customer_documents.service_case_id` FK (migration 00114 kodet, ikke kørt)

**Prioritet:** Kritisk

---

## R2 — Skema-drift: `customer_contacts.role` brugt i kode uden migration i repo

**Berørte tabeller:** `customer_contacts`

**Beskrivelse:** Kode-base refererer eksplicit `customer_contacts.role` med værdier `'billing'`, `'ordering'`, `'site_contact'`, `'primary'`, `'technical'`, `'other'` (defineret som `CUSTOMER_CONTACT_ROLES` i `src/types/customers.types.ts:40`). Kode-kommentaren siger "CHECK constraint i DB" — men der findes **ingen migration i repo** der opretter `role`-kolonnen eller dens CHECK-constraint.

**Konkret brug i kode:**
- `mail-route-resolvers.ts:407`: `.eq('role', 'billing')` (offer routing)
- `mail-route-resolvers.ts:535`: `.eq('role', 'billing')` (invoice routing)
- `mail-route-resolvers.ts:1067`: `.eq('role', 'billing')` (manuel customer mail)
- `mail-recipients.ts:66`: `.eq('role', options.roleFilter)`
- `service-cases.ts:129`: `customer_contacts!service_cases_site_contact_id_fkey(id, name, email, phone, mobile, role)` (select)
- `service-case-site.ts:21-24`: importerer `CUSTOMER_CONTACT_ROLES` + `CustomerContactRole`

**Konsekvens:**
- Hvis prod-DB ikke har kolonnen → alle queries med `.eq('role', ...)` returnerer tom — Mail-routing falder tavst til fallback
- Hvis prod-DB HAR kolonnen (manuelt tilføjet via dashboard) → fungerer, men repo er ude af sync
- Type-safe TS-kode kan kompileres uden runtime-failure før der queries

**Anbefalet handling:** Skriv migration `00115_customer_contacts_role.sql` (additiv, idempotent) der enten:
1. Tilføjer kolonnen hvis den mangler (no-op hvis den allerede findes)
2. Tilføjer CHECK-constraint matchende `CUSTOMER_CONTACT_ROLES`
3. Tilføjer `is_primary → role='primary'`-backfill (kompatibilitet)

**SQL-skitse** (foreslået, IKKE oprettet som fil):

```sql
BEGIN;

-- 1. Tilfoej role-kolonne (idempotent)
ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS role TEXT;

-- 2. CHECK-constraint matchende TS CUSTOMER_CONTACT_ROLES
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_contacts_role_check'
      AND conrelid = 'customer_contacts'::regclass
  ) THEN
    ALTER TABLE customer_contacts DROP CONSTRAINT customer_contacts_role_check;
  END IF;
END $$;

ALTER TABLE customer_contacts
  ADD CONSTRAINT customer_contacts_role_check
  CHECK (role IS NULL OR role IN ('billing','ordering','site_contact','primary','technical','other'));

-- 3. Backfill: is_primary=true → role='primary' (kun hvor role er NULL)
UPDATE customer_contacts SET role = 'primary'
WHERE is_primary = true AND role IS NULL;

-- 4. Index for filtering
CREATE INDEX IF NOT EXISTS idx_customer_contacts_role
  ON customer_contacts(customer_id, role) WHERE role IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

**Prioritet:** Kritisk

---

## R3 — Skema-drift: Migration 00111 (`site_customer_id` + `site_contact_id`) mangler i repo

**Berørte tabeller:** `service_cases`

**Beskrivelse:** Migration 00112 (`00112_service_case_parties.sql:10-13`) refererer eksplicit til "00111 (site_customer_id + site_contact_id) maa vaere koert i prod. Filen ses ikke i repoet". 00112 har defensive DO-block der håndterer både scenarier (kolonne findes / kolonne mangler).

**Konkret brug i kode:**
- `service-case-site.ts` — fuld CRUD på begge felter
- `service-cases.ts:128-129` — joins via `service_cases_site_customer_id_fkey` + `service_cases_site_contact_id_fkey`
- `service-case-route-preview.ts` — Phase 6a læser site fields
- `mail-route-resolvers.ts:660-661` — `resolveBesigtigelseMailRoute` læser site_contact + site_customer
- `components/modules/orders/edit-site-info-dialog.tsx` — UI til redigering
- `src/types/service-cases.types.ts:168-171` — typer

**Konsekvens:**
- Hvis prod har kolonnerne (sandsynligt — UI virker tilsyneladende) → repo er ude af sync, ny prod-deploy fra clean repo ville mangle felterne
- Hvis prod IKKE har kolonnerne → al site_contact/site_customer-funktionalitet er broken

**Anbefalet handling:** Skriv `00115` eller `00111_site_fields_recovery.sql` (samme nummer hvis vi vil bevare oprindelig rækkefølge). Idempotent migration der genskaber felterne sikkert.

**SQL-skitse** (foreslået, IKKE oprettet som fil):

```sql
BEGIN;

-- Site customer (leveringskunde — kan vaere forskellig fra betaler)
ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS site_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL;

-- Site contact (kontaktperson paa stedet)
ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS site_contact_id UUID
    REFERENCES customer_contacts(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_cases_site_customer_id
  ON service_cases(site_customer_id) WHERE site_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_cases_site_contact_id
  ON service_cases(site_contact_id) WHERE site_contact_id IS NOT NULL;

-- Kommentarer
COMMENT ON COLUMN service_cases.site_customer_id IS
  'Leveringskunde / slutkunde hvis forskellig fra betaler. NULL = samme som customer_id.';
COMMENT ON COLUMN service_cases.site_contact_id IS
  'Kontaktperson paa stedet (FK customer_contacts).';

NOTIFY pgrst, 'reload schema';
COMMIT;
```

**Prioritet:** Kritisk

---

## R4 — Dokumenter uden `service_case_id`: migration 00114 oprettet men ikke kørt

**Berørte tabeller:** `customer_documents`

**Beskrivelse:** Migration `00114_customer_documents_service_case_link.sql` ligger i repo men er **ikke kørt i prod** (jf. Sprint 9H-status). Kode i `besigtigelse.ts` insert'er `service_case_id: input.serviceCaseId ?? null` — det vil fejle hvis kolonnen ikke findes.

**Konkret brug i kode:**
- `besigtigelse.ts:276` — INSERT med `service_case_id`
- `besigtigelse.ts` (Phase A `sendExistingBesigtigelsesreport`) — læser feltet
- `incoming-emails.ts` — refererer service_case_id på dokument-rows

**Konsekvens:**
- Indtil 00114 kører i prod: nye besigtigelses-rapporter fejler ved insert (PostgreSQL afviser ukendt kolonne)
- Phase A Send-dialog (kodet, ikke deployet) kræver feltet

**Anbefalet handling:** Kør migration 00114 manuelt i Supabase Dashboard. Lille additiv migration. Lav risiko.

**Prioritet:** Høj (blokerer Sprint 9H Phase A deploy)

---

## R5 — Tasks uden `service_case_id`

**Berørte tabeller:** `customer_tasks`

**Beskrivelse:** `customer_tasks` har kun `customer_id`-FK. Hvis en kunde har 3 aktive sager, kan en opgave ikke spores til den specifikke sag.

**Konsekvens:**
- Opgave-mail kan ikke routes ud fra sagspartner-roller (kender ikke sag)
- Manglende kontekst i daglig drift
- Parallel til work_orders som har `case_id` — uklar opdeling

**Anbefalet handling:** Sprint 10F (kommende) — additiv migration der tilføjer `customer_tasks.service_case_id` UUID NULL FK. Backfill: ingen.

**Prioritet:** Medium

---

## R6 — Inbound/outbound mail-fragmentering

**Berørte tabeller:** `incoming_emails`, `email_threads`, `email_messages`

**Beskrivelse:** Outbound mail (vi sender til kunder) bruger `email_threads` + `email_messages` (migration 00033 + 00070 + 00071). Inbound mail (vi modtager) bruger `incoming_emails` (00049). De er to forskellige datamodeller med:
- Forskellige primær-nøgler (UUID vs UUID)
- Forskellige threading-mekanismer (`offer_id` FK på threads vs `conversation_id` på incoming)
- Forskellige attachment-mønstre (FK vs JSONB-array)
- Ingen unified message-view

**Konsekvens:**
- Kunde-kommunikation er splittet — sælger kan ikke se samlet tråd "alt vi har skrevet og modtaget med X"
- Hvis du svarer på en mail, har du to spor at vedligeholde
- `email_threads.offer_id` er primær FK → tråde bundet til tilbud, ikke sag eller kunde

**Anbefalet handling:** Phase 5 i roadmap — unified `messages` view eller tabel der samler outbound + inbound via `conversation_id` / `internet_message_id`.

**Prioritet:** Medium

---

## R7 — RLS er "authenticated USING(true)" → adgang afhænger af app-lag-disciplin

**Berørte tabeller:** De fleste forretningsdata-tabeller (`customers`, `service_cases`, `customer_documents`, `customer_tasks`, `offers`, `invoices`, ...)

**Beskrivelse:** RLS er enabled på næsten alle tabeller, men policies er typisk `FOR ALL TO authenticated USING(true) WITH CHECK(true)` — dvs. enhver authenticated bruger kan læse/skrive alt på DB-niveau. Adgangsstyring foregår i applikationskode via `getAuthenticatedClientWithRole().hasPermission(...)` + `getCaseScope()`.

**Konsekvens:**
- Hvis en server action mangler permission-check, eksponeres data
- Hvis nogen importerer Supabase-client direkte uden permission-wrapper, omgås kontrollen
- Bug-overflade større end ved RLS-niveau enforcement

**Anbefalet handling:**
- Kort sigt: introducer `withPermission(perm, fn)`-wrapper-pattern så permission-check er obligatorisk
- Lang sigt: RLS-policies pr. tabel der bruger `auth.uid()` + role-lookup
- Audit hvor `createAdminClient` (service-role bypass) bruges

**Prioritet:** Høj

---

## R8 — TS-permissions vs DB-permissions drift

**Berørte tabeller:** `permissions` (00108)

**Beskrivelse:** Migration 00108 introducerede `permissions`-tabel som DB-permissions-katalog. Samtidig er `src/lib/auth/permissions.ts` TS-side source-of-truth. **Ingen synkronisering** mellem de to — kan drifte over tid.

**Konsekvens:**
- En permission tilføjet i TS-matrix vises ikke i DB-tabel (eller omvendt)
- Hvis fremtidig kode læser fra DB-tabel ved runtime, kan permission-check afvige fra hvad UI viser

**Anbefalet handling:**
- Vælg én source-of-truth — anbefaling: TS-matrix (faster, deploy-koblet, type-safe)
- Hvis DB-tabel beholdes: seed via migration der genereres fra TS-matrix
- Slå fast i dokumentation hvor sandheden bor

**Prioritet:** Medium

---

## R9 — Bred service-role brug omgår RLS

**Berørte:** `createAdminClient` brugt i `besigtigelse.ts`, cron-routes, `setup-db`, portal-routes, `incoming-emails.ts`, `auto-tasks.ts`, `auto-case.ts`, `auto-offer.ts`, m.fl.

**Beskrivelse:** `createAdminClient()` instantierer en service-role Supabase-client der bypasser RLS. Brugt legitimt i:
- Cron-jobs (intet user-context)
- Portal-anon (kunde har ikke auth-session)
- Setup-db / migrate-roles (admin tools)

Men også brugt i flere actions hvor det måske ikke er nødvendigt.

**Konsekvens:**
- Hvis en service-role-client eksponeres via en bug → fuld DB-adgang
- Sværere at trace audit-log "hvem læste hvad" — service-role har ingen user_id

**Anbefalet handling:** Audit alle steder `createAdminClient` bruges. Minimer til legitime cases. Dokumentér rationale.

**Prioritet:** Høj

---

## R10 — Migrations-drift: huller, dubletter, manglende filer

**Berørte:** `supabase/migrations/`

**Beskrivelse:**
- **Mangler:** 00011, 00023-00025, 00037-00040, 00111 (refereret af 00112)
- **Dublet-nummer:** 00088 har TO filer (`00088_payroll_and_profitability.sql` + `00088_fix_invoice_snapshot_trigger.sql`) — rækkefølge ikke deterministisk
- **`FULL_MIGRATION.sql`** ligger uden nummer — uklart om brugt
- **`00114`** oprettet men ikke kørt

**Konsekvens:**
- Hvis nogen rejser et clean Supabase-projekt og kører alle migrations sekventielt, kan resultatet ikke matche prod
- Dublet-nummer kan give uventet kørerækkefølge
- Schema-drift mellem dev/staging/prod

**Anbefalet handling:**
- Lokaliser 00111 (sandsynligvis tabt — anbefal: skriv ny som beskrevet i R3)
- Omdøb dublet-00088 (kun hvis sikker — kan have været kørt i prod allerede)
- Beslut om `FULL_MIGRATION.sql` skal arkiveres/slettes
- Tilføj migration 00115 (customer_contacts.role) + kør 00114 → bring repo i sync med prod-forventning

**Prioritet:** Medium

---

## R11 — Mail-cron schedule-inkonsistens

**Berørte:** `vercel.json` + `src/app/api/cron/email-sync/route.ts`

**Beskrivelse:**
- Kode-kommentar (`route.ts:7`): `"Schedule: Every 5 minutes (configurable in vercel.json)"`
- Memory note: `"Cron: /api/cron/email-sync (every 5 min)"`
- **Faktisk `vercel.json:41`**: `"schedule": "0 5 * * *"` (= dagligt kl. 05:00 UTC)

**Konsekvens:**
- Indkommende mails synces kun én gang i døgnet (kl. 05:00 UTC = 06:00 dansk vintertid / 07:00 sommertid)
- Auto-link til kunde, AO-detection, AI-intelligence — alt sker med op til 24 timers forsinkelse
- Brugeren oplever at "mailen er ikke kommet ind endnu" selvom den ER modtaget af Microsoft Graph

**Anbefalet handling:**
- Verificér intentionen med Henrik
- Hvis 5 min-frekvens ønskes: kontrollér Vercel-plan begrænsning (Pro tillader op til 60 cron-invocations/dag i hobby-tier, ubegrænset i Pro). 5 min × 24 timer × 60 = 288 invocations/dag — kræver Pro
- Ret `vercel.json` til `"*/5 * * * *"` ELLER skriv om kommentaren til at matche faktisk daily-frekvens
- Sprint 10A bør ikke ændre dette uden eksplicit godkendelse — det er et adfærdsændrings-call

**Prioritet:** Høj

---

## R12 — `profiles` har ikke FK til `auth.users`

**Berørte tabeller:** `profiles`

**Beskrivelse:** Jf. memory ("profiles table has no FK to auth.users — use enrichWithProfiles helper instead of PostgREST join hints"). Det betyder PostgREST-joins via `!profile_id_fkey` ikke virker — vi bruger custom helper.

**Konsekvens:**
- Kan ikke bruge native joins → mere kompleks query-pattern
- Risiko for orphan profile-rows hvis auth.user slettes
- TS-types-mismatch kan opstå

**Anbefalet handling:** Tilføj FK med `ON DELETE CASCADE`. Bør verificeres at det ikke bryder eksisterende kode.

**Prioritet:** Lav (kendt issue, helper løser problemet)

---

## R13 — Parallelle datamodeller

**Berørte tabeller:** Flere

**Beskrivelse:** Flere sub-systemer har parallelle tabeller med uklare regler om hvilken at bruge:

| Domæne | Tabeller | Beslutning kræves |
|---|---|---|
| Tid | `time_entries` (legacy 00006) + `time_logs` (ny 00086) | Hvilken er kanon? Memory siger "00006 bevaret pga. dependencies" |
| Tilbud | `offers` (00005) + `sent_quotes` (00051) | Hvad er en `sent_quote` vs et `offer`? |
| Dokumenter | `customer_documents` (00052) + `service_case_attachments` (00066) + `incoming_emails.attachment_urls` (JSONB) | Hvor skal hvad ligge? |
| Opgaver | `customer_tasks` (00053) + `work_orders` (00086) | Konceptuelt forskellige, men brugere kan forveksle |
| Calculator | `calculator-form.tsx` + `calculator-form-v2.tsx` (UI), Kalkia + classic calculator | Konsolider eller dokumentér |

**Anbefalet handling:** Formaliser regler i `docs/` for hvert par. Hvor muligt: konsolider via migration + deprecation-flag.

**Prioritet:** Medium

---

## R17 — `attachments`-bucket er `public=true` i production (Sprint 11C-fund)

**Berørte:** Supabase Storage `attachments`-bucket + 8 kode-flows

**Beskrivelse:** Production-state for `attachments`-bucket er `public=true`, hvilket betyder at filer kan tilgås via direkte URL `https://<ref>.supabase.co/storage/v1/object/public/attachments/<path>` **uden authentication**. Migration 00113 i repo siger `public=false` men har `ON CONFLICT (id) DO NOTHING` saa bucket-config aldrig blev opdateret. Denne afvigelse blev opdaget i Sprint 11C-audit.

**Berørte filer i prod:**
- `profiles.avatar_url` (alle brugere)
- `company_settings.company_logo_url`
- `sent_quotes.pdf_url` (kunde-emails med tilbud)
- `customer_documents.file_url` (besigtigelser, outbound-attachments, manuelle uploads)
- `incoming_emails.attachment_urls` (JSONB-array)
- `files.url` (generic file system)
- `besigtigelse-images/`, `email-attachments/`, `fuldmagt/`, `lead-attachments/`

**Konsekvens:**
- Filer er teknisk offentligt tilgængelige hvis URL'en kendes
- Path indeholder customer-UUID (122 bits entropi — svært at gætte, men ikke umuligt hvis URL leakes)
- GDPR-bekymring for PDF'er med kunde-data (besigtigelses-rapporter inkl. signatur, adresse, billeder)
- En signed-URL der lækker i en email-screenshot kan stadig hentes selv efter dens "udløb", hvis bucket er public

**Anbefalet handling:**
Dedikeret sprint kan ikke addresseres som lille fix.

Se **Sprint 11F — Storage Security Hardening** (planlagt næste storage-sikkerhedssprint):
1. Refaktorér 8 `getPublicUrl()`-kald (i `settings.ts`, `quote-generator.ts`, `email-attachment-storage.ts`, `files.ts`, `outbound-attachments.ts`, `incoming-emails.ts`) til `createSignedUrl()` med passende TTL
2. Avatar/logo-proxy-endpoint (`/api/avatars/[userId]`, `/api/company-logo`) der streamer fra storage med fresh signed URL
3. Backfill eller lazy-regenerering af eksisterende DB-rows der indeholder public URLs
4. Skriv `00118_secure_attachments_bucket.sql` der sætter `public=false`
5. Smoke-test: avatar, logo, quote-PDF-mail-links, email-attachments, customer-documents, besigtigelse, fuldmagt

**Hvorfor ikke i Sprint 11C:** Audit (11C Trin 2) viste 8 distinkte flows der ville brække ved umiddelbar `public=false`-ændring. Avatars/logo/quote-PDF-links er kritiske user-facing flows.

**Prioritet:** Høj (sikkerhed) men kompleks. Planlagt til Sprint 11F.

---

## Risiko-resumé

| ID | Område | Prioritet | Status |
|---|---|---|---|
| R1 | customer_id-only flows (Mikma-scenariet) | Kritisk | Åben |
| R2 | `customer_contacts.role` skema-drift | Kritisk | ✅ Lukket (Sprint 10B: 00116) |
| R3 | 00111 site-felter mangler i repo | Kritisk | ✅ Lukket (Sprint 10B: 00115) |
| R4 | 00114 customer_documents.service_case_id ikke kørt | Høj | ✅ Lukket (Sprint 10B: 00117) |
| **R17** | **`attachments`-bucket public=true (storage-sikkerhed)** | **Høj** | **Åben → Sprint 11F** |
| R7 | RLS = "authenticated USING(true)" | Høj | Åben |
| R9 | Bred service-role brug | Høj | Åben |
| R11 | Mail-cron schedule-inkonsistens | Høj | Åben |
| R5 | customer_tasks uden service_case_id | Medium | Åben |
| R6 | Inbound/outbound mail-fragmentering | Medium | Åben |
| R8 | TS/DB permissions drift | Medium | Åben |
| R10 | Migrations-drift (huller, dubletter) | Medium | Delvist (Sprint 11C arkiverede FULL_MIGRATION) |
| R13 | Parallelle datamodeller | Medium | Åben |
| R12 | profiles uden FK til auth.users | Lav | Åben |
