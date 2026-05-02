# Elta CRM vs Ordrestyring — Gap Analysis

**Snapshot:** 2026-05-02
**Phases shipped:** 1–12 + 11.1 (RBAC + audit + alerts) + Go-Live admin panel
**Audit basis:** live codebase + database schema (migrations 00001–00093)

Risk legend:
- 🟢 Low — feature exists and is production-ready
- 🟡 Medium — partial implementation; usable but needs polish
- 🟠 High — significant gap; blocks daily Ordrestyring-equivalent workflow
- 🔴 Critical — blocks go-live for the workflow Elta runs today

---

## 1. Dashboard / overview

**Exists**
- `/dashboard` with stat cards (leads, customers, offers, projects), recent activity, leads pipeline, upcoming tasks, pending offers
- Phase 6.1 `OperationalOverview` (auto-refresh 30 s, 8 stat cards, latest emails/invoices/overdue, system health panel)
- Phase 9 AI insights panel (underpricing, top employee, margin upside, low-profit pile, forecast)
- Phase 11.1 Go-Live admin panel `/dashboard/go-live`

**Missing**
- Per-role dashboards (Ordrestyring shows different views for sælger / montør / admin) — montør gets redirected to `/dashboard/tasks`, but no specialised serviceleder/sælger view
- "Today's planned work" card with route preview
- Konvertering-pipeline funnel (lead → tilbud → ordre → faktura → betalt)

**Risk:** 🟢 Low — operationally usable
**Next action:** add per-role widgets after RBAC role checks
**Phase:** 13.1

---

## 2. Customers

**Exists**
- Full CRM CRUD (`/dashboard/customers`), customer-card centric model
- Customer relations service (offers, projects, leads, sent quotes)
- Customer tasks + reminder overlay (60s polling)
- Customer activity timeline, document upload, email auto-link
- "Opret som Kunde" from incoming email (`createCustomerFromEmail`)
- External customer-id mapping for e-conomic
- Multiple contacts per customer, billing/shipping addresses, VAT number
- Customer pricing overrides + customer supplier prices (Phase 4)

**Missing**
- Bulk import (CSV) — only manual + email-based creation
- Customer segmentation tags beyond `tags` jsonb (no first-class segment table)
- Customer credit limit / blacklist flag (Ordrestyring blocks new orders for blacklisted)
- Customer satisfaction rating after job

**Risk:** 🟢 Low — feature-complete for daily use
**Next action:** add credit-limit field on customers; CSV import wizard
**Phase:** 13.2

---

## 3. Offers

**Exists**
- Full lifecycle: draft → sent → viewed → accepted / rejected
- Branded PDF + portal e-sign (`/view-offer/[id]`, `/portal/[token]`)
- Offer line items with cost/margin/sale_price split (Phase 5)
- Auto-margin via `supplier_margin_rules` + `calculate_sale_price`
- Auto-reminders (cooldown, levels)
- Phase 12 sales engine: packages + options + text blocks + live preview
- Webhook on `offer.accepted`, auto-project + auto-invoice (autopilot)
- Offer signatures, activities log, offer email templates

**Missing**
- Multi-version revisions (current row is updated in place; no v1/v2 history)
- Comparison view (kunde sammenligner pakker side-om-side)
- Salgs-pipeline kanban view across stages

**Risk:** 🟢 Low
**Next action:** add `offer_versions` snapshot table + revision UI
**Phase:** 13.3

---

## 4. Orders / work orders

**Exists**
- `work_orders` table (Phase 7): planned → in_progress → done → cancelled
- Auto-create from `service_cases` (`createWorkOrderFromCase`)
- Assignment to employees, scheduled_date, source_offer_id linkage
- `auto_invoice_on_done` flag (Phase 7.1) → autopilot rule fires invoice creation
- Status flow guards (cannot mark done with open timer)
- Profit snapshot on transition to done (Phase 8)

**Missing**
- Work order document/photo attachments (no `work_order_documents` table — files go to `customer_documents` only)
- Multi-day jobs (no recurring instances or job sub-tasks)
- "På vej" / "ankommet" GPS check-in (geo timestamps not captured at start/stop)
- Work order print/PDF view for the montør to take into the field
- Offline-capable mobile work-order detail page

