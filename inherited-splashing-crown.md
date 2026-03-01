# Plan: Fase 2 — Marts 2026

## Status: Forrige plan (Fase 1) er FÆRDIG
Alle 5 opgaver gennemført i commit `4353c1c`.

---

## Nye Opgaver — Prioriteret rækkefølge

| # | Opgave | Prioritet | Kompleksitet |
|---|--------|-----------|-------------|
| 1 | PDF auto-attach ved tilbuds-email | Høj | Mellem |
| 2 | Opgaver: Opret + inline edit på /tasks | Høj | Mellem |
| 3 | Leads kanban pipeline board | Høj | Stor |
| 4 | Portal PDF-download for kunden | Medium | Lille |
| 5 | Navigation-fix: Indbakke i sidebar + settings-kort | Medium | Lille |
| 6 | Rapporter: Excel/CSV eksport | Lav | Mellem |

---

## Opgave 1: PDF auto-attach ved tilbuds-email

### Problem
Når en medarbejder klikker "Send Tilbud" på tilbudssiden (`/dashboard/offers/[id]`), åbnes `SendEmailModal` — men PDF'en vedhæftes IKKE automatisk. Medarbejderen skal manuelt downloade PDF'en og vedhæfte den udenfor systemet.

System B ("Den Gyldne Knap" i mail-modulet) gør dette korrekt — PDF genereres, vedhæftes og sendes i ét klik. Men System A (offers-modulet) mangler denne flow.

### Plan

**Trin 1.1 — Udvid `sendOfferEmail` i `email.ts`**
- Generer PDF automatisk via `/api/offers/[id]/pdf` (eller direkte `renderToBuffer`)
- Vedhæft PDF som base64 attachment via `sendEmailViaGraph()`
- Opdater offer status til `sent` automatisk efter succesfuld afsendelse

**Trin 1.2 — Opdater `SendEmailModal` i `offer-detail-client.tsx`**
- Tilføj "Vedhæft PDF" toggle (default: ON)
- Vis PDF-filnavn i modal når toggled on
- Loading-state mens PDF genereres + email sendes

**Trin 1.3 — Auto-statusskift**
- Når email sendes succesfuldt → sæt offer status til `sent`
- Vis toast med bekræftelse

### Filer der ændres
- `src/lib/actions/email.ts` — `sendOfferEmail()` med PDF attachment
- `src/components/email/SendEmailModal.tsx` — PDF toggle
- `src/app/(dashboard)/dashboard/offers/[id]/offer-detail-client.tsx` — status-opdatering

---

## Opgave 2: Opgaver — Opret + inline edit på /tasks

### Problem
- `/dashboard/tasks` har ingen "Opret opgave" knap — tomme-tilstand siger "Opret opgaver fra kundekortet"
- Ingen edit eller slet-handlinger i task-rækkerne
- Ingen `in_progress` shortcut fra listen

### Plan

**Trin 2.1 — Tilføj "Ny opgave" knap til tasks-siden**
- Knap i header ved siden af titel
- Åbner en modal med: titel, beskrivelse, kunde-vælger, tilbud-vælger (valgfri), prioritet, ansvarlig, forfaldsdato, påmindelsestidspunkt
- Bruger `createCustomerTask()` server action

**Trin 2.2 — Tilføj inline handlinger til task-rækker**
- Hover-reveal knapper: Rediger (åbner edit-modal), Slet (med bekræftelse), Markér i gang
- Klik på rækken → åbner edit-modal
- Status-dropdown direkte i rækken (pending → in_progress → done)

**Trin 2.3 — Tilføj "Udførte opgaver" toggle**
- Checkbox/toggle der viser/skjuler done-tasks
- Default: skjult (som på kundekortet)

### Filer der ændres
- `src/app/(dashboard)/dashboard/tasks/tasks-page-client.tsx` — ny knap + inline actions
- Evt. ny komponent: `TaskFormDialog` (genbruges fra customer-tasks)

---

## Opgave 3: Leads kanban pipeline board

### Problem
- Leads har kun listevisning
- Ingen visuel pipeline/funnel — medarbejdere kan ikke drage leads mellem statusser
- Dashboard viser pipeline-tal men ingen interaktiv board

### Plan

**Trin 3.1 — Byg `LeadsPipelineBoard` komponent**
- Kanban-kolonner for hver status: Ny → Kontaktet → Kvalificeret → Tilbud → Forhandling → Vundet → Tabt
- Hvert lead-kort viser: firmanavn, kontaktperson, deal-værdi, dage siden oprettelse
- Farve-kodede kolonner
- Kolonne-header med antal og samlet deal-værdi

