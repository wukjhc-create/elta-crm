# Elta CRM → ERP Build Plan

**Snapshot:** 2026-05-03
**Status of repo:** RLS hardened (commit `4fbe6fd`). Production-deploy pipeline healthy. 96 migrations, 65 dashboard pages, 70 server-action files.
**Reference product:** Ordrestyring.dk screenshots provided by stakeholder.
**Predecessor docs:** `PROJECT_REALITY_AUDIT.md`, `ELTA_ORDRESTYRING_GAP_ANALYSIS.md`.

This is a **plan, not code**. No new features will be built until the plan is approved. Every sprint has explicit acceptance criteria so we know when each one is "done".

---

## North Star

Convert Elta CRM from a "many half-built pages" CRM into a **single coherent ERP/ordrestyringssystem** where the **ordre/sag is the centre of every business activity**. Every customer, employee hour, material, supplier invoice, and economic figure must trace to a sag.

Three rules govern every sprint:

1. **The sag is the centre.** Every list view, every detail page, every report ultimately joins back to a sag.
2. **No floating data.** A material booked, a hour logged, a cost incurred → must be linked to a sag. Loose data not allowed.
3. **Every figure is provable.** Every number on screen has a query path back to source rows. No "calculated values" that the operator can't drill into.

---

## 1. Module catalogue (target end state)

The screenshots and the user's brief give us 14 first-class modules. For each: what it does, what pages it owns, what tables back it, what relations it exposes, what is "critical for Elta Solar" specifically (regulatory/operational, not just nice-to-have).

### 1.1 Kunder (Customers)

**Purpose:** master record of who Elta delivers work to.

**Pages**
- `/dashboard/customers` — list + search + filters (active/inactive, type=privat/erhverv, segment)
- `/dashboard/customers/[id]` — profile with tabs: Overblik · Sager · Tilbud · Fakturaer · Dokumenter · Kontakter · Beskeder · Aktivitet
- `/dashboard/customers/[id]/edit` — form (admin)
- `/dashboard/customers/new` — create wizard

**Tables**
- `customers` (existing — has `customer_number`, `vat_number`, billing+shipping addresses, contacts, custom_fields)
- `customer_contacts` (existing) — multiple contact persons per customer
- New: `customer_segments` (privat/erhverv/offentlig) — currently encoded only in tags

**Relations**
- 1 customer → N sager (`service_cases.customer_id`, `work_orders.customer_id`, `projects.customer_id`)
- 1 customer → N offers
- 1 customer → N invoices

**Critical for Elta Solar**
- Customer's **EAN-nummer** (offentlige kunder kræver e-faktura) — already on `service_cases.ean_number` but not on `customers`. **Move/copy to customers.**
- Customer's preferred contact person per case type (sælger vs. servicekoordinator).
- VAT number for OIOUBL/EAN export and CVR-lookup integration.

### 1.2 Tilbud (Offers)

**Purpose:** quote lifecycle from draft → sent → portal-viewed → accepted → automatic sag creation.

**Pages**
- `/dashboard/offers` — list + status pipeline (kanban-style optional)
- `/dashboard/offers/[id]` — detail with: Linjer · Pakker (sales engine) · Vilkår · Kunde · Aktivitet · Underskrifter · PDF preview
- `/dashboard/offers/new`
- `/view-offer/[id]` (public) — already exists, branded portal
- `/portal/[token]/offers/[id]` — already exists

**Tables (all exist)**
- `offers`, `offer_line_items`, `offer_packages`, `offer_package_items`, `package_options`, `offer_signatures`, `offer_activities`, `sales_text_blocks`

**Relations**
- 1 offer → 0..1 lead (`offers.lead_id`)
- 1 offer → 0..1 sag (created on accept, via `work_orders.source_offer_id` or new `service_cases.source_offer_id`)
- 1 offer → 0..1 invoice (Phase 5: `invoices.offer_id`)

**Critical for Elta Solar**
- "Solcelleanlæg fra A til Å"-pakker med tilvalg (battery, servicepakke) — `<PackagePicker>` is built but unused. **Wire into `/dashboard/offers/[id]`.**
- Multi-version revisions (kunde "send mig en alternativ med 4 paneler i stedet").

### 1.3 Ordrer / Sager (Work Orders / Cases) — **THE CENTRE**

**Purpose:** the single source of truth for any unit of work Elta delivers.

