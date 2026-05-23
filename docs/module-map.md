# ELTA CRM/ERP — Module Map

> Modul-modenhed: ✅ Færdigt · 🟡 Delvist færdigt · 🔴 Fragmenteret/halvfærdigt
> Sidst opdateret: Sprint 10A.

## Customers

| | |
|---|---|
| Formål | Kunde-CRUD, kontakter, dokumenter, opgaver, mail-timeline, aktivitet, besigtigelse, portal-adgang |
| Centrale filer | `src/app/dashboard/customers/{page,[id]/page}.tsx`, `customer-detail-client.tsx`, `customer-form.tsx`, `src/components/modules/customers/*` (15+ komponenter) |
| Server actions | `customers.ts`, `customer-relations.ts`, `customer-documents.ts`, `customer-tasks.ts`, `customer-mailbox.ts`, `customer-flow.ts` |
| Centrale tabeller | `customers`, `customer_contacts` (med `role` ⚠️), `customer_documents`, `customer_tasks`, `customer_product_prices`, `customer_supplier_prices` |
| Afhængigheder | Auth, Email, Documents, Tasks, Offers, Service Cases |
| Modenhed | 🟡 |
| Risici | `customer_contacts.role` brugt uden migration i repo. `customer_number`-generation konsolideret men SQL-funktion fra 00004 stadig i DB som dead code |

## Leads

| | |
|---|---|
| Formål | Lead-pipeline (kanban + tabel), AI-mailassistent integreret, status-flow |
| Centrale filer | `src/app/dashboard/leads/{page,[id]/page}.tsx`, `leads-kanban.tsx`, `leads-table.tsx`, `lead-form.tsx` |
| Server actions | `leads.ts` |
| Centrale tabeller | `leads`, `lead_activities` |
| Afhængigheder | Customers, Email (AI mail-assistant), Offers (lead→offer flow) |
| Modenhed | ✅ |
| Risici | Lead → Customer-konvertering er ikke fuldt automatiseret (manuel via UI) |

## Offers (Tilbud)

| | |
|---|---|
| Formål | Tilbudssystem — header + line items + pakker + status-flow + reminders + PDF + portal-signatur |
| Centrale filer | `src/app/dashboard/offers/{page,[id]/page}.tsx`, `offer-form.tsx`, `offers-table.tsx`, `line-item-form.tsx`, `offer-activity-timeline.tsx`, `offer-to-case-card.tsx` |
| Server actions | `offers.ts`, `offer-pricing.ts`, `offer-to-case.ts`, `offer-activities.ts`, `quote-actions.ts`, `public-offer.ts` (token-baseret accept) |
| Services | `quote-generator.ts`, `offer-automation.ts`, `auto-offer.ts`, `offer-packages.ts`, `offer-starter-packs.ts` |
| Centrale tabeller | `offers`, `offer_line_items`, `offer_signatures`, `offer_activities`, `offer_reminders`, `offer_packages`, `sent_quotes` |
| Mail-routing | `resolveOfferMailRoute`, `resolveOfferReminderRoute`, `resolveQuoteMailRoute` |
| Afhængigheder | Customers, Kalkia, Suppliers, Email, Service Cases (offer→case) |
| Modenhed | ✅ for hovedflow, 🟡 for sagspartner-model |
| Risici | **Kun `customer_id`** — ingen orderer/payer/end_customer på offers. Mikma-scenariet IKKE understøttet på tilbud |

## Service Cases / Orders (Sager)

| | |
|---|---|
| Formål | Canonical "sag/ordre"-entitet med fuld sagspartner-model, knyttet til offer + work orders |
| Centrale filer | `src/app/dashboard/service-cases/{page,[id]/page}.tsx`, `src/app/dashboard/orders/{page,new,[id]/{page,edit}}.tsx`, `service-cases-client.tsx`, `components/modules/orders/edit-site-info-dialog.tsx` |
| Server actions | `service-cases.ts`, `service-case-parties.ts`, `service-case-economy.ts`, `service-case-site.ts`, `service-case-route-preview.ts` (Phase 6a) |
| Centrale tabeller | `service_cases` (med 00062 + 00066 + 00098 + 00112), `service_case_attachments`, `case_materials`, `case_other_costs`, `case_notes` |
| Mail-routing | `resolveServiceCaseConfirmationRoute`, `resolveBesigtigelseMailRoute` (med site_contact > site_customer > paying_customer) |
| Afhængigheder | Customers, Offers, Work Orders, Documents, Email, Invoices |
| Modenhed | 🟡 |
| Risici | **Site-felter (00111) mangler i repo**. Orders og Service-cases UI er to indgange til samme entitet — kan forvirre. Parti-roller (00112) findes, men offers + invoices respekterer dem ikke |

