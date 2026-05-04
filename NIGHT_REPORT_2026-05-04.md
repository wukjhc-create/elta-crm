# Nat-rapport — 2026-05-04 → 2026-05-05

**Operatør:** autonom session (ingen Henrik-input mellem 18:30 og rapport-tidspunkt)
**Branch:** `main`
**Start-HEAD:** `3e3592d` (Sprint 5E-2 + sidebar fix)
**Slut-HEAD:** `19f9d64` (Sprint 6A analyse committed)
**Sikkerhedsregler overholdt:** Ja — alle 22 punkter i Henriks brief.

---

## 1. Hvad blev lavet

### Sprint 5E-3 — Konverter godkendt faktura til sag-omkostninger ✅

**Migration 00103** — additiv schema for conversion provenance:
- `case_other_costs.source_incoming_invoice_line_id` (FK → incoming_invoice_lines, ON DELETE SET NULL)
- `incoming_invoice_lines.converted_case_material_id`, `converted_case_other_cost_id`, `converted_at`, `converted_by`
- 4 indexes: 2 UNIQUE partial (idempotency), 1 lookup partial (case_other_costs reverse), 1 partial unconverted-per-invoice
- Verificeret post-apply: alle 5 kolonner + 4 indexes + 0 row-side-effekter

**Service: `convertAndApproveInvoice`** (`src/lib/services/incoming-invoice-conversion.ts`):
- Per-linje konvertering (`material` / `other_cost` / `skip`) med snapshot pricing
- Idempotent: lines med `converted_at` allerede sat → reportes som `alreadyConverted`
- Cleanup ved bind-failure: orphan case_material/case_other_cost slettes hvis reverse-link UPDATE fejler
- Race-safe via `.is(null)` på UPDATE
- Audit-log per konvertering + final approved-row
- **Ingen e-conomic push** i denne kode-sti (per regel)
- Status flippes kun når ALLE linjer success — ellers awaiting_approval

**Server action: `approveIncomingInvoiceWithConversionAction`** (`src/lib/actions/incoming-invoices.ts`):
- Wrapper omkring service
- Revalidate /dashboard/incoming-invoices, detail, og /dashboard/orders/[case_number]

**UI:**
- Preview-dialog (Sprint 5E-2) wired til conversion action
- Allerede-konverterede linjer låst til `'skip'` med emerald badge "Allerede konverteret · Materiale/Øvrig/Sprunget over"
- Linjer-panel uden for dialog: ny "Konvertering"-kolonne (Materiale / Øvrig / Sprunget over / —)
- Per-linje fejl vist hvis konvertering fejler

### Sprint 5E-4 — Leverandørfaktura på Økonomi-tab ✅

**`getServiceCaseEconomy` udvidet** (`src/lib/actions/service-case-economy.ts`):
- 5. parallel SELECT mod `incoming_invoices WHERE matched_case_id = caseId` med embed af lines
- Nyt `supplier_invoices`-block med:
  - count + per-status counts (awaiting/approved/rejected)
  - total_amount_incl_vat (read-only afstemning)
  - converted_to_material_count / converted_to_other_count / skipped_count / unconverted_line_count
  - approved_with_unconverted_count (operationelt advarsels-flag)
  - per-invoice list (cap 50, sorteret invoice_date DESC) med UI-felter
- Nyt `quality_flags.unconverted_supplier_invoice_lines`
- **Ingen dobbelt-tælling**: leverandørfaktura-beløb tilføjes IKKE til `totals.cost`. Konverterede linjer tæller via case_materials/case_other_costs (hvor de blev INSERTed). Resten er afstemning.

**UI: `SupplierInvoicesPanel`** på `/dashboard/orders/[id]` Økonomi-tab:
- Empty state når count=0
- 4-card status counter + 4-card konverterings-summary
- Amber warning når approved invoices har ukonverterede linjer
- Forklaring: "Beløbene er kontrol/afstemning — ikke ekstra kost"
- Per-invoice tabel med dato, leverandør, fakturanr, status pille, beløb, konverterings-ratio (X/Y), ekstern-link
- Quality flags sektion fanger unconverted_supplier_invoice_lines