**Pages**
- `/dashboard/orders` (or `/dashboard/sager`) — main list with status pipeline + filters
- `/dashboard/orders/new` — wizard (kunde → type → adresse → ansvarlig → planlagt tid)
- `/dashboard/orders/[id]` — **the central detail page**, with TABS:
  - **Overblik** — header + projektnavn + type + status + ansvarlig + formand + planlagt tid + adresser
  - **Timer** — registered hours per employee, billable/non-billable, approve queue
  - **Materialer** — booked items linked to sag (with supplier_product_id)
  - **Øvrige omkostninger** — kørsel, leje, underleverandør, bonus
  - **Økonomi** — tilbudt / revideret / faktureret / DB / dækningsgrad
  - **Aktivitet** — change log + comments
  - **Dokumentation** — KLS-formularer + photos + signed customer copy
  - **Fakturakladde** — preview of next invoice from un-billed time + materials
  - **Handlinger** — book medarbejder, opret faktura, send rykker, marker afsluttet, slet

**Tables (existing — need consolidation)**
- `service_cases` (existing): has case_number, address, geo, KSR, EAN, signature, status, source_email_id, os_case_id (Ordrestyring sync). Missing: project_name, type, reference, requisition, formand, planned_hours, contract sum.
- `work_orders` (existing): has scheduled_date, assigned_employee_id, source_offer_id, auto_invoice_on_done. Missing: same fields as service_cases.
- `projects` (existing): unused (0 rows). Has budget, actual_cost, project_manager_id, assigned_technicians[]. Better data model than service_cases for ERP.

**The schema problem we must solve in Sprint 2**
Three overlapping tables (service_cases, work_orders, projects) all model the same concept differently. Decision: pick one, deprecate two. Recommendation: **`service_cases` becomes the canonical "sag"** — it already has the most production data (1 row vs 0 vs 0), real-world fields (EAN/KSR/GPS/signature) needed for Elta. Extend it with project-style fields (planlagt tid, formand, type, reference, contract sum) and migrate work_orders → child rows hanging off service_cases for scheduled-day breakouts.

**Relations**
- 1 sag → 1 customer
- 1 sag → 0..1 source offer
- 1 sag → 0..N invoices (multi-stage billing: forskudsfaktura, ratefaktura, slutfaktura)
- 1 sag → N time_logs
- 1 sag → N case_materials (new)
- 1 sag → N case_other_costs (new)
- 1 sag → 1 economic snapshot (continuously updated)

**Critical for Elta Solar**
- **Type field**: solcelleanlæg / servicebesøg / installation / projekt / akut. Drives default workflow + KLS form template.
- **KLS-rapport** linked to sag (regulatory requirement — `service_case_attachments` exists, 0 rows).
- **Signed customer acceptance**: `customer_signature` + `signed_at` already on `service_cases` ✓

### 1.4 Kalender / Dagsoversigt

**Purpose:** drag-drop scheduling of medarbejdere onto sager + visual capacity.

**Pages**
- `/dashboard/calendar` — multi-resource timeline view (medarbejdere as rows, days as columns)
- `/dashboard/calendar/day` — today's plan
- `/dashboard/calendar/week` — week ahead
- `/dashboard/orders/[id]/schedule` — book employees onto a specific sag

**Tables (new)**
- `case_assignments` — sag_id, employee_id, planned_start, planned_end, status (booked/started/done)
- `case_calendar_events` (or extend work_orders to be the day-level schedule slot for a sag)

**Relations**
- 1 sag → N case_assignments
- 1 employee → N case_assignments
- Constraint: employee cannot be double-booked (overlap check)

**Critical for Elta Solar**
- Capacity warnings: "Henrik er fuldt booket onsdag — flyt eller hyr ekstra"
- Default plan-from-offer: when offer accepts, copy `valid_until` + `estimated_hours` into a draft schedule

### 1.5 Medarbejdere (Employees)

**Purpose:** workforce management with rates, departments, contact data.

**Pages (Phase 16 WIP — `6b552c6` has DB+actions, no UI)**
- `/dashboard/employees` — list + search + filters (active/inactive, role, department)
- `/dashboard/employees/new` — create form
- `/dashboard/employees/[id]` — profile: Overblik · Stamdata · Satser · Timer · Sager · Historik
- `/dashboard/employees/[id]/edit`

**Tables (already designed in 00096)**
- `employees` (extended): name, email, employee_number, address fields, phone, role, hire/termination, notes
- `employee_compensation` (1:1): hourly_wage, internal_cost_rate, sales_rate, %-fields, real_hourly_cost (generated)
- `employee_compensation_history` (audit per change)

