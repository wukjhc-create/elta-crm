# Stage A — automatisk mail → Henvendelser: endelig præ-aktiverings-review (2026-11-19)

Branch `claude-stage-a-preflight` (fra prod-main `6f901e2c`). Stage A er IKKE aktiveret. Ingen RECEPTION_*-flag, Nila
eller Relatel er rørt. Prod er kun læst (read-only) eller simuleret i transaktioner der altid rulles tilbage.

## 1. Mailens vej i produktion (verificeret i koden og prod-skemaet)
```
Microsoft Graph (kontakt@, ordre@; crm@ inaktiv siden feb.)
 → /api/cron/email-sync (vercel.json "0 5 * * *" = ÉN gang i døgnet kl. 05 UTC) eller /api/email/sync (manuel)
 → runEmailSync → syncOneMailbox (delta-link pr. postkasse i graph_sync_state)
 → incoming_emails (upsert onConflict graph_message_id, ignoreDuplicates)     ← kanonisk kilderække
 → linkAndAnalyze: linkIncomingEmail (afsender→kunde) + processEmailIntelligence (AI, kun når ukoblet/videresendt)
 → ingestEmailSource (RECEPTION_EMAIL_INGEST_ENABLED + _SINCE)                 ← Stage A-adapteren
 → receptionBackgroundIngest (deterministisk motor; AI kun med RECEPTION_LLM_ENABLED) → reception_ingest (DB, atomisk)
 → conversations / conversation_items / conversation_actions (kun forslag)
 + NY: sweepMissedEmailIntake én gang pr. kørsel (afstemning af fejlede indtag, se §5)
```
| Spørgsmål | Svar (prod-skema) |
|---|---|
| Graph-besked-id | `incoming_emails.graph_message_id` (UNIK — anden levering afvises med 23505) |
| Tråd-id | `incoming_emails.conversation_id` (Graph conversationId) → `conversations.thread_key = 'mail-thread:' || md5(...)` |
| Først opdaget | `incoming_emails.created_at` (DEFAULT now() ved insert) — grundlaget for "ny" |
| Modtaget hos Microsoft | `incoming_emails.received_at` (bruges IKKE til berettigelse) |
| Indgående vs. udgående | sendte mails indsættes af `insertSentEmail` (Sent Items) og går aldrig gennem `linkAndAnalyze`/indtag; afsender `@eltasolar.dk` → `skipped: own_mailbox`; `reception_source_identity` sætter direction='inbound' |
| Ignoreret/intern | `link_status='ignored'` (nyhedsbreve/system) → adapter returnerer null → `skipped: ignored`; egne postkasser → `own_mailbox` |
| Manuel kobling | `linked_by='manual'` + `customer_id` → bekræftet kunde (automatik kan aldrig overskrive; trigger `trg_incoming_emails_reception_reconcile` afstemmer henvendelsen ved senere manuel kobling) |
| Dubletter | DB: unik graph_message_id; unik `conversation_items (source_table, source_id)`; advisory-lås pr. kilde i `reception_ingest` |
| Genforsøg | mail-sync: rækker med `link_status='pending'` + `processed_at IS NULL`, opdaget ≤ 14 dage (`to_email` = postkassen — den gamle `mailbox_source`-fejl er rettet og virker mod prod-skemaet); NY afstemning for fejlede indtag |

## 2. Produktionens mail-sundhed (read-only, `scripts/prod-stage-a-mail-health.ts`)
| | |
|---|---|
| sidste vellykkede sync-kørsel | 2026-11-19 05:01 UTC (kontakt@ 05:01, ordre@ 05:00; crm@ sidst feb. — inaktiv) |
| sidste fejlede | 2026-11-13 05:04 (cron) — ingen aktuelle sync-fejl |
| indgående mails i alt / nyeste modtaget / nyeste opdaget | 881 / 2026-11-19 00:22 / 2026-11-19 05:01 |
| opdaget sidste 24 t / 3 d / 7 d | 2 / 10 / 18 |
| ventende (pending) i alt / i genforsøgsvinduet | 59 / **0** |
| manuelt koblet / automatisk koblet / ukoblet indgående | 4 / 262 / 659 |
| dublet-graph-id'er | 0 |
| opdaget > 2 døgn efter modtagelse | 109 (derfor opdagelses-reglen) |
| **sync-kadence** | i praksis ÉN kørsel i døgnet ~05:00 UTC; opdagelses-forsinkelse p50 15,6 t, p90 22,6 t |
| tvetydige | linkeren markerer ikke tvetydighed på kilden; motoren klassificerer den (bevist: `ambiguous`, ingen kunde) |

