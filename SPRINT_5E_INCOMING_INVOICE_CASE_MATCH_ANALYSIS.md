# Sprint 5E — Leverandørfaktura koblet til sag Analyse

**Snapshot:** 2026-05-04
**Branch / HEAD:** `main` @ `b0c03ef` (Sprint 5D commit 2)
**Audit basis:** filsystem + læsning af mig 00094, 00095 + live schema/rowcount via Supabase Management API + læsning af Phase 15 service-lag (`incoming-invoices.ts`, `incoming-invoice-matcher.ts`, `incoming-invoice-parser.ts`).
**Scope:** Kun analyse. Ingen kode-, schema- eller config-ændringer.

---

## Executive summary

Phase 15 incoming_invoices-stakken er **fuldt bygget bagud** (parser, matcher, approval, audit log, e-conomic push) men har **0 rows i prod** og kobler **kun til `work_orders`, ikke til `service_cases`**. Det er et reelt arkitektur-problem nu hvor `service_cases` er den canonical sag og en enkelt sag kan have 0-N work_orders. Når matcheren rammer én work_order, mister vi sag-kontekst hvis den WO bliver slettet eller ikke er den "rigtige" af flere.

**Tre konkrete mangler for Sprint 5E:**

1. **Ingen `matched_case_id`-kolonne** på `incoming_invoices`. Matcheren går altid via `work_orders` → falder tilbage på adresse/case_number → finder seneste WO på sagen. Sag-id opløses ikke direkte og lagres ikke.
2. **Approve-flow opretter ikke noget på sagen.** `approveInvoice` flipper status og pusher til e-conomic (skipper hvis settings tom). Den indsætter **ikke** linjer i `case_materials` eller `case_other_costs`. Sagen bliver ikke "vidende" om at fakturaen eksisterer.
3. **Økonomi-tab (Sprint 5D) inkluderer ikke leverandørfakturaer** — fordi der intet sted er at hente "leverandørfaktura-kost på denne sag" fra. UI viser kun det der allerede er bookt i `case_materials`/`case_other_costs`/`time_logs`.

**Hvad DOG virker:**

- Schema `incoming_invoices` (43 kolonner) + `incoming_invoice_lines` + `incoming_invoice_audit_log` — tre tabeller med RLS, fil-hash dedup, parse_status, match_breakdown, approval state, e-conomic linkage
- Matcher med 6 vægtede signaler, score 0–1 og breakdown JSONB
- Detail-UI på `/dashboard/incoming-invoices/[id]` viser parsed felter, match-breakdown, audit log, approve/reject/reparse-knapper
- Phase 15.1 `requires_manual_review` + `acknowledgeReview` gate
- e-conomic push er forberedt men returnerer `skipped` indtil settings er konfigureret
- Cron-routes findes: `/api/cron/incoming-invoices` (email ingest, daily) + `/api/cron/incoming-invoices-api` (AO endpoint, daily)

**Anbefaling:** Sprint 5E lægger `matched_case_id` (additivt), opdaterer matcher + approve-flow, og kobler ind på Økonomi-tab. **Vi opretter IKKE automatiske case_materials**-linjer i 5E — for at undgå dobbelt bogføring vælger vi en "kun-vis"-strategi (faktura læses som omkostning, ikke som autoindsat material-linje). Operatør kan ÆN-NE konvertere én linje til case_materials hvis ønsket.

---

## Eksisterende schema

### `incoming_invoices` (43 kolonner, mig 00094 + 00095)

**Identifikation/source:**
- `id` (uuid PK), `source` (enum: email/upload/manual), `source_email_id` (FK → incoming_emails), `uploaded_by` (FK → profiles)
- `file_url`, `file_name`, `file_size_bytes`, `mime_type`, `file_hash` (SHA-256, dedup), `raw_text`

**Parsede header-felter:**
- `supplier_id` (FK → suppliers, NULL hvis ikke matchet)
- `supplier_name_extracted`, `supplier_vat_number`
- `invoice_number`, `invoice_date`, `due_date`, `currency` (default DKK)
- `amount_excl_vat`, `vat_amount`, `amount_incl_vat`
- `payment_reference` (FIK/+71/EAN/OCR), `iban`