**Risk:** 🟠 High — montør workflow gap; no field doc
**Next action:** add `work_order_attachments` + a print-friendly PDF route
**Phase:** 13.4

---

## 5. Calendar and planning

**Exists**
- `/dashboard/calendar` (calendar-client.tsx + page.tsx)
- Service case scheduling, customer task due dates surfaced
- Besigtigelse scheduling actions (`besigtigelse.ts`)

**Missing**
- Drag-and-drop dispatcher view (assign WO to employee/day by drag)
- Multi-resource view (all techs side-by-side, time-bands)
- Route optimisation between addresses (no maps integration)
- Capacity indicators (employee X is 80% booked this week)
- Recurring jobs (service contracts that auto-create WOs)

**Risk:** 🟠 High — Ordrestyring's signature feature; current calendar is read-mostly
**Next action:** prototype FullCalendar/dnd-kit dispatcher view → resource-timeline
**Phase:** 14 (own phase — heavy UI lift)

---

## 6. Employees

**Exists**
- `employees` table (Phase 7): name, email, role (admin/electrician/installer), active, hourly_rate, cost_rate, profile_id link
- Phase 11.1 RBAC checks role from `profiles` (admin / serviceleder / montør)
- `/dashboard/settings/team` page

**Missing**
- Employee onboarding wizard (skills, certificates incl. expiry, authorisation level)
- Time-off / sygdomsperiode tracker (no leave table)
- Skill-based assignment hints in calendar
- Employee photo + emergency contact (used by Ordrestyring intranet)

**Risk:** 🟡 Medium — works for billing, weak on HR side
**Next action:** add `employee_certificates` + leave fields
**Phase:** 13.5

---

## 7. Time registration

**Exists**
- `time_logs` table (Phase 7): start_time/end_time, generated `hours`, `cost_amount` auto-trigger, billable flag
- DB-enforced "one active timer per employee" partial UNIQUE
- `startTimeEntry`, `stopTimeEntry`, `createManualTimeEntry`, `getEmployeeStats`
- Auto-bump WO planned → in_progress on first start
- Logs marked `invoice_line_id` after billing → never billed twice

**Missing**
- **Mobile-first time entry UI** (no `/dashboard/time` page; service is built but no page)
- Quick start/stop button per WO in mobile montør view
- Photo/note required when stopping a timer (Ordrestyring requires "what did you do")
- Geo-tag start/stop (GPS coords on time_logs row)
- Drift / pause functionality (no `time_log_pauses` table)

**Risk:** 🔴 Critical — montør cannot register hours from the field today
**Next action:** build `/dashboard/time` mobile UI + `montør` role gate
**Phase:** 13.6 (must precede go-live for hourly billing)

---

## 8. Time approval

**Exists**
- Nothing structured — time logs flow straight into invoice rollup

**Missing**
- Serviceleder approval queue (`time_logs.approved_by`, `approved_at`, `approval_status`)
- "Awaiting approval" state before logs become billable
- Bulk approve / adjust hours UI
- Rejection with reason → notification to employee

**Risk:** 🟠 High — Ordrestyring requires approval before invoice. Current flow auto-bills.
**Next action:** add approval columns + queue page; gate billable rollup behind `approved_at IS NOT NULL`
**Phase:** 13.7

---

## 9. Materials / products

**Exists**
- `materials` table (Phase 4) + admin UI `/dashboard/settings/materials`
- `material_catalog.ts` service with supplier resolution (binding + auto-match)
- Supplier products mirror (282k+ rows from AO + LM)
- Customer-specific pricing (`customer_supplier_prices`, `customer_product_prices`)
- Margin rules engine (`supplier_margin_rules`, `calculate_sale_price`)
- Search in offer editor (`searchSupplierProductsForOffer`)
- Kalkia variant materials linking

**Missing**
- Stock levels (no `inventory` or warehouse table)
- Material reservation per WO (Ordrestyring shows "X stk reserveret til ordre Y")
- Barcode scan flow (mobile material picking)
- Min-stock alerts + auto-order suggestions

**Risk:** 🟡 Medium — sale-side pricing complete, but no inventory
**Next action:** add lightweight stock table for stocked items only (cable, tape, etc.)
**Phase:** 14.1

---

## 10. Supplier invoices / incoming invoices

