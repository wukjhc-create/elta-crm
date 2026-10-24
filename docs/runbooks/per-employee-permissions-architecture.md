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
