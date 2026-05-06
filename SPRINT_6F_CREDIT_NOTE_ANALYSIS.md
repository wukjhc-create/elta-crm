# Sprint 6F — Kreditnota / annullering / korrektion Analyse

**Snapshot:** 2026-05-06
**HEAD:** `0a1d262` (Sprint 6D komplet)
**Audit basis:** filsystem + læsning af mig 00080 + 00104 + 00105 + 00106 + Sprint 6B/6C/6D-kode + live schema/rowcount via Supabase Management API.
**Scope:** Kun analyse + plan. Ingen kode-/DB-ændringer.

---

## Executive summary

Vi har 4 distinkte korrektion-scenarier som ALLE skal håndteres separat — én "credit-knap" dækker dem ikke. Per scenarie:

| Scenarie | Status nu | Hvad mangler |
|---|---|---|
| **Annuller draft** | `deleteInvoiceDraft` (Sprint 6B-4) virker | Intet — dækket. |
| **Kreditnota (full)** på sendt/betalt faktura | `invoice_type='credit'` reserveret i CHECK + TS-typer | Service, UI, link-tabel, status-flow, PDF-template |
| **Delvis kreditnota** (én linje + et nyt beløb) | Ikke understøttet | Specielt: linje-niveau valg + delbeløbs-håndtering |
| **Korrektion via ny faktura** (kreditér + opret ny) | Ikke understøttet | Wizard-flow der laver begge i én transaktion |

**Krav fra dansk lov + e-conomic:**
- Sendt/betalt faktura kan **aldrig** slettes — kun krediteres med ny faktura-række (kreditnota har eget unikt nummer i samme F-YYYY-NNNN-sekvens).
- Kreditnota refererer eksplicit til original faktura (1:1, 1:flere) for revision/audit.
- Total = negativt beløb (eller positiv credit-amount markeret som "kredit" i e-conomic).
- Status-flow er ortogonalt på original-fakturaen (kreditnota har egen status; original-faktura får et `credit_status`-felt eller flag).

**Anbefaling:** byg Sprint 6F i 4 commits (mig + service + UI + PDF) som lægger sig direkte oven på 6D-modellen — `invoice_type='credit'` er allerede i CHECK, `invoice_lines` accepterer negative tal (bevist i 6D-2), `invoice_predecessors` kan genbruges som relations-tabel.

---

## 1. Hvad findes allerede til credit?

| Element | Status | Detalje |
|---|---|---|
| `invoice_type='credit'` | ✅ Reserveret i CHECK constraint (mig 00105) | `invoices_invoice_type_check`: `IN ('standard','deposit','progress','final','credit')` |
| TS-types `'credit'` | ✅ I `InvoiceRow.invoice_type` + `InvoiceType` i invoice-stage | Ingen kode-stier producerer eller forbruger den endnu |
| Negative invoice_lines | ✅ Verificeret virker (Sprint 6D-2 final-flow) | Ingen CHECK-constraint på `quantity`/`total_price` |
| `invoice_predecessors` junction | ✅ Eksisterer (mig 00106) | Designet til "slutfaktura → forskud/rate"-relation. Kan **genbruges** for "kreditnota → original" |
| `deleteInvoiceDraft` service | ✅ Sprint 6B-4 | Fjerner kun status='draft'. Korrekt. |
| Status-flow `draft → sent → paid` | ✅ enforces i `setInvoiceStatus` | **Mangler** "voided"/"credited"-state for original-faktura |
| `accounting_sync_log` | ✅ Phase 5.4 | Klar til at logge kreditnota-push når 6E lander |
| Reminder-cron | ✅ Phase 5.1 | **Mangler** filter: ingen rykker på krediteret faktura |

### Hvad mangler

| # | Mangler | Lokation |
|---|---|---|
| 1 | `credit_of_invoice_id` eller relations-row der peger fra kreditnota til original | DB |
| 2 | `credit_status` + `credit_amount` på original-faktura (eller derived view) | DB / service |
| 3 | Service `createCreditNoteForInvoice(invoiceId, options)` | service |
| 4 | UI: knap "Krediter denne faktura" på detail-side når status≥sent | UI |
| 5 | UI: wizard for delvis kreditnota (vælg linjer / vælg beløb) | UI |
| 6 | UI: korrektion-flow (kreditér + opret ny i én session) | UI |
| 7 | PDF-template viser "KREDITNOTA"-pille (rød) + reference til original | PDF |
| 8 | Reminder-cron skipper krediterede fakturaer | cron-fil |
| 9 | Sletning af original-faktura (sent/paid) blokeres når `credit` peger på den | DB FK |
| 10 | e-conomic-mapping (defereres til 6E hvor de kan koordineres) | service |