## 3. Aktiverings-semantik (præcis)
- Indtag kræver BÅDE `RECEPTION_EMAIL_INGEST_ENABLED=true` OG gyldigt `RECEPTION_EMAIL_INGEST_SINCE`.
- `SINCE` skal være et fuldt ISO-tidspunkt MED tidszone (`…Z` eller `±hh:mm`). Mangler/ugyldig/uden zone ⇒ `since_not_configured`
  ⇒ intet indtag (fail closed) + reception-sundhedsrække 'warning' (config_error). **Ny i denne review** (før blev en værdi uden
  zone fortolket i serverens lokale tid).
- "Ny mail" = `created_at` (først OPDAGET af CRM) ≥ SINCE og ≤ 14 dage gammel. Modtaget-tiden bruges ikke ⇒ Microsoft-udfald
  på 49 t / 3 d / 7 d mister ingen mail. Alt opdaget før SINCE er historik og kræver den eksplicitte backfill
  (`RECEPTION_BACKFILL_ENABLED`, standard FRA, teknisk spærret).

## 4. Tests
| Test | Resultat |
|---|---|
| `scripts/stage-a-email-ingest-test.ts` (ren/statisk: flag + SINCE-format, A–G, egne postkasser, læsefejl, ingen falsk succes, afstemnings-udvælgelse, ingen afsender-import i indtagsvejen, ingen udførelse, sendte mails indtages aldrig, logning uden indhold, backfill gated, intet reception-cron) | 51/51 |
| `cli.ts stage-a-staging` (RIGTIG kode mod staging, flag kun i kaldet) | 40/40 |
| `scripts/prod-stage-a-simulate.ts --days 7 / 14` (rigtig kode mod rigtige prod-mails, rollback-only) | 6/6 · 6/6 |

`stage-a-staging` dækker: A ny mail → created (ukoblet afsender → `no_match`); B/C/D udfald 49 t/3 d/7 d → created; E historik →
skipped; F gammel ventende række → skipped; uden SINCE / SINCE uden zone → fail closed; flag fra → disabled; samme mail to
gange → duplicate (1 item); samme Graph-besked to gange → 23505; to samtidige indtag → created+duplicate (1 item); DB-timeout →
`error` (intet item) → afstemningen indtager ved næste kørsel (1 item), afstemning igen idempotent, historik stadig ikke
importeret; afstemning med flag fra → intet; AI fejler → oprettet deterministisk; læsefejl → `read_error`; egen postkasse →
skipped; svar i samme tråd → appended; samme emne anden tråd → separat; samme afsender to tråde → to henvendelser; manuel →
`confirmed`; automatisk → kun kandidat (`unique_match`); to kunder samme e-mail → `ambiguous`, ingen kunde; kun navn → ingen;
manuel + kundens sag → `confirmed` sag; automatisk + sag → ingen sag (`several_open`); flere åbne sager → ingen sag; sags-
konflikt / kunde-konflikt / kandidat-konflikt i tråd → separat; fremmed i kundens tråd → eget item og egen afsender-label,
fremmedes mail kobles ikke til kunden; håndteret henvendelse genåbnes ikke (ny); kun forslag/blokeret; 0 udgående rækker;
eksisterende henvendelser uændrede; præcis ét item pr. mail.

## 5. Fund
**S1:** ingen.

**S2-1 (rettet): et mislykket indtag blev aldrig forsøgt igen.** Mail-sync'ens genforsøg tager kun `pending`-rækker; når
koblingen lykkedes men `reception_ingest` fejlede (timeout, afbrudt kørsel), fik mailen aldrig en henvendelse. Ny
`sweepMissedEmailIntake` (én gang pr. kørsel, kun når Stage A er slået til): indgående mails opdaget ≥ SINCE og ≤ 14 dage,
ikke pending/ignored, ikke egne postkasser, UDEN item → `ingestEmailSource` (højst 25 pr. kørsel). Idempotent via DB-
unikheden. Bevist på staging.

