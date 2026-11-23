# Kommunikation: parter, relationer og publikum (audience)

Status 2026-11-23: **arkitektur-review påbegyndt; første leverance er et smalt S2-integritetsværn** (nedenfor). Den brede
parts-/publikumsmodel er IKKE implementeret. Stage A (mail → Henvendelser) er live og uændret i sin adfærd for kunder.

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

## 2. Supplier / Customer Integrity Guard (S2, kode-only — branch `claude-supplier-guard`)

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

## 3. Næste trin (parts-/publikumsmodellen — ikke påbegyndt)
Party/relationship (flere roller pr. part), kommunikationsklasse adskilt fra kundematch, eksplicit audience
(`internal` standard; `customer`/`supplier`/`partner` kun via godkendt deterministisk/menneskelig vej), postkasse-kort, filtre i
Henvendelser og adversarielle isolationstests (kunde A/leverandør X/partner Y på samme sag).
