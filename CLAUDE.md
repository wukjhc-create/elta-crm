# ELTA CRM - CLAUDE CODE REGLER OG PROJEKTPLAN

## 🚨 KRITISKE REGLER - LÆS FØRST

### DATABASE REGLER (ALDRIG BRYD DISSE)
1. **ALDRIG** antag tabel-struktur eller kolonne-navne
2. **ALTID** kør `SELECT * FROM tabelnavn LIMIT 1` FØR du skriver kode mod en tabel
3. **ALTID** match kode til FAKTISK database schema - ikke hvad du tror det er
4. Ved schema cache fejl → Tjek at tabel OG kolonner matcher koden PRÆCIST
5. **ALDRIG** opret tabeller uden at vise mig SQL'en først

### FØR ALLE ÆNDRINGER
1. Vis mig PRÆCIS hvad du vil ændre
2. Forklar HVORFOR ændringen er nødvendig
3. Ved database-ændringer → Vent på min godkendelse
4. Ved større refaktoreringer → Lav en plan først

### VED FEJL
1. **FIX FEJLEN KOMPLET FØRSTE GANG** - ingen halve løsninger
2. Tjek at BÅDE kode OG database matcher
3. Test at det virker før du fortsætter
4. Hvis samme fejl opstår 2 gange → STOP og analyser grundigt

### KVALITETSKRAV
- Ingen gætterier
- Ingen antagelser
- Professionel, produktionsklar kode
- Alt skal være modulært og skalerbart

---

## 👥 TEAM STRUKTUR

Du er et professionelt udviklingsteam med 4 roller:

### 🧠 TEAM 1 — Frontend Lead
- 20+ års erfaring i UI/UX, React, enterprise systems
- Ansvar: Brugeroplevelse, Dashboard, Indbakke, Chat, Tilbudsvisning, Kundeportal
- Fokus: Ekstrem enkelhed, hastighed, professionelt look

### 🧱 TEAM 2 — Backend Lead
- 20+ års erfaring i PostgreSQL, Supabase, API-design, Sikkerhed
- Ansvar: Database arkitektur, RLS policies, Performance, Realtime, Mail hooks, Integrationer

### ⚙️ TEAM 3 — System Architect / Senior Developer
- 20+ års erfaring i Arkitektur, Skalerbare systemer, Refaktorering
- Ansvar: Overordnet arkitektur, Modulopdeling, Fremtidssikring, Kalkulationsmotor design

### 🧭 TEAM 4 — Tech Lead / Project Manager
- 20+ års erfaring i Store IT-projekter, SaaS produkter
- Ansvar: Roadmap, Faseopdeling, Prioritering, Kvalitetssikring

---

## 🏗️ PROJEKT INFO

### Om virksomheden
- **Firma:** Elta Solar ApS
- **Branche:** El- og solcelleinstallationer
- **Formål:** CRM/tilbuds/kalkulationssystem

### Konkurrenter vi skal matche/slå
- Jublo
- Ordrestyring
- KlarPris
- Kalkia

### Tech Stack
- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Deployment:** Vercel (configured)

---

## 📋 PRODUKTETS MÅL

Vi bygger:
- ✅ CRM (kunde-håndtering)
- ✅ Lead-indbakke
- ✅ Kundeportal
- ✅ Chat med filer
- ✅ Tilbudssystem med skabeloner
- ✅ Ordreflow
- ✅ Integration til eksternt ordresystem
- ✅ Email-integration
- ✅ SMS-notifikationer
- 🔜 Fuldt kalkulationsmodul som Kalkia

---

## 📁 MAPPESTRUKTUR

```
elta-crm/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Dashboard layout gruppe
│   │   │   ├── dashboard/      # Hovedoversigt
│   │   │   ├── customers/      # Kundestyring
│   │   │   ├── leads/          # Lead-håndtering
│   │   │   ├── quotes/         # Tilbudssystem
│   │   │   ├── calculator/     # Kalkulator
│   │   │   ├── inbox/          # Indbakke
│   │   │   └── settings/       # Indstillinger
│   │   ├── portal/             # Kundeportal (eksternt)
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── ui/                 # Basis UI komponenter
│   │   ├── forms/              # Form komponenter
│   │   ├── dashboard/          # Dashboard komponenter
│   │   └── shared/             # Delte komponenter
│   ├── lib/
│   │   ├── supabase/           # Supabase client & queries
│   │   ├── utils/              # Hjælpefunktioner
│   │   └── hooks/              # Custom React hooks
│   └── types/                  # TypeScript typer
├── supabase/
│   └── migrations/             # Database migrations
└── public/                     # Statiske filer
```

---

## 🗄️ DATABASE TABELLER

