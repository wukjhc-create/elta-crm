# Development status — checkpoint til næste session

**Opdateret:** 2026-10-17 · **Repo:** `C:\Dev\elta-crm` (`main` = prod-deploy via Vercel) · **Backlog:** [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md)

## Long-run 2026-10-17 — NEXT-27/28/29 (kun kode, ingen migrationer, intet live)
| Commit | Indhold |
|---|---|
| e016ac3a | DF-2/3/4/6/7/8/10/11 tilbud→sag→faktura (UI U183) |
| 6a94ef7e | CR-3/4/5/6/8/10/11/12 alarmer og crons (UI U184) |
| 3195fcc4 | CR-2 `INVOICE_REMINDERS_LIVE` (standard fra; prod sendte 0 i forvejen), CR-1 nødstop `FOLLOWUP_REMINDERS_PAUSED` |
| 7707d6f7 | SEC2-1/2/3/5/6, F2/F3/F4, C-F1/C-F4 sikkerhed; migrationsforslag 00241–00245 |
| 94997dfe | FIN-1/2(kode)/5/6/7/9/10/11; F4 tagtegninger; C-F1 audit-visning |
| cd52e229 | FIN-3/4/8/12; HT-2/HT-3 harness |
| 4c0bcace | DF-5 fuld kreditering frigiver kilderækker |
| 749a0806 | LC-1/3/5/6/7/8/9/10/11/12 mail/leads; TP-1/2/3/4/5/7/8/9 timer/planlægning |
| ed4d7911 | LC-2 allerede koblet mail opretter ingen ny kunde |
| b735b7a3 | DF-10 afregningsform på tilbuddet (U185) |
| a1571c66 | PM-1/2 portal-link kun til linkets kunde (S1), PM-5/6/8/9/10/11/12, OF-1/2/3/8 |
| 781bb349 | OF-6/7/9/10/11 |
| 9d7235eb | PM-4 fakturamail-router med service-klient (rykkere stadig bag INVOICE_REMINDERS_LIVE) |
| 454580e7 / 95532a6a | PM-3 portal-links (genbrug/forlæng, ingen /view-offer) |
| e8b02ab9 | OF-4 søgepris = linjepris |
| 8a04c415 | OF-5 kalkulationskost på linjerne |

Ikke lavet (tilladelse): DF-1-værnet i create-invoice-from-offer.ts blev afvist af auto-mode-værnet to gange. Patchen står i
docs/runbooks/auto-invoice-offer-guard-proposal.md. Reglen er dry_run i prod.

## Long-run 2026-10-16 eftermiddag — NEXT-21/22/23 (kun kode, ingen migrationer, intet live)
| Commit | Indhold |
|---|---|
| 8584ccf9 | Q-5 arbejdsordre-scope uden id-liste |
| f48b9310 | SEC-1/2/3/6 hjælpere uden login ikke server actions (+ assert-server-only-helpers i check:rbac), SEC-4/5; A-1 fakturamail ved ukendt udfald, A-2/5/6/8/9/10/11/13; A-12 Markér betalt kun i CRM (beslutning) |
| 46ab9f18 / 9c3f5f7c | T-1..T-4/T-6..T-10/T-12, O-2/3/5/8/10/11; ui-full afviser mellemrumsseparerede grupper (runbook ui-harness) |
| 184b807c | O-1 tilbudsrykkere som DRY-RUN (live BLOCKED), O-4 portal-sektioner, O-12 portal-afvis-regel |
| 59377465 | T-5 server-side dublet-værn på kunde-mail (00237-indeks = BLOCKED_APPROVAL) |
| b8107bd2 | ST-1/3/4/5/6/9/10/11 filer/storage |
| d95d4ccc / e99f0ba0 / 303db8e8 / 82ecf6b0 | PF-5/10/12/2/4/3/6 performance; HT-1 |
| e30abfbd / 5aeed624 / a400b21d / dbb06659 | PF-8 tid, PF-9 faner via next/dynamic, ST-7 filer ved slet, ST-2 ingen langtidslinks i DB |
| dc8491e7 / 55971f6b / 209701b2 / fbfb111f / b39f376e | NEXT-24: LF-1..4/6/7/9..13 leverandørfakturaer, DB-4 app-værn (interne dokumenter), PF-7 opgaver |
| cbc712d8 / 93f9fc7e / 03b39a24 | LF-5/8, ST-8; PF-1 forside-widgets på serveren (9 stk); MB-1 |
| 130fde1c … 05f77171 | NEXT-25 montørens telefon-flow (MB-2..MB-12) |
| 8aa79bf1 … 73eea0a2 | T-11, TM-2/3/7/8/10, O-9, RP-1/4/5/9 (NEXT-26) |
Tests: UI-grupper sales/portal-mail/economy/montor/smoke grønne pr. bølge (nye U179–U182), staging-tjek offer-reminder-plan 8/8, customer-email-dup 5/5, dashboard-stats-equivalence 4/4, concurrency 8/8.

