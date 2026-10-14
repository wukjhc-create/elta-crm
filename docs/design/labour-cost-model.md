# Arbejdskost-model — inventar og forslag (2026-10-14)

Henrik 2026-10-14: *"Løs 295 vs 400 systematisk. Ingen tilfældige hardcoded cost rates rundt i calculators; brug
frozen/actual employee labour cost når den findes; ellers én central fallback labour cost; quick-calc må kun bruge 295
hvis det eksplicit er en lærlingesats valgt af brugeren. Ingen prod-adfærdsændring før modellen er konsistent."*

Status: **FORSLAG** — modellen findes som ren funktion (`src/lib/labour/labour-cost.ts`, unit-test
`scripts/labour-cost-test.ts` 13/13), men er IKKE koblet på nogen prod-sti endnu.

## 1. Prod-fakta (read-only, `scripts/prod-labour-cost-sources.ts`, 2026-10-14)
| | |
|---|---|
| Kostbasis (`company_settings.time_cost_basis`) | `real_hourly_cost` |
| Central standard-timekost (`company_settings.time_cost_rate`) | **ikke sat** → SQL-motoren falder til 400 |
| Aktive medarbejdere / med lønkort (`employee_compensation`) | 2 / 1 (lønkortet har intern sats sat) |
| Lønkort med `real_hourly_cost = 0` | 0 |
| Afsluttede timeregistreringer / med kost 0 / med kost 400 | 1 / 0 / 0 |
| Kalkulationsrækker med timer / med kost 295 | 1 / 0 |

Konsekvens: uoverensstemmelserne er (endnu) latente i prod — det er det rigtige tidspunkt at samle modellen.

## 2. Inventar — hvor arbejdskost (KOST) bestemmes i dag
| Sted | Værdi | Kilde | Live? | Problem |
|---|---|---|---|---|
| `supabase/migrations/00144` `compute_time_log_rates` (SQL-rate-motor → `time_logs.cost_rate_snapshot/cost_amount`) | basis-afhængig COALESCE(…, **400**) | lønkort/medarbejder/firma, ellers konstant | live — **den faktiske kost** | `real_hourly_cost` er GENERATED med COALESCE(…,0) → tomt lønkort fryser kost **0**; læser ikke en central standard ved basis ≠ fixed |
| `src/lib/services/rates.ts` `FALLBACK_COST_RATE` / `getEmployeeCostRate` | **400**; `employees.cost_rate` (intern → reel) | konstant / spejl | live (profitability.ts) | anden prioritet end SQL-motoren (reel → intern) og ignorerer `time_cost_basis` |
| `src/lib/actions/calculations.ts` `QUICK_CALC_LABOR_COST_PER_HOUR` | **295** | hardcoded "lærlingesats" | live (hurtigkalkulation) | ikke valgt af brugeren; afviger fra 400 |
| `src/app/dashboard/calculations/quick/quick-calculation-client.tsx` (DB-forhåndsvisning) | lærlinge-**salgs**sats fra indstillinger, ellers 295 | forkert kilde (salgssats som kost) | live | forhåndsvisningens DB ≠ den gemte kalkulations DB når indstillingen ≠ 295 |
| `src/lib/services/calculation-intelligence.ts` (rumberegner + profit-simulator) | `labor_cost_rate` ellers **400** | konstant (input sættes aldrig) | live | ok værdi, men egen kopi |
| `src/lib/actions/profit.ts` `resolveHourlyCost` (tilbuddets profitkort, `fillMissingOfferLineCosts`) | fast standard, ellers **gennemsnit** af alle aktive medarbejderes kost; ingen fallback (null) | lønkort | live | 4. model: gennemsnit inkl. lærlinge, ingen 400-fallback |
| `src/app/dashboard/ai-project/ai-project-client.tsx` + `src/lib/ai/calculationEngine.ts` | **450** / salgssats brugt som kost | hardcoded | live (AI Projekt) | hverken 400 eller medarbejderkost; salg = kost |
| `src/lib/utils/solar-calculator.ts` + `calculation_settings.solar_labor_cost_per_hour` | **450** (kost, avance lægges på) | indstilling | live (solcelleberegner) | egen kost-størrelse uden kobling til medarbejdere |
| `src/app/dashboard/packages/[id]/package-detail-client.tsx` ("time"-elementer) | kost **0** | hardcoded | live | pakkers arbejde har ingen kost → DB for høj |
| Kalkia Pro-motor (`kalkia-engine.ts`, `PackageBuilder.tsx`, `offer-automation.ts`, `calculate_calculation_totals`) | salgssats som kost / 65 % af salg | hardcoded | **dormant** (ikke nåbar fra UI) | ryddes eller rettes før aktivering |
| `service-case-economy.ts`, `employee-economy.ts`, `calculate_work_order_profit` | `time_logs.cost_amount` (frosset) | snapshot | live | korrekt — men manglende snapshot tæller som 0 i sags-økonomien |

