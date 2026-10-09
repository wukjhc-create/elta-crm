# Profit Engine — datamodel og design (P3 #18)

**Status (2026-09-28):** ren prismotor bygget og testet (`src/lib/profit/engine.ts`, `scripts/profit-engine-test.ts`). To fejl fundet og rettet i den eksisterende kode. **Datamodellen er et forslag (SQL nedenfor) og er IKKE anvendt.**

## 1. Nuværende tilstand: fire prisalgoritmer
| Algoritme | Hvor | Rabat | Margin/avance |
|---|---|---|---|
| `calculateSalePrice` / `computeOfferDB` | `src/lib/logic/pricing.ts` (tilbud, kalkulation, UI) | kunderabat **trækkes fra kost** | avance fra calculation_settings |
| `calculatePrice` | `src/lib/services/price-engine.ts` | kundetrin + mængde + aftale, **alle trukket fra kost** | avance |
| `get_customer_product_price` / `get_best_price_for_customer` | DB-funktioner (00043) | kunderabat trukket fra kost | leverandørens default, **ignorerer marginregler**, to forskellige prioriteter |
| `get_effective_margin` / `calculate_sale_price` | DB-funktioner (00044) | – | marginregel-hierarki (produkt > kunde > underkategori > kategori > leverandør) + fast tillæg + afrunding |

Ordet "margin" bruges i koden om både **avance** (på kost) og **DB%** (på salg). Tærsklerne (grøn/gul/rød) er DB%, mens `margin_*`-indstillingerne er avance. Der er ingen eksplicit konvertering.

## 2. Fund
| # | Fund | Effekt | Status |
|---|---|---|---|
| E1 | **Kunderabat trækkes fra kostprisen** før avance (3 af 4 algoritmer). Salgsprisen bliver den samme, men **DB rapporteres for højt**. Eksempel: kost 100, avance 25 %, kunderabat 10 %: salg 112,50, rapporteret DB 20 %, **reel DB 11,1 %**. | latent: 0 kundeaftaler i prod | Profit Engine adskiller indkøb og salg. Algoritmerne udskiftes i trin 2. |
| E2 | **Send-gaten brugte DB før tilbudsrabat.** `computeOfferDB` summerede linjetotaler uden tilbuddets `discount_percentage`, så et tilbud med fx 30 % rabat kunne sendes med **negativ** reel DB (testet: 20 % → −14 %). | latent: 0 af 15 tilbud har rabat | **Rettet:** `computeOfferDB(items, offerDiscount)` i send-gate, statusskift-gate og tilbudsvisning. Regressionstest tilføjet. |
| E3 | `calculation-settings` brugte `\|\| standard`, så en bevidst 0-værdi (0 % avance, 0 pause, 0 dages betalingsfrist, 0-tærskel) blev stille til standard. | ingen i dag (ingen 0-værdier i prod) | **Rettet** (`??`). Multiplikatorer og gyldighedsdage beholder standard ved 0. |
| E4 | Rabat% fra LM-prisfilen gemmes ikke. Kostpris = nettopris uden sporbarhed. | aftale kan ikke genberegnes | datamodel (nedenfor) |
| E5 | Timeomkostning (`employee_compensation`, reel timekost) og timepris (calculation_settings) er ikke forbundet i prisberegningen. DB på arbejdstimer kendes ikke. | DB på timer ukendt | motoren tager `costPerHour` og `salePerHour` separat |

## 3. Motoren (implementeret, ren)
- **Indkøb:** listepris → grossistrabat → **nettokost** (reel omkostning).
- **Salg:** nettokost → politik: `markup` (avance) **eller** `target_db` (mål-DB) → listesalgspris → **kunderabat på salget**.
- **Timer:** timer × (1 + risikobuffer) × timekost / timepris.
- **Resultat:**
  - DB1 = salg − direkte kost, og DB1%.
  - DB2 = DB1 − overhead (% af direkte kost: kørsel, værktøj, småmaterialer).
  - Advarsler: under minimum-DB, underskud, timepris < timekost, manglende kostpris.
- **Eksplicitte konverteringer:** `markupToDb` og `dbToMarkup` (avance 25 % = DB 20 %).
- Den er kompatibel med `pricing.calculateSalePrice` uden rabatter (testet) og deterministisk.

## 4. Datamodel (FORSLAG — ikke anvendt; kræver godkendelse)
```sql
-- Grossistaftale pr. leverandør/varegruppe (KlarPris-niveau): rabat, bonus, online-rabat
CREATE TABLE public.supplier_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_group text,                          -- NULL = hele sortimentet
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  annual_bonus_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (annual_bonus_pct BETWEEN 0 AND 100),
  online_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (online_discount_pct BETWEEN 0 AND 100),
  valid_from date NOT NULL DEFAULT current_date, valid_to date,
  created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, product_group, valid_from)
);
-- Salgspolitik pr. komponentklasse (erstatter margin_* + marginregler); eksplicit avance ELLER mål-DB
CREATE TABLE public.price_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('default','component_kind','supplier','category','customer','product')),
  scope_ref text,                               -- fx 'material', supplier-id, kategori, customer-id
  mode text NOT NULL CHECK (mode IN ('markup','target_db')),
  value_pct numeric(5,2) NOT NULL CHECK (value_pct >= 0 AND (mode = 'markup' OR value_pct < 100)),
  priority int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Frosset prisbillede pr. tilbud (input + resultat) — grundlag for efterkalkulation og fakturakontrol (#19)
CREATE TABLE public.profit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.offers(id) ON DELETE CASCADE,
  engine_version text NOT NULL,
  input jsonb NOT NULL, result jsonb NOT NULL,
  direct_cost numeric(12,2) NOT NULL, sale numeric(12,2) NOT NULL, db1_pct numeric(6,2) NOT NULL,
  created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_products ADD COLUMN supplier_discount_pct numeric(5,2);  -- E4: gem Rabatpct fra LM
-- RLS: SELECT for authenticated med products.view.cost_prices-roller (admin, serviceleder, bogholderi) via user_role();
--      skrivning kun admin (supplier_agreements, price_policies) / systemet (profit_snapshots). Ingen anon-grants.
```

## 5. Indfasning (hver er en gate)
1. ✅ Ren motor + tests. Fejl E2/E3 rettet.
2. **Skygge:** DONE på grok-next 2026-10-09 (kun visning). Linjefoden viste DB uden tilbudsrabat. `shadowOfferDb` viser tallet før rabat ved siden af DB efter rabat. Motoren regner samme salg med fuld kost. Kost og salgspriser ændres ikke. Send-gaten er uændret. Manglende kost bliver ikke 0 i motoren. Prod-måling er ikke kørt. `offer-db-shadow-test`.
3. **Datamodel:** BLOCKED_APPROVAL. SQL'en ovenfor er et forslag. Henrik skal godkende migrationen, før tabellerne oprettes. Ikke kørt.
4. **Udskift:** BLOCKED_APPROVAL. At erstatte `pricing.ts` og DB-prisfunktionerne ændrer salgspriser. Det venter på trin 3 og på Henriks godkendelse af prisændringen. Ikke udskiftet.
5. **Efterkalkulation mod `profit_snapshots`:** BLOCKED_APPROVAL. Tabellen er ikke oprettet. Efterkalkulation v1 læser de kolonner, der allerede ligger på sagen og tilbuddet.
