# ELTA CRM/ERP — System Map

> Sprint 10A baseline. Opdateres ved hver arkitektonisk ændring.
> Sidst opdateret: Sprint 10A (fundament + migrations-sandhed).

## Stack

| Lag | Teknologi | Note |
|---|---|---|
| Framework | Next.js 16 (App Router) | RSC + server actions; Turbopack default |
| Runtime | React 19, TypeScript strict | `tsc --noEmit` skal være grøn |
| Database | Supabase Postgres | ~110+ migrations, sekventielle nummre med huller |
| Auth | Supabase Auth (`@supabase/ssr`) | Cookie-baseret JWT |
| Storage | Supabase Storage | `attachments` + `portal-attachments` buckets, begge private |
| Deployment | Vercel | Auto-deploy fra `main`, region `fra1` |
| Mail | Microsoft Graph API | Multi-mailbox (kontakt@/ordre@eltasolar.dk) |
| Validation | Zod | I `src/lib/validations/` |
| PDF | `@react-pdf/renderer` | Server-side render via API routes |
| Styling | Tailwind 3.4 | Utility-first; ingen design system endnu |
| Realtime | Supabase Realtime | Migration 00063 |
| AI | OpenAI via interne services | `src/lib/ai/` + `src/lib/services/email-intelligence.ts` |

## Centrale mapper

```
src/
├── app/                          Next.js App Router
│   ├── (auth)/                   Login/register/password-reset
│   ├── dashboard/                Hoved-CRM UI med [id]-routes
│   ├── portal/                   Token-baseret kundeportal (anon)
│   └── api/
│       ├── cron/                 13 cron-routes (Vercel)
│       ├── admin/                Service-role admin tools
│       ├── public/contact/       Hjemmeside-formular
│       ├── besigtigelse/pdf/     PDF-render route
│       ├── invoices/[id]/pdf/    Faktura-PDF
│       └── ...
├── components/
│   ├── layout/                   Sidebar, header, bottom-nav, command-palette
│   ├── modules/                  Modul-specifikke UI'er
│   ├── ui/                       Generiske primitivs (Button, Toast, ...)
│   └── email/                    SendEmailModal, EmailTimeline
├── lib/
│   ├── actions/                  ~110 server actions (`'use server'`)
│   ├── services/                 ~50 forretningsservices (ren logik)
│   ├── supabase/                 client.ts, server.ts, admin.ts, middleware.ts
│   ├── auth/                     permissions.ts, roles.ts, page-guard.ts, case-scope.ts
│   ├── ai/                       projectInterpreter, autoProjectEngine, learningEngine
│   ├── engines/                  project-intake, offer-text, risk, pricing
│   ├── email/                    email-service + templates
│   ├── pdf/                      besigtigelse + invoice + fuldmagt templates
│   ├── customers/                customer-number-helper (race-safe)
│   ├── validations/              Zod-skemaer
│   └── utils/                    logger, encryption, format, csv-export, ...
├── types/                        ~50 *.types.ts
└── locales/da/                   Dansk i18n
supabase/
└── migrations/                   *.sql, sekventielle 00000-00114
docs/                             Arkitektur-, modul- og risiko-docs (denne folder)
scripts/                          One-shot scripts (ao-sync, link-test, smoketest, ...)
```

## Centrale moduler

Se [`module-map.md`](./module-map.md) for fuld oversigt med modenhed og afhængigheder.

Hovedkategorier:
- **Kerne CRM/ERP**: Customers, Leads, Offers, Service Cases (Orders), Tasks, Work Orders, Employees
- **Kommunikation**: Email (Graph + intelligence), Documents, Customer Portal
- **Økonomi**: Invoices, Incoming Invoices, Bank Match, Accounting Integration
- **Værktøjer**: Kalkia (calc engine), Suppliers (AO + Lemvigh-Müller), AI-moduler
- **Platform**: Auth/RBAC, Settings, Cron-jobs, Audit

## Vigtigste datamodeller

| Tabel | Funktion | Status |
|---|---|---|
| `customers` | Kunde-master | ✅ Modent |
| `customer_contacts` | Sekundære kontakter | ⚠️ `role`-kolonne brugt i kode uden migration i repo |
| `service_cases` | Sag/ordre — canonical | ⚠️ Site-felter (00111) mangler i repo |
| `customer_documents` | Bilag på kunde | ⚠️ `service_case_id` mangler indtil 00114 kørt |
| `customer_tasks` | Opgaver | ⚠️ Ingen FK til service_cases |
| `offers` + `offer_line_items` | Tilbud | ⚠️ Kun `customer_id`, ingen parti-roller |
| `invoices` + `invoice_lines` | Faktura | ⚠️ Kun `customer_id`, ingen parti-roller |
| `incoming_invoices` | Leverandørfaktura | ✅ Modent |
| `incoming_emails` | Inbound mail (Graph) | ✅ Modent |
| `email_threads` + `email_messages` | Outbound mail | ⚠️ Adskilt fra inbound — fragmenteret |
| `work_orders` + `time_logs` | Daglig drift | ✅ Modent |
| `employees` | HR-records | ✅ Modent |
| `portal_access_tokens` | Portal-adgang | ✅ Modent |
| `profiles` | Bruger-rolle (admin/serviceleder/montør/salg/bogholderi) | ⚠️ Ingen FK til `auth.users` |
| `permissions` (00108) | RBAC-katalog | ⚠️ Parallel til TS-matrix |

