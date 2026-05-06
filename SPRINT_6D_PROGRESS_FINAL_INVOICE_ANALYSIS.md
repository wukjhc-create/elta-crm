# Sprint 6D — Forskud / Rate / Slutfaktura Analyse

**Snapshot:** 2026-05-05
**HEAD:** `e1cb863` (Sprint 6C komplet — PDF + mail-send live)
**Audit basis:** filsystem + læsning af mig 00080–00104 + Sprint 6B/6C kode + live schema/rowcount via Supabase Management API.
**Scope:** Kun analyse + plan. Ingen kode-/DB-ændringer.

---

## Executive summary

Sprint 6B-2's `createInvoiceDraftFromCase` virker pt. som **én fuld faktura per sag**. Operatør vælger ufakturerede timer/materialer/øvrige, fakturen genereres, og kilderækkernes `invoice_line_id` låses. **Det er korrekt for små "én-skuds" sager**, men det kan ikke håndtere det reelle Elta-flow:

- **Forskudsfaktura** (fx 30 % af kontraktsum) skal kunne sendes **før** der er booet timer/materialer — der er ikke noget at låse endnu.
- **Ratefakturaer / a conto** skal kunne sendes flere gange undervejs uden at trække alle ufakturerede linjer ind hver gang.
- **Slutfakturaen** skal kunne **fratrække** de allerede sendte forskud/rater så kunden ikke betaler dobbelt.

**Schema-state: ingen af de nødvendige felter findes.** `invoices` har 25 kolonner, men ingen `stage`, `parent_invoice_id`, `invoice_type`, `billing_percentage`, `is_final_invoice`, `amount_basis`, `predecessor_invoice_ids`. Migration er nødvendig for at understøtte multi-stage.

**Risiko hvis vi springer over:** Operatøren vil prøve at lave forskud manuelt via "fritekst-linjer" eller dobbelt-fakturere fordi der ikke er audit-trail mellem rater og slutfaktura. e-conomic vil se to fakturaer på samme arbejde uden relation.

**Anbefaling:** Sprint 6D leverer et hybridt system der understøtter:
- A) **Procent-baserede rater** mod `contract_sum`/`revised_sum` (forskud + a conto)
- B) **Faktisk-forbrug-baseret** (Sprint 6B's nuværende flow — bevares som default)
- C) **Slutfaktura** der eksplicit fratrækker tidligere fakturaer på samme sag

5-6 commits, ~5-7 dage.

---

## 1. Eksisterende fakturamodul (verificeret 2026-05-05)

### Schema (`invoices` — 25 kolonner)

```
id, invoice_number, customer_id, offer_id, status, total_amount,
tax_amount, final_amount, currency, due_date, sent_at, paid_at,
pdf_url, notes, created_at, updated_at, payment_reference,
reminder_count, last_reminder_at, payment_status, amount_paid,
external_invoice_id, external_provider, work_order_id, case_id
```

**Probe for multi-stage felter:** Ingen.
- ❌ `stage`
- ❌ `invoice_type`
- ❌ `parent_invoice_id`
- ❌ `billing_percentage` / `percentage_of_contract`
- ❌ `is_final_invoice`
- ❌ `amount_basis`
- ❌ `predecessor_invoice_ids` (array af tidligere fakturaer der fratrækkes)

(Probe-resultatet viste kun `final_amount` — false positive, det er totalbeløbet inkl. moms, ikke et stage-felt.)

### Schema (`invoice_lines` — 12 kolonner)

```
id, invoice_id, position, description, quantity, unit, unit_price,
total_price, created_at,
source_time_log_id, source_case_material_id, source_case_other_cost_id  (mig 00104)
```

UNIQUE PARTIAL indexes på `source_*_id` (mig 00104) → DB nægter dobbelt-fakturering af samme kilderække.

### Schema (`service_cases` økonomi-felter — fra Sprint 2/4D)

```
contract_sum    — tilbudt beløb
revised_sum     — revideret beløb (efter ændringsbestillinger)
budget          — internt budget
```

Ingen `total_invoiced` rollup — den må beregnes løbende fra `invoices.total_amount WHERE case_id = $1`.

### Service-flows der virker

