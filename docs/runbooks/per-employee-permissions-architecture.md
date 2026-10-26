# Per-medarbejder-rettigheder — arkitektur og migrationsforslag

**Status:** FORSLAG (Henrik 2026-10-24: kernekrav for medarbejder-/mobilappen). Intet er anvendt.
**Princip:** basisrolle + eksplicitte overrides. Der laves IKKE et parallelt rettighedssystem; den eksisterende katalog
`src/lib/auth/permissions.ts` (112 nøgler) forbliver eneste kilde.

## 1. Udgangspunkt (kortlagt 2026-10-24)

- Alle tjek afhænger i dag kun af `profiles.role`:
  - TS: `hasPermission(role, perm)` = opslag i `PERMISSIONS[perm]`.
  - DB: `user_role() IN (...)` i ca. 200 policies på 86 tabeller.
- Ét centralt indgangspunkt findes allerede: `readRoleCached` → `getAuthenticatedClientWithRole().hasPermission`
  (114 action-filer) og `getUserRoleForPage` (33 sider). Det gør overrides realistiske.
- **Omgåelser der skal lukkes:**
  - 47 filer kalder `hasPermission(role, …)` direkte på en rolleværdi (scope-helpers, assistent/Telegram).
  - Ca. 7 stier læser `profiles.role` selv.
  - Ca. 20 sammenligner `role === '…'`. De farligste: `task-scope.ts` (montør-scope), `dashboard/stats`-routens `OPS_ROLES`,
    `canSeeFinancials(role)` og `adminOnly`.
- Scope findes som separate nøgler (`cases.view.all`/`.assigned`, `cases.edit`/`.edit.own`, `work_orders.view.*`,
  `calendar.view.*`, `time_logs.*`, `invoices.view.*`, `offers.view`/`.all`). **Der findes ingen kunde-scope og intet
  team-begreb.**
- DB: `user_has_permission()` og `permissions`/`role_permissions` fra 00108 er ubrugte, og deres indhold er gledet væk fra
  TS-nøglerne. `user_role()` falder tilbage til `'montør'` og ignorerer `is_active` → **forudsætning SEC-B10 (00237)**.

## 2. Model

```
effektive rettigheder(bruger) = rollens standard (PERMISSIONS)
                              ∪ grants
                              − revokes
                              (tomt sæt hvis profilen mangler eller er inaktiv)
```

- **Overrides** gemmes pr. profil og nøgle: `effect = grant | revoke`, `source = template | manual`, plus begrundelse,
  hvem og hvornår.
- **Skabeloner** (TS, ved siden af katalogen) = basisrolle + en liste grants/revokes.
  - At vælge en skabelon sætter `profiles.role`, `profiles.permission_template` og skriver skabelonens overrides
    (`source = template`).
  - Admin kan derefter ændre enkelte nøgler (`source = manual`).
  - "Nulstil til skabelon" sletter de manuelle overrides.
  - Skabeloner materialiseres ved tildeling. En senere ændring af en skabelon flytter derfor ingen eksisterende
    medarbejdere stille.
- **Scope = gensidigt udelukkende nøgler** i samme gruppe, vist som radioknapper i UI, fx
  `cases.view.assigned | cases.view.all`. Nye nøgler kun hvor der mangler et niveau:
  - `customers.view.related` — kunder med sag, tilbud eller opgave i brugerens scope.
    `customers.view` betyder fortsat alle.
  - `*.team` venter, til der findes et team-begreb (medarbejder → team). Det står i fase 5.

**Forslag til skabeloner (Henrik bekræfter indholdet):**

| Skabelon | Basisrolle | Ekstra / fjernet |
|---|---|---|
| Montør | montør | — |
| Elektriker | montør | + `customers.create`, + `cases.create` |
| Overmontør | montør | + `cases.view.all`, + `work_orders.view.all`, + `calendar.view.all`, + `time_logs.approve` (bekræftes) |
| Salg | salg | — |
| Serviceleder | serviceleder | — |
| Bogholderi | bogholderi | — |

## 3. Håndhævelse — alle lag (UI-skjul er ikke sikkerhed)

