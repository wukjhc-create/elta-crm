# ELTA kommunikations-hub / AI-receptionist — FASE 3A

Status: **klar til review** på branch `claude-communication-hub-phase-3a` (bygger på prod-main `56decaaf` + preflight-
værktøjet). Intet er deployet. Migration **00250 er KUN på staging** (prod uændret: 00249, 120/291). Alle nye flag er FRA;
prod får ingen ny adfærd før hvert aktiveringstrin godkendes særskilt (§11). Nila, Relatel-routing og -flag er uændret.
Intet sendes til kunder (ingen SMS/mail/opkald; `EXTERNAL_SENDS_ENABLED` er konstant `false`).

Mål: Henvendelser er den fælles indbakke — mail, portal, web-chat, telefon, SMS → Henvendelser → kunde/sag/opgave/
planlægning/tilbud/arbejdsordre/tidslinje. Ét CRM, ingen kanal-mini-CRM'er.

## 0. Forældede prod-smoke-forventninger (rettet først)

| Smoke | Før | Nu | Resultat |
|---|---|---|---|
| `scripts/prod-smoke-00247.ts` | usigneret webhook-POST → 404 | 401 (godkendt observationstilstand, RELATEL_FINAL_REVIEW §14b) **eller** 404 (master FRA); aldrig 2xx | 15/15 ✅ |
| `scripts/prod-read-scope-effective.ts` | `customer_notes` findes ikke | findes (00245, prod 2026-11-03) med præcis de fire scope-politikker, ingen bred SELECT | 159/159 + 33/33 ✅ |

Kun forventninger/dokumentation — ingen runtime-ændring af Relatel eller customer_notes.

## 1. Arkitektur (samme motor for alle kanaler)

```
eksisterende intake (mail-sync / portal / chat-API)
  → kanonisk kilderække (incoming_emails / portal_messages / web_chat_messages — kopieres ikke)
  → normaliseret kontrakt (lib/reception/adapters.ts)
  → Reception Engine (identitet → oplysningsniveau → signaler/intent → sag → politik → handoff → svar)
  → reception_ingest (ÉN atomisk DB-funktion: kilde-afledt identitet, tråd-regler, forslag, audit)
  → Henvendelser (conversations + conversation_items + conversation_actions)
```

| Kanal | Indgang | Adapter | Aktør |
|---|---|---|---|
| Mail (Microsoft 365) | `email-sync-orchestrator` → efter `linkAndAnalyze` | `ingestEmailSource` (lib/reception/channel-intake.ts) | baggrund (service_role-kapabilitet) |
| Portal | `sendPortalMessage` efter insert | `ingestPortalMessageSource` | baggrund |
| Web-chat (ELTA, ikke Nila) | `/api/webchat` | `postWebChatMessage` (lib/reception/webchat/service.ts) | baggrund |
| Telefon | (00247, Relatel — uændret, ikke koblet på i 3A) | `callToInbound` | — |
| SMS | fundament (`smsToInbound`); ingen indgående SMS findes | — | — |

Bevis for "samme motor": `reception-hub-test` (75) + `reception-hub-staging` (24): samme kunde skriver mail → portal → web-chat;
mail og chat finder kunden med den SAMME deterministiske matcher (`matchIdentity`) som kandidat, portalen er bekræftet af
tokenet, og alle tre går gennem `runReceptionTurn` + `reception_ingest`. Ingen kanal har sin egen kundelogik.

## 2. Migration 00250 (STAGING) — `supabase/migrations/00250_henvendelser_hub_phase_3a.sql`

Kun nye kolonner/tabeller/funktioner oven på 00249; eksisterende kilde-tabeller læses kun. **Ingen nye rettighedsnøgler**
(katalog 120/291 uændret).

