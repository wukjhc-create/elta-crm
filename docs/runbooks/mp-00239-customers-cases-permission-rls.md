# Forslag 00239 — fase 4, bølge 1: customers og service_cases håndhæver effektive rettigheder i databasen

**Status:** STAGING-ANVENDT 2026-10-26 (Henrik godkendte staging; beslutning A = fjern montør-rest, B = behold salg UPDATE). PROD kræver særskilt godkendelse.
**SQL:** [`supabase/migrations/00239_customers_cases_permission_rls.sql`](../../supabase/migrations/00239_customers_cases_permission_rls.sql) (inkl. rollback; udkast: [`00239_…DRAFT.sql`](00239_customers_cases_permission_rls.DRAFT.sql))
**Kræver:** 00238 (i prod 2026-10-26).
**Kerneregel (Henrik):** uden overrides skal al nuværende kunde- og sagsadfærd i appen være præcis uændret.

## 1. Hvorfor

I dag gælder en medarbejders ekstra adgang eller fjernede adgang kun i appen. Databasen følger stadig grundrollen
(`user_role() IN (...)`). Med 00239 følger SKRIVNING af kunder og sager de effektive rettigheder
(`user_has_permission`), også ved direkte REST.

**Eksempel:**
- Elektriker A med ekstra adgang `customers.create`/`cases.create` kan oprette kunder og sager.
- Elektriker B uden kan ikke, heller ikke uden om appen.
- En salgsmedarbejder, der har fået `customers.edit` fjernet, kan ikke rette kunder via REST.

## 2. Nuværende prod (læst 2026-10-26, `prod-table-policies.ts`)

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| customers | 3 politikker: to `USING(true)` + `created_by = auth.uid()` → reelt alle | admin, serviceleder, salg, **montør** | admin, serviceleder, salg | admin |
| service_cases | `USING(true)` | admin, serviceleder, salg, **montør** | admin, serviceleder, salg | admin · serviceleder/salg kun forslag |

00007-politikkerne ("Users and admins can update customers" m.fl.) findes **ikke** i prod.

## 3. Forslag: kun skrivning konverteres, læsning uændret

| Politik | Ny betingelse | Rollesæt uden overrides | I dag |
|---|---|---|---|
| customers INSERT | `customers.create OR offers.create OR inbox.view` | admin, serviceleder, salg | + montør (beslutning A) |
| customers UPDATE | `customers.edit` | admin, serviceleder, salg | = |
| customers DELETE | `customers.delete` | admin | = |
| service_cases INSERT | `cases.create OR inbox.view` | admin, serviceleder, salg | + montør (beslutning A) |
| service_cases UPDATE | `cases.edit OR cases.close OR service.close OR cases.create` | admin, serviceleder, salg | = |
| service_cases DELETE | `cases.delete OR (cases.create AND is_proposal)` | admin · serviceleder/salg kun forslag | = |

Rollesættene er beregnet mekanisk fra `permissions.ts`.

**Hvorfor flere nøgler pr. politik:** de matcher app-stiernes egne gates, så en override virker i både app og database.
- `quickCreateCustomerAndOffer` gater kun på `offers.create`.
- "Opret kunde + sag fra mail" gater på `inbox.view`.
- `promoteCaseProposal`/`rejectCaseProposal` gater på `cases.create`.

**Teknik:**
- `(SELECT public.user_has_permission('…'))` evalueres én gang pr. sætning (initPlan).
- Et værn afviser migrationen, hvis en nøgle mangler i `permission_catalog`.
- Ingen nye funktioner, ingen data og ingen grants ændres.

**SELECT er bevidst uændret.** Kunde-/sags-scope ved læsning (eget/relateret/alle) kommer i en senere migration, fordi
følgende stier skal rettes først:
- tilbud→sag-genbrug (salg)
- tagtegningens sagsopslag
- mail-genkobling
- kundenummer og dublet-tjek, som læser via bruger-klienten

Inventaret er i `docs/runbooks/per-employee-permissions-architecture.md`.

## 4. Beslutninger til Henrik

- **A — montør i INSERT (anbefaling: fjern).** Montør står i INSERT-listen som en rest fra før G9 (2026-10-01).
  - Ingen app-sti opretter kunder eller sager som montør i dag. Opret-fra-mail kræver `inbox.view`, som montør ikke
    har.
  - Med 00239 kan en montør med ekstra adgang (`customers.create`/`cases.create`) stadig oprette (U229 B/C). En montør
    uden kan ikke længere oprette via direkte REST.
  - Fuld REST-paritet ville kræve et rå `user_role() = 'montør'`-led, som ingen fjernet adgang kan ramme. Det anbefales
    ikke.
- **B — salg UPDATE (anbefaling: behold paritet nu).** Udkastet bevarer, at salg kan opdatere enhver sag via REST,
  præcis som i dag. Appens eneste salg-UPDATE er forslag (`promoteCaseProposal`).
  - Valgfri stramning: `cases.create AND is_proposal = true`.
  - Stramningen kan tages i en senere bølge, når sags-scope indføres.

## 5. Værktøj, i samme commit som migrationen

- `scripts/rls/write-matrix.ts`: `supersededBy: 00239` på customers (WAVE1/00170) og service_cases (WAVE3A/00173).
  Rollelisterne er uændrede, så de historiske filer genskabes byte-identisk.
