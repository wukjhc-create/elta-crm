# Sprint 5A — Materialer + Øvrige omkostninger Analyse

**Snapshot:** 2026-05-04
**Branch / HEAD:** `main` @ `9af24ff` (Sprint 4D-2 commit 4)
**Audit basis:** filsystem-inspektion + læsning af migrations 00014, 00026, 00067, 00073, 00075, 00076, 00086, 00087, 00088, 00094, 00095, 00097, 00098, 00099 + live row counts via Supabase Management/REST.
**Scope:** Kun analyse. Ingen kode-, schema- eller config-ændringer.

---

## Executive summary

**Hård sandhed: Sag-niveau materiale-bogføring og sag-niveau "øvrige omkostninger" findes IKKE.**

Vi har 282k leverandørprodukter, en lille `materials`-katalog (11 stk seeded), `offer_line_items` der allerede tracker `supplier_product_id` + `supplier_cost_price_at_creation`, og en hel Phase 8 profit-motor — **men ingen af det booger forbrug på en sag**. Phase 8's `calculate_work_order_profit` beregner materialekost ved at læse fra **tilbuddets** linjer (`source_offer_id`), ikke fra hvad der faktisk blev brugt på sagen. Det er **fake forbrug** når sagen rent faktisk afviger fra tilbuddet.

**Tre konkrete mangler:**

1. **Ingen `case_materials`-tabel** — dvs. ingen måde at booke en vare på en sag med antal × kostpris × salgspris × DB. Build-planen specificerer den i Sprint 5, den er ikke bygget.
2. **Ingen `case_other_costs`-tabel** — kørsel, leje, underleverandør, bonus → ingen kanonisk model. Kun friktekst i `case_notes`.
3. **`incoming_invoices.matched_work_order_id` peger på `work_orders` (planlægningsopgave), ikke på `service_cases` (sag)** — så når en leverandørfaktura matches, lander den på et planlægningsslot, ikke på sagen som helhed. Det giver problemer når én sag har flere arbejdsordrer.

**Hvad der DOG virker:**
- `service_cases` er canonical sag (4 rows, mig 00098 + 00099 hærder modellen)
- `materials`-katalog (11 seeded varer) + 282.935 `supplier_products`
- `offer_line_items` tracker allerede leverandør-kost-snapshot ved oprettelse (Sprint 7-felter)
- Tab-skelet på `/dashboard/orders/[id]` har "Materialer" og "Øvrige omkostninger" som placeholders der eksplicit siger "Sprint 5"
- Phase 8 profit-RPC findes — kan genbruges når den får rigtigt data-grundlag

**Anbefaling:** Sprint 5 skal levere DB-modellen + UI for `case_materials` og `case_other_costs`, og **flytte** `incoming_invoices.matched_*` til at pege på `service_cases` (med backward-compat). Først derefter giver Økonomi-tab'en (Sprint 5D) ærlige tal.

---

## Eksisterende tabeller

### Katalog / pris-grundlag (alle eksisterer, alle har RLS)

| Tabel | Rows | Formål | Forbindelse til sag |
|---|---|---|---|
| `suppliers` | **2** | AO + LM master | indirekte via supplier_products → offer_line_items |
| `supplier_products` | **282.935** | Leverandørkatalog (AO + LM speilet) | indirekte |
| `materials` | **11** | Domæne-katalog (seedede slugs som `solar_panel`, `install_breaker`) m. default supplier_product_id | indirekte |
| `product_catalog` | 0 | Legacy intern produkt-tabel fra mig 00014, aldrig brugt | ingen |
| `product_categories` | 8 | Kategorier til product_catalog | ingen |
| `customer_supplier_prices` | 0 | Kundespecifik leverandøraftale | ingen |
| `customer_product_prices` | 0 | Kundespecifik produktpris | ingen |
| `supplier_margin_rules` | 0 | Margin-engine prioritetsregler | ingen |

### Sag/ordre / planlægning / tid

