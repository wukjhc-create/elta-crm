# Sprint 6A — Kundefaktura + e-conomic Analyse

**Snapshot:** 2026-05-04 (nat)
**Branch / HEAD:** `main` @ `29e7ccd` (Sprint 5E-4 deploy in progress)
**Audit basis:** filsystem + læsning af mig 00080–00088, 00094 + live schema/rowcount via Supabase Management API + læsning af `src/lib/services/invoices.ts`, `economic-client.ts`, `automation/actions/create-invoice-from-offer.ts`, `app/dashboard/invoices/page.tsx`.
**Scope:** Kun analyse. Ingen kode-, schema- eller config-ændringer.

---

## Executive summary

Phase 5/5.1/5.2/5.3/5.4 + Phase 7.1 har leveret **næsten al backend** for kundefaktura: schema, RPCs, lifecycle, reminder-cron, payment tracking, e-conomic client. Men:

1. **0 invoices i prod.** `invoice_number_counters` har 1 row (én allokeret nummer aldrig brugt). Backendet er teoretisk.
2. **Ingen UI til at OPRETTE en faktura.** `/dashboard/invoices` er en read-only liste. Der findes ingen `/dashboard/invoices/new`, ingen `/dashboard/invoices/[id]` detail, ingen "Opret faktura"-knap nogen steder. Den eneste vej til at lave en faktura i dag er via autopilot-rule `offer_accepted → create_invoice_from_offer` — som er `dry_run=true` (per audit).
3. **Ingen `/api/invoices/[id]/pdf` route.** PDF-pipelinen er klar (`@react-pdf/renderer` installed, offers har den, `getInvoicePdfPayload` returnerer payload-shape) men routen er ikke skrevet.
4. **e-conomic er fuldt skipped** — `accounting_integration_settings` har 0 rows. Hver `createInvoiceInEconomic` / `markInvoicePaidInEconomic` returnerer `skipped` med reason `ECONOMIC_NOT_CONFIGURED`. Kode findes; auth-shape (api_token + agreement_grant_token) er afklaret; ingen test mod sandbox er udført.
5. **`invoices.work_order_id` (NOT `case_id`)** — Phase 7.1's invoice-from-work-order linker til WO. For Sprint 5E (case-centrisk) skal vi enten tilføje `case_id` eller fortsætte med at gå via WO. Build-planen siger `invoices.case_id`.

**Anbefaling:** Sprint 6 skal levere **UI-stack + PDF-route + e-conomic config** så Phase 5 ophører med at være "kode på disken". DB-schema er overvejende klar; faktura-fra-sag er dog en åben designbeslutning.

---

## 1. Schema

### `invoices` (25 kolonner, mig 00080 + 00082 + 00087)

| Kolonne | Type | Bemærkning |
|---|---|---|
| `id` | uuid PK | |
| `invoice_number` | text UNIQUE NOT NULL | Allokeret af `allocate_invoice_number()` RPC |
| `customer_id` | uuid FK → customers | Nullable — bemærk |
| `offer_id` | uuid FK → offers | UNIQUE — én faktura pr. tilbud |
| `work_order_id` | uuid FK → work_orders | UNIQUE (mig 00087) — én faktura pr. WO. **IKKE `case_id`.** |
| `status` | text NOT NULL | `draft / sent / paid` |
| `payment_status` | text NOT NULL | (mig 00082 — partial/full/unpaid) |
| `total_amount` | numeric NOT NULL | ex-VAT |
| `tax_amount` | numeric NOT NULL | 25% default |
| `final_amount` | numeric NOT NULL | incl. VAT |
| `amount_paid` | numeric NOT NULL | running total fra invoice_payments |
| `currency` | text NOT NULL | DKK |
| `due_date` | date | |
| `sent_at` | timestamptz | sat ved status='sent' |
| `paid_at` | timestamptz | sat ved status='paid' |
| `pdf_url` | text | Storage URL — ikke fyldt endnu |
| `notes` | text | |
| `payment_reference` | text | FIK / OCR / +71 |
| `reminder_count` | int NOT NULL | reminder cron-tæller |
| `last_reminder_at` | timestamptz | |
| `external_invoice_id` | text | e-conomic ID når posted |
| `external_provider` | text | 'economic' |