---

## 2. Hvad mangler i DB

### Foreslåede DDL-ændringer (additivt — Sprint 6F-1)

**Option A: Ny relations-kolonne på `invoices`**

```sql
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_of_invoice_id UUID
    REFERENCES invoices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_of
  ON invoices(credit_of_invoice_id)
  WHERE credit_of_invoice_id IS NOT NULL;
```

Pros:
- Simpel 1:1 — kreditnota → én original
- Hurtig lookup "hvilke kreditnotaer findes på denne faktura?" via index
- ON DELETE RESTRICT beskytter audit-trail (kan ikke slette en faktura der er krediteret)

Cons:
- Begrænser til 1:1 (kreditnota refererer til netop én original)
- Hvis vi vil have 1:flere (én kreditnota dækker flere fakturaer) skal vi senere bruge junction

**Option B: Genbrug `invoice_predecessors` som M:N junction**

```sql
-- Allerede eksisterer (mig 00106). Schema fits perfectly:
-- invoice_id           = kreditnotaen (barnet)
-- predecessor_invoice_id = original-fakturaen (forælder)
-- deduction_amount       = krediteret beløb (vi kan reuse feltet)
```

Pros:
- 0 schema-ændringer
- Konsistent model med slutfaktura-flow (samme junction = samme tabel)
- Tillader 1:N hvis Elta nogensinde laver én kreditnota mod flere fakturaer

Cons:
- Mindre opdagelig (operatør skal forstå at junction-tabel også bruges til credit, ikke kun final)
- "deduction_amount" navngivning er suboptimal til credit-kontekst (men feltet er tomt og kan reuses)

**Anbefaling: HYBRID — Option A + dobbelt-skrive til invoice_predecessors**

```sql
-- 6F-1 migration:

ALTER TABLE invoices
  -- Hurtig lookup uden join. NULL for ikke-credit invoices.
  ADD COLUMN IF NOT EXISTS credit_of_invoice_id UUID
    REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Hvorfor blev den krediteret? Frit tekst for revisor-spor.
  ADD COLUMN IF NOT EXISTS credit_reason TEXT,

  -- "Voided" markør: når en sent/paid faktura er fuldt krediteret,
  -- må operatør flage den som "tilbagetrukket" så reminder-cron
  -- skipper den.
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_of
  ON invoices(credit_of_invoice_id)
  WHERE credit_of_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_voided
  ON invoices(voided_at)
  WHERE voided_at IS NOT NULL;
```

Service-laget skriver **både** `credit_of_invoice_id` (fast 1:1) og en row i `invoice_predecessors` (audit-trail i samme tabel som final-fakturaer). Pdf'en og UI'et læser kun `credit_of_invoice_id` — predecessors er sekundært.

---

## 3. Skal kreditnota være en invoice-row med invoice_type='credit'?

**Ja.** Begrundelser:

1. **Lov-mæssigt:** dansk fakturalov kræver at hver kreditnota har eget unikt fakturanummer i samme sekvens (F-YYYY-NNNN). En invoice-row giver det automatisk via `allocate_invoice_number()`.

2. **Audit-trail:** alle korrektioner skal kunne genfindes i samme tabel som originaler. Ingen "skygge-tabel" der kan komme i utakt.

3. **e-conomic:** e-conomic's API skelner mellem invoice (positivt beløb) og credit-note (negativt) — begge har `invoiceNumber` + `customerNumber` + lines. 1:1-mapping mod en `invoices`-row er trivielt.

4. **PDF + lifecycle:** kreditnota har samme behov som faktura — kunde-info, linjer, totals, send-mail, mark paid (når kunden refunderer). Genbrug af alt 6B/6C/6D-flow er rent.

5. **Vi har allerede CHECK + types klar.** `invoice_type='credit'` er reserveret i mig 00105.

---

## 4. Hvordan kobles kreditnota til original faktura?

Per anbefaling i §2:

- **Primær link:** `invoices.credit_of_invoice_id UUID` (FK ON DELETE RESTRICT)
- **Sekundær link:** row i `invoice_predecessors`-junction med `predecessor_invoice_id = original`, `invoice_id = kreditnota`, `deduction_amount = krediteret beløb`