**Relations**
- 1 employee → N time_logs
- 1 employee → N case_assignments
- 1 employee → N invoice_lines (when WO billed)

**Critical for Elta Solar**
- **Autorisationsniveau**: lærling / svend / installatør / autoriseret installatør → drives what work types they can be assigned to.
- **Certificater**: KLS-kursus, kørekort kategori, høje-stiger-certifikat, AT-certifikater. Add `employee_certificates` table.
- Self-service login as `montør` role: see only own time + own assigned sager.

### 1.6 Timer (Time tracking)

**Purpose:** every employee hour traces to a sag with billable status, approval flow.

**Pages**
- `/dashboard/time` — montør mobile-first: start/stop timer, manual entry, today's summary
- `/dashboard/time/approve` — serviceleder approval queue
- `/dashboard/employees/[id]/time` — history per employee
- `/dashboard/orders/[id]` Timer tab — all logs on this sag

**Tables (existing, need extension)**
- `time_logs` (existing) — start_time, end_time, hours, cost_amount, billable, invoice_line_id
- New on time_logs: `approval_status` (pending/approved/rejected), `approved_by`, `approved_at`, `geo_lat`, `geo_lng`, `note`, `photo_url`

**Relations**
- 1 time_log → 1 employee
- 1 time_log → 1 work_order (currently — should be → 1 service_case after Sprint 2 consolidation)
- Time_log → invoice_line_id (set when billed)

**Critical for Elta Solar**
- **Approval gate before billing.** Currently time logs flow straight into invoices. Add `approved_at IS NOT NULL` to billable rollup query.
- **GPS stamp on start/stop** — Ordrestyring shows arrival markers.
- **Photo at completion** — required by Elta's QC + warranty claims.

### 1.7 Materialer / Varer (Items)

**Purpose:** parts catalogue + stock + booking onto sager.

**Pages**
- `/dashboard/items` — search across `supplier_products` (282k rows already) + `materials` catalog (11 internal items)
- `/dashboard/items/[supplierProductId]` — detail with price history, stock, customer-specific overrides
- `/dashboard/orders/[id]` Materialer tab — book item onto sag with quantity + unit price snapshot

**Tables (existing, need additions)**
- `supplier_products` (282k rows): cost_price, list_price, supplier_id, supplier_sku
- `materials` (11): internal naming
- `materials_catalog` (19)
- New: `case_materials` — sag_id, supplier_product_id (or material_id), quantity, unit, unit_cost (snapshot at time of booking), unit_sales_price, total_cost, total_sales, billed_to_invoice_line_id
- New: `inventory` — supplier_product_id, qty_on_hand, location (lager A/B), min_stock

**Relations**
- 1 case_material → 1 sag
- 1 case_material → 1 supplier_product (or 1 material)
- 1 case_material → 0..1 invoice_line (set when billed)

**Critical for Elta Solar**
- Customer-specific pricing already exists (`customer_supplier_prices` 0 rows, `customer_product_prices` 0 rows) — **wire into case_materials price snapshot.**
- AO/LM live search already in `searchSupplierProductsForOffer` — extend to case_materials picker.

### 1.8 Leverandører (Suppliers)

**Purpose:** master record of suppliers + credentials + sync state.

**Pages (mostly exist)**
- `/dashboard/settings/suppliers` — list (2 suppliers in prod: AO, LM)
- `/dashboard/settings/suppliers/[id]` — detail with credentials + sync schedule
- `/dashboard/settings/suppliers/[id]/products` — paginated product browser

**Tables (existing)**
- `suppliers`, `supplier_settings`, `supplier_credentials` (encrypted), `supplier_sync_jobs/logs/schedules`, `supplier_margin_rules`, `supplier_product_cache`

**Critical for Elta Solar**
- Health monitoring (LM SFTP) — already implemented.
- **e-conomic supplier mapping**: each supplier needs an `external_supplier_id` (already added in migration 00094). Used by `pushSupplierInvoiceToEconomic`. Currently empty.

### 1.9 Leverandørfaktura (Incoming supplier invoices)

**Purpose:** receive, parse, match, approve, post supplier invoices.

**Pages (Phase 15.2 — exists)**
- `/dashboard/incoming-invoices` — queue with filter tabs (needs_review/awaiting_approval/approved/rejected/posted)
- `/dashboard/incoming-invoices/[id]` — detail with parsed fields, match breakdown, audit log, approve/reject/override