| Lag | Ændring |
|---|---|
| Server-actions | `readEffectiveAccess(userId)` (cachet pr. request) erstatter `readRoleCached`. `ctx.hasPermission` slår op i sættet. Alle 114 filer får det automatisk |
| Direkte URL | `getUserRoleForPage` → `getPageAccess()` med samme sæt; `ModuleGuard`/`adminOnly` bliver til nøgler (`settings.manage` m.fl.) |
| Scope | `ScopeContext` får `has(perm)` i stedet for `role` (case-scope, offer-scope, task-scope, offer-followup). Ny `getCustomerScope` |
| API-routes | Samme helper. `OPS_ROLES` → nøgler |
| Søgning/Ctrl+K | Paletten søger kunder og leads via server-action med scope (i dag direkte browser-forespørgsel) |
| Eksport | Uændret mønster (`permissionDenied` + scope); eksporterne bruger det effektive sæt automatisk |
| Klient | `getProfile` returnerer `permissions[]`; `usePermissions()` erstatter rolle-tjek (sidebar, bundmenu, header, palette, 31 filer) |
| RLS | Nyt `user_has_permission(text)` (override- og `is_active`-bevidst, SECURITY DEFINER). Policies konverteres tabel for tabel i prioriteret rækkefølge. Indtil da er RLS = basisrollens loft |
| CI | Ny regel: ingen `hasPermission(` med rolle-argument og ingen `role === '…'` uden for `lib/auth`. `rls-write-sites` og `ui-guard-audit` regner på nøgler. Persona-harness får override-personaer (fx montør + `customers.create`) |

**Konsekvens af RLS-loftet indtil fase 4:**
- En **revoke** virker straks i app/API/UI, men en direkte REST-skrivning følger rollen, indtil tabellens policy er
  konverteret.
- En **grant** ud over rollen kræver, at den berørte server-action skriver via admin-klient bag gaten (eksisterende
  mønster) eller at policyen er konverteret.
- Derfor prioriteres netop de tabeller, skabelonerne rører (customers, service_cases), i fase 4.

## 4. Faser

0. **SEC-B10 / 00237:** `user_role()` fail-closed (`ingen_adgang` ved manglende eller inaktiv profil). Forudsætning.
1. **Server-kerne:**
   - `readEffectiveAccess`, page-access og scope-helpers på `has()`
   - codemod af de 47 direkte kald og de ca. 20 rolle-sammenligninger
   - CI-regel
   - Ingen adfærdsændring uden overrides; det bevises af den eksisterende fulde regression.
2. **Migration 00238 (tabeller og funktion, ingen policy-ændringer)** og admin-UI: Team → Medarbejder → **Rettigheder**.
   - skabelonvalg
   - nøgler grupperet efter område med dansk tekst (`permission-text.ts`)
   - scope som radioknapper
   - afvigelser fra skabelonen markeret
   - audit på hver ændring
   - værn: ingen kan fjerne sin egen rolle-administration, sidste admin er beskyttet, og farlige nøgler
     (økonomi, indstillinger, bank) kræver bekræftelse
3. **Klient:** `permissions[]` til klienten, plus sidebar, palette og bundmenu.
4. **RLS-konvertering:** customers, service_cases, offers, customer_tasks, work_orders, time_logs og kost-tabeller. Én
   migration pr. bølge med staging-matrix og prod-godkendelse.
5. **Kunde-scope** (`customers.view.related` + RLS på customers SELECT) og team-scope (team-tabel).

## 5. Migrationsforslag 00238 (udkast — ikke anvendt)

```sql
BEGIN;
-- Rollens standardnøgler, genereret fra src/lib/auth/permissions.ts (CI-tjek: DB = TS). Erstatter de ubrugte 00108-tabeller
-- (de droppes i en senere migration).
CREATE TABLE public.role_permission_defaults (
  role text NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE public.user_permission_overrides (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission ~ '^[a-z_]+(\.[a-z_]+)*$'),
  effect text NOT NULL CHECK (effect IN ('grant', 'revoke')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('template', 'manual')),
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, permission)
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permission_template text;

ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
-- Læsning: egne overrides + rolle-administratorer. Skrivning: KUN service-role (server-action bag users.manage_roles + audit).
CREATE POLICY upo_select ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.user_role() = 'admin');
CREATE POLICY rpd_select ON public.role_permission_defaults FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.user_permission_overrides, public.role_permission_defaults FROM anon;
GRANT SELECT ON public.user_permission_overrides, public.role_permission_defaults TO authenticated;

-- Effektiv rettighed (override- og is_active-bevidst; fail-closed)
CREATE OR REPLACE FUNCTION public.user_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH me AS (SELECT id, role FROM public.profiles WHERE id = auth.uid() AND is_active)
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM me) THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o, me
                 WHERE o.profile_id = me.id AND o.permission = p_permission AND o.effect = 'revoke') THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o, me
                 WHERE o.profile_id = me.id AND o.permission = p_permission AND o.effect = 'grant') THEN true
    ELSE EXISTS (SELECT 1 FROM public.role_permission_defaults d, me
                 WHERE d.role = me.role AND d.permission = p_permission)
  END;
$$;
REVOKE ALL ON FUNCTION public.user_has_permission(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(text) TO authenticated;
-- + INSERT af role_permission_defaults genereret fra TS (scripts/permissions/build-defaults.ts)
COMMIT;
```

Data-påvirkning: ingen. Nye tomme tabeller og en nullable kolonne. Ingen policies bruger funktionen endnu.

