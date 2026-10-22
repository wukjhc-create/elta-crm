# Forslag 00235 — SEC-B7: direkte REST-skrivninger følger appens autoritetsmodel

**Status:** FORSLAG — ikke anvendt (hverken staging eller prod). Kræver Henriks godkendelse pr. miljø.
**SQL:** [`00235_sec_b7_write_lockdown.DRAFT.sql`](00235_sec_b7_write_lockdown.DRAFT.sql) (inkl. rollback)
**Test:** `npx tsx scripts/test-harness/cli.ts sec-b7-rls-check` · prod pre-check: `npx tsx scripts/prod-sec-b7-precheck.ts`
**Ingen SELECT-ændringer.** Kun INSERT/UPDATE/DELETE for `authenticated` + to BEFORE UPDATE-triggere + udvidet 00213-trigger.

## 1. Nuværende policies og grants (prod, læst 2026-10-22)

| Tabel | Rækker | INSERT | UPDATE | DELETE | Grants |
|---|---|---|---|---|---|
| `work_orders` | 3 (alle planned) | admin, serviceleder | admin, serviceleder · montør på egne (tildelt egen aktive medarbejder), ny status in_progress/done | admin, serviceleder | authenticated: alle |
| `customer_tasks` | 28 (alle oprettet af admin; 3 tildelt montør) | alle 5 roller, **enhver række** | alle 5 roller, **enhver række** | alle 5 roller, **enhver række** | authenticated + **anon**: alle (anon: ingen RLS-politik → blokeret) |
| `roof_drawings` | 5 (alle uden sag, oprettet af admin) | alle 5 roller, enhver række | alle 5 roller, enhver række | alle 5 roller, enhver række | authenticated: alle |

`work_orders` har desuden **00213** (`trg_work_orders_montor_update_guard`): montør må kun ændre `status`/`completed_at` og kun på
planned/in_progress-ordrer. Review-fundet "montør kan PATCHe alle kolonner" var derfor kun delvist rigtigt.

## 2. Præcise sårbarheder (bevist på staging, før 00235: `[NY] 0/18`)

Direkte REST-kald med en rigtig persona-session (uden om appen):

- **customer_tasks**
  - **T2** Montøren kan oprette opgaver hos kunder, hvor vedkommende ikke har et job.
  - **T3** Montøren kan oprette opgaver til andre brugere.
  - **T4** Montøren kan sætte `created_by` til en anden bruger.
  - **T6/T7** Montøren kan ændre og slette andres opgaver.
  - **T8** Bogholderi kan ændre andres opgaver.
  - **T10** `created_by` kan ændres.
  - **T12** Montøren kan omfordele en opgave til andre.
- **roof_drawings**
  - **R2** Montøren kan tegne på en fremmed sag.
  - **R3** Montøren kan oprette en tegning uden sag.
  - **R4** Bogholderi kan oprette en tegning uden sag.
  - **R7** Sag og kunde kan blandes (kryds-sag).
  - **R8** `created_by` kan forfalskes ved oprettelse.
  - **R9/R10** Montøren kan ændre og slette fremmede sagers tegninger.
  - **R12** Kunde, sag og opretter kan ændres på en eksisterende tegning.
- **work_orders**
  - **W3** `completed_at` kan tilbagedateres (fx 2020-01-01).
  - **W4** Montøren kan ændre en ordre på en lukket sag.

## 3. App-kaldere der skriver direkte via bruger-sessionen

Der er ingen skrivninger fra browseren; alle går gennem server-actions.

| Tabel | Bruger-klient-skrivere (rolle → kolonner) |
|---|---|
| work_orders | Oprettelse, planlægning, sletning og lukning (admin/serviceleder). Statusskift `changeWorkOrderStatus`: montør kun `{status, completed_at}` på egne ordrer. |
| customer_tasks | `createCustomerTask` (montør kun til sig selv hos kunde med eget job). `update/complete/delete/snoozeCustomerTask` (`taskWriteDenied`: customers.edit = alle; ellers kun egne). `bookBesigtigelse`, `sendOfferEmail` og tilbud→sag (opretter = én selv). **`saveBesigtigelsesnotat` lukkede andres besigtigelsesopgaver** → P1. **`auto-tasks` var en ugatet server-action** → P2. |
| roof_drawings | `createRoofDrawing`, `saveRoofDrawing` (kun `panel_count, drawing_data, title, panel_product_code`) og `deleteRoofDrawing`, alle bag `roofWriteDenied`. Billeder via admin-klient (00209). |

System-, cron-, agent- og portal-stier bruger service-role og berøres ikke af policies. Triggerne springer dem over
(`current_user <> 'authenticated'` / `pg_trigger_depth() > 1`).

## 4. Forudsætninger (CODE → TEST → PUSH før migrationen)

| # | Ændring | Status |
|---|---|---|
| P1 | `saveBesigtigelsesnotat`: lukning af kontorets bookede besigtigelsesopgaver sker med admin-klienten bag den eksisterende gate (`service.edit` + sags-scope) | kode klar (U224) |
| P2 | `createAutoTasksForUnansweredEmails`/`autoCloseRespondedTasks` flyttet til `lib/services/auto-tasks` — ikke længere server-actions (enhver bruger kunne oprette opgaver til andre/lukke andres). Cron-adfærd uændret (anon-cron = P-003, BLOCKED) | kode klar |
| P3 | `scripts/rls/write-matrix.ts`: customer_tasks og roof_drawings markeres som "scoped" (rolle + række-prædikat); commit sammen med migrationen så `check:rls-matrix` er grøn | ved migration |