- `createInvoiceDraftFromCase` (Sprint 6B-2) — ufakturerede source-rows → én faktura
- `createInvoiceFromOffer` RPC (Phase 5) — én offer → én faktura, idempotent via UNIQUE(offer_id)
- `createInvoiceFromWorkOrder` RPC (Phase 7.1) — én WO → én faktura, idempotent via UNIQUE(work_order_id)
- `setInvoiceStatus` lifecycle: `draft → sent → paid` (no reverse, no skip)
- `sendInvoiceEmail` med PDF-attachment (Sprint 6C)
- `deleteInvoiceDraft` — frigør source-locks

### Row counts (live)

- `invoices` = 1 (Henriks 6C-test)
- `invoice_lines` = 1
- `service_cases` = 4
- `case_materials` = 2 (testdata)
- `case_other_costs` = 4 (testdata)

---

## 2. Problem — hvorfor nuværende 6B-flow kun virker som fuld faktura

### Antagelser i `createInvoiceDraftFromCase`

1. **Selection er en liste af konkrete kilderækker.** Operatør vælger fx 5 timelogs + 3 materialer → de 8 rækker bliver til 8 fakturalinjer.
2. **Hver kilderække faktureres præcis 0 eller 1 gange.** UNIQUE-indexet på `source_*_id` håndhæver det.
3. **Faktureret = låst.** Når en timelog har `invoice_line_id` sat, kan den ikke vælges igen (filtreret ud i `listUnbilledForCase`).

### Hvad bryder for forskud / rate / slut

| Scenarie | Hvorfor 6B fejler |
|---|---|
| **Forskudsfaktura før første timer** | 0 ufakturerede source-rows → "Ingen ufakturerede elementer på sagen" tom-state. Faktura kan ikke oprettes overhovedet. |
| **30 % a conto efter halv montage** | Der ER nu source-rows, men forskuddet er en **procent af kontraktsum**, ikke en delmængde af forbrug. Operatør har ingen måde at sige "fakturér 30 % af 89.000 kr ekskl. moms". |
| **Ny rate efter forrige a conto** | Nuværende model låser ALLE valgte source-rows. Anden rate kan ikke pege på samme procent-andel — der er intet "rest at fakturere" felt. |
| **Slutfaktura med fradrag** | Slutfakturaen skal vise: faktisk forbrug minus tidligere a conto-betalinger. Der findes ingen måde at trække forrige fakturaer fra — hver invoice står isoleret. |
| **Audit / dansk lov** | Faktura skal kunne henvises til af kunden ("rate 2 af 3"). Uden `stage` / `parent_invoice_id` kan vi ikke skrive "Rate 2 — i alt 3 rater" på PDF'en. |
| **e-conomic** | Når Sprint 6E lander, skal e-conomic se "denne faktura er en a conto, der korrigerer en forskudsfaktura". Uden parent-link bliver det manuelt arbejde i e-conomic. |

### Konkret eksempel

Solcelleanlæg 6 kWp, kontraktsum 89.000 kr. Operatøren vil:
1. **Forskud 30 %** = 26.700 kr ekskl. moms
2. **Rate 50 %** ved opstart = 44.500 kr ekskl. moms
3. **Slut 20 %** = 17.800 kr ekskl. moms (eller justeret efter faktisk forbrug)

Sum: 89.000 kr ekskl. moms (= kontraktsum). Sprint 6B kan kun lave **én** faktura mod sagen, ikke tre — og slet ikke procent-baseret.

---

## 3. Anbefalet datamodel (additivt)

### Migration 00105: `invoices` multi-stage felter