**UNIQUE indexes:** `(offer_id) partial NOT NULL`, `(work_order_id) partial NOT NULL`, `(external_provider, external_invoice_id) partial NOT NULL`.

### `invoice_lines` (9 kolonner — slim)

```
id, invoice_id, position, description, quantity, unit, unit_price, total_price, created_at
```

**Mangler provenance:** ingen `source_offer_line_id`, ingen `source_time_log_id`, ingen `source_case_material_id`. Når Phase 7.1's RPC `create_invoice_from_work_order` opretter linjer, opdateres `time_logs.invoice_line_id` så timer ikke kan faktureres dobbelt — men det er kun den kobling der findes.

### `invoice_payments` (5 kolonner)

```
id, invoice_id, amount, reference, recorded_at
```

Ingen status, ingen kilde — operatør indtaster manuelt eller bank-match-cron INSERT'er. `invoices.amount_paid` opdateres via service-laget når en betaling tilføjes.

### `invoice_reminder_log` (mig 00081, 0 rows)

`{ invoice_id, level, sent_at }` — tracker hvilke reminder-niveauer er sendt for at undgå dobbelt-rykker.

### `accounting_integration_settings` (mig 00084, 0 rows i prod)

```
id, provider ('economic'), api_token, agreement_grant_token, active, last_sync_at, config (JSONB), created_at, updated_at
```

**Tom.** Hver e-conomic-call returnerer `skipped` med reason `ECONOMIC_NOT_CONFIGURED`.

### `accounting_sync_log` (0 rows)

```
{ entity_type, entity_id, action, status (success/skipped/error), error_message, ... }
```

Append-only audit. Bruges af `economic-client.ts` til at logge hver attempt.

### `invoice_number_counters` (1 row i prod)

```
{ year: int, next_n: int }
```

Yderst minimal. `allocate_invoice_number()` RPC tager rækken FOR UPDATE, returnerer `F-YYYY-NNNN` formatted. Den ene row er fra en smoke-allokering der aldrig blev koblet til en faktura.

---

## 2. Customer / Sag / WO relation

| Relation | Eksisterende felt | Status |
|---|---|---|
| invoice → customer | `invoices.customer_id` | ✅ FK eksisterer, NULLable |
| invoice → offer | `invoices.offer_id` UNIQUE | ✅ idempotency-guard |
| invoice → sag | **MANGLER** — kun via `work_order_id` | ❌ |
| invoice → work_order | `invoices.work_order_id` UNIQUE | ✅ men 1 invoice = 1 WO; én sag har N WO'er |
| invoice → time_log (provenance) | `time_logs.invoice_line_id` | ✅ marker linje som faktureret |
| invoice → case_material (provenance) | **MANGLER** | ❌ |
| invoice → case_other_cost (provenance) | **MANGLER** | ❌ |

**Konsekvens:** I dag laver `create_invoice_from_work_order` RPC ikke linjer fra `case_materials` eller `case_other_costs` — den kopierer kun fra `offer_line_items` (via `work_orders.source_offer_id`). Sprint 5E's konverterede materialer/øvrige optræder derfor IKKE på en automatisk genereret faktura. Dette skal rettes.

---

## 3. Eksisterende /dashboard/invoices UI

### `/dashboard/invoices/page.tsx` (read-only list)

- Henter `invoices` (cap 200) sorteret created_at DESC
- Tabel: `invoice_number, status, payment_status, due_date, final_amount, created_at`
- `invoice_number` linker til `/dashboard/customers/[id]` (faktisk forkert — burde linke til detail-side, men da detail ikke findes, peger den hen til kunden)
- Tomt empty-state: "Ingen fakturaer endnu"
- Ingen filter, ingen pagination, ingen "Opret"-knap

