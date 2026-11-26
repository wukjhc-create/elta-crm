# Parter — Fase B præflight (2026-11-25)

Status: **AFSLUTTET og AKTIV i Production 2026-11-26** (Henrik: funktionelt godkendt; TECH-PARTY-ROLE-1 rettet i prod f4910c93). Kode 50776519 + 00255 i prod;
`PARTIES_UI_ENABLED=true` (Vercel, KUN Production, type Config) skal forblive TIL. Udrulning: A kode med flaget FRA →
B inert-verifikation → C 00255 → D post-verifikation → E STOP → F flag TIL efter Henriks særskilte godkendelse (se §13).
Løbende verifikation: `prod-verify-00255 post --expect active`; kontrolleret prod-smoke: `PARTY_PHASE_B_PROD_SMOKE.md`.
Prod-rollback må IKKE køres som test — kun rollback-only (transaktion uden commit) i `scripts/prod-00255-dryrun.ts`;
`docs/runbooks/sql/00255_rollback.sql` køres kun ved en egentlig rollback-beslutning.

## 0. Henriks beslutninger (2026-11-25) og hvordan de er implementeret
1. **cases.edit** må oprette/koble den nødvendige part KUN via sagsdeltager-flowet for sagens egne kunder/kontakt:
   `add_case_participant_for_register` (kunde = sagens `customer_id/end_customer_id/orderer_customer_id/payer_customer_id/
   purchased_from_customer_id/site_customer_id`; kontakt = `site_contact_id` eller kontakt hos en af dem; synlig sag + synlig
   kunde). `add_case_participant` kobler en eksisterende synlig part (ingen oprettelse). Fri oprettelse (`create_party`),
   redigering (`update_party`), `ensure_register_party`, relationer og leverandør/lead/medarbejder kræver `parties.manage`.
   → **Afvigelse fra forslaget:** `ensure_register_party` kræver nu KUN parties.manage (cases.edit-vejen er flyttet ind i
   `add_case_participant_for_register`), så cases.edit ikke bliver en indirekte generel skrive-ret.
2. **Montør** ser kun kunde-parter i eget kundescope + parter der deltager på egne/tildelte sager (00254's
   `party_visible_to_me`, uændret); intet partsregister, ingen skrivning.
3. **Udrulning** som ovenfor; flag ON er et selvstændigt godkendelsestrin.
4. **D-1** admin/serviceleder skriver via RPC; salg/bogholderi read-only; montør scoped read; INGEN rolle har direkte
   INSERT/UPDATE (heller ikke admin). **F-6** bevist (afsnit 9). **F-1** urørt.

Øvrige afvigelser/tilføjelser i forhold til forslaget:
- **`update_party`** (B-1 redigering: navn, organisation, verificerede e-mails/domæner, CVR) — 8 RPC'er i alt, ikke 6.
- Audit skrives af RPC'erne selv i `audit_logs` (party_created/party_updated/party_relationship_set/_ended/
  case_participant_added/_ended) — ikke via `insertAuditRow`.
- Dublet-søgningen matcher også en register-part på registrets CVR (leverandør), e-mail og navn (kunde/leverandør) —
  fundet under staging-prøven (en register-part har typisk ingen verificerede felter).
- `parties_vat_digits` CHECK (CVR kun cifre 8–14) ud over unikt indeks.
Forudsætninger i prod: 00254 (inert fundament, 2026-11-25), Stage A live, Stage B FRA.

Faste beslutninger (Henrik 2026-11-25):
- **D-1:** salg og bogholderi må LÆSE hele den interne partsliste. Ingen direkte UPDATE, ingen DELETE, ingen generisk direkte
  INSERT. Oprettelse sker kun gennem et kontrolleret applikationsflow/RPC.
- **F-1:** HÅRD blokering for enhver udvidelse af portal-synlighed → **holdes helt uden for fase B** (afsnit 7).
- **F-6:** brugeres oprettelse af parter må ikke kræve at den nye række returneres → al oprettelse via RPC der returnerer id'et
  som funktionsværdi (afsnit 4).

## 1. Scope

**Fase B = intern partsforvaltning.** Personalet kan oprette/koble parter, registrere relationer og sætte sagsdeltagere —
alt internt. Intet bliver synligt for nogen ekstern part.

