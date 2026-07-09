# ELTA Drift — Idé-backlog

> Samlet oversigt over fremtidige ønsker, visioner, idéer og parkerede punkter.
> Status-nøgle: **idé** (ikke besluttet/ikke bygget) · **planlagt** (besluttet, ikke bygget) · **parkeret** (bevidst udskudt) · **på gren** (kodet, ikke merged).
> Vedligeholdes løbende: nye idéer der nævnes i en session tilføjes her automatisk.

---

## 1. Stor vision — Samarbejdspartner-modul

Samarbejdspartnere (fx Watt) er ofte den **betalende** part, mens slutkunden får arbejdet udført. Mål: samle ALT om en sag ét sted for hele kontoret.

| # | Vision | Status |
|---|--------|--------|
| 1.1 | **Partner-portal** — partner logger ind, ser alle sager hvor de er betaler + henter dokumentation | ✅ bygget (Fase 1, i prod) |
| 1.2 | **Besigtigelses-flow** — fuld pipeline: opret → udfør → kunde godkender i portal → send til betalende partner | planlagt (se §3) |
| 1.3 | **To-vejs kommunikation pr. sag** — chat + mail-på-sag; retur-mails lander på sagen i BÅDE intern visning OG partner-portal | idé |
| 1.4 | **To adskilte dokumentpakker pr. sag** — partner-pakke + slutkunde-pakke, inkl. auto-sortering af mail-vedhæftninger i mapper (`package_type`/folder-hierarki findes ikke endnu) | idé |
| 1.5 | **Skema-/skabelon-bygger** — byg egne kontrolskemaer, læg dem på opgaver, medarbejdere udfylder; skabeloner redigerbare i systemindstillinger | idé |
| 1.6 | **Planlægning med kalender-valg** — ved besigtigelse OG ved booking til montør: vælg hvilken medarbejders kalender det lægges i | idé |
| 1.7 | **Avanceret kalkulationsmotor** — læser projekter/tegninger + grossistpriser; materiale → underlag → pris med tillæg/avancer | idé (på sigt) |
| 1.8 | **AI solcelle-design** — hus → anlægsdesign → tilbagebetalingsberegning → pænt layout i kundeportalen | idé (på sigt) |

---

## 2. Arkitektur-princip: sagen som omdrejningspunkt

- **Princip:** sagen (`service_cases`) er aggregat-roden for ALT (besigtigelse/tagtegning/fuldmagt/dokumenter/godkendelser/kommunikation), ikke kunden. Parter: bestiller/betaler/anlægsejer/leveringsadresse er forskellige. — *delvist forankret*
- **Fremtidsvision:** auto-oprettelse af sag fra partner-mail (aflæs slutkunde, opret sag med rigtige parter udfyldt, styr alt derfra). — **idé**
- **Prioriteret gæld-backlog** (hvis/når vi sag-centrerer bredere):
  - 🔴 Kommunikation-på-sag: `incoming_emails` + `portal_messages` mangler `service_case_id`; UI sag-first navigation. — **parkeret**
  - 🟡 `customer_tasks.service_case_id`; offers party-UI (`updateOfferParties` har ingen UI); invoices payer-routing (Sprint 13A.2 lovet, ej bygget); besigtigelse-billeder på sag. — **parkeret**
  - 🟢 Leads OK som kunde-anker (pre-customer).

---

## 3. Besigtigelses-flow Fase 2

- **Fase 2b — partner-godkendelse i partner-portalen:** `getPartnerPendingConfirmations` + "Afventer din godkendelse"-sektion i `partner-dashboard.tsx`. — **planlagt (STOP indtil go)**
- **Fuldmagt Plan B — e-mail-bundet signeringslink:** per-fuldmagt token bundet til anlægsejerens e-mail (stærkere isolation end portal-token). Bruger valgte "Plan A nu + B senere". — **parkeret**
- **Portal-signerings rolle-gate** (portal-token er kunde-scopet → separat beslutning). — **parkeret/flagget**
- **Oprydning af dormant kode:** `sendBesigtigelsePdf` + `saveBesigtigelsesnotat`'s `sendToCustomer`-gren (bevidst ikke fjernet). — **parkeret**

---

## 4. Tagtegning (roof drawing)

- **Felt-gruppe: drej helt felt + udvid rundt om forhindringer** — kodet på gren `feat/roof-drawing-field-group`, afventer UI-test på telefon/tablet før merge. — **på gren**
- **Bevidst fravalgt (kan tages senere):** grupperotation/multi-select for paneler, nabo-snap for roterede paneler, view-rotation, satellit/3D/skygge/produktionsberegning, adresse-opslag. — **idé**
- **Panel-dimensioner** er plausible standardværdier (ikke rigtige datablade) — bør rettes i UI under Solcelleindstillinger. — **parkeret**

---

## 5. Kalkulation

- **Datamodel-beslutning:** hvilken model er kanonisk — Model A (`calculations`) vs `kalkia_calculations`? Separat produktbeslutning. — **parkeret (udskudt)**
- **Fuld kalkulationsmotor som Kalkia** (produkt-katalog, fuld motor) — fra faseplanen. — **idé**

---

## 6. Fakturering & masterdata