(Salgssats-siden — `calculation_settings.hourly_rate_*` (695 i prod), `CALC_DEFAULTS` 495, faktura-fallback **650**
to steder, SQL 495 — er en separat oprydning; se §5.)

## 3. Modellen (én funktion: `resolveLabourCostRate`)
Første brugbare værdi vinder (0/negativ/ikke-tal = mangler):
1. **snapshot** — frosset kost på registreringen (`time_logs.cost_rate_snapshot`) = faktisk kost
2. **explicit** — sats brugeren eksplicit har valgt til et estimat (fx "Lærling") — aldrig stille
3. **medarbejder** efter `company_settings.time_cost_basis` (reel → intern, eller intern → reel; fast basis springer over)
4. **company_standard** — `company_settings.time_cost_rate` = den ENE centrale standard-timekost
5. **fallback** — 400 (samme konstant i TS og SQL), kun når intet er sat

## 4. Trinplan (hvert trin testes; prod-adfærd ændres først i trin 3, med godkendelse)
1. ✅ Model + unit-test (denne commit). Ingen kaldere.
2. **TS-kaldere bag modellen, adfærdsneutralt hvor værdien allerede er 400** (rumberegner, profitability.ts) +
   `getStandardCostRate()` i rates.ts (læser `company_settings.time_cost_rate`; ikke sat → 400). Ingen talændring i prod.
3. **Adfærdsændringer (kræver Henriks OK, listes enkeltvis):**
   - Hurtigkalkulation: kost = standard-timekost (i dag 400) i stedet for 295; nyt felt "Arbejdskost" med valg
     *Standard* / *Lærling (sats …)* / *Manuel* — 295 kun når *Lærling* vælges. Forhåndsvisning og gemt kalkulation bruger
     samme funktion. (Påvirker kun NYE hurtigkalkulationer; prod har 0 rækker med 295.)
   - AI Projekt: kost = modellen (ikke 450 / ikke salgssats).
   - Tilbuddets profitkort: modellen (standard-timekost) i stedet for gennemsnit uden fallback.
   - Pakkers "time"-elementer: kost = standard-timekost × timer (i dag 0).
   - Solcelleberegner: `solar_labor_cost_per_hour` → standard-timekost (eller behold som bevidst separat sats — valg).
4. **SQL-rate-motoren (migration, godkendelse):** `compute_time_log_rates` læser `NULLIF(real_hourly_cost, 0)` (lukker
   kost-0-fælden) og bruger `company_settings.time_cost_rate` som fallback før 400 for alle kostbaser. Ingen eksisterende
   snapshots genberegnes.

## 5. Åbne beslutninger til Henrik
1. **Standard-timekost:** skal `company_settings.time_cost_rate` (Indstillinger → Kalkulation → Kostbasis) være den centrale
   standard for ALLE estimater (ikke kun ved "fast standardsats")? Hvilken værdi — 400?
2. **Lærlingesats som kost:** hvor skal den eksplicitte lærlinge-KOST komme fra — fast 295, en indstilling, eller
   indtastes pr. kalkulation? (295 er i dag seedet som lærlingens *salgs*pris.)
3. **Solcelleberegnerens 450:** bevidst separat sats, eller samme standard-timekost?
4. **Salgssats-fallbacks:** fakturaens fallback 650 (to steder) vs. 495 (konstanter) vs. 695 (indstillingen i prod) —
   ensret til `getStandardSaleRate()` (indstillingen)?