## Prod-kørsel 2026-10-15 — 00221–00225 (Henrik: "Alle fire migrationer er GODKENDT TIL PROD")
Kontrolleret én ad gangen: pre-check → migration → post-check → målrettet regression → prod-DB-audit (0/0/0 efter hver).
| Nr | Resultat |
|---|---|
| 00221 (L-10) | Indeks kun blandt aktive; checksum incoming_invoices n=60 identisk før/efter. Matcher: samme nr. som afvist/annulleret → manuel kontrol, aktiv dublet afvises stadig (staging rejected-dup 8/8 inkl. end-to-end parseAndMatch). |
| 00222 (PE-1/PE-2) | 00205 IKKE kørt (erstattet). Fakturaer/timer/materialer/øvrige checksums identiske, 0 snapshots/flag, de 3 arbejdsordrer uændrede tal. Staging wo-profit 8/8 (kladde, udstedt/betalt, kreditnota, frossen sats, materialer, øvrige, ingen dublet-snapshot, lav-avance-flag). |
| 00225 | ACL-rettelse til 00222: Supabase default privileges gav anon EXECUTE på den nye trigger-funktion (DB-audit HØJ=1) → fjernet; audit 0/0/0. |
| 00223 (GP-1) | Før: montør læste 3 avance-rækker; efter: montør 26/26 øvrige + 0 avance, admin 29/29; data uændret. Salg/serviceleder/bogholderi verificeret på staging (calc-settings-rls 3/3) — prod har kun aktive admin/montør. |
| 00224 (GP-6) | Kode + migration samlet. Diff = rå kost, faktisk avance, ACL uden anon/PUBLIC; anon-kald → 42501; ingen falsk "pris ændret" (staging package-pricing-check 5/5); 0 pakkelinjer i prod. Rollback må ikke genåbne anon. |

| 00226 | offers.customer_id CASCADE → RESTRICT (rest af 00191; særskilt godkendt). Pre CASCADE → post RESTRICT; offers 15, signaturer 3, checksum identisk; DB-audit 0/0/0; staging offers-restrict-check 4/4; appens sletning giver dansk besked ("…kan ikke slettes — deaktivér kunden i stedet"). |

## Long-run 2026-10-15 eftermiddag (efter beslutninger)
| Commit | Indhold |
|---|---|
| 7f16427d / 0ab3df6d | Invitationer via Graph (nyt link ved gensend, gammelt ugyldigt, status i Team, audit med kanal); Graph-fejl → Pilot Health + kritisk alarm; Supabase-nødfallback logges |
| 0ce27ce0 | Alarm-politik: kritiske → admin+serviceleder straks (1/service/time); advarsler kun klokken |
| d1394d06 | Pilotfejl-flow + register |
| efa632f2 | 00226 i prod (RESTRICT) |
| c064ca8f | Efterkalkulation tilbudt vs. faktisk (500 sager, filtre, tilbudt vs. realiseret DB, timeafvigelse) |
| 171165dc | Prisafvigelser på tværs af leverandørfakturaer |
| 3ee44583 | DB pr. kunde / pr. lukkemåned |
| 1f7ea1c6 | Dashboard "Sager over estimat" |

