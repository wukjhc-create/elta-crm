# Efterkalkulation / Profit Engine V1

**Status:** app-kode på `grok-next`. Ingen ny tabel, ingen prod-migration, ingen prod-data.
**Kode:** `src/lib/cases/aftercalc.ts` (ren beregning), `src/lib/actions/case-aftercalc.ts` (læsning), Økonomi-fanen og `/dashboard/reports/aftercalc`.

CRM er source of truth. Motoren gætter ikke en manglende kostpris. Beløb er ekskl. moms. Summer sker i øre (heltal) og timer i hundrededele, så binær flydende komma ikke flytter en øre.

## Hvad der allerede fandtes — og genbruges

| Behov | Eksisterende | V1 |
|---|---|---|
| Prissætning tilbud → salgspris | `src/lib/profit/engine.ts` | Uændret. Den prissætter. Den efterkalkulerer ikke en sag. |
| Tilbuddets DB med estimeret timekost | `src/lib/profit/offer-analysis.ts` | Estimatet bruges ikke i efterkalkulationen. Manglende frossen kost bliver `null` + advarsel, ikke firmaets timesats. |
| Tilbudt timer/budget ved sag-oprettelse | `src/lib/cases/offer-budget.ts` | Samme time-enheder (`t`/`time`/`timer`) via `isLabourUnit`. |
| Linje-match | `src/lib/cases/offer-vs-actual.ts` | Genbruges. Nyt flag `confidentOnly`: kun `source_offer_line_id` og samme `supplier_product_id`. Ens tekst matches ikke. Den gamle Økonomi-liste og sagsrentabiliteten (N26c/N26d) beholder tekstmatch, så U81 ikke skifter betydning. |
| Faktureret netto | `summarizeCaseInvoices` | Kladder tæller ikke. Kreditnotaer trækkes fra uanset fortegn. Fuldt krediteret original udlignes af kreditnotaen. Annulleret (`voided_at`) original tælles med og udlignes — samme regel som resten af CRM. |
| Realiseret DB | `computeRealizedDb` | Samme netto og samme "DB = netto − kost". V1 splitter kost i materiale, løn og øvrigt og lader DB være `null`, når kostgrundlaget er ufuldstændigt. |
| Afviste timer | `.neq('approval_status','rejected')` | Tælles som advarsel og holdes ude af timer og kost. |
| Ikke-fakturerbare timer | Økonomi-fanen: kost ja, salg nej | Samme. De indgår i faktisk lønkost. Omsætning kommer kun fra udstedte fakturaer. |
| Åbne timere | Økonomi-fanen springer `end_time = null` over | Samme. Advarsel. |
| Frossen kost | `offer_line_items.cost_price`, `supplier_cost_price_at_creation`, `time_logs.cost_amount`, `case_materials.total_cost` (genereret) | Foretrækkes. Aktuel grossistpris og `employees.hourly_rate` læses ikke. |
| Kost-adgang | `economy.cost_prices` = admin, serviceleder, bogholderi | Samme gate. Fanen Økonomi monteres kun når `canSeeCost`. Data hentes først når sektionen åbnes, og ryddes når den lukkes. |

## Datakilder

| Felt | Tilbudt | Faktisk |
|---|---|---|
| Omsætning | `offers.total_amount` (ekskl. moms, efter tilbuds-rabat). Uden header: sum af `offer_line_items.total` minus `discount_percentage` / `discount_amount`. Sektionslinjer springes over. | `summarizeCaseInvoices` på `invoices` med `case_id`. |
| Materialekost | Antal × (`cost_price` eller ellers `supplier_cost_price_at_creation`) på linjer der ikke er timer. 0 og null = ukendt. | `case_materials.total_cost` når `unit_cost` er sat og forskellig fra 0. |
| Timer | Sum af antal på time-enheder. | Afsluttede, ikke-afviste `time_logs.hours` via sagens arbejdsordrer. |
| Lønkost | Antal × frossen `cost_price` på timelinjer. Én linje uden kost gør hele lønkosten ukendt. | Sum af `time_logs.cost_amount`. `null` gør lønkosten ukendt. 0 er en gemt nul, ikke et gæt. |
| Øvrige | 0 når der findes et tilbud (tilbuddet har ikke en øvrig-kurv). `null` uden tilbud. | `case_other_costs.total_cost`, samme regel som materialer. |
| DB | Omsætning − samlet kost, kun når alle kostkurve er kendte og omsætningen er kendt. | Samme. Procent er `null`, når omsætningen er ≤ 0. |
| Afvigelse | Faktisk − tilbudt. Procent mod `|tilbudt|`. DB-procentpoint er forskellen mellem de to procenter. | |