### Manglende UI

- `/dashboard/invoices/[id]` — **eksisterer ikke**
- `/dashboard/invoices/new` — **eksisterer ikke**
- "Opret faktura"-knap nogen steder — ingen
- "Send faktura"-knap, "Marker betalt"-knap, "Send rykker"-knap — alle service-funktionerne findes (`markInvoiceSent`, `markInvoicePaid`, `sendInvoiceReminder`, `sendInvoiceEmail`) men har ingen UI-trigger

### Sidebar-navigation

Faktisk er `/dashboard/invoices` heller ikke i sidebaren. Bruger skal kende URL'en. Samme bug som `/dashboard/incoming-invoices` havde indtil sidebar-fix natter.

---

## 4. PDF-generering

**Bibliotek:** `@react-pdf/renderer` er installeret og bruges allerede til:
- `/api/offers/[id]/pdf/route.ts` — fungerende offer-PDF
- `/api/besigtigelse/pdf/route.ts`
- `/api/fuldmagt/pdf/route.ts`
- `lib/pdf/templates/installation-offer-pdf.tsx`, `sales-offer-pdf.tsx`
- Bruges også af email-templates til at vedhæfte filer

**Invoice PDF-status:**
- `getInvoicePdfPayload(invoiceId)` returnerer `{ invoice, lines, customer }` shape — **klar til template**
- `pdf_url`-kolonne på `invoices` ER der — klar til at gemme storage URL
- **Mangler:** PDF-template (`lib/pdf/templates/invoice-pdf.tsx`) + API-route (`/api/invoices/[id]/pdf/route.ts`) + storage upload

Estimat: kan genbruge offer-template-pattern. ~1 dag.

---

## 5. Fakturanummer

`allocate_invoice_number()` RPC eksisterer + bruges af både `create_invoice_from_offer` og `create_invoice_from_work_order`. Format: `F-YYYY-NNNN`. Gør:
1. SELECT counter FOR UPDATE WHERE year=current
2. Hvis ikke findes: INSERT (year, 1)
3. UPDATE next_n = next_n + 1
4. Returnerer formatted text

**Race-safe.** Sequential. Ingen huller mellem numre når faktura mislykkes (RPC kører i transaction — fakturalinjen rolles tilbage hvis numre allokeres men resten fejler? Skal verificeres). Reality: 1 row i counter med next_n=2 antyder en allokering uden følgevirkning.

**Risiko:** Hvis numre allokeres men senere bruges af to faktura-forsøg, kan det give hul i sekvensen. Dansk lov kræver typisk fakturanumre uden huller — operatør skal forstå dette.

---

## 6. Moms

`tax_amount` er beregnet i RPC'en som `total_amount * 0.25` (25 % standard dansk VAT). `final_amount = total_amount + tax_amount`. **Ingen** håndtering af:
- Reduceret moms (12 % / 5 %)
- 0 % moms (eksport)
- Reverse charge (B2B EU)
- Moms-fri ydelser

Også `currency` = DKK fast (ingen multi-currency support). For Elta Solar er det fint p.t.

---

## 7. Payment status / lifecycle

Lifecycle (fra `invoices.ts:66`):

```
draft → sent → paid
```

Ingen reverse, ingen skip. `setInvoiceStatus` checker ALLOWED_TRANSITIONS i kode. `payment_status` er separat (mig 00082) med values `unpaid / partial / paid` — opdateres baseret på sum af `invoice_payments`.

`registerPayment(invoiceId, amount, reference)` (linje 717):
- INSERT invoice_payments
- UPDATE invoices.amount_paid + payment_status (partial / paid)
- Hvis fuldt betalt: kalder også `setInvoiceStatus → 'paid'` (med audit + e-conomic mark-paid push)

