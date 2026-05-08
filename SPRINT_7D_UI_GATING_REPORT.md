# Sprint 7D — UI Gating Report

**Skrevet:** 2026-05-08
**Production HEAD ved rapport:** `f659006`
**Sprint scope:** UI-side permission gates (sidebar + page-level + action-buttons + payroll-felter).

---

## 1) Commits

| Commit | Beskrivelse |
|---|---|
| `671d9f3` | 7D-1 gate sidebar and page access |
| `861b2d8` | 7D-2 gate invoice UI actions |
| `a0bb587` | 7D-3 gate orders/calendar UI |
| `f659006` | 7D-4 gate employee/payroll UI |

---

## 2) Filer ændret

| Fil | Ændring |
|---|---|
| `src/lib/auth/page-guard.ts` | **NY** — server-side page-permission helpers |
| `src/components/auth/no-access.tsx` | **NY** — UI-komponent for graceful no-access |
| `src/components/layout/sidebar.tsx` | Permission-mapping rettet (Fakturaer, Sager, Kalender, Leverandørfaktura) |
| `src/components/layout/bottom-nav.tsx` | Montør-bottomnav: Kalender fjernet, erstattet med Indbakke + Scan |
| `src/app/dashboard/invoices/page.tsx` | Page-guard: invoices.view.all |
| `src/app/dashboard/orders/page.tsx` | Page-guard: cases.view.all |
| `src/app/dashboard/orders/new/page.tsx` | Page-guard: cases.create |
| `src/app/dashboard/orders/[id]/edit/page.tsx` | Page-guard: cases.edit |
| `src/app/dashboard/calendar/page.tsx` | Page-guard: calendar.view.all (+ besked om 7E) |
| `src/app/dashboard/employees/page.tsx` | Page-guard: employees.view + canSeePayroll prop |
| `src/app/dashboard/employees/[id]/page.tsx` | Page-guard + canSeePayroll/canEditPayroll/canEditEmployee props |
| `src/app/dashboard/employees/[id]/edit/page.tsx` | Page-guard: employees.edit |
| `src/app/dashboard/employees/employees-list-client.tsx` | Skjul rate-kolonner uden payroll.view |
| `src/app/dashboard/employees/[id]/employee-detail-client.tsx` | Skjul rate-stats + Satser-panel + edit-buttons uden permission |
| `src/app/dashboard/invoices/[id]/detail-client.tsx` | Skjul Send/Pay/Delete/Credit buttons uden permission |

**Total:** 15 filer ændret (2 nye + 13 modificerede).

---

## 3) Hvilke sider er gated

| Page | Page-permission | Hvad sker uden |
|---|---|---|
| `/dashboard/invoices` | invoices.view.all | NoAccess UI |
| `/dashboard/orders` | cases.view.all | NoAccess UI |
| `/dashboard/orders/new` | cases.create | NoAccess UI |
| `/dashboard/orders/[id]` | cases.view.all (via getServiceCase) | notFound() |
| `/dashboard/orders/[id]/edit` | cases.edit | NoAccess UI |
| `/dashboard/calendar` | calendar.view.all | NoAccess UI med besked om 7E sag-scope |
| `/dashboard/employees` | employees.view | NoAccess UI |
| `/dashboard/employees/[id]` | employees.view | NoAccess UI |
| `/dashboard/employees/[id]/edit` | employees.edit | NoAccess UI |

## 4) Hvilke knapper er gated

### Invoice-detail
- **Send faktura på mail** → invoices.send
- **Markér som sendt** → invoices.send
- **Slet kladde** → invoices.delete_draft
- **Markér som betalt** → invoices.mark_paid (else: viser besked "kræver bogholderi/admin-rolle")
- **Krediter faktura** → invoices.credit

### Employee-detail
- **Deaktiver / Aktiver** → employees.edit
- **Rediger** (link) → employees.edit
- Stat-kolonner intern kost / salgspris → employees.payroll.view
- "Satser og økonomi"-panel → employees.payroll.view (else: besked "kun admin-rolle")

### Employee-list
- Kolonner "Intern kost" + "Salgspris" → employees.payroll.view

---

## 5) Permissions brugt