**S2-2 (RETTET 2026-11-21): mail-sync hvert 5. minut + kørsels-lease (00253).** Henrik bekræftede Vercel **Pro** i
dashboardet (historikken viser tre tidligere nedgraderinger pga. Hobby: `348674c7`, `513320f2`, `5c745192`). `vercel.json`:
KUN `/api/cron/email-sync` ændret `"0 5 * * *"` → `"*/5 * * * *"` (cron-registeret og rutens kommentar opdateret).
Fundet undervejs: der var INGEN kørsels-lås. Prod-kørsler: p50 75 s, p95 128 s, **max 241 s** (maxDuration 300 s) → med
5-minutters cron (og manuel "Hent nye") kunne to kørsler overlappe og begge behandle samme ubehandlede mail (dobbelte AI-kald,
mulige dublet-kunder). Indsættelse (`graph_message_id` UNIQUE) og henvendelser (`reception_ingest`, idempotent pr. kilde) var
allerede sikre. Rettelse: migration **00253** `sync_leases` + `sync_lease_acquire/release` (service_role, ingen tabel-adgang,
atomisk overtagelse kun af udløbet lease) og `runEmailSync` kører kun via leasen `email-sync` (TTL 330 s): optaget →
kørslen springes over (`skippedReason: 'already_running'`, success); låsefejl → springes over (fail closed); 00253 mangler →
kører uden lås som før + advarsel. Bevis: `sync-lease-test` 17/17, staging-prøve 10/10 + rollback-bevis eksakt, staging
samtidighed 5/5 (12 parallelle acquire → 1 vinder; lang kørsel + ny planlagt → ny springes over, aldrig 2 samtidigt; fejlet
kørsel frigiver; dræbt kørsel blokerer til TTL), prod-dry-run 00253 [NY] 6/6 + [UÆNDRET] 1/1 (rollback → præcis
før-struktur `72bc9f83…`).

**S3 (rettet):** SINCE uden tidszone afvises nu; observerbarhed (struktureret log med mail-id, henvendelses-id, udfald og
årsag — aldrig emne/afsender/brødtekst; tællere i `EmailSyncResult.henvendelser`; én `system_health_log`-række pr. kørsel med
service `reception` — ikke i ALL_SERVICES, påvirker ikke driftsstatus/alarmmails); `prod-portal-exposure-current.ts` måler nu
den faktiske synlighed (`customer_visible`; prod: 0 synlige, gammel titelregel 6 — alle skjulte).

**S3 (registreret):**
- En afsender UDEN identitet i en Microsoft-tråd med FLERE åbne henvendelser føjes til den senest aktive. Mailen forbliver
  ukoblet, har egen afsender-label, og intet udføres/sendes. Ved én åben henvendelse i tråden føjes den til den.
- De 32 eksisterende henvendelser har ingen tråd-nøgle (oprettet før 00250) → et svar i deres tråde efter aktivering bliver en
  ny henvendelse (sikkert; kan give to henvendelser om samme emne).
- Samme mail til både kontakt@ og ordre@ har to Graph-id'er → to henvendelser (beslutning fra fase 3A: behold begge; prod har
  0 sådanne par).
- Mail-sync forsøger først med kolonnerne `mailbox_source`/`internet_message_id` (findes ikke i prod) og gentager uden —
  forudeksisterende, ufarligt.

## 6. Kunde/sag (bevist på staging + prod-simulering)
Manuel = bekræftet (kan aldrig overskrives) · automatisk unik = KUN kandidat · tvetydig = `ambiguous`, ingen kunde · intet match
= `no_match` · læsefejl = `read_error` (aldrig no-match) · intet navne-match · sag kun når mailen er MANUELT koblet til samme
kundes sag; flere åbne sager ⇒ ingen sag; prisforespørgsel/serviceønske/andet fra samme kunde i forskellige tråde ⇒ separate
henvendelser. Tråd-append kræver samme Graph-tråd + ingen kunde-/sags-/kandidat-konflikt + ikke håndteret + ≤ 30 dage.

## 7. Intet udgående (bevis)
Statisk (test): ingen afsender-import (Graph-send, e-mail-service, SMS, Relatel, Nila, portal-send, webhooks) i indtagsvejens
moduler; baggrundsindtaget kalder aldrig `executeApprovedActions`; `EXTERNAL_SENDS_ENABLED = false as const`; sendte mails
indtages aldrig; intet reception-cron. Dynamisk (staging): 0 nye rækker i sms/e-mail-log/udbakke/portal/opgaver/tilbuds-
aktivitet; alle handlinger `proposed`/`blocked`. Prod-simulering: kun `proposed`/`blocked`.