Inden for:
- **B-1 Partsforvaltning:** opret part (person/organisation), kobl til eksisterende register (kunde, kontakt, leverandør,
  lead), verificerede e-mails/domæner/CVR, organisationstilknytning. Dublet-værn (afsnit 5).
- **B-2 Relationer:** manuel relation (kunde, lead, leverandør, samarbejdspartner, underleverandør, producent, intern) med
  den indloggede bruger som bekræfter; afslut/afvis. Register-relationer oprettes deterministisk sammen med register-parten.
- **B-3 Sagsdeltagere:** tilføj/afslut deltager med rolle på en sag (kunde, slutkunde, ordregiver, betaler, kontakt på
  stedet, samarbejdspartner, leverandør, underleverandør, producent, intern).
- **UI:** panel "Parter & relationer" på kundekortet og panel "Sagsdeltagere" på ordre-/sagssiden. Kun læsning for D-1-roller.
- **Feature-flag** `PARTIES_UI_ENABLED` (standard FRA): panelerne og handlingerne er slukket indtil flaget tændes.

Uden for (uændret efter fase B):
- Offentliggørelse (`publish_external`/`revoke_external_publication`) — ingen UI, ingen kaldere.
- `external_feed` / kunde-, partner- og leverandørportal — ingen læsevej tilføjes (F-1).
- `customer_documents.visible_in_portal` og alle eksisterende portal-læseveje — urørt.
- Stage A / `reception_ingest` / mail-sync / leverandørværn — urørt. Kommunikationsklassen sættes ikke automatisk
  (deterministisk klasse fra Stage A kræver omdefinering af `reception_ingest` → egen fase).
- Manuel klasse-styring i Henvendelser — udskudt (valgfri senere delfase; DB-værnet findes allerede).
- AI-forslag til relationer/parter — ingen.
- Backfill: ingen automatisk oprettelse af parter for de 127 eksisterende kunder; parter oprettes ved behov af et menneske.
- Sammenlægning af dublet-kunder (5 e-mail-grupper / 18 rækker, 3 navnegrupper i prod) — ikke en del af fase B.
- `service_cases.customer_id/site/payer/orderer/end/purchased_from` (Sagspartnere) — bevares; deltagere er additive.

## 2. Filer

Nye:
- `supabase/migrations/00255_party_write_rpcs.sql` — RPC'er, nedlukning af direkte skrivning, CVR-unikhed (afsnit 3)
- `docs/runbooks/sql/00255_rollback.sql`
- `src/lib/parties/party-dedupe.ts` — ren normalisering (e-mail, domæne via `lib/email/free-mail-domains.ts`, CVR, navn)
- `src/lib/parties/feature-flag.ts` — `PARTIES_UI_ENABLED`
- `src/lib/actions/parties.ts` (`'use server'`) — `listCustomerParties`, `searchParties`, `createPartyAction`,
  `ensureRegisterPartyAction`, `setRelationshipAction`, `endRelationshipAction`, `listCaseParticipants`,
  `addCaseParticipantAction`, `endCaseParticipantAction`. Hver handling: flag-tjek → `requirePermission`/`hasPermission`
  (check:rbac) → **brugerens klient** `.rpc(...)` (DB'en tjekker igen). Ingen admin-klient i skrivestier. Audit via
  `insertAuditRow`.
- `src/components/modules/parties/customer-parties-panel.tsx`, `case-participants-panel.tsx`, `party-picker-dialog.tsx`
  (søg/vælg/opret med dublet-dialog)
- Tests/prøver: `scripts/party-phase-b-test.ts` (dedupe, flag, gates, statisk: ingen portal-/reception-fil ændret, ingen
  `publish_external`/`external_feed`-kalder i app-kode), `scripts/test-harness/party-00255-probe.ts` + `cli.ts`-kommandoer
  (`party-00255-probe|app|rollback-proof|acl`), UI-harness-tests (nye U-numre: panel vises/skjules efter flag og rolle),
  `scripts/prod-verify-00255.ts pre|post`, `scripts/prod-00255-dryrun.ts` (rollback-only som 00254).

Ændrede:
- `src/app/dashboard/customers/[id]/customer-detail-client.tsx` — panel i "Oversigt" efter Kontaktpersoner (~l. 708)
- `src/app/dashboard/customers/[id]/page.tsx` — evt. forudindlæsning i eksisterende `Promise.all`
- `src/app/dashboard/orders/[id]/order-detail-client.tsx` — panel under "Sagspartnere" (~l. 560)
- `scripts/test-harness/party-00254-probe.ts` — direkte INSERT-prøver skal nu forvente afvisning og bruge RPC'erne
- `CLAUDE.md`-note, `COMMUNICATION_PARTY_AUDIENCE_MODEL.md`

Bevidst urørte (statisk test): `src/lib/actions/portal.ts`, `partner-portal.ts`, `fuldmagt.ts`, `src/app/portal/**`,
`src/app/partner/**`, `src/app/api/portal/**`, `src/app/api/partner/**`, `src/lib/reception/**`, `src/lib/services/email-*`,
`src/lib/email/supplier-senders.ts`, `customer-documents`-kode, `src/lib/parties/audience.ts` (feed-læser forbliver uden kaldere).

Ingen nye rettighedsnøgler. Ingen ændring af wave-tabellernes politikker (customers m.fl.) → check:rls-matrix uændret.

## 3. Database (00255 — kræver egen godkendelse)

RPC'er (alle `SECURITY DEFINER`, `SET search_path = public`; `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`;
`GRANT EXECUTE … TO authenticated`; hver kræver `auth.role() = 'authenticated'` + `auth.uid()`; audit-række i `audit_logs`):

