# Eksplicit afregningsform (billing model) — forslag 00232 — BLOCKED_APPROVAL

Henrik 2026-10-15: "contract_sum exists ⇒ fixed_price" må ikke være den langsigtede model — alle sager fra tilbud får en
kontraktsum, så regningsarbejde kan klassificeres forkert. Ingen gæt.

## Prod-scan (read-only, `scripts/prod-billing-model-scan.ts`, 2026-10-15)
| Klasse | Sager | Note |
|---|---|---|
| Sikker regning (T&M) — ingen kontraktsum/revideret beløb | 4 | ikke fra tilbud |
| Tvetydig — kontraktsum + del-faktura på linjer | 2 | fra tilbud, 1 med timer |
| Tvetydig — kontraktsum, intet faktureret endnu | 2 | fra tilbud |
| Sikker fast pris (forskud/rate af kontraktsum eller revideret beløb) | 0 | — |

## Model
`service_cases.billing_model` og `offers.billing_model`: `fixed_price` | `time_and_materials` | NULL (ikke valgt). Senere evt. `mixed`.
- **fixed_price:** slutfaktura = kontraktsum/revideret beløb − tidligere faktureret (netto efter kreditnotaer) = restbeløb (PR-6-reglen).
- **time_and_materials:** slutfaktura = godkendte fakturerbare timer + fakturerbare materialer + fakturerbare øvrige omkostninger − forskud/rater.
- **NULL:** slutfaktura blokeres med "Vælg afregningsform for sagen" — ingen gæt.
- Tilbud → sag: sagen arver tilbuddets billing_model; er den ikke sat, forbliver sagen NULL (vælges på sagen).
- Skift af afregningsform: kun admin/serviceleder (invoices.create), audit-logges; blokeret når slutfaktura findes.

## Migration 00232 (forslag)
```sql
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS billing_model text
  CHECK (billing_model IS NULL OR billing_model IN ('fixed_price','time_and_materials'));
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS billing_model text
  CHECK (billing_model IS NULL OR billing_model IN ('fixed_price','time_and_materials'));
-- KUN sikre sager klassificeres: ingen kontraktsum og intet revideret beløb → regning
UPDATE public.service_cases SET billing_model = 'time_and_materials'
 WHERE billing_model IS NULL AND contract_sum IS NULL AND revised_sum IS NULL;
-- alle andre (tvetydige) forbliver NULL og vælges manuelt
```
| | 00232 |
|---|---|
| **Schema** | 2 valgfrie kolonner (sager, tilbud) med CHECK |
| **Data changes** | Kun de 4 sikre sager (ingen kontraktsum) sættes til `time_and_materials`; 4 tvetydige forbliver NULL |
| **Business behavior** | Slutfaktura følger sagens valgte afregningsform; uden valg blokeres slutfakturaen med besked. Erstatter "kontraktsum ⇒ fast pris" |
| **Risiko** | Lav-middel: sager uden valg kan ikke slutfaktureres før nogen vælger (bevidst — ingen gæt) |
| **Staging-tests** | billing-model-check (NULL blokerer, fast pris = restbeløb, regning = linjer, skift audit-logges og blokeres efter slutfaktura, tilbud→sag arver) + UI |
| **Rollback** | `ALTER TABLE service_cases DROP COLUMN billing_model; ALTER TABLE offers DROP COLUMN billing_model;` + kode tilbage til PR-6-reglen |
| **Kode** | Klar på branch `billing-model-00232` (deployes først sammen med migrationen) |

## Indtil godkendelse (prod i dag)
PR-6-reglen gælder: kontraktsum ⇒ restbeløb. De 4 tvetydige sager bør ikke slutfaktureres før afregningsformen er afklaret.