```sql
-- All additive. No DROP. No data change. Idempotent.

ALTER TABLE invoices
  -- What kind of invoice is this?
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (invoice_type IN (
      'standard',   -- Sprint 6B's flow — én faktura, alle valgte source-rows
      'deposit',    -- forskud (a conto før forbrug)
      'progress',   -- ratefaktura (a conto under forbrug)
      'final',      -- slutfaktura (med fradrag af tidligere)
      'credit'      -- kreditnota — reserveret, ikke implementeret i 6D
    )),

  -- Ratefakturering mod kontraktsum:
  -- Hvis udfyldt = procent (0.0–100.0) af amount_basis_value.
  -- Hvis NULL = beløbet kommer fra invoice_lines (Sprint 6B-flow).
  ADD COLUMN IF NOT EXISTS billing_percentage NUMERIC(5,2)
    CHECK (billing_percentage IS NULL OR (billing_percentage > 0 AND billing_percentage <= 100)),

  -- Hvilket grundlag procenten beregnes af.
  -- 'contract_sum'  → service_cases.contract_sum
  -- 'revised_sum'   → service_cases.revised_sum (default når sat)
  -- 'lines'         → sum af invoice_lines (intet procent-spil)
  ADD COLUMN IF NOT EXISTS amount_basis TEXT NOT NULL DEFAULT 'lines'
    CHECK (amount_basis IN ('contract_sum', 'revised_sum', 'lines')),

  -- Snapshot af basis-beløbet på faktura-tidspunkt (frosset).
  -- Selv hvis service_cases.contract_sum ændrer sig senere, kan vi
  -- regenerere PDF'en med samme tal.
  ADD COLUMN IF NOT EXISTS amount_basis_value NUMERIC(12,2),

  -- Synlig label på PDF: "Forskud", "Rate 2 af 3", "Slutfaktura", etc.
  ADD COLUMN IF NOT EXISTS stage_label TEXT,

  -- Slutfaktura-flag — gør UNIQUE-constraint mulig (én final pr. sag).
  ADD COLUMN IF NOT EXISTS is_final_invoice BOOLEAN NOT NULL DEFAULT false;

-- Forhindrer at en sag får mere end én slutfaktura.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_one_final_per_case
  ON invoices(case_id)
  WHERE is_final_invoice = true AND case_id IS NOT NULL;

-- Lookup: alle ikke-slutfakturaer på en sag (forskud + rater) —
-- bruges af slutfaktura-beregning + Økonomi-tab.
CREATE INDEX IF NOT EXISTS idx_invoices_case_stage
  ON invoices(case_id, invoice_type)
  WHERE case_id IS NOT NULL;
```

### Migration 00106: `invoice_predecessors` (junction)

```sql
-- A final invoice can deduct multiple previous (deposit/progress)
-- invoices on the same sag. M:N → junction table.
--
-- Why a junction (not a single parent_invoice_id)?
-- - Slutfaktura kan henvise til 2 forskud + 3 rater = 5 forgængere.
-- - Operatør skal kunne se hver fratrukket faktura som egen linje
--   på slutfakturaens PDF.
-- - parent_invoice_id (single FK) ville have begrænset os til kæder.

CREATE TABLE IF NOT EXISTS invoice_predecessors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /* The "child" — the final invoice that deducts the predecessor. */
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  /* The "parent" — a deposit/progress invoice on the same sag. */
  predecessor_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  /* Snapshot of the predecessor's total_amount at creation time. */
  deduction_amount NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_predecessors_invoice
  ON invoice_predecessors(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_predecessors_predecessor
  ON invoice_predecessors(predecessor_invoice_id);

-- Idempotency: a single predecessor cannot be deducted twice from
-- the same final invoice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_predecessors
  ON invoice_predecessors(invoice_id, predecessor_invoice_id);

-- ON DELETE RESTRICT på predecessor: kan ikke slette en faktura der
-- er fratrukket på en slutfaktura. Beskytter audit-trail.
```

### Hvad migrationen IKKE gør

- ❌ Ingen ændring af eksisterende kolonner
- ❌ Ingen DROP, ingen rename, ingen NOT NULL på eksisterende rows
- ❌ Ingen ændring af `invoice_lines`-tabellen (provenance er på linje-niveau, multi-stage er på faktura-niveau)
- ❌ Ingen ændring af `setInvoiceStatus` lifecycle (draft → sent → paid bevares)
- ❌ Ingen ændring af `case_materials` / `case_other_costs` / `time_logs`

---

## 4. Dobbelt-faktureringsbeskyttelse

Tre lag, ordnet efter prioritet:

### Lag 1 — DB-niveau

| Constraint | Hvad den fanger |
|---|---|
| `invoice_lines.source_*_id UNIQUE PARTIAL` (mig 00104) | Same time_log/material/cost kan ikke faktureres to gange via 6B-flow |
| `uq_invoices_one_final_per_case` | Højst én slutfaktura pr. sag |
| `uq_invoice_predecessors` | En forgænger kan kun fratrækkes én gang pr. slutfaktura |
| `invoice_predecessors.predecessor_invoice_id` ON DELETE RESTRICT | Kan ikke slette en forskudsfaktura der allerede er brugt som forgænger |

### Lag 2 — Service-niveau (`createInvoiceFromCase` udvidet)

Per `invoice_type`:

#### `'deposit'` (forskud) — procent-baseret
- **Ingen kobling til source-rows.** Ingen `time_log_ids` / `case_material_ids` / `case_other_cost_ids` accepteres.
- Beløb beregnes som `amount_basis_value × billing_percentage / 100`.
- Linje på fakturaen er fritekst: "Forskud 30 % af kontraktsum".
- **Beskyttelse mod dobbelt forskud:** service summer alle eksisterende `invoice_type='deposit'` på sagen og advarer hvis sum > 50 % af basis (UI-warning, ikke DB-konstraint — kunne lov-mæssigt være OK med flere små forskud).

#### `'progress'` (rate) — procent ELLER faktisk forbrug
- **Mode A (procent):** samme som deposit, men typisk `amount_basis='contract_sum'`. Beløb = procent × basis.
- **Mode B (faktisk forbrug):** kobler til source-rows (Sprint 6B-flow) men resulterende faktura får `invoice_type='progress'` så slutfakturaen kan trække den fra. UNIQUE-indexet på `source_*_id` forhindrer dobbelt-fakturering på linje-niveau.

#### `'final'` (slut) — faktisk forbrug minus forgængere
- Kobler til **alle resterende ufakturerede source-rows** (Sprint 6B-flow).
- Service henter alle tidligere `invoice_type IN ('deposit','progress')` på sagen som **forgængere**.
- Hver forgænger registreres i `invoice_predecessors` med `deduction_amount = forgænger.total_amount`.
- PDF viser:
  - Linjer fra source-rows (subtotal)
  - **Linje-blok:** "Fratrukket: Forskud F-2026-0001 (-26.700 kr), Rate F-2026-0002 (-44.500 kr)"
  - Final due = subtotal − sum(deductions) + moms
- `is_final_invoice = true` → DB nægter en anden slutfaktura.

### Lag 3 — UX-niveau

- Ny wizard på `/dashboard/orders/[id]` Fakturakladde-tab: Operatør **vælger først** invoice_type (Standard / Forskud / Rate / Slut).
- Procent-modes: viser allerede fakturerede procent og advarer ved >100 % total.
- Slut-mode: viser tabel over forgængere der fratrækkes, læs-only (alle non-paid forgængere medtages automatisk).
- Operatør kan ikke vælge `is_final_invoice=true` hvis sagen allerede har en (UI gate + server gate + DB unique).

---

## 5. Anbefalet UX

### Wizard-flow på `/dashboard/orders/[id]` Fakturakladde-tab

```
[Step 1: Vælg fakturatype]
( ) Standard — alle ufakturerede timer/materialer/øvrige (Sprint 6B-flow)
( ) Forskud — procent af kontraktsum
( ) Rate / a conto — procent af kontraktsum ELLER faktisk forbrug
( ) Slutfaktura — faktisk forbrug minus tidligere rater

  [hvis Forskud/Rate procent]:
   Procent: [30] %  af  ( ) Kontraktsum 89.000 kr  ( ) Revideret 92.000 kr
   Beløb beregnet: 26.700 kr ekskl. moms
   Allerede faktureret som forskud/rate: 0 kr (0 %) — OK

  [hvis Rate-faktisk-forbrug]:
   Samme tabel som Sprint 6B med checkboxes

  [hvis Slut]:
   Resterende source-rows (samme som 6B):
   - Timer: 12 t (15.600 kr)
   - Materialer: 12.450 kr
   - Øvrige: 1.200 kr
   Subtotal: 29.250 kr ekskl. moms

   Forgængere der fratrækkes (read-only):
   - F-2026-0001 Forskud 30 %     -26.700 kr
   - F-2026-0002 Rate 50 %        -44.500 kr
   Total fradrag: -71.200 kr

   ⚠ Slutbeløb: -41.950 kr (kreditnota — over-faktureret 41.950 kr)

[Step 2: Detaljer]
   Stage label: "Forskud" / "Rate 2 af 3" / "Slutfaktura" (auto-foreslået)
   Betalingsfrist: 14 dage
   Note: ___

[Step 3: Forhåndsvis + opret]
   Total: 33.375 kr inkl. moms
   [Opret kladde]
```

### Detail-side `/dashboard/invoices/[id]`

- Header: stage_label-pille ("Forskud" / "Rate 2 af 3" / "Slutfaktura")
- Forgængere-panel hvis `is_final_invoice=true`: tabel over fratrukne fakturaer med link
- PDF: "Faktura — Slutfaktura" titel + fradrags-blok hvis relevant

### Økonomi-tab på sagen

- Allerede faktureret-rolup udvides:
  - Forskud: X kr (Y % af basis)
  - Rater: A kr (B procent / C konkrete linjer)
  - Slutfaktura: D kr (status: kladde/sendt/betalt)
  - **Resterende at fakturere = contract_sum/revised_sum − faktureret-rolup** (når slut ikke er sendt endnu)