**Parsing/match state:**
- `parse_status` (enum: pending/parsed/failed/manual/needs_review)
- `parse_confidence` (0–1)
- `matched_work_order_id` (FK → work_orders) ⚠️ **kun WO, ikke sag**
- `matched_purchase_order_id` (reserveret, intet PO-modul endnu)
- `duplicate_of_id` (FK self), `match_confidence`, `match_breakdown` (JSONB)
- `requires_manual_review` (boolean, sat når confidence < 0.7)

**Approval workflow:**
- `status` (enum: received/awaiting_approval/approved/rejected/posted/cancelled)
- `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejected_reason`
- `external_invoice_id`, `external_provider`, `posted_at` (e-conomic kobling)
- `notes`, `created_at`, `updated_at`

**UNIQUE indexes:**
- `(supplier_id, invoice_number)` partial — dedup pr. leverandør
- `file_hash` partial — hard dedup på file content
- `(external_provider, external_invoice_id)` partial

### `incoming_invoice_lines` (11 kolonner)

- `id`, `incoming_invoice_id` (CASCADE), `line_number`, `description`
- `quantity`, `unit`, `unit_price`, `total_price`
- `supplier_product_id` (FK → supplier_products) ✓ kan kobles til vares-katalog
- `raw_line` (rå tekst hvis parser ramte denne linje)
- `created_at`

**Hvad der mangler:** ingen `case_material_id` eller `case_other_cost_id` — linjen kan ikke pege på en oprettet sag-omkostning, så vi kan ikke se "denne fakturalinje blev til denne sag-linje".

### `incoming_invoice_audit_log` (9 kolonner)

- `id`, `incoming_invoice_id` (CASCADE), `action` (ingested/parsed/matched/approved/rejected/posted/duplicate_detected/error)
- `actor_id`, `previous_value` (JSONB), `new_value` (JSONB), `ok`, `message`, `created_at`

Append-only. Bruges allerede ved hver state-transition.

---

## Eksisterende UI

### `/dashboard/incoming-invoices` — Approval queue list

Real:
- Filter-tabs: awaiting_approval / needs_review / approved / rejected / posted med live counts
- Liste med leverandør, fakturanr, beløb, dato, status, parse confidence, match confidence, "Kræver review"-pille
- Link til detail per række
- 0 rows i prod — UI har dog været brugt i smoke-test

### `/dashboard/incoming-invoices/[id]` — Detail

Real:
- 3-panel header: Status / Parsede felter / Match resultat
- **Match-breakdown panel** med per-signal score-bars (vat_match, supplier_name_match, supplier_order_ref_match, work_order_via_case, work_order_via_title, customer_address_match, duplicate_detected) + total + reasons-array
- **Linjer-tabel** (incoming_invoice_lines) med beskrivelse, antal, enhed, stk-pris, total
- **Audit log timeline** (seneste 50)
- **Knapper:** Approve (med "kræver review" gate + acknowledgeReview-bekræftelse), Reject (med begrundelse, min 3 chars), Reparse

⚠️ **Detail viser arbejdsordre-link (`/dashboard/work-orders/[id]`)** — den route eksisterer faktisk ikke; det skulle være `/dashboard/orders/[case_number]`. **Bug at rette i Sprint 5E.**

---

## Eksisterende import-flow

### Email-vej (live, men ubrugt)
- Cron `/api/cron/incoming-invoices` (daily 09:15)
- Reader `incoming_emails` (191 rows i prod) for nye mails der har PDF/XML attachment der ligner faktura (filnavn matcher `faktura/invoice/kreditnota` eller mime=PDF)
- For hvert match: opretter `incoming_invoices` row, henter fil-bytes, kalder parser → matcher → state-flip
- **0 rows i prod** — ingen leverandør har nogensinde mailet en faktura ind ad denne kanal

### API-vej (delvis live)
- Cron `/api/cron/incoming-invoices-api` (daily 09:30) — kalder AO endpoint
- `AO_INVOICE_API_NOT_CONFIGURED` returneres pt. fordi credentials ikke er sat
- LM SFTP findes for product-sync men IKKE for invoice-sync
- **0 rows i prod**

### Upload-vej (kode klar, ingen UI)
- `ingestFromUpload(...)` findes i service-laget men intet upload-UI på `/dashboard/incoming-invoices`
- Operatør kan ikke uploade en PDF manuelt fra UI

