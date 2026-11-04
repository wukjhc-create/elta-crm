# Telefoni-persistens for Relatel — 00247 (staging; prod afventer godkendelse)

**Status:** omskrevet 2026-11-03 (stabilitets-/sikkerhedsgennemgang). Erstatter Groks udkast med én tabel
`telephony_events`. Intet er anvendt på staging eller prod. Designretningen er accepteret af Henrik 2026-11-03.
**00247 = `supabase/migrations/00247_telephony_persistence.sql`, anvendt på STAGING 2026-11-03 — IKKE på prod** (se
"Migration 00247" nedenfor). Prod kræver Henriks godkendelse pr. migration. Relatel, webhook-registrering, opkald, SMS og
Telegram forbliver slået fra; intet kalder ingest-funktionen endnu.

## Hvorfor udkastet ikke var nok

| Punkt i udkastet | Problem | Her |
|---|---|---|
| Én række pr. hændelse, match pr. hændelse | Et opkald giver 2–4 hændelser (started/answered/ended/voicemail); en rettelse skulle ramme flere rækker, og status ("ubesvaret?") kræver at man samler dem | `telephony_calls` (én række pr. opkald, match her) + `telephony_events` (rå livscyklus, kun service_role) |
| `has()` → `put()` i `ingest.ts` | Kapløb: to samtidige webhook-forsøg passerer begge `has()` | Idempotens i DB: `UNIQUE (provider, provider_event_id)` + `ON CONFLICT DO NOTHING` i én funktion |
| Ubekræftede numre ses med `customers.view.all` | Giver også salg og bogholderi alle ukendte (ofte private) numre | Egen nøgle `calls.view_unmatched` (standard admin/serviceleder = som `inbox.view`) |
| Bekræftede opkald ses af alle med kundescope | Montør ville se alle opkald på sine kunder; ingen måde at fratage pr. medarbejder | `calls.view` (standard admin/serviceleder/salg) **og** kundescope |
| Ingen medarbejder-tilknytning | Kan ikke vise "hvem tog opkaldet" | `provider_employee_id` (rå) + `employee_profile_id` via `telephony_employee_links` |
| `sms.*` i samme tabel | SMS er ikke godkendt | Kun opkald/telefonsvarer; SMS-hændelser afvises af ingest |
| Telefonsvarer = bool | Intet om indhold | Kun metadata; ingen lyd-URL, ingen transskription (kolonnen findes ikke) |
| Ingen rettelse/audit | "Bekræftes af et menneske" uden sti | Kontrolleret server-sti + audit, korrektion og "afvis forslag" |

## Låste produktbeslutninger (Henrik 2026-11-03)

| # | Beslutning | Hvor i designet |
|---|---|---|
| 1 | Ubekræftede/ukendte numre ses KUN af admin + serviceleder, via egen effektiv nøgle | `calls.view_unmatched` (standard admin/serviceleder); SELECT-politikkens første gren |
| 2 | Montør: ingen opkaldshistorik som standard; tildeles den senere, kun kunder/sager i effektivt OWN/RELATED-scope | `calls.view` ikke i montørens standarder; anden gren kræver `customers.view.all` ELLER `my_customer_scope_ids()` |
| 3 | Ubekræftede opkald gemmes i 90 dage | Oprydnings-cron (bygges med migrationen) sletter `customer_id IS NULL` ældre end 90 dage; bekræftede følger kunden |
| 4 | Kunde-match bekræftes ALDRIG automatisk — heller ikke ved præcis ét match | Kun `suggested_customer_id`; `customer_id` sættes kun af `confirmCallMatch` (menneske) |
| 5 | Tvetydigt match: ingen kunde vælges | `match_status = 'ambiguous'`, kun antal gemmes |
| 6 | Webhook/service_role vælger aldrig tavst en kunde eller sag | `telephony_ingest_event` har ingen kunde-/sagsparametre |
| 7 | Lagring opretter ALDRIG automatisk tilbageringning, påmindelse, Telegram-hændelse, SMS eller kundekommunikation | Ingest skriver kun `telephony_calls`/`telephony_events`; `processMissedCall`/`syncMissedCalls` udfases |
| 8 | Tilbageringning kun ved eksplicit CRM-handling | Klik → normal opgave-handling med `reminder_at = NULL` |
| 9 | Telefonsvarer: kun metadata; ingen optagelse/transskription som standard | Ingen lyd-/tekstkolonner |
| 10 | Rettelse er auditeret og samtidighedssikker | `confirmCallMatch`/`rejectCallMatch`: optimistisk lås + `audit_logs` |

## Beslutninger — begrundelse (punkterne ovenfor er låst)

1. **Hvem ser ubekræftede numre?** Kun `calls.view_unmatched` (standard admin + serviceleder). Salg/bogholderi/montør
   ser dem ikke, medmindre de får nøglen pr. medarbejder. "Ubekræftet" = `customer_id IS NULL` (også forslag/tvetydige).
2. **Følger et matchet opkald kundens scope?** Ja: `calls.view` OG (`customers.view.all` ELLER kunden ∈
   `my_customer_scope_ids()`). Ingen egen scope-model for opkald.
3. **Montør?** Ingen `calls.view` som standard. Tildeles den pr. medarbejder, ser montøren kun opkald på kunder i
   eget/relateret scope (aldrig ubekræftede).
4. **Forkert match rettes** via server-handling `confirmCallMatch` / `rejectCallMatch` (nøgle `calls.match`, standard
   admin/serviceleder/salg): brugeren skal kunne se opkaldet og målkunden (og sagen) med sin egen klient (RLS); skrivning
   via service-role med optimistisk lås (`customer_id IS NOT DISTINCT FROM <forventet>`); `audit_logs` med fra/til-id'er.
   "Afvis" sætter `customer_id = NULL`, `match_status = 'rejected'` (foreslås ikke igen).
