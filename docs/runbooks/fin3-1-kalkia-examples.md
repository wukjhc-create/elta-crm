# FIN3-1 — Kalkia-prisforrang: eksempler (IKKE aktiveret)

Henrik 2026-10-20: "DO NOT ACTIVATE pricing-policy changes yet … prepare 5–10 concrete examples". Koden er klar
(`supplierLinePricingBatch` med Kalkias egen standard som "varens avance"), men Kalkia bruger fortsat sin nuværende regel.

## Prod i dag (read-only, `npx tsx scripts/prod-kalkia-pricing-diff.ts`, 2026-10-20)

- Kalkia-materialer koblet til leverandørvarer: **0**
- Aktive avanceregler (`supplier_margin_rules`): **0**
- Aktive kundeaftaler (`customer_supplier_prices`): **0**

→ En aktivering ville i dag **ikke ændre én eneste pris** i prod. Forskellen opstår først, når der oprettes avanceregler
og/eller kundeaftaler og Kalkia-materialer kobles til leverandørvarer. Scriptet kan køres igen, når data findes, og viser
så de reelle 10 største ændringer.

## Forrang

| | Nuværende Kalkia | Foreslået (= tilbudslinjer + sagsmaterialer i dag) |
|---|---|---|
| 1 | kundeaftalens avance | produkt- eller kunderegel |
| 2 | varens avance | kundeaftalens avance |
| 3 | leverandørens standardavance | generel regel (underkategori → kategori → leverandør) |
| 4 | 25 % (materialestandard) | varens avance → leverandørens standard → 25 % |

Avance = tillæg på kost; DB % = (salg − kost) / salg. Kost er efter kundens rabat.

## Eksempler (beregnet med appens `calculateSalePrice`; realistiske priser, ikke kundedata)

| # | Vare / situation | Kost (eff.) | Nu: salg (DB) | Foreslået: salg (DB) | Ændring | Hvad slår igennem |
|---|---|---|---|---|---|---|
| 1 | Kabel 3G1,5 (100 m), varens avance 30 %, leverandørregel 20 % | 640 kr | 832 kr (23.08 %) | 768 kr (16.67 %) | -64 kr | supplier-regel 20 % (i dag: 30 %) |
| 2 | Stikkontakt, ingen varens avance, kategoriregel "Installation" 40 % | 38,5 kr | 48,13 kr (20.01 %) | 53,9 kr (28.57 %) | +5,77 kr | category-regel 40 % (i dag: 25 %) |
| 3 | Inverter 10 kW, kundeaftale 15 % + 8 % rabat, kategoriregel 40 % | 13.064 kr | 15.023,6 kr (13.04 %) | 15.023,6 kr (13.04 %) | 0 kr | kundeaftale 15 % (i dag: 15 %) |
| 4 | Solpanel 430 W, kundeaftale 15 %, produktregel 22 % | 1.180 kr | 1.357 kr (13.04 %) | 1.439,6 kr (18.03 %) | +82,6 kr | product-regel 22 % (i dag: 15 %) |
| 5 | Montageskinne, kundeaftale 22 %, kunderegel 18 % | 199,5 kr | 243,39 kr (18.03 %) | 235,41 kr (15.25 %) | -7,98 kr | customer-regel 18 % (i dag: 22 %) |
| 6 | Tavlekomponent, underkategoriregel 35 % + 5 kr, afrund til 5 | 87,4 kr | 109,25 kr (20 %) | 125 kr (30.08 %) | +15,75 kr | subcategory-regel 35 % + 5 kr, afrund 5 (i dag: 25 %) |
| 7 | Batteri 10 kWh, aftale 10 % rabat uden avance, kategoriregel 30 %, varens 25 % | 34.200 kr | 42.750 kr (20 %) | 44.460 kr (23.08 %) | +1.710 kr | category-regel 30 % (i dag: 25 %) |
| 8 | Kabelbakke, ingen regler (kontrol) | 145 kr | 185,6 kr (21.87 %) | 185,6 kr (21.87 %) | 0 kr | varens/standard (som i dag) (i dag: 28 %) |

## Læsning

- **Sænker prisen** når en generel/kunde-regel er lavere end varens avance eller aftalen (1, 5).
- **Hæver prisen** når en regel er højere end varens avance/standard (2, 6, 7) eller en produktregel går foran en lavere
  kundeaftale (4).
- **Uændret** når kundeaftalen allerede vinder over en generel regel (3), og når der ingen regler er (8).
- Tilbudslinjer og sagsmaterialer bruger allerede den foreslåede forrang (FIN3-1, commit 994658fd / de7797c0), så i dag kan
  samme vare få en anden pris i en Kalkia-kalkulation end på et tilbud, **så snart** der findes regler.

## Beslutning der mangler

Aktivér den fælles forrang i Kalkia (ja/nej). Aktivering = én kodeændring i `loadSupplierPricesForVariant`
(`src/lib/actions/kalkia-supplier-prices.ts`); ingen migration.