| Objekt | Formål |
|---|---|
| `conversations.thread_key` | trådnøgle AFLEDT i DB af kilden (ikke kalderen) |
| `conversations.status` + `awaiting_elta` | "venter på ELTA" ved siden af "venter på kunde" |
| `conversations.text_purged_at`, `customer_deleted_at`, `case_deleted_at` | retention-markører (kun serveren) |
| `conversation_items.attachment_refs` | vedhæftnings-REFERENCER (navn/type/størrelse — aldrig URL/token), afledt af kilden |
| `conversation_items.text_purged_at`, `source_missing_at` | retention-markører |
| `web_chat_sessions`, `web_chat_messages` | kanonisk kilde for ELTAs web-chat; kun service_role skriver; token kun som SHA-256 |
| `reception_source_identity` (erstattet) | + trådnøgle, bekræftet sag (mail: manuelt koblet + sagen er kundens; portal: præcis én sag for kundens tilbud), vedhæftnings-referencer, web-chat-kilde |
| `reception_source_visible` (erstattet) | web-chat kan ikke indtages af medarbejdere (kun serveren) |
| `reception_ingest` (erstattet) | + tråd-tilføjelse (`appended`), udgående chat-svar i tråden |
| `conversations_guard`, `conversation_items_guard` (erstattet) | + tråd-værn, retention-markører låst for brugere, slettet kandidat markeres |
| `conversation_items_update_guard` (ny) | items uforanderlige — undtagen retention (kun rydde, aldrig skrive) |
| `reception_retention(policy, apply)` (ny) | dry-run som standard; KUN service_role; auditeret |