## Tasks (Opgaver)

| | |
|---|---|
| Formål | Kunde-knyttede opgaver med reminder, snooze, auto-email |
| Centrale filer | `src/app/dashboard/tasks/page.tsx`, `customer-tasks.tsx`, `task-reminder-overlay.tsx` (sticky polling-overlay) |
| Server actions | `customer-tasks.ts`, `task-mail.ts`, `auto-tasks.ts` |
| Centrale tabeller | `customer_tasks` (00053 + 00054 + 00110) |
| Mail-routing | `resolveTaskMailRoute` |
| Afhængigheder | Customers, Email (auto-task fra mail), Auth |
| Modenhed | 🟡 |
| Risici | **Ingen `service_case_id`** — opgaver kan ikke kobles til sag. Parallel til work_orders som også er "to-do" — uklar opdeling |

## Work Orders (Daglig drift)

| | |
|---|---|
| Formål | Dagstildelinger for montører, bundet til service_case og employee |
| Centrale filer | `src/app/dashboard/orders/*` (delt med service-cases UI) |
| Server actions | `work-orders.ts` |
| Services | `work-orders.ts`, `time-tracking.ts`, `profitability.ts` |
| Centrale tabeller | `work_orders`, `time_logs` (00086) — bemærk `time_entries` (00006 legacy) stadig eksisterer |
| Afhængigheder | Service Cases, Employees, Invoices (work_order → invoice 00087) |
| Modenhed | ✅ |
| Risici | Legacy `time_entries` tabel sameksister med `time_logs` |

## Employees

| | |
|---|---|
| Formål | HR-records adskilt fra auth.profiles |
| Centrale filer | `src/app/dashboard/employees/*` |
| Server actions | `employees.ts`, `time-logs.ts`, `case-materials.ts`, `case-other-costs.ts` |
| Services | `employee-economics.ts`, `time-tracking.ts`, `profitability.ts` |
| Centrale tabeller | `employees` (00086 + 00096), `work_orders`, `time_logs`, `payroll`-relateret (00088) |
| Afhængigheder | Auth (profile_id FK), Work Orders, Invoices |
| Modenhed | ✅ |
| Risici | Ingen kendte |

## Documents (Customer Documents)

| | |
|---|---|
| Formål | PDF + bilag knyttet til kunde — besigtigelsesrapporter, fuldmagter, mail-attachments, manuel upload |
| Centrale filer | `customer-documents-tab.tsx`, `send-besigtigelsesreport-dialog.tsx` (Phase A, kodet, ikke deployed) |
| Server actions | `customer-documents.ts`, `besigtigelse.ts`, `fuldmagt.ts`, `files.ts` |
| Centrale tabeller | `customer_documents` (00052), `service_case_attachments` (00066) — to parallelle systemer |
| Storage | `attachments` bucket (private), sti `customer-documents/{customer_id}/...` |
| Mail-routing | Phase A: `sendExistingBesigtigelsesreport` |
| Afhængigheder | Customers, Service Cases (efter 00114), Email (send) |
| Modenhed | 🔴 |
| Risici | `service_case_id` ikke kørt i prod (00114 venter). `customer_documents` + `service_case_attachments` parallelle — ingen klare regler. Mail-bilag i `incoming_emails.attachment_urls` JSONB (tredje system) |

## Email / Mail Bridge

| | |
|---|---|
| Formål | Microsoft Graph integration — multi-mailbox sync, incoming linker, AI-detection, send + reply |
| Centrale filer | `src/app/dashboard/mail/*`, `EmailTimeline.tsx`, `SendEmailModal.tsx`, `customer-email-timeline.tsx` |
| Server actions | `email.ts`, `incoming-emails.ts`, `customer-mailbox.ts`, `mail-recipients.ts`, `outbound-attachments.ts`, `task-mail.ts`, `ai-mail-assistant.ts` |
| Services | `microsoft-graph.ts`, `email-linker.ts`, `email-sync-orchestrator.ts`, `email-ao-detector.ts`, `email-intelligence.ts`, `email-intelligence-summary.ts`, `email-attachment-storage.ts` |
| Mail-routing | `mail-routing.ts` (types/helpers), `mail-route-resolvers.ts` (12 resolvers), `service-case-route-preview.ts` (Phase 6a shadow-log) |
| Centrale tabeller | `email_threads`, `email_messages`, `email_templates` (00033 — outbound), `incoming_emails` (00049 — inbound), `email_intelligence_logs` (00072), `graph_sync_state`, `email_threading_columns` (00070), `multi_mailbox` (00071) |
| Cron | `/api/cron/email-sync` (`0 5 * * *` ⚠️ — kode-kommentar siger "every 5 min") |
| Afhængigheder | Customers, Service Cases, Tasks, Documents, Offers, Invoices |
| Modenhed | 🟡 |
| Risici | Outbound/inbound har separate datamodeller — ingen unified message-view. Cron-frekvens-inkonsistens. Email-link er kun email+name-fuzzy (Mikma-scenariet svært). `email_threads.offer_id` er primær FK — forældet design |