| Permission | Brugt i UI |
|---|---|
| invoices.view.all | sidebar Fakturaer, page guard |
| invoices.send | invoice action buttons |
| invoices.mark_paid | invoice action buttons |
| invoices.delete_draft | invoice action buttons |
| invoices.credit | invoice action buttons |
| cases.view.all | sidebar Sager, page guards |
| cases.create | new order page |
| cases.edit | order edit page |
| calendar.view.all | sidebar Kalender, page guard |
| employees.view | sidebar Medarbejdere, page guards |
| employees.edit | edit page + detail action buttons |
| employees.payroll.view | rate kolonner + Satser-panel |
| incoming_invoices.view | sidebar Leverandørfakturaer |

---

## 6) Hvad montør / serviceleder / bogholderi nu ser

### Montør (pilot scope — minimal)
**Sidebar:**
- ✅ Dashboard
- ✅ Mail
- ❌ Leads (mangler salg/serviceleder)
- ❌ Tilbud
- ❌ Kunder (har customers.view men sidebar gates på leads.create)
- ❌ Sager / Ordrer (cases.view.all mangler)
- ❌ Fakturaer (invoices.view.all mangler)
- ❌ Leverandørfaktura
- ❌ Service (har service.view men page bruger cases.*)
- ✅ Opgaver
- ❌ Kalender (calendar.view.all mangler)
- ❌ Medarbejdere

**Bottom-nav (mobile):** Opgaver, Indbakke, Scan Mail, Service

### Serviceleder
**Sidebar:**
- ✅ Dashboard
- ✅ Leads, Tilbud, Kunder
- ✅ Sager / Ordrer (cases.view.all)
- ✅ Fakturaer (invoices.view.all)
- ❌ Leverandørfaktura (incoming_invoices.view ikke i serviceleder)
- ✅ Service, Opgaver
- ✅ Kalender (calendar.view.all)
- ✅ Medarbejdere (uden satser i listen)

**Faktura-detail:** Send + Slet kladde knapper. Ingen Mark betalt / Krediter / Slet (ikke deres ansvar).

**Employee-detail:** Stamdata vises. Satser-panel viser "kun for admin". Ingen Edit/Deaktiver buttons.

### Bogholderi
**Sidebar:**
- ✅ Dashboard, Kunder
- ✅ Sager / Ordrer (read-only)
- ✅ Fakturaer (alle handlinger)
- ✅ Leverandørfaktura
- ❌ Tilbud, Leads, Service, Kalender, Medarbejdere (ingen permission)

**Faktura-detail:** Alle handlinger (Send, Mark betalt, Krediter, Slet kladde).

---

## 7) Hvad der stadig mangler

### Sag-scope (deferred til 7E)
- Montør har `cases.view.assigned` permission men der er ingen scope-filter — list-actions returnerer alle rows hvis montør får adgang
- Calendar-feed for montør (egne work orders) — kræver scope filter på listWorkOrdersByDateRange
- Order-detail "Slet sag" / "Rediger sag" buttons skjules ikke i UI baseret på permission (server blokerer)

### Andre UI-områder ikke rørt
- `/dashboard/customers/[id]` — delete/edit buttons ikke gated UI-side
- `/dashboard/leads/*` — buttons ikke gated UI-side
- `/dashboard/offers/*` — line item buttons ikke gated UI-side (server blokerer dog)
- `/dashboard/tasks` — ingen page-guard
- `/dashboard/service-cases` (legacy modul) — ingen page-guard
- `/dashboard/incoming-invoices/*` — ingen page-guard
- `/dashboard/settings/*` — kun den bredere settings.view eksisterer
- Kalkia / packages / products / calculations — ikke rørt

### RLS er fortsat åbent
- Direct REST-adgang via anon-key kan stadig læse data fra tabeller med `USING (true)` policies
- App-niveau gating beskytter mod UI-adgang, men ikke direct API-kald
- Henrik's notat fra 7C: "Sprint 7G RLS tightening planlagt"

---

## 8) Type-check / build status

- `npx tsc --noEmit` — **clean** efter hver af 4 commits
- `npx next build` — **clean** efter hver af 4 commits

---

## 9) Vercel verify

