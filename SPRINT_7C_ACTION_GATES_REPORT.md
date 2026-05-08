# Sprint 7C — Action Gates Report

**Skrevet:** 2026-05-08
**Production HEAD ved rapport:** `374664a`
**Sprint scope:** Server-side permission guards på de vigtigste ikke-faktura actions.

---

## 1) Commits (5 commits + 1 docs)

| Commit | Beskrivelse |
|---|---|
| `4f950ab` | 7C-1 gate offer actions |
| `561438d` | 7C-2 gate case and order actions |
| `96d68d6` | 7C-3 gate work order and calendar actions |
| `ea6dd35` | 7C-4 gate material and other cost actions |
| `374664a` | 7C-5 gate customer actions |

---

## 2) Filer ændret

| Fil | Actions gated | CP |
|---|---|---|
| `src/lib/auth/permissions.ts` | +1 (offers.send) +50 nye keys | 7C-1, 7C-2 |
| `src/lib/actions/offers.ts` | 22 | 7C-1 |
| `src/lib/actions/service-cases.ts` | 17 | 7C-2 |
| `src/lib/actions/work-orders.ts` | 6 | 7C-3 |
| `src/lib/actions/time-logs.ts` | 4 | 7C-3 |
| `src/lib/actions/case-materials.ts` | 4 | 7C-4 |
| `src/lib/actions/case-other-costs.ts` | 4 | 7C-4 |
| `src/lib/actions/customers.ts` | 11 | 7C-5 |
| `src/lib/actions/leads.ts` | 10 | 7C-5 |

**Total: 78 nye action gates** i 8 filer + 1 permissions-extension.

---

## 3) Permission mapping — alle gated actions

### Offers (22)
| Action | Permission |
|---|---|
| getOffers, getOffer, getOfferLineItems | offers.view |
| createOffer, quickCreateCustomerAndOffer | offers.create |
| updateOffer, updateOfferField, updateOfferStatus | offers.edit |
| deleteOffer | offers.delete |
| sendOffer | offers.send |
| createLineItem, updateLineItem, deleteLineItem | offers.edit |
| addProductToOffer, importCalculationToOffer | offers.edit |
| createLineItemFromSupplierProduct | offers.edit |
| searchSupplierProductsForOffer, searchSupplierProductsLive | offers.view |
| refreshLineItemPrice, optimizeOfferPrices | offers.edit |
| getCustomersForSelect | customers.view |
| getLeadsForSelect | leads.view |

### Service cases (17)
| Action | Permission |
|---|---|
| getServiceCases, getServiceCase | cases.view.all |
| getCustomerServiceCases, getServiceCaseStats | cases.view.all |
| getServiceCaseAttachments, getServiceCaseActivity | cases.view.all |
| listOpenServiceCasesForPicker | cases.view.all |
| createServiceCase, createServiceCaseFromEmail | cases.create |
| updateServiceCase, updateChecklist, initializeChecklist | cases.edit |
| setServiceCaseStatus | cases.edit OR cases.close (closed) |
| markServiceCaseDone | cases.close (via setServiceCaseStatus) |
| setServiceCaseLowProfit, setServiceCaseAutoInvoice | cases.edit |
| sendToOrdrestyring | cases.edit |
| uploadServiceCaseAttachment, deleteServiceCaseAttachment | cases.edit |
| signOffServiceCase | cases.close |
| deleteServiceCase | cases.delete |
| getCustomersForOrderSelect | customers.view |
| getProfilesForOrderSelect | users.view |
| getEmployeesForOrderSelect | employees.view |
| getOffersForOrderSelect | offers.view |

### Work orders + time logs (10)
| Action | Permission |
|---|---|
| listWorkOrdersForCase | work_orders.view.all |
| createWorkOrderForCase | work_orders.plan |
| updateWorkOrderPlanning | work_orders.plan |
| changeWorkOrderStatus | work_orders.complete (next='done') OR work_orders.edit |
| deletePlannedWorkOrder | work_orders.delete |
| listWorkOrdersByDateRange | calendar.view.all |
| listTimeLogsForWorkOrder | time_logs.view.all |
| listTimeLogsForCase | time_logs.view.all |
| createTimeLog | time_logs.create |
| updateTimeLog | time_logs.edit.all |

### Materials + other costs (8)
| Action | Permission |
|---|---|
| listCaseMaterials | materials.view |
| createCaseMaterial | materials.add_to_case |
| updateCaseMaterial | materials.edit |
| deleteCaseMaterial | materials.delete |
| listCaseOtherCosts | other_costs.view |
| createCaseOtherCost | other_costs.add_to_case |
| updateCaseOtherCost | other_costs.edit |
| deleteCaseOtherCost | other_costs.delete |

