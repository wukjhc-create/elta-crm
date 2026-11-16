# ELTA AI-receptionist + kommunikations-backbone — Fase 2 (CRM/AI-hjernen)

Status: **klar til review** · branch `claude-ai-receptionist-phase-2` (fra fase 1-branchen, som er fra main `a1c17320`) ·
**intet deployet til produktion** · migration **00249 kun på STAGING** · Nila uændret · Relatel-flag uændret ·
ingen opkald/SMS/mail sendt. Forgænger: `ELTA_AI_RECEPTIONIST_PHASE_1.md`. Stemmetransport: `VOICE_TRANSPORT_DECISION.md`.

## 1. Godkendte beslutninger, som koden håndhæver
| # | Beslutning | Hvor |
|---|---|---|
| 1 | CRM ejer al logik/tilstand | Engine udfører intet; handlinger går gennem eksisterende server-actions (`createCustomerTask` …) |
| 2 | Nila er midlertidig | Ingen Nila-kode; voice-note §A/B/C |
| 3 | Indbakken hedder Henvendelser | `/dashboard/henvendelser`, menupunkt, `conversations.*` |
| 4 | Nye kunder = forslag, medmindre deterministisk identificeret | `create_customer_proposal` er altid forslag (forbudt ved unikt match, handoff ved læsefejl) |
| 5 | Telefonnummer ≠ autentifikation | Oplysningsniveau L1 for nummer/afsender-mail; L2 kræver bekræftet fakta; L3 kun portal/stærk verifikation |
| 6 | Ingen permanent lyd | Ingen lyd-felter; kun transskriptions-*reference* + status + `transcript_purge_after` |
| 7 | AI lover aldrig pris/dato/garanti/compliance/annullering/fakturaændring/udsendelse | `FORBIDDEN_COMMITMENTS` (ingen værktøjer) + svar-værn `replyViolations` |
| 8 | Ekstern SMS/mail/opkald FRA | Ingen afsender i receptionist-koden (statisk testet); `EXTERNAL_SENDS_ENABLED = false` uden env-nøgle |
| 9 | OpenAI primær bag fælles abstraktion | `src/lib/ai/ai-client.ts` |
| 10 | Stemmetransport løses separat | `VOICE_TRANSPORT_DECISION.md` |

## 2. Hvad er bygget

### 2.1 Fælles AI-klient — `src/lib/ai/ai-client.ts`
- Server-only (ikke `'use server'`, registreret i `assert-server-only-helpers.ts`; nøglen forlader aldrig serveren).
- `AI_TASKS` = model/temperatur/tokens/timeout ét sted. `AiProvider`-interface (OpenAI i dag; fake i tests).
- `aiChat` / `aiStructured(validator)` → `{ ok: true, data } | { ok: false, error: { code, retryable, status? } }`.
  Fejlkoder: `not_configured, budget_exhausted, budget_unavailable (fail-closed), timeout, provider_http, provider_network,
  empty_response, invalid_json, schema_invalid`. **En leverandørfejl er aldrig et tomt resultat.** Logs uden nøgler/svartekst.
- Migreret: `ai-mail-assistant.ts` (samme brugertekster). Bevidst IKKE migreret i fase 2 (stor/ikke-receptionist-adfærd):
  `email-intelligence.ts`, `mail-agent.ts`, `auto-case.ts`, `auto-offer.ts`, `assistant/voice.ts` → fase 3-oprydning.

### 2.2 Kanonisk telefon + identitets-matcher
- `src/lib/utils/phone.ts`: `canonicalPhone` (= Relatel-format), `samePhone`, `localPhoneDigits`; `relatel/phone.ts` og
  CSV-importens `phoneDigits` delegerer nu hertil (én implementering; adfærd uændret, testet).
- `src/lib/reception/identity-match.ts`: `classifyIdentity` (ren) + `matchIdentity(client, input)` (RLS-klient).
  Nøgler: telefon, e-mail (pladsholdere ignoreres), kundenummer, kontakt-id. Udfald `unique_match | ambiguous | no_match |
  insufficient_information | read_error`. **Læsefejl bliver aldrig no_match.** Ingen navne/fuzzy. Nøgler der peger på
  forskellige kunder → `ambiguous`. Leads vises som lead-kandidater, aldrig konverteret.

### 2.3 Oplysningsniveauer — `src/lib/reception/disclosure.ts` (deterministisk, ingen LLM)
L0 ukendt/tvetydig → kun firmaviden · L1 kandidat via nummer/mail → må bekræfte kundeforhold, ingen sagsdata ·
L2 L1 + bekræftet (postnr. **og** vejnavn, eller sagsnummer) → ikke-følsom sagsstatus og besøgsdato *som information* ·
L3 portal-token/fremtidig engangskode → kontodata/dokumenter. To mislykkede bekræftelser → L0 + handoff. Ingen adgangskoder
eller sikkerhedsspørgsmål.