## Invoices (Faktura)

| | |
|---|---|
| Formål | Faktura-system med multi-stage, predecessors, kreditnotaer, bankmatch, accounting |
| Centrale filer | `src/app/dashboard/invoices/{page,[id]/page}.tsx` |
| Server actions | `invoices.ts`, `invoice-stage.ts`, `invoice-credit.ts`, `invoice-from-case.ts`, `bank-payments.ts` |
| Services | `invoices.ts`, `economic-client.ts`, `invoice-from-case.ts` |
| Centrale tabeller | `invoices` (00080 + 00088), `invoice_lines`, `invoice_reminders` (00081), `invoice_payment_tracking` (00082), `bank_transactions` (00083), `invoice_predecessors` (00106), `invoice_credit_notes` (00107), `accounting_integration` (00084) |
| Mail-routing | `resolveInvoiceMailRoute` |
| Cron | `/api/cron/invoice-reminders` (dagligt 07:00), `/api/cron/bank-match` (dagligt 06:30) |
| Afhængigheder | Customers, Offers, Service Cases, Work Orders, e-conomic |
| Modenhed | ✅ for flow, 🟡 for sagspartner |
| Risici | **Kun `customer_id`** — ingen parti-roller. Hvis betaler ≠ kunde-på-sagen sendes faktura forkert |

## Incoming Invoices (Leverandørfakturaer)

| | |
|---|---|
| Formål | Modtagelse af leverandør-fakturaer fra email/upload med parser + matcher + manuel review |
| Centrale filer | `src/app/dashboard/incoming-invoices/{page,[id]/page}.tsx` |
| Server actions | `incoming-invoices.ts` |
| Services | `incoming-invoice-parser.ts`, `incoming-invoice-matcher.ts`, `incoming-invoice-conversion.ts`, `incoming-invoices.ts` |
| Centrale tabeller | `incoming_invoices` (00094), `incoming_invoice_lines`, `incoming_invoice_audit_log`, `incoming_invoices_review_layer` (00095), `incoming_invoices_matched_case_id` (00102), `incoming_invoice_conversion_provenance` (00103) |
| Cron | `/api/cron/incoming-invoices` (09:15), `/api/cron/incoming-invoices-api` (09:30) |
| Afhængigheder | Suppliers, Service Cases (case-link), Invoices (conversion), Email (source_email_id) |
| Modenhed | ✅ |
| Risici | Imponerende dybde — ingen kendte arkitekturrisici |

## Customer Portal

| | |
|---|---|
| Formål | Token-baseret kundeadgang til tilbud, chat, besigtigelse, fuldmagt |
| Centrale filer | `src/app/portal/{[token]/{page,offers/[id]/page},invalid/page,page}.tsx`, `portal-dashboard.tsx`, `portal-chat.tsx`, `portal-besigtigelse.tsx`, `portal-fuldmagt.tsx` |
| Server actions | `portal.ts`, `public-offer.ts` |
| Centrale tabeller | `portal_access_tokens` (00009), `portal_messages`, `offer_signatures` |
| RLS | Anon-policies (00060/00061) brede — scoping i app-lag |
| Afhængigheder | Customers, Offers, Documents, Email (notifikationer) |
| Modenhed | ✅ |
| Risici | Anon SELECT på `customer_documents` og `service_cases` (00060/00061) tillader bred adgang — app-lag scoper, men det er svag default |

## Auth / RBAC

| | |
|---|---|
| Formål | Login, registrering, password-reset, rolle-baseret adgang |
| Centrale filer | `src/app/(auth)/*`, `src/lib/auth/{permissions,roles,page-guard,case-scope}.ts`, `src/lib/hooks/use-user-role.ts` |
| Centrale tabeller | `auth.users` (Supabase), `profiles` (00001), `permissions` (00108), `team_invitations` (00047) |
| Roller | `admin`, `serviceleder`, `montør`, `salg`, `bogholderi` (enum fra 00065) |
| Afhængigheder | Alle moduler |
| Modenhed | 🟡 |
| Risici | Dobbelt source-of-truth (TS-matrix + DB-tabel). Bred service-role-brug i cron + portal. `profiles` har ikke FK til `auth.users` (kendt issue jf. memory). RLS-policies er typisk `authenticated USING(true)` — adgangsstyring afhænger af app-lag-disciplin |

## Suppliers / Grossister