**Tables (existing — Phase 15)**
- `incoming_invoices`, `incoming_invoice_lines`, `incoming_invoice_audit_log`

**Relations**
- 1 supplier invoice → 1 supplier (matched)
- 1 supplier invoice → 0..1 sag (matched via `matched_work_order_id` — should be `matched_case_id` post-Sprint 2)
- 1 supplier invoice → 0..1 e-conomic external invoice

**Critical for Elta Solar**
- AO/LM email ingest — code ready, never received a real invoice in prod (`incoming_invoices` = 0 rows).
- Sag-impact: when approved, line items should be added to `case_materials` (via supplier_product_id match) so the sag's material cost reflects reality.

### 1.10 Kundefakturaer (Outgoing invoices)

**Purpose:** generate invoices from sager (multi-stage billing) + send + track payment.

**Pages (skeleton only)**
- `/dashboard/invoices` — list (today: read-only minimal)
- `/dashboard/invoices/new` — wizard: pick sag → pick lines → calculate
- `/dashboard/invoices/[id]` — detail with PDF preview + send + mark-paid + e-conomic push status
- `/dashboard/orders/[id]` Fakturakladde tab — draft of next invoice from un-billed work

**Tables (existing — Phase 5)**
- `invoices`, `invoice_lines`, `invoice_payments`, `invoice_reminder_log`, `invoice_number_counters`

**Relations**
- 1 invoice → 1 sag (currently `invoices.work_order_id` — rename to `invoices.case_id` post-Sprint 2)
- 1 invoice → 0..1 offer (`invoices.offer_id`)
- 1 invoice → N invoice_lines, each → 0..1 time_log + 0..1 case_material (provenance)
- 1 invoice → N invoice_payments
- 1 invoice → 0..1 e-conomic external invoice

**Critical for Elta Solar**
- **PDF generator** — backend uses `@react-pdf/renderer` for offers; reuse for invoices. No `/api/invoices/[id]/pdf` exists yet.
- **Multi-stage billing**: forskud (e.g. 30% af tilbud før opstart), rate (når montage er færdig), slut (efter inspektion). Each invoice carries `stage` field + `parent_invoice_id` for tracking.
- **OIOUBL/EAN export** for offentlige kunder.

### 1.11 Økonomi / Dækningsbidrag

**Purpose:** real-time profit visibility per sag, per kunde, per medarbejder, per måned.

**Pages**
- `/dashboard/orders/[id]` Økonomi tab — live snapshot
- `/dashboard/reports` — aggregations (top customers by DB, lowest-margin sager, employee productivity)

**Tables (existing — Phase 8)**
- `work_order_profit` (snapshots)

**Calculation formulas** (already implemented in `calculate_work_order_profit` RPC, needs migration to case_id)
```
revenue        = sum(invoice_lines on sag)            // ex-VAT
labor_cost     = sum(time_logs.cost_amount on sag)     // includes overhead
material_cost  = sum(case_materials.total_cost)         // supplier cost × quantity
other_cost     = sum(case_other_costs.amount)
total_cost     = labor + material + other
profit         = revenue - total_cost
margin_pct     = profit / revenue × 100
```

**Critical for Elta Solar**
- **DB pr. medarbejder pr. sag** — already designed in `calculateEmployeeProjectImpact` (`employee-economics.ts`). Currently 0 data.
- **Rest at fakturere** = (offer_total - sum_of_invoiced) — needs offer link.

### 1.12 Dokumentation

**Purpose:** every photo, KLS form, signed paper, supplier delivery slip — attached to a sag.

**Pages**
- `/dashboard/orders/[id]` Dokumentation tab — file grid + upload + KLS form generator + sign-off PDF

**Tables**
- `service_case_attachments` (existing, 0 rows) — needs to be the canonical store
- `customer_documents` (existing, 2 rows) — keep for customer-level docs (CVR, certificate of insurance)
- New: `kls_form_templates` + `kls_form_submissions` — regulatory

**Critical for Elta Solar**
- **KLS-formularer** — gruppe-skema, måler-skema, autorisation-mærkat. Required by SikkerhedsStyrelsen.
- Photos with EXIF location stamp — proof for warranty claims.

### 1.13 Systemindstillinger

**Purpose:** firmaoplysninger, tekster, integrationer, abonnement, brugerrettigheder.

