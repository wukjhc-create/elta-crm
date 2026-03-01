# Plan: 5 Hovedopgaver — Marts 2026

## Status Oversigt

| # | Opgave | Prioritet | Estimeret kompleksitet |
|---|--------|-----------|----------------------|
| 1 | Live AO/LM søgning i Monteringstilbud | Høj | Stor |
| 2 | Færdiggør 'Opret kunde' i Mail | Medium | Lille |
| 3 | Aktivér Nagging To-Do pop-ups | Medium | Mellem |
| 4 | SMTP → Graph API (settings UI) | Lav | Lille |
| 5 | ENCRYPTION_KEY fix | Lav | Minimal |

---

## Opgave 1: Live AO/LM søgning i 'Nyt Monteringstilbud'

### Nuværende tilstand
- `QuoteLineItemsEditor` → `DescriptionInput` søger kun i **lokal** `supplier_products` tabel
- API-klienter eksisterer allerede: `AOAPIClient.searchProducts()` og `LMAPIClient.searchProducts()`
- Ingen produktbilleder vises noget sted
- Ingen kundespecifik pris sendes med fra mail-editoren

### Plan

**Trin 1.1 — Ny server action: `searchSupplierProductsLive()`** i `src/lib/actions/offers.ts`
- Modtager `query`, `supplierId?`, `customerId?`, `limit?`
- Kalder `SupplierAPIClientFactory.getClient()` → `searchProducts()` for hver aktiv leverandør
- Returnerer resultater med: `image_url`, `product_name`, `cost_price`, `list_price`, `unit`, `supplier_sku`, `supplier_name`, `is_available`, `stock_qty`, `delivery_days`
- Fallback til lokal DB-søgning hvis API fejler (eksisterende `searchSupplierProductsForOffer`)

**Trin 1.2 — Udvid `DescriptionInput` autocomplete**
- Tilføj toggle/tabs: "Lokal" vs "Live API" søgning
- Ved "Live API": kald `searchSupplierProductsLive()` i stedet
- Vis produktbillede (thumbnail) i dropdown hvis `image_url` er tilgængelig
- Vis leverandørnavn, varenummer, nettopris, vejledende pris, lagerstatus
- Send `customerId` med hvis emailen er koblet til en kunde

**Trin 1.3 — Udvid `QuoteLineItem` type**
- Tilføj `imageUrl?: string` og `supplierProductId?: string`
- Populér felterne ved valg fra live-søgning
- Vis thumbnail i linjeitem-rækken (lille billede ved siden af beskrivelse)

**Trin 1.4 — Tilpas PDF-generering** (valgfrit, fase 2)
- Inkludér produktbilleder i tilbuds-PDF hvis tilgængelige

### Filer der ændres
- `src/lib/actions/offers.ts` — ny action
- `src/app/(dashboard)/dashboard/mail/components/quote-line-items-editor.tsx` — UI
- `src/app/(dashboard)/dashboard/mail/components/quote-form-dialog.tsx` — evt. videregivelse af customerId

---

## Opgave 2: Færdiggør 'Opret kunde' i Mail-modulet

### Nuværende tilstand
- Knappen virker og kalder `createCustomerFromEmail(emailId)` korrekt
- **4 steder bruger `alert()`** i stedet for toast — dårlig UX
- Ingen loading-state eller double-click beskyttelse
- `createCustomerFromEmail` bruger gammel auth-pattern (`supabase.auth.getUser()`)
- Mangler UUID-validering på `emailId`
- Lead-insert har ingen fejlhåndtering

### Plan

**Trin 2.1 — Opdater `handleCreateCustomer` i `mail-client.tsx`**
- Erstat alle 4 `alert()` med toast-notifikationer
- Tilføj `isCreatingCustomer` loading-state
- Disable knappen under kørsel + vis spinner
- Vis success-toast med link til den nye kunde

**Trin 2.2 — Opdater `createCustomerFromEmail` i `incoming-emails.ts`**
- Skift til `getAuthenticatedClient()` pattern
- Tilføj `validateUUID(emailId, 'emailId')`
- Tilføj fejlhåndtering på lead-insert
- Returnér `customerName` i resultatet (til bedre toast-besked)

### Filer der ændres
- `src/app/(dashboard)/dashboard/mail/mail-client.tsx` — UI forbedringer
- `src/lib/actions/incoming-emails.ts` — server action cleanup

---

## Opgave 3: Aktivér Nagging To-Do pop-ups

### Nuværende tilstand
- `TaskReminderOverlay` er monteret globalt i dashboard layout ✅
- Poller hver 60 sekunder ✅
- **BUG**: `getUnreadPriceAlerts()` filtrerer på `alert_type = 'price_change'` — men cron skriver `'price_increase'`/`'price_decrease'`. Prisadvarsler vises ALDRIG.
- **BUG**: Task-dismiss er kun client-side (`Set<string>`) — forsvinder ved refresh
- `ftp-service.ts` skriver `'price_change'` som ikke er i `AlertType` typen