`sendInvoiceReminder` + `getOverdueInvoices` driver reminder-cronen `/api/cron/invoice-reminders` med 3 niveauer (3, 10, 20 dage overdue, min 5 dage mellem).

---

## 8. e-conomic — current state

### Settings (0 rows i prod)

```
{ provider: 'economic', api_token, agreement_grant_token, active, last_sync_at, config }
```

`config` er JSONB — designet til at holde `cashbookNumber`, `costAccountNumber`, `layoutNumber` osv.

### Code (`src/lib/services/economic-client.ts`)

Funktioner:
- `getEconomicSettings()` — load from DB
- `isEconomicReady(s)` — type-guard: active=true AND tokens present
- `loadReadySettings(...)` — gates på readiness, audits 'skipped' hvis ikke
- `createCustomerInEconomic(customerId)` — POST /customers
- `createInvoiceInEconomic(invoiceId)` — POST /invoices/drafts
- `markInvoicePaidInEconomic(invoiceId)` — POST /cash-books/{n}/entries/customer-payments
- `pushSupplierInvoiceToEconomic(invoiceId)` — POST /supplier-invoices/drafts

**Alle returnerer `EconomicResult` (never throw).** Logger til `accounting_sync_log`. Idempotent: 2. kald checker external_invoice_id og returnerer existing.

### Wiring

| Trigger | Kald e-conomic |
|---|---|
| `sendInvoiceEmail` | `createInvoiceInEconomic` (best-effort) |
| `registerPayment` (når fuldt betalt) | `markInvoicePaidInEconomic` |
| `approveInvoice` (incoming faktura — Phase 15) | `pushSupplierInvoiceToEconomic` |

Alle returnerer `skipped` indtil settings udfyldes.

### Verifikation

Per `PROJECT_REALITY_AUDIT.md`:
> e-conomic-integrationen er **uverificeret mod live agreement**. HTTP-shape er afledt af e-conomic offentlige docs. Cashbook payment voucher API er specielt fragil — required fields varierer pr. agreement-konfiguration.

**Konkret risiko:** Even when settings populated, første rigtige push kan fejle pga. agreement-specific felter vi ikke har testet. Sprint 6 skal inkludere sandbox-testkørsel før produktion.

---

## 9. e-conomic customer / product / invoice sync — hvad er bygget

### Customer sync
- `createCustomerInEconomic(customerId)` — push from Elta → e-conomic
- **Ingen reverse sync** (fra e-conomic → Elta)
- **Ingen automatic sync** ved customer create i Elta — kaldes kun ad-hoc

### Product sync
- **Slet ikke bygget.** Hverken push eller pull. e-conomic invoice line items har eget product_number-felt; vi skriver dem som free-text linjer i drafts (verificér i `createInvoiceInEconomic`).

### Invoice sync (Elta → e-conomic)
- Kun **udgående** kundefakturaer, push only, ingen pull
- Linjer mappes 1:1 fra `invoice_lines` → e-conomic line items
- Customer skal eksistere i e-conomic først (`createCustomerInEconomic` kaldes implicit hvis manglende? **Skal verificeres.**)

### Invoice sync (e-conomic → Elta)
- **Slet ikke bygget.** Ingen webhook/polling fra e-conomic → Elta. Hvis en faktura ændres i e-conomic vises det ikke i Elta.

---

## 10. Hvad er reelt bygget vs placeholder