### 2.4 Handlings-politik — `src/lib/reception/action-policy.ts`
`evaluateAction(action, ctx) → auto | proposal | handoff | forbidden`. Ukendte handlinger og alle forretningsbindende
tilsagn er `forbidden`. Henvendelses-niveau handoff ved: nød/sikkerhed, ingen strøm, klage/tvist, utilfreds kunde,
menneske ønsket, fakturaændring, annullering, garanti, compliance, tvetydig identitet, identitets-læsefejl, mislykket
bekræftelse, manglende transskription, confidence < 0,7. Flere åbne sager → opgave er forslag (menneske vælger sag).

### 2.5 Domænekontrakt — `src/lib/reception/contract.ts`
`InboundCommunication` (provider, providerEventId, channel, direction, occurredAt, sender-kandidat, kunde-/sags-match-
tilstand, title, message ≤ 500, transcript {state, ref}, attachments, urgency, requestedActions, assigned, processingState,
dedupeKey, source {table, id}) + `validateInbound`. Ingen rå leverandør-payload.

### 2.6 Reception Engine — `src/lib/reception/engine.ts` + `signals.ts` + `llm-classify.ts`
`runReceptionTurn(message, ports)`: identitet → niveau → signaler/intent (nøgleord; valgfri LLM via `RECEPTION_LLM_ENABLED`,
som kan forfine men **aldrig fjerne nød-/klage-signaler eller sænke hastegraden**; uenighed sænker confidence) → sag →
planlagte handlinger → politik → handoff → svar fra faste skabeloner (efterprøvet af `replyViolations`). Engine har ingen
DB/netværk — alt via porte. Samme motor bruges af simulatoren, Henvendelser-indtag og (fase 3) web-chat/stemme.

### 2.7 Datamodel — migration **00249** (`supabase/migrations/00249_henvendelser_backbone.sql`)
Gennemgang af fase 1-forslaget mod skemaet: `conversation_transcripts` blev **ikke** til en tabel (kun reference/metadata
på items, da intet transskriberes endnu); upload-links kræver en tabel (token-hash). Mindste model:
- `conversations` (henvendelsen; kunde/sag = kandidat-felter indtil bekræftet — CHECK: `customer_id` kræver `confirmed`)
- `conversation_items` (peger på kilden; UNIQUE på dedupe-nøgle, (source_table, source_id) og (provider, provider_event_id))
- `conversation_actions` (politik-udfald + tilstand; UNIQUE (conversation_id, idempotency_key); forbudte kan aldrig udføres)
- `upload_requests` (kun SHA-256 af tokenet; udløb ≤ 14 dage; kvote; tilbagekaldelse er endelig)
- `conversation_visible(channel, customer_id)`: conversations.view **og kanal-ret** (telefon: `calls.view`; mail/web:
  `customers.emails.view` eller `inbox.view`) **og** (bekræftet kunde i læse-scope eller ukoblet + `view_unmatched`).
- Nøgler: `conversations.view` (admin/serviceleder/salg/bogholderi), `conversations.view_unmatched` (admin/serviceleder),
  `conversations.manage` (admin/serviceleder/salg/bogholderi). Katalog 117→120, standarder 281→291.
- Ingen DELETE for authenticated; items uforanderlige; actions: eksplicitte overgange, afsluttede rækker låst,
  `decided_by`/`handled_by` = den indloggede; match-ændringer kræver `match_version + 1`. anon: intet.

### 2.8 AI-aktøren `ai_receptionist` — `src/lib/reception/ai-actor.ts` + `henvendelser-core.ts`
Ingen DB-rolle, ingen service-role. I fase 2 udføres handlinger altid på vegne af en indlogget medarbejder med dennes
RLS-klient. Effektiv ret = **medarbejderens rettigheder ∩ aktørens allowlist ∩ politikken**. Auto-tilladt: find_customer/
contact/case, append_communication, create_task, create_callback, create_planning_request. Kun forslag: kunde-/sagsforslag,
dokumentanmodning, afslut. Audit: `ai_receptionist.<handling>` med `on_behalf_of`. **Fund:** `createServiceCase` sender en
bekræftelsesmail til kunden → receptionisten kalder den aldrig; et godkendt sagsforslag oprettes af et menneske i den
normale formular.