## Beslutninger NEXT-15 (2026-10-15 aften)
| Commit | Indhold |
|---|---|
| c9a15099 | PR-2 e-conomic kill-switch (standard fra, 0 HTTP-kald) |
| a7effa69 | PR-3 kun godkendte timer faktureres |
| c1202319 | PR-1 godkend (bogholderi/admin) adskilt fra fordel til sag (admin/serviceleder) |
| 59650486 | PR-4b ingen tid uden timepris (app); DB-trigger = forslag 00230 |
| 7c775e9e | PR-6 slutfaktura på fastprissag = restbeløb af kontraktsum |
| 287f1202 | PR-10 midlertidigt momsværn + forslag 00231; beslutningstabel 00227–00230 |

## Long-run 2026-10-15 aften — migrationer 00227–00231 + planlægning
| Commit | Indhold |
|---|---|
| 7e894f6f | 00227 tidspunkt/varighed på arbejdsordrer (i prod) |
| ede447b0 | 00228 fravær (i prod) — advarsel + override + audit, bogholderi læser |
| 431fde91 | 00229 normtimer (i prod) — kapacitet i ugevisning, ingen 37-fallback |
| 5a9a62cd | 00230 sats-motor uden 495/400 (i prod) + "Mangler timepris/kostpris" i medarbejder-UI |
| 0e2e5b20 | 00231 momsmode (i prod) — 0 %/omvendt blokeret for automatisk fakturering |
| eca48f6d / branch billing-model-00232 | Eksplicit afregningsform — BLOCKED_APPROVAL (forslag + staging 5/5) |
| c91cea90 | Træk-og-slip i ugevisning |

**Manuelle blokere (Henrik):** selvregistrering OFF i Supabase · "Email OTP expiry" = 86400 s. Arbejdet fortsætter uden at vente.

## Long-run 2026-10-16 morgen (Henriks beslutninger) — checkpoint
| Commit | Indhold |
|---|---|
| c822e222 | 00232 afregningsform i prod (godkendt) |
| 782d686e | Død convert+approve-kode fjernet (X-2) |
| 009acc30 | B-2 nøgletal server-side over alle fakturaer (kun DKK) |
| 4b7381cd | X-12 slet dokumenter, X-13 opgavemenu salg/bogholderi, X-14 afregningsform ved ny sag, B-9/B-8 rapporter, B-10, S-4, S-8, S-11, M-7 |
| 1ec0bcd4 | Kode-review R-1..R-10, P-1/P-3/P-5/P-6/P-7/P-9, lead-opfølgning bag flag + 00233-forslag |
| 96ce503b / 00042ff6 | P-2/P-4/P-8/P-10/P-11, telefon i søgning |
| a74486b4 | NEXT-20 økonomi: F-1 (S1 moms-værn på fast-pris-slutfaktura), F-2..F-10; Q-4/6/7/8/9/12 |
| ce0ae73e | Q-1/Q-10/Q-11 + migrationsforslag F-5/F-11/F-12 |

Rykker-kontakter (2026-10-17): `INVOICE_REMINDERS_LIVE` (standard fra), `OFFER_REMINDERS_LIVE` (standard fra), `FOLLOWUP_REMINDERS_PAUSED` (nødstop, standard ikke sat), `CRON_PAUSED=<cron>` (hele kørslen).