| Komponent | Status | Note |
|---|---|---|
| Schema (invoices/lines/payments/reminder/counters) | ✅ Real | mig 00080-00082 |
| `allocate_invoice_number` RPC | ✅ Real | F-YYYY-NNNN, race-safe |
| `create_invoice_from_offer` RPC | ✅ Real | UNIQUE(offer_id), copies lines |
| `create_invoice_from_work_order` RPC | ✅ Real | Phase 7.1, UNIQUE(work_order_id), copies time_logs + offer materials |
| `setInvoiceStatus` lifecycle | ✅ Real | draft → sent → paid |
| `getInvoicePdfPayload` | ✅ Real | shape kun, ingen render |
| Reminder cron + 3-level rules | ✅ Real | `/api/cron/invoice-reminders`, 0 fires |
| `invoice_payments` + `registerPayment` | ✅ Real | partial/full status |
| Bank match (Phase 5.3) | ✅ Real | `bank_transactions`, mig 00083, 4 smoke rows |
| `accounting_integration_settings` | ✅ schema, 0 rows | placeholder data |
| `accounting_sync_log` | ✅ Real | append-only audit |
| `economic-client.ts` (4 funktioner) | ⚠️ Code real, **uverificeret** | shape fra docs, ingen sandbox-test |
| `/dashboard/invoices` list | ✅ Real (read-only) | minimal |
| `/dashboard/invoices/[id]` detail | ❌ **Mangler** | |
| `/dashboard/invoices/new` create wizard | ❌ **Mangler** | |
| `/api/invoices/[id]/pdf` | ❌ **Mangler** | |
| Invoice PDF template | ❌ **Mangler** | |
| Sidebar entry "Fakturaer" | ❌ **Mangler** | |
| Manuelt "Opret faktura"-flow | ❌ **Mangler** | autopilot er eneste vej |
| e-conomic credentials config | ❌ **Mangler** (tom DB) | manuel SQL eller settings UI |
| e-conomic sandbox-verifikation | ❌ **Mangler** | aldrig testet |
| Multi-stage billing (forskud/rate/slut) | ❌ **Ikke bygget** | build-plan §1.10 |
| OIOUBL/EAN export | ❌ **Ikke bygget** | offentlige kunder |
| `invoice_lines.source_*_id` provenance | ❌ **Mangler** | mod case_materials/case_other_costs/time_logs |
| Sag-link (`invoices.case_id`) | ❌ **Mangler** | kun via WO i dag |

---

## 11. Customer-sync-strategi (e-conomic)

**Spørgsmål:** Når jeg opretter en faktura i Elta for en kunde der ikke findes i e-conomic, hvad sker?

I dag:
- `createInvoiceInEconomic` antager kunde-eksistens i e-conomic (POST /invoices/drafts kræver `customer.customerNumber`)
- Hvis kunden ikke findes → 4xx fra e-conomic → `EconomicResult.status='error'`
- Operatør skal manuelt skubbe kunden først via `createCustomerInEconomic`

**Bedre design:** Auto-create customer i e-conomic når invoice oprettes hvis missing. Kræver:
- Lookup på `customers.external_supplier_id` (mig 00094 — eksisterer på `suppliers`, ikke på `customers`)
- ALTER `customers` ADD COLUMN `external_customer_id text, external_provider text` (additivt)
- I `createInvoiceInEconomic`: hvis `external_customer_id` null → kald `createCustomerInEconomic` først

---

## 12. Sag → faktura — designbeslutning

Build-planen ELTA_ERP_BUILD_PLAN siger:
> 1 invoice → 1 sag (currently `invoices.work_order_id` — rename to `invoices.case_id` post-Sprint 2)

Men Sprint 2 omkonsoliderede ikke FK'en (work_order er stadig planlægning under sag, ikke selve sagen). Nu i Sprint 6-planlægning skal vi vælge:

### Option A — Tilføj `invoices.case_id` (anbefalet)

Additiv migration:
```sql
ALTER TABLE invoices ADD COLUMN case_id UUID REFERENCES service_cases(id) ON DELETE SET NULL;
CREATE INDEX idx_invoices_case_id ON invoices(case_id) WHERE case_id IS NOT NULL;
```

`work_order_id` bevares (UNIQUE-constraint stadig gyldig). Auto-fyld `case_id = work_order.case_id` når WO matches. Tillader også fakturaer **uden WO** (fx forskudsfaktura før første arbejdsdag).