### 2.9 Henvendelser — `/dashboard/henvendelser` (`src/lib/actions/henvendelser.ts`)
Liste: kanal, tid, kunde/match-tilstand, sag/match-tilstand, AI-resumé, haster, ansvarlig/team, status, næste handling.
Filtre: nye/ubehandlede, haster, kræver medarbejder, telefon, mail, SMS, portal/chat, tildelt mig, mit team, alle.
Detalje: åbn kunde/sag, bekræft kandidat, afvis, vælg anden kunde (søg) og sag, opret opgave (eksisterende action),
tildel/overdrag (team/medarbejder), afslut, godkend/afvis AI-forslag, opret/luk upload-link. "Hent nye fra mail/portal"
indtager seneste 14 dage som **forslag** (intet udføres automatisk). Tekst-simulator (admin/serviceleder) kører motoren mod
CRM'et; "gem" opretter henvendelsen og udfører auto-handlinger. Bekræftede henvendelser vises i den **eksisterende**
kundetidslinje (ny kilde `inquiries`, kind `inquiry`; ingen ny tidslinje).

### 2.10 Kanal-adaptere — `src/lib/reception/adapters.ts`
Mail (manuel kobling → bekræftet; auto-kobling → kandidat; FormSubmit: afsenderen er aldrig kunden — formularens
telefon/mail bruges), portal (kundens beskeder → bekræftet; medarbejderens springes over), telefoni (00247-model:
`customer_id` → bekræftet, forslag → kandidat, transskription `unavailable`; **læses ikke i fase 2**, persistens er FRA),
SMS (fundament: kun indgående; tabellen har i dag kun udgående).

### 2.11 Engangs-upload-link — `src/lib/reception/upload-links.ts`, `/upload/[token]`
Kontoret opretter linket på en henvendelse med **bekræftet kunde**; linket vises én gang og **sendes ikke**. Siden viser
ingen kundedata. Filer: kun JPG/PNG/WEBP/HEIC/PDF, **indholdet tjekkes**, max 9 MB samlet pr. afsendelse (server-action-
grænsen er 10 MB), kvote reserveres med optimistisk lås og gives tilbage ved fejl. Gemmes som INTERNE kundedokumenter på
kunden/sagen og som item på henvendelsen (kun hvis henvendelsens kunde stadig er linkets kunde; kundeskift lukker åbne
links). Bag flaget `RECEPTION_UPLOAD_LINKS_ENABLED` (standard FRA).

## 3. Arkitekturændringer i forhold til fase 1
- Voice-variant "Relatel → SIP" udgår (Relatel har ingen SIP trunking) → `VOICE_TRANSPORT_DECISION.md` (A/B/C).
- `conversation_transcripts` er udskudt (metadata på items); `upload_requests` er tilføjet.
- Kanal-ret i synligheden (telefon/mail) — fra den strukturelle review.
- Tekst først: hjernen (motor, politik, aktør, indbakke) er færdig og testbar uden stemme.

## 4. Migration 00249 — status og beviser
| Trin | Resultat |
|---|---|
| Strukturel review (uafhængig agent) | 4 høje + 4 mellem + 5 lave fund — **alle rettet** (§6) før anvendelse |
| `cli.ts reception-00249-probe` (staging, rollback-only) | **48/48** (personaer uden overrides: admin, serviceleder, salg, bogholderi, montør, anon) — staging uændret efter |
| `cli.ts reception-00249-rollback-proof` (rollback-only) | Filens ROLLBACK-blok efterlader 0 tabeller, 0 funktioner, 0 nøgler, 0 standarder |
| Anvendt på **staging** (`migrate-staging 00249`) | før: katalog 117/281 · efter: 120/291, 4 tabeller, 11 politikker, anon-grants 0, token_hash ulæselig, kernetabellers fingeraftryk uændret |
| Produktion | **IKKE anvendt.** Kræver Henriks særskilte godkendelse (nr/formål/risiko/pre-post). Rækkefølge: PUSH kode (tåler manglende tabeller: "ikke slået til") → MIGRATION → POST-CHECK |

Rollback efterlader bevidst audit-rækker og kundedokumenter/filer modtaget via upload-links (de hører til kunden/sagen).

