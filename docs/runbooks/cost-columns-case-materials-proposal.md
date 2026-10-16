# Forslag: kostkolonner på sagsmaterialer/øvrige omkostninger låses i databasen (F-11) — kræver godkendelse

**Status:** FORSLAG (2026-10-16, review NEXT-20). Ingen migration skrevet/kørt endnu.

## Fund
`case_materials.unit_cost / total_cost` og `case_other_costs` (kostfelterne) er kun skjult i app-koden (strip i
`lib/actions/case-materials.ts` m.fl.). RLS/kolonne-rettigheder tillader `authenticated` at læse dem direkte via
Supabase-API'et — en montør med login kan i princippet hente kostpriser uden om appen. 00192/00200/00201 låste
`offer_line_items`, `supplier_products`, `time_logs` og 17 kost-/rabattabeller, men ikke disse to.

## Forslag (samme mønster som 00192)
1. Migration `00234_case_cost_columns_lockdown.sql`:
   - `REVOKE SELECT (unit_cost, total_cost) ON public.case_materials FROM authenticated;` (+ tilsvarende kostkolonner
     på `case_other_costs`) — kolonne-niveau, resten af rækken læses som før.
   - Ingen data ændres.
2. App: alle læsninger der skal bruge kost går via admin-klienten bag `materials.view.cost_prices` /
   `economy.cost_prices` (fx `listCaseMaterials`, økonomi-fanen, tilbudt-vs-faktisk, fakturakontrol) — de fleste gør
   det allerede; resten listes ved implementeringen (grep efter `select(...unit_cost|total_cost...)` med bruger-klient).
3. Rækkefølge (procesregel): kode der tåler begge tilstande pushes først → migration → post-check (rolle-test: montør
   får 42501 på kolonnen, admin læser via app).

## Risiko
Middel: en glemt læsning med bruger-klienten fejler efter migrationen (synligt — ikke datatab). Afbødes af grep +
UI-regression for alle roller før migrationen.

## Rollback
`GRANT SELECT (unit_cost, total_cost) ON public.case_materials TO authenticated;` (+ case_other_costs).