Prøver (staging, rollback-only): `cli.ts reception-00250-probe` **75/75**, `cli.ts reception-00250-rollback-proof`
(struktur-md5 af hele public = 00249-tilstanden præcist). Rollback-SQL (genereret af 00249's egne funktionstekster):
`docs/runbooks/sql/00250_rollback.sql`.

## 3. Trådregler (eksplicitte — DB håndhæver dem)

1. En kilde føjes KUN til en eksisterende henvendelse, hvis kildens **afledte trådnøgle** er identisk, henvendelsen er
   **åben** (ikke håndteret/spam), samme **kanal**, inden for kanalens **vindue** efter seneste aktivitet, og kildens
   **bekræftede kunde** (hvis nogen) er henvendelsens.
2. Trådnøgler: mail = Graph `conversationId` (md5) · portal = kunde + tilbud (`general` uden tilbud) · web-chat = sessionen ·
   opkald og webformularer (FormSubmit) = **ingen tråd** (hver er sin egen henvendelse).
3. Vinduer: mail 30 dage · portal 14 dage · web-chat 1 dag.
4. Aldrig på tværs af kanaler. Aldrig fordi telefon/mail matcher (to urelaterede mails fra samme kunde = to henvendelser).
   Aldrig til en afsluttet henvendelse (svar efter "håndteret" = ny henvendelse; genåbning er et menneskeligt valg).
5. Et tråd-item giver højst FORSLAG, kan hæve hastegrad/kræve handoff (aldrig sænke), og kundens svar flytter
   "venter på kunde" → "åben". Udgående chat-svar ændrer intet og opretter ingen handlinger; uden åben tråd afvises de.
6. Samtidighed: advisory-lås pr. kilde-nøgle OG pr. trådnøgle (to første beskeder i samme tråd → én henvendelse).

## 4. Mail → Henvendelser (resultat)

- Hook: sidst i `linkAndAnalyze` (kun indgående, efter kobling/AI-analyse, så kildens kobling er endelig). Flag
  `RECEPTION_EMAIL_INGEST_ENABLED` (FRA). Fejl vælter aldrig mail-sync (udfald returneres, intet kastes).
- Kun **nye** mails: modtaget ≤ 48 t (også mail-sync'ens genforsøg af ubehandlede) — ingen stille historik-import.
- Egne postkasser/`@eltasolar.dk` springes over; `link_status = ignored` (spam/nyhedsbrev) afvises.
- Kunde fra kilden: manuelt koblet = **bekræftet** (kan ikke overskrives — DB-værn); automatisk koblet = **kandidat**;
  ukoblet forbliver ukoblet (motorens deterministiske afsender-match kan give en kandidat — aldrig en kobling);
  tvetydig forbliver tvetydig; **læsefejl ≠ ukoblet** (`read_error` som eget udfald, både ved kilde- og kundeopslag).
- Idempotent: samme mail igen → `duplicate`; svar i samme Graph-tråd → `appended`.
- Kilde-id (`source_table` + `source_id`, udbyder `microsoft365`) bevares; mailen kopieres ikke; vedhæftninger som
  referencer. Henvendelsen viser kanal, afsender, emne, kort uddrag/AI-resumé, kunde-/sags-match, hastegrad, ejer/status.
- Intet svar sendes.

## 5. Portal → Henvendelser (resultat)

- Hook: `sendPortalMessage` efter insert. Flag `RECEPTION_PORTAL_INGEST_ENABLED` (FRA). Kundens afsendelse kan ikke fejle
  pga. indtaget. Den eksisterende interne notifikationsmail til kontoret er uændret (ikke kundekommunikation).
- Portal-token = bekræftet kunde (stærk identitet; deterministisk disclosure-niveau). Sag: bekræftet, hvis beskeden
  hører til et tilbud med præcis én (ikke-forslag) sag (`service_cases.source_offer_id`); ellers motorens kandidat.
- Besked, tidspunkt, kilde-række og vedhæftnings-referencer bevares (aldrig den signerede URL). Ingen anden portal-indbakke.

## 6. ELTA web-chat (STAGING) — `RECEPTION_WEBCHAT_ENABLED` (FRA; prod FRA)

- Test-side `/webchat-test` (404 når flaget er fra, noindex, ikke linket), API `/api/webchat` (404 når fra; valgfri
  test-nøgle `RECEPTION_WEBCHAT_TEST_KEY` til trin D). Ingen login/cookies; session = tilfældigt token, kun hash gemt.
- Besøgende: besked, navn, telefon, e-mail, valgfrit postnr./adresse. Emner: generelt, service, tilbud, min sag,
  medarbejder. (Billede senere = det eksisterende engangs-upload-link efter bekræftet kunde.)
- Samme kontrakt, matcher, politik, motor, Henvendelser, forslagsmodel og handoff. Besøgendes oplysninger er
  UBEKRÆFTEDE (kun kandidat). Kundespecifikt kun efter motorens deterministiske bekræftelse (postnr. + vejnavn →
  status-KATEGORI); ellers spørges der.
- Svar (lib/reception/webchat/reply.ts): **politik før model**. Nød → præcis den godkendte nød-tekst (ingen AI).
  Handoff/afviste tilsagn (pris, dato, garanti, compliance, annullering, faktura) → fast tekst. Vidensspørgsmål →
  vidensbasen ordret eller "det kan en medarbejder svare på". Valgfri AI-omformulering (`RECEPTION_WEBCHAT_AI_REPLY_ENABLED`,
  kun staging) får KUN det faste svar + kendte fakta (aldrig den besøgendes tekst) og efterkontrolleres (nye tal/URL'er/
  mails, løfter, el-instruktioner → afvist → fast svar).
- Må ikke: love pris/dato, garanti-/compliance-afgørelser, ændre faktura, annullere, sende personale, afsløre
  kundedata uden bekræftelse. Gentaget besked (samme klient-id) gemmes én gang og besvares ikke igen.

## 7. Vidensbase (én kanonisk kilde) — `src/lib/reception/knowledge.ts`

Kendte (med kilde): firmanavn, "el- og solcelleinstallationer", kontakt@eltasolar.dk, eltasolar.dk, nød-politik,
medarbejder-handoff. **Ukendte (null — gættes aldrig):** se §9. Ingen firmafakta i prompts/svar-kode (testet).

## 8. Henvendelser — kontor-UX (resultat)

- Visninger: Nye · Mine · Ikke tildelt · Haster · Venter på kunde · Venter på ELTA · Håndteret · Alle. Kanal: Mail ·
  Portal · Web-chat · Telefon · SMS (gamle `?filter=phone` m.fl. virker fortsat).
- Række: kunde/ukendt (bekræftet ✓ / kandidat? / tvetydig / læsefejl), sag, kanal, tid, antal beskeder, kort resumé,
  hastegrad, status, ansvarlig ("Ikke tildelt" fremhævet), næste skridt. Akutte og ubehandlede øverst.
- Detalje: ÉN kronologisk tråd (beskeder i alle retninger, vedhæftninger, fuld chat-tekst via RLS, historik/audit),
  AI-resumé, kunde-/sagsmatch, forslag (afventer/godkendt/udført/afvist), ejer og status.
- Handlinger: bekræft/vælg kunde, bekræft/vælg sag, **opret sagsforslag** (`is_proposal`, ingen kundemail), opret
  opgave, **ring tilbage** (tilbageringnings-køen), tildel medarbejder/team, **venter på kunde**, **venter på ELTA**,
  håndteret, **genåbn**. Intet sendes herfra.
- Skærmbilleder: §13.

## 9. Forretningsinformation Henrik skal levere (til `knowledge.ts`)

1. Telefonnummer (og om det er Nila/Relatel-nummeret kunden skal ringe til)
2. Åbningstider (hverdage/weekend/helligdage) og evt. vagttelefon
3. Serviceområde (postnumre/kommuner/km)
4. Ydelser i detaljer (fx solceller, batterier, ladestandere, el-service, tavler) — og hvad I IKKE laver
5. Sådan foregår et servicebesøg (forløb, hvem kommer, hvor lang tid)
6. Hvad kunden skal have klar (adgang til tavle, inverter-info, kundenummer …)
7. Billed-/dokumentkrav (fx billede af tavle, inverter-display, typeskilt)
8. Forventet svartid pr. kanal (må kun stå, hvis I kan holde den)
9. Eskalering uden for åbningstid (hvem/hvordan — nød-teksten er allerede godkendt)
10. Om web-chatten må nævne priser "fra"-niveau (anbefaling: nej — politikken afviser beløb)

## 10. Retention (design + implementering, ikke planlagt)

| Data | Hvor | Regel |
|---|---|---|
| Kanoniske kilder (mail, portal, opkald, chat) | egne tabeller | egen retention — **røres aldrig** af Henvendelser |
| Kopieret uddrag/afsender/emne/vedhæftningsnavne (items) | `conversation_items` | ryddes `handled_text_days` (forslag 90) efter "håndteret" |
| AI-resumé + titel (henvendelse) | `conversations` | ryddes `handled_summary_days` (forslag 180) efter "håndteret"; titel → "Henvendelse (kanal)" |
| Transskriptions-reference | `conversation_items` | efter `transcript_purge_after` → `purged` |
| Kunde slettet | markeres `customer_deleted_at` (også kun-kandidat) | kopieret tekst ryddes efter `customer_deleted_days` (forslag 0) |
| Sag slettet | markeres `case_deleted_at` | ingen tekstrydning (henvendelsen kan stadig være relevant) |
| Kilde slettet (forældreløs) | `source_missing_at` | itemets kopierede tekst ryddes efter `orphan_source_days` (forslag 0) |
| Åbne henvendelser | — | ryddes aldrig (undtagen slettet kunde/kilde) |
| Bevares altid | kilde-reference, status, tider, audit, kunde/sag | — |

- DB: `reception_retention(policy jsonb, apply boolean)` — standard dry-run (kun antal), kun service_role, klemte grænser,
  ryddet tekst kan ikke genskrives (item-værn), auditeret (`reception_retention_applied`).
- App: `lib/reception/retention.ts` (`runReceptionRetention`); anvendelse kræver `RECEPTION_RETENTION_APPLY=true` **og**
  `?apply=1`. Rute `/api/cron/reception-retention` (CRON_SECRET) står **ikke** i vercel.json.
- Staging: dry-run kørt (§12). Prod: intet planlagt — politikken kræver Henriks godkendelse.

## 11. Aktiveringstrin (FORBEREDT, IKKE UDFØRT) — hvert sit flag, ingen hovedafbryder

Forudsætning for A–E: 00250 i prod (egen godkendelse: nr/formål/risiko/pre-post; samme preflight-mønster som 00249) og
koden deployet (dormant).

| Trin | Slå til | Slå fra (rollback) | Før/efter-tjek |
|---|---|---|---|
| A Mail-indtag | `RECEPTION_EMAIL_INGEST_ENABLED=true` | sæt `false`/fjern → næste mail-sync stopper indtag; eksisterende henvendelser bliver (forslag) | 24 t: antal nye henvendelser ≈ nye indgående mails; 0 udførte AI-handlinger; 0 sendt |
| B Portal-indtag | `RECEPTION_PORTAL_INGEST_ENABLED=true` | samme | portalbeskeder → bekræftet kunde; ingen kundemail ud |
| C Afgrænset historik | intet flag: "Hent nye fra mail/portal" (≤ 14 dage, ≤ 50 pr. kanal, kun forslag, egen RLS) — én gang, af admin | henvendelser kan markeres håndteret; kilder urørte | backfill-analysator før/efter |
| D Web-chat pilot | `RECEPTION_WEBCHAT_ENABLED=true` + `RECEPTION_WEBCHAT_TEST_KEY=<hemmelig>` (ikke-offentlig) | fjern flaget → `/api/webchat` + `/webchat-test` = 404 | kun interne testere; nød-tekst, ingen kundedata uden bekræftelse |
| E Offentlig web-chat | widget på eltasolar.dk + `RECEPTION_WEBCHAT_PUBLIC` (ikke bygget i 3A) | fjern widget/flag | kræver vidensbase (§9), rate-limit pr. IP, misbrugsovervågning |

AI-omformulering (`RECEPTION_WEBCHAT_AI_REPLY_ENABLED`) og retention-anvendelse (`RECEPTION_RETENTION_APPLY`) er separate
og kræver hver deres godkendelse. Anbefalet rækkefølge: 00250 → A (1 uge) → B → C (14 dage, se §12) → D → E.

## 12. Historisk backfill — analyse (read-only, prod 2026-11-17) og anbefaling

`npx tsx scripts/reception-backfill-analyzer.ts` (én READ ONLY-SELECT, kun antal):

| Mail (indgående, ikke ignoreret, ikke egne) | Antal |
|---|---|
| I alt | 618 (webformularer 8) |
| Allerede i Henvendelser | 0 |
| Koblet kunde | 222 (manuelt 1, automatisk 221) |
| Ukoblet | 396 — heraf entydig afsender-kandidat 47, **tvetydig afsender 32**, ingen kandidat 317 |
| Mulig åben sag | præcis én: 0 · flere: 16 |
| Alder 0–7 / 8–30 / 31–90 / ældre | 17 / 62 / 124 / 415 |
| Seneste 14 / 30 dage | 32 / 79 (30 dage koblet eller kandidat: 38) |
| Graph-tråde | 610 mails i 456 tråde |

| Portal (kundebeskeder) | Antal |
|---|---|
| I alt / allerede repræsenteret | 8 / 0 |
| Med tilbud / eksplicit sag via tilbud | 8 / 7 |
| Alder | alle > 90 dage (0 seneste 30 dage) |

**Anbefaling (trin C):** importér kun **seneste 14 dage** (≈ 32 mails, få tråde), kun ikke-ignorerede, efter at A har
kørt stabilt i en uge; spring portal-historik over (alle > 90 dage, 2 kunder — åbnes hellere fra kundekortet). Ingen
import af > 30 dage: 415 mails er ældre end 90 dage og ville drukne kontorets "Nye". De 32 tvetydige afsendere bekræfter,
at tvetydighed SKAL forblive synlig (aldrig auto-kobling).

## 13. Skærmbilleder (staging, U268)

`henvendelser-3a-liste.png` (visninger + kanal + række med kandidat/"Ikke tildelt"/2 beskeder),
`henvendelser-3a-traad.png` (én tråd: 2 mails, vedhæftning), `henvendelser-3a-webchat.png` (web-chat-henvendelse med
nød, udgående svar i tråden), `webchat-3a-noed.png` (test-chatten med den godkendte nød-tekst).

## 14. service_role — gennemgang efter at automatisk indtag kobles på

Normal mail-/portal-sti eksponerer **ikke** den rå admin-klient for motoren:

```
channel-intake → backgroundCapability(createAdminClient())  ← eneste sted den rå klient findes
   ├─ readSource(table, id)   faste kolonner, 4 kilder, ét id; fejl = read_error
   ├─ readPort.from(t).select  allowlist customers/customer_contacts/leads/service_cases; ingen relationer
   └─ ingest(payload)          KUN rpc('reception_ingest')
web-chat-service → webChatStore(admin)   KUN web_chat_sessions/web_chat_messages (opret session, besked, besøgsdata)
                 → backgroundCapability(admin) (som ovenfor)
retention        → rpc('reception_retention') (cron-handler bag CRON_SECRET, dry-run som standard)
```

Kompenserende DB-værn (gælder OGSÅ service_role): henvendelser/items oprettes kun inde i `reception_ingest` (GUC-markør);
kildens identitet/kunde/sag/tråd afledes af kilden; baggrund får kun forslag (aldrig approved/executed); AI-forslag kan
kun godkendes af et menneske; items er uforanderlige (undtagen retention-rydning); retention-markører kan kun sættes af
serveren; web-chat kan ikke indtages af brugere. RLS-matrix-scanneren kender `readPort` som service-role-port
(`scripts/rls-write-sites.ts`).

**Dedikeret Postgres/JWT-rolle: ikke berettiget endnu.** Den ville kræve egen signeret JWT (Supabase kender kun anon/
authenticated/service_role), nøglerotation og ændrede grants på mange tabeller. Restrisikoen er server-kode med adgang til
`createAdminClient` (samme som i dag for al cron/webhook-kode); den er begrænset af ovenstående kapabiliteter, DB-værn
og kildescanninger i testene (ingen `.from()`/`.rpc()` i channel-intake; ingen afsendere i reception-koden). Genovervej
ved trin E (offentlig chat) eller hvis en ekstern stemme-bro får skriveadgang.

## 15. Tests (samme HEAD)

Kørt 2026-11-17 på den endelige kode — **alle exit 0**:

| Test | Resultat |
|---|---|
| Staging: 00250 rollback → rollback-bevis → prøve → genanvendt | ✅ struktur = 00249 præcist · 75/75 · anvendt |
| `cli.ts reception-hub-staging` (rigtig kode mod staging) | 24/24 |
| `cli.ts reception-bg-staging` (fase 2) | 9/9 |
| `scripts/reception-hub-test.ts` (ny) | 75/75 |
| `scripts/reception-test.ts` (fase 2; nu rekursiv kildescan inkl. web-chat) | 173/173 |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| effective-permissions, employee-setup-integrity (59), grok-finance-1/-review (185), grok-finance-2, claude-finance-2-review (56), relatel, relatel-review, telephony-persist, phone-search, customer-csv-import, autolink-policy, customer-email, free-mail-domains, mail-recipient, email-template-escape, portal-response-guard, portal-sign-label, besigtigelse-task, assistant-callback-reply, customer-task-actions-touch, lead-follow-up, case-material-unknown-cost (156), material-price-plan, handover-close-guard, offer-case-type | alle PASS |
| test:time · test:profit · test:decode | PASS |
| UI (staging): U267 + U268 | 2/2 |
| UI (staging): U263, U233, U255, U11 | 4/4 |
| Prod (read-only): Relatel-smoke 15/15 · read-scope 159/159+33/33 · backfill-analysator | ✅ |

Testdækning af de krævede scenarier: ny koblet/ukoblet mail, manuelt koblet kan ikke overskrives, dublet-levering, mail-
læsefejl, portal (godkendt kunde, sag, vedhæftning), web-chat (ukendt, kendt kandidat, tvetydig, tilbud, service, nød,
menneske, lav sikkerhed, gentaget besked), urelaterede henvendelser fra samme kunde, retention dry-run/apply, rettigheder
(admin/serviceleder/salg/bogholderi), montør-afvisning, per-bruger-tilbagekaldelse, kilde-sletning, kunde-sletning, intet
sendt.

## 16. Fund (egen gennemgang)

**S1:** ingen.

**S2 (blokerer trin D/E, ikke denne review):**
- W1 Web-chat-API'et har ingen rate-limit pr. IP for nye sessioner (kun pr. session: 30 beskeder, 1.000 tegn). Ufarligt på
  staging bag flaget; SKAL på plads (IP-/fingerprint-limit + overvågning) før en ikke-offentlig pilot med eksterne
  testere (D) og før offentlig chat (E).

**S3:**
- B1 "Hent nye fra mail/portal" (fase 2, allerede i prod) er en bruger-udløst afgrænset backfill (14 dage/50). Trin C er
  derfor kun proceduremæssigt låst (admin-instruks), ikke teknisk. Kan lukkes med et eget flag, hvis ønsket.
- T1 Portal-tråd = kunde + tilbud; urelaterede portalbeskeder uden tilbud inden for 14 dage samles i én henvendelse
  (svarer til portalens egen ene chat-tråd). Kontoret kan markere håndteret → næste besked bliver ny henvendelse.
- T2 Samme mail i både kontakt@ og ordre@ bliver to items i samme tråd (to kanoniske rækker).
- M1 En senere MANUEL kobling af mailen i Indbakken opdaterer ikke henvendelsen (den bekræftes i Henvendelser).
- M2 Mail-adapteren læser `body_html` for alle mails (bruges kun til webformularer) — ydelse, ikke sikkerhed.
- R1 Ryddet titel bruger kanal-koden ("Henvendelse (email)") — kosmetisk.
- A1 Historikken i detaljen viser kun egne handlinger for ikke-admins (audit_logs-RLS, uændret).
- D1 00249's rollback i prod kræver nu, at 00250's rollback køres først (`docs/runbooks/sql/00250_rollback.sql`).