### Customers + leads (21)
| Action | Permission |
|---|---|
| getCustomers, getCustomer | customers.view |
| getCustomerContacts | customers.view |
| checkDuplicateCustomer, createCustomer | customers.create |
| updateCustomer, toggleCustomerActive | customers.edit |
| createCustomerContact, updateCustomerContact, deleteCustomerContact | customers.edit |
| deleteCustomer | customers.delete |
| getLeads, getLead, getLeadActivities | leads.view |
| checkDuplicateLead, createLead | leads.create |
| updateLead, updateLeadStatus, addLeadActivity | leads.edit |
| deleteLead | leads.delete |
| getTeamMembers | users.view |

---

## 4) Hvad der stadig mangler

**Action-filer der STADIG ikke har role-gates** (kun authenticated check):

| Fil | Antal mutations (skøn) | Prioritet |
|---|---|---|
| `incoming-invoices.ts` | ~5 | KRITISK (bogføring) |
| `bank-payments.ts` | ~3 | KRITISK |
| `messages.ts` | ~5 | MELLEM |
| `portal.ts` | ~6 | KRITISK (separat 7B-1B) |
| `projects.ts` | ~5 | LAV (legacy modul) |
| `offer-activities.ts` | ~3 | LAV |
| `offer-to-case.ts` | ~2 | LAV |
| `audit.ts` | helpers | N/A (intern) |
| `auto-project.ts`, `ai-intelligence.ts`, `learning.ts`, `calculation-intelligence.ts` | ~15 | LAV (AI-værktøjer) |
| `kalkia-*.ts` (6 filer) | ~30 | MELLEM (kalkulationer) |
| `suppliers.ts`, `supplier-sync.ts`, `supplier-health.ts`, `sync.ts`, `sync-schedules.ts`, `lemu-sync.ts`, `import.ts` | ~20 | MELLEM (admin-tools) |
| `credentials.ts`, `margin-rules.ts`, `customer-pricing.ts` | ~10 | MELLEM (settings) |
| `calculations.ts`, `quote-actions.ts`, `quick-jobs.ts` | ~10 | MELLEM |
| `solar-products.ts`, `products.ts`, `packages.ts`, `components.ts`, `component-intelligence.ts` | ~25 | LAV (catalog) |
| `electrical.ts`, `besigtigelse.ts`, `project-estimation.ts` | ~10 | LAV (specialiserede) |
| `dashboard.ts`, `reports.ts`, `export.ts`, `search.ts`, `files.ts` | ~15 | MELLEM |
| `customer-documents.ts`, `customer-tasks.ts`, `customer-mailbox.ts` | ~10 | MELLEM |
| `email.ts`, `incoming-emails.ts`, `fuldmagt.ts` | ~15 | MELLEM |
| `user-activity.ts`, `go-live.ts`, `sales-engine.ts`, `ordrestyring.ts` | ~15 | LAV |
| `price-engine.ts`, `price-analytics.ts` | ~5 | MELLEM |
| `calculator.ts`, `calculation-settings.ts` | ~5 | LAV |

**Estimeret resterende: ~200+ ungated mutation-actions** ud af resten af action-filerne.

---

## 5) Type-check / build status

- `npx tsc --noEmit` — **clean** efter hver commit
- `npx next build` — **clean** efter hver commit

---

## 6) Vercel status

- Latest deployment: `elta-7p36xu48j-henrik-s-projects-3c069112.vercel.app` ● Building (notification kommer)
- Forrige Ready: `r7n96g7sp` (commit `67c8fa6` — 7B-1A migration)
- Production HEAD: `374664a`

---

## 7) Curl smoke-resultater

| Route | HTTP | Forventet | Match |
|---|---|---|---|
| `/dashboard/orders` | 307 | 307 | ✅ |
| `/dashboard/invoices` | 307 | 307 | ✅ |
| `/dashboard/calendar` | 307 | 307 | ✅ |
| `/dashboard/customers` | 307 | 307 | ✅ |
| `/api/invoices/test/pdf` | 401 | 401 | ✅ |

---

## 8) Roller — opdateret matrix efter 7C