UI viser:
- På original-faktura: panel "Krediteret af" med liste over kreditnotaer (hvis flere er udstedt mod samme faktura — fx delvise)
- På kreditnota: panel "Kreditnota for" med link til original
- I `service_cases` Økonomi-tab: rolup viser net-beløb (faktureret − krediteret)

Status-flow på kreditnota:
- `draft → sent → paid` (samme som invoice — paid betyder kunden har modtaget refundering)

Status på original (kun ved fuld kreditering):
- Sæt `voided_at = now()`, `voided_by = userId`
- Hvis original.status='sent' og fuldt krediteret: reminder-cron skipper
- Hvis original.status='paid' og fuldt krediteret: payment_status reverteres ikke (vi har stadig modtaget pengene; kreditnota repræsenterer en separat refundering)

---

## 5. Hvordan undgås dobbelt-kreditering?

Tre lag:

### Lag 1 — DB

```sql
-- Sum af credit_amounts mod én original kan ikke overstige original.final_amount.
-- Håndhæves via service (ikke DB CHECK fordi kontrol kræver SUM).

-- Idempotency på FK fra kreditnota → original:
-- credit_of_invoice_id UNIQUE er IKKE løsningen — fordi en delvis
-- kreditnota kan blive efterfulgt af endnu en delvis kreditnota mod
-- samme original. Vi skal tillade flere.

-- Til gengæld: ON DELETE RESTRICT på FK forhindrer at original slettes
-- mens en kreditnota peger på den.
```

### Lag 2 — Service

```ts
async function createCreditNoteForInvoice(originalId, options) {
  const original = await fetch invoice
  if (original.status === 'draft') throw 'Kladde — brug deleteInvoiceDraft'
  if (original.invoice_type === 'credit') throw 'Kreditnota kan ikke selv krediteres'

  const existingCredits = sum(invoices.final_amount WHERE credit_of_invoice_id = originalId)
  const remaining = original.final_amount - existingCredits

  const requested = options.amount ?? remaining
  if (requested > remaining) {
    throw `Maks ${remaining} kr kan stadig krediteres (${existingCredits} kr allerede krediteret)`
  }
  // ...opret kreditnota med invoice_type='credit', credit_of_invoice_id, lines (negative)
}
```

### Lag 3 — UI

- Detail-side viser "Allerede krediteret X kr af Y kr" → operatør kan ikke vælge mere end remaining
- Disabled "Krediter"-knap når sum credits = original.final_amount

---

## 6. Hvordan håndteres moms?

**Dansk lov:**
- Kreditnota skal indeholde **samme momssats** som original (typisk 25 %)
- Moms på kreditnota fratrækkes virksomhedens momsregnskab i samme periode som kreditnotaen udstedes
- Kunden trækker moms tilbage i deres eget regnskab

**Implementering:**
- Kreditnota har samme moms-struktur som faktura (linje-baseret, 25 % default)
- Total = `subtotal × 1.25` med subtotal som **negativt beløb**
- PDF viser:
  ```
  Subtotal:        -X,XX (negativ)
  Moms 25 %:       -X,XX (negativ)
  Total inkl. moms:-X,XX (rød/fed)
  ```
- e-conomic understøtter "credit-note"-mode via `entryType: 'creditNote'` på draft-API'et — automatisk håndtering af moms-fortegn på deres side

**Speciel case — delvis kreditering:**
- Operatør indtaster `credit_amount = 1000 kr` (fx ud af 5000 kr original)
- Service beregner moms-andel: `subtotal = 1000 / 1.25 = 800`, `vat = 200`
- Eller: operatør vælger linje fra original og krediterer linjens beløb 1:1
- I begge tilfælde fungerer eksisterende `getInvoicePdfPayload`'s defensive recompute

---

## 7. Hvordan skal PDF vise kreditnota?

```
KREDITNOTA — Kreditnota for F-2026-0007
[ KREDITNOTA ] (rød pille — STAGE_PILL_LABEL.credit)

Faktura nr.
F-2026-0010 (kreditnota)
                                            Elta Solar
                                            ...

Fakturadato: 6. maj 2026
                                  ⚠ Krediteret faktura: F-2026-0007 (sendt 1. maj 2026)

[ Faktureres til kunde-boks — uændret ]

[ Sag-strip — uændret ]

[ Procent-strip skjules — credit har ingen basis-procent ]

[ Linjer-tabel — alle linjer er negative ]
1  Kredit: Solpanel 425W      -8 stk  -1875,00  -15.000,00
2  Kredit: Timer (12.5 t)    -12.5 t   -650,00   -8.125,00
3  Kredit: Kørsel             -240 km    -4,50   -1.080,00

[ Predecessor-sektion vises som "Krediteret faktura" ]
Krediteret faktura
| Faktura nr | Type    | Status | Krediteret beløb |
| F-2026-0007| Standard| paid   | -24.205,00       |
[ Total kreditering: -24.205,00 ]

Subtotal:        -24.205,00
Moms 25 %:        -6.051,25
[ TOTAL INKL. MOMS  -30.256,25 ]    ← rød tekst på rød-tonet baggrund

Begrundelse: "Forkert antal solpaneler — annulleres helt og genfaktureres"
```