BLOCKED_APPROVAL (hver kræver egen godkendelse):
- **00233 lead-opfølgning** (docs/runbooks/lead-follow-up-proposal.md) — koden ligger i prod bag `LEAD_FOLLOW_UP_ENABLED` (slået fra)
- **00234 kostkolonner på sagsmaterialer/øvrige** (docs/runbooks/cost-columns-case-materials-proposal.md) — F-11
- **00235/00236 arbejdsordre-faktura + -avance** (docs/runbooks/work-order-invoice-and-profit-proposal.md) — F-5/F-12 (kræver valg af fordelingsnøgle)
- R-11 avance 0 vs. "ikke sat" i kataloget — afklaring af datamodel
- **A-3 bank-dedup inkl. afsendernavn** [MIGRATION] — to kunders ens beløb samme dag uden tekst tælles som dublet
- **A-4/A-7 e-conomic idempotens ved timeout + betaling efter eksport** — kræver test mod e-conomic-sandbox (live-skriv)
- **O-1 live-afsendelse af tilbudsrykkere** — dry-run/forhåndsvisning er i prod (184b807c); live kræver `OFFER_REMINDERS_LIVE=true` + særskilt godkendelse
- **00237 unikt indeks på kunde-mail** (docs/runbooks/customer-email-duplicates-proposal.md) — prod-pre-check for eksisterende dubletter først
- **PF-11 indeks på incoming_emails** (service_case_id; is_archived/link_status/received_at) [MIGRATION]
- **ST-2 blanking af gamle 1-års signerede URL'er** (sent_quotes.pdf_public_url, service_case_attachments.file_url) [MIGRATION, data]
- **O-6/O-7** venter på revisionsskema 00203 i relevant miljø
- **CR-1 fuldmagt-/besigtigelsesrykkere** sendes i dag LIVE til kunder (kun `reminder_enabled`, fallback til). Fortsæt, eller bag eget live-flag (default fra)?
- **CR-11 sletning af helbredslog > 90 dage** (datasletning)
- **CR-9 per-bruger læst/afvist på alarmer** [MIGRATION]
- **RP-6 eksport-rettighed** — `reports.export` (admin/bogholderi) håndhæves ikke; serviceleder kan masseeksportere kunde-/lead-data. Håndhæve? (ændrer adgang)
- **DB-sikkerhed 2026-10-16** (docs/runbooks/db-security-2026-10-16-proposal.md): 00238 ai_suggestions margin_alert, 00239 kladdelås via status, 00240 interne dokumenter i portal (app-værn i kode), hygiejne-REVOKE; DB-8 sygefravær for bogholderi = beslutning
- **CR-1 live-flag for fuldmagt-/besigtigelsesrykkere?** Nødstop findes nu (`FOLLOWUP_REMINDERS_PAUSED=true`); default uændret (live)
- **DF-1 auto-faktura ved accept** — værnet kan ikke skrives af Claude (auto-mode-værn afviser redigering af create-invoice-from-offer.ts). Henrik: anvend patchen i docs/runbooks/auto-invoice-offer-guard-proposal.md eller tillad redigeringen. Reglen er dry_run i prod — slå ikke dry_run fra før
- **Sikkerhed/økonomi 2026-10-17** (docs/runbooks/security-2026-10-17-proposal.md):
  - 00241 webhooks: kun admin må ændre, SELECT begrænset
  - 00242 customer_documents: trigger på følsomme kolonner
  - 00243 solar-kostpris
  - 00244 kostkolonner i AI-/kalkulationstabeller
  - 00245 slutfaktura-indeks uden annullerede
- **PM-7 fuldmagtsrykker til den tiltænkte underskriver** (ændrer modtager af en live-rykker) + link til portalen
- **OF-3 insert_package_into_offer** [MIGRATION] — funktionen skriver til total_price (findes ikke); omskriv eller fjern
- **TP-6 timer på fraværsdag** — blokér, eller tillad med markering/audit på godkendelsesrækken?
- **LC-9 RLS for salg på incoming_emails** — app-gaten er på; skal salg også begrænses i DB (kun koblede/egne)?
- **CR-7 + LC-4 lease på mail-synk** [MIGRATION] — graph_sync_state.sync_lock_until + betinget UPDATE; krav pr. mail
- **SEC2-6 grænse pr. IP på kontaktformularen** — kræver lagring (hash af IP) = GDPR-/skemabeslutning
- **DF-5 delvis kreditering** — frigivelse kræver kolonnen kreditlinje → original linje [MIGRATION]
- **"Registrér også betaling i e-conomic"** (efter A-12-beslutningen) — eksplicit action: permission, ECONOMIC_PUSH_ENABLED, idempotens/dedup, eksistens-tjek, bekræftelse, audit
P-2/P-4/P-8/P-10/P-11 (round 3) — UI U178/U13/U4/U5/U43/U160/U166 grønne.