## 6. Beslutninger Henrik skal træffe

1. Skabelonernes præcise indhold (især Elektriker og Overmontør).
2. Om "team" skal være et rigtigt begreb nu (en ny tabel), eller om team-scope venter.
3. Om `customers.view.related` skal være montørens standard. Det er en adfærdsændring: montører ser i dag alle kunder.
4. Rækkefølge: fase 0–1 kan laves som kode uden migration (bortset fra 00237). Fase 2 kræver godkendelse af 00238.

## 7. Status

### Fase 1 — server-kerne (DONE 2026-10-25, kode, ingen migration)

**Ny kode:**
- `lib/auth/effective-permissions.ts`: rolle ∪ grants − revokes; `ingen_adgang` giver altid et tomt sæt;
  `explainPermission` returnerer role/grant/revoke/none.
- `lib/auth/effective-access.ts`: ét indlæsningspunkt for overrides. I fase 1 er der ingen lagring, så sættet er tomt.
- `lib/auth/permission-templates.ts`: Henriks skabeloner.
- `lib/auth/permission-groups.ts`: 8 grupper og scope-sæt. Team-scope kan tilføjes som et ekstra niveau uden
  skemaændring.

**Wiring:**
- `getAuthenticatedClientWithRole().hasPermission`, `pageHasPermission` og `getPageRoleContext` bruger det effektive
  sæt.
- `ScopeContext` får en valgfri `hasPermission`, som case-scope bruger, når kalderen sender sit ctx.

**Kompatibilitet:**
- `scripts/effective-permissions-test.ts` beviser: uden overrides er effektive rettigheder = dagens rolle-rettigheder
  for 5 roller × 112 nøgler (0 afvigelser).
- Testen tjekker også skabelonernes værn (ingen følsomme nøgler, Salg/Serviceleder/Bogholderi = præcis rollen).
- UI-batch på tværs af roller er grøn.

**Ratchet i `check:rbac`:** direkte `hasPermission(role, …)` ≤ 70 og rolle-sammenligninger ≤ 58. Tallene må kun falde.

**SIKKERHED:**
- I fase 1 findes der endnu ingen overrides.
- Når de kommer (fase 2), håndhæves en REVOKE af server-actions, sider og scope, men **ikke** af RLS ved direkte REST,
  før tabellens policies er konverteret (fase 4).
- De 70 + 58 direkte rolle-tjek ignorerer overrides, indtil de er konverteret.
- Det må ikke markedsføres som fuld sikring.

### 00238 — forslag klar (2026-10-25, ikke anvendt)

- **SQL:** [`00238_permission_overrides.DRAFT.sql`](00238_permission_overrides.DRAFT.sql) (inkl. rollback).
- **Indhold:**
  - `permission_catalog` og `role_permission_defaults`: genereret fra `permissions.ts` af
    `scripts/permissions/build-defaults.ts`. `--check` beviser seed = TS (112 nøgler, 267 rolle-nøgle-par).
  - `user_permission_overrides`: grant/revoke, kilde, begrundelse og hvem/hvornår. Nøglen har FK til kataloget.
  - `profiles.permission_template`: nullable, ingen backfill.
  - `user_has_permission(text)`: override- og `is_active`-bevidst, fail-closed.
- **Sikkerhed:** ingen REST-skrivning, så overrides skrives kun via server-action (`users.manage_roles`) + audit.
  Læsning er egne overrides + admin.
- **Erstatter** 00108's ubrugte `user_has_permission(text, uuid)`, som droppes. Det er bevist i prod, at den er ubrugt:
  0 policies, funktioner, views eller app-kald.
- **Påvirkning:** ingen eksisterende policies, data eller adfærd ændres. Ingen policy bruger funktionen før fase 4.
- **Efter godkendelse:**
  1. staging: dry run, anvend og verificér (katalog = TS, funktion = `hasPermission` for alle roller × nøgler)
  2. admin-UI (fase 2)
  3. prod efter særskilt godkendelse

### 00238 staging + fase 2 (2026-10-26, Henrik: "00238 — APPROVED FOR STAGING")

**Før anvendelse:**
- 00238 var næste og ikke anvendt.
- 00108's `user_has_permission(text, uuid)` havde 0 referencer (policies, funktioner, views, app). Kun
  `prod-verify-00162.ts` nævnte den; scriptet er opdateret til den nye signatur.
- Seed = kode: 112 nøgler og 267 par.
- Fingerprint: 409 policies, 164 funktioner, 363 grants og 164 tabeller.

**Dry run:** ROLLBACK, fingerprint identisk.

**Første anvendelse:** service_role manglede rettigheder på de nye tabeller (INSERT gav 42501), så server-actionen
kunne ikke skrive. Rettet med eksplicitte `GRANT … TO service_role` i migrationen og genanvendt; alle sætninger er
idempotente.