### Option B — Bevar kun `work_order_id`

Faktura skal altid hænge på en WO. Kræver "phantom WO" når operatør vil fakturere før noget arbejde er planlagt. Klodset.

**Anbefaling: Option A.** Også: nye RPC `create_invoice_from_case(case_id, ...)` der kan generere multi-stage fakturaer (forskud / rate / slut) med stage-tracking.

---

## 13. Multi-stage billing

Build-planen kræver:
- forskudsfaktura (fx 30 % af tilbuddet)
- ratefaktura (når montage færdig)
- slutfaktura (efter inspektion)

Ikke bygget. Kræver:
- `invoices.stage` text CHECK ('forskud','rate','slut','full')
- `invoices.parent_invoice_id` (forbinder rate-faktura til den forrige)
- `invoices.percentage_of_contract` numeric (hvor stor del af kontrakten dækker den)
- UI: "Opret faktura" wizard har stage-vælger

Estimat: 2 dage backend + 2 dage UI.

---

## 14. Anbefalet Sprint 6-plan

### 6A — Analyse (denne fil) ✅

### 6B — Sag-link + UI fundament (3-4 dage)

**Levér:**
1. Migration: `invoices.case_id` (additivt, FK + index)
2. Migration: `customers.external_customer_id + external_provider` for e-conomic-mapping
3. Migration: `invoice_lines.source_time_log_id + source_case_material_id + source_case_other_cost_id` for provenance
4. UI:
   - Sidebar entry "Fakturaer" (`economy.view` permission)
   - `/dashboard/invoices/[id]` detail-side (læser `getInvoicePdfPayload` + viser linjer + status + payments + audit)
   - Status/payment-knapper (Send / Marker betalt / Send rykker / Slet draft)
5. Type-check + build + commit + push + Vercel verify

### 6C — PDF + email-send (2-3 dage)

**Levér:**
1. `lib/pdf/templates/invoice-pdf.tsx` (genbruger offer-template-pattern)
2. `/api/invoices/[id]/pdf/route.ts` (signed URL or inline render)
3. `pdf_url`-felt fyldes ved første render (storage upload)
4. `sendInvoiceEmail` allerede impl. — bare wired op til UI-knappen
5. Browser-test med 1 ægte faktura (kræver Henrik)

### 6D — Manuel oprettelse + multi-stage (3-4 dage)

**Levér:**
1. `/dashboard/invoices/new` wizard:
   - Vælg sag (eller direkte kunde)
   - Vælg linjer fra ufakturerede `time_logs` + `case_materials` + `case_other_costs` på sagen
   - Stage-vælger (forskud / rate / slut / fuld)
   - Forhåndsvisning + opret
2. Migration: `invoices.stage + parent_invoice_id`
3. Ny RPC `create_invoice_from_case(case_id, line_selection, stage, percentage)`
4. Type-check + build + commit + push

### 6E — e-conomic config + sandbox-verifikation (2-3 dage, Henrik-afhængig)

**Levér:**
1. `/dashboard/settings/integrations/economic` UI (læs/skriv `accounting_integration_settings`)
2. "Test forbindelse"-knap — kalder `getCustomerNumbers` lightweight call
3. **Operator-task (Henrik):**
   - Skaffe e-conomic sandbox-credentials
   - Indsætte token-pair via UI
   - Køre test: opret 1 kunde + 1 faktura mod sandbox
4. Verificer per-agreement felter (cashbookNumber etc.) i `config` JSONB

### 6F — Live e-conomic + multi-stage produktion (1-2 dage)

**Levér:**
1. Customer auto-create i `createInvoiceInEconomic` hvis missing
2. Wire op `external_customer_id` på `customers`
3. Verificer at `markInvoicePaidInEconomic` virker mod ægte agreement
4. End-to-end smoke i prod: opret offer → accept → invoice (manual) → send → push e-conomic → mark paid → push paid

