# Runbook — prod-migrationer 00164 + 00165 (leverandørdomænet)

**Status:** ✅ **KØRT i production 2026-09-29** (godkendt af Henrik). Pre-check og read-only post-check er grønne. Den afsluttende suite er grøn: `prod:db-audit` HØJ/MIDDEL 0 (LAV 109), `prod:role-policies` 0·0·0, `prod:storage-audit` ingen huller, `prod:verify-00161/00162/00163` grønne, `prod:pilot-health` 🟢, agents 7/7 disabled/suggest, AUTO_CREATE og AGENT_LIVE_SEND OFF, 0 kundemails og 0 finance-writes (`scripts/prod-safety-confirm.ts`). Verifikation: `npx tsx scripts/prod-verify-00164-00165.ts post-00164|post-00165`. Skrivning er admin-only, jsonb-credentials er ulæselige, og admin og montør læser offentlige kolonner med `permission denied` på hemmelige. CHECK tillader ftp_sync/ftp_manual, og prishistorikken er 0 rækker (fyldes ved næste LM-sync).

| Migration | Hvad | Hvorfor |
|---|---|---|
| **00164** `supplier_settings_lockdown` | Ingen anon-grants. authenticated kan kun læse/skrive ikke-hemmelige kolonner (`api_credentials`/`ftp_credentials` er udelukket). Skrivning (INSERT/UPDATE/DELETE) kun for admin. | P-005 (S3): alle indloggede kunne ændre standardmargin og sync-konfiguration. Jsonb-credentials kunne læses, men er tomme i prod (forebyggende). |
| **00165** `price_history_change_sources` | CHECK tillader også `ftp_sync`/`ftp_manual` | FTP-prisændringer afvises i dag, så `price_history` er tom trods ugentlig LM-import. |

## Forudsætning (expand/contract)
Koden, der kun vælger `SUPPLIER_SETTINGS_PUBLIC_COLUMNS` og gater skrive-actions med `settings.suppliers`, **er pushet først**. Den virker både før og efter 00164.

## Målt på staging
- `harness:supplier-lockdown` 5/5 med probe-data:
  - montør kan hverken læse jsonb-credentials eller ændre margin; admin kan,
  - anon afvist,
  - `ftp_sync` accepteres,
  - ingen wildcard-select i koden.
- `harness:pilot-roles` 0 huller, og de nye hemmelige kolonner er med i tjekket.
- db-audit: HØJ/MIDDEL 0, LAV 112→111.
- security grøn.

## Udførelse (efter godkendelse)
1. Tilføj `'00164'` og `'00165'` med dato til allowlist i `scripts/prod-apply-migration.ts`.
2. Pre-check (read-only):
   - `npm run prod:role-policies`. Viser i dag 2 hemmelige kolonner læsbare (`supplier_settings.api_credentials/ftp_credentials`); det er forventet før 00164.
   - `npm run prod:db-audit`.
3. `npm run prod:apply-migration -- 00164 --approved-by-henrik`, derefter `… 00165 …`
4. Post-check:
   - `npm run prod:role-policies` → **0·0·0**,
   - `npm run prod:db-audit` HØJ/MIDDEL 0,
   - `npm run prod:pilot-health` 🟢,
   - som admin: åbn Indstillinger → Leverandører → LM og gem uden ændring (skal lykkes).

## Driftseffekt af 00165
Næste ugentlige `lemu-sync` (mandag 04:00 UTC) gemmer for første gang prishistorik for ændrede LM-priser. Mængden afhænger af, hvor mange priser der ændres. Det er kun intern data, ingen ekstern effekt.

## Rollback
Se migrationernes header. Ingen data ændres af 00164. 00165 kan kun rulles tilbage, hvis der ikke findes rækker med de nye værdier.