### Eksisterende tabeller (TJEK ALTID SCHEMA FØR BRUG):
- `profiles` - Bruger profiler
- `leads` - Leads/emner
- `lead_activities` - Lead aktivitetslog
- `customers` - Kunder
- `customer_contacts` - Kundekontakter
- `offers` - Tilbud
- `offer_line_items` - Tilbudslinjer
- `offer_signatures` - Digitale underskrifter
- `projects` - Projekter
- `project_tasks` - Projektopgaver
- `time_entries` - Tidsregistreringer
- `messages` - Interne beskeder
- `calculator_templates` - Kalkulator skabeloner
- `portal_access_tokens` - Kundeportal adgangstokens
- `portal_messages` - Portal chat beskeder
- `suppliers` - Leverandører/grossister
- `supplier_products` - Leverandørprodukter med priser
- `supplier_settings` - Leverandør import-konfiguration (inkl. adapter_code, sync_config)
- `price_history` - Prisændringer over tid
- `import_batches` - Import-log og audit trail
- `supplier_sync_jobs` - Sync job-konfiguration (cron, retries)
- `supplier_sync_logs` - Sync udførelses-log med detaljeret status
- `customer_supplier_prices` - Kundespecifikke leverandøraftaler (rabat, margin)
- `customer_product_prices` - Kundespecifikke produktpriser
- `project_interpretations` - AI-fortolkede projektbeskrivelser
- `auto_calculations` - Auto-genererede kalkulationer
- `project_risks` - Risici og advarsler for projekter
- `auto_offer_texts` - Genererede tilbudstekster
- `calculation_feedback` - Feedback til selvlærende system
- `complexity_factors` - Kompleksitetsfaktorer (beton, ældre hus, etc.)
- `electrical_point_types` - El-punkttyper med basistider
- `supplier_credentials` - Krypterede loginoplysninger (AES-256-GCM)
- `supplier_margin_rules` - Prisregler med prioritetshierarki
- `supplier_sync_schedules` - Cron-baseret synkroniseringsplaner
- `supplier_product_cache` - Offline fallback prisdata
- `price_alert_rules` - Konfiguration af prisadvarsler (tærskler, typer)
- `system_alerts` - (FINDES IKKE i prod — se noter 2026-10-04; brug `system_health_log`)

### Ved nye tabeller:
1. Vis mig CREATE TABLE SQL først
2. Inkluder ALTID RLS policies
3. Inkluder ALTID GRANT statements til anon/authenticated
4. Test at tabellen virker før du skriver kode mod den

---

## 🚀 FASEPLAN

### FASE 1: Fundament ✅
- [x] Projekt setup
- [x] Supabase connection
- [x] Basis layout

### FASE 2: Kerne CRM ✅
- [x] Komplet kunde-modul (CRUD)
- [x] Komplet leads-modul med status-flow
- [x] Dashboard med nøgletal

### FASE 3: Kommunikation ✅
- [x] Chat-system mellem sælger og kunde
- [x] Besked-indbakke
- [x] Fil-upload til chat (portal + medarbejder-side)

### FASE 4: Tilbud ✅
- [x] Tilbuds-modul med skabeloner
- [x] Kundeportal
- [x] E-sign funktion (digital signatur)

### FASE 5: Kalkulation ✅
- [x] Basis kalkulationsmotor
- [ ] Fuld kalkulationsmotor som Kalkia (fremtidig udvidelse)
- [ ] Produkt-katalog (fremtidig udvidelse)

### FASE 6: Integration ✅
- [x] Eksternt ordresystem (Generic API integration med webhooks)
- [x] Email-integration
- [x] SMS-notifikationer (GatewayAPI)

### FASE 7: Grossist-Integration ✅
- [x] Leverandør-modul med CRUD
- [x] AO og Lemvigh-Müller import konfiguration
- [x] CSV import engine med dansk talformat support
- [x] Prishistorik og import-log
- [x] Kalkia material-linking til leverandørprodukter
- [x] Automatisk prissynkronisering

### FASE 8: Auto Project Engine ✅
- [x] AI projektfortolker (NLP for projektbeskrivelser)
- [x] Automatisk komponent-matching
- [x] Tidsberegning med kompleksitets-/størrelses-/tilgængeligheds-faktorer
- [x] Prisberegning med margin og risikobuffer
- [x] Risiko-detection og advarsler
- [x] Dansk tilbudstekst-generator
- [x] UI på /dashboard/ai-project
- [x] Selvlærende engine med feedback-loop

