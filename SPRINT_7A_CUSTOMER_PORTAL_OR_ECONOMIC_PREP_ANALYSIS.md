# Sprint 7A — Næste retning: kundeportal-fakturaer eller e-conomic prep

**Skrevet:** 2026-05-06 oven på Sprint 6F-4 hardening
**Snapshot HEAD:** `fde82a5`
**Audit:** økonomi-modul status (`INVOICE_MODULE_STATUS_2026-05-06.md`) + `src/lib/services/economic-client.ts` + `src/app/portal/**` + `src/components/modules/portal/portal-dashboard.tsx`

---

## Executive summary

Modulet er klar til ét af to næste skridt:

- **A) e-conomic prep uden credentials** — vi har et halvfærdigt `economic-client.ts` med stubs til invoice-create, customer-sync og settings-storage. Kan finpudses uden API-kald, men slutter med at vi sidder og venter på Henriks adgang.
- **B) Kundeportal-fakturaer** — portal-rammen findes (`/portal/[token]`), viser i dag tilbud + service-sager + dokumenter. Faktura-fanen mangler. Lavere risiko, mere brugersynligt resultat, og det fjerner et reelt internt scenarie (kunden ringer ind for "kan jeg lige få faktura X igen?").

**Anbefaling: B (kundeportal-fakturaer) først, derefter A.** Argumentation nedenfor.

---

## Option A — e-conomic prep uden credentials

### Hvad vi allerede har

`src/lib/services/economic-client.ts` (~600 linjer):
- `getEconomicSettings()` + `isEconomicReady()` reader fra `accounting_integration_settings`
- `loadReadySettings()` med skip-guard `ECONOMIC_NOT_CONFIGURED`
- `logAttempt()` til `accounting_sync_log`
- `createCustomerInEconomic()` (færdig)
- `createInvoiceInEconomic()` (delvis — stopper ved layoutNumber/paymentTermsNumber check)
- Idempotency: external_invoice_id + external_provider double-check
- HTTP-klient med dual-header auth, retry-logik

`src/lib/services/invoices.ts`:
- `sendInvoiceEmail` kalder `createInvoiceInEconomic` best-effort
- Sprint 6F-4 guard: kreditnotaer skipper e-conomic push

### Hvad der mangler i A

**Uden credentials kan vi:**
1. Færdiggøre `createInvoiceInEconomic` — finish layout/paymentTerms branching, kunde-mapping, linje-mapping, draft-vs-booked flow
2. Bygge `createCreditNoteInEconomic` (ny funktion) — bruger e-conomic's egen `creditNotes/drafts` endpoint
3. Bygge `registerPaymentInEconomic` — for når kunden betaler, push paid-status
4. Bygge `syncCustomerToEconomic` (allerede færdig — men test-coverage)
5. Lave UI på `/dashboard/settings/economic` til at indtaste credentials + teste connection
6. Skrive en sandbox-flow doc: "kør `apply-fake-invoice.mjs` mod sandbox når Henrik leverer keys"
7. Opbygge mapping-konfiguration: produkt-katalog → e-conomic-konti, momskoder, kundenummer-format

**Vi kan IKKE uden credentials:**
- Faktisk teste at koden virker mod e-conomic
- Verificere at vores linje-mapping passer til e-conomics product-mappings
- Bekræfte at vores VAT-håndtering matcher (e-conomic har egne VAT-zones)
- Vi vil have skrevet 500–1000 linjer kode der ikke kan validere

### Tidsestimat A
- **8–12 timers udvikling**
- **+ 4–6 timer integrationtest** når Henrik har credentials
- **+ Ukendt fejl-debug** — første reelle test mod e-conomic afslører altid mismatches

### Risiko A
- Vi skriver mange "antagelser" om e-conomics format. Hvis API'et er ændret siden REST-docs er sidst opdateret, kommer vi til at fixe det igen.
- Vi kan ikke teste idempotency-logikken i praksis.
- Hvis Henriks e-conomic-konto har specielle indstillinger (fx custom kontoplan), vil vi finde det ud af i fail-fasen.

---

## Option B — Kundeportal-fakturaer

### Hvad vi allerede har

`src/app/portal/[token]/page.tsx`:
- Token-baseret adgang via `validatePortalToken()`
- Kunde-side med `PortalDashboard` (`src/components/modules/portal/portal-dashboard.tsx`)
- Allerede koblet til offers, messages, documents, service_cases, fuldmagter
- Anon-safe Supabase-klient, ingen auth-required
- Eksisterende routing: `/portal/[token]/offers/[id]` for tilbudsdetail

`portal_access_tokens` + `portal_messages` tabeller med RLS

### Hvad der mangler i B

**1. DB / RLS**
- Ingen migration nødvendig — `portal_access_tokens.customer_id` er allerede der
- Tilføje RLS-policy på `invoices` + `invoice_lines` så portal-token (anon, men med customer_id i context) kan læse egne fakturaer
- Tilføje RLS-policy på `accounting_sync_log` (for at portal kan se betalingsstatus historik) — eller kun queries via server actions