---

## 6. Anbefalet Sprint 6D-plan

### 6D-1: Migration 00105 + 00106 (1 commit)

Vis SQL → kør efter godkendelse.

### 6D-2: Service-laget — type-aware faktura-creation (2 commits)

**Commit 1:** udvid `createInvoiceDraftFromCase` så den accepterer `invoice_type` + `billing_percentage` + `amount_basis` + `stage_label`.

**Commit 2:** ny service `createFinalInvoiceForCase(case_id)` der:
- Pulles alle `invoice_type IN ('deposit','progress')` på sagen
- Pulles ufakturerede source-rows (samme som 6B)
- INSERT'er invoice med `invoice_type='final'`, `is_final_invoice=true`
- INSERT'er linjer fra source-rows
- INSERT'er én række pr. forgænger i `invoice_predecessors`
- Beregner `total_amount = subtotal − sum(deductions)`
- Race-safe via UNIQUE(case_id, is_final_invoice)

### 6D-3: UI wizard på Fakturakladde-tab (2 commits)

**Commit 1:** type-vælger + procent-mode UI (forskud/rate-procent).
**Commit 2:** slutfaktura-mode med forgængere-tabel.

### 6D-4: Detail-side + PDF-template opdatering (2 commits)

**Commit 1:** detail-side viser stage_label + forgængere-panel.
**Commit 2:** PDF-template viser stage_label i header + fradrag-blok hvis final.

### 6D-5: Økonomi-tab opdatering (1 commit)

Udvid `getServiceCaseEconomy` med:
- `invoiced_by_stage`: { deposit, progress, final }
- `total_invoiced_excl_vat`
- `remaining_to_invoice = (revised_sum ?? contract_sum) − total_invoiced_excl_vat`

### Estimat

| Sub | Dage |
|---|---|
| 6D-1 migration | 0.5 |
| 6D-2 service | 1.5 |
| 6D-3 wizard UI | 2 |
| 6D-4 detail + PDF | 1 |
| 6D-5 økonomi-rolup | 0.5 |
| **Total 6D** | **~5.5 dage** |

---

## 7. Risici

| Risiko | Sandsynlighed | Mitigering |
|---|---|---|
| **Operatør laver dobbelt-forskud** (2× 50 % forskud) | Mellem | UI-advarsel ved sum > basis. Service tæller eksisterende deposits/progress + advarer (ikke blocking). Lov-mæssigt er flere forskud OK, men >100 % af basis er en fejl. |
| **Slutfaktura før alle forgængere er betalt** | Lav | Tilladt — kunden betaler eventuelt via netting. Audit-trail bevares via `invoice_predecessors`. |
| **Kreditnota når slutfaktura er negativ** (kunden har overbetalt) | Mellem | UI advarsel. Slutfaktura med negativ total er teknisk OK i 6D, men `invoice_type='credit'` reserveret til en eksplicit kreditnota i Sprint 6F. Indtil da: operatør får advarsel og kan vælge at sætte beløbet til 0 + lave manuel kreditnota. |
| **Moms på forskud** — dansk lov: moms skal afregnes ved faktura, ikke ved levering | Lav | 25 % moms beregnes på subtotal som hidtil. Forskud får moms straks (operatør kan trække moms-køb i samme periode). |
| **Sletning af forgænger faktura efter den er fratrukket** | Lav | `invoice_predecessors.predecessor_invoice_id ON DELETE RESTRICT` blokerer DB-niveau. `deleteInvoiceDraft` skal også tjekke `EXISTS predecessor` og nægte. |
| **Procent-ændring efter contract_sum revideres** | Mellem | `amount_basis_value` snapshottet ved oprettelse — gamle fakturaer beholder gamle tal. Operatør kan vælge `revised_sum` ved nye fakturaer. PDF viser snapshottet basis. |
| **Fakturanummer-rækkefølge** — slutfaktura må gerne have højere nummer end rater | Lav | `allocate_invoice_number` allokerer sekventielt. Slutfaktura får automatisk højeste nummer fordi den oprettes sidst. |
| **e-conomic: forskud + slutfaktura uden relation** | Høj uden mitigering | Sprint 6E skal sende `invoice_predecessors`-data som metadata til e-conomic. e-conomic understøtter "credit-to-invoice"-relation via deres API — vi mappper `invoice_predecessors` 1:1. |
| **PDF-template overload** | Mellem | Holde stage_label + fradrags-blok som **valgfrie** sektioner. Standard-faktura ser uændret ud. |
| **Backwards-compat med Sprint 6B's `createInvoiceDraftFromCase`** | Lav | Default `invoice_type='standard'` → eksisterende kode-stier får `'standard'` automatisk. Ingen ændring af signature med default-værdier — alle eksisterende kald fortsætter. |
| **`is_final_invoice=true` UNIQUE-konflikt** ved race | Lav | DB returnerer 23505. Service catcher og rapporterer "En slutfaktura findes allerede på sagen — slet den først." |