| Tabel | Rows | Formål |
|---|---|---|
| `service_cases` | **4** | **Canonical sag** (post-Sprint 2/3) — case_number, projektfelter (mig 00098), source_offer_id (UNIQUE mig 00099), status, KSR, EAN, signature, contract_sum, revised_sum, budget, planned_hours |
| `work_orders` | **2** | **Planlægningsopgave under sag** (Sprint 4) — case_id FK, scheduled_date, assigned_employee_id, source_offer_id, auto_invoice_on_done, low_profit |
| `projects` | 0 | Legacy, ubrugt — kandidat til drop senere |
| `time_logs` | **1** | **Canonical timeregistrering** — employee_id + work_order_id (NOT case_id), cost_amount auto-trigger fra mig 00088 |
| `time_entries` | 0 | Legacy, må ikke røres (regel) |
| `employees` | 1 | active, hourly_rate, cost_rate |

### Tilbud (allerede har materialeforbrug på linjeniveau)

| Tabel | Rows | Sag-koblede felter |
|---|---|---|
| `offers` | 10 | — |
| `offer_line_items` | 8 | `supplier_product_id`, `supplier_cost_price_at_creation`, `material_id` (FK til materials, mig 00076), `cost_price`, `sale_price`, `line_type` (manual/product/calculation/section), `section` |

### Faktura — ind og ud

| Tabel | Rows | Sag-kobling |
|---|---|---|
| `invoices` | 0 | `work_order_id` UNIQUE (mig 00087) — IKKE `case_id` |
| `invoice_lines` | 0 | parent invoice |
| `incoming_invoices` | 0 | `matched_work_order_id` FK (mig 00094) — IKKE `matched_case_id` |
| `incoming_invoice_lines` | 0 | har `supplier_product_id` (god) |
| `incoming_invoice_audit_log` | 0 | append-only |

### Profit / økonomi

| Tabel | Rows | Sag-kobling |
|---|---|---|
| `work_order_profit` | 0 | `work_order_id` (mig 00088) — IKKE pr. sag |

### Ikke-eksisterende men forventet

| Tabel | Status | Hvor refereret |
|---|---|---|
| `case_materials` | **❌ MISSING** | Build-plan §1.7, §3 tab "Materialer", §5 Sprint 5 acceptance |
| `case_other_costs` | **❌ MISSING** | Build-plan §1.11, §3 tab "Øvrige omkostninger", §5 Sprint 5 |
| `case_expenses` | **❌ MISSING** | Alternativ navngivning |

---

## Eksisterende data

Live-tal pr. 2026-05-04 (probe via REST count=exact, service role):

```
product_catalog                    0      (legacy, kill kandidat)
materials                          11     (seedede el/solcelle slugs)
supplier_products                  282.935 (AO + LM mirror)
suppliers                          2      (AO + LM)
customers                          8
service_cases                      4      (canonical sag)
work_orders                        2      (planlægning under sag)
time_logs                          1
employees                          1
offers                             10
offer_line_items                   8      (har supplier_cost_price_at_creation)
work_order_profit                  0      (ingen snapshot endnu)
invoices                           0
invoice_lines                      0
incoming_invoices                  0
incoming_invoice_lines             0
case_materials                     MISSING
case_other_costs                   MISSING
case_expenses                      MISSING
```

**Konklusion:** Phase 7/8/15 er **0-row** stack. Materialemodellen for sag findes hverken som tabel eller som data.

---

## Eksisterende UI

### `/dashboard/orders/[id]` tabs (kilde: `order-detail-client.tsx`)

| Tab | Status | Reel data? |
|---|---|---|
| Overblik | ✅ ready | Real — viser sag.* fra service_cases |
| Planlægning / Timer | ✅ ready | Real — Sprint 4C/4D giver work_orders + time_logs CRUD og DB-beregning |
| **Materialer** | ❌ **placeholder** | "Sprint 5: Materialer fra kalkulationen, samt manuelle linjer og leverandørordrer, vises her med kost-/salgspriser." |
| **Øvrige omkostninger** | ❌ **placeholder** | "Sprint 5: Kørsel, underleverandører og andre omkostninger der ikke er materialer eller timer." |
| **Økonomi** | ❌ **placeholder** | "Sprint 8: DB-beregning, profit-snapshots, tilbudt vs. revideret vs. faktisk forbrug." |
| Aktivitet | ✅ ready | Real |
| Dokumentation | ❌ placeholder | "Sprint 9" |
| Fakturakladde | ❌ placeholder | "Sprint 8" |
| Handlinger | ✅ ready | Real |

