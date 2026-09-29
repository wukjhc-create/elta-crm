# Runbook — prod-migration 00166: RLS på leverandørfaktura-linjer og audit-log (P-007)

**Status:** ✅ **KØRT i production 2026-09-29** (godkendt af Henrik). Pre-check og read-only post-check er grønne. Den afsluttende suite er grøn: `prod:db-audit` HØJ/MIDDEL 0 (LAV 109), `prod:role-policies` 0·0·0, `prod:storage-audit` ingen huller, `prod:verify-00161/00162/00163` grønne, `prod:pilot-health` 🟢, agents 7/7 disabled/suggest, AUTO_CREATE og AGENT_LIVE_SEND OFF, 0 kundemails og 0 finance-writes (`scripts/prod-safety-confirm.ts`). Verifikation: `npx tsx scripts/prod-verify-00166.ts post`. 0 åbne policies, 00160-policies uændrede, audit er append-only og anon har ingen adgang. **Admin ser 9/9 linjer og 117/117 audit, montør ser 0/0.**

## Fund (prod read-only, 2026-09-29)
00160 låste `incoming_invoices`, men de to undertabeller har stadig `FOR ALL TO authenticated USING (true)`:
- `incoming_invoice_lines`: alle indloggede (montør, salg) kan læse leverandørpriser pr. vare og rette eller slette linjer.
- `incoming_invoice_audit_log`: alle indloggede kan **rette eller slette audit-spor**.

## Ændring
| Tabel | Læs | Ret | Opret/slet |
|---|---|---|---|
| `incoming_invoice_lines` | admin, serviceleder, bogholderi | admin, bogholderi | admin |
| `incoming_invoice_audit_log` | admin, serviceleder, bogholderi | **ingen** (append-only) | indsæt: læseroller · slet: ingen |

`incoming_invoices` røres ikke (00160 gælder). Anon får ingen grants på de tre tabeller. Service-role (crons, konvertering, e-conomic) påvirkes ikke. App-stierne, der skriver linjer (admin-testfaktura) og audit (bag edit/approve), er dækket.

## Målt på staging
- `harness:invoice-rls` 5/5 med rigtige rolle-sessioner:
  - 0 åbne policies,
  - læs linje: admin, serviceleder, bogholderi,
  - ret linje: admin, bogholderi,
  - slet linje: admin,
  - audit kan ikke rettes eller slettes af nogen.
- `harness:pilot-roles` 0 huller.
- db-audit HØJ/MIDDEL 0, LAV 111→109.
- `harness:invoice-pipeline` 7/7 og security grøn.

## Udførelse (efter godkendelse)
1. Tilføj `'00166'` til allowlist i `scripts/prod-apply-migration.ts`.
2. `npm run prod:apply-migration -- 00166 --approved-by-henrik`
3. Post-check: `npm run prod:role-policies` og `npm run prod:db-audit` (HØJ/MIDDEL 0). Tjek read-only, at `pg_policies` for de tre tabeller ingen `USING (true)` har.
4. Smoke som bogholderi: åbn Leverandørfakturaer og en faktura med linjer.

## Rollback
Se migrationens header. Ingen data ændres.