## Prod-kørsel 2026-10-16 — 00232 afregningsform (Henrik: "00232 BILLING MODEL GODKENDT TIL PROD")
Pre: ingen kolonner, 8 sager (4 sikre regning, 4 tvetydige), checksum sager 575ac56603 / fakturaer 0f690878e2. Migration →
post: service_cases.billing_model + offers.billing_model; 4 time_and_materials, 4 NULL (tvetydige — slutfaktura blokeret til
valgt på fakturafanen), checksums identiske, DB-audit 0/0/0. Staging billing-model-check 5/5; invoice-regression
U15/U26/U31/U32/U35/U162/U150/U91/U33/U29 grønne (U35-seed sætter nu afregningsform).

## Long-run 2026-10-15 nat — pilot-review NEXT-16 + NEXT-17 (kun kode, ingen migrationer)
| Commit | Indhold |
|---|---|
| 2f2efc1e | W-11 leverandørsøgning ord-for-ord + relevans, "billigst" kun samme EAN |
| 5b813a5c | W-3 katalogsøgning i "Tilføj materiale", W-9 "Påmind mig" (.ics), W-12 tilbudssøgning race/fejl/antal, lead-dropdown |
| 2df29d31 | W-18 "Kun mine" på tilbud, sikker sortering, død Placeholder-fane |
| 29130914 | W-6 dansk adgangstekst i alle inline-fejl (66 filer); NEXT-17-bølge (35 fund) |
| 558d823e | M-1 afleveringsfoto slettes ikke ved tryk, B-1 Annuller ≠ betalt, S-1 tilbudsstatus med bekræftelse |
| 9616ef57 | M-2..M-8 montørens timeformular/underskrift/Mine job |
| 6deca5e0 | B-11 testfaktura bag flag, S-10 danske lead-statusser, S-11 link i notifikation |
| 606c647f | B-5 bogføringskrav "i gang", B-4/B-2 fakturaoverblik |

| a4bf84ef | S-5 opfølgningsopgave lukkes ved accept/afvisning |
| 8e0f44b3 | S-7 mailkobling hele tråden, S-9 opret kunde fra mail kræver customers.create |
| 48f26330 | S-8 indbakkefejl, S-3 afventende ekskl. moms, B-9 "ordreindgang", "klar til lukning" over alle åbne sager (fundet under test) |
| 27c2d77f | B-6/B-7 forfaldne leverandørfakturaer (DB-filter, kun DKK) |
| fdfd9047 | S-2 inline-redigering bevarer oprindelig leverandørkost |
| 6f1569f1 / 23c9d639 | M-7 paginering af arbejdsordrer, M-8 starttid, M-12 fravær-advarsel + tidsgodkendelse-loft |
| 99d0d79b / e6607f94 | B-3 åbent beløb i fakturaoverblik, kundekort og betalingsmærke |
| ab88d248 | S-6 send på mail: CAS + aktivitet + webhook (ikke UI-testet — ingen live mail) |
| c7a5e91e / aa2c5d97 / 65b27c92 / 526fd8cc | S-4 kanban-besked, M-10 tap-mål, S-12 lettere dashboard, B-8 fane i URL, M-2 underskrift ved rotation |

| 15c1ac39 / 05fa3963 | M-4 foreslået start på tværs af arbejdsordrer, M-9 Planlægning-fanen uden N+1 |

**Slut-milepæl 2026-10-16 ~04:55:** fuld regression (ui-full, 146 tests) PASS=145, FAIL=0, U21 NOT_RUN i fuld kørsel (lå i U11-blokken uden afhængighed) → DEPS U21:[U11] tilføjet, U21+U11 PASS. Prod = `05fa396` (Vercel bygget). To tidligere fulde kørsler var ugyldige: lokal `next build` fejlede intermitterende ("fil ikke fundet" på filer der findes) → alle batches uden build; ren `next build` exit 0.

**Rest-kø (NEXT-17):** B-2 server-summer, B-9 faktureret serie, B-10 tælle-optimering, S-4 kun åbne statusser på tavlen, S-8 tællere, S-11 tilbudsnr./kunde i notifikation, B-8 rapportfiltre i URL, M-7 DB-filter. [H]: W-8 opgavemenu for salg/bogholderi, W-9 next_follow_up_at / 00197 i prod, W-17 slet dokumenter, 00232 afregningsform, momstekst/e-conomic-mapping, approveIncomingInvoiceWithConversionAction (ubrugt finance-kode).

 → (løbende checkpoint)