5. **Webhook/service-role vælger aldrig en kunde.** Ingest sætter ALDRIG `customer_id`. Med
   `TELEPHONY_MATCH_MODE=suggest` (standard `off`) udfyldes kun `suggested_customer_id` ved præcis én kunde; flere →
   `ambiguous` + antal (ingen id-liste gemmes); nul → `unmatched`. Kun et menneske bekræfter (som `MAIL_AUTOLINK_MODE`).
6. **Idempotente retries:** `UNIQUE (provider, provider_event_id)`; opkaldet nøgles på `(provider, provider_call_id)`;
   ude-af-rækkefølge-hændelser flettes monotont (tidligste start, første svar, seneste slut).
7. **Ingen opgaver/påmindelser fra lagring.** Ingest skriver kun `telephony_calls`/`telephony_events`.
   `processMissedCall`/`syncMissedCalls` (i dag ikke kaldt nogen steder) må ikke kobles på webhooken.
8. **Ingen Telegram-/påmindelses-sideeffekter.** En tilbageringning oprettes kun ved et klik ("Opret tilbageringning")
   via den normale opgave-handling med `reminder_at = NULL` (assistentens dispatcher vælger alle `customer_tasks` med
   `reminder_at`, uanset `auto_rule`). `ASSISTANT_TELEGRAM_ENABLED` forbliver fra.
9. **Retention (låst):** 90 dage for `unmatched`/`ambiguous`/`rejected`/`suggested`; bekræftede følger kunden.
   Oprydnings-cron bygges sammen med migrationen (ingen lagring uden oprydning).

## Godkendelsesrapport 00247 (2026-11-03) — STAGING anvendt · PROD IKKE anvendt

**Status:** `supabase/migrations/00247_telephony_persistence.sql` er anvendt på STAGING og bevist. PROD er urørt
(`scripts/prod-verify-00247.ts pre` 5/5: ingen tabeller/funktioner/nøgler, katalog 114/273). 00247 står ikke i
`scripts/prod-apply-migration.ts` APPROVED. Lagring er slået FRA som standard (`TELEPHONY_PERSIST_ENABLED`, oven i
`RELATEL_ENABLED`); Relatel, webhook-registrering, opkald, SMS og Telegram er urørte. Prod kræver Henriks eksplicitte
godkendelse. Se "Privatlivsrettelse" for den gældende status og de gældende testtal — tallene længere nede er fra før den.

### Privatlivsrettelse (S2, review 2026-11-04) — opdaterer 00247 FØR prod

**Fund:** `GRANT SELECT ON telephony_calls TO authenticated` gav enhver synlig række med alle kolonner. Rækkereglerne (RLS)
var korrekte, men en bruger med `calls.view_unmatched` kunne selv forespørge `suggested_customer_id` og udbyder-id'er, også
når kunden var uden for brugerens scope. Det strider mod den låste regel om, at et forslag aldrig giver adgang til en kunde.

**Rettelse (samme migrationsfil; 00247 har aldrig været på prod):** kolonne-grant i stedet for tabel-grant. RLS og
synlighedsmodellen er uændret.

| Felter | Adgang |
|---|---|
| `id`, `direction`, `external_number_normalized`, `started_at`, `answered_at`, `ended_at`, `duration_seconds`, `status`, `missed`, `has_voicemail`, `voicemail_duration_seconds`, `employee_profile_id`, `customer_id`, `match_version` | Direkte læsning for authenticated (kun rækker RLS tillader). `customer_id` er kun udfyldt, når kunden allerede er i scope. |
| `suggested_customer_id`, `candidate_count`, `match_status`, `service_case_id` | Kun serveren; vises filtreret (se nedenfor) |
| `provider`, `provider_call_id`, `provider_employee_id`, `provider_voicemail_id`, `match_source`, `matched_by`, `matched_at`, `from_number_normalized`, `to_number_normalized`, `created_at`, `updated_at` | Kun serveren; vises ikke i listen |

Skjulte felter kan heller ikke bruges i filter, sortering eller join, og `SELECT *`/hel-række afvises (42501) — også for admin,
der læser dem gennem serveren. Ingen view, ingen security definer.

**Læsesti (`listCallsCore`):** (1) brugerens egen klient beviser, at opkaldet er synligt; (2) service_role henter de interne
felter KUN for de id'er; (3) kunde og sag slås op med brugerens egen klient; (4) forslag/sags-id returneres kun, hvis
brugeren selv kan se dem. Fejler et opslag, skjules feltet.

**To tilføjelser ud over reviewet (rapporteret til Henrik):**
- `match_status` og `candidate_count` afslører i sig selv, at et nummer tilhører en kunde. `projectCallMatch`: et forslag
  uden for scope fremstår som `unmatched`/0; `ambiguous` og antal kandidater kræver `customers.view.all`.
- Audit-læk: `audit_logs` kan læses af aktøren selv ("Users can read their own audit logs"), og `telephony_set_call_match`
  skriver det gamle `service_case_id`. En bruger, der ikke kan se opkaldets sag, kan derfor ikke længere rette kunde, afvise
  eller ændre sag på det opkald (`hiddenCaseRefusal`); en leder med adgang til sagen skal gøre det. **Det er en ny
  begrænsning på skrivning** (standardrollen salg ser kunder bredt, men kun egne sager). Synligheden er uændret.

**Ikke blokerende for migration-alene** (men blokerer senere live-aktivering af Relatel): Relatel-feltnavne ikke verificeret ·
webhook-auth er en statisk hemmelighed · oprydnings-cron ikke planlagt · `TELEPHONY_PERSIST_ENABLED`/`RELATEL_ENABLED` står
fra. **Hærdning (ikke rettet):** audit af medarbejder-kobling er en separat skrivning efter koblingsændringen, ikke samme
transaktion.