### 6G — OIOUBL/EAN (defer eller folde ind)

For offentlige kunder med EAN-nummer skal e-faktura genereres i OIOUBL XML-format. Kompleks. Kan defereres til Sprint 9 hvis ingen offentlige kunder forventes.

### Estimat

| Sprint | Dage |
|---|---|
| 6B sag-link + fundament | 3-4 |
| 6C PDF + email | 2-3 |
| 6D manuel + multi-stage | 3-4 |
| 6E config UI + sandbox | 2-3 |
| 6F live e-conomic | 1-2 |
| **Total (uden 6G)** | **11-16 dage** |
| 6G OIOUBL (defer) | +5 |

---

## 15. Risici

| Risiko | Sandsynlighed | Mitigering |
|---|---|---|
| **e-conomic agreement-felter** afviger fra docs | Høj | Sandbox-test FØR produktion. Hold settings.config JSONB åben for runtime-tuning. |
| **Fakturanummer-huller** (allocated, never used) | Mellem | Allerede én eksisterende. Tilføj UI advarsel hvis hul detekteres. Dansk lov tillader hul med audit-trail. |
| **Customer.external_customer_id missing** ved push | Høj | Auto-create i `createInvoiceInEconomic`. |
| **Multi-stage = double-billing risk** | Høj | Per stage skal én procent eller fast beløb af kontrakten — UNIQUE(case_id, stage)? Eller løs dragt-track. Nøje validering i `create_invoice_from_case`. |
| **time_logs.invoice_line_id allerede sat** ved re-faktura | Mellem | Phase 7.1 RPC tjekker dette — operatør får "alle timer er allerede faktureret" hvis dobbelt. |
| **case_materials uden case_id** kan ikke faktureres direkte | Lav | Sprint 5B's CHECK quantity > 0 og FK til case_id sikrer integritet. |
| **PDF-render fejler** ved store fakturaer (mange linjer) | Lav | `@react-pdf/renderer` håndterer 100+ linjer fint. Genbrug offer-template. |
| **e-conomic rate limit** | Mellem | Allerede best-effort i `economic-client`. Tilføj retry-with-backoff hvis det bliver et problem. |
| **OIOUBL/EAN regulatorisk krav** glemmes | Mellem | Defer til Sprint 9, men tjek med Henrik om der er offentlige kunder allerede. |
| **Backwards-compat med Phase 7.1** brud | Lav | Alt additivt. `work_order_id` UNIQUE bevares. `create_invoice_from_work_order` urørt. |
| **Reminder-cron starter sende rigtige rykkere når invoices kommer** | Mellem | Allerede best-effort + 5-dages cooldown. Operatør skal kunne stoppe rykker pr. faktura. |

---

## 16. Hvad denne analyse bevidst IKKE har gjort

- Ingen kodeændringer
- Ingen DB-ændringer
- Ingen migrations udført
- Ingen e-conomic settings indsat
- Ingen smoke-test mod sandbox
- Ingen antagelser om felter der ikke er verificeret i schema

Repo er på `29e7ccd` på `main` (Sprint 5E-4 deploy in progress). Ingen filer modificeret under analysen.

---

## 17. Anbefalet næste skridt

Hvis Henrik godkender denne analyse:

**Sprint 6B commit 1** — migration: `invoices.case_id` + `customers.external_customer_id` + `invoice_lines.source_*_id` provenance (én enkelt migration, alt additivt). SQL vises før den køres, per CLAUDE.md regel.

Hvis Henrik vil ændre rækkefølge:
- Spring 6E før 6D? (config + sandbox kan ske parallelt med UI-arbejde)
- Spring 6G ind tidligere? (kun hvis offentlige kunder med EAN forventes nu)

**Anbefaling:** følg 6B → 6C → 6D → 6E → 6F. 6G defer til Sprint 9 medmindre andet besluttes.