**Exists**
- Nothing — only outgoing invoices (`invoices`) and outgoing reminders

**Missing**
- `incoming_invoices` table (supplier, amount, due_date, OCR text, attachment_url)
- Email-ingest of supplier PDFs (Outlook auto-forward → parse)
- OCR extraction (sender, amount, IBAN, varenummer)
- 3-way match (PO ↔ delivery ↔ invoice)
- Approval workflow + e-conomic posting

**Risk:** 🔴 Critical — every business needs supplier invoice handling. Currently 100% manual.
**Next action:** build `/dashboard/incoming-invoices` with email ingest + manual upload + minimal OCR (Phase 6 of Master Plan said this is Phase 6 but never started)
**Phase:** 15 (own phase)

---

## 11. Customer invoices

**Exists**
- Phase 5 invoices: F-YYYY-NNNN sequential numbering, draft → sent → paid
- Phase 5.1 reminders (3 levels + cooldown)
- Phase 5.2 payments + idempotency
- Phase 5.3 bank match (CSV import + auto-match by ref/amount/sender)
- Phase 5.4 e-conomic sync (skip-safe)
- Phase 7.1 invoice from work_order with time + materials
- Phase 8 profit snapshots

**Missing**
- Invoice PDF (only HTML email body — no actual PDF attached)
- Credit notes / kreditnotaer (no `credit_notes` table)
- Recurring/subscription invoicing (service contracts)
- OIOUBL/EAN export for offentlige kunder (e-faktura)
- Customer statement (kontoudtog) print

**Risk:** 🟠 High — PDF invoice is non-negotiable for B2B. Currently absent.
**Next action:** add PDF generator using existing `@react-pdf/renderer` (already in package.json) + attach to send_email
**Phase:** 13.8

---

## 12. Economy per order

**Exists**
- Phase 8 `work_order_profit` snapshots (revenue / labor / material / total / profit / margin %)
- Auto-snapshot on invoice creation + WO done
- `low_profit` flag when margin <15% (Phase 9 trigger)
- Profit history append-only
- Per-employee productivity (`getEmployeeProductivity`)

**Missing**
- Per-order P&L UI page (data exists, no page renders it)
- Drill-down "where did the cost come from" view (cost breakdown per supplier line)
- Variance report (planned vs actual)
- Project-level rollup (multi-WO project total)

**Risk:** 🟡 Medium — calculations done, UI missing
**Next action:** add `/dashboard/work-orders/[id]/profit` page
**Phase:** 13.9

---

## 13. File / document storage

**Exists**
- `customer_documents` table + `/dashboard/customers/[id]` document tab
- `email_attachment_storage.ts` service for inbound attachments
- Supabase Storage buckets configured
- Lead attachments transferred to customer on conversion

**Missing**
- Central document index searchable across customer/offer/WO/invoice
- Versioning on customer documents
- "Brevskabeloner" library (Word/PDF templates per type)
- Bulk download (zip all docs for a project)
- Permission per document (private vs shared with portal)

**Risk:** 🟡 Medium
**Next action:** add `documents` central table that proxies the three existing surfaces
**Phase:** 14.2

---

## 14. Forms / KLS / checklists

**Exists**
- `service_cases.checklist` jsonb (Phase 6.1)
- `completion-checklist.tsx` shared component on service-case detail
- `customer_signature` + `customer_signature_name` + `signed_at` on service_cases (digital sign-off)

**Missing**
- **KLS-system** (Kvalitets-Ledelses-System for el-installatør) — no form templates table
- Per-installation form (gruppe-skema, måler-skema, autorisation-mærkat)
- Form revisions / archive
- Auto-generation of KLS PDF for SikkerhedsStyrelsen audit
- Signed checklist PDF storage

**Risk:** 🔴 Critical — el-installation requires KLS by law. Current checklist is too thin.
**Next action:** build `kls_form_templates` + `kls_form_submissions` tables; PDF export
**Phase:** 16 (regulatory must-have)

---

## 15. Intranet / employee information app

**Exists**
- Nothing dedicated. Employees use the same dashboard.

**Missing**
- News feed for company announcements
- Procedure / "sådan gør du" knowledge base
- Document library (medarbejderhåndbog, KLS-kvalitetshåndbog)
- Training modules / kursus tracking
- "Om mig" personal page