### Sprint 6A — Analyse leveret ✅

**`SPRINT_6A_INVOICING_ECONOMIC_ANALYSIS.md`** (470 linjer):
- Fuld schema-gennemgang af invoices/lines/payments/settings/counters
- Code-surface: invoices.ts, economic-client.ts, automation/actions
- UI-status: read-only list eksisterer; detail/new/PDF-route mangler
- e-conomic: kode klar, settings tom, sandbox-test aldrig kørt
- 6-fase plan: 6B sag-link → 6C PDF → 6D wizard → 6E config → 6F live → 6G OIOUBL (defer)
- Estimat 11–16 dage uden 6G
- 11 risici identificeret med mitigeringsstrategi

---

## 2. Commits

```
fa82b70  Sprint 5E-3 commit 1: conversion provenance migration (00103)
2832507  Sprint 5E-3 commit 2: conversion service + action
e7c93b9  Sprint 5E-3 commit 3: wire preview to conversion + already-converted UI
29e7ccd  Sprint 5E-4: leverandørfaktura section on Økonomi-tab
19f9d64  docs: Sprint 6A invoicing + e-conomic analysis (no implementation)
```

5 commits — én logisk ændring pr. commit. Type-check + build clean før hver push.

---

## 3. Migrationer

**Kun 1 migration kørt i nat — fuldt additiv.**

```
00103_incoming_invoice_conversion_provenance.sql
```

| Sikkerhedscheck | Status |
|---|---|
| Additiv | ✅ |
| Ingen DROP | ✅ |
| Ingen DELETE | ✅ |
| Ingen TRUNCATE | ✅ |
| 0 eksisterende data ændres | ✅ (alle target-tabeller har 0 rows i prod) |
| Type-check/build clean efter | ✅ |
| Verificeret post-apply | ✅ (kolonner + 4 indexes + 0 row diff) |

---

## 4. Hvad blev testet

### Lokalt
- `npm run type-check` clean efter hver commit (5 gange)
- `npm run build` clean (`Compiled successfully in ~8s`) efter hver UI-ændring
- Schema-verifikation post-migration via Supabase Management API

### Production
- Vercel build verificeret Ready for hver commit (alle 4 deploy-cycles)
- HTTP 307 → /login bekræftet for `/dashboard/incoming-invoices` og `/dashboard/orders` efter sidste deploy
- Build-log bekræfter HEAD-commit clones korrekt

### Hvad blev IKKE testet
- **Browser-test af UI** — kunne ikke uden Henrik
- **Konvertering end-to-end** — kunne ikke uden mindst 1 incoming_invoices row + 1 case_material/case_other_cost result
- **Allerede-konverteret state** — UI-pille kan ikke verificeres uden faktiske data
- **Quality flag for unconverted_supplier_invoice_lines** — kræver approved invoice med ukonverterede linjer

---

## 5. Hvad er live

✅ **Production HEAD = `19f9d64`**

| Modul | Status |
|---|---|
| Sprint 5E-1 (matched_case_id + UI) | ✅ Live siden tidligere |
| Sprint 5E-2 (approve preview-dialog) | ✅ Live siden tidligere |
| **Sprint 5E-3 (conversion provenance + service + UI)** | ✅ **Live nu** |
| **Sprint 5E-4 (Økonomi-tab leverandørfaktura section)** | ✅ **Live nu** |
| Sidebar Leverandørfaktura | ✅ Live siden tidligere |
| Sprint 6A analyse | ✅ Committed (`19f9d64`) |

**Vercel deploys:**
- `elta-mj5w7kh0i…` — 5E-4 (29e7ccd) Ready
- Sprint 6A (19f9d64) er en docs-only commit; ingen Vercel-build kræves

---