## 5. Foreslåede regler

| Tabel | Rolle | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| customer_tasks | admin, serviceleder, salg | ja, `created_by` = én selv | alle rækker | alle rækker |
| | bogholderi | ja, `created_by` = én selv | kun egne (tildelt/oprettet) | kun egne |
| | montør | kun `assigned_to` = `created_by` = én selv **og** kunden har ikke-annulleret job tildelt montøren | kun egne; omfordeling kun til sig selv | kun egne |
| | alle (trigger) | — | `created_by` uforanderlig | — |
| roof_drawings | admin, serviceleder, salg | ja | ja | ja |
| | bogholderi | kun med sag | kun med sag | kun med sag |
| | montør | kun på sag i eget scope (`user_can_see_case` = appens `getCaseScope`) | samme | samme |
| | alle | sag skal høre til kunden, `created_by` = én selv | kun tegnefelter (trigger: kunde/sag/opretter/billede låst) | — |
| work_orders | montør (00213 + 00235) | — | som 00213 **+** ingen ændring på lukket sag **+** `completed_at` sættes af DB (`now()` ved →done, ellers uændret) | — |

Nye SECURITY DEFINER-hjælpere: `montor_has_customer_job(uuid)`, `case_belongs_to_customer(uuid, uuid)` og
`case_is_closed(uuid)`. Alle får `REVOKE ALL FROM PUBLIC, anon, authenticated` og derefter `GRANT EXECUTE TO authenticated`.
Triggerfunktionerne får `REVOKE ALL FROM PUBLIC, anon, authenticated`.

**Bevidst IKKE med** (separate beslutninger):
- **anon-grants på customer_tasks:** hører til P-003 (anon-cron). En revoke ændrer cron-adfærd. RLS blokerer anon allerede (T13).
- **`tasks.delete`:** appen lader salg slette alle opgaver og bogholderi/montør slette egne, selvom `tasks.delete` = admin/serviceleder.
  Databasen spejler appens nuværende adfærd. En stramning er en produktbeslutning.
- **Tagtegninger på lukket sag:** appen forbyder det ikke i dag, så det håndhæves ikke.
- **SELECT** er `USING (true)` på alle tre tabeller. Det er uændret og eventuelt en senere migration.

## 6. Data-påvirkning (prod)

- Der ændres ingen data, og der er ingen backfill.
- `customer_tasks`: alle 28 er oprettet af admin. De 3 der er tildelt montør kan montøren fortsat afslutte og ændre (tildelt = egen).
- `roof_drawings`: alle 5 er uden sag og oprettet af admin. De kan fortsat redigeres af admin, serviceleder og salg; det har appen
  allerede krævet. 0 rækker har sag/kunde-uoverensstemmelse.
- `work_orders`: 3 planned. Der ændres ikke på eksisterende `completed_at`.

## 7. Afhængigheder og rækkefølge

1. P1 + P2 committes, pushes og testes (U224, U221, U197, U69).
2. **Staging:** `harness:migrate-staging -- 00235` → `sec-b7-rls-check` skal give `[NY] 18/18` og `[UÆNDRET] 12/12`. Derefter
   `work-orders-guard-check`, `check:rls-matrix`, `check:rbac`, `tsc` og UI: opgaver (U175 m.fl.), tagtegninger, besigtigelse
   (U224), montør-flow (U11, U40, U63, U66, U71) og planlægning/lukning (U48, U222).
3. **Prod** først efter særskilt godkendelse. Kør `prod-sec-b7-precheck` før og efter, plus en persona-postcheck.

Kræver: `user_role()` og `user_can_see_case()` (00180, i prod) og 00213 (i prod).

## 8. Risiko for legitime montør-flows

| Flow | Efter 00235 | Dækket af |
|---|---|---|
| Starte og afslutte eget job | uændret; `completed_at` sættes af DB i stedet for af appen (samme tidspunkt ± sekunder) | W1, W2, U11 |
| Opgave til sig selv hos egen kunde | uændret | T1 |
| Afslutte/ændre opgave tildelt sig selv | uændret | T11 |
| Gemme besigtigelse (lukker kontorets bookede opgave) | virker via P1 | U224 |
| Tagtegning på egen sag | uændret | R1, R11 |
| Rette tegning på kunde uden sag | blokeret, men appen tillod det heller ikke | R3 |
| Rollback ved samtidig sagslukning (W4) | fejlede allerede før (00181), uændret | — |

Største risiko: en app-sti jeg har overset, som skriver andres opgaver med bruger-klienten. Inventaret er udtømmende pr.
2026-10-22. En sådan sti ville fejle med en 42501-fejl, ikke med et stille datatab.

## 9. Rollback

Står nederst i SQL-filen. Den gendanner præcis policies og 00213-funktionen og dropper de nye triggere og hjælpere.
Rollback kører kun ved en reel regression.