`service_cases.contract_sum` bruges ikke som omsætning. Den kan være kopieret forkert på gamle sager (inkl. moms før 00193). Headeren på tilbuddet er kilden.

Leverandørfakturaer indgår ikke direkte. Godkendte linjer ligger allerede i `case_materials` / `case_other_costs`. At lægge dem oveni ville tælle dobbelt. Ukonverterede linjer er en advarsel i den eksisterende Økonomi-fane, ikke i dette tal.

## Kendte huller

- Tilbudslinjer har ingen "øvrig"-type. Alt der ikke er timer, er materiale i den tilbudte kost.
- Tekstlig ens beskrivelse er bevidst ikke et match i V1. De linjer står som "ikke matchet". Den ældre liste under samme fane grupperer dem stadig.
- Oversigten henter højst 201 sag-rækker og lader `takeCaseWindow` beholde de 200 nyeste. Ældre sager i filtret beregnes ikke. Sortering og side sker bagefter i hukommelsen. Prod har i skrivende stund få sager. Et DB-view bliver først relevant, når vinduet ikke slår til.
- `profit_snapshots` fra `docs/profit/PROFIT_ENGINE_DESIGN.md` er stadig kun et SQL-forslag og bruges ikke.

## Advarsler

`missing_offer`, `missing_cost_price`, `missing_frozen_labour_cost`, `offer_without_cost_basis`, `unlinked_materials`, `unmatched_lines`, `unbilled_work`, `credit_notes`, `rejected_hours`, `open_work`, `open_timers`, `invoice_without_offer`, `non_billable_hours`, `draft_invoices_ignored`, `partial_invoice`, `final_invoice`, `header_line_mismatch`.

Ingen advarsel retter data.

## Sikkerhed

- `getCaseAftercalc` og `getAftercalcOverview` kræver `economy.cost_prices`.
- Sagen læses med brugerens klient (RLS) før admin-klienten rører kostkolonner.
- Ingen lønkolonne, ingen `hourly_rate`, ingen `cost_rate_snapshot`. Service-role kaldes først efter gaten.
- UUID-tjek på sag og ansvarlig. Status, sortering og afvigelse er allowlists. Periode er en rigtig `YYYY-MM-DD`.
- Siden `/dashboard/reports/aftercalc` har samme gate. Tallene hentes først når sektionen åbnes, og ryddes når den lukkes.
- Oversigtens sag-id'er kommer fra brugerens egen sagsliste. Admin-klienten læser kun de id'er.

Eksisterende fund, ikke rettet her (ligger uden for den nye kode og uden for storage-arbejdet):

- `getServiceCaseEconomy` læser stadig `employees.hourly_rate` og lægger den i Økonomi-fanens payload for kost-roller. Efterkalkulationen bruger den ikke. En senere gennemgang kan fjerne satsen fra browseren, når fanens salgsfallback er erstattet.
- Den ældre linjeliste matcher stadig ens tekst. En brugt linje uden kost får nu afvigelse `null` i stedet for minus den tilbudte kost. Status på den liste følger stadig antallet, når kosten mangler. Den nye sektion sætter status til "mangler kostdata".

## Performance

Én sag: parallelle læsninger. Timer, linjer, materialer, øvrige og fakturaer hentes med `fetchAllRows` (PostgREST stopper ved 1.000). Arbejdsordre-id'er til timer deles i bidder af 200.
Oversigt: højst 201 sag-rækker, derefter ét bundt pr. tabel. Ingen forespørgsel pr. sag. `query_ms` vises på siden. Sortering og de to filtre "afvigelse" og "manglende kost" kører i hukommelsen på det vindue.

**Forslag til indeks — ikke kørt, kræver godkendelse:**

```sql
-- Kun hvis oversigtens 200-vindue bliver for snævert. Ikke anvendt.
CREATE INDEX IF NOT EXISTS service_cases_created_status_idx
  ON public.service_cases (created_at DESC, status);
```

`time_logs.work_order_id` og `invoices.case_id` er allerede fremmednøgler.

## BLOCKED_APPROVAL

| Emne | Hvorfor det venter |
|---|---|
| Indeks eller DB-view over efterkalkulation | Prod-DDL. Appen klarer nuværende volumen uden. |
| `profit_snapshots` ved afsendelse af tilbud | Eksisterende forslag. V1 læser de kolonner, der allerede er frosset på linjen. |
| At lade den gamle linjeliste droppe tekstmatch | Ændrer N26d-rapporten og U81. Bevidst ikke gjort i denne omgang. |
