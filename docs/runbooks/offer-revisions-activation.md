# Aktivering af tilbudsrevisioner (00203 Trin B)

Status 2026-10-08: **00203 kørt i prod (Trin A), flag `OFFER_REVISIONS_ENABLED` er OFF.** Aktiveres først efter
Henriks go og en sidste smoke-test (ingen blind aktivering).

## Trin A — gennemført 2026-10-08
| Tjek | Resultat |
|---|---|
| `scripts/prod-verify-00203.ts pre` | 2/2 (kolonner/tabel fandtes ikke; tjeksum af 15 tilbud + 3 underskrifter gemt) |
| `npm run prod:apply-migration -- 00203 --approved-by-henrik` | COMMIT |
| `scripts/prod-verify-00203.ts post` | 9/9 — 5 kolonner, offer_snapshots, RLS, kun SELECT-politik, authenticated kun SELECT/anon intet, **15/15 tilbud uændrede (tjeksum)**, **3/3 underskrifter intakte (tjeksum)**, ingen snapshot_id endnu |
| `scripts/prod-role-check-00203.ts` (rigtige prod-brugere) | 6/6 — admin læser, montør 0 rækker, INGEN rolle kan skrive snapshots, tilbud læses som før |
| Portal/tilbud-regression med flag OFF på 00203-skema (staging) | U10/U22/U23/U25/U41/U7/U8/U118/U125/U146 PASS (`UI_OFFER_REVISIONS_ENABLED=false`) |

## Trin B — klar, IKKE aktiveret
Sidste smoke-test mod prod-skemaet (rulles altid tilbage): `npx tsx scripts/prod-smoke-00203.ts` → 7/7
(snapshot, unik revision, kæde, afløsning, portal-filter, underskrift→snapshot, eksisterende tilbud upåvirket).
Funktionelt testet på staging med flag ON: `cli.ts offer-revisions-check` 18/18, UI U147.

### Aktivering (når Henrik siger go)
1. Kør smoke-testen igen umiddelbart før: `npx tsx scripts/prod-smoke-00203.ts` (skal være 7/7).
2. Vercel → Project → Settings → Environment Variables → **Production**: `OFFER_REVISIONS_ENABLED` = `true`.
3. Redeploy seneste production-deployment (env læses ved build/runtime).
4. Efter-tjek (read-only):
   - Åbn et SENDT tilbud i CRM → panelet "Revisioner" vises med knappen "Ny revision".
   - Næste rigtige afsendelse af et tilbud → `offer_snapshots` får én række (tjek med `prod-verify-00203`-lignende
     optælling) og aktiviteten "Revision 1 sendt".
   - Portal: kunden ser stadig sine tilbud (afløste revisioner skjules først når en ny revision er SENDT).

### Tilbagerulning
Sæt `OFFER_REVISIONS_ENABLED` = `false` (eller slet variablen) + redeploy → koden er no-op igen; skema og evt.
snapshots bliver liggende (påvirker intet med flag OFF). Skema-rollback står i migrationens header (kun hvis nødvendigt).