## 8. Prod-simulering (rollback-only — "hvad ville der ske")
| Vindue | Mails | Udfald | Nye henvendelser |
|---|---|---|---|
| 7 døgn | 20 | 2 created · 11 duplicate (allerede kilde i de 32) · 5 ignored · 2 egne | 2 — `no_match`, ingen sag, normal hastegrad, handoff; forslag: append_communication (proposed), create_callback (blocked) |
| 14 døgn | 41 | 2 created · 28 duplicate · 9 ignored · 2 egne | samme 2 |
0 fejl/læsefejl; de 32 og deres 69 handlinger uændrede; præcis ét item pr. mail; anden kørsel → alle duplicate.

## 9. Baseline (før aktivering) og sammenligning
`npx tsx scripts/prod-stage-a-monitor.ts baseline --save stage-a-baseline.json` — 2026-11-19: 32 henvendelser, 32 items,
69 handlinger (48 proposed / 21 blocked), conv-md5 `35bc187a…`, handlings-md5 `c35c3ebc…`, items-md5 `a0f8d4a4…`.
Efter aktivering: `prod-stage-a-monitor.ts after --since <SINCE> --baseline stage-a-baseline.json` — pr. ny mail: mail-id →
henvendelses-id, ny/eksisterende, kanal, kunde- og sagstilstand, hastegrad, items; mails uden item med årsag; reception-
sundhed; 0 SMS/opkald; baseline uændret. (Kørt i dag som tørkørsel: viser korrekt de 2 nye mails UDEN item, da Stage A er fra.)

## 10. Anbefalet aktivering (NÆSTE trin — kræver Henriks godkendelse)
Kun Stage A. Forbliver FRA: PORTAL_INGEST, WEBCHAT, BACKGROUND, BACKFILL, RETENTION_APPLY, UPLOAD_LINKS, LLM.
**Rækkefølge: 00253 FØR koden** — koden tåler at 00253 mangler, men så kører 5-minutters cron'en uden lås.
0. Henriks godkendelse af 00253 (nr/formål/risiko/pre-post — denne runbook §5 S2-2).
1. Baseline: `prod-stage-a-mail-health.ts`, `prod-stage-a-monitor.ts baseline --save`, `prod-stage-a-simulate.ts --days 7`,
   `prod-00253-dryrun.ts` (rollback-only) → alle PASS.
2. Anvend KUN 00253: lokal APPROVED-linje + `npm run prod:apply-migration -- 00253 --approved-by-henrik`; verificér tabel +
   funktioner, ACL (kun service_role), struktur ændret kun med 00253.
3. Fast-forward main til den endelige Stage A-HEAD (ingen merge/rebase/force); vent til Vercel **Production** er `success`
   for præcis den SHA (tjek `environment: Production` — ikke en preview af samme SHA).
4. Bekræft cron i produktion: Vercel → Project → Settings → Cron Jobs viser `/api/cron/email-sync` = `*/5 * * * *`;
   `system_health_log` (service `cron`, cron `email-sync`) får en række ca. hvert 5. minut; ingen `already_running`-storm.
5. Bekræft alle reception-flag FRA (Vercel env + adfærd: `prod-stage-a-monitor.ts` — 0 henvendelser siden deploy).
6. Sundhed + simulator igen (`prod-stage-a-mail-health.ts`, `prod-stage-a-simulate.ts --days 7`).
7. Notér aktiveringsøjeblikket T i UTC, fx `2026-11-21T10:30:00Z` — ALDRIG en tidligere dag.
8–10. Vercel → Production env: `RECEPTION_EMAIL_INGEST_SINCE=T`, `RECEPTION_EMAIL_INGEST_ENABLED=true`; alle øvrige
   RECEPTION_* uændret FRA.
11–12. Redeploy SAMME kode (env gælder kun nye deployments); bekræft ny Production-deployment live (samme SHA).
13. Kontrolleret sync: vent på næste 5-minutters kørsel (eller ét manuelt "Synkronisér" — leasen forhindrer overlap).
14. `prod-stage-a-monitor.ts after --since T --baseline …`.
15. Gennemgå de første rigtige mail → henvendelse-koblinger i UI: samme kilde, afsender, kundetilstand (kun kandidat, aldrig
   bekræftet automatisk), sag, tråd, hastegrad; kun forslag; **intet svar sendt automatisk** (Stage A kan ikke sende).