PDF-template-ændringer (alt conditional på `invoice_type='credit'`):
1. Title: "KREDITNOTA" i stedet for "FAKTURA" (eller "FAKTURA — Kreditnota")
2. Stage-pille: rød `KREDITNOTA` (STAGE_PILL_LABEL.credit findes allerede i 6D-4 men er ubrugt)
3. Header info-linje: "Krediteret faktura: F-XXXX (status)"
4. Predecessor-sektion: rebrandet som "Krediteret faktura" (samme struktur, anden heading)
5. Totals: rød farve på final-amount (visuelt skel fra normal faktura)
6. `credit_reason` vises i bunden (linket til Note-blok) hvis sat

**Original-faktura PDF får også:**
- Lille banner i header: "⚠ Denne faktura er krediteret af F-XXXX"
- "VOIDED"-watermark hvis fuldt krediteret (analogt til "KLADDE"-watermark for drafts)

---

## 8. Hvordan skal UI fungere?

### Detail-side `/dashboard/invoices/[id]` udvidelser

**Status='draft' (uændret):** Slet kladde — eksisterende `deleteInvoiceDraft` virker.

**Status='sent' eller 'paid' og IKKE krediteret:**
- Ny knap: 🔴 **"Krediter faktura"** (kun synlig for admin/serviceleder; gating samme som send-knap)
- Klik åbner **CreditNoteWizard**-dialog:
  - Mode 1: **Fuld kreditering** — checkbox "krediter alle linjer i fuld" → kreditnota = -total
  - Mode 2: **Delvis kreditering med linje-valg** — tabel med originalens linjer + checkbox + edit-quantity per linje → kreditnota linjer er kopier (negative) af valgte
  - Mode 3: **Beløbs-baseret kreditering** — operatør indtaster ét beløb (fx 1000 kr) → service genererer én linje "Kredit (begrundelse)" med negativt beløb
  - Felt: `credit_reason` (påkrævet, vises på PDF)
  - Footer: subtotal / moms / total (negative i rød)
  - Submit → `createCreditNoteForInvoice` → redirect til kreditnota-detail

**Status='sent' eller 'paid' og delvis krediteret:**
- "Krediter faktura"-knap stadig synlig hvis `existing_credits < final_amount`
- Banner øverst: "X af Y kr er krediteret. Y-X kr resterer."

**Status='sent' eller 'paid' og fuldt krediteret (`voided_at` sat):**
- "Krediter faktura"-knap **skjult** (eller disabled med "Allerede fuldt krediteret")
- Banner: "Denne faktura er fuldt krediteret. Se kreditnota: F-XXXX"
- Status-pille får ekstra grå "VOIDED"-pille

### Korrektion-flow (mode 4)

På detail-side: ekstra knap **"Krediter og opret ny faktura"**:
1. Klik → confirm dialog
2. Service kører i transaktion:
   - Opretter fuld kreditnota mod original
   - Opretter NY faktura-kladde med samme linjer som original (operatør kan editere bagefter)
   - Returnerer begge ID'er
3. Browser navigerer til den nye faktura-kladde (operatør kan rette og sende)

### På `/dashboard/orders/[id]` Økonomi-tab

- Nyt felt: **"Heraf krediteret"** = sum af `final_amount` på kreditnotaer på sagen
- **"Netto faktureret"** = `total_invoiced - total_credited`
- Quality flag: "Faktura uden status" hvis original=sent og kreditnota=draft (operatør glemte at sende kreditnotaen)

---

## 9. Hvordan påvirker det e-conomic senere (Sprint 6E)?

e-conomic's REST API understøtter kreditnotaer direkte:
- `POST /invoices/drafts` med `entryType: 'creditNote'` (i stedet for `entryType: 'invoice'`)
- Linjer er negative
- Reference til original via `relatedInvoice` JSON-felt — vi sender `original.external_invoice_id` (når 6E er konfigureret)

