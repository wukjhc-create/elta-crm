# 00194 — system_alerts (notifikationsklokken) · prod-runbook

**Status 2026-10-07:** anvendt i PROD efter godkendelse (Henrik/ChatGPT 2026-10-07). Se kørselslog nederst.

## Hvorfor
Tabellen findes ikke i prod, så klokken er altid tom. Konkret går tabt i dag:
- "Fuldmagt underskrevet" (kunden underskriver i portalen)
- "Besigtigelse bekræftet" (kunden bekræfter i portalen)
- leverandør-/prisadvarsler fra den natlige `intelligence-check` (03:00)

## Hvad migrationen gør
- Opretter `system_alerts` med RLS.
- Kun systemet (service_role) opretter advarsler; ingen bruger kan oprette eller slette.
- Læse + markér læst/afvis: **admin, serviceleder, bogholderi** (samme roller som appen viser klokkens
  systemadvarsler for, `economy.cost_prices`). Salg og montør ser dem ikke (advarslerne kan indeholde margin/priser).
- Brugere kan kun ændre statusfelterne (`is_read`, `is_dismissed`, `read_at`, `dismissed_at`, `dismissed_by`).

Kodeændringer der følger med (allerede på main, virkningsløse indtil tabellen findes):
- Markér læst/afvis i klokken kræver nu `economy.cost_prices` (før `tools.calculations` → bogholderi kunne se men ikke afvise).
- Pris-advarselsoverlayet kræver `economy.cost_prices` (før: ingen rettighedstjek).
- `intelligence-check` opretter ikke en advarsel igen, så længe en åben (ikke afvist) med samme type/emne/titel findes.
  Før ville samme leverandør-/prisadvarsel blive oprettet igen hver nat.

## Staging-verifikation (2026-10-07)
- `npx tsx scripts/test-harness/cli.ts system-alerts-check` — alle tjek grønne:
  - portal-hændelse → advarsel oprettes (`createSystemAlertAdmin`)
  - rollematrix med rigtige logins: admin/serviceleder/bogholderi ser; salg/montør ser ikke; ingen kan oprette,
    slette eller ændre titel; salg/montør kan ikke markere læst
  - bogholderi kan markere læst og afvise; afvist forsvinder fra klokken
  - natlig intelligence-check kørt 2 gange: 9 advarsler første gang, 0 nye anden gang (dubletsikring)
- UI: `npm run harness:ui-batches -- U138` PASS — admin ser "Fuldmagt underskrevet" i klokken, "Afvis" sætter
  `is_dismissed`, montør ser den ikke.

## Forventet effekt i prod (read-only estimat 2026-10-07, `scripts/prod-system-alerts-estimate.ts`)
Første nat efter migrationen opretter `intelligence-check` ca. **3 advarsler**:
| Advarsel | Niveau |
|---|---|
| Leverandørsync forældet: AO (220 dage) | kritisk |
| Leverandørsync forældet: Lemvigh-Müller (9 dage) | advarsel |
| Forældede produktpriser (12.900 produkter > 14 dage) | advarsel |
0 tilbud under margingrænsen, 0 prisændringer på åbne tilbud, `price_alert_rules` findes ikke (prisændrings-sektionen
springes over). De følgende nætter: ingen nye kopier, så længe advarslerne ikke er afvist.

## Kørsel (efter godkendelse)
1. Tilføj `'00194': '<dato>'` til `APPROVED` i `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-verify-00194.ts pre` → forventet 3/3 (verificeret 2026-10-07).
3. `npm run prod:apply-migration -- 00194 --approved-by-henrik`
4. `npx tsx scripts/prod-verify-00194.ts post` → forventet alle OK (tabel, RLS, 2 policies, ingen INSERT/DELETE,
   kun statuskolonner kan ændres, 0 rækker).
5. Rolle-tjek i prod (read-only, `withProdReadOnlyRoleProbe` som 00192): admin ser, montør ser ikke.
6. Næste morgen: klokken viser de ~3 driftsadvarsler; næste kunde-fuldmagt vises.

## Rollback
`DROP TABLE public.system_alerts;` (intet afhænger af tabellen; appen tåler at den mangler — før-tilstanden).

## Kørselslog prod (2026-10-07)
| Trin | Resultat |
|---|---|
| pre-check (`prod-verify-00194.ts pre`) | 3/3 |
| `prod:apply-migration -- 00194 --approved-by-henrik` | COMMIT gennemført |
| post-check (`prod-verify-00194.ts post`) | 11/11 (tabel, RLS, 2 policies, ingen INSERT/DELETE for brugere, kun statuskolonner, 0 rækker) |
| flow-tjek som rigtige prod-brugere, ÉN transaktion rullet tilbage (`prod-flow-check-00194.ts`) | 16/16 — portal-hændelse → advarsel; admin ser, montør ser ikke; ingen kan oprette/slette/ændre titel; montør kan ikke markere læst; admin markerer læst + afviser; afvist forsvinder; dubletsikring finder åben (ikke afvist); intet efterladt |
| db-audit | HØJ/MIDDEL/LAV = 0 |
| app (main 3ad24cf) | deployet (Vercel success) — klokke/cron-kode med dubletsikring er live |
Forventet næste nat (03:00): ~3 driftsadvarsler (AO-sync, LM-sync, forældede priser); følgende nætter ingen kopier.