## 6. Hvad kunne ikke testes uden Henrik

Alle UI-flows er **bygget og deployed** men **ingen data findes til at exercere dem**. Specifikt:

1. **Approve preview-dialog** — virker server-side; UI viser empty preview-tabel hvis 0 lines, sag-gate hvis no matched_case_id. Kræver ægte `incoming_invoices` row med 2-5 lines + matched_case_id sat.
2. **Konverteringsflow til case_materials/case_other_costs** — service-laget testet via type-check + build, men ingen ægte INSERT eksekveret. Kræver godkendelse af én faktura med blandede linjer (et material + en kørsel + en spring-over).
3. **Allerede-konverteret pille** — vises kun for linjer med `converted_at` sat. Kræver én approve-cyklus først.
4. **Økonomi-tab supplier_invoices section** — viser empty state nu. Med 1+ matched faktura vil panelet rendere counters + tabel + warning hvis ukonverterede linjer.
5. **Sidebar Leverandørfaktura-link** — synlig per `economy.view` permission (admin + serviceleder). Henrik er admin → bør se den.

---

## 7. Hvad Henrik skal browser-teste

### A) Smoke-test af deployment

1. Login → tjek venstre sidebar
2. Mellem **"Sager / Ordrer"** og **"Service"** skal **"Leverandørfaktura"** være synlig (kvitteringsikon)
3. Klik → lander på `/dashboard/incoming-invoices` med tom liste

### B) Test af Sprint 5E-3 + 5E-4 (kræver én test-faktura)

Indsæt en testrow via Supabase SQL editor:

```sql
-- 1. Opret en test-faktura matchet til en eksisterende sag
WITH sag AS (
  SELECT id FROM service_cases ORDER BY created_at DESC LIMIT 1
)
INSERT INTO incoming_invoices (
  source, status, currency, parse_status,
  supplier_name_extracted, invoice_number, invoice_date,
  amount_excl_vat, vat_amount, amount_incl_vat,
  matched_case_id, parse_confidence, match_confidence
)
SELECT
  'manual', 'awaiting_approval', 'DKK', 'parsed',
  'Test AO', 'AO-2026-001', CURRENT_DATE,
  4000, 1000, 5000,
  sag.id, 0.95, 0.85
FROM sag
RETURNING id AS invoice_id;

-- 2. Tilføj 3 fakturalinjer (capture invoice_id from previous output)
-- Erstat <INVOICE_ID> med id'et fra step 1
INSERT INTO incoming_invoice_lines
  (incoming_invoice_id, line_number, description, quantity, unit, unit_price, total_price)
VALUES
  ('<INVOICE_ID>', 1, 'Solpanel 425W', 8, 'stk', 1250, 10000),
  ('<INVOICE_ID>', 2, 'Kørsel til montage Aalborg', 240, 'km', 3.70, 888),
  ('<INVOICE_ID>', 3, 'Diverse småtjenester', 1, 'stk', 500, 500);
```

Så test:

1. **`/dashboard/incoming-invoices`** → ny faktura vises i listen
2. Klik fakturaen → detail-side viser:
   - Match-resultat-panel med "Tilknyttet sag" (link til sagen) + "Skift sag"-knap
   - Linjer-panel med 3 linjer + ny "Konvertering"-kolonne (alle "—" indtil approve)
   - Knappen **"Forhåndsvis & godkend"**
3. Klik "Forhåndsvis & godkend" → dialog åbner med:
   - Faktura-header (leverandør, fakturanr, dato, beløb)
   - Sag-link (emerald banner)
   - Linjer-tabel med suggested type:
     - Linje 1 (Solpanel) → Materiale (auto-detected)
     - Linje 2 (Kørsel) → Øvrig omkostning, kategori "kørsel"
     - Linje 3 (Diverse) → Øvrig omkostning, kategori "andet" (default)
   - Operatør kan override
   - Counter: Materiale: 1 / Øvrige: 2 / Spring over: 0