**Start:** 2026-10-01 20:18 dansk (18:18 UTC) · start-commit `4606dde`

| Tid (dansk) | Checkpoint |
|---|---|
| 20:18 | Start. Full regression U1–U39 kører. Forberedt: e-conomic-tjekliste "Fakturerede kunder koblet". |
| ~21:00 | `88ab138`: montør-visning uden priser (D18), Kopiér tilbud (N15), omplanlægning verificeret (N16), portal-faktura-PDF (D19), bank-advarsel (G12 — RETTET senere: fakturaer læser bank fra Vercel-env, ikke firmaindstillinger; prod-status ukendt), e-conomic-tjekliste kunder. U40–U43 grønne. `2c9daa3`: gotoSafe (regression U1–U39 væltede på navigations-timeout, ikke app-fejl). Full regression U1–U43 kører. |
| 21:35 | Regression U1–U43: 42/43 (U18 timing-flake → robust vent, grøn alene). `01387ef`: Mine timer (N17), Kun mine på leads (N18), forfald dansk kalender (D20); U44–U45 grønne. Full regression U1–U45 startet. |
| 22:09 | Regression U1–U45: 44/44 funktionelle grønne, U5 navigationsafbrud (test rettet). `ca15a79`: PDF-fixes (salg/bogholderi 500, fakturamail uden PDF, eksplicit adgang), fælles bankkilde (D21/D22, G12 korrigeret); U46–U47 + negativ kontrol. Full regression U1–U47 startet. |
| 22:39 | Regression U1–U47: 46/46 funktionelle grønne; U5-fund efter parallelle API-kald i samme kontekst (O1, observation). `23cb9d8`: lukke-værn mod ufaktureret arbejde (D23) + U48. Full regression U1–U48 startet. |
| 23:39 | U1–U48: 47/47 funktionelle grønne (U5: "network error" i lange kørsler — O1). `ccced39`: portal-tilbudslinjer uden kost/noter (D24, S2 — prod: 2 tilbud/2 kunder havde kostpris i sidedata), dashboard-forfald (D25); U49–U50 m. negative kontroller. `d7ae5ee`: 00184 forberedt (D26 sagsfotos synlige for kunde — beslutning). `a582e92`: klokke-støj (D27, system_alerts findes ikke), test-robusthed (U11/U48). Full regression U1–U50 startet. |
| 00:38 | **Første helt grønne fulde regression: U1–U51 51/51** (dev-server-genstart ved hukommelse håndteret + rapporteret — O1 årsag fundet). `10fd790` U51 grossistlinje. `96f26ec`: kundekortets mails fejlede altid i prod (D28, tvetydig join) + gate; U52 m. negativ kontrol. Full regression U1–U52 startet. |
| 01:42 | U1–U52 52/52 ✅; U1–U54 53/54 (U21 = dev-genstart, gjort robust). `cfbec0d` go-live "Opsætning før pilot" (G13, U53). `8d9da00` PGRST201-sweep (ingen flere). `e9c6ead` Opret tilbud fra lead (N20) + standard-gyldighed for salg (D30, U54). `27cd230` firmaoplysninger på sælgers tilbuds-print (D31, U55). Full regression U1–U55 startet. |
| 02:53 | U1–U55: 45/55 — alle 10 fejl efter dev-genstart, grønne i målrettet genkørsel; prod verificeret fri for test-data. `da73f44`: interne sagsbemærkninger skjult for kunden (D32, S2 forebyggende) + U56; testserver mere heap. Full regression U1–U56 startet. |
| 03:28 | U1–U56: 55/56 (U13 under dev-genstart — nu sent i kørslen takket være mere heap; grøn i genkørsel). `` D33: tilbuds-PDF til kunden uden interne noter (S2, forebyggende — 0 berørt i prod). |
| 04:01 | **U1–U56 56/56 ✅ uden dev-genstart** (mere heap virkede). `cf919b6` faktura-PDF uden intern note (D34). `d18db85` partnerportal uden interne bemærkninger. `d10ebd4`+`5ba4af6` datoer i dansk tid i PDF/sider/mails (D35, 31+17 steder). Full regression U1–U56 startet. |
| 04:26 | U1–U56: 55/56 (U11 kalender under dev-genstart). **CI var rød** siden D18 (check:rls-matrix) → rettet `d671d59` (D36); alle CI-trin + `next build` grønne lokalt. Prod read-only "Opsætning før pilot": firma ✓ CVR ✓, bank i firmaindstillinger ✗ (env ukendt), 1/2 montør-login ukoblet (G11), 2 fakturerede kunder uden e-conomic-kobling. |
| 04:36 | `45d9638`: accepteret tilbud → leads vundet (N21, U57 m. negativ kontrol). Full regression U1–U57 startet. |
| ~05:30 | U1–U57 57/57 ✅. `cdb994d` Udløbet-mærke (N22, U58). U1–U58 58/58 ✅. `94df5be` øvrige omkostninger uden kost for montør. `12fb1a8` morgenbrief (docs/OVERNIGHT-2026-10-02.md). |
| 06:29 | Slut-regression U1–U58: 54/58 — 4 fejl under netværksudfald mod staging-Supabase kl. 06:01 (UND_ERR_SOCKET "other side closed"); alle 4 grønne i målrettet genkørsel. `eba82a2` D29. Prod read-only: ingen test-data. Alle CI-trin grønne lokalt. |
| **06:41** | **SLUT.** Start 2026-10-01 20:18 → slut 2026-10-02 06:41 (dansk tid). 43 commits (`4606dde..`), heraf 25 kode/test. Se docs/OVERNIGHT-2026-10-02.md |

