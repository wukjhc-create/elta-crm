# Invoice Module — Status 2026-05-06

**Snapshot taget:** 2026-05-06 efter Sprint 6F-4
**Production HEAD:** `fde82a5` (docs commit oven på Sprint 6F-4 + hardening)
**Sprint-baggrund:** 6A (analyse) → 6B (faktura fra sag) → 6C (PDF + mail) → 6D (multi-stage forskud/rate/slut) → 6F-1..4 (kreditnota + annullering)

**Sprint 6F STATUS: ✅ LUKKET (2026-05-07)**
Browser-test bekræftet af Henrik 2026-05-07. Alle 5 test-scenarier (standard PDF, kreditnota PDF, annulleret original PDF, fakturaliste type-kolonne + annulleret-badge, kreditnota-detail uden betalingsknap) er verificeret. Modulet er produktionsklart internt. Næste sprint: 7 — RBAC / Permissions / Sag-scope (analyse i `SPRINT_7_RBAC_PERMISSIONS_ANALYSIS.md`).

---

## 1) Hvad invoice-modulet kan nu

Modulet er en intern, produktionsklar kunde-faktura-engine. Hele flowet kører på Supabase + Microsoft Graph mail uden e-conomic-binding. Det dækker fire faktura-typer (standard / forskud / rate / slutfaktura) og kreditnota med fuld revisionsspor.

### 1.1 Standard faktura
- Oprettes fra sag-detail under "Fakturakladde"-tab (`/dashboard/orders/[case_number]`)
- Vælg ufakturerede `time_logs` + `case_materials` + `case_other_costs`
- Kilderækkernes `invoice_line_id` låses så de ikke kan dobbelt-faktureres
- Status-flow: draft → sent → paid
- Slet kladde frigiver alle bundne kilderækker tilbage til "fakturerbar"

### 1.2 Forskud (deposit)
- `invoice_type='deposit'`, `billing_percentage`, `amount_basis` (`contract_sum` | `revised_sum`), `amount_basis_value`
- Linjer er fritekst (ikke bundet til kilderækker) — ingen materialer/timer låses
- Kan oprettes før der er booket noget på sagen
- PDF-strip: "Beregnes som X % af kontraktsum"

### 1.3 Rate (progress)
- Som forskud, men typisk gentagne (a conto) gennem projektets løbetid
- Ingen UNIQUE constraint — flere rater per sag tilladt
- Kan kombineres frit med forskud + slutfaktura

### 1.4 Slutfaktura (final)
- `is_final_invoice=true`, UNIQUE PARTIAL index sikrer kun én final per sag
- Trækker tidligere forskud + rater fra via `invoice_predecessors` junction
- Junction-rækker (deduction_amount) skrives som negative linjer i fakturaen
- PDF viser "Tidligere fakturaer fratrukket"-sektion med opslag per forgænger

### 1.5 Kreditnota (credit)
- `invoice_type='credit'`, `credit_of_invoice_id` (FK ON DELETE RESTRICT), `credit_reason`
- Linjer er negative (samme beløbsstørrelse som original eller delvis)
- Original faktura får `voided_at` sat **kun** når kreditnota-status flippes til 'sent' eller 'paid' (ikke ved draft)
- Self-healing: hvis draft kreditnota slettes, ryddes evt. stale `voided_at` automatisk
- Delvis kreditering muligt — `remaining_creditable_ex_vat` regnes ud fra finalized + reserved-i-draft

---

## 2) PDF

Single template (`src/lib/pdf/invoice-pdf-template.tsx`) brancher på `invoice_type` og `voided_at`.

### Standard faktura PDF
- Grøn brand-header "FAKTURA"
- KLADDE-watermark når status='draft'
- Sag-strip + kunde-blok + linjer + totaler
- Betalingsoplysninger (bank, reference, forfald) hvis `INVOICE_BANK_REG_NO` + `INVOICE_BANK_ACCOUNT` env er sat

### Forskud / Rate / Slutfaktura PDF
- Header viser stage-pille (FORSKUD / RATE / SLUTFAKTURA)
- Procent-strip "Beregnes som X % af kontraktsum/revideret beløb"
- Slutfaktura: "Tidligere fakturaer fratrukket"-tabel + total fradrag

### Kreditnota PDF (Sprint 6F-4)
- Rød brand-header "KREDITNOTA" (ikke FAKTURA)
- "Kreditnota nr." label + dokumenttitel = "Kreditnota X"
- Strip: "Kreditnota for faktura F-XXXX" (slås op fra `credit_of_invoice_id`)
- Refund-blok i stedet for Betalingsoplysninger:
  > "Kreditnotaen reducerer/udligner tidligere faktura. Eventuel refundering håndteres separat."
- Linjer + totaler er negative — formatteres naturligt med "-" i `formatCurrency`

### Annulleret original PDF (Sprint 6F-4)
- Rød "ANNULLERET" watermark fixed på alle sider
- Top-banner: "Fakturaen er annulleret via kreditnota."
- Vises kun når `voided_at IS NOT NULL` og fakturaen ikke selv er kreditnota
- Standard faktura PDF er **uændret** (ingen breakage)

