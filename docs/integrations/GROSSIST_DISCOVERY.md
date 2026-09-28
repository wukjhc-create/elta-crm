# Grossist / KlarPris — discovery (P3 #17)

**Status (2026-09-28):** discovery færdig. Sikkerhedsfund P-005 er rettet i kode, og 00164/00165 er på staging (prod-gate). **Ingen grossist-ordre, ingen live-kald ændret.**
Kilder: kodegennemgang af pris-/leverandørdomænet og read-only måling i prod (kun antal). KlarPris' offentlige beskrivelse: [klarpris.dk — prissammenligning](https://klarpris.dk/funktioner/indkob-og-prissammenligning/), [Installatør: prissammenligning + fakturakontrol](https://www.installator.dk/med-klarpris%c2%92-prissammenligning-og-fakturakontrol-k%c3%b8rer-hele-indk%c3%b8bsprocessen-effektivt-og-nemt).

## 1. Benchmark: hvad KlarPris gør
- Sammenligner pris på samme vare hos 8 grossister (AO, Brdr. Dahl, Solar, Lemvigh-Müller, P. Hatten, Neotherm, Jens A., Sanistål). Den genkender varenummeret i grossistens webshop.
- **Indregner installatørens egne aftaler** (rabatfiler, årsbonus, online-rabat) i sammenligningen.
- Viser **alternative varer**.
- **Fakturakontrol:** tjekker, om fakturaen svarer til aftalen (→ vores P3 #19).

## 2. Tilstand i ELTA CRM (prod, read-only 2026-09-28)
| Grossist | Produkter | Med EAN | Kost-/listepris | Lager | Seneste sync |
|---|---|---|---|---|---|
| Lemvigh-Müller (LM) | 322.517 | 100 % | 100 % / 100 % | 0 | i går (ugentlig SFTP) |
| AO | 1.343 | 97 % | 100 % / 100 % | 0 | **2026-02-28** (7 mdr. gammel) |

- **564 EAN findes hos begge grossister.** Det er det eneste grundlag for sammenligning på tværs.
- `price_history`: **0 rækker**, fordi FTP-prisændringer aldrig er registreret (se F2). `import_batches`: 0.
- Kundeaftaler (`customer_supplier_prices`, `customer_product_prices`) og `supplier_margin_rules`: **0**.
- Ingen andre grossister er kodet. Ingen ordreafgivelse findes (bekræftet).

## 3. Arkitektur i dag (kortlagt)
- **Import:** CSV-wizard (legacy `ImportEngine` + `AOImporter`/`LMImporter`), SFTP (`lemu-sync` cron, adapter + sync-engine), admin-FTP-endpoint og AO-"API", som i praksis er login på ao.dk-webshoppen. LM har ingen API-klient.
- **Prismodel:** `supplier_products.cost_price` behandles som nettopris. Der er ingen rabat-kolonne; `Rabatpct` fra LM-filen gemmes ikke.
- **Tre forskellige marginalgoritmer:**
  - `get_customer_product_price` ignorerer marginreglerne,
  - `get_best_price_for_customer` bruger en anden prioritet,
  - `get_effective_margin`/`calculate_sale_price` bruger regelhierarkiet.
  - `price-engine.ts` har desuden sin egen TypeScript-model. **→ P3 #18 Profit Engine samler dem.**
- **Sammenligning:** der er ingen kanonisk produktnøgle. `get_best_price_for_customer` matcher på `supplier_sku`, som er forskellig hos AO og LM, så den sammenligner aldrig på tværs. Kun `optimizeOfferPrices` bruger EAN.
- **Lager:** `stock_quantity` findes, men skrives aldrig. UI'et viser "På lager", når værdien er ukendt.

## 4. Fund
| # | Fund | Alvor | Status |
|---|---|---|---|
| **P-005** | 50 server-actions i pris-/leverandørdomænet skrev **uden rettighedstjek**, herunder `executeImport` (kan overskrive kostpriser), margin- og kundeprisaftaler og sync-jobs. `materials.ts` brugte service-role **helt uden login-tjek**. DB: enhver indlogget kunne skrive `supplier_settings` (standardmargin), og jsonb-credentials-kolonnerne var læsbare, men tomme i prod. Ikke anonymt: proxy + RLS. | S3 (insider/integritet) | **Rettet i kode:** gates (`settings.suppliers` for leverandør- og prisopsætning; `tools.pricing` for kundeaftaler og kundetrin; `materials.edit` for materialer, produktkatalog og Kalkia-links; `tools.calculations` for prisopdatering i en kalkulation). **DB: 00164** på staging (prod-gate). |
| F2 | `price_history`-CHECK afviser `ftp_sync`/`ftp_manual`, så **prisændringer fra den ugentlige LM-import registreres aldrig** | data | **00165** på staging (prod-gate) |
| F3 | AO-data er 7 måneder gamle; AO-"API" er webshop-scraping (skrøbelig). Supplier-sync-cron er en stille no-op (P-003). | drift | beslutning |
| F4 | `supplier-best-price.ts` og `material-catalog.ts` kalder `get_best_price_for_customer` med forkert parameter. Kaldet fejler altid, og kundepriser anvendes aldrig i auto-tilbud. Ingen effekt i dag (0 aftaler). | fejl | → #18 |
| F5 | `compareProductPrices` vælger kolonner, der ikke findes (`name`, `is_active`) | fejl | → #18 |
| F6 | CSV-wizarden læser filen som UTF-8 i browseren, så AO's ISO-8859-1-filer mister æøå, før serveren ser dem | fejl | backlog |
| F7 | 4 næsten ens FTP-upsert-løkker, 2 import-implementeringer, død kode (`supplier-fallback.ts`), ingen filhash/idempotens og ingen tests af import | vedligehold | backlog |

## 5. Anbefalet målbillede (trin; hvert trin er en gate)
1. **Datakvalitet først:** kør 00165 (prishistorik), gør AO-importen aktuel (kræver beslutning om AO-adgang), og gem rabat% fra LM-filen.
2. **Kanonisk produktnøgle:** EAN som primær nøgle for sammenligning (LM 100 %, AO 97 %), med fallback til manuel kobling. Det kræver migration (indeks på `ean`).
3. **Aftalemodel som KlarPris:** rabatfiler pr. grossist, bonus og online-rabat → nettopris pr. installatør. Det er **P3 #18 Profit Engine** (én prismotor i stedet for fire).
4. **Sammenligning i tilbud og kalkulation:** billigste nettopris pr. EAN på tværs af grossister, inkl. alternativer.
5. **Lager:** kun hvis en grossist leverer det via API. I dag leverer ingen det.
6. **Ordre (push_external):** udelukket indtil der er en eksplicit beslutning. Det vil gå gennem Agent Core-approval + live-gate.