**Bevis på staging efter rettelsen** (fingeraftryk uændret fra før rollback til efter gen-apply: kunder, sager, opgaver,
audit_logs 9375, mails, overrides):

| Kørsel | Resultat |
|---|---|
| `tel-00247-rollback-staging` → state | applied=false, katalog 114/273, data-md5 uændret |
| `tel-00247-probe` før apply (kroppen i prøven, rollback-only) | 96/96 |
| `dry-run-staging 00247` → `migrate-staging 00247` | ✅ · ✅ |
| `tel-00247-probe` (inkl. parallelle sessioner, D = direkte kolonneadgang i SQL) | 102/102 |
| `tel-00247-app` (D = direkte gennem PostgREST med rigtig JWT; persona-liste, fremmed sag) | 74/74 |
| `mp-00238-check` · `scripts/telephony-persist-test.ts` | 16/16 · 20/20 |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| UI (staging, ui-batches, nybygget): U6, U258 | 2/2 PASS |

Personaprøverne kører `listCallsCore` osv. med rigtige persona-klienter. `listTelephonyCalls` er en tynd server-handling
(session + rettighedstjek) oven på den, og intet UI kalder den endnu, så selve wrapperen er ikke kørt ende-til-ende.

### Skema (præcis SQL = migrationsfilen)

**`telephony_calls`** — ét opkald = én række
| Kolonne | Type / regel |
|---|---|
| `id` | uuid PK |
| `provider` | text, CHECK = 'relatel' |
| `provider_call_id` | text 1–128 tegn; UNIQUE (provider, provider_call_id) |
| `direction` | 'inbound' \| 'outbound' \| NULL |
| `from_number_normalized`, `to_number_normalized` | text `^[0-9]{8,15}$` (toRelatelNumber); mindst én (CHECK) |
| `external_number_normalized` | GENERATED (inbound → fra, outbound → til) |
| `started_at` NOT NULL, `answered_at`, `ended_at` | timestamptz (monoton fletning) |
| `duration_seconds` | 0–86400 (fra seneste slut-hændelse) |
| `status` | GENERATED: voicemail · missed · ended · answered · ringing |
| `missed` | GENERATED: indgående, ikke besvaret, sluttet eller telefonsvarer |
| `has_voicemail`, `voicemail_duration_seconds`, `provider_voicemail_id` | KUN metadata (ingen lyd/URL/transskription) |
| `provider_employee_id`, `employee_profile_id` | rå Relatel-id + profil via aktiv kobling til aktiv profil (aldrig navn) |
| `match_status` | unmatched · suggested · ambiguous · confirmed · rejected |
| `suggested_customer_id`, `candidate_count` | kun forslag; tvetydig bærer aldrig et forslag (CHECK + trigger) |
| `customer_id` | KUN bekræftet af et menneske (trigger) |
| `service_case_id` | KUN via separat `link_case` på den bekræftede kunde; sagen skal høre til kunden (trigger) |
| `match_source` ('human'), `matched_by`, `matched_at`, `match_version` | hvem/hvornår + optimistisk lås |
| `created_at`, `updated_at` | timestamptz |

**`telephony_events`** — uforanderlig livscyklus: `id`, `call_id` → calls (ON DELETE CASCADE), `provider`,
`provider_event_id` (1–160, **UNIQUE (provider, provider_event_id)**), `event_type` (call.started/answered/missed/ended,
voicemail.created — ingen SMS), `schema_kind`, `occurred_at`, `received_at`, `payload_sha256` (`^[0-9a-f]{64}$`).
Ingen rå payload. `BEFORE UPDATE`-trigger afviser enhver ændring (55000).

**`telephony_employee_links`** — `provider`, `provider_employee_id` (1–64), `profile_id` → profiles (CASCADE),
`is_active`, `created_at`, `updated_at`; **PK (provider, provider_employee_id)** + **UNIQUE (provider, profile_id) WHERE
is_active**.

**Indekser:** calls (customer_id, started_at DESC) WHERE customer_id NOT NULL · (started_at DESC) WHERE customer_id NULL ·
(external_number_normalized, started_at DESC) · (service_case_id) · (employee_profile_id, started_at DESC) ·
(suggested_customer_id); events (call_id, occurred_at).

**Funktioner (alle `SECURITY INVOKER`, `search_path = public, pg_temp`; EXECUTE kun service_role):**
- `telephony_ingest_event(16 parametre — ingen kunde/sag)` → created · duplicate · conflict. ON CONFLICT på begge
  unikke nøgler + rækkelås; en gentaget hændelse efterlader aldrig et nyt opkald.