## 5. Test
| Suite | Resultat |
|---|---|
| `scripts/reception-test.ts` (ny) | **130/130** — telefon, matcher (inkl. læsefejl), niveauer/bekræftelse, politik, 17 engine-scenarier, LLM kan ikke omgå politik, AI-klientens fejltyper, AI-aktør (tilbagekaldt ret/allowlist), adaptere/kontrakt, upload-tjek (udløb/lukket/kvote/indhold/størrelse/flag), ingen afsendere/netværk i receptionist-koden, idempotent indtag/forslag og RLS-afvisning (falsk DB) |
| `scripts/reception-simulator.ts` (ny) | 12 scenarier (§7) — ingen svar med løfter |
| tsc · check:rbac (action-gate strict + unauth + server-only) · check:rls-matrix | grønne |
| effective-permissions · employee-setup-integrity · grok-finance-1/2 (+review) · claude-finance-2-review | grønne |
| relatel-review · relatel · telephony-persist · phone-search · customer-csv-import · customer-email · free-mail-domains | grønne |
| mail-recipient · email-template-escape · autolink-policy · portal-response-guard · portal-sign-label | grønne |
| besigtigelse-task · assistant-callback-reply · customer-task-actions-touch · lead-follow-up · npm test:time/profit/decode | grønne |
| UI-harness **U267** (ny gruppe `reception`, staging) | se §8 |

Dækkede krav-scenarier: kendt/ukendt/tvetydig opkalder, forfalsket nummer (L1 uden sagsdata), bekræftelse ok/fejl,
flere åbne sager, eksakt sag, ingen sag, dublet-hændelse, læsefejl, elektrisk nød, utilfreds kunde, fakturaklage,
prisforespørgsel, dato-forespørgsel, menneske ønsket, lav confidence, manglende transskription, vedhæftning/upload,
ekstern afsendelse FRA, tilbagekaldt rettighed, AI-aktør afvist, idempotent forslag. Ingen fejl-/ukendt-tilstand bliver
til succes/tom.

## 6. Sikkerhedsfund (fase 2) og status
| Fund | Status |
|---|---|
| `createServiceCase` sender kundemail | Receptionisten kalder den aldrig (statisk test) |
| H1 kunde-sletning brød på bekræftet sag | Guard rydder sagen ved FK-SET NULL |
| H2 sags-tjek under kalderens RLS ved hver UPDATE | Kun ved ændring af kunde/sag |
| H3 upload-link kunne føde en henvendelse efter kundeskift | DB: link-kunde = henvendelsens kunde; kundeskift lukker links; upload knytter kun ved match |
| H4 server-action-grænse 10 MB | 9 MB samlet pr. afsendelse |
| M1 handlingers tilstand kunne forfalskes | Overgangstabel, låste slut-rækker, decided_by = indlogget |
| M2 items viste indhold ud over kanal-ret | `conversation_visible` kræver calls.view / mail-ret |
| M3 indtag ikke atomisk | Genoptagelse indsætter manglende item |
| M4 sync fejlede for salg/bogholderi | Ikke-bekræftede springes over uden view_unmatched |
| L1 MIME stoledes på | Indholds-tjek; kvote-refusion; udløb tjekkes ved reservation |
| L2 handled_by/match_version ikke håndhævet i DB | Håndhævet i trigger |
| L3 upload_requests-synlighed | Kræver også synlig henvendelse |
| Restrisiko: en manage-bruger kan indsætte et item med en andens `source_id` (blokerer indtag af den kilde) | Accepteret i fase 2 (intern, auditeret); fase 3: indtag via SECURITY DEFINER-RPC |
| Restrisiko: `executed_ref` er bogføring, ikke bevis | Selve effekten (opgaven) har sin egen audit |

## 7. Simulator-resultater (`npx tsx scripts/reception-simulator.ts`)
| Besked | Identitet / niveau | Intent / haster | Handlinger | Handoff |
|---|---|---|---|---|
| "Mit batteri går offline." (kendt) | unique_match / L1 | service_fault / normal, eksakt sag | opgave **auto**, fotos forslag | nej |
| "Jeg vil gerne have et tilbud på solceller." (ukendt) | no_match / L0 | new_installation / normal | kundeforslag, salgsopgave forslag; pris afvist | nej |
| "…hvornår kommer montøren?" (kun nummer) | unique_match / **L1** | existing_case_status | planlægningsanmodning auto; beder om bekræftelse; ingen sagsdata; dato afvist | nej |
| samme + postnr./vejnavn | unique_match / **L2** | existing_case_status | viser "sag SVC-… Status: I gang", lover ingen dato | nej |
| "Jeg har ingen strøm i huset." | unique_match / L1 | service_fault / **high** | sagsforslag → handoff | urgent_outage → service |
| "Jeg vil klage over fakturaen." | unique_match / L1 | invoice_question / high | → handoff | customer_dispute → bogholderi |
| "Det slår gnister fra eltavlen…" | unique_match / L1 | **emergency** | kun log; udsendelse afvist; svar: 112 + hovedafbryder | safety_emergency → service |
| delt nummer | **ambiguous** / L0 | service_fault | → handoff, ingen kandidatdata | ambiguous_identity |
| "tale med en medarbejder" | unique_match | callback_request | → handoff | human_requested → kontor |
| transskription mangler | unique_match | other / 0 % | → handoff | transcript_unavailable, low_confidence |
| uklar besked | unique_match | other / 30 % | → handoff | low_confidence |
| flere åbne sager | unique_match | service_fault, several_open | sagsforslag (menneske vælger) | nej |

