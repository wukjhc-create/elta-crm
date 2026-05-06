# ELTA CRM — Master Roadmap 2026

**Skrevet:** 2026-05-06 (post Sprint 6F-4)
**Status-forudsætning:** Invoice-modul produktionsklart internt (se `INVOICE_MODULE_STATUS_2026-05-06.md`)
**Vision:** ELTA CRM skal være et **komplet ERP-system til en autoriseret el-installatørforretning** — ikke kun solceller, men hele spektret fra servicebesøg til større el-entreprise og BESS-projekter.

---

## 0) Hvor vi står (snapshot)

**Færdige moduler**
- Leads + lead-pipeline + auto-customer-from-mail
- Tilbud (inkl. e-sign + portal-accept)
- Service-sager + work orders + arbejdsbeskrivelser
- Kalender (workforce day + week views)
- Medarbejdere + tidsregistrering (Sprint 4C)
- Materialer + øvrige omkostninger på sag (Sprint 5)
- Faktura: standard / forskud / rate / slutfaktura / kreditnota (Sprint 6A–6F)
- PDF + Microsoft Graph mail
- Reminder-cron med skip for voided/credit
- Grossist-integration (AO + Lemvigh-Müller) + prishistorik + margin-engine
- Kalkia-engine (tids- + prisberegning + electrical engine)
- AI projektfortolker (NLP + auto-calc + risiko-detection)

**Forberedt men ikke aktiveret**
- e-conomic-klient (mangler credentials)
- Kundeportal viser tilbud, ikke fakturaer endnu
- Permissions/RLS er funktionelt minimum (admin/employee), ikke rolle-baseret

---

## 1) Kerneflow — det daglige rygrad-flow

Den røde tråd igennem virksomheden, end-to-end, set fra én sag.

```
Lead → Tilbud → Sag (service_case) → Work order(s) → Kalender →
  Montør udfører → Timer + materialer + øvrige → Faktura(er) →
    [Kreditnota hvis fejl] → Rapport
```

### Hvad der mangler
- **Lead → tilbud-konvertering** med automatisk overførsel af opgavebeskrivelse + filer
- **Tilbud → sag-konvertering** sker manuelt — bør være ét klik når kunden har e-signet
- **Sag → work order** struktur er der, men splitting af én sag i flere work orders til forskellige montører er ikke optimal i UI'et
- **Kalender → time-registrering link**: Når montør er på en kalenderaftale skal "start tid"-knap være ét klik
- **Material check-out på lager** når montør tager fra varevogn — ikke implementeret (kræver lager-modul)
- **Slut-rapport på sag**: PDF til kunden med "udført arbejde + brugte materialer + næste skridt", ikke fundet i kodebase

### Roadmap-prioritet
**Phase 1 (kritisk):** Lead/tilbud/sag-konvertering glat. Kalender → time-log ét klik.
**Phase 2:** Lager-modul (materialer på varevogn + automatisk fratræk når booket på sag).
**Phase 3:** Slut-rapport-PDF til kunde.

---

## 2) Almindeligt el-arbejde — det Elta primært laver

Modulet skal håndtere alt en el-installatør møder:

| Kategori | Karakteristik | Specielle behov |
|---|---|---|
| **Servicebesøg** | Kort ophold, ofte under 2 timer | Hurtig opret-faktura, km-takst, akut-tillæg |
| **Fejlfinding** | Diagnostik først, fix bagefter | Estimat før udførsel, dokumentér årsag |
| **Tavlearbejde** | Eltavle / udvidelse / ny | Komponent-stykliste, dokumentér før/efter foto |
| **Installationer** | Stikkontakter, lamper, hvidevarer | Standard-tider per punkt, materiale-pakker |
| **Nybyg/renovering** | Større projekter, faseopdelt | Forskud + rater + slutfaktura, change orders |
| **Ladebokse** | Type 2 / Type B RCD-krav | EV-specifik kalkulation, nettilmelding-flag |
| **Netværk** | Cat6/Cat7, fiber, switches | IT-paktidskode, måling/cert. dokumentation |
| **Kabelbakker/kabelkanaler** | Industrielt + erhverv | Meter-baseret, "sorte kanaler" detalje |
| **Butik/erhverv** | Belysning, skiltning, alarmer | Driftsforstyrrelses-hensyn, aften/natarbejde |
| **Industri** | 3-fas tunge installationer | Højere risk-buffer, ofte med totalentreprenør |