---

## 8. Acceptkriterier — Sprint 6D

Sprint 6D er færdig når **alt** af følgende er sandt:

1. **Migration 00105 + 00106 anvendt** og verificeret (additivt: 6 nye kolonner på invoices + ny `invoice_predecessors`-tabel + 4 indexes).
2. **`/dashboard/orders/[id]` Fakturakladde-tab har wizard** med 4 typer: Standard / Forskud / Rate / Slut.
3. **Forskud (deposit) virker:** operatør vælger procent + basis (`contract_sum` eller `revised_sum`) → faktura oprettes med én fritekst-linje "Forskud X % af basis Y kr".
4. **Rate (progress) virker i begge modes:**
   - Procent-mode: samme som forskud men `invoice_type='progress'`
   - Faktisk-forbrug-mode: samme som Sprint 6B-flow men `invoice_type='progress'`
5. **Slut (final) virker:**
   - Kobler alle ufakturerede source-rows som linjer
   - Auto-pulles alle tidligere `deposit`/`progress` fakturaer som forgængere
   - Beløb = subtotal − sum(deductions) + moms
   - `is_final_invoice=true` skrives + DB nægter anden slutfaktura
6. **`invoice_predecessors`-rækker oprettes** automatisk ved slutfaktura.
7. **PDF viser:**
   - Stage label i header ("Forskud" / "Rate 2 af 3" / "Slutfaktura")
   - Fradrags-blok på slutfakturaer med hver forgænger som negativ linje
8. **Detail-side viser** stage_label-pille + forgængere-panel når relevant.
9. **Økonomi-tab på sagen viser:**
   - Allerede faktureret pr. type (forskud / rate / slut)
   - Resterende at fakturere = `revised_sum ?? contract_sum − total_invoiced_excl_vat`
10. **Dobbelt-bogføring umulig:**
    - DB: UNIQUE-constraints + ON DELETE RESTRICT
    - Service: UI/server-gates på procent-sum >100 % og duplicate final
11. **Backwards-compat:** Sprint 6B's "fuld faktura"-flow virker stadig som `invoice_type='standard'`.
12. **Sletning af forskud/rate** der er fratrukket på slutfaktura → blokeres med klar fejl.
13. **Type-check + build clean.**
14. **Vercel deploy Ready.**
15. **Browser-test** med 3-rate-flow på 1 sag (forskud → rate → slutfaktura med fradrag).

---

## 9. Hvad denne analyse bevidst IKKE har gjort

- Ingen kodeændringer
- Ingen DB-ændringer
- Ingen migrations udført
- Ingen wizard-prototype
- Ingen e-conomic-payload-design (defereres til 6E)
- Ingen kreditnota-flow (`invoice_type='credit'` er reserveret men ikke implementeret i 6D)

Repo er på `e1cb863` på `main`. Ingen filer modificeret under analysen.

---

## 10. Næste skridt

Hvis Henrik godkender denne plan:

**Sprint 6D-1 commit 1:** migration 00105 + 00106. SQL vises før den køres, per CLAUDE.md regel.

Hvis du vil ændre rækkefølge:
- **Springe wizard-UI?** Ikke anbefalet — uden UI er multi-stage kun tilgængeligt via SQL/script.
- **Splitte 6D til mindre sprints?** OK — 6D-1+6D-2 (data-laget) kan landes uafhængigt, så Sprint 6D-2 kun leverer UI.
- **Vente med slutfaktura-fradrag?** Også OK — 6D kan begrænses til forskud + rate uden slutfaktura. Det dropper kompleksiteten betydeligt og leverer alligevel 80 % af værdien.

**Min anbefaling:** byg det hele i én sprint, da forgænger-link-modellen er nøglen til hele systemet. Slutfaktura uden fradrag giver dobbelt-fakturerings-risiko.