| RPC | Krav | Gør |
|---|---|---|
| `create_party(kind, display_name, organisation_party_id, verified_emails, verified_domains, vat_number, confirm_new_reason)` → jsonb | `parties.manage` | Normaliserer; dublet-tjek (afsnit 5); returnerer `{status:'created', party_id}` eller `{status:'duplicate_candidates', candidates:[{id, display_name, match}]}` uden at oprette. `confirm_new_reason` (påkrævet tekst) opretter alligevel; begrundelsen auditeres |
| `ensure_register_party(register, register_id)` → jsonb | `parties.manage`, ELLER (`cases.edit` og registerrækken er synlig for brugeren) | Idempotent: findes parten for kunden/kontakten/leverandøren/leadet → returnér den; ellers opret med `display_name` fra registret + `register`-relation (aktiv). Ingen dublet mulig (UNIQUE pr. registerkolonne + `ON CONFLICT`) |
| `set_party_relationship(party_id, relationship, evidence)` → uuid | `parties.manage` + part synlig | Manuel, `status='active'`, `confirmed_by = auth.uid()` (eksisterende værn håndhæver det) |
| `end_party_relationship(relationship_id, status)` | `parties.manage` | `ended`/`rejected`; kilde/type uændrelig (værn) |
| `add_case_participant(case_id, party_id, role, note)` → uuid | (`parties.manage` ELLER `cases.edit`) + `case_visible_to_me` + `party_visible_to_me` | Idempotent pr. (sag, part, rolle) |
| `end_case_participant(participant_id)` | samme | Sætter `ended_at` |

Nedlukning af direkte skrivning (D-1 + F-6):
- `REVOKE INSERT, UPDATE ON parties, party_relationships, case_participants FROM authenticated`; `DROP POLICY` for
  `parties_insert/_update`, `party_relationships_insert/_update`, `case_participants_insert/_update`. Ingen DELETE-grant
  (som i dag). Resultat: **ingen rolle — heller ikke admin — skriver direkte; kun via RPC'erne.**
- SELECT-politikkerne fra 00254 bevares uændret (`party_visible_to_me`, `case_visible_to_me`) = D-1-læsning.
- service_role beholder sine 00254-grants (bruges ikke af app-kode i fase B; prøven beviser at intet app-kodested skriver
  med admin-klienten).