### Skarpe-kanter
- Rendering bruger `getInvoicePdfPayload()` der laver alle DB-kald i én funktion
- Totals re-beregnes defensivt fra linjer (ikke kun fra header) for at undgå mismatch
- vat_rate udledes fra header (default 25 %)
- Alle PDF-routes har `force-dynamic` så caching ikke kan vise gamle versioner

---

## 3) Mail

Single skabelon (`src/lib/email/templates/invoice-email.ts`) med kreditnota-branch.

### Standard mail
- Subject: "Faktura X fra Elta Solar"
- Grøn brand-header "Tak for din ordre"
- Detalje-tabel: faktura nr, beløb, forfald, betalingsreference, bank-info
- PDF vedhæftet automatisk (best-effort: mail sendes selv hvis PDF fejler)

### Kreditnota mail (Sprint 6F-4)
- Subject: "Kreditnota X fra Elta Solar"
- Rød header
- Detalje-tabel: kreditnota nr, "Krediterer faktura F-XXXX", beløb, reference
- Ingen forfaldsdato, ingen bank-info, ingen "betal-reference"-instruktion
- PDF vedhæftet med kreditnota-styling

### Send-flow (`sendInvoiceEmail`)
- Idempotent: status='sent' eller `sent_at` populated → returnerer `already_sent`
- Skipper hvis ingen kunde-email
- Status flippes draft → sent kun ved succes (race-safe `.eq('status', 'draft')` guard)
- e-conomic push **springes over for kreditnotaer** (Sprint 6F-4 guard) — undgår at booke negative bilag forkert
- Logger til `system_health` med `invoice` og `economic` channels

---

## 4) Reminder-skip (Sprint 6F-4)

`getOverdueInvoices` filtrerer:
- `voided_at IS NULL`
- `final_amount > 0`
- `invoice_type IS NULL OR invoice_type != 'credit'`

`sendInvoiceReminder` har defense-in-depth — hvis kaldt direkte (fx fra automation rule-engine):
- voided → skip + log "voided"
- invoice_type='credit' → skip + log "credit_note"
- final_amount <= 0 → skip + log "final_amount<=0"

Cron kører dagligt 09:00 København (`0 9 * * *` i `vercel.json`).

---

## 5) DB guards / idempotency

Migrations (00080–00107):
- `invoices.invoice_number` UNIQUE
- `invoice_lines` har `source_*` FKs til kilderækker
- UNIQUE PARTIAL: `idx_invoice_lines_one_per_source_*` — én linje per (timer/materiale/øvrig)
- UNIQUE PARTIAL: `idx_invoices_one_final_per_case` — kun én final faktura per sag
- `invoice_predecessors` junction (M:N) for slutfaktura ↔ deposit/progress
- `invoices.voided_at` + `voided_by` (FK profiles ON DELETE SET NULL)
- `invoices.credit_of_invoice_id` FK med ON DELETE RESTRICT — kan ikke slette en faktura der har aktive kreditnotaer
- Race-safe updates via `.is(field, null)` og `.eq('status', oldStatus)`

---

## 6) Kendte begrænsninger

- **Refundering håndteres uden for systemet.** Når en kreditnota sendes, er det operatørens ansvar at lave selve pengeoverførslen (manuel bankoverførsel eller MobilePay). Refund-flow med automatisk track af "udbetalt dato" er ikke bygget.
- **Paid-status på kreditnota er ikke i brug endnu.** UI'et viser kun draft → sent for kreditnotaer; vi resetter ikke kunde-saldo automatisk. Det skal komme i refund-sprintet.
- **e-conomic binding er ikke aktiv.** `economic-client.ts` eksisterer som stub men kører kun hvis credentials er sat — pt. ikke. Standard faktura push er klar; kreditnota skipper bevidst (se §3).
- **Inbox / kundeportal-visning af fakturaer er ikke koblet til invoice-modulet.** Portalen viser tilbud, ikke fakturaer endnu.
- **Påmindelses-text i mailen er statisk** (3 niveauer i `invoice-reminder-email.ts`). Templates er ikke editerbare via UI.
- **Annulleret faktura kan ikke "gen-aktiveres".** Hvis du sletter draft-kreditnotaen og dermed clearer voided_at, er det fint — men hvis du sletter en sendt kreditnota (bevidst eller ved migration) skal du selv re-rydde voided_at i SQL.

---

## 7) Hvad der mangler før e-conomic kan bygges

1. **Credentials + sandbox-konto.** Henrik skal levere e-conomic API key + secret. Skal ligge i `ECONOMIC_API_KEY` + `ECONOMIC_AGREEMENT_GRANT_TOKEN` env.
2. **Mapping af konti.** Standard salgskonto, momskode, betalingsbetingelse, kundenummer-format. Pt. har vi kun `external_invoice_id` + `external_provider` placeholders.
3. **Kreditnota-mapping i e-conomic.** e-conomic har egen credit-note endpoint — vores `economic-client.ts` understøtter pt. kun standard.
4. **Webhook fra e-conomic** for "betalt"-status (auto-flip til paid).
5. **Konflikt-håndtering.** Hvad hvis e-conomic siger "OK" men vi mister forbindelsen før vi får external_invoice_id retur? Skal kunne resync.
6. **Test-flow mod e-conomic sandbox.** Sandbox-konto + scripted "create invoice → fetch → settle → reverse" cyklus.