**Sprint 6E skal udvides for at understøtte:**
- I `createInvoiceInEconomic`: branch på `invoice.invoice_type === 'credit'`
- Hvis credit: send som credit-note, inkluder `credit_of_invoice_id → original.external_invoice_id`
- Hvis original ikke er pushet til e-conomic endnu: fail fast med "Original skal pushes først"
- Audit-log per credit-push i `accounting_sync_log` med `action='credit_pushed'`

**Sprint 6F gør INTET med e-conomic.** Vi bygger kun internt flow — e-conomic-mapping er 6E's ansvar.

---

## 10. Anbefalet Sprint 6F-plan

### 6F-1: Migration 00107 — credit-felter

```sql
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_of_invoice_id UUID
    REFERENCES invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS credit_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_of
  ON invoices(credit_of_invoice_id) WHERE credit_of_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_voided
  ON invoices(voided_at) WHERE voided_at IS NOT NULL;
```

**0.5 dag.** Vis SQL → godkend → kør → verificér → commit kun migration.

### 6F-2: Service-lag

`src/lib/services/invoice-credit.ts` (NEW):
- `createCreditNoteForInvoice(originalId, input)` — bygger kreditnota, allokerer nyt nummer, INSERT'er negative linjer, links via både `credit_of_invoice_id` + `invoice_predecessors`
- `getCreditedAmountForInvoice(originalId)` → number — sum af kreditnotaer
- `voidInvoice(invoiceId, userId)` — sætter `voided_at` når fuldt krediteret (kaldes automatisk hvis sum credits = total)

Server actions i `src/lib/actions/invoices.ts`:
- `createCreditNoteAction`
- `getCreditSummaryAction`

**1.5 dag.** Idempotens-guards + dobbelt-credit-check.

### 6F-3: UI — CreditNoteDialog + buttons

`src/app/dashboard/invoices/[id]/credit-note-dialog.tsx` (NEW):
- Mode-vælger: Fuld / Delvis-linjer / Delvis-beløb
- Linje-tabel med checkboxes + edit (mode delvis-linjer)
- Beløb-input med live-validering mod remaining (mode delvis-beløb)
- `credit_reason` påkrævet
- Live preview: subtotal / moms / total i rødt

Detail-side opdateringer:
- "Krediter faktura"-knap (admin gate)
- "Krediter og opret ny"-knap (korrektion-flow)
- "Krediteret af"-panel når `voided_at` eller credits findes
- "Kreditnota for"-panel når `invoice_type='credit'`

**1.5 dag.**

### 6F-4: PDF + e-conomic-prep

PDF-template:
- Title-branch på `invoice_type='credit'` → "KREDITNOTA"
- Rød pille
- Header info: "Krediteret faktura: F-XXXX"
- Totals i rød
- `credit_reason` i note-blok
- Original-PDF: "VOIDED"-watermark hvis fuldt krediteret + banner

Reminder-cron (`/api/cron/invoice-reminders`):
- Skip invoices med `voided_at IS NOT NULL`

**1 dag.**

### 6F-5: Økonomi-tab udvidelse

`getServiceCaseEconomy`-action:
- Nyt felt `total_credited`
- Quality flag for ulukket kreditnota-flow

Detail-tab UI:
- Vis "Netto faktureret" = `total_invoiced − total_credited`

**0.5 dag.**

### Total estimat

**5 dage** + browser-test.

---

## 11. Risici