## Dagsession 2026-10-02 (Henriks beslutninger D24/D26/D18/D28/D27/N2/N8a)
| Tid (dansk) | Checkpoint |
|---|---|
| 14:05 | Main: `1468251` D18 (montør-omkostninger uden prisfelter, U40), N8a (lav DB = advarsel m. bekræftelse, U60 + unit), D28 app-del (bogholderi læser kundens koblede mails, U61), samlet prod-gate pre/post (`prod:batch-check pre` ✅ 6/6 i prod; `prod:verify-read-lockdown`: prod pre ✅, staging post ✅, prod post fanger 16 afvigelser = negativ kontrol). `cf824d7`/`60d3b04` docs. Branches (kode kræver kolonner — merge først efter prod-migration): `d26-internal-case-docs` (00184, U59 7/7 + negativ kontrol), `n2-time-approval` (00185, rls-read L13, U62 8/8). Staging: 00184, 00185, 00186 anvendt; rls-read 13/13 (L12 D28, L13 N2). Fuld regression på main (U1–U58, U60, U61; U59/U62 ligger på branches) startet. |
| 16:12 | Henrik: ingen passiv ventetid (regel gemt). NEXT-2 genereret fra prod read-only + kodeanalyse (N23–N34, L-SMS, L-Lager). Branches (worktrees `C:\Dev\elta-n23`, `C:\Dev\elta-wf`): `n23-case-status` = N23 sagsstatus følger arbejdet (auto I gang + Klar til lukning, U63), N26a timer/kostbudget fra tilbud, N32 menupunkt Medarbejderøkonomi; `webform-inquiries` = **D37 (S2): hjemmesidens kontaktformular blev hard-ignoreret siden 30/4 (~48 henvendelser, kun 3 website-leads)** → fanen Webhenvendelser (U64) + N24a retro-kobling af 81 kundemails (U65). Fuld regression på main kører langsomt (offers/[id] goto-timeouts under hukommelsespres; dev-server genstartet 16:01) — ikke hængt. |
| 17:03 | Test-politik (Henrik): smoke ≤10, målrettet ≤20, proces ≤30, enkelt test ≤5 min. D38: e2e kører nu mod produktionsbuild (build ~40 s–2,5 min, tests 4–50 s) + watchdog-batches `harness:ui-batches` (FAILED_TIMEOUT/kill tree/sidste output, afhængigheder automatisk) + telemetri JSONL; 533 testbrugere ryddet på staging. Målt: montør 282 s, portal-mail 308 s, 16 berørte tests i 6 batches 735 s — ingen hængende processer. Lokalt main: merge af `webform-inquiries` + `n23-case-status`, D39 (legacy-projekt fjernet fra portal-accept), N27 (cockpit: sager klar til lukning, U67), N35 (Opret lead fra mail/webhenvendelse, U68), U22 rettet til prod-prerender. Pushes efter grøn batch-kørsel + lint. |