### Status: 0 → 0 rows
Phase 15 fungerer i smoke-test (audit-trail rækker findes ikke heller — `incoming_invoice_audit_log = 0 rows`). Hele stakken er **uverificeret med rigtig leverandørfaktura**.

---

## Gap-analyse

Ordnet efter konsekvens for sag-økonomi:

| # | Gap | Lokation | Konsekvens hvis ikke lukket |
|---|---|---|---|
| 1 | **Ingen `matched_case_id`** | DB | Faktura kan ikke direkte kobles til sag. Kun via WO → og kun seneste WO på sagen. |
| 2 | Matcher peger kun på WO | `incoming-invoice-matcher.ts:200` | Hvis sagen har 5 WO'er går alle leverandørfakturaer til den nyeste — uvedkommende WO. |
| 3 | Approve opretter intet på sagen | `incoming-invoices.ts:471` | Sagen forbliver økonomi-blind. |
| 4 | Økonomi-tab kender ikke leverandørfakturaer | Sprint 5D | Operatør skal manuelt kopiere kost ind i `case_materials`/`case_other_costs`. |
| 5 | Detail-link `/dashboard/work-orders/[id]` eksisterer ikke | `detail-client.tsx:150` | 404 når operatør klikker "Arbejdsordre". Lille bug. |
| 6 | Ingen `case_material_id`/`case_other_cost_id` på lines | DB | Kan ikke se hvilke linjer er konverteret til sag-omkostning. |
| 7 | Ingen upload-UI | `/dashboard/incoming-invoices/page.tsx` | Operatør kan ikke teste flow med en lokal PDF. |
| 8 | Ingen "skift sag"-handling | UI | Hvis matcher rammer forkert sag kan man ikke korrigere uden SQL. |
| 9 | Ingen visning på sag-side | `/dashboard/orders/[id]` | Kan ikke se "hvilke leverandørfakturaer hører til denne sag". |
| 10 | e-conomic settings tomme | DB | Approve returnerer `skipped` for e-conomic-push. Ikke 5E-blocker. |

---

## Anbefalet datamodel

### Princip

1. **Sag er centrum** — en faktura skal kunne stå selv på sagen, uafhængigt af om en specifik WO eksisterer.
2. **Linje-niveau provenance** — hvis en fakturalinje konverteres til sag-omkostning, skal vi kunne spore det.
3. **Backward-compat** — `matched_work_order_id` beholdes, så Phase 15-koden ikke knækker. `matched_case_id` lægges ovenpå.

### Foreslåede DDL (alt additivt — ingen DROP)

```sql
-- ============================================================
-- Migration: incoming_invoices.matched_case_id (Sprint 5E-1)
-- ============================================================
ALTER TABLE incoming_invoices
  ADD COLUMN IF NOT EXISTS matched_case_id UUID
    REFERENCES service_cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_case
  ON incoming_invoices(matched_case_id)
  WHERE matched_case_id IS NOT NULL;

-- matched_work_order_id BEHOLDES — backward-compat med Phase 15.
-- Matcher fyldes med BÅDE matched_case_id og matched_work_order_id når
-- relevant. Matchen kan også sætte case uden WO (fx ved direkte
-- case_number-match uden tilhørende work_order).
```

```sql
-- ============================================================
-- Migration: incoming_invoice_lines provenance (Sprint 5E-3)
-- ============================================================
ALTER TABLE incoming_invoice_lines
  ADD COLUMN IF NOT EXISTS converted_case_material_id UUID
    REFERENCES case_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_case_other_cost_id UUID
    REFERENCES case_other_costs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

-- Konverteringen er én-vejs men kan rulles tilbage ved at slette
-- case_material/case_other_cost-rækken (FK SET NULL — fakturalinjen
-- forbliver med converted_at sat så vi ved at den HAR været
-- konverteret historisk).
```

`case_materials.source_incoming_invoice_line_id` og `case_other_costs` har **ikke** denne FK i 5B/5C. Pga. **dobbelt-link-strategi** (linje peger på sag-omkostning OG sag-omkostning peger tilbage på linje) tilføjer vi i 5E-3:

```sql
ALTER TABLE case_other_costs
  ADD COLUMN IF NOT EXISTS source_incoming_invoice_line_id UUID
    REFERENCES incoming_invoice_lines(id) ON DELETE SET NULL;
-- (case_materials har allerede dette felt fra mig 00100/Sprint 5B)
```