### Andre relevante sider

- `/dashboard/products` — UI mod `product_catalog` (0 rows). **Forvirrende:** ligner et produktkatalog men ingen bruger det.
- `/dashboard/settings/suppliers/[id]/products` — paginated browser over de 282k supplier_products
- `/dashboard/settings/materials` — admin for materials-katalog (11 items)
- `/dashboard/incoming-invoices` + `/dashboard/incoming-invoices/[id]` — fuld review-queue UI med match_breakdown, audit log, approve/reject/reparse flow. Detail-viewet viser **`workOrder` link** (matched_work_order_id) — ikke en sag.
- Ingen "Materialer på sag"-side eksisterer som standalone route.

---

## Gap-analyse

Ordnet efter, hvad der skal lukkes for at få ærlig økonomi på `/dashboard/orders/[id]`:

| # | Gap | Hvor | Konsekvens hvis ikke lukket |
|---|---|---|---|
| 1 | Ingen `case_materials`-tabel | DB | Kan ikke booke en vare på en sag. Materialekost findes kun "som tilbudt" — ikke "som forbrugt". |
| 2 | Ingen `case_other_costs`-tabel | DB | Kørsel/leje/underleverandør lever som friktekst i `case_notes` eller slet ikke. |
| 3 | `incoming_invoices.matched_work_order_id` peger på work_orders, ikke service_cases | DB + matcher (`src/lib/services/incoming-invoices.ts:406`) | Når én sag har flere arbejdsordrer kan en leverandørfaktura kun bindes til ét planlægningsslot. Skal kunne lande på sagen. |
| 4 | Ingen wire fra approved supplier invoice → `case_materials` | actions | Selv hvis tabellen findes, skal `approveIncomingInvoiceAction` indsætte linjer i `case_materials` baseret på `incoming_invoice_lines.supplier_product_id` + `matched_case_id`. |
| 5 | `work_order_profit` snapshotter pr. WO, ikke pr. sag | RPC `calculate_work_order_profit` | Sag med 5 WO'er får 5 snapshots — ingen rollup. |
| 6 | `calculate_work_order_profit` læser materialekost fra **tilbuddets** linjer | RPC mig 00088 linje 126-134 | Forbruget på sagen ignoreres. Skal læse fra `case_materials` når den findes. |
| 7 | Ingen Materialer-tab UI | `/dashboard/orders/[id]` | Brugeren kan ikke føre materialer ind. |
| 8 | Ingen Øvrige-tab UI | `/dashboard/orders/[id]` | Samme. |
| 9 | Ingen Økonomi-tab UI | `/dashboard/orders/[id]` | Selv hvis data er korrekt, vises det ikke. |
| 10 | Customer-specific pricing wire (`customer_supplier_prices`, `customer_product_prices`) er ikke koblet til prissnapshot | actions | Kunde med rabataftale får ikke automatisk lavere pris ved booking — manuel override nødvendig. (0 rows i begge tabeller pt.) |

---

## Anbefalet datamodel

### Princip

