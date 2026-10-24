# Forslag 00236 — opgave-sletning og tagtegninger på lukket sag

**Status:** FORSLAG — ikke anvendt (staging og prod kræver hver sin godkendelse).
**SQL:** [`00236_task_delete_roof_closed_case.DRAFT.sql`](00236_task_delete_roof_closed_case.DRAFT.sql) (inkl. rollback)
**Kilde:** Henriks produktbeslutninger 2026-10-24.
**Bygger på 00235.** customer_tasks og roof_drawings ejes af dedikerede migrationer, og generatoren er låst (`supersededBy`).

## 1. Regler

| Område | Rolle | Regel |
|---|---|---|
| Opgave: slet | admin, serviceleder | tilladte opgaver (uændret) |
| | salg, bogholderi | kun opgaver de selv har oprettet; aldrig system- eller auto-opgaver |
| | montør | kun når `created_by` = én selv **og** `assigned_to` = én selv **og** opgaven er koblet til en sag i eget scope; aldrig system- eller auto-opgaver |
| Tagtegning | alle roller | lukket sag = ingen opret, ret eller slet. Admin/serviceleder genåbner sagen først. Tegninger uden sag er uberørte |

System- og auto-opgaver afsluttes eller afvises i stedet for at blive slettet.

## 2. App-forudsætninger (laves FØR migrationen, i rettigheds-termer så de følger med per-medarbejder-overrides)

- **Server:**
  - `taskDeleteDenied` i `lib/actions/customer-tasks.ts`. `tasks.delete` giver alt. Ellers aldrig system-/auto-opgaver.
    Med `tasks.create` kun egne oprettede. Uden `tasks.create` kræves egen + tildelt + sag i scope (`userCanViewCase`).
  - En blokeret sletning (0 rækker) melder nu fejl i stedet for succes.
  - `roofWriteDenied` afviser en lukket sag for alle (create/save/delete), og en læsefejl melder fejl.
- **Montør-opgaver:** de kobles automatisk til montørens sag hos kunden, når der er præcis én åben sag med job tildelt
  montøren. Ellers forbliver opgaven sagsløs og kan afsluttes, men ikke slettes.
- **UI:** sletteknappen vises kun, når reglen tillader det (`lib/tasks/task-delete-rule.ts`). Det gælder både kundekortet
  og /dashboard/tasks.
- **Tests:** `scripts/task-delete-rule-test.ts` (12 tilfælde). UI: U225 (lukket sag afvist), U175, U196, U201 og U224.

**Åbent punkt — afgøres af Henrik:** en montør-opgave på en kunde med **flere** åbne sager bliver sagsløs og kan
derfor ikke slettes af montøren. Alternativet er at lade montøren vælge sag i opret-dialogen. Det er ikke bygget.

## 3. Påvirkning

**Prod-data (2026-10-24):**
- 28 opgaver, alle oprettet af admin. Ingen er auto-genererede eller uden opretter.
- 5 tagtegninger, alle uden sag. De rammes ikke af lukket-sag-reglen.
- Ingen data ændres.

**Adfærdsændring:**
- Salg kunne slette **alle** opgaver (via customers.edit) og kan nu kun slette egne oprettede.
- Bogholderi og montør mister sletning af opgaver, der kun var tildelt dem.

## 4. Test-plan (staging, efter godkendelse)

1. `dry-run-staging 00236` med identisk snapshot.
2. Anvend.
3. `sec-b7-rls-check` udvides med 00236-tilfælde:
   - salg sletter andens opgave → afvist; salg sletter egen → tilladt; salg sletter auto-opgave → afvist
   - montør: egen + tildelt + sag → tilladt; egen uden sag → afvist
   - tagtegning på lukket sag (alle roller) → afvist
4. 00235-tilfældene skal fortsat give 18/18 og 12/12.
5. UI: U225, U175, U196, U201, U224.
6. Prod først efter særskilt godkendelse: snapshot, rollback-only effektiv kontrol (`prod-sec-b7-effective` udvides) og snapshot.

## 5. Rollback

Står nederst i SQL-filen og gendanner 00235-definitionerne af de fire policies.