### Hvilken tabel skal en faktura-linje konverteres til?

Baseret på linjens karakter:

| Linje-type | Hint | Konvertér til |
|---|---|---|
| Har `supplier_product_id` (matchet) | Konkret vare med SKU | `case_materials` |
| Beskrivelse matcher "kørsel"/"transport"/"frag(t)" | Tekst | `case_other_costs` (kategori `koersel` eller `fragt`) |
| Beskrivelse matcher "leje"/"lift"/"kran"/"stillads" | Tekst | `case_other_costs` (kategori `lift`/`kran`) |
| Beskrivelse matcher "underleverandør"/"underent"/"konsulent" | Tekst | `case_other_costs` (kategori `underleverandoer`) |
| Resten | Ingen hint | Operatøren vælger manuelt i dialog |

**Auto-detection foreslås kun som SUGGEST** — operatør bekræfter altid før konvertering. Ingen automatisk INSERT.

---

## Anbefalet workflow

```
[1] FAKTURA MODTAGES
    ├── email cron / API cron / manual upload
    └── INSERT incoming_invoices (status='received', parse_status='pending')

[2] PARSE
    └── parser ekstraherer header + linjer
    └── parse_status='parsed' (eller 'failed'/'needs_review')

[3] MATCH (forbedret i 5E-1)
    ├── Suppliers via VAT/name (uændret)
    ├── Case via:
    │   - case_number i raw_text (eksakt match — high confidence)
    │   - work_order title-match → bruger work_order.case_id (eksisterende sti)
    │   - delivery address → case → seneste WO (eksisterende fallback)
    └── UPDATE incoming_invoices SET
          matched_case_id = X (NEW),
          matched_work_order_id = Y (eksisterende, kan stadig være NULL),
          status = 'awaiting_approval'

[4] OPERATØR REVIEWER (UI)
    ├── Detail-side viser sag (med link til /dashboard/orders/[case_number])
    ├── "Skift sag" knap hvis match er forkert (NEW)
    ├── Per-linje preview: "konvertér til materiale / øvrigt / spring over" (NEW)
    └── Approve/Reject/Reparse (eksisterende, men approve udvides)

[5] APPROVE (5E-2 + 5E-3)
    ├── status='approved' (uændret)
    ├── audit log (uændret)
    ├── e-conomic push (uændret — skipper hvis ikke konfigureret)
    └── For hver linje operatør har markeret til konvertering:
        - Linje med kategori-hint → INSERT case_other_costs
          (source='supplier_invoice', source_incoming_invoice_id +
           source_incoming_invoice_line_id sat)
        - Linje med supplier_product_id → INSERT case_materials
          (source='supplier_invoice', source_incoming_invoice_line_id sat,
           snapshot fra invoice line: description, sku_snapshot,
           supplier_name_snapshot, quantity, unit_cost=unit_price,
           unit_sales_price = beregnet via margin-rule eller 0 = operatør sætter)
        - UPDATE incoming_invoice_lines SET converted_case_material_id /
          converted_case_other_cost_id, converted_at, converted_by

[6] VIS PÅ ØKONOMI-TAB (5E-4)
    ├── getServiceCaseEconomy udvides:
    │   - tæller leverandørfakturaer på sagen (incoming_invoices WHERE matched_case_id)
    │   - viser "Heraf fra leverandørfaktura" på Materialer/Øvrige cards (if applicable)
    │   - quality flag: "X ukonverterede fakturalinjer" (hvis approved
    │     faktura har linjer der hverken er konverteret eller eksplicit sprunget over)
    └── Ny sektion på Økonomi-tab: "Leverandørfakturaer (N)" med
        liste af linkede incoming_invoices, deres status, total,
        og link til detail
```

---

## Dobbelt-bogføringsstrategi

**Risiko:** Operatør har manuelt bookt en lift-leje på sagen i `case_other_costs` (Sprint 5C). To dage senere kommer leverandørfakturaen ind, matches, og operatør vil approve — den linje vil indsætte en ny `case_other_costs`. Nu står samme omkostning to gange.

### Anbefalede beskyttelser

1. **Approve-dialog viser preview først.** Operatør ser præcis hvilke linjer der vil blive oprettet i `case_materials`/`case_other_costs` med beløb og kategori. Operatør skal eksplicit klikke "Konvertér N linjer + godkend" — ingen auto-bogføring.