### Hvad der mangler
- **Standardpakker per arbejdstype** med præ-udfyldte materialelister + tider (delvis i kalkulator-skabeloner)
- **Hvad-er-akut?**-flag på sag (akut = højere takst, prioritet i kalender)
- **Km-takst + diætgodtgørelse** som linjer på faktura (delvis via "øvrige omkostninger")
- **Foto-dokumentation** før/efter på sag — kan uploades, men ikke struktureret per work order step
- **Måleresultat-skabeloner** (kontinuitet, RCD-test, isolationsmåling) — påkrævet for KS

### Roadmap-prioritet
**Phase 1:** Akut-flag + tillæg på sag.
**Phase 2:** KS-måleresultat-modul (lovkrav for el-installatør).
**Phase 3:** Per-step foto-dokumentation linket til work order.

---

## 3) Solceller / BESS — Eltas specialiserede produkt

| Komponent | Behov |
|---|---|
| **Solcellepakker** | Standard "X kWp"-pakker med moduler/inverter/montagesystem |
| **Invertere** | Single/3-fase, hybrid, mærkekompatibilitet |
| **Batterier** | Kapacitet, cyklusser, garanti, BESS-mode |
| **ATS/backup** | Automatisk omskifter ved netfejl |
| **BESS** | Battery Energy Storage — kommerciel/industriel skala |
| **Nettilmelding** | Online ansøgning til netselskab (typisk N1, Cerius, Radius) |
| **PSO / >50 kW** | Større anlæg kræver særlige godkendelser + målesystem |
| **Dokumentation** | DataMaster, AC/DC-skema, måleresultater, KS-pakke til kunde |

### Hvad vi har
- Kalkia-engine kender solcelle-komponenter
- Electrical engine kan dimensionere DC/AC-kabler + sikringer
- Tilbudsskabeloner indeholder standard-tekster

### Hvad der mangler
- **Nettilmeldings-flow** med trin-for-trin checkliste
- **PSO-tracker** for anlæg >50 kW (deadline + status)
- **Fjernovervågning-integration** (FusionSolar / SolarEdge / GoodWe APIs) — viser produktion på sag
- **BESS-specifikke kalkulationer** — backup-dimensionering, peak shaving
- **Dokumentations-pakke-generator**: når sag færdigmeldes, generér PDF-bundle med alle KS-dokumenter automatisk

### Roadmap-prioritet
**Phase 1:** Nettilmeldings-checkliste + status på sag.
**Phase 2:** Dokumentations-pakke-generator.
**Phase 3:** Fjernovervågning-integration (én leverandør først, fx Huawei FusionSolar).
**Phase 4:** BESS-specifikke kalkulationer.

---

## 4) Produkter / pakker / kalkulation

### Hvad vi har
- `supplier_products` med live priser fra AO + LM
- `kalkia_nodes` + `kalkia_variants` + `kalkia_variant_materials` for opbygning af pakker
- `customer_supplier_prices` + `customer_product_prices` for kundespecifikke priser
- `supplier_margin_rules` med priorithierarki
- Margin-engine + price-engine med tier/volume/discount
- Prishistorik + price alerts

### Hvad der mangler
- **Produktkatalog-UI** med søgning/filtre — pt. spredt over flere settings-sider
- **"Min standardpakke"-bygger** for sælger der gerne vil gemme sin egen standardkonfiguration
- **Bundle-rabatter** (køb X + Y → automatisk Z % rabat)
- **Pris-importerer fra Excel** for kunder med eksisterende prisaftale
- **Konkurrent-pris-tracker** (manuel input, ingen scraping)
- **Marginalysis-dashboard**: hvor tjener vi mest? hvor er marginen for tynd?

### Roadmap-prioritet
**Phase 1:** Samlet produktkatalog-UI.
**Phase 2:** "Min standardpakke" per sælger.
**Phase 3:** Bundle-rabat-engine.
**Phase 4:** Marginalysis-dashboard.

---

## 5) AI-kalkulation "superman"

Den ambitiøse vision: kunden uploader et komplet udbudsmateriale, ELTA CRM analyserer det og leverer et færdigt tilbud med advarsler om udbuds-mangler.