## Nu
P0–P3 DONE · **RBAC app-lag DONE** (P-006 lukket: 317 gatet, 46 bevist undtaget, `check:rbac` blokerende i CI) · **fakturapipeline F-a–F-d DONE** (F-d prod-gate).
**Prod-migrationer 00159–00166 kørt og verificeret** (00163–00166 den 2026-09-29). Ingen prod-migration afventer.
**Venter på Henrik (beslutninger):** kundemail-crons (fakturarykkere har aldrig virket) · anon-crons · Relatel-token · pilotbrugere · agent-aktivering.
Næste ikke-blokerede: CVR-kolonne til leverandør-match (IC10, kræver migration) · døde `files.ts` · OIOUBL-parsing · prishistorik-baseret forventet pris.

## Staging-state at kende
- 00175–00186 anvendt (00184 D26, 00185 N2, 00186 D28 den 2026-10-02 — prod afventer godkendelse) · 00159–00166 anvendt · view-parity (security_invoker på betalings-views) anvendt · agent_configs seedet.
- `npm run harness:pilot-roles` = fuld rolle-regression (matrix + skrive/update-probes + R1–R4 35 checks + views + hemmelige kolonner).
- P-003 udvidet (#9): 4 crons bruger anon-klient → stille no-ops; se docs/pilot/CRON_DISCOVERY.md. Ret ikke uden beslutning (= aktivering).
- Alle cron-kørsler logges i `system_health_log` (service `cron`) via `withCronRun`.

## Faste rammer (må ikke brydes)
- Alle 7 agents disabled/suggest i prod · `AUTO_CREATE_CASES_ENABLED` OFF · ingen live kundemail, cron-/event-autonomi,
  finance, delete, Relatel/SMS · Floorplan/3D parkeret.
- Prod-DDL kun med Henriks godkendelse → `npm run prod:apply-migration -- <nr> --approved-by-henrik` (allowlist i
  `scripts/prod-apply-migration.ts`). Alt andet mod prod er read-only (`scripts/prod-readonly.ts`).
- Git: én kommando pr. kald (`git add` / `git commit -m … -m …` / `git push origin main`) — kædede kommandoer afvises.
- Kode der kræver en ny kolonne merges først efter prod-migrationen (expand/contract; push til `main` deployer).

## Vigtige kommandoer
| Formål | Kommando |
|---|---|
| UI (staging, headless) | `npm run harness:ui-e2e` — syntetiske brugere, ingen rigtige logins; skærmbilleder i %TEMP%\elta-ui-e2e |
| Staging regression | `npm run harness:agent-gating` · `harness:send-producer` · `harness:agent-actions` · `harness:planning-flow` · `harness:security` · `harness:pilot` · `harness:pilot-roles` · `harness:status` · `harness:session-lifecycle` · `harness:concurrency` · `harness:ui-states` · `harness:cron-log` · `harness:health-snapshot` |
| Statisk ops | `ui:guard-audit` · `ops:cron-check` · `ops:incident-check` · `security:actions` · **`check:rbac`** (CI) |
| Staging migration | `npm run harness:migrate-staging -- <nr>` |
| Prod read-only | `prod:db-audit` · `prod:verify-00162` · `prod:verify-00161` · `prod:role-policies` · `prod:pilot-health` · `prod:storage-audit` · `prod:verify-00159/00160` · `npx tsx scripts/prod-cron-discovery.ts` |
| Kode | `npm run type-check` · `harness:typecheck` · `build` · unit: `npx tsx scripts/agent-*-test.ts` |
| Flag | `npm run safety:flags` |

## Seneste milepæle
- 2026-09-27: 00160 (RLS) + 00159 (offers.source_case_id) kørt i prod, verificeret; Pilot Ops PROD READY.
- 2026-09-27: P0 #1–#4 (R1–R4) lukket på staging + regressionsværn; 00161 forberedt (gate); R3-kode i prod.