**Risk:** 🟢 Low — nice-to-have, not blocking
**Next action:** defer until core is stable
**Phase:** 17 (post-go-live)

---

## 16. Relatel phone integration

**Exists**
- Nothing. No grep hits for "relatel".

**Missing**
- Inbound call → customer match popup (CTI)
- Click-to-call from customer card
- Call log linked to customer (varighed, recording)
- Voicemail transcription
- Outbound call from offer/case detail

**Risk:** 🟡 Medium — Ordrestyring has it; productivity loss if absent
**Next action:** evaluate Relatel API; build webhook endpoint + popup component
**Phase:** 17.1

---

## 17. e-conomic integration

**Exists**
- Phase 5.4 `economic-client.ts` — full POST flow
- `accounting_integration_settings` table (provider, tokens, config jsonb)
- `accounting_sync_log` audit
- Auto-sync hooks: invoice send → create_invoice; payment fully paid → mark_paid
- `external_invoice_id` + `external_customer_id` columns + UNIQUE indexes
- Skip-safe with `ECONOMIC_NOT_CONFIGURED` log marker

**Missing**
- **No live credentials in prod** (`accounting_integration_settings` empty)
- Voucher cashbook number not validated against real e-conomic ledger
- Customer fetch (we only push, never sync back from e-conomic)
- Product/varenummer sync
- Conflict resolution UI (when e-conomic returns an error)

**Risk:** 🟠 High — code is shipped but unconfigured. Block for invoice automation go-live.
**Next action:** insert real settings row; sandbox-test customer + invoice + cashbook entry
**Phase:** 13.10 (config + verification, no new code)

---

## 18. AO integration

**Exists**
- Adapter (Phase 7 of Master Plan), `searchSupplierProductsLive` falls back to local mirror
- 282k+ supplier products synced via nightly cron `supplier-sync` (02:00)
- Credentials encrypted (AES-256-GCM)
- AO order detection in incoming emails (`email-ao-detector.ts`)
- ISO-8859-1 CSV encoding handled

**Missing**
- Order placement via AO (we only read product data; cannot place orders)
- Direct order status read-back from AO
- Live stock check (must rely on cached `stock_quantity`)

**Risk:** 🟡 Medium — sufficient for pricing; insufficient for procurement automation
**Next action:** evaluate AO order API; build `placeOrderInAO(workOrderId)`
**Phase:** 17.2

---

## 19. Lemvig Müller integration

**Exists**
- `LMClassicClient` + `supplier-ftp-sync.ts` (SFTP, port 22, ssh2)
- LM credential present, last test 2026-04-29 success
- Weekly cron `/api/cron/lemu-sync` (mondays 04:00)
- Adapter framework integration

**Missing**
- Order placement (read-only sync today)
- Real-time stock query (only weekly snapshot)
- Pricat / invoice EDI return file processing

**Risk:** 🟡 Medium — same shape as AO
**Next action:** evaluate LM order EDI; otherwise mirror AO plan
**Phase:** 17.3

---

## 20. GDPR / security / roles / audit logs

**Exists**
- RLS enabled on every table (verified across migrations)
- AES-256-GCM credential encryption (`encryption.ts`)
- RBAC roles: admin / serviceleder / montør / electrician / installer
- Phase 11.1 Go-Live audit log (`go_live_audit_log`)
- `audit.ts` action + `accounting_sync_log` + `system_health_log` + `automation_executions` + `invoice_payments` + `invoice_reminder_log` + `ai_suggestions`
- Cron secret + Bearer token auth on all admin/cron endpoints
- Vercel security headers (X-Frame-Options, CSP-ish)

**Missing**
- **No customer-facing privacy / data-export endpoint** (Right to access)
- **No "delete my data" workflow** (Right to erasure) — would need cascading anonymisation
- Consent tracking (databehandleraftale per customer, samtykke til markedsføring)
- Centralised access log (who looked at customer X)
- Password policy / MFA enforcement (Supabase Auth defaults only)
- Data retention policy execution (no auto-purge of old emails / closed cases)

**Risk:** 🔴 Critical — GDPR violations carry €20M / 4 % revenue fines
**Next action:** build `data_export_requests` + `data_deletion_requests` tables + admin handling UI
**Phase:** 18 (compliance phase)