**Pages (mostly exist)**
- `/dashboard/settings/company` — CVR, adresse, logo, kontaktoplysninger
- `/dashboard/settings/integrations` — e-conomic, Microsoft Graph, GatewayAPI
- `/dashboard/settings/team` — bruger/rolle administration
- `/dashboard/settings/email` — SMTP / templates
- `/dashboard/settings/notifications` — reminder cadence
- `/dashboard/settings/packages` — Phase 12 sales packages
- New: `/dashboard/settings/subscription` — Vercel Pro / Supabase tier / e-conomic plan

**Tables (existing)**
- `company_settings` (1 row)

**Critical for Elta Solar**
- **Faste tekster** — already covered by `sales_text_blocks` (intro/closing) + `email_templates` + `offer_text_templates`. Consolidate.
- **Brugerrettigheder editor** — flip role per profile from a UI (currently SQL-only). Add `/dashboard/settings/team/[id]/edit`.

### 1.14 Roller / Rettigheder

**Purpose:** explicit RBAC governing what each role sees + does.

**Roles (existing in profiles enum)**
- `admin` — alt
- `serviceleder` — opret sager, godkend timer, send fakturaer (men IKKE flytte regler i Go-Live)
- `montør` — se egne sager + tider, log timer, upload fotos
- `user` (fallback)
- `technician` (legacy)

**Tables**
- `profiles.role` (existing, 5 values)
- New: `role_permissions` (role, action, allowed) — granular if needed later

**Critical for Elta Solar**
- **Montør sees only own data**: enforced via RLS — already the pattern in `employees_select_admin_or_self` policy added in 00096.
- **Serviceleder approves time, NOT compensation** — needs role check in `setEmployeeCompensationAction` (currently admin-only — consider 2-tier).

---

## 2. Schema consolidation decision (must happen in Sprint 2)

The biggest architectural debt is **three tables doing the same job**: `service_cases`, `work_orders`, `projects`.

| Aspect | service_cases | work_orders | projects |
|---|---|---|---|
| Production rows | 1 | 0 | 0 |
| Has case_number? | ✓ | uses work_order title only | project_number |
| Has GPS / KSR / EAN? | ✓ (Elta-specific) | ✗ | ✗ |
| Has customer_signature? | ✓ | ✗ | ✗ |
| Has assigned_employee? | ✗ (uses generic assigned_to) | ✓ (single) | ✓ (multi: assigned_technicians[]) |
| Has scheduled_date? | ✗ | ✓ (single date) | ✓ (start_date + end_date) |
| Has budget / actual_cost? | ✗ | ✗ | ✓ |
| Has profit auto-snapshot? | ✗ | ✓ (Phase 8 trigger) | ✗ |
| Has invoice link? | ✗ | ✓ (`invoices.work_order_id`) | ✗ |

**Decision:** `service_cases` becomes the canonical sag. Drop the duplication.

**Migration path (Sprint 2 detail)**
1. Extend `service_cases` with the missing fields: `project_name`, `type` enum, `reference`, `requisition`, `formand_id`, `planned_hours`, `contract_sum`, `revised_sum`, `start_date`, `end_date`, `budget`, `auto_invoice_on_done`, `low_profit`.
2. Create `case_assignments` to replace `work_orders` (one row per planned employee-on-day instead of one work_order per day).
3. Migrate FK references: `time_logs.work_order_id` → `time_logs.case_id` (with backward-compat). `invoices.work_order_id` → `invoices.case_id`. `incoming_invoices.matched_work_order_id` → `matched_case_id`. `work_order_profit.work_order_id` → `case_id`.
4. Drop `projects` and `work_orders` after migration verified (kept as views for 1 release for any external consumers).

This is risky but **must** happen — otherwise the ERP keeps splitting between the old "service case" mental model and the new "work order" mental model and operators will get confused.

---

## 3. The Sag (Case) detail spec — the centre of the system

The single most important page to get right: `/dashboard/orders/[id]`.

### Header (always visible)
```
[CASE-2026-0042] Solcelleanlæg 6kWp · Familien Hansen
Status: I gang   Type: solcelleanlæg   Ansvarlig: Henrik   Formand: Lars
Planlagt: 2026-05-15 → 2026-05-17   Timer: 24/40 (60%)
Kontraktsum: 89.000 kr   Faktureret: 26.700 kr (30%)   DB: 38%
```

### Tabs (in order)