2. **Per-linje "spring over"-mulighed.** I preview kan operatør markere en linje som "spring over (allerede bogført manuelt)" — den får `converted_at` sat og linket til en eksisterende `case_other_costs.id` operatøren peger på (valgfri, til revisor-spor).

3. **Quality-flag på Økonomi-tab.** Hvis en sag har approved leverandørfaktura(er) med ukonverterede + ikke-sprunget-over linjer, vis advarsel: "X fakturalinjer afventer behandling — risiko for manglende eller dobbelt bogføring".

4. **No automatic conversion at email-ingest tid.** Konvertering sker KUN ved approve, og KUN per operatørs eksplicitte valg.

5. **Konvertering kan rulles tilbage.** Sletter operatør den oprettede `case_material`/`case_other_cost` linje, peger fakturalinjens `converted_*_id` på NULL (FK SET NULL), men `converted_at`-timestamp bevares. Næste gang siden åbnes, ser operatør "denne linje var konverteret men målrækken er væk — konvertér igen?".

6. **Audit-log for hver konvertering.** Append-only entry i `incoming_invoice_audit_log` med action='converted_to_case_material' / 'converted_to_case_other_cost' og linje-id.

7. **Unique constraint** på `incoming_invoice_lines.converted_case_material_id` (partial WHERE NOT NULL) — én fakturalinje kan kun pege på ÉN sag-omkostning.

---

## Anbefalet Sprint 5E-plan

### 5E-1 — `matched_case_id` + UI sag-match (3 dage)

**Levér:**
1. Migration: `incoming_invoices.matched_case_id` (additivt, FK + partial index)
2. Matcher-opgradering (`incoming-invoice-matcher.ts`):
   - Hvor `matched_work_order_id` opløses, sæt også `matched_case_id = work_order.case_id`
   - Hvis case_number findes i `raw_text` direkte, sæt `matched_case_id` selv hvis WO ikke kan resolves
3. Server actions:
   - Udvid `getIncomingInvoiceDetailAction` til også at returnere `case` (id, case_number, title, customer_name)
   - Ny `setIncomingInvoiceCase(invoiceId, caseId)` — operatør "skift sag" handling
   - Ny `clearIncomingInvoiceCase(invoiceId)` — fjern match
4. UI på `/dashboard/incoming-invoices/[id]`:
   - Match-resultat-panel viser nu **Sag** (link til `/dashboard/orders/[case_number]`) + Arbejdsordre under
   - **Bugfix:** arbejdsordre-link rettes fra `/dashboard/work-orders/[id]` til `/dashboard/orders/[case_number]`
   - Knap "Skift sag" → dialog med søgning i `service_cases` (genbruger `listOpenServiceCasesForPicker` fra Sprint 4D-2)
   - Knap "Fjern sag-match" hvis matched_case_id er sat
5. Type-check + build clean
6. Browser-test: opret en `incoming_invoices`-row manuelt via SQL eller upload (hvis upload-UI laves), bekræft sag-match virker

**Acceptkriterier:**
- Hvis fakturaen rammer en WO, viser detail-siden også sag-link
- Operatør kan ændre sag manuelt
- Eksisterende WO-match-flow virker stadig

### 5E-2 — Approval-flow med per-linje preview (2 dage)

**Levér:**
1. Server action `previewIncomingInvoiceConversion(invoiceId)` — returnerer per-linje suggested target (case_materials vs case_other_costs vs skip) baseret på description + supplier_product_id
2. UI på detail-side: før Approve klik vises preview-dialog:
   - Tabel med fakturalinjer + suggested type-pile + checkbox "konvertér" + dropdown for type (materiale/øvrige) + dropdown for kategori (kun øvrige)
   - Operatør justerer, bekræfter total antal linjer der konverteres
3. Approve-knap fjernes fra hovedsiden — flyttes ind i preview-dialogen som "Konvertér N linjer + godkend"
4. Type-check + build clean

**Acceptkriterier:**
- Operatør kan ikke approve uden at have set preview
- Preview viser korrekt suggested type
- Operatør kan override hvert valg
- Approve uden konvertering (alle linjer markeret "spring over") tilladt

### 5E-3 — Opret case_materials/case_other_costs ved approve (3-4 dage)