- **Moms master-only:** via `company_settings.default_tax_percentage`; udfas `offers.tax_percentage`-driver + `invoices.tax_percentage`-snapshot. — **planlagt (designet, ej bygget)**
- **Bank i company_settings:** flyt fra env `INVOICE_BANK_*` → `company_settings` + snapshot på `invoices`. V2: flere bankkonti = separat tabel. — **planlagt**
- **Firmanavn/CVR på PDF:** besigtigelse/fuldmagt-PDF bruger hardcoded `@/lib/brand` → bør læse `company_settings` (2F.1: tre firmanavn/CVR-kilder). — **planlagt**
- **UI-default-konstanter (rates):** Kategori B bør læse `getCalculationSettings`-master i stedet for `CALC_DEFAULTS`. — **parkeret (lav prio)**
- **Fremtidig `real_hourly_cost`** beregnet ud fra: timeløn, pension, fritvalg, feriepenge, ATP, forsikringer, firmabil, telefon, værktøj, overhead. — **idé**

---

## 7. Medarbejder-login & invitationer *(fund 2026-07-09)*

- **Supabase Auth custom SMTP** — konfigureres i Supabase-dashboardet så invite/reset-mails faktisk leveres (helst med eksisterende mail-opsætning som afsender). — **planlagt (konfigurationsopgave)**
- **Robust invite + admin-fallback på medarbejderkortet:** `redirectTo` på begge invites; "Gensend invitation" + "Send nulstil adgangskode"; kopierbart sæt-kode-link via `generateLink` (med udløbstid + "behandl som adgangskode"-UI); note om at invitation = medarbejderen sætter selv sin kode. — **planlagt**
- **`team_invitations`-tabel mangler i prod** — `inviteTeamMember`/`resendInvitation`/`getTeamInvitations` (settings.ts) skriver/læser en tabel der ikke findes i prod → team-sidens invitationssporing fejler tavst (auth-brugeren oprettes stadig). Kræver migration der opretter tabellen (eller fjernelse af sporingen). — **kandidat til Trin 3-migrationsbundtet** *(fund 2026-07-09)*

---

## 8. Kundeportal

Udskudt bevidst (senere sprint):
- Dedikeret sags-detaljeside `/portal/[token]/cases/[id]` m. kunde-sikker tidslinje. — **parkeret**
- Sagsfotos via signed-URLs (kun `before_photo` + `after_photo`). — **parkeret**
- Evt. payer-inkluderende faktura-scoping. — **parkeret**

---

## 9. Mail Intelligence

- **M4:** manuel email→offer-link i mail-detail UI. — **parkeret (pauset)**
- **Phase α.2:** `portal_access_tokens` hardening. — **parkeret (pauset)**
- **Auto-flow** (`AUTO_CREATE_CASES_ENABLED`) tændes igen når mail-sortering er bekræftet stabil. — **parkeret**
- Commit af untracked mail-scripts (chore ved lejlighed). — **idé**

---

## 10. Storage / teknisk gæld (β.2.6-kandidater)

- `profiles.avatar_url`-kolonne mangler i prod, men `settings.ts` skriver til den → fejler. — **parkeret**
- Avatar/logo mangler proxy/lazy-refresh (signed URL i mail-signatur udløber ≤1 år). — **parkeret**
- `incoming_emails.attachment_urls` JSONB ikke lazy-refreshet. — **parkeret**
- 2 dangling rows (storage_path → slettet objekt). — **parkeret**

---

## 11. E-conomic / integration

- **E-conomic-aktivering:** kræver `ENCRYPTION_KEY` i Vercel prod + rigtige credentials + testfaktura (alt live udestår). — **parkeret**
- Kreditnota-eksport + `markInvoicePaidInEconomic` som manuel knap (ikke eksponeret endnu). — **idé**
- Leverandørfaktura-bilag: signed-url-hærdning hvis `file_url` peger på privat storage. — **parkeret**

---

## 12. Medarbejder- & fakturaoverblik (mindre huller)

- **Dynamisk RBAC:** permissions hardcoded i `permissions.ts`; `role_permissions`-tabel findes men queries ikke. — **idé**
- **Global betalingssortering** på tværs af kundeliste-sider (kræver payment-baseret paginering/refaktor af `getCustomers`). — **parkeret (anbefalet næste sprint)**
- Deep-link fra fakturaoverblik til specifik fane (`SwitchTabFn` → 'fakturakladde'; overview-filtre er intern state, ikke URL-drevet). — **idé**
- Note-redigering/sletning fra UI (kun oprettelse+visning i dag). — **idé**
- Backfill af historiske konverterede sager (opstartstjekliste + `service_case_created`-aktivitet). — **parkeret (kræver script)**
- Ved stor fakturamængde: DB-view/materialiseret aggregat i stedet for scan (limit 20000 i dag). — **idé**

---

## 13. Øvrige spor

- **Time logs (Ø1.1):** datofilter-UI, nav-menu-punkt under Økonomi, charts/CSV-eksport. — **idé**
- **Purchase ops (Ø9.7):** inline-konvertering — gør den uncommittede feature færdig + commit. — **på gren/parkeret**
- **Purchase ops Fase 4:** fjern DB-pagination legacy-scan. — **idé**
- **Indkøb→budget** afvigelses-flag/varsling. — **idé**
- **Vercel Preview:** spejl Production-env til Preview-scope hvis preview-deployments skal bruges. — **parkeret**