### Komponenter
1. **Upload + parsing** — PDF, DWG/DXF, billeder, Word-dokumenter
2. **Tegning-læsning** — antal stikkontakter, lamper, paneler i grundplan; kabel-routing
3. **Beskrivelse-læsning** — NLP-pas over arbejdsbeskrivelse, finder kategorier (lys, kraft, IT, alarm)
4. **Material-/tids-beregning** — match til kalkia + standardtider per punkt
5. **Uoverensstemmelser** — tegning siger 12 stikkontakter, beskrivelse siger 10 → flag
6. **Mangel-detektion** — udbud nævner ikke RCD-type, men har EV-lader → påkrævet flag
7. **Forbehold** — auto-foreslå standard-forbehold (fx "tilslutninger til hvidevarer er ikke inkluderet")
8. **Change orders** — efter tilbud accept, find ekstraarbejde-muligheder baseret på materialevalg
9. **Tilbudstekst-generering** — dansk professionel prosa
10. **Montørinstruks-generering** — punktvis instruktion til den udførende montør

### Hvad vi har
- Eksisterende AI projektfortolker (`/dashboard/ai-project`) håndterer NLP for projektbeskrivelser
- Auto-calculations + auto-offer-texts tabeller findes
- Calculation feedback loop til selvlærende engine

### Hvad der mangler
- **PDF-parsing pipeline** (pdfjs-dist + structured extract)
- **Tegning-OCR** — kompleks; måske start med Vision API call
- **Cross-document inconsistency check** — egen LLM-prompt med begge dokumenter i context
- **Forbehold-bibliotek** med versionering
- **Montørinstruks-template** med pladsholdere

### Roadmap-prioritet
**Phase 1:** PDF-parsing → arbejdsbeskrivelse-extraction.
**Phase 2:** Tegning-OCR (start med stikkontakt-detection som POC).
**Phase 3:** Inconsistency-check.
**Phase 4:** Mangel-/forbehold-engine.
**Phase 5:** Montørinstruks-generering.

Dette er **det største og mest ambitiøse modul** — bør køres som et separat track parallelt med kerneflow-arbejde.

---

## 6) Mail-to-work-order

Vision: kunder sender bestilling pr. mail → systemet opretter sag som kladde med alle detaljer udtrukket.

### Hvad vi har
- Mail-indbakke (Sprint 3) modtager kunde-mails
- "Opret som kunde fra mail" findes
- Microsoft Graph mail-sending er på plads

### Hvad der mangler
- **Mail-parser**: kategoriser mail (servicebesøg / nybyg / klage / spørgsmål)
- **Detalje-extraction**:
  - Kunde-navn, adresse, telefon
  - Opgavebeskrivelse
  - Ønsket tidspunkt / akut?
  - Specifikke ønsker (fx "sorte kabelkanaler", "kun fra kl. 8")
  - Adgang (nøgle, kode, mødetidspunkt)
  - Forbehold/begrænsninger (kæledyr, allergi, monteret udstyr)
- **Auto-create work order** som kladde med alle detaljer
- **Bekræftelses-mail** sendes automatisk til kunde
- **Manuel review-kø** til serviceleder før work order godkendes

### Roadmap-prioritet
**Phase 1:** Mail-parser med kategorisering.
**Phase 2:** Detalje-extraction med structured output.
**Phase 3:** Auto-create work order → review-kø.
**Phase 4:** Bekræftelses-mail.

---

## 7) Rettigheder / adgang

Pt. har vi minimal RBAC: admin / employee.

### Roller der skal understøttes

| Rolle | Adgang |
|---|---|
| **Admin** | Alt |
| **Serviceleder** | Alle sager, alle medarbejdere, kalender, fakturering |
| **Montør** | Kun egne work orders + tidsregistrering, ikke priser eller andre sager |
| **Salg** | Tilbud, kunder, leads, ikke timepriser eller faktura-detaljer |
| **Bogholderi** | Faktura, kreditnota, e-conomic, ikke sag-detail |
| **Samarbejdspartner** | Begrænset til specifik sag (read-only + dokumenter) |
| **Kundeportal** | Egne tilbud, fakturaer, beskeder |

### Sag-scope
- "Egne sager" — montør ser kun work orders tildelt sig
- "Team-sager" — serviceleder for et team
- "Alle sager" — admin / serviceleder med fuldt overblik

