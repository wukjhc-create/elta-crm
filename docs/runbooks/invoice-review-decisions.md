# Faktura-review 2026-10-04 — beslutninger til Henrik (B1–B7)

Uafhængigt review af fakturalogikken (Q11 i `docs/AUTONOMOUS_BACKLOG.md`). Det der KUN var fejl, er rettet (ae690f2).
Punkterne her ændrer, hvordan penge/status opfører sig, og venter derfor på et ja/nej. Prod i dag: 5 fakturaer,
0 med rabat, 0 fra tilbud, automatikreglerne kører `dry_run` — ingen af punkterne har ramt rigtige kunder endnu.

| # | Problem (eksempel) | Forslag | Kræver |
|---|---|---|---|
| B1 | Faktura 12.500, kreditnota 2.500 sendt, kunden betaler 10.000 → status forbliver "sendt" for evigt, og rykkere går ud på 12.500 | Ét fælles "udestående" = beløb − betalt − udstedte kreditnotaer; bruges af betalingsstatus, rykkere og dashboards | kode |
| B2 | Bankmatch kan ramme en **kladde** → den bliver "betalt" uden at være sendt (og e-conomic-markering kører for en ikke-bogført faktura) | Betaling kun på sendte, ikke-annullerede fakturaer; andre havner til manuel håndtering | kode |
| B3 | Forskud 10.000 sendt; kladde-kreditnota −10.000 oprettes; slutfaktura fratrækker derfor 0; kladden slettes → kunden faktureres 60.000 for 50.000 | Kun udstedte kreditnotaer tæller i fradraget — ELLER kladden kan ikke slettes, når en slutfaktura bygger på den | valg + kode |
| B4 | Kreditering af kun "Fradrag −10.000"-linjen på en slutfaktura → header −12.500, men linjen +10.000 (PDF viser +12.500) | Fortegn bevares; negative kildelinjer kan ikke krediteres enkeltvis | kode |
| B5 | Faktura 125,03 inkl. moms krediteres i to dele à 50,01 + 12,50 moms = 125,02 → kan aldrig annulleres (0,01 tilbage), rykkere fortsætter | Annullering afgøres på beløb ekskl. moms (som DB-funktionen allerede gør) | kode |
| B6 | Kreditnota-kladde −10.000 kan redigeres til −15.000 og sendes → krediterer mere end fakturaen | Kreditnota-kladder kan ikke redigeres (slet og opret igen) — eller genberegn loftet ved hver ændring | valg + kode |
| B7 | SQL-funktionen `create_invoice_from_offer` ignorerer rabat (afvises nu i koden, så intet går galt) | Ret funktionen så fakturaen = tilbuddets endelige beløb | migration (prod-gate) |

Lave (rettes sammen med ovenstående): sletning af en fratrukket rate-kladde efterlader en header uden linjer; PDF
falder tilbage til 25 % moms ved 0-subtotal; to samtidige kreditnotaer kan begge passere loftet (ingen lås).

**Anbefaling:** B1, B2, B4, B5 som beskrevet (ren korrekthed). B3: spær sletning (enklest at forstå). B6: ingen
redigering af kreditnota-kladder. B7 sammen med næste migrations-batch.