## 11. Rollback / nødstop
**Nødstop A (henvendelser):** `RECEPTION_EMAIL_INGEST_ENABLED=false` + redeploy. Mail-sync fortsætter; henvendelser
forbliver; afstemningen er no-op; ingen mail slettes.
**Nødstop B (selve mail-sync'en, uden kodeændring):** `CRON_PAUSED=email-sync` + redeploy (`withCronRun` → kører intet,
logges warning). Manuelt "Synkronisér" virker stadig.
**Kode:** Vercel "Promote" af forrige deployment (`6f901e2c`, daglig cron, intet Stage A). 00253 må blive (den gamle kode
bruger den ikke); rollback-SQL `docs/runbooks/sql/00253_rollback.sql` kun EFTER kode-rollback eller med cron'en tilbage på
daglig.
**Dårlig henvendelse i piloten:** slet aldrig kildemailen. I Henvendelser: afvis kundematch (`rejectHenvendelseCustomer`),
afvis forslag (`decideHenvendelseAction` → reject) og markér håndteret. Forkert kunde på selve mailen rettes ved manuel
kobling i Indbakken — triggeren afstemmer henvendelsen (auditeret).

## 12. Kørsler på review-HEAD
| | |
|---|---|
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| stage-a-email-ingest-test · stage-a-staging · prod-simulering 7/14 d | 51/51 · 40/40 · 6/6 + 6/6 (rollback-only) |
| reception-hub-test (00250) · reception-test (00249) · reception-hub-staging · reception-bg-staging | 143/143 · 173/173 · 33/33 · 9/9 |
| portal-security-test · portal-security-staging (00252) | 71/71 · 50/50 |
| 166 regressionssuiter + test:time/profit/decode | 136 grønne; de 30 røde er identiske (exit + antal FAIL) med prod-main `6f901e2c` — forældede statiske UI-tekst-tjek + kendt `work-order-employee-check-test`; registreret separat |
| grønne bl.a. | effective-permissions, employee-setup-integrity (59), grok-finance-1/-2 + reviews, claude-finance-2-review, relatel, relatel-review, telephony-persist, autolink-policy, customer-email, free-mail-domains, mail-recipient, tilbud/faktura/kunde/sag |
Adapter-invarianten (kanal-adapteren får aldrig den rå admin-klient) fangede første udkast af afstemningen; læsningen ligger
nu i mail-sync'en (`sweepMissedEmailIntake` i email-sync-orchestrator), udvælgelse/indtag i channel-intake.

## 13. Drift efter aktivering (Stage A aktiv siden 2026-11-22T06:17:00Z)
`00250`-dormancy-tjekket ("0 nye henvendelser") gælder ikke længere. Det afløses af
`npx tsx scripts/prod-stage-a-ops.ts [--since ISO] [--retry-min 15]` (read-only, kun antal/UUID'er, exit 2 ved kritisk fund).
Aktiverings-baseline: `scripts/data/stage-a-baseline-2026-11-22.json` (de oprindelige 32: id + md5; 32 items, 69 handlinger,
48 proposed / 21 blocked). Første Stage A-resultat: 33 / 33 / 71 (testmail til kontakt@, 2026-11-22 08:11 UTC).

**Forventet:** henvendelser fra egnede indgående mails opdaget efter aktivering (webformular-mails får kanalen web_chat, men
kommer fra incoming_emails). **Kritisk → overvej nødstop A** (`RECEPTION_EMAIL_INGEST_ENABLED=false` + redeploy samme kode):
godkendte/udførte handlinger · automatisk udgående (SMS, opkald, automatiske portal-svar) · dublet-kilde/-item/Graph-id ·
egnet mail uden item efter retry-vinduet · historisk mail indtaget · indtag fra web-chat/portal/SMS/telefon/upload · backfill
eller retention · kandidat-kunde/sags-kandidat bekræftet uden manuel kobling · svar i forkert Microsoft-tråd · urelaterede
tråde flettet · tvær-kunde-tråd · manuel kobling overtrumfet · item tilføjet en håndteret henvendelse · de oprindelige 32 ændret
uden menneskelig handling. **Advarsel:** sync-pause > 12 min, sync-/lease-fejl, udløbet lease, behandlings-/læsefejl.
Menneskelig CRM-kommunikation (medarbejder-svar i portalen, egne sendte mails) vises særskilt og er ikke en Stage A-fejl.
Rapporterer pr. kørsel: indgående, egnede, oprettede, tilføjede, ignorerede/system, egne ELTA-mails, ukendt/kandidat/bekræftet/
tvetydig/læsefejl, sags-kandidat/bekræftet sag, behandlingsfejl, proposed/blocked/executed, mail-sync-kadence (seneste
kørsel, varighed p50/max, already_running, lease_error, fejl, lease-tilstand) og afstemnings-genforsøg (sweep_*).
Kør dagligt de første 2 uger og efter enhver deploy; tving aldrig overlap i produktion.