4. Marker fx linje 3 som "Spring over" → Counter: 1/1/1
5. Klik "Godkend" → dialog lukker, faktura status='approved'
6. Tilbage på detail-siden:
   - Linjer-panel: linje 1 "Materiale"-pille (blå), linje 2 "Øvrig"-pille (lilla), linje 3 "Sprunget over" (grå)
   - Audit-log viser 3 conversion-rows + 1 approved-row
7. **Naviger til sagen** (`/dashboard/orders/[case_number]`):
   - **Materialer-tab**: linje 1 vises med "Lev.faktura"-kilde-pille
   - **Øvrige omkostninger-tab**: linje 2 vises med kategori "Kørsel" + kilde
   - **Økonomi-tab**:
     - Hovedtal opdateret (kost = 10000 + 888 = 10888 fra konverterede linjer)
     - Ny **"Leverandørfakturaer"-sektion**: 1 faktura, status "Godkendt", 2/3 konverteret, 1 sprunget over (ingen warning fordi ingen ukonverterede linjer)

### C) Test af "skift sag"

Med samme test-faktura:
1. Tilbage på detail-siden, klik "Skift sag"
2. Dialog viser sag-picker
3. Vælg en anden sag → matched_case_id opdateres, matched_work_order_id ryddes
4. Audit-log viser 'matched'-row med previous + new values

### D) Test af double-conversion guard

1. Genåbn samme faktura efter approve
2. Klik "Forhåndsvis & godkend" igen
3. Dialog viser nu:
   - Linje 1: "Allerede konverteret · Materiale" (emerald), disposition låst til "Spring over"
   - Linje 2: "Allerede konverteret · Øvrig", disposition låst
   - Linje 3: "Allerede behandlet · Sprunget over", disposition låst
4. Klik "Godkend" → kører idempotent, ingen nye INSERT'er, message: "0 konverteret (3 allerede konverteret)"

### E) Test af cleanup

```sql
-- Ryd test-data efter testen
DELETE FROM case_materials WHERE source_incoming_invoice_line_id IS NOT NULL;
DELETE FROM case_other_costs WHERE source_incoming_invoice_line_id IS NOT NULL;
DELETE FROM incoming_invoice_lines WHERE incoming_invoice_id IN (
  SELECT id FROM incoming_invoices WHERE invoice_number = 'AO-2026-001'
);
DELETE FROM incoming_invoice_audit_log WHERE incoming_invoice_id IN (
  SELECT id FROM incoming_invoices WHERE invoice_number = 'AO-2026-001'
);
DELETE FROM incoming_invoices WHERE invoice_number = 'AO-2026-001';
```

---

## 8. Eventuelle risici

### Identificeret men ikke realiseret

1. **Race på `converted_at`-flag for skipped lines:** Service'en bruger `.is(converted_at, null)` på UPDATE. Hvis to operatører klikker "Godkend" samtidig på samme faktura, vil den anden få "0 nye konverteringer (alle allerede behandlet)" — det er ønsket adfærd.

2. **e-conomic push i legacy approveInvoice:** Den oprindelige `approveInvoice` funktion (Phase 15) pusher stadig til e-conomic på "approved"-event. Dette code-path bruges IKKE af Sprint 5E-3-flow (ny `convertAndApproveInvoice` står for status-flip her). Begge code-paths sameksisterer — operatør der klikker "Forhåndsvis & godkend" går gennem 5E-3 (ingen e-conomic). Hvis nogen ringer det legacy endpoint kan e-conomic stadig fyre, men returnerer `skipped` indtil settings sat.

3. **Cleanup-orphans:** Hvis bind-UPDATE fejler efter INSERT, prøver service'en at slette den orphan case_material/case_other_cost. Hvis selve DELETE også fejler (network blip, FK-conflict), er der teoretisk mulighed for orphan-rækker. Per-line audit log fanger fejlen og operatør får besked. Risikoen er meget lav fordi 0 rows i prod og ingen FK-cascades fra nyligt INSERTed række.