1. **Sag er centrum** (build-plan rule #1). `case_materials` og `case_other_costs` skal pege på `service_cases.id`, ikke på `work_orders.id`.
2. **Snapshot-pris ved booking.** Kost- og salgspris skal kopieres ind på linjen ved booking — så senere prisændringer i `supplier_products` ikke retroaktivt ændrer sagens DB.
3. **Provenance.** Hver linje skal kunne pege tilbage på sin oprindelse (manuel / fra leverandørfaktura / fra tilbud).
4. **Faktureringskobling.** Hver linje har `invoice_line_id NULL` indtil den faktureres. Idemmotent rollup.

### Foreslåede tabeller (DDL kun som forslag — ingen migration kører nu)

```sql
-- ============================================================
-- case_materials  (Sprint 5B)
-- ============================================================
CREATE TABLE case_materials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  -- Optional links — én af de tre udfyldes typisk:
  work_order_id            UUID REFERENCES work_orders(id) ON DELETE SET NULL,    -- valgfri: hvilken WO blev varen brugt på
  supplier_product_id      UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  material_id              UUID REFERENCES materials(id) ON DELETE SET NULL,

  -- Beskrivelse (snapshot — så ændring i katalog ikke ændrer historik)
  description              TEXT NOT NULL,
  sku_snapshot             TEXT,
  supplier_name_snapshot   TEXT,
  unit                     TEXT NOT NULL DEFAULT 'stk',
  quantity                 NUMERIC(12,3) NOT NULL CHECK (quantity > 0),

  -- Pris-snapshot ved booking
  unit_cost                NUMERIC(12,2) NOT NULL DEFAULT 0,    -- vores kost
  unit_sale_price          NUMERIC(12,2) NOT NULL DEFAULT 0,    -- til kunde
  total_cost               NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  total_sale               NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_sale_price) STORED,

  -- Provenance
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual','offer','supplier_invoice','calculator')),
  source_offer_line_id     UUID REFERENCES offer_line_items(id) ON DELETE SET NULL,
  source_incoming_invoice_line_id UUID REFERENCES incoming_invoice_lines(id) ON DELETE SET NULL,

  -- Faktureringskobling
  billable                 BOOLEAN NOT NULL DEFAULT true,
  invoice_line_id          UUID REFERENCES invoice_lines(id) ON DELETE SET NULL,

  notes                    TEXT,
  created_by               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_materials_case        ON case_materials(case_id);
CREATE INDEX idx_case_materials_work_order  ON case_materials(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_case_materials_supplier_pr ON case_materials(supplier_product_id);
CREATE INDEX idx_case_materials_unbilled    ON case_materials(case_id)
  WHERE billable = true AND invoice_line_id IS NULL;
```

```sql
-- ============================================================
-- case_other_costs  (Sprint 5C)
-- ============================================================
CREATE TABLE case_other_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  work_order_id   UUID REFERENCES work_orders(id) ON DELETE SET NULL,

  cost_type       TEXT NOT NULL CHECK (cost_type IN (
                    'mileage',         -- kørsel
                    'subcontractor',   -- underleverandør
                    'rental',          -- leje af stillads/lift/værktøj
                    'travel',          -- bro/færge/parkering
                    'meal',            -- diæt
                    'bonus',           -- bonus til medarbejder
                    'other'
                  )),
  description     TEXT NOT NULL,
  cost_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  unit            TEXT,                 -- 'km' / 'time' / 'stk' / NULL
  quantity        NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_sale_price NUMERIC(12,2),         -- valgfri — viderefakturering
  total_cost      NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  total_sale      NUMERIC(14,2) GENERATED ALWAYS AS (
                    quantity * COALESCE(unit_sale_price, unit_cost)
                  ) STORED,

  -- Vedhæftning (kvittering)
  receipt_url     TEXT,
  receipt_filename TEXT,

  -- Faktureringskobling
  billable        BOOLEAN NOT NULL DEFAULT false,
  invoice_line_id UUID REFERENCES invoice_lines(id) ON DELETE SET NULL,

  -- Provenance
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual','time_log','supplier_invoice','recurring')),
  source_time_log_id       UUID REFERENCES time_logs(id) ON DELETE SET NULL,
  source_incoming_invoice_id UUID REFERENCES incoming_invoices(id) ON DELETE SET NULL,

  notes           TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_other_costs_case ON case_other_costs(case_id);
CREATE INDEX idx_case_other_costs_unbilled ON case_other_costs(case_id)
  WHERE billable = true AND invoice_line_id IS NULL;
```

### Ændringer på eksisterende tabeller (additive)

```sql
-- Sprint 5E: incoming_invoices skal kunne pege på sag, ikke kun WO
ALTER TABLE incoming_invoices
  ADD COLUMN matched_case_id UUID REFERENCES service_cases(id) ON DELETE SET NULL;
CREATE INDEX idx_incoming_invoices_case ON incoming_invoices(matched_case_id) WHERE matched_case_id IS NOT NULL;
-- matched_work_order_id BEHOLDES (backward-compat). Matcher fyldes med BÅDE
-- case_id (via work_order.case_id) og work_order_id, så Phase 15 fortsat
-- virker mens vi løfter gradvist.

-- Sprint 5D: profit pr. sag (additivt — work_order_profit beholdes)
CREATE TABLE service_case_profit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  revenue            NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  material_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit             NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_percentage  NUMERIC(6,2)  NOT NULL DEFAULT 0,
  source             TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual','invoice_created','case_done','recompute')),
  details            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_service_case_profit_case ON service_case_profit(case_id, created_at DESC);

-- Ny RPC: calculate_service_case_profit(case_id) — summerer på TVÆRS af WO'er
-- på sagen. Læser:
--   labor_cost = sum(time_logs.cost_amount WHERE work_order.case_id = $1)
--   material_cost = sum(case_materials.total_cost WHERE case_id = $1)
--   other_cost   = sum(case_other_costs.total_cost WHERE case_id = $1)
--   revenue      = sum(invoice_lines.line_total WHERE invoice.work_order.case_id = $1)
```

### Hvorfor IKKE bare bruge offer_line_items eller calculator_rows som materialeforbrug?

- `offer_line_items` repræsenterer **hvad der blev tilbudt** (snapshot på tilbudstidspunktet). Et tilbud er en "før"-tilstand. Materialer på sag er en "efter"-tilstand. De er forskellige business-objekter.
- Hvis vi genbruger `offer_line_items.invoice_line_id` til "billed" må vi miste muligheden for at booke et ekstra ekstra produkt på sagen som ikke var i tilbuddet.
- Phase 8's nuværende RPC læser `offer_line_items` for materialekost — det er **fake forbrug** og skal opdateres til at læse `case_materials` når den findes (med fallback til offer for sager der endnu ikke har bookings).

---

## Anbefalet Sprint 5-plan

### Sprint 5B — Materialer på sag (3-4 dage)

**Levér:**
1. Migration: `case_materials` tabel + RLS + indexes (model som ovenfor)
2. Server actions:
   - `bookMaterialOnCase(case_id, supplier_product_id | material_id | manual, quantity, unit_cost, unit_sale_price, work_order_id?, notes?)`
   - `updateCaseMaterial(id, patch)` — kun mens `invoice_line_id IS NULL`
   - `removeCaseMaterial(id)` — kun mens `invoice_line_id IS NULL`
   - `listCaseMaterials(case_id)` — beriget med supplier_name + sku
   - `searchSupplierProductsForBooking(query, customer_id?)` — genbruger eksisterende live-API + customer pricing hvis sat
3. UI på `/dashboard/orders/[id]` Materialer-tab:
   - Tabel: dato · vare · sku · leverandør · antal · enhed · kostpris · salgspris · DB · faktureret? · provenance
   - Knap "Tilføj vare" → dialog med søgning (lokal materials + leverandør live)
   - Knap "Tilføj manuel" → fritekst-linje
   - Sum-række: total kost, total salg, DB %
   - Filter: kun ufaktureret / kun fra leverandørfaktura / alle
4. Type-check + build clean
5. Browser-test: book 1 vare manuelt + 1 fra supplier_products + 1 manuel → ses i tabel

**Ikke i scope:** Customer-pricing wire (defer til 5B+1 hvis tid). Drag-drop fra leverandørprisliste.

**Acceptkriterier:**
- Kan booke en vare på en sag med kost + salg snapshot
- Tabel viser bookings i rigtig rækkefølge med korrekt sum
- Sletning blokeres hvis fakturalinje sat
- Sag-detalje overlever browser-refresh + reload

### Sprint 5C — Øvrige omkostninger (2-3 dage)

**Levér:**
1. Migration: `case_other_costs` tabel + RLS + indexes
2. Server actions: `addCaseOtherCost`, `updateCaseOtherCost`, `removeCaseOtherCost`, `listCaseOtherCosts(case_id)`
3. UI på `/dashboard/orders/[id]` Øvrige-tab:
   - Tabel: dato · type · beskrivelse · antal · enhed · kost · viderefaktureres? · faktureret? · kvittering
   - Knap "Tilføj omkostning" → dialog med type-dropdown (kørsel/leje/under/...), beløb, beskrivelse
   - Kvittering-upload (genbrug eksisterende file-upload)
   - Sum: total kost, viderefakturerbar kost
4. Type-check + build clean

**Acceptkriterier:**
- Kan tilføje 6 typer af omkostninger
- Sum-rækken er rigtig
- Viderefakturerbar-flag respekteres senere af fakturakladde-tab

### Sprint 5D — Økonomi-tab på sag (2-3 dage)

**Levér:**
1. Migration: `service_case_profit` tabel + RPC `calculate_service_case_profit(case_id)` + `snapshot_service_case_profit(case_id, source)` + trigger på service_cases status='closed'
2. Server action: `getServiceCaseProfit(case_id)` (live calc) + `getProfitHistory(case_id)`
3. UI på `/dashboard/orders/[id]` Økonomi-tab:
   - **Indtægt:** Tilbud (`contract_sum`) · Revideret (`revised_sum`) · Faktureret pr. faktura · Total faktureret · **Resterende at fakturere**
   - **Omkostning:** Timer (cost) · Materialer (cost) · Øvrige (cost) · Sum
   - **DB / Dækningsgrad / Margin %** med farvet status (grøn >25%, gul 10-25%, rød <10%)
   - Drill-down: klik "Materialer" → fokus på Materialer-tab; klik "Timer" → fokus på Planlægning/Timer
   - Profit-historik (snapshots over tid) som lille graf eller tabel
4. Type-check + build clean

**Acceptkriterier:**
- Tallene matcher hvad der er booget i Materialer/Øvrige/Timer
- DB% er rigtigt regnet (tjek mod manuel beregning på papir for én sag)
- Drill-down virker
- Snapshot-trigger fyrer ved status='closed'

### Sprint 5E — Kobling til leverandørfaktura (3-4 dage, afhænger af 5B)

**Levér:**
1. Migration: `incoming_invoices.matched_case_id` (additivt — `matched_work_order_id` beholdes som fallback)
2. Matcher-opgradering (`src/lib/services/incoming-invoices.ts`):
   - Når WO matches: udfyld `matched_case_id = work_order.case_id`
   - Tillad case-direct match (uden WO) baseret på case_number i invoice_text
3. `approveIncomingInvoiceAction` opgraderes:
   - For hver `incoming_invoice_line` med `supplier_product_id` + `matched_case_id`:
     - INSERT en `case_materials`-linje med `source='supplier_invoice'`, `source_incoming_invoice_line_id` sat
     - `unit_cost` = invoice_line.unit_price
     - `unit_sale_price` = `get_effective_margin()` * cost (genbruger eksisterende margin-engine)
4. UI: detail-viewet i `/dashboard/incoming-invoices/[id]` viser sag-link + preview af case_materials-linjer der vil blive oprettet ved approve
5. Type-check + build clean

**Acceptkriterier:**
- Approval af leverandørfaktura med `matched_case_id` opretter linjer i `case_materials`
- Linjer kan ses straks i sagens Materialer-tab
- Sagens Økonomi-tab opdateres automatisk
- Hvis leverandørfaktura matches forkert kan man "un-match" og linjerne fjernes igen
- Audit-log viser handlingen

### Estimat

| Sprint | Dage | Risiko |
|---|---|---|
| 5B Materialer på sag | 3-4 | Lav — grøn mark |
| 5C Øvrige omkostninger | 2-3 | Lav |
| 5D Økonomi-tab | 2-3 | Mellem — RPC-arbejde |
| 5E Leverandørfaktura → sag | 3-4 | Mellem — rør i Phase 15.2 matcher |
| **Total** | **10-14 dage** | |

---

## Acceptkriterier (Sprint 5 samlet)

Sprint 5 er færdig når **alt** af følgende er sandt på `/dashboard/orders/[case_number]`:

1. **Materialer-tab er real** — operatør kan booke en vare (manuel, fra `materials`-katalog, eller fra `supplier_products` live), den vises straks med kost + salg + DB
2. **Øvrige-tab er real** — operatør kan tilføje kørsel/leje/under/etc. med beløb + beskrivelse + kvittering
3. **Økonomi-tab viser ærlige tal:**
   - Tilbudt vs. revideret vs. faktureret beløb
   - Timekost (fra time_logs) + materialekost (fra case_materials) + øvrigt (fra case_other_costs)
   - DB % og DB beløb
   - Resterende at fakturere
4. **Leverandørfaktura → sag virker end-to-end:**
   - Leverandørfaktura kan matches mod sag direkte (ikke kun WO)
   - Approve indsætter automatisk linjer i `case_materials`
   - Sagens økonomi opdateres med det samme
5. **Ingen dobbelt bogføring:**
   - En vare optræder enten i `case_materials` ELLER i tilbuddets `offer_line_items` (men ikke begge samtidig som omkostning) — `calculate_service_case_profit` skal vide hvilket grundlag at bruge
   - En leverandørfaktura-linje kan ikke matches til to sager
6. **Type-check + build clean**
7. **Vercel deployment Ready**
8. **Browser-test passerer for én ægte sag** med 3+ materialer + 2+ øvrige + 1 leverandørfaktura match

---

## Risici

| Risiko | Sandsynlighed | Mitigering |
|---|---|---|
| **Dobbelt bogføring**: materiale optræder både på offer_line_items (Phase 8 RPC) og case_materials (ny) | Høj | Phase 8 RPC opgraderes i Sprint 5D til at læse case_materials FØRST, og kun fall-back til offer_line_items hvis sagen har 0 case_materials |
| **Leverandørfaktura matches forkert sag** og auto-indsætter case_materials | Mellem | Approve kræver eksplicit operatør-handling, ikke auto. Plus en preview-skærm der viser præcis hvad der oprettes. Plus rollback ("un-match" → DELETE case_materials WHERE source_incoming_invoice_line_id matches) |
| **Materialepris ændrer sig efter booking** (supplier_products opdateres af nightly cron) | Mellem | Pris-snapshot på case_materials.unit_cost — ingen ON UPDATE CASCADE. Snapshot er tilstand-på-tidspunkt. |
| **work_order × sag konflikt:** materiale booges på WO men WO slettes | Lav | case_materials.work_order_id ON DELETE SET NULL (ikke CASCADE — sagens linje overlever) |
| **invoice_lines slet linje** mens case_materials peger på den | Mellem | invoice_line_id ON DELETE SET NULL — linjen reverterer til ufaktureret status, ikke slet |
| **time_entries (legacy) bruges ved fejl** | Lav | Henrik's regel siger "må ikke røres" — Sprint 5 rører den ikke. Profit-RPC læser kun fra time_logs. |
| **Customer-specific pricing** (`customer_*_prices`) eksisterer men er ikke wired i offer-flow | Mellem | Defer til Sprint 5B+1 polish. Manuel override i UI er fallback. |
| **GENERATED ALWAYS AS** ekspressioner kan ikke bruges i ALL Postgres-versioner — Supabase er v15+, OK |  Lav | Verificér Supabase Postgres-version før migration. Hvis problem, brug trigger i stedet |
| **Phase 7/8 work_order_profit beholdes** parallelt — to profit-tabeller | Lav | Behold work_order_profit som per-WO snapshot (kan stadig være nyttigt). service_case_profit er rollup. Dokumenter forskellen. |

---

## Anbefalet næste skridt

Hvis Henrik godkender denne analyse:

**Næste action: Sprint 5B commit 1** — migration for `case_materials` tabel. Jeg viser dig SQL'en før jeg kører den, per CLAUDE.md regel "ALDRIG opret tabeller uden at vise mig SQL'en først".

Hvis du vil ændre rækkefølge (f.eks. tage 5C før 5B, eller hoppe direkte til 5D for at se økonomi-tab tom først) — sig til **før** Sprint 5B starter, da migration 5E afhænger af 5B's tabel.

---

## Hvad denne analyse bevidst IKKE har gjort

- Ingen kodeændringer
- Ingen DB-ændringer
- Ingen migrations udført
- Ingen refactor af eksisterende moduler
- Ingen antagelser om felter der ikke er verificeret i schema
- Ingen estimering af UI-design (kommer i Sprint 5B planlægning)

Repo er på `9af24ff` på `main`, working tree clean (kun denne fil + scripts/sprint5a-rowcount-probe.mjs er nye). Intet er ændret under analysen.

---

## Appendix: tabel-rækkefølge ved migration (når Sprint 5 starter)

For at undgå FK-fejl skal migration-rækkefølgen være:

```
00100_case_materials.sql                        (Sprint 5B)
00101_case_other_costs.sql                      (Sprint 5C)
00102_service_case_profit.sql                   (Sprint 5D)
00103_incoming_invoices_matched_case_id.sql     (Sprint 5E)
00104_calculate_service_case_profit_rpc.sql     (Sprint 5D — efter case_materials + case_other_costs)
```

Alle additive — ingen DROP, ingen rename, ingen destructive ALTER.