| Risiko | Sandsynlighed | Mitigering |
|---|---|---|
| **Operatør krediterer for meget** (over original.final_amount) | Mellem | Service summer existing credits + afviser. UI viser remaining. |
| **Dobbelt-credit på samme linje** ved delvis kreditering 2 gange | Mellem | Vi tracker IKKE per linje (kun per faktura-totaler). Operatør har ansvar. Quality flag på Økonomi-tab fanger total-uoverensstemmelser. |
| **Kreditnota oprettet på en forskudsfaktura/rate** | Lav | Tilladt teknisk. Service tjekker `invoice_type` og advarer hvis det er deposit/progress/final ("dette er ikke en standard-faktura — er du sikker?"). Ikke blokerende. |
| **Kreditnota selv-kreditteres** | Lav | Service nægter `invoice_type='credit'` som original. |
| **Sletning af original mens credit findes** | Lav | DB ON DELETE RESTRICT på `credit_of_invoice_id`. Operatør får klar fejl. |
| **Reminder-cron sender rykker på krediteret faktura** | Mellem | Cron-filter `WHERE voided_at IS NULL` tilføjes i 6F-4. |
| **Moms-fortegn forkert i PDF** | Lav | Defensive recompute i `getInvoicePdfPayload` — totals afledes fra linjer. Negative linjer giver negative totaler automatisk. |
| **e-conomic-relation mangler** ved senere push | Mellem | 6E gør branch på `invoice_type='credit'` og bruger `relatedInvoice = original.external_invoice_id`. Hvis original ikke pushet, fail fast. |
| **Kreditnota mod en sag der er afsluttet** | Lav | Tilladt — kreditnotaer skal kunne udstedes længe efter levering. Sag-status er ortogonal på faktura-status. |
| **Backwards-compat med 6B/6C/6D** | Lav | Alt additivt. Standard/deposit/progress/final-flows uændret. `invoice_type='credit'` er allerede i CHECK siden 6D-1. |
| **Operatør forsøger at "krediter" en kladde** | Lav | UI viser ikke knappen på drafts. Service nægter `status='draft'` og henviser til `deleteInvoiceDraft`. |

---

## 12. Acceptkriterier — Sprint 6F

Sprint 6F er færdig når **alt** af følgende er sandt:

1. **Migration 00107 anvendt:** 4 nye felter (`credit_of_invoice_id`, `credit_reason`, `voided_at`, `voided_by`) + 2 indexes.
2. **Service `createCreditNoteForInvoice`** virker for alle 3 modes (fuld / delvis-linjer / delvis-beløb).
3. **Idempotens:** dobbelt-credit afvises på service-niveau med tydelig fejl.
4. **UI: "Krediter faktura"-knap** synlig på status='sent'/'paid' fakturaer for admin/serviceleder.
5. **CreditNoteDialog** med mode-vælger + live preview + reason-felt.
6. **"Krediter og opret ny"-flow** virker (creates credit + new draft i ét submit).
7. **Detail-side viser:**
   - "Krediteret af X kr / Y kr" banner på original
   - "Kreditnota for F-XXXX" panel på kreditnota
   - Disabled credit-knap når fuldt krediteret
8. **PDF rendering:**
   - Kreditnota: KREDITNOTA-titel, rød pille, "Krediteret faktura: F-XXXX", røde negative totaler, reason
   - Original (fuldt krediteret): VOIDED-watermark + banner
9. **Reminder-cron skipper voided fakturaer.**
10. **Økonomi-tab på sagen viser** `total_credited` + `netto_invoiced`.
11. **DB sletning af original blokeres** når kreditnota peger på den.
12. **Type-check + build clean. Vercel deploy Ready.**
13. **Browser-test:** opret faktura → send → opret fuld kreditnota → verificér VOIDED på original + PDF korrekt + reminder-cron skipper.
14. **Ingen e-conomic-push i 6F.** (Wires til 6E hvis 6E er klar; ellers logger `skipped`.)

---

## 13. Hvad denne analyse bevidst IKKE har gjort

- Ingen kodeændringer
- Ingen DB-ændringer
- Ingen migrations udført
- Ingen e-conomic-payload-design (defereres til 6E)
- Ingen kreditnota-shop-flow (rabatter, ophør af abonnement) — kun klassisk kreditnota mod fejl
- Ingen automatisk kreditnota ved bank-match-uoverensstemmelse — kommer som separat fremtid

Repo er på `0a1d262` på `main`. Ingen filer modificeret under analysen.

---

## 14. Næste skridt

Hvis Henrik godkender denne plan:

**Sprint 6F-1 commit 1:** migration 00107. SQL vises før den køres, per CLAUDE.md.

Hvis du vil ændre rækkefølge:
- **Skip korrektion-flow ("krediter og opret ny")?** OK — det er en bekvem-feature, ikke en kerne. Spar 0.5 dag.
- **Skip delvis-beløbs-mode?** Anbefales ikke — operatør har det ofte hvor de vil kreditere et runde-tal uden at tænke linjer.
- **Springe direkte til 6E (e-conomic) først?** Muligt. 6F kan landes efter — kreditnota internt fungerer uden e-conomic. Begge sprint kan landes ortogonalt.

**Min anbefaling:** byg 6F først (5 dage internt, ingen ekstern afhængighed), derefter 6E (når Henrik har sandbox-credentials). Det giver Elta et fuldt fungerende kreditnota-flow internt før e-conomic kobles på.