### FASE 8: Enterprise Leverandør-Engine ✅
- [x] Adapter-baseret leverandør-framework (SupplierAdapter interface, BaseSupplierAdapter, Registry)
- [x] AO adapter med encoding fallback (ISO-8859-1 → UTF-8)
- [x] Lemvigh-Müller adapter med undergruppe-mapping og API/FTP support
- [x] Sync Engine med job-styring og logning
- [x] Kundespecifik prissætning (customer_supplier_prices, customer_product_prices)
- [x] Dyb Kalkia-integration med live leverandørpriser i kalkulationer
- [x] Kundespecifik prisberegning via database-funktioner (get_customer_product_price, get_best_price_for_customer)

---

## ⚠️ VIGTIGE REGLER

1. **Alt skal bygges modulært** - intet må males sammen
2. **Alt skal kunne udvides senere**
3. **Al kode skal være robust, skalerbar, professionel, produktionsklar**
4. **Ingen quick fixes** - gør det rigtigt første gang
5. **Test ALTID at det virker** før du fortsætter til næste opgave

---

## 🔄 ARBEJDSFORM

Ved hver opgave:
1. Tech Lead laver plan
2. Arkitekt vurderer struktur
3. Backend designer data/API
4. Frontend designer UI
5. Bliv enige om én løsning
6. Lever:
   - Klar plan
   - Klar kode
   - Klar næste fase

---

## 📝 NOTER

(Tilføj vigtige noter her efterhånden som projektet udvikler sig)

- 2026-01-14: calculator_templates bruger kolonnen `template_data` (JSONB) - IKKE `data`
- 2026-01-15: Kundeportal implementeret med:
  - Token-baseret adgang (opret via kunde-detaljesiden)
  - Tilbudsoversigt og detaljevisning
  - Digital signatur ved accept
  - Chat mellem kunde og sælger
  - Portal routes: `/portal/[token]` og `/portal/[token]/offers/[id]`
- 2026-02-01: Vercel deployment konfigureret:
  - vercel.json med sikkerhedsheaders og region (fra1)
  - next.config.js opdateret til produktion
  - Environment variables: Se .env.example for komplet liste
- 2026-02-01: Grossist-Integration (AO, Lemvigh-Müller) implementeret:
  - Nye tabeller: supplier_settings, price_history, import_batches
  - Udvidet supplier_products med margin, kategori, EAN m.m.
  - Udvidet kalkia_variant_materials med supplier_product_id link
  - Import engine med CSV parsing og dansk talformat (1.234,56)
  - Server actions: suppliers.ts, import.ts
  - UI: /dashboard/settings/suppliers/
  - AO bruger ISO-8859-1 encoding, LM bruger UTF-8
- 2026-02-04: Enterprise Leverandør-Engine implementeret:
  - Adapter-pattern: SupplierAdapter interface + BaseSupplierAdapter + Registry (supplier-adapter.ts)
  - AOAdapter med encoding-fallback, LMAdapter med undergruppe-mapping
  - SyncEngine (sync-engine.ts) til adapter-baseret filbehandling
  - Nye tabeller: supplier_sync_jobs, supplier_sync_logs, customer_supplier_prices, customer_product_prices
  - Server actions: sync.ts (job CRUD + logning), customer-pricing.ts (kundespecifik pris)
  - DB-funktioner: get_customer_product_price(), get_best_price_for_customer()
  - Kalkia-engine opdateret: bruger live leverandørpriser via CalculationContext.supplierPrices
  - Nye kalkia-funktioner: loadSupplierPricesForVariant(), loadSupplierPricesForCalculation()
  - Legacy-kompatibilitet bevaret (AOImporter, LMImporter klasser stadig tilgængelige)
- 2026-02-07: FULD Leverandør-Integration implementeret (AO + Lemvigh-Müller):
  - **Credential Storage (krypteret)**:
    - Migration 00044: supplier_credentials, supplier_margin_rules, supplier_sync_schedules, supplier_product_cache
    - AES-256-GCM kryptering (encryption.ts)
    - credentials.ts: CRUD + test connection + maskeret visning
    - SupplierCredentialsForm UI med AO/LM felt-konfiguration
  - **API Clients for Live Sync**:
    - supplier-api-client.ts: BaseSupplierAPIClient + AOAPIClient + LMAPIClient
    - Authentication, rate limiting, token caching, automatic retries
    - Fallback til cached priser ved API fejl
    - SupplierAPIClientFactory for nem instansiering
  - **Automatisk Nightly Sync**:
    - /api/cron/supplier-sync endpoint
    - vercel.json cron: "0 2 * * *" (3 AM Copenhagen)
    - sync-schedules.ts: CRUD + manual trigger (runSyncNow)
  - **Kalkia Integration**:
    - refreshSupplierPricesForCalculation(): Fetch live priser fra API
    - Materialer kan linkes til supplier_products
    - Priser opdateres automatisk i kalkulationer
  - **Tilbud Integration**:
    - createLineItemFromSupplierProduct(): Opret linje fra leverandør
    - searchSupplierProductsForOffer(): Søg produkter med kundepriser
    - refreshLineItemPrice(): Opdater pris fra leverandør
    - Tracking: supplier_product_id, supplier_cost_price_at_creation, supplier_margin_applied
  - **Margin Rules Engine**:
    - margin-rules.ts: CRUD for regler med prioritetshierarki
    - Regeltyper: supplier, category, subcategory, product, customer
    - DB-funktioner: get_effective_margin(), calculate_sale_price()
  - **Price Analytics**:
    - price-analytics.ts: Advarsler, trends, påvirkede tilbud
    - getPriceChangeAlerts(), getAffectedOffers(), getPriceTrends()
    - Dashboard widget data via getPriceAlertSummary()
  - **Fallback System**:
    - supplier-fallback.ts: SupplierFallbackService klasse
    - Cache management, stale detection, health status
    - getAllSupplierHealth(), getSystemHealthSummary()
  - **Status UI**:
    - SupplierStatusCard: Per-leverandør status med test/sync knapper
    - SupplierHealthOverview: Dashboard widget for systemstatus
  - **Database tabeller tilføjet**:
    - supplier_credentials (krypterede loginoplysninger)
    - supplier_margin_rules (prisregler med prioritet)
    - supplier_sync_schedules (cron-baseret synkronisering)
    - supplier_product_cache (offline fallback data)
