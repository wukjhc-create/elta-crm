# Runbook — prod-migration 00159 `offers.source_case_id`

**Status:** ✅ KØRT I PRODUCTION 2026-09-27 (godkendt af Henrik) · verificeret med `prod:verify-00159`; kode merget efterfølgende.

## Hvad og hvorfor
Additiv, nullable FK `offers.source_case_id → service_cases(id) ON DELETE SET NULL` + opslags-index + partial
UNIQUE `uq_offers_open_proposal_per_source_case` (højst ét *åbent tilbudsforslag* pr. sag). Giver Agent Core's
`offer.propose_draft_from_case` en DB-garanteret dedup-nøgle i stedet for en markør i `notes`.
Almindelige tilbud (`is_proposal = false`) må fortsat være flere pr. sag. Ingen eksisterende kode læser eller
skriver kolonnen — migrationen ændrer ikke app-adfærd.

Fil: [`supabase/migrations/00159_offers_source_case_id.sql`](../../supabase/migrations/00159_offers_source_case_id.sql)

## Risiko
| | |
|---|---|
| Lås | `ALTER TABLE ADD COLUMN` (nullable, uden default) er kun en kort metadata-lås; indexes på 15 rækker er øjeblikkelige |
| Data | Ingen eksisterende rækker ændres, undtagen deterministisk backfill fra udførte agent-actions — **prod: 0 kandidater** (verificeret read-only) |
| Bagudkompatibel | Ja. Nuværende `main`-kode er upåvirket |
| Rollback | Ren DROP (se nedenfor), ingen datatab ud over selve koblingen |

## Forudsætninger (verificeret 2026-09-27, read-only)
```
npm run prod:verify-00159
→ tilbud: 15 (heraf forslag 0) · status: IKKE ANVENDT · backfill-kandidater: 0
```

## Udførelse (efter godkendelse)
1. **Pre-check:** `npm run prod:verify-00159` → skal vise `IKKE ANVENDT`.
2. **Anvend:** Supabase Dashboard → prod-projektet → SQL Editor → indsæt hele `00159_offers_source_case_id.sql` → Run.
   (Filen er én transaktion; fejler ét trin, rulles alt tilbage.)
3. **Post-check:** `npm run prod:verify-00159` → skal vise `✅ anvendt og konsistent`, FK med `ON DELETE SET NULL`,
   begge indexes, `koblede tilbud: 0`.
4. **Merge koden:** `feat/offers-source-case-id` (lokal branch, commit `cc95e8b`) merges til `main` og pushes
   → Vercel deployer. Koden må **ikke** nå production før trin 3 er grønt.
5. **Smoke i prod (admin):** åbn en bekræftet sag → "Foreslå tilbud (agent)" → forslag i Agent Inbox.
   Agenten er disabled, så intet tilbud oprettes (forventet: udførelse afvises). Afvis forslaget igen.

## Rollback
```sql
BEGIN;
DROP INDEX IF EXISTS public.uq_offers_open_proposal_per_source_case;
DROP INDEX IF EXISTS public.idx_offers_source_case_id;
ALTER TABLE public.offers DROP COLUMN IF EXISTS source_case_id;
NOTIFY pgrst, 'reload schema';
COMMIT;
```
Hvis koden fra trin 4 er deployet: revert merge-commit'en på `main` **før** rollback-SQL'en.