**2. Server actions**
- `getPortalInvoices(token)` — list alle invoices hvor customer_id matcher session
- `getPortalInvoiceDetail(token, invoiceId)` — single invoice med linjer
- `getPortalInvoicePdf(token, invoiceId)` — re-bruge `/api/invoices/[id]/pdf` med portal-auth

**3. UI**
- Ny fane "Fakturaer" i `PortalDashboard` ved siden af "Tilbud"
- Liste med: faktura nr, type-pille, status, beløb, forfald, "Vis PDF"-knap
- Detail-modal eller egen route `/portal/[token]/invoices/[id]`
- Betalingsstatus med tydelig info: "Betalt 14. apr 2026" / "Forfalden — kontakt Elta" / "Annulleret"
- Kreditnota-visning med rød pille + "Refundering pågår"-tekst (manuel håndtering)

**4. PDF-route auth**
- Pt. kræver `/api/invoices/[id]/pdf` authenticated user
- Ny variant: `/api/portal/[token]/invoices/[id]/pdf` der validerer token først
- Eller: signed URLs med kort levetid (15 min) genereret server-side

**5. Mail-link**
- I invoice-mail kunne vi tilføje "Se faktura i kundeportalen" CTA-knap → `/portal/[token]/invoices/[id]`
- Forudsætter portal_access_token er aktiv for kunden

### Tidsestimat B
- **6–8 timers udvikling** (mest UI + RLS-policies)
- **+ 1–2 timer browser-test**
- **Ingen eksterne afhængigheder** — kan leveres komplet i ét sprint

### Risiko B
- RLS-policies skal være vandtætte — fejlkonfiguration kan eksponere fakturaer på tværs af kunder
- Token-revoke flow skal tested (hvis token udløber, må kunden ikke se sin gamle faktura)
- PDF-route auth skal være race-safe (signed URL skal udløbe selv hvis tokenen er aktiv)

---

## Sammenligning

| Kriterium | A (e-conomic prep) | B (Kundeportal-faktura) |
|---|---|---|
| **Eksterne dependencies** | Henriks credentials | Ingen |
| **Test-mulighed nu** | Ingen | Fuld browser-test |
| **Kundeoplevelse** | Forbedrer ikke kundens hverdag | Stort plus — kunden får self-service |
| **Operativ værdi** | Først ved go-live | Med det samme |
| **Risiko for omarbejde** | Høj (test mod sandbox kan ændre design) | Lav (RLS + UI er kendt territorium) |
| **Tidsestimat** | 8–12t + 4–6t test (blokeret) | 6–8t + 2t test (komplet) |
| **Direkte forbinder til 6F-4** | Nej | Ja — kreditnota + voided er nu visbare for kunden |

---

## Anbefaling

**Start med B (kundeportal-fakturaer).**

Begrundelse:
1. **Ingen eksterne blokere.** Vi kan levere komplet i et enkelt sprint og give Henrik noget at vise frem.
2. **Builder ovenpå 6F-4.** Vi har lige bygget kreditnota + ANNULLERET watermark. Portal-visning af de samme fakturaer fuldender feedback-loopet til kunden.
3. **Test-coverage er muligt.** RLS-policies kan testes mod faktiske kunder.
4. **e-conomic prep risikerer 50% omarbejde** når credentials kommer — vi spilder tid på at gætte API-format.
5. **Kunden vil have det.** "Kan jeg lige få faktura X igen?" er et reelt internt smerte-punkt der løses med portalen.

### Foreslået scope for Sprint 7A (kundeportal-fakturaer)

**Phase 1 — Read-only invoice-list i portal**
1. RLS-policy: portal_access_tokens kan læse invoices + invoice_lines hvor customer_id matcher
2. Server actions: `getPortalInvoices`, `getPortalInvoiceDetail`
3. Ny "Fakturaer"-fane i PortalDashboard
4. Liste-UI med type-pille + status + beløb + forfald

**Phase 2 — PDF-adgang via token**
5. Ny route `/api/portal/[token]/invoices/[id]/pdf` der validerer token
6. "Vis PDF" + "Download PDF"-knapper i portal-detail
7. Mail-CTA: tilføj portal-link i invoice-emails

**Phase 3 — Kreditnota-bevidsthed (Sprint 6F-4 follow-up)**
8. Annullerede fakturaer vises grayed-out med "Annulleret"-pille
9. Kreditnotaer vises med rød pille + "Refundering håndteres separat"-tekst
10. Linker mellem original og kreditnota i portalen

### Hvad e-conomic prep (A) skal vente på

- Henrik leverer e-conomic API key + agreement grant token
- Sandbox-konto opsat
- Mapping af kontoplan + momskoder besluttet

Når dem er på plads → prep + sandbox-test (kan så være Sprint 7B).

---

## Hvad denne analyse IKKE besluttede

- Om kundeportalen skal have **chat-besked om faktura** (eksisterende `portal_messages` kunne bruges, men det åbner et nyt scope)
- Om **MobilePay-integration** skal komme før eller efter e-conomic
- Om vi skal lave en **mobilvenlig PWA-shell** for portalen (ny scope)

Disse er ikke blokerende for Sprint 7A.