### Hvad der mangler
- Migration: `profiles.role` udvides eller separate `user_roles` tabel
- RLS-policies på alle relevante tabeller (work_orders, time_logs, invoices, customers, ...)
- UI-side gating: skjul priser, faktura-knapper, m.m. baseret på rolle
- Audit-log: hvem så hvad / hvornår

### Roadmap-prioritet
**Phase 1 (kritisk — første prioritet efter faktura-modulet):** Definér rolle-matrix + migration.
**Phase 2:** RLS-policies på alle eksisterende tabeller.
**Phase 3:** UI-gating + admin-side til at administrere roller.
**Phase 4:** Audit-log.

---

## 8) Kundeportal — udvidelse

### Hvad vi har
- Token-baseret adgang
- Tilbud-visning + e-sign accept
- Beskeder mellem kunde og sælger
- Dokumenter + service-sager

### Hvad der mangler
- **Faktura-fane** (se Sprint 7A-analyse)
  - Liste + detail + PDF-download
  - Type-pille + status-badge
  - Kreditnota + voided-handling
- **Betalingsstatus** med historik
- **Live-status på sag**: "Montør på vej / arbejde i gang / færdig"
- **Foto-galleri** fra montørens dokumentation
- **Måleresultater** ved KS-færdigmelding
- **Genbestil**-knap på tidligere arbejde
- **Mobilvenlig PWA-shell** for hurtig adgang

### Roadmap-prioritet
**Phase 1 (Sprint 7A):** Faktura-fane med PDF.
**Phase 2:** Live sag-status.
**Phase 3:** Foto + måleresultater.
**Phase 4:** PWA-shell + push-notifikationer.

---

## 9) e-conomic

### Hvad vi har
- `economic-client.ts` med dual-header auth
- Settings-tabel + skip-guard ved manglende credentials
- Idempotent `createInvoiceInEconomic` (delvis færdig)
- Customer-sync funktion
- Audit-log via `accounting_sync_log`

### Hvad der mangler
- Credentials + sandbox-konto (afventer Henrik)
- Færdiggør `createInvoiceInEconomic` (layout, paymentTerms, kunde-mapping)
- Ny `createCreditNoteInEconomic` mod e-conomic's credit-note endpoint
- `registerPaymentInEconomic` for paid-status push
- Webhook fra e-conomic for "betalt"-status (auto-flip)
- Konflikt-håndtering ved network-fejl
- Settings-UI på `/dashboard/settings/economic` med test-connection
- Mapping-konfiguration: produkt → konto, momskode, kundenummer-format

### Roadmap-prioritet
**Phase 1 (afventer Henrik):** Indhent credentials + sandbox.
**Phase 2:** Færdiggør invoice-create mod sandbox.
**Phase 3:** Credit note-push.
**Phase 4:** Payment webhook + auto-paid.
**Phase 5:** Mapping-UI til konfiguration uden kode.

---

## 10) Prioriteret rækkefølge — sprint-roadmap efter faktura-modulet

### Tier 1 — kritisk infrastruktur (skal komme før alt andet)

**Sprint 7 — Permissions / RBAC**
*Begrundelse: før vi tilføjer flere brugere og roller (montør, sælger, bogholderi) skal RLS være vandtæt. Senere refaktorer er smertelige.*
- 7.1 Definér rolle-matrix
- 7.2 Migration: roles + user_roles
- 7.3 RLS-policies på alle tabeller
- 7.4 UI-gating

**Sprint 8 — Kundeportal-fakturaer**
*Begrundelse: bygger direkte ovenpå Sprint 6F-4. Lavt risiko, høj synlighed for kunden. Henriks egne kunder vil opleve forbedring straks.*
- Se `SPRINT_7A_CUSTOMER_PORTAL_OR_ECONOMIC_PREP_ANALYSIS.md`

### Tier 2 — produkt + kalkulation (kerneværdiskabelse)

**Sprint 9 — Samlet produktkatalog + standardpakker**
- 9.1 Catalog-UI med søgning
- 9.2 "Min standardpakke" per sælger
- 9.3 Bundle-rabat-engine

**Sprint 10 — Kalkulations-finpudsning**
- 10.1 Marginalysis-dashboard
- 10.2 Auto-revisionssystem (kalkulation følges op af faktisk forbrug)
- 10.3 Konkurrent-pris-tracker