- 2026-10-04: Fund og konventioner (prod read-only + delivery):
  - `system_alerts` FINDES IKKE i prod (driftsfejl logges i `system_health_log`; cron-status via scripts/prod-cron-status-since.ts)
  - Webhenvendelser kommer fra FormSubmit (`submissions@formsubmit.co`, emne "…henvendelse…"). Afsenderen er ALDRIG
    kunden — kundens data står i formularen (felter name/phone/email/inquiry_type/message/postnr/adresse). Parseren
    (`src/lib/mail/website-inquiry.ts` + `src/lib/utils/email-parser.ts`) håndterer celler på samme linje
  - Mail-automatikken (email-intelligence) opretter kunder med tag `auto-email`; uden e-mail får de pladsholderen
    `auto+<kundenr>@elta-crm.local` (.local afvises ved afsendelse). 92/107 prod-kunder er auto-oprettet
  - Kun kontakt@ og ordre@ synkes (Graph); svar fra personlige postkasser ses ikke ("kræver svar" er derfor upålidelig)
  - "I dag"/datoer: brug `copenhagenParts(new Date()).date` — ALDRIG `toISOString().slice(0,10)`; server-komponenter
    der viser klokkeslæt skal have `timeZone: 'Europe/Copenhagen'`
  - Harness: `npm run harness:ui-batches -- U1,U2 U3` (batches á 5), `npm run harness:ui-full [-- grupper]` (fuld
    regression under 30-min-loftet), prod read-only scripts i `scripts/prod-*.ts` (kun SELECT, ingen personværdier ud)
  - Commit/push KUN når check:rls-matrix, check:rbac og tsc har exit 0 (push til main = prod-deploy)
- 2026-10-05: Konventioner fra kode-reviews Q10–Q19 (se docs/runbooks/review-decisions-2026-10-04.md):
  - `service_cases.contract_sum` er EKSKL. moms (rate-/slutfakturaer lægger moms på). Tilbud→sag sætter
    `final_amount − tax_amount`. "Netto faktureret" pr. sag: `lib/invoices/net-invoiced.ts` (kun sendt/betalt,
    ikke annulleret, kreditnotaer trækkes fra uanset fortegn)
  - PostgREST giver højst 1.000 rækker: `.limit(5000)` virker IKKE — brug `fetchAllRows` (`lib/supabase/fetch-all.ts`)
    med `.order('id').range()` hvor totaler/fuldstændighed afhænger af det
  - Kost/avance/løn: databasen skjuler IKKE kolonnerne for salg/montør (RLS `USING (true)` på flere tabeller) —
    hver server-action der returnerer kost skal have en permission-gate; plan for DB-niveau i
    docs/runbooks/rls-cost-columns.md
  - Gratis-/privat-maildomæner: ÉN liste i `lib/email/free-mail-domains.ts` (domæne-kobling og leverandørsignal)
  - Kundetekst i udgående mail-HTML escapes altid (`lib/utils/html-escape.ts`); skabelonerne tager almindelig tekst
  - Mail-vedhæftninger arkiveret på kunden (`customer_documents.source_email_id`) er INTERNE — aldrig i portalen
  - Portal: et tilbuds-id er ingen adgangsnøgle (`/view-offer` udleverer aldrig token); kun sendte tilbud vises
  - Staging kan falde ud i perioder → `npx tsx scripts/test-harness/cli.ts auth-probe --create` før UI-batches

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
