# Runbook 00180 — GO-LIVE G10: mail-scope for montør + serviceleder ser medarbejdere

**Status:** BLOCKED_APPROVAL (prod). Staging: anvendt 2026-10-01 og grøn.

## Hvorfor
- **G9 (Henrik 2026-10-01):** montører må ikke se/arkivere virksomhedens postkasse — kun mails på egne sager/job.
  App-laget er lukket (commit e42781d), men `incoming_emails` har `SELECT USING (true)`: en montør kan stadig læse
  al mail direkte via REST med sit eget login.
- **G5:** serviceleder (planlægger) ser kun sin egen `employees`-række → tom kalender/medarbejderliste, kan ikke
  tildele montører. Løn ligger i `employee_compensation` (uændret admin/self).

## Hvad ændres (kun SELECT-policies + én hjælpefunktion)
| Objekt | Før | Efter |
|---|---|---|
| `incoming_emails` SELECT | alle indloggede (`true`) | admin, serviceleder, salg, bogholderi som før; **montør kun mails med `service_case_id` på egne sager** |
| `employees` SELECT | admin eller egen række | **admin, serviceleder** eller egen række |
| `user_can_see_case(uuid)` | — | ny, SECURITY DEFINER, `search_path` låst, EXECUTE kun `authenticated` (samme scope som appens `getCaseScope`) |

Uændret: skrive-policies, anon (ingen SELECT-policy → ser intet), crons (service-role / P-003 anon).

## Prod-effekt (read-only målt 2026-10-01)
802 mails, **0 koblet til en sag** → montører ser ingen mail efter 00180, indtil mails kobles til deres sager
(ordrens Mails-fane). Det er den besluttede adfærd. Prod har 0 serviceleder-brugere i dag.

## Kørsel (kun efter Henriks godkendelse)
1. Tilføj `00180` til allowlisten i `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-verify-00180.ts pre` → skal være ✅ (verificeret ✅ 2026-10-01).
3. `npm run prod:apply-migration -- 00180 --approved-by-henrik`
4. `npx tsx scripts/prod-verify-00180.ts post` → ✅ (præcis de nye policies, definer uden anon-EXECUTE).
5. `npx tsx scripts/prod-db-audit.ts` → HØJ/MIDDEL 0. `npx tsx scripts/prod-rls-effective.ts` (admin/montør).
6. Stop ved afvigelse → rollback (SQL i migrationens header).

## Staging-bevis
- `harness:rls-read` før: L9 montør=111 (læste al mail), L10 serviceleder=00 → efter: L9 montør=100, øvrige 111;
  L10 admin/serviceleder=11, montør=10, salg/bogholderi=00. L1–L8 uændret grønne.
- db-audit 0/0/0, pilot-roles, planning-flow 6/6, agent-actions 7/7, session-lifecycle 7/7, invoice-pipeline 10/10,
  ui-e2e 13/13.