## Centrale integrationer

| System | Formål | Filer |
|---|---|---|
| Microsoft Graph | Mail-sync + send (multi-mailbox) | `microsoft-graph.ts`, `email-sync-orchestrator.ts`, `email-linker.ts` |
| AO (grossist) | Produktdata + priser (ISO-8859-1 CSV) | `supplier-adapter.ts`, `supplier-api-client.ts` |
| Lemvigh-Müller (grossist) | Produktdata + priser (FTP/API) | `lemu-sync.ts`, `sync-engine.ts` |
| Ordrestyring | Ekstern ordresystem-integration | `ordrestyring.ts` |
| e-conomic | Regnskab | `economic-client.ts`, `accounting_integration` |
| GatewayAPI | SMS | `src/lib/sms/` (legacy) |
| DAWA | Dansk adresse-API | `address-lookup.ts` |
| OpenAI | AI-funktioner | `email-intelligence.ts`, `ai-mail-assistant.ts`, `autoProjectEngine.ts` |
| Vercel | Deploy + cron | `vercel.json` |
| Supabase | DB/Auth/Storage/Realtime | `src/lib/supabase/` |

## Centrale arkitekturprincipper

1. **Server actions over REST API**. ~110 actions, ~35 API routes (mest cron + admin + PDF + webhooks).
2. **RLS-first**, med app-lag scoping. Hver tabel har `ENABLE ROW LEVEL SECURITY`. De fleste policies er `authenticated USING(true)` — adgangsstyring foregår primært i server actions via `getAuthenticatedClientWithRole().hasPermission(...)`.
3. **Two Supabase clients**: `createClient()` (cookie-baseret, authenticated) og `createAdminClient()` (service-role, bypasser RLS — kun cron/portal/setup).
4. **Permission-matrix i TypeScript** (`src/lib/auth/permissions.ts`) som source-of-truth. Migration 00108 introducerede `permissions`-tabel som parallel — risiko for drift.
5. **Mail-routing-layer** (`mail-routing.ts` + `mail-route-resolvers.ts`) centraliserer modtager-valg. 12 typed resolvers + Phase 6a shadow-log preview.
6. **Idempotente migrations** med BEGIN/COMMIT + `IF NOT EXISTS`-pattern.
7. **Sprint-prefiks i kommentarer** (`Sprint 9G ...`) for sporbarhed.
8. **ActionResult-pattern**: `{ success: true, data: T } | { success: false, error: string }`.
9. **Zod på client + server** for validation.
10. **Dansk i UI og fejlbeskeder**, engelsk i kode-kommentarer + dokumentation.

## Branch + deploy

- `main` er production-branch
- Vercel auto-deploy ved push til `main`
- Ingen preview-branches i øjeblikket
- Migration-strategi: SQL-fil i `supabase/migrations/` → manuel run i Supabase Dashboard → commit til repo

## Cron-schedule oversigt

Se [`vercel.json`](../vercel.json) for fuld liste. Alle cron-routes valideres via `CRON_SECRET`-bearer-token.

| Path | Schedule | Note |
|---|---|---|
| `/api/cron/supplier-sync` | `0 2 * * *` | Dagligt 02:00 |
| `/api/cron/lemu-sync` | `0 4 * * 1` | Mandag 04:00 |
| `/api/cron/intelligence-check` | `0 3 * * *` | Dagligt 03:00 |
| `/api/cron/learning-feedback` | `0 4 * * *` | Dagligt 04:00 |
| `/api/cron/email-sync` | `0 5 * * *` ⚠️ | **Inkonsistens** — kode-kommentar siger "every 5 minutes" |
| `/api/cron/offer-reminders` | `0 8 * * *` | Dagligt 08:00 |
| `/api/cron/email-intelligence-summary` | `30 0 * * *` | Dagligt 00:30 |
| `/api/cron/invoice-reminders` | `0 7 * * *` | Dagligt 07:00 |
| `/api/cron/bank-match` | `30 6 * * *` | Dagligt 06:30 |
| `/api/cron/system-health-check` | `0 9 * * *` | Dagligt 09:00 |
| `/api/cron/incoming-invoices` | `15 9 * * *` | Dagligt 09:15 |
| `/api/cron/incoming-invoices-api` | `30 9 * * *` | Dagligt 09:30 |
| `/api/cron/unanswered-mails-check` | `0 12 * * *` | Dagligt 12:00 |
