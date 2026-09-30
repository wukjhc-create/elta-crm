# Runbook — prod-migrationer 00167 + 00168 (leverandører: CVR + skrivelås)

**Status:** ✅ **KØRT i production 2026-09-30** (godkendt af Henrik). Rækkefølge: pre → 00167 → post-00167 → 00168 → post-00168, alle grønne. Persona-check: admin og montør læser 2/2 leverandører inkl. CVR, skrive-prædikatet er sandt kun for admin. Den afsluttende suite er grøn: `prod:db-audit` HØJ/MIDDEL 0 (LAV 108), `prod:role-policies` 0·0·0, `prod:pilot-health` 🟢, `prod-write-policies` 109→108, agents 7/0/0, 0 kundemails og 0 finance-writes.

| Migration | Hvad | Hvorfor |
|---|---|---|
| **00167** `suppliers_vat_number` | Ny kolonne `vat_number` (valgfri) med disse dele: <ul><li>trigger-normalisering via `public.normalize_vat_number` (8 cifre → `DK########`, samme regel som `src/lib/invoice-control/vat.ts` og fakturaparseren)</li><li>CHECK på format</li><li>partielt opslags-indeks</li></ul>**Ingen UNIQUE**, og der udfyldes ingen data. | IC10: matcheren slog CVR op i en kolonne, der ikke fandtes, så CVR-match har aldrig virket |
| **00168** `suppliers_write_lockdown` | Skrivning (INSERT/UPDATE/DELETE) kun for admin. Anon-grants fjernes. Læsning er uændret. | **P-008 (S2):** enhver indlogget kan slette AO/LM via REST. `ON DELETE CASCADE` sletter så ~324k leverandørpriser, indstillinger, credentials og sync-jobs |

## Hvorfor ingen unik-constraint
- Prod har 2 leverandører og 0 CVR-værdier, så forretningsdata kan ikke understøtte en unik-constraint endnu.
- Samme CVR kan legitimt findes på flere rækker (afdelinger/konti).
- Matcheren kræver præcis ét hit. Flere hits logges som `ambiguous_vat`, og der gættes ikke (test V5).
- En unik-constraint kan tilføjes senere, når `prod-verify-00167-00168.ts post-00168` viser 0 dubletter på udfyldte data.

## Forudsætning (expand/contract)
Koden er pushet først og virker både før og efter:
- Formularen sender kun CVR, når feltet er ændret.
- Matcheren tåler, at kolonnen mangler (så er der intet hit).
- Alle app-skrivninger til `suppliers` er allerede gatet med `settings.suppliers` (= admin). Derfor kræver 00168 ingen kodeændring. Service-role (sync, setup-lemu) påvirkes ikke.

## Målt på staging
- `harness:supplier-vat` 8/8:
  - struktur,
  - DB/TS-normaliserings-paritet 9/9,
  - CHECK,
  - CVR-match,
  - tvetydig CVR giver intet gæt,
  - navne-match uændret,
  - RLS: serviceleder/montør/salg/bogholderi kan ikke skrive, admin kan, alle kan læse,
  - anon har 0 grants.
- Regression grøn:
  - `invoice-pipeline` 10/10, `invoice-attachments` 7/7, `supplier-lockdown` 5/5, `invoice-rls` 5/5,
  - `exemption-proofs` 12/12, `pilot-roles` 0 huller, `security` grøn,
  - `db-audit` HØJ/MIDDEL 0, `check:rbac` 0 fejl, typecheck og build grønne.

## Pre-check prod (read-only, 2026-09-29)
`npx tsx scripts/prod-verify-00167-00168.ts pre`:
- `vat_number` findes ikke,
- 3 åbne skrive-policies,
- anon har 7 grants,
- 2 leverandører.

## Udførelse (efter godkendelse)
1. Tilføj `'00167'` og `'00168'` med dato til allowlist i `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-verify-00167-00168.ts pre` → ✅
3. `npm run prod:apply-migration -- 00167 --approved-by-henrik`, derefter `… post-00167` → ✅
4. `npm run prod:apply-migration -- 00168 --approved-by-henrik`, derefter `… post-00168` → ✅
5. Kør `prod:db-audit`, `prod:role-policies`, `prod:pilot-health` og `scripts/prod-write-policies.ts`. `suppliers` skal være væk fra listen.
6. Som admin: Indstillinger → Leverandører → rediger LM → indtast CVR → gem. Det skal lykkes og blive vist som `DK########`.

## Rollback
Se migrationernes header. 00167 er additiv. 00168 kan genskabes med de gamle policies, men det frarådes.