| | |
|---|---|
| Formål | AO + Lemvigh-Müller adapter-pattern, sync engine, krypterede credentials, margin-rules, fallback |
| Centrale filer | `src/app/dashboard/settings/suppliers/*` |
| Server actions | `suppliers.ts`, `supplier-sync.ts`, `sync.ts`, `margin-rules.ts`, `credentials.ts`, `supplier-health.ts`, `import.ts`, `lemu-sync.ts` |
| Services | `supplier-adapter.ts`, `supplier-api-client.ts`, `supplier-fallback.ts`, `sync-engine.ts`, `ftp-download.ts`, `sftp-download.ts`, `supplier-ftp-sync.ts`, `import-engine.ts`, `supplier-best-price.ts`, `material-catalog.ts` |
| Centrale tabeller | `suppliers`, `supplier_products`, `supplier_settings`, `supplier_credentials` (AES-256-GCM), `supplier_margin_rules`, `supplier_sync_schedules`, `supplier_sync_jobs`, `supplier_sync_logs`, `supplier_product_cache`, `customer_supplier_prices`, `customer_product_prices`, `price_history`, `price_alert_rules`, `system_alerts` |
| Cron | `/api/cron/supplier-sync` (02:00), `/api/cron/lemu-sync` (mandag 04:00) |
| Afhængigheder | Kalkia (prismatch), Offers (line items), Customers (kundespecifikke priser) |
| Modenhed | ✅ |
| Risici | Ingen kendte arkitekturrisici. Meget dybt sub-system |

## Kalkia (Calculation Engine)

| | |
|---|---|
| Formål | Avanceret kalkulationsmotor med nodes/rooms/profiles/quick-jobs + AI-lag |
| Centrale filer | `src/app/dashboard/settings/kalkia/*`, `src/components/modules/kalkia/*` |
| Server actions | `calculations.ts`, `calculator.ts`, `calculation-settings.ts`, `calculation-intelligence.ts`, `kalkia-nodes.ts`, `kalkia-variants.ts`, `kalkia-supplier-prices.ts`, `kalkia-calculations.ts`, `kalkia-settings.ts`, `quick-jobs.ts`, `packages.ts`, `components.ts`, `products.ts` |
| Services | `kalkia-engine.ts`, `calculation-intelligence.ts`, `price-engine.ts`, `electrical-engine.ts` |
| Engines | `src/lib/engines/{project-intake,offer-text-engine,risk-engine,price-explanation-engine}.ts`, `src/lib/logic/pricing.ts` |
| Centrale tabeller | ~15 kalkia-tabeller (00021, 00031, 00046, 00075-00079) |
| Afhængigheder | Suppliers (live priser), Offers (output), AI (autoProject) |
| Modenhed | ✅ |
| Risici | Calculator v1 + v2 sameksisterer (`calculator-form.tsx` + `calculator-form-v2.tsx`) — dokumentér eller sunset v1 |

## AI-moduler

| | |
|---|---|
| Formål | Mail-assistent, email-intelligence, auto-project, autopilot, calculation-intelligence |
| Centrale filer | `src/lib/ai/{projectInterpreter,autoProjectEngine,riskEngine,offerGenerator,learningEngine,calculationEngine,componentMatcher}.ts` |
| Server actions | `ai-intelligence.ts`, `ai-mail-assistant.ts`, `auto-project.ts`, `auto-tasks.ts`, `calculation-intelligence.ts`, `component-intelligence.ts`, `learning.ts` |
| Services | `email-intelligence.ts`, `email-intelligence-summary.ts`, `auto-case.ts`, `auto-offer.ts` |
| Centrale tabeller | `email_intelligence_logs` (00072), `project_interpretations` + `auto_calculations` + `auto_offer_texts` + `complexity_factors` (00045), `calculation_feedback` (00046), autopilot-tables (00090) |
| Afhængigheder | Email, Leads, Kalkia, Offers, Service Cases, AI-budget |
| Modenhed | 🟡 |
| Risici | AI-moduler er silos — ingen samlet orchestration. Autopilot (00090) oprettet med "safe default" — uklart om aktivt brugt |

## Settings / Admin

| | |
|---|---|
| Formål | Bruger-/team-/notifikations-/integration-/sikkerheds-/email-/kalkia-/supplier-/reminder-indstillinger |
| Centrale filer | `src/app/dashboard/settings/*` (mange sider) |
| Server actions | `settings.ts`, `system-alerts-admin.ts`, `credentials.ts`, `audit.ts`, `go-live.ts`, `user-activity.ts` |
| Centrale tabeller | `company_settings` (00013), `notification_preferences` (00048), forskellige `_settings`-tabeller |
| Modenhed | ✅ |
| Risici | Disparate sider — ikke samlet panel. Lav vedligeholdelsesrisiko |
