# Runbook: faktura-vedhæftninger (IC11–IC13) — flag + backfill

**Status (2026-09-29):**
- Koden er deployet med flaget OFF.
- Henrik har godkendt, at flaget slås TIL i prod og at backfill køres.
- **Flaget skal sættes i Vercel.** Hverken Claude eller repoet har Vercel-adgang.

## Hvad ændrer sig
| | Før | Med `INVOICE_ATTACHMENT_FETCH_ENABLED=true` |
|---|---|---|
| Nye faktura-mails med vedhæftning | Parses fra mailtekst | PDF hentes via Graph (kun læsning) → privat bucket `attachments` → PDF-tekst parses. Fallback til mailtekst ved fejl |
| Ældre brødtekst-fakturaer (42 i prod) | Uændret | Faktura-cron'en (hver time) opgraderer op til 8 pr. kørsel: **samme række**, ingen ny faktura |
| Kundedokumenter/portal | — | **Aldrig**: faktura-stien arkiverer ikke i `customer_documents` |
| Mail / e-conomic | — | Ingen. Fakturaer ender altid i `awaiting_approval` |

Rettelser, der gælder uanset flaget:
- **IC12:** PDF-tekst med pdf-parse v2. v1-kaldet fejlede altid, så **ingen PDF er nogensinde blevet læst**.
- **IC13:** kundens egne mails (afsender = den koblede kundes e-mail) bliver ikke til leverandørfakturaer.

## Sikkerhed og idempotens
- En opgradering kræver uændret status, og at rækken stadig er brødtekst-fakturaen. Låste statusser røres aldrig (`approved`/`posted`/`rejected`/`cancelled`).
- Hash-dedup på PDF-teksten. Storage-upload er upsert på en fast sti (`email-attachments/<mail>/<fil>`).
- Hver mail får ét `attachment_backfill`-audit-spor og behandles ikke igen. En hentefejl prøves højst 3 gange.
- Fejl på én mail stopper ikke batchen. Forrige header-værdier gemmes i audit-loggen (`upgraded_from_attachment`).
- Ekstra PDF'er uden fakturanummer (betingelser/følgesedler) bliver ikke til fakturaer.

## Udførelse
1. **Baseline** (read-only, er taget 2026-09-29 — tal nedenfor): `npx tsx scripts/prod-invoice-attachment-baseline.ts` + `npx tsx scripts/prod-invoice-coverage.ts`.
2. **Henrik:** Vercel → elta-crm → Settings → Environment Variables → `INVOICE_ATTACHMENT_FETCH_ENABLED` = `true` (Production) → **Redeploy** (env læses ved deploy).
3. Faktura-cron'en kører hver time. 42 kandidater / 8 pr. kørsel ≈ 6 timer. Status i cron-svaret: `backfill.byOutcome`.
4. **Efter-måling:** samme to scripts + `npm run prod:pilot-health` + `npx tsx scripts/prod-safety-confirm.ts 26`. Forvent:
   - `mime_type=application/pdf` > 0,
   - færre `needs_review`/`failed`,
   - 0 nye `customer_documents` fra faktura-mails,
   - 0 posted/e-conomic.

## Rollback
- Sæt flaget til `false` og redeploy. Backfill og hentning stopper straks (no-op).
- Opgraderede rækker kan gendannes fra `previous_value` i `upgraded_from_attachment`-audit, men det er normalt ikke nødvendigt, fordi PDF'en er den autoritative kilde.

## Baseline prod (2026-09-29, read-only)
- Faktura-mails: 50, heraf 43 med vedhæftning og 1 med links. 42 mangler links, og 0 mangler graph-id.
- Fakturaer:
  - email/awaiting_approval: needs_review 44 og failed 6,
  - manual: approved 2 og rejected 1,
  - mime: text/plain 50 og ukendt 3.
- Linjer: 9 på 3 fakturaer, 0 produkt-matchet. Dækning 0 %.
- Finance: 0 posted, 2 approved, 0 med eksternt id.
- Storage: `attachments` er privat med 152 objekter, heraf 122 mail-vedhæftninger.
- Kunde-kobling: 23 af 50 faktura-mails er koblet til en kunde. Af dem er 20 sendt af kunden selv (IC13).
  - Kun 2 kundedokumenter stammer fra faktura-mails, begge interne testdata (afsender eltasolar.dk = kunden).
