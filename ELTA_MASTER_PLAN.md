# Elta Master Plan

AI-driven operating system for Elta Solar / Elta CRM.

## North Star

One platform that runs the company end-to-end. Every customer, every email, every case, every offer, every hour, every invoice — captured, linked, and acted on automatically. AI does the routing and the drafting; humans approve and finish.

## Scope (target end-state)

- **CRM** — customers, contacts, leads, segmentation
- **Email intake** — multi-mailbox sync, threading, attachment storage
- **Email intelligence** — AI classification, extraction, auto-link, auto-create
- **Case management** — service cases, status flow, assignment, notes
- **Offers** — drafts, line items, e-sign, portal, reminders
- **Planning** — calendar, dispatch, route, capacity
- **Employee/time** — task management, time registration, payroll feed
- **Supplier prices** — AO, Lemvigh-Müller, margin rules, customer pricing
- **Invoices (out)** — from offers/projects, e-invoice, dunning
- **Incoming invoices** — supplier invoice ingest, OCR, reconciliation
- **Documents** — central file platform, signed copies, attachments
- **AI automation** — drafting, summarization, routing, anomaly detection

## Operating Rules

- **Work like a senior team.** Architect → Backend → AI → Product → QA. Every change is reviewable.
- **Protect what works.** Never break existing flows. New code, isolated try/catch, additive migrations.
- **Business value first.** No random features. Every change must save a real minute or prevent a real error.
- **Modular by default.** Each domain is its own service folder; pipelines compose them.
- **AI where it saves manual work.** Heuristics first, AI second; both gated and observable.
- **Production-only code.** No prototypes in main; no TODOs; logging on every server action.

## Status Snapshot

| Module                     | State            | Notes                                                        |
| -------------------------- | ---------------- | ------------------------------------------------------------ |
| Email sync (Graph)         | ✅ working        | delta tokens per mailbox, sent items, attachment storage      |
| Multi-mailbox              | ✅ working        | `mailbox_source` column, default + extra inboxes              |
| Email intelligence         | ✅ working        | classify (hard filters + AI), score-gate, extract             |
| Customer match/create      | ✅ working        | phone → name match; create only if phone or address present   |
| Auto case creation         | ✅ working        | dedup via `source_email_id`, intent + priority, smart tasks   |
| Offer draft from email     | ✅ wired          | dedup marker, prefilled title/desc, status `draft`            |
| Case notes (AI summary)    | ✅ wired          | `case_notes` table, urgency tagging                           |
| Dashboard monitoring       | ✅ working        | per-day counts, daily summary, alerting                       |
| Employee tasks/time        | ⏳ partial        | `customer_tasks` exists; no time module                       |
| Supplier prices            | ✅ working        | AO + LM, margin rules, customer pricing                       |
| Invoices (out)             | ❌ missing        | offers exist; no invoice generation/dunning                   |
| Incoming invoices          | ❌ missing        | needs OCR + reconciliation                                    |
| Document platform          | ⏳ partial        | per-module storage; no central index                          |

## Strategic Phases

### Phase 1 — Stabilize email → customer → case (now)

Goal: zero false positives, zero crashes, observable.

- Top-level safety net on intelligence pipeline ✅
- Hard filters before any AI call ✅
- Score-gated extraction (≥2 to extract, ≥0.5 confidence to create) ✅
- Step-isolated post-customer flow (case → tasks → offer → note) ✅
- Per-email log + daily summary + alerts ✅
- **Audit weaknesses → fix before adding features** ← in progress

### Phase 2 — Auto offer drafts from case

- Draft created on relevant emails ✅
- Next: line-item suggestions from intent (solar package, service hour, etc.)
- Next: link offer ↔ case bidirectionally (column on `offers`)
- Next: portal preview for sales rep before send

### Phase 3 — Employee / time registration

- Tasks already per-customer; need per-employee inbox
- Time entry → projects/tasks → invoice line
- Mobile-first UI for montør role
- Geo-stamp + photo on completion

### Phase 4 — Supplier price integration (AO + LM)

- Adapter framework, sync engine, margin rules already shipped
- Next: live API search in offer editor (already wired) — verify flake-rate
- Next: nightly health report → dashboard
- Next: customer-specific override workflow

### Phase 5 — Invoice handling (out)

- Generate from accepted offers
- E-invoice (OIOUBL) export
- Dunning flow (reminder cadence)
- Payment matching

### Phase 6 — Incoming invoices

- Supplier invoice email/upload
- OCR extract → match against orders → flag deviations
- Approval workflow
- Bookkeeping handoff

### Phase 7 — Document platform

- Central index over all attachments + generated PDFs
- Per-customer/per-case folders with retention policy
- Search across body+OCR

## Data Backbone

Tables already trustworthy:
`customers`, `customer_contacts`, `leads`, `offers`, `offer_line_items`, `service_cases`, `customer_tasks`, `incoming_emails`, `email_intelligence_logs`, `email_intelligence_daily_summary`, `case_notes`, `suppliers`, `supplier_products`, `supplier_credentials`, `supplier_margin_rules`, `customer_supplier_prices`, `customer_product_prices`, `kalkia_*`, `graph_sync_state`.

Future tables (Phase 3+): `time_entries` (exists, needs wiring), `invoices`, `invoice_lines`, `incoming_invoices`, `documents`, `document_links`.

## Engineering Conventions

- Server actions return `ActionResult<T>` (`@/types/common.types`)
- Auth via `getAuthenticatedClient()` returning `{ supabase, userId }`
- Admin/system jobs use `createAdminClient()` (service role)
- Logging via `@/lib/utils/logger` (`logger.info`/`warn`/`error`)
- Each cron route protected by `timingSafeEqual(CRON_SECRET)`
- Migrations are additive; never drop in production. Migration files numbered, applied via `scripts/apply-migration-NNNNN.mjs`
- AI calls always: timeout, JSON-mode, fallback to null, logged on miss
- Every mutation has `revalidatePath`

## Done Means

- Type-checks clean (`npx tsc --noEmit`)
- New code has logging
- New code has try/catch around external calls
- No `console.error` outside boundaries (use logger)
- Migration applied and verified before merge
- Dashboard signal added if it changes user-facing state