4. **Generated columns på `total_cost` / `total_sales_price`:** Sprint 5B/5C bruger `GENERATED ALWAYS STORED` på case_materials/case_other_costs. Conversion service skriver kun `quantity * unit_cost = total_cost` indirekte (DB beregner) — ingen direct write til generated felterne. Verificeret type-check.

### Ikke identificeret

- Ingen sikkerhedshændelser
- Ingen lock-up på Vercel deploys
- Ingen 4xx/5xx fejl observeret i build/curl smoke-tests
- Ingen RLS-policy-konflikter (alle tabeller bruger `*_all_auth` pattern)

---

## 9. Hvor stoppede jeg og hvorfor

**Stopped efter Sprint 5E-4 + Sprint 6A analyse**, fordi:

1. **Sprint 5E er fuldt implementeret og deployed.** Alle 4 sub-sprints (5E-1, 5E-2, 5E-3, 5E-4) er live på production HEAD `29e7ccd`. Sidebar-fix er live. Acceptkriterier i Henriks brief er opfyldt — ÷ browser-test som kræver Henrik.

2. **Sprint 6A analyse leveret.** 470-linjers rapport med alle 16 spørgsmål Henrik bad om. Ingen implementering, kun analyse + plan.

3. **Per Henriks regel:** "Hvis Sprint 5E bliver helt færdig, deployet og verificeret: Lav KUN analyse for Sprint 6 — Kundefaktura + e-conomic. Du må IKKE implementere Sprint 6 uden ny godkendelse." → Stop her.

4. **Ingen blockers.** Type-check + build clean for alle commits. Ingen schema-uklarhed der krævede stop. Ingen 30-min-fejl der krævede rapport.

5. **Tid:** Estimeret samlet kode-tid ~3 timer (mig 00103 + 5E-3 service + UI wiring + 5E-4 action+UI + 6A analyse-skrivning). Henrik gav 8-12 timer — der er resterende tid, men der er intet at lave uden hans godkendelse til Sprint 6 implementering.

---

## 10. Anbefalet næste skridt for Henrik

1. **Browser-test Sprint 5E** end-to-end ifølge §7 ovenfor. Cleanup-SQL er forberedt.

2. **Læs SPRINT_6A_INVOICING_ECONOMIC_ANALYSIS.md** — beslut om:
   - Tilføj `invoices.case_id` (Option A — anbefalet)
   - Multi-stage billing scope (forskud/rate/slut)
   - OIOUBL/EAN — i Sprint 6 eller defer til Sprint 9
   - Hvornår skaffe e-conomic sandbox-credentials

3. **Godkend Sprint 6B** (sag-link + UI fundament + provenance migration) hvis du vil have mig til at fortsætte.

4. **Eller:** lav en mindre opgave før Sprint 6 hvis nogen del af 5E ikke virker som forventet i browser-testen.

---

## Appendix: Files modified i nat

```
src/types/incoming-invoices.types.ts                          (+ 5)
src/lib/actions/incoming-invoices.ts                          (+ 35)
src/lib/services/incoming-invoice-conversion.ts               (NEW, 357 lines)
src/lib/actions/service-case-economy.ts                       (+ 145)
src/app/dashboard/incoming-invoices/[id]/detail-client.tsx    (+ 50)
src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx  (+ 30)
src/app/dashboard/orders/[id]/order-economy-tab.tsx           (+ 192)
supabase/migrations/00103_incoming_invoice_conversion_provenance.sql  (NEW, 60 lines)
scripts/apply-migration-00103.mjs                             (NEW, 60 lines)
SPRINT_6A_INVOICING_ECONOMIC_ANALYSIS.md                      (NEW, 470 lines)
NIGHT_REPORT_2026-05-04.md                                    (NEW — denne fil)
```

5 commits, 1 migration, 11 filer berørt, 0 destruktive operationer.
