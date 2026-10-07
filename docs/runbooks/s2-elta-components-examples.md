# S2 — før/efter: AI-auto-tilbud med ELTAs egne komponenter

Genereret 2026-10-07 af `npx tsx scripts/test-harness/cli.ts elta-components-compare` (staging med prod-katalogets
værdier for de koblede komponenter; standard-timesats og -margin). **Flaget `AI_PROJECT_ELTA_COMPONENTS` er FRA i prod.**
FØR = motorens indbyggede standardværdier (sådan prod regner i dag). EFTER = ELTAs tider/salgspriser for entydigt koblede
komponenter. Materialer beregnes ens, bortset fra ELTAs materiel til ekstra tavlegrupper (TAVLE-GRP kost 145 kr).
Tavle, tavlegrupper uden ELTA-materiel og selve ladestanderen prissættes IKKE automatisk — motoren viser en advarsel (ingen gæt).

Koblinger: outlet_single → STIK-1-NY, outlet_double → STIK-2-NY, switch_single → AFB-1P-NY, switch_multi → AFB-KORR-NY, dimmer → DIM-NY, spot_light → SPOT-IND-1/SPOT-IND-X, ceiling_light → LOFT-NY, data_outlet → NET-CAT6-NY, tv_outlet → STIK-ANTENNE, panel_group → TAVLE-GRP, ev_charger → MONT-LADESTAND.
Bevidst ikke koblet (standard, intet entydigt ELTA-modstykke): outdoor_light, power_16a, power_32a, panel_new.

| Opgave | Materialer kr | Timer | Salgspris kr | Forskel | Fra ELTA | Standard (fallback) | Ikke prissat (advarsel) |
|---|---|---|---|---|---|---|---|
| Køkkenrenovering: 6 dobbelte stik, 2 enkelte, 4 spots, 1 dæmper, 1 afbryder, +2 grupper | 2.329 → 2.619 | 7.35 → 9.43 | 7.757 → 9.472 | +22.1 % | 2× Stikkontakt enkelt - ny, 6× Stikkontakt dobbelt - ny, 1× Afbryder 1-pol - ny, 1× Lysdæmper - ny, 1× Indbygningsspot - første, 3× Indbygningsspot - ekstra, 2× Ekstra gruppe i tavle | — | — |
| Stue + kontor: 8 stik, 3 afbrydere, 2 korrespondance, 2 loftudtag, 4 netværk, 1 TV | 2.851 → 2.851 | 9.19 → 12.16 | 9.619 → 11.531 | +19.9 % | 8× Stikkontakt enkelt - ny, 3× Afbryder 1-pol - ny, 2× Korrespondanceafbryder - ny, 2× Loftudtag - ny, 4× Netværksudtag Cat6, 1× Antenne-udtag | — | — |
| Carport: elbillader, 2 udendørs lamper, 1 kraftstik 16A, +2 grupper | 1.721 → 2.011 | 5.16 → 4.46 | 5.558 → 5.484 | -1.3 % | 1× Montering ladestander, 2× Ekstra gruppe i tavle | 2× Udendørs lampeudtag, 1× Kraftstik 16A | selve ladestanderen |
| Elbillader alene: 1 lader, 15 m 6 mm², +1 gruppe | 693 → 838 | 2.63 → 2.01 | 2.593 → 2.383 | -8.1 % | 1× Montering ladestander, 1× Ekstra gruppe i tavle | — | selve ladestanderen |
| Badeværelse: 10 spots, 1 dæmper, 2 stik, 1 afbryder | 2.067 → 2.067 | 5.25 → 5.72 | 6.065 → 6.368 | +5.0 % | 2× Stikkontakt enkelt - ny, 1× Afbryder 1-pol - ny, 1× Lysdæmper - ny, 1× Indbygningsspot - første, 9× Indbygningsspot - ekstra | — | — |
| Værksted/garage: 1 kraftstik 32A, 2 kraftstik 16A, 4 dobbelte stik, 2 loftudtag | 2.156 → 2.591 | 6.56 → 7.7 | 7.024 → 8.323 | +18.5 % | 4× Stikkontakt dobbelt - ny, 2× Loftudtag - ny, 3× Ekstra gruppe i tavle | 2× Kraftstik 16A, 1× Kraftstik 32A | — |
| Nyt hus 140 m² komplet: 30 stik, 10 dobbelte, 15 afbrydere, 4 korrespondance, 12 spots, 10 loftudtag, 4 netværk, 2 TV, ny tavle | 14.724 → 14.724 | 41.83 → 54.57 | 46.058 → 54.256 | +17.8 % | 30× Stikkontakt enkelt - ny, 10× Stikkontakt dobbelt - ny, 15× Afbryder 1-pol - ny, 4× Korrespondanceafbryder - ny, 1× Indbygningsspot - første, 11× Indbygningsspot - ekstra, 10× Loftudtag - ny, 4× Netværksudtag Cat6, 2× Antenne-udtag | 1× Ny eltavle komplet | tavlemateriel for ny eltavle |
| Tavleudskiftning: ny tavle | 18 → 18 | 4.2 → 4.2 | 2.726 → 2.726 | +0.0 % | — | 1× Ny eltavle komplet | tavlemateriel for ny eltavle |
| Udendørs belysning: 6 udendørs lamper, 1 afbryder | 1.231 → 1.231 | 4.55 → 4.73 | 4.528 → 4.644 | +2.6 % | 1× Afbryder 1-pol - ny | 6× Udendørs lampeudtag | — |
| Hjemmekontor: 4 dobbelte stik, 2 netværk, 1 loftudtag, 1 afbryder, +1 gruppe | 1.073 → 1.218 | 4.46 → 6.13 | 4.264 → 5.527 | +29.6 % | 4× Stikkontakt dobbelt - ny, 1× Afbryder 1-pol - ny, 1× Loftudtag - ny, 2× Netværksudtag Cat6, 1× Ekstra gruppe i tavle | — | — |