- `telephony_set_call_match(call, expected_version, action, customer, case, actor)` — `confirm` (kunde, ingen sag; ny
  kunde fjerner gammel sag) · `link_case` (sag/NULL på den bekræftede kunde) · `reject` (kunde/sag/forslag NULL).
  Låser rækken, `stale` ved forkert version, aktiv aktør krævet, `audit_logs` i samme transaktion (kun id'er).
- `telephony_purge_unconfirmed()` — sletter `customer_id IS NULL` med seneste aktivitet > 90 dage (fast).
- Triggere: `telephony_calls_guard` (BEFORE INSERT/UPDATE), `telephony_events_immutable` (BEFORE UPDATE).

**Politikker/grants:** RLS på alle tre. Én politik `telephony_calls_select` FOR SELECT TO authenticated:
`(customer_id IS NULL AND user_has_permission('calls.view_unmatched')) OR (customer_id IS NOT NULL AND
user_has_permission('calls.view') AND (user_has_permission('customers.view.all') OR customer_id = ANY
(my_customer_scope_ids())))`. Ingen politikker på hændelser/koblinger. authenticated: kun SELECT på 14 kolonner i
telephony_calls (se "Privatlivsrettelse"). anon/PUBLIC: intet. service_role: ALL. Ingen `user_role()`, ingen `USING (true)`.

**Rettighedsnøgler (= permissions.ts):** `calls.view` (admin, serviceleder, salg) · `calls.view_unmatched` (admin,
serviceleder) · `calls.match` (admin, serviceleder, salg). Katalog 114/273 → 117/281.

### Forskelle fra skitsen (kun sikkerhed/data-integritet — ingen produktændring)

| Skitse | Migration | Hvorfor |
|---|---|---|
| `from_number`/`to_number` | `*_number_normalized` + genereret `missed` | Eksplicit normaliseret format; køens filter |
| Trigger kaldte `case_belongs_to_customer()` | Direkte `EXISTS` på `service_cases` | Kun EXECUTE for authenticated → enhver bekræftelse som service_role gav 42501 (fundet af prøven) |
| Kunde kunne sættes af enhver service-role-UPDATE | Trigger kræver `match_source='human'`, `matched_by`, `match_version + 1` | Regel 4–6 i DB |
| Kunde + sag i ét kald | `confirm` og `link_case` separat | Briefen: kunde-bekræftelse og sags-kobling er separate kontrollerede handlinger |
| Lås på `customer_id` | `match_version` + funktion med audit i samme transaktion | Regel 10 |
| Retention "bygges senere" | `telephony_purge_unconfirmed()` + cron-rute (ikke planlagt) | Regel 3 |
| `duplicate` | + `conflict` (genbrugt id med andet opkald/anden hash) | Dublet må ikke skabe nyt opkald |
| Hændelser kunne ændres | UPDATE-trigger 55000 | Uforanderlig revision |
| Koblinger uden status | `is_active` + unik aktiv kobling pr. profil; kobling kun til aktiv profil | Medarbejderskift, deaktiverede brugere |

### Kode (flag fra = adfærd som i dag)

- `lib/integrations/telephony/flags.ts`: `telephonyPersistEnabled` (RELATEL_ENABLED **og** TELEPHONY_PERSIST_ENABLED=true),
  `telephonyMatchMode` ('suggest' | 'off', standard off).
- `lib/integrations/telephony/persist.ts`: `persistTelephonyEvent` → `telephony_ingest_event` (SHA-256 af kroppen; SMS gemmes
  ikke; manglende skema → `unavailable`).
- `lib/integrations/telephony/suggest.ts`: kun forslag (0 → unmatched, 1 → suggested, flere → ambiguous + antal; samme kunde
  via flere kontakter = én); rører kun `unmatched` uden kunde.
- `lib/integrations/telephony/webhook-gate.ts` `handleRelatelWebhook`: flag fra → uændret 404/202 `persisted:false`; til →
  202 created/duplicate, 409 conflict, 202 `persisted:false` ved SMS/manglende tabeller, 500 ved DB-fejl (idempotent retry).
- `lib/telephony/call-actions-core.ts` + `lib/actions/telephony-calls.ts`: `listTelephonyCalls` (synlighed med brugerens klient,
  interne felter via service_role kun for de id'er; forslag/sag kun hvis brugeren selv kan se dem; ingen udbyder-id'er),
  `confirmCallCustomer`, `linkCallCase`, `rejectCallMatch` (calls.match + opkald/kunde/sag synlige med egen klient; afvises hvis
  opkaldets sag er skjult for brugeren), `setTelephonyEmployeeLink` (users.manage_roles; auditeret).
- `lib/integrations/telephony/retention.ts` + `/api/cron/telephony-retention` (CRON_SECRET; **ikke i vercel.json**).
- `processMissedCall`/`syncMissedCalls` markeret `@deprecated` — ikke koblet på noget.
- Ingen UI ændret.

### Bevis på staging

**Fingeraftryk** (`cli.ts tel-00247-state`, før = efter apply, også efter rollback + gen-apply): customers 1915
`597e64c8…` · service_cases 1363 `594491f3…` · customer_tasks 156 `cb7163d2…` · audit_logs 9373 `bb98ed66…` ·
incoming_emails 5557 `1024c259…` · overrides 0. Skema/grants/katalog efter rollback = før første apply.

| Kørsel | Resultat |
|---|---|
| `dry-run-staging 00247` (ROLLBACK) | ✅ |
| `tel-00247-probe` før apply (kroppen i prøven, rollback-only) | 67/67 |
| `tel-00247-rollback-staging` → state | applied=false, 114/273, skema + data = før første apply (**rollback bevist**) |
| `migrate-staging 00247` → `tel-00247-probe` (inkl. parallelle sessioner) | **73/73** |
| `tel-00247-app` (webhook, forslag, handlinger med persona-klienter, medarbejdere, oprydning; testrækker slettet) | **45/45** |
| `mp-00238-check` | 16/16 (117 nøgler = permissions.ts) |
| `scripts/telephony-persist-test.ts` (rene tjek) | 16/16 |
| `grok-features-batch-test.ts`, `grok-features-2-test.ts` (tidligere telefoni/tilbageringning) | grønne |
| UI (staging, ui-batches): U6 (CTI-side), U258 (tilbageringning) | 2/2 PASS |
| tsc · check:rbac (action-gate strict 483/438/45/0) · check:rls-matrix | 0 · 0 · 0 |

**Idempotens/samtidighed:** I1 samme hændelse 2× → created, duplicate; 1 hændelse/1 opkald. C1 8 parallelle identiske →
1 created + 7 duplicate. C2 3 hændelser × 3 parallelle for et NYT opkald → 1 opkald, 3 hændelser, ended/120 s. I2
genbrugt id med andet opkald → conflict, 0 nye opkald; anden hash → conflict. I7 direkte dublet-INSERT → 23505. I8
UPDATE af hændelse → 55000. Webhook W2/W3: duplicate → 202, conflict → 409.

**Rækkefølge:** I3 tre permutationer af started/answered/ended → identisk række. I4 sen slut → ended/95 s; ældre
slut overskriver ikke. I5 missed før started → missed; telefonsvarer → voicemail.

**Matching (webhook, suggest):** M2 nul match → unmatched/0. M1 præcis ét (nummer med mellemrum) → kun forslag, aldrig
bekræftet. M3 flere kunder (00…/+… formater) → ambiguous/2, ingen kunde. M4 samme nummer på 2 kontakter hos samme kunde
→ én kandidat. M5 nyt opkald fra tidligere bekræftet nummer → stadig kun forslag; senere hændelse ændrer ikke en
bekræftelse. M6 rettet match → corrected, gammel sag fjernet. M7 fjern forkert match → rejected; foreslås ikke igen.
M8 ikke-normaliserbart nummer → 400, intet gemt. Audit: confirmed, case_linked ×2, case_unlinked, corrected, rejected.

**Forslag giver ikke adgang:** montør + calls.view_unmatched ser opkaldet, men forslaget skjules (kunden uden for scope),
og bekræftelse til den kunde afvises. Salg ser ikke ubekræftede og kan ikke bekræfte dem. Sag: anden kundes sag →
afvist; sag brugeren ikke kan se → afvist; sag på ubekræftet opkald → afvist; DB-trigger 23514 som andet værn.

**Medarbejdere:** kendt id → profil; ukendt id → ingen profil; deaktiveret profil → ingen; ændret kobling → nye opkald
ny profil, gamle uændrede; deaktiveret kobling → ingen; samme Relatel-id 2× → 23505; én aktiv kobling pr. profil →
23505; kun users.manage_roles (serviceleder afvist).

**Retention:** kun ubekræftede > 90 dage slettes (inkl. hændelser); bekræftet > 90 dage og ubekræftet 89 dage bevares;
cron-ruten: forkert token 401, korrekt → `deleted: 1`. Uden tabeller → 200 skipped.

**Webhook:** flag fra → 404; master uden lagring → 202 `persisted:false`, intet gemt; forkert hemmelighed → 401; SMS →
202 `persisted:false`; ingen opgaver, påmindelser, anden audit eller rækker i SMS-/Telegram-/udbakke-/webhook-/mail-/
portal-/besked-tabeller (S1/S2).

**Persona-matrix** (rigtige staging-uid'er + overrides; "skriv" = INSERT/UPDATE/DELETE på opkald, SELECT/INSERT på
hændelser, SELECT på koblinger, EXECUTE på funktionerne — 42501 for ALLE):

| Persona | U/S/A/R (ubekræftet) | Ci (kunde i montørens scope) | Cf (fremmed kunde) |
|---|---|---|---|
| admin, serviceleder | ja | ja | ja |
| salg | nej | ja | ja |
| bogholderi, montør | nej | nej | nej |
| montør + `calls.view` | nej | ja | nej |
| montør + `calls.view` + `customers.view.all` | nej | ja | ja |
| bogholderi + `calls.view_unmatched` | ja | nej | nej |
| salg − `calls.view` | nej | nej | nej |
| serviceleder − `calls.view_unmatched` | nej | ja | ja |
| inaktiv (med alle grants) / manglende profil | nej | nej | nej |
| anon | 42501 | 42501 | 42501 |

### Prod-fingeraftryk (read-only, 2026-11-03, `prod-verify-00247 pre`)
customers 120 `a43821d7…` · service_cases 8 `88067dd2…` · customer_tasks 28 `aa877a97…` · audit_logs 191 `bebe035b…` ·
incoming_emails 918 `08841c30…` · overrides 0 · katalog 114/273.

### Rollback
Nederst i migrationsfilen (fjerner tabeller, funktioner, triggere og nøgler; telefoni-rækker går tabt; audit-rækker
bevares). Kørt og bevist på staging (`cli.ts tel-00247-rollback-staging`, afviser hvis der er telefoni-rækker).

### Prod-plan (KUN efter Henriks godkendelse)
1. Merge koden (flag fra) → deploy → `prod-verify-00247 pre`.
2. `prod-apply-migration 00247 --dry-run` → `pre` igen → apply → `post` (struktur, grants, ACL, 0 rækker) → fingeraftryk = pre.
3. Rollback-only persona-prøve med rigtige profiler (som 00246).
4. Flag forbliver FRA i prod. Tænding af lagring, forslag og planlægning af oprydnings-cron er hver sin godkendelse.

### Kendte risici
- **Kode før migration:** `permissions.ts` har `calls.*`. Deployes koden før 00247 i prod, viser rettighedsskærmen
  nøglerne, men en tildeling fejler (FK til kataloget). Ingen sikkerhedsrisiko; anbefaling: deploy kode og migration tæt.
- **Forslag skanner alle kunder/kontakter** (`lookupCaller`, side for side) pr. nyt opkald — fint ved 120 kunder; ved
  vækst: normaliseret kolonne + indeks (egen migration).
- **Medarbejder-kobling og dens audit** skrives i to kald (ikke én transaktion); auditfejl blokerer ikke koblingen.
- **Webhook-hemmelighed er statisk** (header); idempotens stopper gentagelser, ikke forfalskede nye hændelser → HMAC/
  rotation før Relatel kobles på (uændret fra forslaget).
- **Relatels rigtige webhook-format er ukendt**; kun vores kanoniske konvolut + `unverified_call` parses. Medarbejder-/
  telefonsvarer-felter er gættede feltnavne indtil Relatel-dokumentation foreligger.
- **Ingen UI** for opkaldsliste/bekræftelse endnu; handlingerne findes og er testet.
- **Oprydningen er ikke planlagt** (ingen vercel.json-cron) — skal planlægges, FØR lagring tændes i prod.

## Oprindelig skitse (historik — den gældende SQL er migrationsfilen)

```sql
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL
     OR to_regprocedure('public.case_belongs_to_customer(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '00247: hjælpefunktioner mangler (00238/00240)';
  END IF;
  IF to_regclass('public.telephony_calls') IS NOT NULL OR to_regclass('public.telephony_events') IS NOT NULL THEN
    RAISE EXCEPTION '00247: telefoni-tabeller findes allerede — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Medarbejder-kobling (Relatel-medarbejder-id → profil). Kun service-role; styres via server-handling (users.edit).
CREATE TABLE public.telephony_employee_links (
  provider             text NOT NULL CHECK (provider = 'relatel'),
  provider_employee_id text NOT NULL CHECK (char_length(provider_employee_id) BETWEEN 1 AND 64),
  profile_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_employee_id),
  UNIQUE (provider, profile_id)
);

-- 2. Ét opkald = én række. Match, sag og medarbejder ligger her.
CREATE TABLE public.telephony_calls (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                   text NOT NULL CHECK (provider = 'relatel'),
  provider_call_id           text NOT NULL CHECK (char_length(provider_call_id) BETWEEN 1 AND 128),
  direction                  text CHECK (direction IN ('inbound', 'outbound')),
  from_number                text CHECK (from_number ~ '^[0-9]{8,15}$'),   -- normaliseret (phone.ts toRelatelNumber)
  to_number                  text CHECK (to_number ~ '^[0-9]{8,15}$'),
  external_number            text GENERATED ALWAYS AS (
                               CASE direction WHEN 'inbound' THEN from_number WHEN 'outbound' THEN to_number END) STORED,
  started_at                 timestamptz NOT NULL,
  answered_at                timestamptz,
  ended_at                   timestamptz,
  duration_seconds           integer CHECK (duration_seconds BETWEEN 0 AND 86400),
  has_voicemail              boolean NOT NULL DEFAULT false,
  voicemail_duration_seconds integer CHECK (voicemail_duration_seconds BETWEEN 0 AND 86400),
  provider_voicemail_id      text CHECK (char_length(provider_voicemail_id) <= 128),  -- kun id; ingen lyd/tekst
  status                     text GENERATED ALWAYS AS (
                               CASE WHEN has_voicemail THEN 'voicemail'
                                    WHEN ended_at IS NOT NULL AND answered_at IS NULL AND direction = 'inbound' THEN 'missed'
                                    WHEN ended_at IS NOT NULL THEN 'ended'
                                    WHEN answered_at IS NOT NULL THEN 'answered'
                                    ELSE 'ringing' END) STORED,
  provider_employee_id       text CHECK (char_length(provider_employee_id) <= 64),
  employee_profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_status               text NOT NULL DEFAULT 'unmatched'
                               CHECK (match_status IN ('unmatched', 'suggested', 'ambiguous', 'confirmed', 'rejected')),
  suggested_customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  candidate_count            smallint NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  customer_id                uuid REFERENCES public.customers(id) ON DELETE SET NULL,      -- KUN bekræftet af et menneske
  service_case_id            uuid REFERENCES public.service_cases(id) ON DELETE SET NULL,
  match_source               text CHECK (match_source IN ('human')),
  matched_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  matched_at                 timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_call_id),
  CONSTRAINT telephony_calls_has_number CHECK (from_number IS NOT NULL OR to_number IS NOT NULL)
);
-- NB: ingen CHECK "confirmed ⇔ customer_id": ON DELETE SET NULL på kunden ville så blokere sletning af kunden.
-- Synligheden afgøres af customer_id alene; triggeren nedenfor holder status/sag konsistente.

CREATE INDEX idx_telephony_calls_customer ON public.telephony_calls (customer_id, started_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_telephony_calls_unconfirmed ON public.telephony_calls (started_at DESC) WHERE customer_id IS NULL;
CREATE INDEX idx_telephony_calls_external ON public.telephony_calls (external_number, started_at DESC);
CREATE INDEX idx_telephony_calls_case ON public.telephony_calls (service_case_id) WHERE service_case_id IS NOT NULL;
CREATE INDEX idx_telephony_calls_employee ON public.telephony_calls (employee_profile_id, started_at DESC) WHERE employee_profile_id IS NOT NULL;

-- 3. Rå livscyklus (revision/fejlsøgning). Ingen payload gemmes — kun hash.
CREATE TABLE public.telephony_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id           uuid NOT NULL REFERENCES public.telephony_calls(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider = 'relatel'),
  provider_event_id text NOT NULL CHECK (char_length(provider_event_id) BETWEEN 1 AND 160),
  event_type        text NOT NULL CHECK (event_type IN ('call.started', 'call.answered', 'call.missed', 'call.ended', 'voicemail.created')),
  schema_kind       text NOT NULL CHECK (schema_kind IN ('canonical', 'unverified_call')),
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload_sha256    text CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX idx_telephony_events_call ON public.telephony_events (call_id, occurred_at);

-- 4. Konsistens: sag skal høre til kunden; mistet kunde → ingen sag og ikke længere bekræftet
CREATE FUNCTION public.telephony_calls_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.service_case_id := NULL;
    IF NEW.match_status = 'confirmed' THEN NEW.match_status := 'unmatched'; END IF;
  ELSIF NEW.service_case_id IS NOT NULL AND NOT public.case_belongs_to_customer(NEW.service_case_id, NEW.customer_id) THEN
    RAISE EXCEPTION 'telephony_calls: sagen hører ikke til kunden' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER telephony_calls_consistency BEFORE INSERT OR UPDATE ON public.telephony_calls
  FOR EACH ROW EXECUTE FUNCTION public.telephony_calls_consistency();

-- 5. Idempotent modtagelse (én transaktion pr. hændelse). Kun service_role må kalde den.
CREATE FUNCTION public.telephony_ingest_event(
  p_provider text, p_provider_event_id text, p_provider_call_id text, p_event_type text, p_schema_kind text,
  p_occurred_at timestamptz, p_direction text, p_from text, p_to text, p_duration integer, p_answered boolean,
  p_has_voicemail boolean, p_voicemail_duration integer, p_provider_voicemail_id text, p_provider_employee_id text,
  p_payload_sha256 text
) RETURNS TABLE (outcome text, call_id uuid)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_call uuid; v_event uuid;
BEGIN
  INSERT INTO telephony_calls (provider, provider_call_id, direction, from_number, to_number, started_at)
  VALUES (p_provider, p_provider_call_id, p_direction, p_from, p_to, p_occurred_at)
  ON CONFLICT (provider, provider_call_id) DO NOTHING;
  SELECT c.id INTO v_call FROM telephony_calls c WHERE c.provider = p_provider AND c.provider_call_id = p_provider_call_id FOR UPDATE;

  INSERT INTO telephony_events (call_id, provider, provider_event_id, event_type, schema_kind, occurred_at, payload_sha256)
  VALUES (v_call, p_provider, p_provider_event_id, p_event_type, p_schema_kind, p_occurred_at, p_payload_sha256)
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_event;
  IF v_event IS NULL THEN RETURN QUERY SELECT 'duplicate'::text, v_call; RETURN; END IF;

  UPDATE telephony_calls c SET
    direction                  = coalesce(c.direction, p_direction),
    from_number                = coalesce(c.from_number, p_from),
    to_number                  = coalesce(c.to_number, p_to),
    started_at                 = least(c.started_at, p_occurred_at),
    answered_at                = CASE WHEN p_event_type = 'call.answered' OR p_answered IS TRUE
                                      THEN least(coalesce(c.answered_at, p_occurred_at), p_occurred_at) ELSE c.answered_at END,
    ended_at                   = CASE WHEN p_event_type IN ('call.ended', 'call.missed')
                                      THEN greatest(coalesce(c.ended_at, p_occurred_at), p_occurred_at) ELSE c.ended_at END,
    duration_seconds           = coalesce(p_duration, c.duration_seconds),
    has_voicemail              = c.has_voicemail OR coalesce(p_has_voicemail, false) OR p_event_type = 'voicemail.created',
    voicemail_duration_seconds = coalesce(p_voicemail_duration, c.voicemail_duration_seconds),
    provider_voicemail_id      = coalesce(c.provider_voicemail_id, p_provider_voicemail_id),
    provider_employee_id       = coalesce(c.provider_employee_id, p_provider_employee_id),
    employee_profile_id        = coalesce(c.employee_profile_id, (SELECT l.profile_id FROM telephony_employee_links l
                                   WHERE l.provider = p_provider AND l.provider_employee_id = p_provider_employee_id)),
    updated_at                 = now()
  WHERE c.id = v_call;
  RETURN QUERY SELECT 'created'::text, v_call;
END $$;
REVOKE ALL ON FUNCTION public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.telephony_calls_consistency() FROM PUBLIC, anon, authenticated;

-- 6. Rettigheder (= src/lib/auth/permissions.ts i samme ændring)
INSERT INTO public.permission_catalog (permission) VALUES
  ('calls.view'), ('calls.view_unmatched'), ('calls.match') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'calls.view'), ('serviceleder', 'calls.view'), ('salg', 'calls.view'),
  ('admin', 'calls.view_unmatched'), ('serviceleder', 'calls.view_unmatched'),
  ('admin', 'calls.match'), ('serviceleder', 'calls.match'), ('salg', 'calls.match')
ON CONFLICT DO NOTHING;

-- 7. RLS: kun læsning for authenticated, kun på opkald. Hændelser og koblinger: kun service_role.
ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_employee_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY telephony_calls_select ON public.telephony_calls
  FOR SELECT TO authenticated
  USING (
    (customer_id IS NULL AND (SELECT public.user_has_permission('calls.view_unmatched')))
    OR (
      customer_id IS NOT NULL
      AND (SELECT public.user_has_permission('calls.view'))
      AND (
        (SELECT public.user_has_permission('customers.view.all'))
        OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
      )
    )
  );

REVOKE ALL ON public.telephony_calls, public.telephony_events, public.telephony_employee_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.telephony_calls TO authenticated;
GRANT ALL ON public.telephony_calls, public.telephony_events, public.telephony_employee_links TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

**Kompileret på staging 2026-11-03, rollback-only** (hele blokken + prøve i én transaktion, afsluttet med
ROLLBACK; staging efter: ingen tabeller, 0 `calls.*`-nøgler): samme hændelse 2× → `duplicate`, 1 hændelse/1 opkald;
ubesvaret → `missed`; ended før started → start = tidligste, `ended`; voicemail → `voicemail`; sag fra anden kunde →
23514; mistet kunde → `unmatched` uden sag; `sms.received` → 23514; EXECUTE på ingest kun service_role; authenticated
kun SELECT på opkald, 0 grants på hændelser/koblinger. Persona-matrixen nedenfor er IKKE kørt endnu.

### Rollback (uført; fjerner kun det nye — ingen eksisterende data berøres)
```sql
BEGIN;
DROP FUNCTION IF EXISTS public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text);
DROP TABLE IF EXISTS public.telephony_events;
DROP TABLE IF EXISTS public.telephony_calls;          -- trigger følger med
DROP FUNCTION IF EXISTS public.telephony_calls_consistency();
DROP TABLE IF EXISTS public.telephony_employee_links;
DELETE FROM public.user_permission_overrides WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
DELETE FROM public.role_permission_defaults WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
DELETE FROM public.permission_catalog WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
NOTIFY pgrst, 'reload schema';
COMMIT;
```

### Hvad der bevidst IKKE er med
- Ingen `INSERT/UPDATE/DELETE` for authenticated på nogen telefoni-tabel; ingen SELECT på hændelser/koblinger.
- Ingen `USING (true)`, ingen `user_role()`, ingen anon/PUBLIC-grants, ingen `TO public`-politik.
- Ingen transskription, lyd-URL eller rå payload. Ingen SMS. Ingen kobling til `customer_tasks`.
- `SELECT_REPLACED` (scripts/rls/write-matrix.ts): tabellen er ny og uden for en RLS-wave → ikke i listen.

## Kodeændringer (CODE før MIGRATION; alt tåler at tabellerne mangler, som kundenoter)

1. `permissions.ts`/`permission-text.ts`: `calls.view`, `calls.view_unmatched`, `calls.match`.
2. Ny `SupabaseTelephonyStore` (service-role) der kalder `telephony_ingest_event`; `has()`/`put()`-kapløbet fjernes
   (DB er sandheden). `sms.*` → 400/ignoreret. Webhook gemmer kun når `RELATEL_ENABLED=true` OG tabellen findes; ellers
   som i dag (`persisted:false`). Manglende tabel (PGRST205/42P01) = 202 `persisted:false`, aldrig 500 i løkke.
3. Forslag (kun `TELEPHONY_MATCH_MODE=suggest`): efter `created` → opslag på `external_number` i kunder/kontakter
   (service-role, normaliseret, eksakt) → `UPDATE … SET suggested_customer_id, candidate_count, match_status
   WHERE id = $1 AND match_status = 'unmatched'` (overskriver aldrig menneskelig beslutning).
4. `confirmCallMatch(callId, customerId, caseId?, expectedCustomerId)` / `rejectCallMatch(callId, expected)`:
   `calls.match` + læsning af opkald, kunde og sag med brugerens klient (RLS) → service-role-UPDATE med optimistisk
   lås → `audit_logs` (`telephony_call`, `call_match_confirmed|corrected|rejected`, kun id'er).
5. "Opret tilbageringning" fra et opkald: eksisterende opgave-handling med brugerens rettigheder, `reminder_at = NULL`.
6. `processMissedCall`/`syncMissedCalls`: markeres forældede (laver opgaver med `reminder_at`, service-role-opslag på
   tværs af scope og skriver telefonsvarer-transskription i opgaven) — må ikke aktiveres i nuværende form.
7. Webhook-hemmelighed: statisk header i dag. Før aktivering: HMAC/tidsstempel hvis Relatel understøtter det, ellers
   hemmelighed + rotation; idempotens dækker gentagelser af samme hændelse, ikke forfalskede nye.

## Staging-testmatrix (rollback-only DO-blok som `notes-00245-probe`; A = efter migration, B = idempotens)

Rækker: U ubekræftet, S forslag, A tvetydig, Ci bekræftet kunde i montørens scope, Cf bekræftet fremmed kunde, R afvist.

| Persona | ser U/S/A/R | ser Ci | ser Cf | direkte INSERT/UPDATE/DELETE | hændelser/koblinger |
|---|---|---|---|---|---|
| admin, serviceleder | ja | ja | ja | 42501 | 42501 |
| salg | nej | ja | ja | 42501 | 42501 |
| bogholderi | nej | nej | nej | 42501 | 42501 |
| montør | nej | nej | nej | 42501 | 42501 |
| montør + `calls.view` | nej | ja | nej | 42501 | 42501 |
| montør + `calls.view` + `customers.view.all` | nej | ja | ja | 42501 | 42501 |
| bogholderi + `calls.view_unmatched` | ja | nej | nej | 42501 | 42501 |
| salg − `calls.view` | nej | nej | nej | 42501 | 42501 |
| serviceleder − `calls.view_unmatched` | nej | ja | ja | 42501 | 42501 |
| inaktiv / manglende profil | nej | nej | nej | 42501 | 42501 |
| anon | 42501 | 42501 | 42501 | 42501 | 42501 |

Plus:
- `telephony_ingest_event` som service_role: samme hændelse 2× → 1 hændelse, 1 opkald, `duplicate`; started→ended og
  ended→started giver samme slutrække; missed uden svar → `status = missed`; voicemail → `voicemail`; to sessioner med
  samme nøgle samtidigt → én række (pg_sleep-test).
- EXECUTE på ingest-funktionen: anon/authenticated 42501; service_role ok.
- Trigger: sag fra anden kunde → 23514; slet kunde (i transaktion) → opkald `customer_id NULL`, `service_case_id NULL`,
  status `unmatched`, kunde-sletning lykkes.
- Ingest rører ikke `customer_tasks`, `audit_logs`, `customers`, `service_cases` (md5 før/efter).
- Server-handlinger: bekræft kræver `calls.match` + scope på kunde og sag; tvetydig vælges aldrig automatisk; rettelse
  og afvisning auditeres; optimistisk lås afviser samtidig rettelse.
- `check:rls-matrix`, `check:rbac`, tsc, `mp-00238-check` (katalog 117 nøgler) grønne. UI: CTI-side og kø uændret med
  flag fra.

## Prod-verifikation (efter godkendelse; samme form som 00245)
1. Kode med tolerance for manglende tabeller deployet (flag fra) → `prod-verify-00247 pre`: tabeller/nøgler fraværende,
   fingeraftryk af customers, service_cases, customer_tasks, audit_logs, permission-tabeller.
2. `prod-apply-migration 00247 --dry-run` → pre igen uændret → apply.
3. `post`: præcis én politik (SELECT), ingen `USING (true)`/`user_role()`, grants (authenticated kun SELECT på opkald),
   funktions-ACL, 3 nøgler + standarder, RLS slået til på alle tre, 0 rækker.
4. Rollback-only probe med rigtige profiler (+ midlertidigt rolleskift i transaktionen) efter matrixen ovenfor; ingest
   kørt i transaktionen og rullet tilbage.
5. Fingeraftryk uændrede; webhook stadig 404 (`RELATEL_ENABLED` fra); 0 rækker i telefoni-tabellerne.