**Trin 3.2 — Drag-and-drop statusskift**
- Drag et lead fra én kolonne til en anden → kalder `updateLead(id, { status: newStatus })`
- Optimistic update + revert ved fejl
- Brug `@dnd-kit/core` eller simpel HTML5 drag-and-drop

**Trin 3.3 — Toggle mellem liste og board**
- Tabs i leads-siden header: "Liste" | "Pipeline"
- Gem præference i URL param (`?view=list` / `?view=board`)

### Filer der ændres
- Ny: `src/components/modules/leads/leads-pipeline-board.tsx`
- `src/app/(dashboard)/dashboard/leads/leads-page-client.tsx` — view toggle
- `src/lib/actions/leads.ts` — evt. ny `updateLeadStatus()` action

---

## Opgave 4: Portal PDF-download for kunden

### Problem
- Kunder der besøger portalen kan se tilbudets linjer i HTML — men kan IKKE downloade en PDF
- PDF'er vises kun i "Dokumenter" sektionen hvis System B (gyldne knap) har delt dem
- System A tilbud har ingen PDF tilgængelig for kunden

### Plan

**Trin 4.1 — Tilføj "Download PDF" knap til portal tilbudsdetalje**
- Ny API-route: `/api/portal/offers/[id]/pdf` der validerer portal-token + genererer PDF
- Knap i `offer-detail.tsx` (portal): "Download som PDF"
- Bruger samme `OfferPdfDocument` template som System A

**Trin 4.2 — Sikkerhed**
- Valider at offer tilhører token's customer
- Rate-limit: max 10 PDF-downloads per time per token

### Filer der ændres
- Ny: `src/app/api/portal/offers/[id]/pdf/route.ts`
- `src/components/modules/portal/offer-detail.tsx` — download-knap

---

## Opgave 5: Navigation-fix

### Problem
- "Indbakke" (intern messaging) er IKKE i sidebar — kun tilgængelig via dashboard stat-kort
- Solcelle-kalkulator (`/dashboard/calc`) er skjult
- Email og SMS settings-sider eksisterer men har ingen kort på settings-indekssiden

### Plan

**Trin 5.1 — Tilføj Indbakke til sidebar**
- Tilføj under "Mail" med `MessageCircle` ikon
- Vis ulæste-badge (rød) som de andre nav-items

**Trin 5.2 — Tilføj Email + SMS kort til settings-indeks**
- To nye kort: "E-mail" (Graph API forbindelse, skabeloner) og "SMS" (GatewayAPI)
- Link til eksisterende `/dashboard/settings/email` og `/dashboard/settings/sms`

**Trin 5.3 — Konsolidér kalkulator-links**
- Omdøb "Kalkulationer" i sidebar til at inkludere en dropdown/sub-items
- Eller tilføj "Solcelle-kalkulator" som separat sidebar-item under Værktøjer

### Filer der ændres
- `src/components/layout/sidebar.tsx` — nye items
- `src/app/(dashboard)/dashboard/settings/page.tsx` — nye kort

---

## Opgave 6: Rapporter — Excel/CSV eksport

### Problem
- Rapportsiden viser data men har ingen eksport
- Medarbejdere kan ikke downloade kundelister, tilbudsoversigter eller tidsregistreringer

### Plan

**Trin 6.1 — CSV eksport-funktion**
- Utility: `exportToCSV(data, columns, filename)` med dansk separator (`;`)
- Understøtter: Kunder, Leads, Tilbud, Tidsregistreringer, Projekter

**Trin 6.2 — Eksport-knapper på rapportsiden**
- "Eksportér CSV" knap på hver rapport-sektion
- Inkludér dato-filter (fra/til) i eksporten

**Trin 6.3 — Eksport fra liste-sider**
- Tilføj "Eksportér" knap til kunder/leads/tilbud liste-sider
- Eksporterer den filtrerede visning (inkl. aktive filtre)

### Filer der ændres
- Ny: `src/lib/utils/csv-export.ts`
- `src/app/(dashboard)/dashboard/reports/reports-client.tsx` — eksport-knapper
- Evt. liste-sider for kunder/leads/tilbud

---

## Anbefalet rækkefølge

1. **Opgave 5** (20 min) — Navigation-fix, hurtige forbedringer
2. **Opgave 2** (45 min) — Opgaver med opret + edit
3. **Opgave 4** (30 min) — Portal PDF-download
4. **Opgave 1** (1 time) — PDF auto-attach ved email
5. **Opgave 6** (45 min) — CSV eksport
6. **Opgave 3** (2 timer) — Leads kanban (størst opgave)

---

## Kendte afhængigheder

- Opgave 1 og 4 deler PDF-generering — ændringer i PDF-template påvirker begge
- Opgave 3 kan kræve `@dnd-kit/core` som ny dependency (eller HTML5 native drag)
- Opgave 6's CSV-utility kan genbruges i andre moduler