### Plan

**Trin 3.1 — Fix prisalarm-filter i `customer-tasks.ts`**
- Ændr `getUnreadPriceAlerts()` til at filtrere: `.in('alert_type', ['price_change', 'price_increase', 'price_decrease'])`
- Alternativt: normaliser `ftp-service.ts` til at bruge `'price_increase'`/`'price_decrease'`

**Trin 3.2 — Gør task-dismiss persistent**
- Tilføj `is_dismissed` og `dismissed_at` kolonner til `customer_tasks` (migration)
- Opdater `handleDismiss` til at kalde en ny server action `dismissCustomerTask(taskId)`
- Fjern client-side `dismissed` Set

**Trin 3.3 — Forbedre overlay UX**
- Tilføj lyd/vibration-notifikation for nye opgaver (valgfrit)
- Vis antal i sidebar-badge (notification count)
- Tilføj "Se alle opgaver" link til en opgaveside

### Filer der ændres
- `src/lib/actions/customer-tasks.ts` — fix filter + ny dismiss action
- `src/components/layout/task-reminder-overlay.tsx` — persistent dismiss
- `src/lib/services/ftp-service.ts` — normaliser alert_type (valgfrit)
- Ny migration: tilføj `is_dismissed`/`dismissed_at` til `customer_tasks`

---

## Opgave 4: Erstat SMTP med Microsoft Graph API (Settings UI)

### Nuværende tilstand
- Graph API er allerede den faktiske email-transport ✅
- Settings-siden viser stadig "SMTP Konfiguration" tab med 6 ubrugte felter
- "Test forbindelse" og "Send test" knapper er gated på `!smtpHost` — så de virker ikke uden at udfylde SMTP-felter (som ikke bruges)
- Alt email-sending bruger `sendEmailViaGraph()` fra `microsoft-graph.ts`

### Plan

**Trin 4.1 — Erstat SMTP-tab med Graph API info**
- Omdøb tab: "SMTP Konfiguration" → "E-mail Forbindelse (Microsoft Graph)"
- Fjern 6 SMTP input-felter og tilhørende state
- Vis read-only info: "E-mail sendes via Microsoft Graph API"
- Vis forbindelsesstatus (grøn/rød badge) via `testGraphConnection()`
- Vis konfigureret postkasse (`GRAPH_MAILBOX` / `crm@eltasolar.dk`)

**Trin 4.2 — Fix test/send knapper**
- Fjern `!smtpHost` guard fra begge knapper
- "Test forbindelse" kalder `testEmailConnectionAction()` direkte
- "Send test" kalder `sendTestEmailAction()` direkte
- Fjern `handleSaveSmtp` funktion og "Gem SMTP" knap

### Filer der ændres
- `src/app/(dashboard)/dashboard/settings/email/email-settings-client.tsx` — fuld omskrivning af tab 1

---

## Opgave 5: ENCRYPTION_KEY fix

### Nuværende tilstand
- `.env.local` har korrekt `ENCRYPTION_KEY=B9YHoa...` (base64) ✅
- `encryption.ts` læser `process.env.ENCRYPTION_KEY` korrekt ✅
- `.env.example` har FORKERT navn `SUPPLIER_ENCRYPTION_KEY` og forkert generation-instruktion (`-hex` i stedet for `-base64`)

### Plan

**Trin 5.1 — Fix `.env.example`**
- Omdøb `SUPPLIER_ENCRYPTION_KEY` → `ENCRYPTION_KEY`
- Ret instruktion: `openssl rand -hex 32` → `openssl rand -base64 32`

**Trin 5.2 — Verificér Vercel deployment**
- Sikr at `ENCRYPTION_KEY` er sat i Vercel environment variables
- Tilføj note i CLAUDE.md om korrekt variabelnavn

### Filer der ændres
- `.env.example` — ret variabelnavn + instruktion

---

## Anbefalet rækkefølge

1. **Opgave 5** (5 min) — Hurtig fix, eliminerer fremtidige forvirring
2. **Opgave 4** (30 min) — Rydder op i settings UI
3. **Opgave 2** (30 min) — Polerer eksisterende feature
4. **Opgave 3** (45 min) — Fixer bugs i reminder-systemet
5. **Opgave 1** (2-3 timer) — Største opgave, kræver live API integration

---

## Kendte risici

- AO/LM API endpoints er placeholder-URLs (`SUPPLIER_API_CONFIG`) — live integration kræver ægte API-dokumentation og credentials
- AO/LM API'erne returnerer muligvis ikke billede-URLs — skal verificeres mod faktisk API-response
- Nightly cron kører kun dagligt (Vercel Hobby) — prisadvarsler kan være op til 24 timer forsinkede