- `scripts/rls/matrix-check.ts`: `DEDICATED_WRITE_POLICIES` får customers og service_cases (00239).
  `superseded-guard-test` udvides.
- Harness-scripts, der læser `p.insert` fra matrixen (`rls-lockdown`, `prod-verify-rls-wave`, `prod-rls-effective`),
  skal springe superseded-tabeller over. Samme hul gælder 00235's tabeller.

## 6. Test-plan

- **Staging:**
  1. dry run + fingerprint
  2. anvend
  3. ny `mp-00239-rls-check` (REST, rigtige sessioner):
     - nul overrides: alle 5 roller × INSERT/UPDATE/DELETE på begge tabeller = tabellen ovenfor
     - montør med ekstra `customers.create`/`cases.create` → tilladt
     - salg med fjernet `customers.edit` → UPDATE afvist
     - salg med fjernet `cases.create` → forslag kan ikke slettes
     - inaktiv → alt afvist
  4. 00235/00236/00238-matricerne skal stadig være grønne
- **UI:**
  - kunder: opret, ret, slet, import, lead→kunde, hurtig-opret med tilbud
  - sager: opret, tilbud→sag, forslag fremme/afvise, lukning
  - U229 og U228
- **Prod** først efter særskilt godkendelse: fingerprint, dry run, apply, fingerprint og rollback-only effektiv kontrol
  med rigtige profiler.

## 7. Rollback

Står nederst i SQL-filen og gendanner præcis prod-definitionerne fra 2026-10-26.

## 8. Beslutninger (Henrik 2026-10-26)

- **A — fjern montør-resten fra INSERT.** Kunde-/sagsoprettelse kræver nu den effektive rettighed i databasen. En montør
  med ekstra adgang (`customers.create`/`cases.create`, fx Elektriker-skabelonen) kan oprette; uden kan ikke.
- **B — salg UPDATE uændret i 00239.** Bevidst teknisk gæld til næste bølge (PERM-4b), hvor sags-/kundescope og
  alle afhængige stier gennemgås samlet.

## 9. Staging-resultat 2026-10-26

1. Generator-værn: `supersededBy 00239` på customers (WAVE1) og service_cases (WAVE3A); `DEDICATED_WRITE_POLICIES`;
   `superseded-guard-test` generaliseret (alle dedikerede tabeller); `rls-lockdown`, `prod-verify-rls-wave` og
   `prod-rls-effective` springer dedikerede tabeller over.
2. Før-fingerprint → 3. dry run (ROLLBACK) uden fejl → 4. fingerprint **identisk** (byte for byte).
5. Anvendt. 6. Skema-diff: **præcis 6 politikker** ændret (customers INSERT/UPDATE/DELETE, service_cases
   INSERT/UPDATE/DELETE); 0 funktioner, 0 grants, 0 tabeller; rækker og profiler uændrede.
7–8. `cli.ts mp-00239-rls-check` 33/33 (matrix nedenfor + override-scenarier + oprydning).

| Nul overrides | admin | serviceleder | salg | montør | bogholderi |
|---|---|---|---|---|---|
| customers INSERT | ✓ | ✓ | ✓ | ✗ (var ✓ — A) | ✗ |
| customers UPDATE | ✓ | ✓ | ✓ | ✗ | ✗ |
| customers DELETE | ✓ | ✗ | ✗ | ✗ | ✗ |
| service_cases INSERT | ✓ | ✓ | ✓ | ✗ (var ✓ — A) | ✗ |
| service_cases UPDATE | ✓ | ✓ | ✓ | ✗ | ✗ |
| service_cases DELETE sag | ✓ | ✗ | ✗ | ✗ | ✗ |
| service_cases DELETE forslag | ✓ | ✓ | ✓ | ✗ | ✗ |
| SELECT (begge) | ✓ | ✓ | ✓ | ✓ | ✓ |

**Konsekvenser at kende (ikke regressioner):**
- `cases.create` giver også sags-UPDATE og sletning af forslag (paritetsmapping fra `promoteCaseProposal`/
  `rejectCaseProposal`). En montør med Elektriker-skabelonen kan derfor via REST opdatere enhver sag og slette forslag
  — samme som salg i dag. Strammes i PERM-4b.
- customers INSERT er også åben for `offers.create`/`inbox.view`. Fjernes kun `customers.create` fra en salgsmedarbejder,
  kan vedkommende stadig oprette kunder (via hurtig-opret med tilbud og fra mail).

**Øvrige staging-tjek 2026-10-26:**
- sec-b7 18/18 + 12/12 · mp-00236 9/9 + 7/7 · mp-00237 2/2 + 4/4 · mp-00238 16/16.
- UI-regression `harness:ui-full -- sales,montor`: 106 tests, PASS 106, FLAKY 0, FAIL 0, TIMEOUT 0, NOT_RUN 0.
  Det inkluderer kunde-opret, hurtig-opret med tilbud, tilbud→sag (U219), sagsopret (U202), forslag, lukning
  (U48/U222), montørens sagsvalg (U226) samt U228/U229.
- tsc, check:rls-matrix, check:rbac og superseded-guard-test: alle exit 0. Port 3217 er fri.
- Migrationsfil: sha256 `26f5cfbcbd9cb5b36bba893665cf675c03d58de8ce7bbaa7ffc7399c72e85093`.