**1. Overblik**
- 2 columns: Kunde-side (kunde, kontaktperson, fakturaadresse, leveringsadresse, EAN/KSR) | Sag-side (type, ansvarlig, formand, planlagt, status)
- Quick-actions: Book medarbejder, Opret faktura, Send statusopdatering, Marker afsluttet

**2. Timer**
- Table: dato · medarbejder · start · slut · timer · sats · faktureret? · godkendt? · noter
- Sum row: total / billable / approved
- Buttons: Start timer (montør), Manuel registrering, Bulk-godkend (serviceleder)

**3. Materialer**
- Table: dato · vare · antal · enhed · købspris · salgspris · DB · faktureret? · leverandør
- Add: search supplier_products + materials
- Bulk-import from leverandørfaktura when one matches this sag

**4. Øvrige omkostninger**
- Table: dato · type (kørsel/leje/under/bonus) · beskrivelse · beløb · kvittering
- Mileage entries linked to time_logs

**5. Økonomi** (read-only)
- Income: Tilbud · Revideret · Fakturering pr. faktura · Total faktureret · Resterende
- Cost: Timer (cost) · Materialer (cost) · Øvrige · Sum
- DB / dækningsgrad / margin %
- Drill-down on every cell

**6. Aktivitet**
- Audit timeline: status changes, employee bookings, invoice events, supplier invoice matches, comments

**7. Dokumentation**
- File grid + upload
- KLS form generator (shows applicable forms for this `type`)
- Customer signed copy

**8. Fakturakladde**
- Auto-generated draft from un-billed time + un-billed materials
- Adjustable lines (rep can override quantities, descriptions)
- One-click "Opret faktura"

**9. Handlinger**
- Marker afsluttet (triggers KLS check)
- Slet (with reason)
- Klon til ny sag
- Eksportér til e-conomic

---

## 4. Existing-vs-needed — module-by-module gap

| Module | Today | Gap to ERP target | Effort |
|---|---|---|---|
| Customers | UI works, RLS now on (4fbe6fd), 8 rows | Add EAN field at customer level, segments, multi-contact UI | M |
| Offers | Full lifecycle works | Wire `<PackagePicker>` (5 min), version history (M) | S |
| **Sag/Order** | 3 overlapping tables, none used as ERP centre | **Consolidate into service_cases + extend with planning/economics fields. Build full tabs page.** | **L** |
| Calendar | Read-only static page | Build drag-drop multi-resource view, capacity warnings | L |
| Employees | DB+actions WIP (6b552c6), 0 UI | Build 4 pages (list/new/[id]/edit) | M |
| Time | Table exists, 0 logs, no UI | Mobile montør UI + approval queue + GPS/photo | L |
| Materials | 282k supplier_products + 11 internal | Build case_materials booking UI + customer pricing wire-in | M |
| Suppliers | Admin pages exist | Wire supplier_id sync to e-conomic | S |
| Leverandørfaktura | Phase 15.2 UI exists | Wire approved invoice → case_materials inserts | S |
| Kundefaktura | Read-only list, no CRUD | Build create wizard + PDF + multi-stage billing | L |
| Økonomi | RPC + 0 snapshots | Wire snapshot trigger to case_id post-consolidation, build /reports | M |
| Dokumentation | service_case_attachments empty | Build doc grid + KLS form templates table + PDF generator | L |
| Systemindstillinger | Most pages exist | Add subscription page, faste tekster consolidation | S |
| RBAC | enum exists, mostly admin-only writes | Tighten serviceleder vs admin separation, build role editor UI | M |

**Effort key:** S = ≤2 days, M = 3-7 days, L = 1-2 weeks.

---

## 5. Sprint plan (sequential, no parallel sprints — one operator)

### Sprint 1 — Security / RLS hardening ✅ DONE
- ✅ Enable RLS on customers/leads/offers/projects/messages (`4fbe6fd`)
- ✅ Type-check + build green
- ✅ Production deployed
- Remaining: GDPR endpoints, KLS form templates table — **deferred to Sprint 9**

**Acceptance:** all 5 tables have rowsecurity=true; service_role bypasses; portal pages still accessible (curl /view-offer/[id] returns 200 for valid offer; 404 for non-existent).