| | Værdi |
|---|---|
| Latest deployment | `elta-aft16hrfb-...` ● Building (notification kommer) |
| Production HEAD | `f659006` |
| Forrige Ready | `r7n96g7sp` (commit `67c8fa6` — 7B-1A migration) |

---

## 10) Curl smoke-resultater

| Route | HTTP | Forventet | Match |
|---|---|---|---|
| `/dashboard/orders` | 307 | 307 | ✅ |
| `/dashboard/invoices` | 307 | 307 | ✅ |
| `/dashboard/calendar` | 307 | 307 | ✅ |
| `/dashboard/employees` | 307 | 307 | ✅ |
| `/api/invoices/test/pdf` | 401 | 401 | ✅ |

---

## 11) Browser-test guide

### Test 1 — Admin (uændret oplevelse)
1. Login som admin
2. Verificér: alle sidebar-menupunkter synlige
3. /dashboard/invoices/[id] viser alle 4 action-buttons (Send, Mark betalt, Krediter, Slet)
4. /dashboard/employees/[id] viser Satser-panel + Edit/Deaktiver buttons

### Test 2 — Serviceleder
1. Sat manuelt `role='serviceleder'` for testbruger
2. Verificér sidebar: Leverandørfaktura skjult
3. /dashboard/invoices/[id] (sendt faktura): viser KUN "Send"-relaterede + Slet kladde; **ingen** "Markér som betalt", "Krediter faktura"
4. /dashboard/employees/[id]: stamdata vises, Satser-panel viser "kun for admin"-besked, ingen Edit/Deaktiver buttons

### Test 3 — Bogholderi
1. Sat manuelt `role='bogholderi'`
2. Sidebar: Fakturaer, Leverandørfaktura, Sager, Kunder, Dashboard
3. /dashboard/invoices/[id]: alle 4 handlinger virker
4. /dashboard/employees: NoAccess UI vises
5. /dashboard/orders/new: NoAccess UI

### Test 4 — Montør
1. Sat manuelt `role='montør'`
2. Sidebar: kun Dashboard, Mail, Opgaver
3. /dashboard/invoices: NoAccess UI
4. /dashboard/calendar: NoAccess UI med besked om 7E sag-scope
5. /dashboard/orders: NoAccess UI
6. Bottom-nav (mobile): Opgaver, Indbakke, Scan, Service

### Test 5 — Salg
1. Sat manuelt `role='salg'`
2. Sidebar: Leads, Kunder, Tilbud, Dashboard
3. /dashboard/invoices: NoAccess UI
4. /dashboard/calendar: NoAccess UI

---

## 12) Risici og caveats

| Risiko | Niveau | Mitigation |
|---|---|---|
| `useUserRole` cacher rolle i module-level variable; ved skift af bruger kan stale rolle bruges | Lav | Cache cleared ved page reload; logout flow uberoerned |
| Page-guards bruger `getUser()` + DB-lookup → 1 ekstra query per page render | Lav | Kun ved gated pages; cacheable |
| `pageHasPermission` bruger 'montør' default ved profile-fejl | Lav | Fail-safe — låser UI ude i stedet for elevation |
| UI viser stadig knap **"Markér som betalt"** for serviceleder hvis pil viser pænt fallback ("kræver bogholderi/admin-rolle") — men user kan **ikke klikke** | Lav | Bevidst UX — viser hvor de mangler permission |
| Montør har `cases.view.assigned` permission men kan ikke nå sag-detail (page-guard kræver `cases.view.all`) | **Lav** | Pilot-konsekvens; 7E vil tillade scope-baseret adgang |

---

## 13) Anbefalet næste sprint

**Sprint 7E — Sag-scope filter**
- Implementér scope-filter på list-actions (cases.view.assigned → returnerer kun rows hvor montør er assignee)
- Bruge `user_can_view_case` DB-helper fra mig 00108
- Tillad montør at se egne work orders i kalender
- Tillad salg at se egne sager i orders-list

**Sprint 7F — Portal hardening** (separat track)
- Skift portal server actions fra anon → service_role + token-validation

**Sprint 7G — RLS tightening**
- Erstat `FOR ALL USING (true)` modulvis
- Test mod staging FØRST