---

## 8) Hvad Henrik skal browser-teste

### Test 1 — Standard faktura
1. Åbn en sag med ufakturerede timer/materialer
2. "Fakturakladde"-tab → mode "Almindelig" → vælg linjer → opret kladde
3. Åbn kladden → "Send faktura på mail" eller "Markér som sendt (uden mail)"
4. Verificér: status flips til sent, kilderækker vises som "låst" på sagen
5. "Markér som betalt" → status flips til paid
6. PDF: vis + download — verificér grøn header "FAKTURA", betalingsoplysninger, kunde-info

### Test 2 — Forskud + Slutfaktura
1. Åbn en sag med kontrakt-sum > 0
2. "Fakturakladde"-tab → mode "Forskud" → 30 % af kontraktsum → opret
3. Send forskud → status sent
4. Senere: mode "Slutfaktura" → vælg linjer + verificér "Tidligere fakturaer fratrukket" viser forskuddet
5. Send slutfaktura → PDF skal vise predecessor-tabel med fradrag

### Test 3 — Kreditnota draft (ingen annullering)
1. Åbn sendt faktura F-XXXX
2. Klik "Krediter faktura" → fuld kreditnota → reason "test"
3. Naviger tilbage til original
4. Verificér:
   - INGEN "Annulleret"-pille
   - Gul "Kreditnota-kladde"-pille i CreditStatusPanel
   - Gul advarsel-banner
   - "Markér som betalt" stadig synlig
5. Åbn kreditnotaen → "Vis PDF" → verificér rød "KREDITNOTA"-header + "Kreditnota for faktura F-XXXX"-strip

### Test 4 — Send kreditnota → original annulleres
1. På kreditnota-kladden → "Markér som sendt" eller "Send faktura på mail"
2. Naviger tilbage til original
3. Verificér:
   - Grå "Annulleret"-pille i header
   - Banner "Annulleret via kreditnota"
   - "Markér som betalt" + "Krediter faktura" forsvinder
4. "Vis PDF" på original → verificér rød "ANNULLERET"-watermark + top-banner
5. Mail-test: send kreditnota til en testkunde → verificér subject "Kreditnota X fra Elta Solar" + rød header + "Krediterer faktura F-XXXX"

### Test 5 — Slet draft kreditnota → self-heal
1. Opret draft kreditnota → original viser kreditnota-kladde-pille
2. Slet kreditnota-kladden
3. Verificér: original går tilbage til normal sent/paid (intet ANNULLERET)

### Test 6 — Reminder-skip
1. Find en gammel sendt + voided faktura, eller en kreditnota med forfald > 3 dage tilbage
2. Trigger cron manuelt: `POST /api/cron/invoice-reminders` med `Authorization: Bearer $CRON_SECRET`
3. Verificér i `invoice_reminders` tabel: ingen ny række for voided/credit fakturaer
4. Verificér i log: response viser checked > 0 men kun aktuelle aktive fakturaer talt med

### Test 7 — Faktura-liste sortering + badges
1. Åbn `/dashboard/invoices`
2. Verificér ny "Type"-kolonne med pille (Forskud/Rate/Slutfaktura/Kreditnota)
3. Verificér "Annulleret"-badge på status-kolonne for voidede fakturaer

---

## 9) Risici

- **Operatør glemmer at sende kreditnota.** Draft kreditnota holder original i "kreditnota-kladde-state" — ikke synlig nok? Heads-up er gul banner, men en push-notif eller dashboard-widget kunne være rart.
- **e-conomic er ikke aktivt.** Hvis vi skifter sambt det aktiveres uden at teste, kan ny pipeline fejle stille på kreditnotaer (vi har et eksplicit skip-guard, men det er sat for *send*-flow, ikke for *create*).
- **Påmindelses-text i mailen er ikke kreditnota-bevidst.** Reminder-mail bruger samme template uanset type — men vi skipper kreditnotaer fra cron, så det rammer ikke i praksis.
- **Linjer kan blive >9999.** `position SMALLINT` håndterer det, men UI begrænser pt. ikke. Lavprioritet.

---

## 10) Sammenfattet

Modulet er **funktionelt komplet** for intern Elta-brug uden e-conomic. Alle fire faktura-typer + kreditnota fungerer end-to-end. Reminder-cron, PDF, mail, og audit-trail er på plads. Det vigtigste der mangler før vi kan eksternalisere er:
1. e-conomic integration
2. Kundeportal-visning af fakturaer + betalingsstatus
3. Refund-flow på kreditnotaer

De to næste sprints bør analyseres separat — se `SPRINT_7A_CUSTOMER_PORTAL_OR_ECONOMIC_PREP_ANALYSIS.md`.