---

## 21. Admin backend (prices, employees, rates, texts, settings)

**Exists**
- `/dashboard/settings/` with sub-pages: company, materials, packages, suppliers, integrations, kalkia, components, notifications, ordrestyring, profile, reminders, security, solar, team, audit, learning
- Phase 12 packages admin (`/dashboard/settings/packages`) — full CRUD on packages, options, text blocks
- `company_settings` table with reminder/SMTP/SMS/tax defaults
- Supplier credentials UI + margin rules + sync schedules
- Employees CRUD via `/dashboard/settings/team`
- Go-Live admin panel (`/dashboard/go-live`) for autopilot + integrations control
- Phase 11 dry_run safety default for autopilot rules

**Missing**
- Hourly rate management UI (the column exists but no settings page lists employees with editable rate/cost_rate)
- Tax rates per VAT zone (only one default)
- Email template editor for invoice/reminder/offer (templates are in code, not editable in DB)
- Discount-rule library (per customer-segment / volume)
- "Numbering scheme" UI (invoice prefix, offer prefix) — currently hardcoded F-YYYY-NNNN

**Risk:** 🟡 Medium — coverage is broad, depth is uneven
**Next action:** unify settings under one "Indstillinger" navigation tree; expose hourly_rate UI
**Phase:** 13.11

---

## Roadmap summary (recommended sequencing)

### Pre-go-live blockers (must close before live billing)
| # | Phase | Area | Why |
|---|---|---|---|
| 1 | **13.6** | Time registration mobile UI | Montør has no way to log hours today |
| 2 | **13.7** | Time approval flow | Currently auto-bills without serviceleder review |
| 3 | **13.8** | Invoice PDF generator | B2B requires actual PDF; only HTML email today |
| 4 | **13.10** | e-conomic credential setup + sandbox verify | Code ready; needs live cred and end-to-end test |
| 5 | **16** | KLS forms | Legal requirement for el-installatør |
| 6 | **18** | GDPR data export/delete endpoints | Legal + customer trust |

### Quick wins (low effort, high value)
| # | Phase | Area |
|---|---|---|
| 7 | 13.1 | Per-role dashboard widgets |
| 8 | 13.2 | Customer credit limit + CSV import |
| 9 | 13.4 | Work order PDF print + attachments |
| 10 | 13.9 | Per-order profit page |
| 11 | 13.11 | Hourly rate settings UI |

### Major builds (own phases)
| # | Phase | Area | Effort |
|---|---|---|---|
| 12 | **14** | Calendar dispatcher view (drag-drop, multi-resource) | Large |
| 13 | **14.1** | Stock / inventory module | Medium-large |
| 14 | **15** | Incoming supplier invoices + OCR | Large |
| 15 | **17** | Intranet / knowledge base | Medium |
| 16 | **17.1** | Relatel CTI integration | Medium |
| 17 | **17.2-3** | AO/LM order placement | Medium per supplier |

### Defer (post-launch)
- Multi-version offer revisions (13.3)
- Comparison view, kanban pipeline (13.3)
- Document central index (14.2)
- Skill-based dispatch hints (13.5)
- Recurring service contracts (calendar phase)

---

## Verdict

| Area | Coverage |
|---|---|
| Sales (lead → offer → portal → accept) | 95 % |
| Invoice + payment + reminder | 90 % |
| Bank match + accounting | 80 % (e-conomic config pending) |
| Customer relations | 90 % |
| Employee + time tracking (back-end) | 85 % |
| **Field/montør UX (timer + KLS + WO PDF)** | **30 %** |
| Calendar dispatcher | 40 % |
| Stock / inventory | 0 % |
| Incoming invoices | 0 % |
| GDPR compliance endpoints | 20 % |
| Intranet / phone integration | 0 % |

The CRM is **stronger than Ordrestyring** on AI optimization, autopilot, profit snapshots, and the offer pipeline. It's **weaker** on field/montør workflows, KLS forms, calendar dispatching, supplier invoice ingest, and GDPR endpoints.

**Recommended go-live cutover:** ship items 1–6 from "Pre-go-live blockers" before declaring production-live for full Ordrestyring replacement. Items 7–11 follow within 30 days. Items 12–17 are quarterly horizon.