- Ny `CREATE UNIQUE INDEX parties_vat_uniq ON parties (vat_number) WHERE vat_number IS NOT NULL` (CVR normaliseret til
  cifre af RPC'en; i dag 0 parter → ingen konflikt).
- Ingen ændring af triggere, `external_*`, `conversations`, eksisterende tabeller eller wave-politikker.

## 4. Oprettelse uden RETURNING (F-6)
- Klienten kalder `supabase.rpc('create_party' | 'ensure_register_party', …)`; id'et kommer som **funktionens returværdi**
  (beregnet inde i SECURITY DEFINER-funktionen) — ingen `INSERT … RETURNING` gennem RLS, ingen `.insert().select()`.
- Direkte INSERT er desuden umulig (grant fjernet), så F-6-mønsteret kan ikke opstå ved et uheld.
- Den efterfølgende læsning (panelet genindlæses) går gennem den normale SELECT-politik i et nyt udsagn → rækken er synlig.
- Statisk test: ingen `.from('parties'|'party_relationships'|'case_participants').insert|update|upsert` i `src/`.

## 5. Dublet-værn
1. **Register-parter:** UNIQUE på `customer_id`/`customer_contact_id`/`supplier_id`/`lead_id`/`profile_id` (00254) +
   `ensure_register_party` er idempotent → én part pr. registerrække, også ved dobbeltklik/samtidige kald.
2. **Frie parter (partner/producent/underleverandør uden register):** `create_party` tager
   `pg_advisory_xact_lock(hashtext('party:' || nøgle))` pr. normaliseret nøgle og søger kandidater på:
   CVR (eksakt, cifre) · verificeret e-mail (eksakt, små bogstaver) · verificeret domæne (eksakt; gratis-/privatdomæner
   som gmail.com afvises som "verificeret domæne" af server-handlingen via `isFreeMailDomain`) · normaliseret navn (små
   bogstaver, mellemrum samlet, selskabsform ApS/A/S/I/S/IVS/K/S fjernet). Kandidater → ingen oprettelse; UI viser dem
   ("Brug eksisterende" / "Opret alligevel med begrundelse").
3. **CVR hård unikhed** i DB (indeks ovenfor).
4. **Eksisterende dublet-kunder** (18 rækker deler 5 e-mails i prod): fase B lægger dem ikke sammen. Én part pr.
   kunderække (1:1). Ved `ensure_register_party` vises en advarsel hvis en anden kunde med samme e-mail allerede har en
   part — oprydning af kunder er en separat beslutning.

## 6. Roller (standard; overrides virker pr. nøgle)

| Rolle | Se parter | Opret/ret parter & relationer | Sagsdeltagere: se | Sagsdeltagere: tilføj/afslut |
|---|---|---|---|---|
| admin | alle | ja (RPC) | alle sager | ja (RPC) |
| serviceleder | alle | ja (RPC) | alle sager | ja (RPC) |
| salg | alle — KUN læsning (D-1) | nej | sager i eget scope | nej |
| bogholderi | alle — KUN læsning (D-1) | nej | alle sager (cases.view.all) | nej |
| montør | kun kunde-parter i eget kundescope + parter der deltager på sager i eget scope | nej | sager i eget scope | nej |
| anon / portal-tokens | intet | intet | intet | intet |
| service_role (baggrund/AI) | (læser ikke i fase B) | ingen app-kodevej | — | — |

`ensure_register_party` for en kunde må også kaldes af `cases.edit` (standard: admin/serviceleder) når en deltager tilføjes.
Ingen rå rolle-tjek — kun `user_has_permission`.

## 7. F-1
Holdes **helt uden for fase B**: ingen portal-/partner-kode, ingen læsning af `external_feed`, ingen ændring af
`visible_in_portal`, ingen offentliggørelses-UI. Statisk test fejler hvis en portalfil eller `audience.ts`-kalder ændres/
tilføjes. Prod-eksponering måles før/efter (forventet uændret: 15 kundeportal-dokumenter, 3 partnerportal-dokumenter,
0 krydseksponering). F-1 forbliver HÅRD blokering for fase C (portal-feed / partner-dokumenter som offentliggørelser).

## 8. Udrulning (hvert trin kræver godkendelse)
1. Staging: 00255 + kode bag flaget; prøver (afsnit 9).
2. Prod: kode med `PARTIES_UI_ENABLED` FRA (inert: handlingerne returnerer "ikke aktiveret", panelerne vises ikke).
3. Prod: `prod-00255-dryrun.ts` (rollback-only) → 00255 efter en mail-sync → post-tjek.
4. Prod: tænd `PARTIES_UI_ENABLED` (Vercel-env + redeploy) — særskilt godkendelse.
Kompatibilitet: gammel kode skriver aldrig i partstabellerne → 00255 kan også køres før koden; ny kode med flag FRA kalder
ingen RPC.

## 9. Verificering

Før deploy (staging + lokalt):
- tsc, check:rbac (alle nye handlinger gated), check:rls-matrix, `party-phase-b-test`, `party-audience-test`,
  portal-security, effective-permissions, reception/hub, stage-a-email-ingest, supplier-guard, sync-lease
- staging `party-00255-probe` (rollback-only, rigtige profiler): direkte INSERT/UPDATE afvist for ALLE roller inkl. admin og
  service_role; RPC'erne pr. rolle (admin/serviceleder ja; salg/bogholderi/montør nej; overrides virker); salg/bogholderi
  SELECT ja; dublet-kandidater (CVR/e-mail/domæne/navn), `confirm_new_reason` påkrævet; to samtidige `create_party` med
  samme nøgle → én part; `ensure_register_party` idempotent; F-6-vejen (RPC returnerer id); ingen offentliggørelser
  oprettet; feeds stadig tomme
- staging `party-00255-app` via PostgREST (5 roller) + UI-harness (panel efter flag/rolle; ingen skriveknapper for D-1)
- staging Stage A 40/40, supplier-guard 14/14, party-00254-probe (opdateret), rollback-proof for 00255
- prod `prod-00255-dryrun.ts` (rollback-only): præcis krop, struktur-/datafingeraftryk = før efter rollback-SQL, funktions-ACL
  (service_role/anon intet), Stage A-kompatibilitet

Efter deploy:
- Vercel Production-deployment = success for SHA'en
- `prod-verify-00255 post`, `prod-db-audit` (0), fingeraftryk (kun 00255-objekter + fjernede insert/update-politikker)
- `prod-stage-a-ops` 0 kritiske; `prod-party-00254-baseline` portaleksponering uændret; `external_publications` = 0
- efter flag ON: røgtest som admin (opret part → dublet-dialog → deltager), som salg (kun læsning), som montør (intet)

## 10. Rollback
- Kode: revert merge-commit (eller sluk `PARTIES_UI_ENABLED`) → panelerne væk; RPC'erne har ingen kaldere.
- 00255: `00255_rollback.sql` — `DROP` de 6 RPC'er + CVR-indekset; genskab 00254's insert/update-politikker og grants
  præcist (tekst fra 00254). Oprettede parter/relationer/deltagere bliver liggende (interne, eksternt usynlige); de kan
  fjernes særskilt hvis ønsket. Bevises rollback-only på staging og prod (struktur-md5 = før).
- Ingen af trinene rører Stage A, portaler eller eksisterende kunde-/sagsdata.

## 11. Stadig inert efter fase B
- `external_publications` (0 rækker), `publish_external`/`revoke_external_publication` (ingen kaldere), `external_feed` /
  `readExternalFeed` (ingen kaldere)
- kunde-, partner- og leverandørportal: uændrede (F-1 urørt, stadig HÅRD blokering)
- `conversations.source_party_id/communication_class/_source`: stadig NULL/unknown/none (ingen automatik, ingen UI)
- AI-relationsforslag: ingen; Stage A/B: uændret (B FRA)
- Ingen backfill; ingen sammenlægning af kunder

## 12. Åbne spørgsmål til Henrik
1. Må `cases.edit` (standard admin/serviceleder) oprette register-parter for synlige kunder via `ensure_register_party` når de
   tilføjer en sagsdeltager — eller kun `parties.manage`? (Forslag: ja, idempotent og registerbundet.)
2. Montør ser parter der er deltagere på montørens egne sager (00254-adfærd). OK? (Forslag: ja — hvem er på stedet.)
3. Feature-flag-udrulning (kode FRA → 00255 → flag ON) — OK?

## 13. Udrulningslog
- 2026-11-25 staging: 00255 anvendt. `party-00255-probe` 50/50 (rollback-only), `party-00255-rollback-proof` 5/5,
  `party-00255-app` 20/20 (inkl. 3 samtidige create_party → 1 oprettet), `party-00254-probe` 37/37 (nu via RPC'er),
  U270 flag TIL + FRA, smoke 15/15, Stage A 40/40, supplier-guard 14/14.
- A: kode 50776519 → main, Vercel Production success, `PARTIES_UI_ENABLED` ikke sat (FRA).
- B: inert — `prod-verify-00255 pre` 4/4 (0 parter, 0 party-audit), Stage A 0/0, portaleksponering 15/3/0.
- C: `prod-00255-dryrun` 61/61 (rollback-only, 4,3 s; struktur-md5 af hele public + 19 data-fingeraftryk = før efter
  rollback-SQL) → `prod:apply-migration 00255` COMMIT.
- D: `prod-verify-00255 post` 7/7, `prod-verify-00254 post` 8/8, `prod-db-audit` 0/0/0 (efter at auditens auth-regex lærte
  `user_has_permission(`/`_party_require_user(`), Stage A 0/0, portaleksponering 15/3/0, 0 offentliggørelser.
- E: STOP. F (flag ON) afventer Henriks særskilte godkendelse.
- F 2026-11-26 (Henriks godkendelse): første "flag sat" virkede ikke — variablen var aldrig gemt i Vercel-projektet (hverken
  projekt- eller shared-variabel) og Production kørte stadig 04:44-deployet af `5b19b5db`. Rettet i Vercel-UI: oprettet
  `PARTIES_UI_ENABLED=true`, type Config, KUN Production → redeploy af den aktuelle Production-deployment (main `5b19b5db`,
  2FA af Henrik) → Ready/Production på `elta-crm.vercel.app`. Lære: tjek altid i Vercel at variablen er gemt OG at et
  nyt Production-deploy er Ready, før panelerne testes (et flag virker først i et deploy bygget/startet efter det er gemt).
- F read-only før skrivning: Stage A 0/0, `prod-db-audit` 0/0/0, portal 15/3/0, `prod-verify-00255 post` 7/7, 0 offentlig-
  gørelser, 0 fejl/advarsler i `system_health_log` (6 t), nyt snapshot.
- F UI-smoke (admin, i den indbyggede browser, testkunde C000008 / testsag SVC-01006 — Henrik bekræftede intern testkunde):
  kundekort "Parter & relationer" vist → "Registrér som part" (Person, relation Kunde); sag "Sagsdeltagere" vist → "Fra
  sagen" (rolle sat manuelt til Kunde; standard var Samarbejdspartner, se TECH-PARTY-ROLE-1) → "Ny part" med navnevariant →
  dublet-dialogen viste den eksisterende part → annulleret uden "Opret alligevel".
- F verifikation: `prod-party-activation-check verify` 7/7 — præcis 1 part (admin), 1 register-relation "customer", 1
  deltager (Kunde, aktiv), 2 audit (`party_created`, `case_participant_added`, aktør admin), dublet-forsøg 0 rækker, 0
  ændrede/slettede eksisterende rækker i 13 overvågede tabeller. Montør rollback-only 4/4 (sag/kunde uden for scope → ser
  0; alle 8 RPC'er 42501; direkte INSERT 42501). Salg ikke testet i prod (ingen salg-testprofil; rolleændring forbudt) →
  staging-bevis gælder (probe 50/50, app 20/20, U270). Efter: Stage A 0/0, db-audit 0/0/0, portal 15/3/0, 0 offentlig-
  gørelser, 0 Phase B-serverfejl.
- Afslutning 2026-11-26: `prod-verify-00255` understøtter nu inert OG aktiv drift (`--expect inert|active`; aktiv = fuld
  integritets-/audit-/dublet-/reference-kontrol, ikke "vilkårligt antal rækker"): prod aktiv 20/20, staging inert 12/12
  (`cli.ts verify-00255 --expect inert`), fixture-test 60/60 (`scripts/verify-00255-core-test.ts`).
- Testdata BEHOLDES som interne smoke-testdata: C000008 / SVC-01006 + 1 part, 1 relation, 1 deltager, 2 audit-rækker.

## 14. Kendte begrænsninger efter aktivering
- F-1 er stadig HÅRD blokering: ingen offentliggørelser/portaludvidelse (0 `external_publications`), ingen fase C.
- Salg er ikke prøvet i prod (mangler salg-testprofil — TECH-TEST-SALES-1); staging-beviserne gælder.
- "Fra sagen" forvælger rollen Samarbejdspartner i stedet for registerets standardrolle, når der kun er én valgmulighed
  (TECH-PARTY-ROLE-1 — rettet i prod 2026-11-26, f4910c93: "Fra sagen" forvælger nu sagens rolle, fx Kunde).
- Konsolfejl React #418/#419 + én HTTP 400 set én gang i prod-sessionen (ikke reproduceret på Phase B-siderne) →
  TECH-HYDRATION-1 / TECH-HTTP400-1.
