# Runbook 00185 — N2: godkendelse af timer (+ N28 dashboard-tæller)

**Status:** BLOCKED_APPROVAL (prod). Staging: anvendt og grøn. Kode: branch `n2-time-approval` (parkeret, må først på
main EFTER 00185 i prod — koden læser/skriver de nye kolonner).

## Hvorfor
Henrik 2026-10-02: "montør registrerer → serviceleder/admin godkender". Kun status + hvem/hvornår — **ingen løn-,
faktura- eller e-conomic-effekt** af godkendelsen (endnu).

## Hvad ændres (kun `time_logs`, additivt)
| Objekt | Ændring |
|---|---|
| `time_logs` | + `approval_status text NOT NULL DEFAULT 'pending'` (CHECK pending/approved/rejected), `approved_by` (FK profiles, SET NULL), `approved_at`, `rejection_reason` |
| backfill | eksisterende rækker → `approved`, `approved_at = created_at` (ingen kø af gamle timer; springes over ved genkørsel) |
| `idx_time_logs_approval_pending` | delvist indeks (employee_id, start_time) WHERE pending |
| `time_logs_approval_guard()` | trigger-funktion, låst search_path, EXECUTE fjernet fra PUBLIC/anon/authenticated |
| `trg_time_logs_approval_guard` | BEFORE INSERT OR UPDATE: bruger-session kan ikke sætte/ændre godkendelsesfelter (montør kan ikke godkende egne timer); INSERT tvinges til pending; rettet godkendt række → pending igen. Service-role (server-action efter `time_logs.approve`) passerer |

Uændret: RLS-policies, kost-trigger `trg_time_logs_cost_amount`, fakturering, løn, e-conomic, crons.

## Kompatibilitet (rækkefølge)
- **Migration før kode:** nuværende main-kode læser ikke de nye kolonner og ændrer dem aldrig → triggeren rammer kun
  INSERT (sætter pending, som ingen læser endnu). Ingen fejl for montør/serviceleder i mellemperioden.
- **Kode efter migration:** merge `n2-time-approval` → main (Godkend timer-side, godkendelses-actions, N28-tæller i
  cockpit). Uden migrationen ville den kode fejle på manglende kolonner — derfor parkeret.

## Prod-effekt (read-only målt 2026-10-03)
`prod-verify-00185 pre` ✅: ingen kolonner/trigger/funktion; 1 timeregistrering i alt (0 åbne); eneste trigger på
tabellen er `trg_time_logs_cost_amount`. → Backfill rammer 1 række; køen er tom efter kørslen.

## Kørsel (kun efter Henriks eksplicitte godkendelse)
1. Tilføj `'00185': '<dato>', // N2 godkendelse af timer, godkendt af Henrik i chat <dato>` til allowlisten i
   `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-verify-00185.ts pre` → ✅
3. `npm run prod:apply-migration -- 00185 --approved-by-henrik`
4. `npx tsx scripts/prod-verify-00185.ts post` → ✅ (4 kolonner, CHECK, indeks, guard uden direkte EXECUTE, trigger
   BEFORE INSERT OR UPDATE, backfill: ingen gamle timer i kø)
5. `npx tsx scripts/prod-db-audit.ts` → HØJ/MIDDEL 0.
6. Merge `n2-time-approval` → main (fuld CI: tsc, lint, check:rbac, check:rls-matrix, unit; UI-batch U72 + U11/U44/U73).
7. Efter deploy: montør registrerer tid → vises som "afventer" i cockpittet for serviceleder/admin; godkend én.
8. Afvigelse → stop. Rollback (før kode-merge): SQL i migrationens header. **Efter kode-merge: revert koden først**,
   derefter rollback-SQL (ellers fejler godkendelsessiden på manglende kolonner).

## Staging-bevis
Migration anvendt på staging. På branchen `n2-time-approval`:
- `harness:rls-read` **L13**: montør kan ikke sætte/ændre godkendelse via REST, insert tvinges pending, rettelse af
  godkendt registrering → pending, service-role kan godkende.
- UI **U62**: montør registrerer → admin afviser med begrundelse (montør ser "Afvist") → godkender.
- UI **U72** (N28): cockpit-tæller + link til /dashboard/time-approval. N28 typecheck-grøn; U72 køres igen ved merge.
