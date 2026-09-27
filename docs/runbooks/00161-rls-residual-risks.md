# Runbook — prod-migration 00161: luk rest-risici R1–R4

**Status:** ✅ KØRT I PRODUCTION 2026-09-27 (godkendt af Henrik) · verificeret med `prod:role-policies` (0·0·0) og `prod:verify-00161` (struktur + adfærd som admin/montør).

## Hvad
| | Før (prod, read-only 2026-09-27) | Efter |
|---|---|---|
| R1 fakturaer/betalinger | salg læser alle | salg kun fakturaer på sager salg har oprettet (besluttet model SPRINT_7A `own_cases`); montør intet |
| R2 tidsregistreringer | alle indloggede læser alt; montør kan skrive på andres medarbejder/ordrer | montør: egne + på egne arbejdsordrer; salg: på egne sager; skriv kun egen medarbejder + egen ordre |
| R3 leverandør-credentials | krypterede kolonner læsbare for **authenticated og anon** | kun service-role; metadata (id/type/aktiv m.m.) stadig læsbar |
| R4 `v_recent_audit_logs` | omgår RLS (ejer-rettigheder) — alle ser hele audit-loggen | `security_invoker` — admin ser alt, andre kun egne |

Fil: [`supabase/migrations/00161_rls_residual_risks_r1_r4.sql`](../../supabase/migrations/00161_rls_residual_risks_r1_r4.sql)

## Forudsætning (skal være opfyldt FØR migrationen)
Koden der ikke længere læser hemmelige kolonner med brugerklienten skal være deployet (commit med
`supplier-credential-secrets.ts`). Den er bagudkompatibel og kan deployes alene — og er allerede pushet til `main`.

## Målt på staging (`npm run harness:pilot-roles`, probe-data i alle tabeller)
- Før 00161: **15 afvigelser** fra modellen (bl.a. salg ser fremmede fakturaer, montør ser/skriver fremmed tid, alle læser ciphertext, alle ser andres audit).
- Efter 00161: **35/35 checks som forventet** · 0 uventede læse-/skrivehuller · 0 tilladte roller der mistede adgang · views og hemmelige kolonner grønne.
- Security 21/21 · flows 9/9 · invarianter 14/14 · statisk sikkerhedstest ✅ · typecheck/build ✅.

## Forventede synlige ændringer i appen
- Salg: fakturaliste/sags-økonomi/kundebetalingsoversigt viser kun egne sagers fakturaer.
- Montør: tidsregistreringer kun egne og på egne arbejdsordrer (som appens scope i forvejen).
- Leverandør-credentials-UI og LM-synk: kun admin (`settings.suppliers`).
- Audit-log-siden: ikke-admin ser kun egne hændelser.

## Udførelse (efter godkendelse)
1. Tilføj `'00161': '<dato>'` til allowlist i `scripts/prod-apply-migration.ts`.
2. Pre-check: `npm run prod:role-policies` → forventet 1 åben tabel (time_logs), 1 view (v_recent_audit_logs), 3 hemmelige kolonner.
3. `npm run prod:apply-migration -- 00161 --approved-by-henrik`
4. Post-check: `npm run prod:role-policies` → **0 · 0 · 0** · `npm run prod:pilot-health` 🟢.
5. Smoke som admin: fakturaliste, tidsregistrering, leverandør-credentials (test forbindelse), audit-log.

## Rollback
Rollback-SQL står i migrationens header. Ingen data ændres.