## 8. Henvendelser — UI-resultat (U267, staging)
`npx tsx scripts/test-harness/ui-batches.ts U267` (2026-11-16, staging, 00249 anvendt): **PASS (57 s)**. Bevist gennem
UI'et: side + menupunkt; simulator (kendt kunde → `unique_match`/L1/`create_task=auto`; nød → `emergency`, 112,
udsendelse afvist); gem → henvendelse med kandidat (ikke bekræftet), auto-opgave udført af `ai_receptionist` via
`createCustomerTask` på kandidat-sagen, fotos kun forslag, audit `ai_receptionist.create_task`; bekræft kandidat
(match_version 0→1) og sag; upload-link vist én gang (kun hash gemt), anonym side uden kundedata, PNG modtaget som internt
dokument på sagen + item på henvendelsen + kvote 1, forklædt fil og ugyldigt token afvist; afslut (handled_by sat);
kundetidslinjen viser henvendelsen (`kind: inquiry`); ukendt afsender gemt ukoblet; **salg** ser ikke ukoblede, har ingen
simulator og afvises direkte; **montør** afvises på side og action; mail/SMS-tabeller uændret. Testdata ryddes.
Skærmbilleder: `%TEMP%/elta-ui-e2e/henvendelser-admin.png`, `henvendelser-detail-bekraeftet.png`, `upload-link-anonym.png`.
Kendt kosmetik: med detaljepanelet åbent ved 1400 px scroller tabellens højre kolonner vandret.

## 9. Flag (alle FRA i produktion)
`RECEPTION_LLM_ENABLED`, `RECEPTION_UPLOAD_LINKS_ENABLED`. Ekstern afsendelse findes ikke. Relatel-flag uændret
(`TELEPHONY_PERSIST_ENABLED`, `RELATEL_LIVE_CALL_ENABLED`, `RELATEL_SMS_ENABLED` FRA).

## 10. Resterende blokeringer
- **B-voice:** Ingen SIP hos Relatel → stemme kræver A (viderestilling til SIP-bro) eller B (portering). CLI-bevarelse og
  tilbage-omstilling skal afklares med udbyder (VOICE_TRANSPORT_DECISION.md).
- **B-relatel:** Live call-payload er stadig ikke modtaget (abonnement/scope på webhooken) — påvirker telefoni-items og P3.
- **B-prod:** 00249 kræver særskilt prod-godkendelse.
- **Baggrunds-aktør:** Handlinger uden en indlogget medarbejder (indgående opkald om natten) kræver en dedikeret DB-aktør
  (egen profil/rolle med præcis allowlist) — beslutning.

## 11. Fase 3 — anbefaling (præcis)
1. **Godkend og kør 00249 i prod** (særskilt): PUSH kode → `migrate` → post-check (katalog 120/291, personaer). Henvendelser
   bruges straks til mail/portal-indtag og manuel triage (ingen AI-afsendelse).
2. **Baggrunds-aktør:** migration der opretter en dedikeret `ai_receptionist`-profil uden login, med kun allowlistens nøgler,
   og en SECURITY DEFINER-indtags-RPC (atomisk conversation+item, kilde-validering) — luk restrisikoen fra §6.
3. **Web-chat på staging:** widget → `runReceptionTurn` (samme motor), rate-limit, L0 indtil bekræftelse.
4. **Stemme-PoC (variant A)** på et separat Relatel-testnummer → SIP-bro (EU) → realtime-stemme → `runReceptionTurn` på
   staging; test CLI, handoff tilbage til menneske, nødrute, transskriptions-retention (forslag 90 dage, ingen lyd).
5. **Relatel call-payload:** afslut B-relatel; map `call_uuid` → `conversation_items.provider_event_id`; P3 hvis nødvendigt.
6. **Udgående opfølgning** (først efter særskilt godkendelse): godkendte SMS-/mailskabeloner med rigtigt SVC-nummer, bag
   eget flag, idempotent pr. henvendelse+skabelon.
7. Migrér de resterende 5 OpenAI-kald til `ai-client.ts`.
Cutover fra Nila først når 3–4 er grønne i ≥ 2 uger på testnummer; rollback = Relatel-routing tilbage til Nila.
