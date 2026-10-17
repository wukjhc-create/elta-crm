# DF-1 — Auto-faktura ved tilbud accepteret: værn mod dobbeltfakturering (FORSLAG, BLOCKED_APPROVAL)

Dataflow-review 2026-10-17.

## Problem
Portal-accept (`src/lib/actions/portal.ts`) opretter først sagen (`convertOfferToCase`). Derefter kører regel-motoren
`offer_accepted`. Reglen "Auto-faktura ved tilbud accepteret" (`create_invoice_from_offer`,
`src/lib/automation/actions/create-invoice-from-offer.ts`) kalder `createAndSendInvoiceFromOffer`.

Den faktura får intet `case_id`. Sagen ved derfor ikke, at beløbet er faktureret. Rate- og slutfaktura på sagen kan
fakturere det samme beløb en gang til, og kunden får to fakturaer.

## Prod-status (read-only, `npx tsx scripts/prod-auto-invoice-rule.ts`, 2026-10-17)
- Reglen er **aktiv**, men står i **`dry_run=true`**.
- Den er kørt 2 gange, begge som dry-run. Seneste kørsel: 2026-06-23.
- Der findes 0 fakturaer uden sag, der er lavet fra tilbud. Dermed også 0 dobbeltfakturaer.
- **Ingen eksponering i dag.** Risikoen opstår først, hvis nogen slår dry-run fra.

## Forslag (kode, ingen migration)
Aktionen tjekker først, om tilbuddet har en sag (`service_cases.source_offer_id = offerId`). Det sker før dry-run-tjekket, så
dry-run viser det rigtige udfald.

- Findes sagen, springer reglen over med beskeden "faktureres via sagen".
- Findes der ingen sag, fx fordi sagsoprettelsen fejlede, opfører reglen sig som i dag.

```ts
const caseNumber = await caseForOffer(offerId) // admin-klient, select case_number where source_offer_id = offerId
if (caseNumber) return { ok: true, message: `skipped: tilbuddet har sag ${caseNumber} — faktureres via sagen`, data: { offerId, skipped: 'has_case', caseNumber } }
```

Ændringen blev afvist af det automatiske værn, fordi den ændrer live-faktureringsautomatik. Den kræver derfor Henriks
godkendelse.

## Beslutning (Henrik)
1. Godkend værnet ovenfor. Anbefalet: det ændrer intet i dag, fordi reglen er i dry-run, og det fjerner risikoen.
2. Alternativt: deaktivér reglen (`active=false`). Det er en prod-skrivning og kræver særskilt godkendelse.
3. Uanset valget: slå **ikke** `dry_run` fra, før punkt 1 eller 2 er afgjort.

## Test (når godkendt)
- Staging: tilbud med sag og regel i dry-run → udfaldet er `skipped has_case`.
- Tilbud uden sag → udfaldet er `dry_run` som i dag.
