# Kommunikation: parter, relationer og publikum (audience)

Fase B (00255, intern partsforvaltning via RPC'er) er GENNEMFØRT og AKTIV i PROD fra 2026-11-26: `PARTIES_UI_ENABLED=true`
(kun Production) — panelerne "Parter & relationer" og "Sagsdeltagere" er i brug. Offentliggørelse/portaludvidelse og Stage A-
klassifikation (punkt 4's resterende dele) er IKKE startet; F-1 er stadig hård blokering. Se `PARTY_AUDIENCE_PHASE_B_PREFLIGHT.md`
§13–14 og smoke-runbooken `PARTY_PHASE_B_PROD_SMOKE.md`.
Status 2026-11-23 (prod-præflight 2026-11-25: se `PARTY_AUDIENCE_00254_PROD_PREFLIGHT.md` — rollback-only 61/61, fund P-1
rettet i migrationen, F-6/D-1 tilføjet, F-1 er HÅRD blokering for portaludvidelse):
- **Leverandør-/kunde-integritetsværn (S2)** er i PROD (main `380adb71`, kode-only) — afsnit 2.
- **Parts-/relations-/publikumsfundamentet (00254)** er bygget på branch `claude-party-audience`, anvendt og bevist på
  STAGING. **Ikke i prod** (kræver egen godkendelse af migration 00254 + push). Fundamentet er inert: ingen UI, ingen
  kaldsteder, ingen backfill, ingen ændring af portalernes nuværende læseveje. Afsnit 3–15.
- Stage A (mail → Henvendelser), 5-min mail-sync, 00253-lease og leverandørværnet er live og uændrede. Portal-indtag,
  webchat, SMS, telefoni, baggrunds-AI-handlinger, backfill og retention-apply er FRA. Nila/Relatel uændret.

## 1. Review-fund (prod, read-only, 2026-11-22/23 — kun antal)
- Eksisterende parter: `customers` (126; 111 auto-oprettet fra mail, tag `auto-email`), `customer_contacts` (roller billing/
  ordering/site/technical/resident/property_manager/other), `suppliers` (2 grossister; ingen e-mail/CVR/ekstern id — kun
  website), `leads` (5), `employees`/`profiles`. Ingen tabel for samarbejdspartner/underleverandør/producent/organisation.
- "Partner" findes kun som en kunderække + `partner_access_tokens` (scope = `service_cases.payer_customer_id`) og som sags-/
  tilbudsroller (orderer/end/payer/site/purchased_from). Partnerportalen udleverer kun sager (eksplicitte kolonner) og delte
  dokumenter (`visible_in_portal`, ikke fra mail).
- Kunde- og partnerportal læser ALDRIG `incoming_emails`, henvendelser (`conversations*`), mail-klassifikation eller
  `suppliers`. Mail-vedhæftninger arkiveret på kunden (`customer_documents.source_email_id`) er altid interne.
- Mail-klassifikation findes kun i `email_intelligence_logs.classification` (customer/supplier/newsletter/ignored); ingen
  kolonne på mailen. Stage A's identitet bruger kun customers/customer_contacts/leads(telefon).
- Henvendelser har ingen relations-/publikumsfelter; filtre er visninger + kanal.

## 2. Supplier / Customer Integrity Guard (S2, kode-only — i prod 2026-11-23, main `380adb71`)

### Fejlvejen (før værnet)
Pr. ny mail i mail-sync (hvert 5. minut, `email-sync-orchestrator.ts` → `linkAndAnalyze`):
1. **Linker** `linkEmail` (`email-linker.ts`, prod `MAIL_AUTOLINK_MODE=off`): eksakt afsender-e-mail / kontakt-e-mail /
   firmadomæne / Microsoft-tråd → `customer_id`, `linked_by='auto'`. Intet leverandør-tjek.
2. **Mail-analyse** `processEmailIntelligence` (kun hvis 1 ikke koblede eller mailen er videresendt): klassificér → udtræk
   navn/telefon/adresse → `findOrCreateCustomer` matcher (e-mail/telefon/fuldt navn) eller **opretter** kunde (≤ 25/døgn, intet
   flag) → `linked_by='auto-ai'`. Klassifikationen `supplier` stoppede IKKE dette (undertrykte kun afsenderens egen adresse).
3. **Stage A** `ingestEmailSource`: databasen tager kandidaten fra kildens auto-kobling (`reception_source_identity`), ellers
   fra `matchIdentity` på afsender-e-mail. Bekræftet kunde kun ved `linked_by='manual'`.
"Findes i customers" blev dermed brugt som bevis for en kunde i linkeren, i `findOrCreateCustomer` og i Stage A's identitet.

### Værnet
Ét fælles modul `src/lib/email/supplier-senders.ts` (`classifySupplierSender` + ren `decideSupplierSender`), brugt fire steder
FØR enhver kundematchning:

| Sted | Ændring |
|---|---|
| `email-linker.ts` `linkEmail` | Leverandør-afsender → ingen eksakt/kontakt/domæne/tråd-kobling, ingen tråd-sag; ikke markeret som støj (forbliver `unidentified` → indtages) |
| `email-intelligence.ts` | Deterministisk leverandør-evidens overstyrer AI'ens "customer"; `type === 'supplier'` → returnerer FØR `findOrCreateCustomer` (ingen oprettelse, intet match, ingen auto-ai-kobling); klassifikation + udtræk gemmes i loggen |
| `email-autolink.ts` `gatherAutoLinkSignals` | Leverandør-veto mod alle kundesignaler (link- og suggest-tilstand) |
| `reception/identity-match.ts` + `background-actor.ts` + `channel-intake.ts` | Stage A: leverandør-afsender (ikke manuelt koblet) → identitet `no_match`, ingen kandidat, intern handoff-årsag `supplier_sender`; henvendelsen indtages internt; ingen sag; kun forslag |

Baggrundsaktøren får én ny smal kapabilitet `supplierSender(email)` (faste opslag, kun ja/nej + årsager) — den rå klient
forlader stadig aldrig `backgroundCapability`.

### Evidensregel (deterministisk — aldrig navnelighed, aldrig AI alene for en NY afsender)
- A. kendte grossist-domæner (`SUPPLIER_DOMAINS`, flyttet uændret fra email-intelligence) inkl. underdomæner
- B. `suppliers.contact_email` (eksakt) og `suppliers.website`-domæne (aktive leverandører)
- C. **afsender-historik**: tidligere mails fra SAMME adresse klassificeret `supplier` — ren (≥ 1 supplier, 0 customer) eller
  klart dominerende (≥ 3 og ≥ 2× customer). **Blandet historik er ikke evidens** (afsenderen er også set som kunde — "både
  leverandør og kunde", E; partsmodellen afgør). **Domæne-historik** kun ved ≥ 3 leverandør-mails fra ≥ 2 afsendere og ≥ 80 %.
- Aldrig: gratis-/privat-maildomæner (gmail, outlook, hotmail …) som domæne-evidens, eget domæne, FormSubmit.
- Læsefejl kaster ikke: statisk grossist-regel gælder; ellers "ingen yderligere evidens" (= adfærd som før). 60 s cache pr.
  proces (linker, analyse og Stage A læser ikke tre gange).
- Første udkast (supplier ≥ customer) fangede 3 sandsynligt ægte kunder med blandet historik i prod-simuleringen → strammet.

### Forurenede kunderækker
Røres ikke (ingen sletning/sammenlægning/omtypning). Værnet sikrer kun at de ikke længere vokser og ikke bliver kandidater
for leverandørmails. Read-only baseline (uændret): **111 auto-oprettede · 12 sandsynlig leverandør/partner · 56 sandsynlig ægte
kunde · 43 ukendt** (`scripts/prod-supplier-guard-sim.ts`). Af de 12: 9 oprettet af leverandørmails (10 med pladsholder-e-mail
`@elta-crm.local`, som Stage A aldrig matcher på), 3 kun matchet af leverandørmails (sandsynligvis slutkunder nævnt i mailen),
6 har også kunde-klassifikationer, 1 er henvendelses-kandidat. Oprydning hører til partsmodellen.

### Ikke ændret (bevidst)
- Ukendt ekstern afsender: nuværende adfærd (AI'ens "customer"-standard kan stadig auto-oprette en kunde) — partsmodellen.
- Videresendt leverandørmail fra en ELTA-medarbejder: værnet ser afsenderen (ELTA) — den oprindelige afsender vurderes ikke (S3).
- Allerede auto-koblede historiske mails: uændrede.
- Leverandørfakturaer: `suppliers` forbliver det kanoniske leverandørregister; fremtidig berigelse med `vat_number`,
  `external_supplier_id`/`external_provider` (fx e-conomic-kreditorer) og verificerede e-mail-domæner. Ingen e-conomic-ændring.

### Migration
**Ingen.** Værnet er kode-only; handoff-årsager er fri tekst (`^[a-z_]{1,40}$`) i 00249/00250.

### Portal
Uændret og bevist: kunde-/partnerportal læser ikke `incoming_emails`, henvendelser, mail-klassifikation eller `suppliers`
(statisk test i `supplier-guard-test`); mail-vedhæftninger er interne.

## 3. Krav (Henrik 2026-11-23)
Samme ELTA-sag kan involvere slutkunde, leverandør, samarbejdspartner, underleverandør, producent/teknisk support og ELTA-
medarbejdere. Alle kan kommunikere om sagen, men **hver ekstern part må kun se indhold der eksplicit er tiltænkt netop den
part. Sagskobling ≠ portalsynlighed.** AI må foreslå (relation, klasse, sag, publikum), men aldrig selv offentliggøre.

## 4. Nuværende model (kort) og hvad der genbruges

| Område | Tabel(ler) i dag | Rolle i den nye model |
|---|---|---|
| Kunder | `customers` (126; 111 `auto-email`) | **Genbruges** som kanonisk kunderegister. Part kobles 1:1 (`parties.customer_id`) |
| Kontaktpersoner | `customer_contacts` (6; roller site/billing) | **Genbruges**; person-part kan kobles (`parties.customer_contact_id`) |
| Leads | `leads` (5) | **Genbruges**; `parties.lead_id` |
| Leverandører | `suppliers` (2 aktive; har allerede `vat_number`, `external_supplier_id`, `external_provider`, `contact_email`, `website` — tomme i prod) | **Forbliver kanonisk leverandørregister**; `parties.supplier_id` |
| Medarbejdere | `profiles` (5) / `employees` (2) | **Genbruges**; `parties.profile_id` (intern) |
| Sager | `service_cases` (8) med `customer_id` + `orderer/end/payer/site/purchased_from_customer_id` (alle → customers) | **Uændret** (bagudkompatibel). Ekstra parter via `case_participants` |
| Tilbud / arbejdsordrer | `offers` (15; orderer/end/payer), `work_orders` (3) | Uændret |
| Mails | `incoming_emails` (kun kontakt@/ordre@ synkes) | Uændret; altid intern |
| Henvendelser | `conversations` (36) / `conversation_items` (36) / `conversation_actions` | Udvidet med kilde-part + kommunikationsklasse. **Forbliver intern indbakke** — aldrig portalflade |
| Portalchat | `portal_messages` (22; pr. `customer_id`) | Uændret (kundens egen kanal) |
| Dokumenter | `customer_documents` (18; `visible_in_portal` bool, `source_email_id`) | Uændret; kan offentliggøres eksplicit pr. publikum |
| Opgaver | `customer_tasks` (`customer_visible` bool; 0 synlige i prod) | Uændret |
| Partner | partner = en kunderække + `partner_access_tokens` (1) — scope = `service_cases.payer_customer_id` | Partneren bliver en part med relation `cooperation_partner`; partnerens token peger fortsat på kunderækken |
| Portal-tokens | `portal_access_tokens` (39 aktive) → `customer_id` | Token → kunderække → part (`parties.customer_id`) |
| Leverandørfakturaer | `incoming_invoices` (64; 0 med `supplier_id`) | Klasse `supplier_invoice`; uændret |
| Regnskab | `accounting_integration_settings` (0 rækker i prod), `customers.external_customer_id/provider`, `suppliers.external_*` | Felterne til e-conomic-kreditor findes allerede på `suppliers` — ingen ny kolonne |

**Ikke oprettet** (bevidst): en ny leverandør-/partner-/producent-tabel (part + relation dækker), en `communication_classification`-
tabel (kolonne på henvendelsen er nok), en ACL-tabel pr. kildetabel (offentliggørelser er separate poster), en publikums-
kolonne på `conversations` (henvendelser er altid interne).

## 5. Ny struktur (migration 00254 — én additiv migration)
`supabase/migrations/00254_party_audience_foundation.sql` (ROLLBACK-sektion nederst, bevist på staging).

| Objekt | Hvorfor nødvendigt (kan ikke genbruges) |
|---|---|
| `parties` | Én part kan i dag findes som både `customers`-række og `suppliers`-række uden kobling; samarbejdspartner/underleverandør/producent har intet register. Part = identitet (person/organisation) + valgfri 1:1-kobling til de eksisterende registre (`UNIQUE` pr. register), `organisation_party_id` (person arbejder hos organisation), `verified_emails`/`verified_domains` (små bogstaver), `vat_number` for parter uden register |
| `party_relationships` | Flere relationer pr. part (ikke eksklusiv type). `status` proposed/active/ended/rejected, `source` manual/register/ai_suggestion, `evidence` (koder). Aktiv kræver menneske (`confirmed_by` = indlogget bruger) eller registerkobling; AI-forslag kun `proposed` |
| `case_participants` | Flere parter pr. sag med rolle (customer, end_customer, orderer, payer, site_contact, cooperation_partner, supplier, subcontractor, manufacturer, internal). **Giver INGEN ekstern adgang** |
| `external_publications` | Eksplicit offentliggørelse: `audience_kind` + `audience_party_id` (præcis part), valgfri sag, `content_kind` message/status_update/document, menneskeskrevet `title`/`body` eller `document_id`; intern proveniens `derived_from_table/id` (aldrig i feedet); `published_by` (indlogget bruger), `revoked_at/by`. Uforanderlig, kun én tilbagetrækning |
| `conversations` + 3 kolonner | `source_party_id`, `communication_class` (12 klasser, standard `unknown`), `communication_class_source` (none/ai/deterministic/manual, standard `none`) |
| Funktioner | `publish_external`, `revoke_external_publication` (kun authenticated), `external_feed` (kun service_role), `party_can_be_audience`, `party_visible_to_me`, `case_visible_to_me`, værn-triggere |
| Nøgler | `parties.manage` (admin/serviceleder), `portal.publish` (admin/serviceleder/salg) — også i `src/lib/auth/permissions.ts` |

Ingen backfill; ingen eksisterende række ændres; eksisterende `customer_id`-flows er urørte.

## 6. Partsmodel og relationsmodel
- Part = person eller organisation. En person kan pege på sin organisation (`organisation_party_id`), fx "Anders er både
  kunde (egen part, relation customer) og ansat hos KlimaEnergi (organisation_party_id → KlimaEnergi-parten)".
- Relationer hører til parten — ikke til kommunikationen. KlimaEnergi kan være `supplier` + `cooperation_partner` samtidig
  (unik pr. part+relation blandt åbne).
- `register`-relation kræver registerkobling (customer→customer_id, supplier→supplier_id, lead→lead_id, internal→profile_id).
- Partnere/underleverandører/producenter: `manual` + bekræftet af den indloggede bruger. AI: `ai_suggestion` → kun `proposed`;
  serveren kan aldrig aktivere (værn + CHECK).
- Parter oprettes **aldrig** automatisk ud fra AI. De oprettes af et menneske (`parties.manage`), eller (fase B) deterministisk
  fra en eksisterende registerrække når et menneske offentliggør til den.
- Leverandør-berigelse: `suppliers.vat_number`, `external_supplier_id` (e-conomic-kreditor), `external_provider`,
  `contact_email`, `website` findes allerede (tomme i prod) — udfyldes manuelt; verificerede domæner/e-mails på parten.
  Leverandørværnet kan senere læse `parties.verified_*` som ekstra deterministisk evidens. Ingen e-conomic-synk her.

## 7. Sagsdeltagere
`case_participants(service_case_id, party_id, role)`. Sag 1234: Anders (customer), KlimaEnergi (cooperation_partner), AO
(supplier), Growatt (manufacturer), Firma X (subcontractor). `service_cases.customer_id` m.fl. bevares; deltagere er
additive. Læses kun af personale med sagen i læse-scope (`cases.view.all` / `my_case_scope_ids()`); oprettes med
`parties.manage` eller `cases.edit` + sagen og parten synlig. **Deltagelse giver nul portaladgang.**

## 8. Kommunikationsklasse
`src/lib/parties/communication-class.ts` (ren): 12 klasser (customer_request, lead, partner_order, supplier_correspondence,
purchase_material, supplier_invoice, technical_support, subcontractor, internal, automated_system, newsletter, unknown).
- Deterministisk evidens afgør en **familie**: ELTA-afsender → internal; `incoming_invoices` → supplier_invoice;
  leverandørværn/leverandør-relation → {supplier_correspondence, purchase_material, supplier_invoice}; noreply/mailer-daemon →
  {automated_system, newsletter}; partner → partner_order; underleverandør → subcontractor; producent → technical_support;
  webformular → {customer_request, lead}; manuelt koblet kunde → customer_request.
- AI må kun forfine inden for familien. Uden familie bruges AI (kilde `ai`), men AI kan aldrig påstå `internal`.
- DB-værn (`trg_conversations_party_guard`): præcedens manual > deterministic > ai > none; kun en bruger kan sætte `manual`
  (og kun `manual`); serveren kan aldrig overskrive en stærkere kilde.
- **Klassen bestemmer aldrig synlighed** (feedet læser den ikke).
- Ikke koblet på Stage A endnu (fase B): eksisterende henvendelser står `unknown/none`.

## 9. Publikum/offentliggørelse (valgt design: eksplicitte offentliggørelsesposter)
Vurderet: (a) ACL-rækker pr. kildepost, (b) part-synligheds-mapping, (c) eksplicitte offentliggørelser. **Valgt: (c)** —
mindst og mest holdbart: originalen (leverandørmail, internt notat, partnerdiskussion) eksponeres aldrig; det eksterne
indhold er en ny, menneskeskrevet post til én bestemt part. (a)/(b) ville kræve politik pr. kildetabel og eksponere
originaler.
- Standard for alt importeret: internt. Der findes ingen "visible_in_portal"-bool i den nye model.
- `publish_external` kræver: indlogget bruger (`auth.role()='authenticated'`), `portal.publish`, sagen i brugerens læse-scope,
  parten kan være publikummet (kunde = registerkobling; partner/underleverandør/producent = aktiv menneskeligt bekræftet
  relation; leverandør = registerkobling eller aktiv relation), og på en sag: kunde = sagens (slut)kunde eller deltager i
  kunderolle; øvrige = aktiv deltager med matchende rolle. Dokument: hører til sagen, aldrig mail-vedhæftning.
  Audit (`external_publication_published`/`_revoked`).
- AI/baggrund kan ikke offentliggøre: ingen EXECUTE til service_role (REVOKE eksplicit også FROM service_role — prods default
  privileges giver ellers nye funktioner EXECUTE til service_role; fund P-1 i præflighten); service_role har kun SELECT på tabellen; værnet afviser
  enhver INSERT uden `elta.publish`-flag + `published_by = auth.uid()` (også for service_role).
- Eksempler: leverandørmail "Indkøbspris 31.800 kr., batteriet er restordre" → intern for altid; personalet kan skrive en ny
  kundebesked ("leveringen er forsinket") — proveniens peger internt på mailen, indholdet kopieres ikke. Internt notat →
  aldrig direkte (`publicationSourceRule('internal_note') = 'never'`). Kundens besked → kan besvares som ny kundebesked.
  Partnerstatus → eksplicit til partneren.

## 10. Portal-isolation
- Eneste nye eksterne læsevej: `external_feed(audience_kind, party_id)` (service_role) via `readExternalFeed`
  (`src/lib/parties/audience.ts`): præcis publikumstype **og** præcis part, ikke tilbagetrukket, parten skal stadig kunne være
  publikummet (afsluttet relation → tomt feed), eksplicit projektion (ingen proveniens/udgiver), dokumenter tjekkes igen.
  Uden part → tom liste uden DB-kald.
- Token → part: kundeportal `portal_access_tokens.customer_id` → `parties.customer_id`; partnerportal
  `partner_access_tokens.partner_customer_id` → samme opslag men publikum `partner`. Samme part ser ALDRIG kundeposter i
  partnerfeedet og omvendt (typen er en del af nøglen).
- Fremtidig leverandørportal: publikum `supplier` + `parties.supplier_id` — samme funktion, ingen ny model.
- Uændret i dag: kundeportalen læser kun egne `portal_messages`, delte ikke-mail-dokumenter, `customer_visible`-opgaver,
  sendte tilbud; partnerportalen kun sager hvor partneren er betaler + delte dokumenter. Ingen af dem læser `incoming_emails`,
  henvendelser, klassifikation, `suppliers`, `case_notes`, parter, deltagere eller offentliggørelser (statisk test).

## 11. Postkasser (prod, read-only 2026-11-23)

| Postkasse | Type | Synkes nu | Mails i CRM | Formål | Anbefalet politik |
|---|---|---|---|---|---|
| kontakt@eltasolar.dk | fælles | ja (delta, 2026-11-23) | 724 | kunder, webformularer, også leverandører | Hub-indtag (Stage A live); leverandørværn + klasse |
| ordre@eltasolar.dk | fælles | ja (delta, 2026-11-23) | 217 | ordrer, leverandørbekræftelser | Hub-indtag (live); forventes mest `supplier_*` |
| faktura@eltasolar.dk | fælles (navn) | nej | 2 (historiske) | leverandørfakturaer | Ikke i Hub; kun til `incoming_invoices` efter særskilt godkendelse |
| personal#1@ (maskeret) | personlig | **nej** — står i `graph_sync_state`, sidst synket 2026-02-28 | 4 | — | Ingen indtag; den forældede `graph_sync_state`-række bør fjernes (prod-dataændring → kræver godkendelse) |
| personal#2@, personal#3@ | personlig | nej | 15 / 3 (historiske) | — | Ingen indtag; historik bliver |

Princip: fælles postkasser → Hub. Personlige postkasser fodrer **ikke** den fælles Hub (HR, ledelse, private forhold), før der
findes eksplicitte regler (fx kun mails medarbejderen selv videresender/markerer). Synkede postkasser styres af
`GRAPH_MAILBOX`/`GRAPH_MAILBOXES` (uændret).

## 12. Historiske data
Intet migreres eller ryddes automatisk. 126 kunder (111 auto; 12 sandsynlig leverandør/partner, 56 sandsynlig ægte, 43 ukendt)
forbliver kunderækker. Modellen tåler dem: ingen part oprettes for dem før et menneske gør det; leverandørværnet forhindrer
vækst. Senere, egen godkendt plan: (1) read-only liste over de 12 → (2) personalet afgør pr. række (leverandør-part med
`supplier_id`, partner-relation, eller behold som kunde) → (3) evt. sammenlægning/inaktivering som separat ændring.

## 13. Sikkerhedsfund
- **F-1 (S3, latent, ikke ændret):** `customer_documents.visible_in_portal` er én bool som BÅDE kundeportalen (pr.
  `customer_id`) og partnerportalen (sager hvor partneren er betaler, `PARTNER_DOCUMENT_TYPES`) respekterer. Et dokument delt
  "med kunden" på en partnerbetalt sag ses også af partneren (og omvendt). Prod-eksponering i dag: **0 dokumenter** (0 sager
  med betaler ≠ kunde; 1 partner-token). Retning: partnerportalens dokumenter flyttes til `external_publications`
  (publikum `partner`) i fase B. **Præflight 2026-11-25: HÅRD BLOKERING — før fase B eller nogen udvidelse af partner-/
  leverandørportal skal den gamle synlighedsvej erstattes af part-scoped offentliggørelser/feed.** (Prod-eksponering stadig 0.)
- **F-2 (info):** `document_type = 'internal'` er ikke en tilladt værdi (00184 blev aldrig kørt i prod; staging afviser den) —
  kodefiltrene `.neq.internal` er død forsvar. De reelle interne markører er `visible_in_portal = false` og `source_email_id`.
- **F-3 (rettet under udvikling):** første udkast af `publish_external` lod en NULL-sammenligning (`end_customer_id` NULL)
  slippe en offentliggørelse til Kunde B på Sag 1 igennem. Fanget af staging-prøven; alle afvisninger er nu
  `NOT coalesce(…, false)`; regressionstjek i prøven + statisk test.
- **F-4 (info):** forældet personlig postkasse i `graph_sync_state` (se 11).
- **F-5 (info):** leverandørregistrets kontakt-/CVR-/kreditorfelter er tomme i prod (0/2), og 0/64 leverandørfakturaer er
  koblet til `supplier_id` — leverandørværnet hviler på domænelisten + historik.
- **P-1 (rettet i migrationen, præflight 2026-11-25):** service_role havde EXECUTE på `publish_external`/
  `revoke_external_publication` i prod (default privileges; staging har det ikke). Funktionerne afviste den alligevel via
  `auth.role()`; REVOKE-listen omfatter nu service_role, og `prod-verify-00254 post` tjekker hele funktions-ACL'en.
- **F-6 (fase B):** `INSERT … RETURNING` på `parties` afvises for brugere (SELECT-politikken slår rækken op igen); brug
  `return=minimal` med klient-genereret id eller inline SELECT-politik i en senere migration.
- **D-1 (beslutning):** `customers.view.all` giver læsning af hele den interne partsliste (kun læsning); montør ser intet.
- `portal_messages` er pr. kunde (ikke pr. sag): fin for kunden, men en fremtidig partnerchat skal gå via publikumsmodellen.

## 14. Tests og resultater (2026-11-23, branch `claude-party-audience`)
| Test | Resultat |
|---|---|
| `npx tsx scripts/party-audience-test.ts` (klasse, præcedens, feed-projektion, grants, nøgler, portaler læser ikke interne flader) | 66/66 |
| `cli.ts party-00254-probe` (rollback-only; SQL som rigtige personaer) — Kunde A / Kunde B / Partner Y / Leverandør X på Sag 1 + Sag 2 | 37/37 (både før og efter anvendelse) |
| `cli.ts party-00254-app` (PostgREST: anon, service_role, serviceleder, salg, montør) | 15/15 |
| `cli.ts party-00254-rollback-proof` (ROLLBACK-sektionen, rollback-only) | 4/4 |
| `scripts/prod-verify-00254.ts pre` (prod read-only) | 2/2 |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| Stage A regression: `stage-a-email-ingest-test` · `cli.ts stage-a-staging` (00254 anvendt) | alle · 40/40 |
| Hub: `reception-hub-test` · `cli.ts reception-hub-staging` · `reception-test` | 143 · 33 · 173 |
| Leverandørværn: `supplier-guard-test` · `cli.ts supplier-guard-staging` | alle · 14/14 |
| `sync-lease-test` · `effective-permissions-test` · `portal-security-test` | alle bestået |

Prøvens scenarie (Sag 1: Kunde A + Leverandør X + Partner Y; Sag 2: Kunde B). Internt oprettet: kundebesked, leverandørmail
(31.800 kr./restordre), partnerordre (avance), internt notat, mail-vedhæftning, upubliceret dokument. Offentliggjort af
serviceleder: kundestatus, delt tegning, kundesvar (A), partnerstatus (Y), leverandørbesked (X). Bevist:
- A ser præcis sine 3; Y præcis sin 1; X præcis sin 1; B intet; Y som kunde / X som partner / A som partner / A som
  leverandør / ingen part → tomt; feedet indeholder aldrig pris/restordre/avance/rabat/mail-vedhæftning/internt dokument.
- Afvist: til B på Sag 1, partner-type til leverandør, kunde-type til partner, leverandør på Sag 2, mail-vedhæftning, tom tekst,
  direkte INSERT/UPDATE/DELETE, salg uden sagen i scope, montør, service_role (rpc, INSERT, tilbagetræk), anon, authenticated
  på feedet, AI-relation som aktiv og aktivering af AI-forslag.
- Internt: serviceleder ser sagens 5 offentliggørelser + 3 deltagere; salg uden scope 0; montør 0 og ingen parter.
- Tilbagetrækning fjerner fra feedet (gentagelse no-op); afsluttet partnerrelation → tomt partnerfeed.
- Eksisterende kundeportal-veje for A: kun det delte ikke-mail-dokument og A's egen besked.

## 15. Udrulning (hver prod-trin kræver Henriks godkendelse)
1. Review af branch `claude-party-audience` + SQL i 00254 (dette dokument).
2. Push koden (inert: ingen UI/kaldsteder; `audience.ts`/`communication-class.ts` bruges ikke af appen endnu) — kan ske før
   eller efter migrationen, fordi ingen kode kræver de nye objekter.
3. Prod-migration 00254: `npx tsx scripts/prod-verify-00254.ts pre` → anvend → `… post` (struktur, grants, 0 rækker, alle
   henvendelser `unknown/none`) → Stage A-ops-monitor + smokes.
4. Fase B (separate godkendelser): UI + server-handlinger (gates `parties.manage`/`portal.publish`) til parter, deltagere og
   offentliggørelse; kundeportal viser også `external_feed('customer', …)`; partnerportalens dokumenter flyttes til
   publikationer (lukker F-1); Stage A sætter deterministisk klasse (aldrig `manual`), AI-forslag som `ai`.
5. Senere: leverandør-/partnerportaler (samme feed), postkasse-politik for personlige postkasser, historisk oprydning (12).