| Område | admin | serviceleder | bogholderi | montør | salg |
|---|---|---|---|---|---|
| Tilbud read/create/edit/send | ✅ | ✅ | ❌ | ❌ | ✅ |
| Tilbud delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sager read | ✅ | ✅ | ✅ | (assigned) | (assigned) |
| Sager create/edit | ✅ | ✅ | ❌ | ❌ | (create) |
| Sager close/delete | ✅ | ✅ close | ❌ | ❌ | ❌ |
| Work orders plan/edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| Work orders complete | ✅ | ✅ | ❌ | ✅ | ❌ |
| Calendar feed | ✅ | ✅ | ❌ | ❌ | ❌ |
| Time logs read/create/edit | ✅ | ✅ all | view.all | egne | ❌ |
| Materials view/add | ✅ | ✅ | view | ✅ | ❌ |
| Materials edit/delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| Other costs view/add | ✅ | ✅ | view | ✅ | ❌ |
| Customers read/create/edit | ✅ | ✅ | view | view | ✅ |
| Customers delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| Leads read/create/edit | ✅ | ✅ | ❌ | ❌ | ✅ |
| Leads delete | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 9) Cumulative pilot security state

**Sammen med tidligere sprints (CP2-CP4B + 7C):**

| Modul | Actions gated |
|---|---|
| Invoices (CP3) | 12 |
| Employees/payroll (CP4) | 8 |
| Settings (CP4B) | 11 |
| Integrations (CP4B) | 13 |
| Offers (7C-1) | 22 |
| Service cases (7C-2) | 17 |
| Work orders + time logs (7C-3) | 10 |
| Materials + other costs (7C-4) | 8 |
| Customers + leads (7C-5) | 21 |
| **Total** | **122 actions gated** |

---

## 10) Henrik browser-test

### Test 1 — admin (skal kunne alt uændret)
1. Log ind som admin
2. Naviger til /dashboard/orders, /dashboard/invoices, /dashboard/customers, /dashboard/calendar
3. Verificér at eksisterende flows virker uden ændring (oprette sag, tilbud, faktura osv.)

### Test 2 — serviceleder (test-bruger)
1. Sat manuelt `role='serviceleder'` for testbruger i Supabase Dashboard
2. Skal stadig kunne: oprette/redigere kunder, tilbud, sager, work orders, time logs
3. Skal IKKE kunne: slette kunder/tilbud/leads, mark_paid faktura, kreditnota, slet faktura-kladde

### Test 3 — bogholderi (test-bruger)
1. Sat manuelt `role='bogholderi'`
2. Skal kunne: alle invoice-actions inkl. mark_paid + credit + delete_draft
3. Skal IKKE kunne: medarbejderadgang, tilbud edit, sag-create

### Test 4 — montør (test-bruger)
1. Sat manuelt `role='montør'`
2. Skal kunne: time_logs.create, work_orders.complete (markér færdig), materials.add_to_case
3. Skal IKKE kunne: invoice/employee/settings/customers.create/leads adgang
4. **Note:** kalender-feed (`listWorkOrdersByDateRange`) blokerer for montør i pilot — back-fix kommer i 7D med scope-filter

### Test 5 — salg (test-bruger)
1. Sat manuelt `role='salg'`
2. Skal kunne: customers/leads/offers (alle CRUD undtagen delete), cases.create
3. Skal IKKE kunne: invoice ops (undtagen view egne sagers), employee, settings, materials, time_logs

---

## 11) Risici og caveats

| Risiko | Niveau | Mitigation |
|---|---|---|
| Direct REST-adgang via anon key omgår app-gates | **Mellem** | RLS-fix kommer i 7G (pilot afventer) |
| Montør mister kalender-feed — kan ikke se egne kalenderaftaler | **Lav** | Forventet pilot-konsekvens; 7D back-fix m. scope |
| Sag-scope ikke implementeret — montør gates `cases.view.assigned` virker, men list-action returnerer alle (RLS er stadig åben) | **Mellem** | RLS-fix nødvendig for ægte scope; pilot accepterer |
| Salg har `cases.view.assigned` permission men list-action bruger `cases.view.all` → salg ser kun egne sager via view.assigned action | **Lav** | Kommer i 7D |
| Gate-tabel mangler scope-filter — alle authenticated reads returnerer alle rows | **Mellem** | App-niveau gating beskytter mod knap-klik; ægte scope = 7D + RLS |

---

## 12) Anbefalet næste sprint

**Sprint 7D — UI gating + page-level guards** (foreslået næste)
- Server-side `notFound()` på pages baseret på rolle
- UI-knapper skjules før server-fejl
- Side-gating på `/dashboard/employees`, `/dashboard/settings/*`

**Sprint 7E — Sag-scope filter implementation** (kompleks)
- list-actions returnerer kun rows hvor scope matcher
- Kræver RLS-helper fra 00108 (user_can_view_case)

**Sprint 7G — RLS tightening** (kritisk men risikabelt)
- Erstat `FOR ALL USING (true)` policies modulvis
- Test mod staging FØRST

**Sprint 7B-1B — Portal hardening** (separat track)
- Kode + RLS for portal-flows
