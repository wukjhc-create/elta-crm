# Beslutninger fra kode-reviews 2026-10-04/05 (samlet)

Fem uafhængige reviews (sikkerhed/portal, faktura, montør/tid, tilbud/salg, kundekommunikation, leverandør/e-conomic).
Alt der KUN var en fejl eller et læk, er rettet og pushet (Q10–Q15 i `docs/AUTONOMOUS_BACKLOG.md`). Herunder det, der
kræver dit ja/nej — fordi det er en migration (prod-gate), ændrer forretningsadfærd eller starter live-udsendelse.
Prod-tal er read-only optællinger; ingen af punkterne har ramt kunder i et omfang vi kan se.

## 1. Klar til merge (branches, testet på staging hvor muligt)

| Branch | Hvad | Kræver |
|---|---|---|
| `invoice-review-b` | B1 udestående efter kreditnotaer/delbetaling (status, rykkere, rykkerbeløb, dashboards); B2 betaling kun på sendte fakturaer (bankmatch rammer ikke kladder); B5 annullering ekskl. moms | merge (ingen migration) |
| `offer-invoice-amounts` | 00190: faktura fra tilbud = det accepterede beløb (rabatter, manuelle linjer der i dag bliver 0 kr) | migration |
| `time-logs-invoice-lock` | 00189: fakturerede timer kan ikke ændres/slettes via API (dobbeltfakturering) | migration |

## 2. RLS — data læsbar via direkte API for roller, der ikke må se den (S1 latent)

App'en skjuler felterne, men databasen gør ikke. Forslag: ét samlet migrationssæt med kolonne-/rækkebegrænsning.

| # | Tabel | Hvem ser hvad | Prod i dag |
|---|---|---|---|
| T1 | `offer_line_items` | salg/montør: kostpris, avance | 1 montør, 0 salg |
| L1 | `supplier_products` | alle: kostpris på ~324k varer | — |
| M1 | `time_logs` | montør: kollegers kostsats; salg: kost på egne sager | 0 synlige rækker |
| K3 | `customer_documents`, `email_messages/threads` | montør: alle kunders mail-vedhæftninger og tilbudsmails | — |

## 3. Forretningsvalg

| # | Spørgsmål | Anbefaling |
|---|---|---|
| T5 | Må sendte/accepterede tilbud redigeres (linjer, rabat, pakker)? I dag ja — kunden kan acceptere noget andet end det, der vises bagefter | Kun kladder; ellers "kopiér til nyt tilbud" |
| T4 | Ændret rabat/moms på tilbuddet genberegner ikke totalerne | Genberegn ved ændring (DB-trigger) |
| T6 | Accepteret → kladde efterlader underskrift (ny accept fejler) | Spær overgangen |
| T7 | Sagens kontraktsum er inkl. moms, men sammenlignes med fakturering ekskl. moms | Brug ekskl. moms (+ ret eksisterende sager) |
| B3 | Kladde-kreditnota tæller i slutfakturaens fradrag | Spær sletning af kreditnota-kladde når en slutfaktura bygger på den |
| B4/B6 | Kreditering pr. linje (fortegn) / redigering af kreditnota-kladder | Ret fortegn; ingen redigering af kreditnota-kladder |
| F1 | Montør vælger selv satstype (Overtid/Helligdag), og ikke-godkendte timer faktureres | Kun godkendte timer på fakturakladder |
| F2 | Ingen loft/overlap ved timeregistrering | Maks. 24 t + overlap-advarsel |
| K1 | Tilbudsrykker-cronen sender i dag ALDRIG (fejl i opslag) — at rette den starter live kundemails | Beslut om rykkere skal ud |
| K2 | Besigtigelses-påmindelse går også til medarbejder-bookede besøg ("vi mangler din bekræftelse") | Kun portal-bookinger der afventer |
| L3 | Kundeaftaler (rabat/margin) anvendes aldrig i pakker/salgsmotor (forkert funktionskald); prod har 0 aftaler | Ret, før første aftale oprettes |
| L4 | e-conomic bogfører alle linjer med standardmoms | Bloker fakturaer med anden sats end 25 % |
| — | Automatikreglen "Auto-faktura ved arbejdsordre færdig" udløses aldrig (kun fra død kode, nu fjernet) | Bevidst? |
| — | 5 besigtigelsesopgaver mistede deres beskrivelse (marts) — originalteksten kan ikke genskabes | Info |

## 4. Migrations-detaljer (til samlet batch)

M2/M3/M4 (time_logs/arbejdsordre-triggere, sats-tjek), L2 (`get_customer_product_price` bruger `IF rec IS NOT NULL`),
T2/B7 (00190). Alle med vist SQL før kørsel, staging først, pre/post-tjek som 00185.
