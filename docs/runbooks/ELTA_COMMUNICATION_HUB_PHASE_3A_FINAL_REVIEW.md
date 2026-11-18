# ELTA kommunikations-hub fase 3A — uafhængig FINAL REVIEW og hærdning

Dato: 2026-11-18 · Reviewet som tredjepartskode, der skal blive automatisk produktions-indtag.
Kilde: `claude-communication-hub-phase-3a` @ `6e269784` · Produktion/main: `56decaaf` · 00250: **kun staging**.
Intet er deployet, ingen flag er ændret, Nila/Relatel uændret, intet sendt (mail/SMS/opkald).

## 0. Resultat

| | |
|---|---|
| Ren review-branch | `claude-communication-hub-phase-3a-review` (bygget fra `56decaaf`, se §1) |
| HEAD | se rapporten (sidste commit på branchen) |
| Prod-preflight-værktøj | `claude-00250-preflight-tooling` (stablet oven på review-branchen, som for 00249 — merges IKKE til prod) |
| S1 | ingen |
| S2 | 5 fundet → alle rettet (§2–§5, §8) + 1 prod-fund (B1 er sket i prod, §11) |
| Konklusion | 00250 er klar til produktions-PREFLIGHT (ikke til anvendelse uden Henriks særskilte godkendelse) |

## 1. Branch-scope / værktøjsoprydning

Fase 3A-branchen havde 4 commits over prod. To af dem (`6a27b63f`, `3581bce9`) var **midlertidigt 00249-deploy-værktøj**
(`scripts/prod-00249-*.ts`, `ELTA_00249_PROD_PREFLIGHT.md`) — de hører ikke i produktions-merge'et og ligger fortsat på
`claude-00249-preflight-tooling`. Den rene branch er bygget fra prod-main og indeholder KUN:

1. `23b8ea98` stale-test-rettelser (permanente: Relatel 401 i observationstilstand, `customer_notes` findes)
2. `458cc519` fase 3A (uændret cherry-pick af `6e269784`)
3. review-commit(s): eksport af `STRUCT_MD5` m.fl. i `reception-00249-probe.ts` (00250-prøven importerer den — den eneste
   linje fra værktøjs-commit'en, der er permanent test-værktøj) + alle rettelser i dette dokument

`git diff 6e269784 <review-HEAD før rettelser>` = præcis de 6 udeladte 00249-værktøjsfiler + 20 linjer race-subkommando i
cli.ts — ingen fase 3A-funktion eller -test tabt (verificeret).

## 2. Mail: 48 t-reglen erstattet af OPDAGELSES-reglen (S2 — rettet)

**Fund:** `received_at` > 48 t ⇒ "ikke ny". Prod (read-only): **109 af 968 mails (11 %) blev opdaget > 2 døgn efter
modtagelse** — et Microsoft-/sync-udfald ville have tabt dem stille fra Henvendelser. Desuden: mail-sync'ens genforsøg af
ubehandlede mails filtrerede på kolonnen `mailbox_source`, som **ikke findes i prod/staging** (insert falder tilbage uden
den) — genforsøget har derfor aldrig kørt i prod (fejl ignoreret), og mails ud over budgettet (60/kørsel) blev aldrig
behandlet.

**Løsning (deterministisk):**
- "Ny" = **opdaget** (`incoming_emails.created_at`, sat af DB ved første insert; aldrig null i prod, aldrig før modtaget),
  ikke afsendt/modtaget.
- `RECEPTION_EMAIL_INGEST_SINCE` (ISO, **påkrævet** når trin A tændes) = aktiveringstidspunktet. Opdaget før ⇒ historik ⇒
  kun via den EKSPLICITTE backfill. Mangler/ugyldig ⇒ intet indtag (fail closed).
- Opdaget inden for 14 dage (= mail-sync'ens genforsøgsvindue) — et genforsøg kan aldrig trække vilkårlig historik ind.
- Eksplicit backfill = `RECEPTION_BACKFILL_ENABLED` (ny, standard FRA) — "Hent nye fra mail/portal" er nu TEKNISK spærret
  (knappen vises ikke, server-action afviser).
- Genforsøget finder postkassen via `to_email` (altid = postkassen ved insert) og regner vinduet fra `created_at`.
  Prod: **0** ubehandlede mails opdaget inden for 14 dage ⇒ ingen AI-burst ved deploy.
- Uændret: manuel kobling overskrives aldrig, dublet-beskyttelse (kilde-unik indeks), læsefejl = `read_error`.

Tests: udfald 49 t / 3 d / 7 d → indtaget; opdaget før aktivering → `discovered_before_activation`; uden for vinduet →
`discovery_window`; uden SINCE → `since_not_configured`; staging (rigtig DB): modtaget for 7 dage siden + opdaget nu →
indtaget, opdaget for 20 dage siden → ikke indtaget.

## 3. Web-chat misbrugsværn (S2 W1 — lukket)

Holdbart og fælles på tværs af serverless-instanser: tællere i databasen (`web_chat_rate_limits` +
`web_chat_rate_check`, SECURITY DEFINER, **kun service_role**; tabellen har ingen grants til nogen API-rolle).

| Værn | Grænse |
|---|---|
| Nøgle | HMAC-SHA256(`RECEPTION_WEBCHAT_RATE_SECRET`, IP) — IP gemmes/logges aldrig; ukendt IP ⇒ fælles streng spand |
| Ny chat | 3/min, 10/time pr. nøgle · 300/time globalt |
| Besked | 8/min, 60/time pr. nøgle · 3000/time globalt (tjekkes FØR sessionsopslag — ugyldige tokens tæller) |
| Session | højst 30 beskeder, levetid 120 min |
| Gentagelse | samme tekst (normaliseret) inden for 10 min ⇒ ingen ny række/intet nyt svar; den gemte besked genindtages idempotent (en fejlet registrering tabes ikke) |
| Længde | 1000 tegn pr. besked, 8 KB pr. anmodning |
| Fejl | værnet utilgængeligt ⇒ afvist (fail closed) |
| Aktivering | `webChatEnabled` kræver flaget **og** en hemmelighed ≥ 32 tegn — piloten kan ikke tændes uden værnet |
| Orakel | samme svar og samme `handoff`-flag til den besøgende uanset om oplysningerne matcher en kunde (fejlet bekræftelse styrer kun det interne handoff — rettet i `engine.ts`) |

## 4. Manuel kobling → afstemning af henvendelsen (S2 M1 — rettet)

Kanonisk regel: kildens menneskelige kobling er sandheden. Implementeret i databasen, så INGEN kodevej kan glemme det
(indbakke, tråd-søskende, oprettelse fra mail, sagskobling, kundesletning): trigger
`trg_incoming_emails_reception_reconcile` (AFTER UPDATE OF customer_id, service_case_id, linked_by) →
`reception_reconcile_source`.

- Primært item: manuel kobling ⇒ henvendelsen får kunden (bekræftet), kandidaten fjernes, sag = kildens bekræftede sag /
  den nuværende hvis samme kunde / ingen (gættes aldrig), `match_version + 1`.
- Automatik kan aldrig overskrive en bekræftet relation (auto-omkobling ⇒ uændret).
- Ubekræftet henvendelse følger en ny automatisk kandidat.
- Tråd-items koblet til en anden kunde/sag ⇒ **flyttes** til egen henvendelse (åben tråd for kunden, ellers ny) — ingen
  dublet, tekst og kildereference bevaret.
- Samme rådgivende lås som `reception_ingest` (kildens identitet læses nu EFTER låsen) ⇒ et samtidigt indtag og en kobling
  kan ikke efterlade en blivende uenighed.
- Auditeret som medarbejderen (`conversation_source_reconciled`, `conversation_item_detached`). Fejl vælter aldrig
  koblingen (subtransaktion; `conversation_reconcile_failed` auditeret uden personværdier). Overvågning:
  `reception_retention` dry-run returnerer `source_link_conflicts` (skal være 0).
- `reception_reconcile_source`: service_role; `reception_detach_item`: ingen API-rolle (heller ikke service_role).

Tests (staging, rollback-only, som rigtig admin via RLS): ukoblet → menneske kobler A → samme henvendelse bekræftet, ingen
ny, auditeret som admin; kandidat A → menneske bekræfter B → A fjernet; auto-omkobling kan ikke overskrive; tråd-item
koblet til anden kunde → flyttet (1 item tilbage). Real-kode mod staging: samme.

## 5. Tråd-regler (endelige) — S2 T1 rettet

| Kanal | Stærk trådnøgle (afledt i DB) | Vindue | Uden stærk nøgle |
|---|---|---|---|
| Mail | Graph `conversationId` (md5) | 30 d | — (webformularer: ingen tråd) |
| Portal | **kunde + tilbud** (før: kunde + "general") | 14 d | **ny henvendelse pr. besked** (ingen tråd-id i portal_messages) |
| Web-chat | sessionen | 1 d | — |
| SMS (fremtid) | udbyderens samtale-id, hvis det findes | fastsættes ved tilkobling | ny henvendelse |
| Telefon (fremtid) | ingen (hvert opkald er sin egen henvendelse) | — | ny henvendelse |

Føj kun til en henvendelse når ALT gælder: samme trådnøgle · samme kanal · åben (ikke handled/spam — aldrig stille
genåbning) · inden for vinduet · ingen bekræftet kunde-konflikt · **ingen bekræftet sags-konflikt (ny)** · **ingen
kandidat-konflikt (ny)**. En henvendelse uden sag får kildens BEKRÆFTEDE sag (manuelt koblet, samme kunde); en eksisterende
sag overskrives aldrig. Aldrig fletning på telefon/mail/navn/tidsvindue alene. Restrisiko (dokumenteret): en ukendt afsender
der svarer i en eksisterende Graph-tråd (kræver trådens Thread-Index) føjes til tråden — kun forslag, synligt som eget item.

Adversarielle tests: kandidat-konflikt, sags-konflikt, sag-adoption, anden bekræftet kunde, svar efter afsluttet,
anden kanal, to urelaterede portalbeskeder samme kunde samme dag (prøve + real-kode).

## 6. Dubletter kontakt@ + ordre@ (T2) — beslutning: BEVAR begge

Microsoft giver `internetMessageId` (RFC 5322 Message-ID, ens på tværs af postkasser), men kolonnen
`incoming_emails.internet_message_id` **findes ikke i prod eller staging** (mail-sync gemmer uden den). `graph_message_id`
og `conversationId` er postkasse-specifikke. Uden en stærk udbyder-identitet deduplikeres der ikke (emne/afsender/tekst/
tid er forbudt grundlag). Prod: **0** sådanne par i dag. Begge mails bevares (to items/henvendelser) — ingen risiko for at
tabe en legitim mail. Opfølgning (egen godkendelse): tilføj `internet_message_id` til `incoming_emails`, derefter
alias-dedupe i `reception_ingest`.

## 7. Vidensundtagelsen (snævret ind)

Vidensbase-svar KUN når: lav sikkerhed er ENESTE handoff-grund · ingen afviste tilsagn · ingen bekræftelse krævet ·
intent `general_question`/`other` · teksten nævner intet følsomt emne (`SENSITIVE_TOPIC`: pris, dato/tid, garanti,
lov/regler/godkendelse, faktura/betaling, annullering, klage/tvist, sag/ordre/kunde-/adresseoplysninger, identitet, nød).
Ukendt firmafakta forbliver ukendt ("en medarbejder vender tilbage"). 40+ prioritetstests: nød, menneske, identitet
(tvetydig/læsefejl/fejlet), bekræftelse, kunde/sag, pris, dato, garanti, compliance, faktura, annullering, klage/tvist
går ALLE forud.

## 8. service_role-grænsen (bevist)

- Motoren/adapterne får aldrig den rå admin-klient: `backgroundCapability(admin)` giver `readPort` (kun `.select()` på
  allowlist `customers, customer_contacts, leads, service_cases`, ingen relationer), `readSource`/`readSourceBody` (ÉN række
  efter id, faste kolonnelister, `hasOwnProperty`-opslag — ingen prototype-tricks), `ingest` (kun `rpc('reception_ingest')`).
- Brødtekst (`body_html/body_text`) læses kun for webformularer (M2 rettet).
- Web-chat-lageret: kun `web_chat_sessions`, `web_chat_messages`, `rpc web_chat_rate_check` (statisk bevist).
- Ingen generisk tabel/kolonne/select/skrivning. Statiske tests: `readPort:` defineres kun i background-actor.ts;
  `backgroundCapability()` kaldes kun med admin-klienten; kapabiliteten indeholder ingen insert/update/delete/upsert/
  storage/auth og præcis ét rpc-kald.
- **RLS-matrix-reglen (S2 — hærdet):** før genkendtes enhver `X.readPort` på NAVNET som admin. Nu kræver scanneren via
  TypeScript-typecheckeren, at symbolet ER `BackgroundCapability.readPort` deklareret i
  `src/lib/reception/background-actor.ts` — et vilkårligt objekt med en `readPort`-egenskab klassificeres ikke som
  service-role-sikkert.
- service_role-funktioner: `reception_ingest` (kun forslag for service_role, kilde-afledt), `reception_reconcile_source`
  (kun afstemning fra kilden), `reception_retention` (dry-run standard), `web_chat_rate_check` (kun tællere).
  `reception_detach_item` og trigger-funktioner: ingen API-rolle.

## 9. Retention (bekræftet)

90 d kopieret tekst (afsluttede) · **180 d** resumé/titel (SQL-standard rettet fra 90 → 180, så DB og app er enige) ·
slettet kunde/kilde: straks · åbne henvendelser: aldrig (undtagen slettet kunde/kilde). Kanoniske kilder røres aldrig;
audit og kildereferencer bliver; ryddet titel = "Henvendelse (Mail)" (R1 rettet). Apply kræver
`RECEPTION_RETENTION_APPLY=true` **og** `?apply=1` **og** Bearer CRON_SECRET (`?apply=1` alene = dry-run, testet);
`RECEPTION_RETENTION_APPLY` standard FRA; cron ikke i `vercel.json` (testet). Produktions-oprydning IKKE slået til.

## 10. U268 efter layout-ændringen

Resumé på op til 2 linjer (`line-clamp-2`) i stedet for afkortet til én; næste skridt markeret **"Forslag:"** (AI-forslag ≠
udført; udførte handlinger vises grupperet i detaljen); handoff-årsager på dansk. U268 måler nu ved **1400 px**: ingen
vandret rul, resumé-kolonne ≥ 220 px og 2 linjer, ukoblet/kandidat/bekræftet har hver sin `data-state`, status/hastegrad/
ansvarlig/kanal på hver række. Skærmbillede: `screenshots/phase-3a/henvendelser-3a-final-1400.png`.

## 11. PRODUKTIONSFUND (read-only) — B1 er sket

2026-11-18 kl. 06:36 trykkede én admin på "Hent nye fra mail/portal" i prod (audit `conversations_synced`). Resultat:
**32 mail-henvendelser** på 5 sekunder (medarbejder-indtag), alle FORSLAG (32 `append_communication` proposed, 11 opgave-
forslag, 5 kunde-forslag, 21 tilbageringninger blokeret), **0 udført, 0 opgaver oprettet, 0 sendt**, 0 bekræftede kunder,
21 tildelt et TEAM af motoren. Kilde og henvendelse er enige (0 konflikter). 00249 er altså ikke længere "dormant" i
datamæssig forstand. Ingen skade; men knappen er netop B1. Rettelsen (`RECEPTION_BACKFILL_ENABLED`, standard FRA) lukker den
ved næste dormant deploy. Beslutning til Henrik: behold de 32 (synlige for roller med conversations.view) eller markér dem
håndteret. 00250 tåler dem (prøvet i prod-dry-run).

## 12. Migrations-review (00250)

Gennemgået: alle tabeller, kolonner, FK, unikke nøgler, indeks, triggere, funktioner, SECURITY DEFINER, grants/revokes,
RLS og rollback. Rettet i review: portal-trådnøgle, sags-/kandidat-konflikt, sag-adoption, lås før identitet, afstemning
(3 funktioner + trigger), værn-tabel/-funktion, retention-standard 180, dansk titel, `source_link_conflicts`,
REVOKE af `web_chat_rate_limits` og `reception_detach_item` også fra service_role. Bekræftet uændret korrekt: kilde-afledt
identitet, `appended`-udfaldet (tråd-items giver kun forslag, kan hæve hastegrad/kræve handoff, aldrig sænke), sletnings-
markører (kunde/kandidat/sag/kilde), vedhæftnings-REFERENCER (navn/type/størrelse, aldrig URL), web-chat-tabellerne
(token-hash, besøgende aldrig bekræftet, kun serveren skriver, medarbejdere læser via henvendelsens synlighed),
retention (kun rydning, aldrig skrivning af tekst; markører kan ikke fjernes). Ingen nye rettighedsnøgler (katalog
120/291). Rollback: `docs/runbooks/sql/00250_rollback.sql` (genereret) genskaber præcis 00249-strukturen.

## 13. Tests på den endelige tree

Kørt på review-HEAD `00a545ac` (00250 endelig version anvendt på staging):

| Suite | Resultat |
|---|---|
| Hub-suite (`scripts/reception-hub-test.ts`) | 143/143 (før review 75) |
| Fase 2 reception-suite (`scripts/reception-test.ts`) | 173/173 |
| 00250-prøve (staging, rollback-only) | 98/98 (før review 75) |
| 00250 rollback-bevis | struktur = før, ingen afvigende dele, staging uændret |
| Real-kode mod staging (`reception-hub-staging`) | 33/33 (før review 24) |
| Baggrundsaktør (`reception-bg-staging`) | 9/9 |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| Medarbejder-integritet · effektive rettigheder | 59/59 · ok |
| Finans 1 (+review) · Finans 2 (+review) | ok (185) · ok (56) |
| Relatel · Relatel-review · telefoni-lagring | ok · ok · ok |
| Mail (customer-email, modtager, sync-friskhed, gratis-domæner, skabelon-escape, afsenderdomæne, autolink) | alle ok |
| Portal (svar-værn, link-strip, signatur) | alle ok |
| Opgaver/tilbageringning (write-read, sletteregel, actions-touch, callback-reply) | alle ok |
| Kunde-matching (reception-test identitet + hub-matcher-tests) | ok |
| Materialer/avance (ukendt kost 156, prisplan, profit-engine) · test:time · test:profit · test:decode | alle ok |
| Prod (read-only/rollback-only) | pre 12/12 · dry-run 27/27 + 1/1 · prod identisk bagefter |
| UI U267 · U268 · U263 · U233 · U255 · U11 | alle PASS på `00a545ac` (U268 inkl. 1400 px lukket + åbent panel); første kørsel fangede resumé 176 px → rettet |
Kendt, ikke-relateret: `scripts/work-order-employee-check-test.ts` fejler 8/13 også på prod-main `56decaaf`
(`work-orders.ts` ændret i `9a0bac90`, testen ikke opdateret) — uden for scope, ikke rørt.

## 14. Resterende risici

1. Ukendt afsender i en eksisterende Graph-tråd føjes til tråden (kun forslag; kræver trådens Thread-Index).
2. Kontakt@+ordre@-dubletter bevares som to henvendelser indtil `internet_message_id` gemmes (§6).
3. Portal uden tilbud: én henvendelse pr. besked (bevidst — hellere for mange end en forkert fletning).
4. Den globale chat-grænse kan udtømmes af et distribueret angreb (fail safe: chatten afviser, mail/telefon virker).
5. 32 eksisterende prod-henvendelser (§11) — tråd-svar til dem appendes ikke (ingen trådnøgle før 00250) men bliver nye.
6. Web-chat trin E (offentlig widget) er ikke bygget; vidensbasen mangler Henriks 10 felter.

## 15. Produktions-preflight

Se `docs/runbooks/ELTA_00250_PROD_PREFLIGHT.md` på `claude-00250-preflight-tooling`.