### Tier 3 — AI / automatisering (skala-multipliér)

**Sprint 11 — Mail-to-work-order**
- 11.1 Mail-kategorisering
- 11.2 Structured extraction af kunde + opgave
- 11.3 Auto-create work order → review-kø

**Sprint 12 — AI-kalkulation Phase 1**
- 12.1 PDF-parsing pipeline
- 12.2 Arbejdsbeskrivelse-extraction
- 12.3 Auto-tilbud-draft

**Sprint 13 — AI-kalkulation Phase 2**
- 13.1 Tegning-OCR (POC)
- 13.2 Inconsistency-check
- 13.3 Mangel-/forbehold-engine

### Tier 4 — eksterne integrationer (afhængig af Henriks credentials)

**Sprint 14 — e-conomic** *(blokeret indtil credentials)*
- Som beskrevet i §9

**Sprint 15 — Nettilmelding + KS-pakke**
- 15.1 Nettilmeldings-checkliste
- 15.2 Dokumentations-pakke-generator
- 15.3 KS-måleresultat-skabeloner

### Tier 5 — løbende forbedringer (parallelt med tier 1–4)

- **Lager-modul** (varevogn → automatisk fratræk)
- **Akut-flag + km-takst + diætgodtgørelse**
- **Slut-rapport-PDF til kunde**
- **Foto-dokumentation per work order step**
- **Fjernovervågning-integration (Huawei FusionSolar)**
- **Live sag-status i portal**
- **Mobilvenlig PWA-shell**

---

## 11) Risiko & afhængigheder

| Risiko | Sandsynlighed | Konsekvens | Mitigation |
|---|---|---|---|
| Henriks e-conomic credentials forsinker | Høj | Tier 4 forsinkes | Lav tier 1–3 først; e-conomic kan vente |
| RBAC-migration breaker eksisterende data | Mellem | Stop-the-bleeding scenario | Migration kan rulles tilbage; test først i staging |
| AI-kalkulation underleverer | Mellem | Spildt sprint-tid | Fejl-tolerant: AI generér forslag, ikke endelig kalkulation |
| Kundeportal RLS lækker data | Lav | Compliance-issue | Vandtæt test før release; security review |
| Tegning-OCR teknisk umuligt | Mellem | Tier 3 phase 2 droppes | Start med stikkontakt-detection POC; udvid hvis muligt |
| Performance ved store sager | Lav | Opfattet langsomhed | Eksisterende `.limit()` + cache-strategier |

---

## 12) Mål for 2026 (high-level)

**Q2 2026** *(Vi er her — Maj)*
- ✅ Faktura-modul produktionsklart internt (Sprint 6 færdig)
- 🎯 RBAC + kundeportal-faktura

**Q3 2026**
- 🎯 Produktkatalog + standardpakker færdig
- 🎯 e-conomic live (afhænger af credentials)
- 🎯 Mail-to-work-order phase 1

**Q4 2026**
- 🎯 AI-kalkulation phase 1 (PDF + arbejdsbeskrivelse)
- 🎯 Nettilmelding + KS-pakke
- 🎯 Lager-modul phase 1

**2027**
- 🎯 AI-kalkulation phase 2 (tegning-OCR)
- 🎯 Fjernovervågning-integration
- 🎯 Mobilvenlig PWA
- 🎯 Multi-team / multi-afdeling support

---

## 13) Kort sagt

ELTA CRM bygger fra et solcelle-fokuseret CRM mod et **fuldt el-installatør-ERP** der både dækker det daglige servicearbejde og store solcelle-/BESS-projekter. Roadmappet sætter:

1. **Sikkerhed & rolle-styring først** (RBAC) — ellers kan vi ikke skalere brugerantallet
2. **Kundefacing forbedring** (portal-faktura) — bygger på lige-leverede 6F-4
3. **Produkt + kalkulation** — kerneværdiskaben for sælgerne
4. **AI / automatisering** — skala-multiplikator når basis er solid
5. **Eksterne integrationer** — e-conomic + nettilmelding når credentials er på plads

Den ambitiøse "superman"-AI-kalkulation er et separat track der kan køre parallelt med tier 1–3, fordi den ikke blokerer det daglige arbejde.