**Endelig fil:** `supabase/migrations/00238_permission_overrides.sql`, sha256 `6765d56e…a9b0` (= genanvendt version).

**Ændringer på staging (fingerprint-diff):**
- +3 tabeller, +3 SELECT-policies og +6 grants (authenticated SELECT; service_role til server-actionen).
- Funktionen `user_has_permission(text)` er tilføjet, og 00108's `(text, uuid)` er fjernet.
- Uændret: alle øvrige policies, funktioner, grants og forretningsrækker. `profiles` adskiller sig kun ved den nye
  NULL-kolonne: checksummen over de oprindelige kolonner er lig før (`888782f8…`), og 0 rækker har værdien sat.

**Staging-tjek (`mp-00238-check`):** 16/16.
- A: 5 roller × 112 nøgler = kode, 0 afvigelser.
- B: grant, revoke, gendan, FK, skabelon-nulstil, inaktiv og manglende profil.
- C: REST-skrivning afvist for ejer, admin og serviceleder; læsning = egne + admin.
- D: én signatur, anon afvist.

**UI-tests:**
- **U228:** admin giver/fjerner adgang med begrundelse og audit. Effekten ses i action og side. Nulstil, skabelon og
  dansk kildevisning virker. Serviceleder har intet panel, og et direkte kald afvises.
- **U229, scenarie A–G:**
  - A: montør-baseline = 22 rettigheder.
  - B: ekstra customers.create → "Ny Kunde" vises, og kunden oprettes. Kun den ene rettighed ændres.
  - C: ekstra cases.create → siden åbnes, og sagen oprettes i eget scope.
  - D: fjernet customers.view → menupunkt skjult, side og action afvist.
  - E: gendan → adgang tilbage.
  - F: inaktiv → overrides giver intet.
  - G: nulstil → standard, overrides ryddet, alle ændringer auditeret.
- **Øvrige:** U4, U13, U100, U11, U40 og U175 er grønne.

**Klientlag (start på fase 3):**
- `useUserRole().can()` bruger de effektive rettigheder.
- Sidebar, bundmenu, header, genveje, Ctrl+K, kundeliste, lead-detalje og kunde-detalje er konverteret.
- `ModuleGuard` (direkte URL) bruger de effektive rettigheder.
- Ratchet: direkte `hasPermission(role, …)` 70 → **52**, rolle-sammenligninger 58 → **57**.

**Kendte begrænsninger:**
- RLS følger stadig grundrollen. "Ekstra adgang" virker kun, hvor tabellens RLS allerede tillader rollen. Fx tillader
  RLS montør at indsætte kunder og sager; derfor virker B og C.
- "Fjernet adgang" håndhæves ikke ved direkte REST, før tabellen er konverteret (fase 4).
- Der er 52 + 57 tilbageværende direkte rolle-tjek.

### 00238 i PROD (2026-10-26, Henrik: "Henrik godkender hermed 00238 til PROD", pilot = rollback-only)

**Før anvendelse:**
- sha256 `6765d56e…a9b0` = staging-testet fil.
- 00238 var ikke anvendt: 0 tabeller, ingen kolonne, kun 00108-signaturen.
- 0 live referencer til 00108's funktion.
- Fingerprint: 403 policies, 164 funktioner, 358 grants og 161 tabeller, plus checksummer for 17 forretningstabeller.

**Prod dry run** (`prod:apply-migration -- 00238 --approved-by-henrik --dry-run` — COMMIT erstattet af ROLLBACK):
fingerprint identisk.

**Anvendt → diff = staging:**
- +3 tabeller, +3 SELECT-policies og +6 grants.
- `user_has_permission(text)` tilføjet; `(text, uuid)` fjernet.
- Forretningsrækker uændrede. `profiles` ændrer sig kun ved den nye NULL-kolonne; checksummen ekskl. kolonnen er
  uændret.
- Profiler pr. rolle uændrede.

**Rollback-only effektiv kontrol + pilot** (`scripts/prod-mp-00238-effective.ts`, rigtig montør og admin):
`[NY] 8/8 · [UÆNDRET] 5/5`.
- Nul overrides = rolle for admin (112) og montør (22). Serviceleder, salg og bogholderi: NOT_TESTABLE_PROD
  (dækket af staging).
- Inaktiv og manglende profil giver 0 rettigheder.
- service_role kan skrive overrides. Montør og admin afvises med 42501 ved direkte skrivning.
- **Pilot:**
  - baseline 22
  - grant → 23
  - fjern → 22
  - revoke materials.view → 21
  - nulstil → præcis baseline
  - 4 audit-rækker skrevet
  - ROLLBACK
- Fingerprint efter pilot identisk; 0 overrides og 0 pilot-audit-rækker.

**Øvrige tjek:** 00235/00236/00237/00234-tjekkene er stadig grønne.