### Sprint 2 — Sag/Ordre as the centre **(THE PIVOTAL SPRINT)**
- Migration: extend `service_cases` with project fields (project_name, type, reference, requisition, formand_id, planned_hours, contract_sum, revised_sum, start_date, end_date, budget, auto_invoice_on_done, low_profit)
- Migration: create `case_assignments` (replaces work_orders)
- Migration: rename FKs `work_order_id` → `case_id` on `time_logs`, `invoices`, `incoming_invoices.matched_work_order_id`, `work_order_profit`
- Build `/dashboard/orders/[id]` with all 9 tabs (skeleton — wire data progressively in later sprints)
- Build `/dashboard/orders` list with status pipeline
- Migrate `/dashboard/service-cases` traffic to redirect to `/dashboard/orders`
- Update existing actions/services that reference work_orders

**Acceptance:**
- Single canonical "sag" table (service_cases) — `projects` and `work_orders` are views for compat or dropped
- /dashboard/orders/[id] renders all 9 tabs (data may be empty)
- Existing 1 service_case row + 0 work_orders + 0 projects unified — can drill into the row through the new UI

**Files affected:** ~30 files (every place that imports work_order_id; rename pattern). Single PR, multiple commits per logical step.

### Sprint 3 — Kunder + Tilbud koblet til sager
- Customer detail tabs: Sager, Tilbud, Fakturaer
- Customer EAN field migration (move from service_cases.ean_number to customers.ean_number)
- Wire `<PackagePicker>` into `/dashboard/offers/[id]`
- Auto-create sag on offer accept (replace existing autopilot rule's effect with explicit case creation)

**Acceptance:** opening any customer's profile shows their sager and tilbud. Accepting an offer creates a service_case row (visible in /dashboard/orders).

### Sprint 4 — Timer + Medarbejdere + Kalender
- Build employee UI (resume `6b552c6` WIP — list/new/[id]/edit)
- Build time entry mobile UI `/dashboard/time` (start/stop, manual, today)
- Build approval queue `/dashboard/time/approve`
- Add `time_logs.approval_status / approved_by / approved_at` columns
- Gate billable rollup on approved_at IS NOT NULL
- Build calendar drag-drop (`react-big-calendar` or similar)

**Acceptance:** montør can start/stop a timer on a sag from mobile and see it on /dashboard/orders/[id] Timer tab. Serviceleder approves, billable rollup includes only approved hours.

### Sprint 5 — Materialer + Øvrige omkostninger
- Migration: `case_materials`, `case_other_costs`
- UI: Materialer tab (search + book), Øvrige omkostninger tab (manual entry)
- Wire customer-specific pricing snapshot at booking time
- Wire supplier-invoice line items → case_materials when matched

**Acceptance:** booking a material on a sag deducts cost from inventory (if tracked) and shows on Økonomi tab. Supplier invoice approval auto-adds to materials.

### Sprint 6 — Faktura + e-conomic
- Build `/dashboard/invoices` create wizard (pick sag → pick un-billed lines → calculate)
- Build `/dashboard/invoices/[id]` detail
- Build `/api/invoices/[id]/pdf` route (`@react-pdf/renderer`)
- Multi-stage billing (`stage` enum: forskud / rate / slut, `parent_invoice_id`)
- Configure e-conomic credentials in production (insert settings row + sandbox-validate)
- Wire createInvoiceInEconomic + markInvoicePaidInEconomic against real agreement
- OIOUBL export for offentlige kunder

**Acceptance:** create a real invoice in prod, send to a real customer, post to e-conomic sandbox successfully, see external_invoice_id stored.

### Sprint 7 — Leverandørfaktura
- Wire approved supplier invoice → case_materials line items (auto-insert based on parsed lines)
- Configure AO API endpoint + LM SFTP invoice path in production
- Watch one full cycle: AO/LM emails invoice → cron picks up → parser extracts → matcher resolves sag → admin approves → e-conomic supplier invoice created → case_materials updated → economy tab updates

**Acceptance:** one real supplier invoice flows end-to-end through prod and lands as cost on a sag.

### Sprint 8 — Rapportering / DB
- `/dashboard/reports` aggregations: DB pr. sag, DB pr. kunde, DB pr. medarbejder, månedlig top-line
- Per-sag profit snapshot widget on /dashboard/orders/[id] Økonomi tab
- Forecast: open offers × conversion rate (already exists in Phase 9 forecast service)
- Export to Excel/CSV

**Acceptance:** stakeholder can answer in 30 seconds: "hvilke sager taber penge denne måned" / "hvilken medarbejder har højest produktivitet" / "hvad er pipeline næste 30 dage".

### Sprint 9 — Polish / Test / Production hardening
- KLS form templates + submissions tables (regulatory)
- GDPR data export + deletion endpoints
- Vercel Pro upgrade — restore sub-daily cron schedules
- Restore original layout if any minimal version still active
- Remove all debug routes
- E2E tests (Playwright) for the critical flows: offer→sag→time→invoice→e-conomic
- Documentation: README, runbook, onboarding for next operator
- Backup + restore drill

**Acceptance:** ship 1.0. Real customer can use the system without operator hand-holding. KLS forms generate correctly. GDPR data-request returns within 24h.

---

## 6. Estimated calendar

| Sprint | Calendar weeks | Calendar days |
|---|---|---|
| 1 ✅ done | (already shipped) | 0.5 |
| 2 (sag pivot) | 2 | 10 |
| 3 (kunder + tilbud) | 1 | 5 |
| 4 (timer + medarbejdere + kalender) | 2 | 10 |
| 5 (materialer + øvrige) | 1 | 5 |
| 6 (faktura + e-conomic) | 2 | 10 |
| 7 (leverandørfaktura) | 1 | 5 |
| 8 (rapportering) | 1 | 5 |
| 9 (polish) | 2 | 10 |
| **Total** | **12 weeks** | **~60 working days** |

**~3 calendar months at full focus** (one developer, no parallel sprints, no scope drift). Realistic if Elta accepts no new features during the build.

---

## 7. Stop / Go decisions (from the audit)

### STOP — do not build any of these until Sprint 9:
- Phase 16+ employee module finishing on its own track (folded into Sprint 4)
- Relatel CTI integration
- AO/LM order placement (read-only suffices for now)
- Intranet / knowledge base
- Multi-version offer revisions
- Calendar dispatcher beyond what Sprint 4 needs
- AI optimization deeper dives
- Any feature not in the 9-sprint list

### CONTINUE — already in scope:
- Sprint 1 RLS — done
- Sprint 2 sag consolidation — next
- Employee module WIP (`6b552c6`) — folded into Sprint 4, do NOT extend in isolation

### KILL — remove from codebase:
- `/dashboard/test123` and `/api/debug` — already removed (`1bdc376`)
- `projects` table — drop after Sprint 2 migration verified
- Unused `messages` table → check if `email_messages` covers the use-case
- Legacy `time_entries` → keep until Sprint 4 verifies `time_logs` has parity

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Sag consolidation breaks existing working flows (offers, invoices, time_logs) | Sprint 2 ships behind a feature flag; old paths kept until parity verified |
| e-conomic sandbox doesn't match prod agreement | Acquire sandbox credentials during Sprint 6 prep; test 3 invoices end-to-end |
| Mobile montør UX (Sprint 4) is awkward | Use existing montør role redirect to /dashboard/tasks as a starting frame; iterate with Lars/Henrik in week 1 of Sprint 4 |
| Vercel Hobby tier limits cron frequency | Plan upgrade to Pro before Sprint 6 (system-health-check needs sub-daily again) |
| GDPR / KLS slips to Sprint 9 | Hard stop: do not invite any external customer to use the system before Sprint 9 closes |
| Scope creep mid-sprint | Each sprint has explicit acceptance criteria; nothing else ships in that sprint until criteria pass |

---

## 9. What I as senior fullstack will need from the operator

To move efficiently, the user (Henrik) only needs to provide:

1. **Sprint 6**: e-conomic sandbox credentials (or live agreement tokens). Without this Sprint 6 is blocked.
2. **Sprint 4**: a montør (Henrik or Lars) to test the mobile UI for 30 minutes mid-sprint.
3. **Sprint 7**: an AO/LM supplier invoice forwarded to the configured mailbox so we can verify ingest end-to-end.
4. **Sprint 9**: regulatory contact (KLS-rådgiver) to verify the KLS form templates match SikkerhedsStyrelsen requirements.

Everything else (architecture, schema, code, UI, tests, deployment, monitoring) is on the developer side — operator describes the business need, developer delivers.

---

## Decision required

If this plan is acceptable, **next concrete action: Sprint 2.** Migration to consolidate service_cases as the canonical sag, plus skeleton `/dashboard/orders/[id]` page with all 9 tabs.

If you want to revise scope, sequence, or add modules — say so before Sprint 2 starts. Once Sprint 2 begins, the schema migration is destructive enough that mid-sprint pivots are expensive.