**Levér:**
1. Migration:
   - `incoming_invoice_lines.converted_case_material_id` + `converted_case_other_cost_id` + `converted_at` + `converted_by`
   - `case_other_costs.source_incoming_invoice_line_id` (mirror af case_materials' eksisterende felt)
   - Unique partial index på `incoming_invoice_lines.converted_case_material_id` og `converted_case_other_cost_id` WHERE NOT NULL
2. Approve-flow opdateres:
   - For hver linje markeret til konvertering, INSERT enten `case_materials` (med source='supplier_invoice', supplier_product_id, sku/supplier-name snapshot, qty, unit_cost=unit_price, unit_sales_price=0 eller margin-beregnet) eller `case_other_costs` (med source='supplier_invoice')
   - UPDATE `incoming_invoice_lines.converted_*_id`, `converted_at`, `converted_by`
   - Audit log: `action='converted_to_case_material'` / `converted_to_case_other_cost'` med linje-id
3. Margin-engine integration: hvis sagens kunde har `customer_supplier_prices`/`customer_product_prices` eller global margin-rule for produktet, beregn `unit_sales_price` fra `unit_cost` × margin. Ellers 0 (operatør udfylder).
4. Server action `revertCaseMaterialConversion(caseMaterialId)` / `revertCaseOtherCostConversion(...)` — operatør kan slette den oprettede sag-linje uden at slette fakturalinjen, men `converted_at` bevares som historik (som i strategi-sektion punkt 5)
5. Type-check + build clean

**Acceptkriterier:**
- Approve med 3 linjer markeret til konvertering opretter 3 case_materials/case_other_costs rækker
- Sagens Materialer-tab + Øvrige-tab viser linjerne med kilde-pille "Lev.faktura" (allerede understøttet — Sprint 5B/5C UI har source-pillen)
- Audit log indeholder konverteringerne
- Sletning af målrække fjerner ikke fakturalinjens `converted_at` (historik bevares)

### 5E-4 — Vis leverandørfaktura på Økonomi-tab (1-2 dage)

**Levér:**
1. Udvid `getServiceCaseEconomy(caseId)` (Sprint 5D action):
   - Ny block `supplier_invoices`: { count, approved_count, awaiting_count, rejected_count, total_amount_excl_vat, unconverted_line_count }
   - Update quality_flags med `unconverted_lines: boolean` (true hvis approved invoice har linjer uden converted_at)
2. UI på `/dashboard/orders/[id]` Økonomi-tab:
   - Ny sektion "Leverandørfakturaer (N)" mellem "Øvrige omkostninger" og "Fakturering"
   - Tabel: dato, leverandør, fakturanr, beløb, status, antal linjer, antal konverteret, link til detail
   - Quality flag når der er ukonverterede linjer
3. Bonus: "Kost fra leverandørfaktura" delregne i Materialer-card og Øvrige-card via source='supplier_invoice'-filter (kræver mindre ændring i action — tæller kun)
4. Type-check + build clean

**Acceptkriterier:**
- Sag der har én approved leverandørfaktura viser den i sektion på Økonomi-tab
- Quality flag advarer om ukonverterede linjer
- Cards under "Kostopdeling" viser "heraf fra lev.faktura" når relevant

### Estimat

| Sprint | Dage | Risiko |
|---|---|---|
| 5E-1 (matched_case_id + UI) | 3 | Lav |
| 5E-2 (preview-dialog) | 2 | Lav |
| 5E-3 (auto-INSERT med revertstier) | 3-4 | Mellem (margin-engine integration) |
| 5E-4 (Økonomi-tab) | 1-2 | Lav |
| **Total** | **9-11 dage** | |

---

## Acceptkriterier (Sprint 5E samlet)

Sprint 5E er færdig når **alt** af følgende er sandt:

1. **`matched_case_id` eksisterer i DB** og fyldes af matcheren når en sag kan opløses (direkte eller via WO).
2. **Detail-UI viser sag-link** til `/dashboard/orders/[case_number]` (ikke 404). WO-link bug rettet.
3. **Operatør kan skifte sag** manuelt fra UI hvis matchen er forkert.
4. **Approve-flow viser preview-dialog** med per-linje suggested type + override-mulighed + "spring over".
5. **Approve indsætter `case_materials` / `case_other_costs`** for hver markeret linje med korrekt source + provenance + audit-log.
6. **Approve uden konvertering** (alle markeret "spring over") tilladt — rejected-flow uændret.
7. **Sletning af konverteret linje** fjerner ikke historik (converted_at bevares; FK SET NULL).
8. **Sagens Materialer/Øvrige-tabs** viser leverandørfaktura-linjer med source-pille "Lev.faktura" (allerede understøttet i UI).
9. **Sagens Økonomi-tab** har ny "Leverandørfakturaer"-sektion + quality flag for ukonverterede linjer.
10. **Ingen dobbelt bogføring** mulig uden eksplicit operatør-valg (preview + manuelt valg per linje).
11. **Type-check + build clean.**
12. **Vercel deployment Ready.**
13. **Browser-test** med 1 manuelt oprettet `incoming_invoices`-row + 2 linjer + approve + verificering på sag.

---

## Risici

| Risiko | Sandsynlighed | Mitigering |
|---|---|---|
| **Dobbelt bogføring**: faktura-konvertering kører mens operatør allerede har bookt manuelt | Mellem | Per-linje preview kræver eksplicit valg. "Spring over"-flag tilgængelig. Quality flag på Økonomi-tab viser advarsel. |
| **Faktura matches forkert sag** (især via address fallback med flere sager på samme adresse) | Mellem | matcher-confidence < 0.7 → `requires_manual_review` (eksisterende). 5E-1 tilføjer "Skift sag"-handling. |
| **Linje-konvertering vælger forkert kategori** | Mellem | Suggested type baseret på keywords + supplier_product_id; operatør kan override altid. |
| **Margin-engine returnerer 0 sales_price** for ukendt produkt | Høj | unit_sales_price defaultes til 0; quality flag "mangler salgspris" på Økonomi-tab fanger den. Operatør udfylder via dialog på Materialer-tab. |
| **Faktura uden PDF/bilag** efter email-ingest | Lav | parser_status='failed' → operatør ser fejl, kan reparse eller manual-redigere felter (eksisterende flow). |
| **Manglende leverandørmatch** (`supplier_id` NULL) | Mellem | Kan stadig matches mod sag via case_number/adresse. Operatør kan manuelt sætte supplier (kommer i 5E-1 som "Skift leverandør"-knap — hvis tid). |
| **Moms/total parser-fejl** giver forkert total | Mellem | Phase 15.1 `requires_manual_review` ved confidence < 0.7. UI viser allerede parsed felter — operatør tjekker manuelt. |
| **e-conomic push fejler** efter approve er gennemført | Lav | Allerede best-effort i nuværende kode. status='approved' bevares; e-conomic-push kan retries senere. |
| **Backward-compat med Phase 15** brydes | Lav | Alt additivt. `matched_work_order_id` bevares. Eksisterende detail-UI virker uændret indtil 5E-1's små UI-ændringer. |
| **Sag har 5 work_orders, faktura matches forkert WO** | Mellem | 5E-1 sætter `matched_case_id` baseret på case_number/sag-resolution — ikke kun WO-fallback. Operatør ser sag direkte og kan ignorere WO-match. |
| **Vendor sender kreditnota** (negativ beløb) | Lav | Eksisterende parser markerer det som "kreditnota". 5E-3 skal håndtere negativ qty/unit_price → resulterer i negative case_materials.total_cost. **Skal CHECK quantity > 0 lempes? Defer til når første kreditnota kommer.** |

---

## Hvad denne analyse bevidst IKKE har gjort

- Ingen kodeændringer
- Ingen DB-ændringer
- Ingen migrations udført
- Ingen refactor af eksisterende moduler
- Ingen antagelser om felter der ikke er verificeret i schema
- Ingen estimering af e-conomic config (ekstern blokker, ikke 5E-scope)

Repo er på `b0c03ef` på `main`. Ingen filer modificeret under analysen.

---

## Anbefalet næste skridt

Hvis Henrik godkender denne analyse:

**Næste action: Sprint 5E-1 commit 1** — migration for `incoming_invoices.matched_case_id` + index. Jeg viser SQL'en før jeg kører den, per CLAUDE.md regel.

Hvis du vil ændre rækkefølge — fx tage 5E-4 (visning) før 5E-3 (auto-INSERT) for at se data først — sig til. Den rækkefølge er teknisk muligt men giver mindre værdi (Økonomi-tab vil bare vise rå incoming_invoices uden konverteringer).
