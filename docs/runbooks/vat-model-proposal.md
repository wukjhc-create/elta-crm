# Momsmodel — forslag (PR-10, Henrik 2026-10-15) — IKKE GODKENDT

## Nu (i prod, code-only, commit efter 7c775e9e)
- Sagsfakturaer (kladde fra sag, forskud/rate, slutfaktura, faktura fra arbejdsordre) bruger altid 25 %.
- **Midlertidigt værn:** har sagens tilbud en anden momssats end 25 % (fx 0 %), blokeres al automatisk fakturering
  med en dansk besked (`lib/invoices/vat-guard.ts`). Kalderens `vat_rate` ignoreres (før kunne et direkte kald sætte 0 %).
- Prod 2026-10-15 (`scripts/prod-vat-distribution.ts`): 15/15 tilbud og 5/5 fakturaer er 25 % → værnet rammer intet i dag.

## Forslag til datamodel (kræver migration → BLOCKED_APPROVAL)
**00231 — momsmode på kunde, tilbud og faktura**
```sql
-- én eksplicit værdi, ingen gæt: 'standard' (25 %), 'zero' (0 %, fx eksport/fritaget), 'reverse_charge' (omvendt betalingspligt, 0 % + påtegning)
ALTER TABLE public.customers ADD COLUMN vat_mode text NOT NULL DEFAULT 'standard'
  CHECK (vat_mode IN ('standard','zero','reverse_charge'));
ALTER TABLE public.customers ADD COLUMN vat_number text;            -- CVR/EU-momsnr. (påkrævet ved reverse_charge)
ALTER TABLE public.offers ADD COLUMN vat_mode text CHECK (vat_mode IS NULL OR vat_mode IN ('standard','zero','reverse_charge'));
ALTER TABLE public.invoices ADD COLUMN vat_mode text NOT NULL DEFAULT 'standard'
  CHECK (vat_mode IN ('standard','zero','reverse_charge'));
ALTER TABLE public.invoices ADD COLUMN vat_rate numeric(5,2) NOT NULL DEFAULT 25
  CHECK ((vat_mode = 'standard' AND vat_rate = 25) OR (vat_mode IN ('zero','reverse_charge') AND vat_rate = 0));
```
- Data: eksisterende rækker får `standard`/25 (= det de er i dag); ingen beløb ændres.
- RLS: nye kolonner på eksisterende tabeller → eksisterende politikker gælder; `vat_number` er ikke kost.

## Regler (kode efter godkendelse)
1. Tilbud arver kundens `vat_mode` ved oprettelse; kan ændres på tilbuddet (salg/admin) — vises tydeligt.
2. Sag arver tilbuddets mode; ALLE sagsfakturaer bruger sagens mode. Blandet mode på samme sag = blokér.
3. `reverse_charge` kræver `customers.vat_number` — ellers blokér med besked.
4. Faktura-PDF/mail: ved `reverse_charge` påtegning "Omvendt betalingspligt — køber afregner momsen" + købers momsnr.;
   ved `zero` "Momsfritaget" (tekst afklares med revisor).
5. Kreditnota arver originalens mode/sats.
6. e-conomic (når aktiveret): mode → momszone (kræver mapping i opsætningen — ingen standard).
7. Værnet ovenfor fjernes først, når 1–6 er bygget og testet.

## UI
- Kunde: felt "Moms" (25 % / 0 % / Omvendt betalingspligt) + momsnr.
- Tilbud: badge ved total ("Omvendt betalingspligt — 0 % moms").
- Fakturakladde/slutfaktura: momslinje viser mode; blokeringsbesked hvis data mangler.

## Til Henrik
- Godkend 00231 (migration) — eller ret mode-listen.
- Påtegningstekster: revisor/bogholder bør godkende ordlyden.
