# ELTA CRM — Autonom backlog

Arbejdsregel: en blocker stopper kun sin egen opgave (→ `BLOCKED` med præcist hvad der mangler); arbejdet fortsætter
med næste ikke-blokerede opgave. Cyklus pr. opgave: INSPECT → PLAN → IMPLEMENT → TEST → FIX → REGRESSION → COMMIT →
PUSH → DONE. Prod-migrationer kræver altid Henriks gate (forberedes, køres ikke). Floorplan/3D: PARKERET.

Status: `TODO` · `IN_PROGRESS` · `BLOCKED` · `BLOCKED_APPROVAL` (kun prod-gate; arbejdet fortsætter) · `DONE`

**Arbejdsmode (Henrik 2026-10-01):** en prod-gate stopper KUN sin egen opgave → `BLOCKED_APPROVAL`, alt forberedes færdigt, næste sikre opgave tages straks. Stop kun ved ny S1/S2, alt blokeret, eller 8–10 væsentlige opgaver.

**DELIVERY MODE (Henrik 2026-10-01):** mål = ELTA CRM 1.0 i daglig drift. Prioritet: GO-LIVE → driftsblokerende fejl → S1/S2 →
NEXT → audits/refactors. Komplette vertikale brugerflows; GO-LIVE tømmes først. Prod-gates samles i batches.
Grundlag: 3 flow-gennemgange (kode → action → RLS) + read-only prod-brug 2026-10-01 (105 kunder, 15 tilbud, 8 sager,
3 arbejdsordrer, 1 timeregistrering, 2 medarbejdere, 802 mails / 67 seneste 30 d) → systemet er reelt før go-live.

## Grok på grok-next (2026-10-14)
`origin/main` er merget ind. Claudes prod-kørsler og migrationer 00212–00219 er ikke kørt igen herfra.

| Opgave | Status |
|---|---|
| Kalender dag/uge viser besigtigelser, assistent-opkald og egne påmindelser (samme danske dato som måneden). Arbejdsordrer, priser og afsendelse er uændret. | DONE — `calendar-agenda-test` |
| Mine forfaldne / I dag viser også egne personlige påmindelser (dansk dato). Udførte er ude. Opgaverne overskrives ikke. | DONE — `my-day-test` |
| Lead-, tilbuds- og sagslisten viser kort under `md`. Samme tal og filtre. Status skiftes ikke ved et tryk på kortet. DB vises ikke på sagskortet. | DONE — `mobile-lists-test` |
| Kalenderens dag og uge er en liste under `md`. "I dag" er den danske dato, også på UTC-serveren. Arbejdsordrer og filtre er uændret. | DONE — `calendar-mobile-test` |
| Lead-kanban på mobil viser én fase. Flyt bruger de samme statusovergange som træk på skrivebordet. | DONE — `leads-kanban-mobile-test` |
| Tilbudt vs. faktisk: "I alt" bruger samme regel som sagsrentabiliteten. Manglende kost bliver ikke 0 kr. Rækker og match er uændret. | DONE — `profitability-figures-test` |
| Leverandørfaktura-listen viser kort under `md`. Samme beløb, forfald, status og mærker. Godkendelse og e-conomic er uændret. | DONE — `incoming-invoices-mobile-test` |
| Efterkalkulationens linjeliste viser antal og kost hver for sig. Ens tekst slås ikke sammen. En brugt linje uden kost vises som kost ukendt. Status-feltet til U81 er uændret. | DONE — `aftercalc-test`, `offer-vs-actual-test` |
| Efterkalkulationens linjer og tilbudt vs. faktisk vises som kort under `md`. U81-test-id ligger kun i tabellen. | DONE — `economy-lines-mobile-test` |
| Fakturaoverblik og kundens fakturaer vises som kort under `md`. Beløb er inkl. moms. Påmindelse kræver stadig et klik. Kost vises ikke. | DONE — `invoices-mobile-test` |
| Fakturakontrol viser overpris som en streg, når ingen linje kunne kontrolleres. En kendt overpris vises stadig. Linjerne er kort under `md`. | DONE — `header-totals-test` |
| Medarbejderlisten viser kort under `md`. Mail og telefon er egne links. Intern kost og salgspris følger `canSeePayroll`. | DONE — `employees-mobile-test` |
| Sagens materialer vises som kort under `md`. Salg kræver `canSeePrices`. Kost og foreløbig DB kræver `showCost`. Rediger og slet er de samme knapper. | DONE — `materials-mobile-test` |
| Efterkalkulationens ledelsesoversigt viser kort under `md`. Advarsel vises som tekst. Række-testid bliver i tabellen. | DONE — `aftercalc-overview-mobile-test` |
| OIOUBL sætter kreditnota- og konsistensflag. Beløb vendes ikke. | DONE — `oioubl-test` |
| Sagens leverandørfakturaer vises som kort under `md`. Beløb er inkl. moms. Ukonverterede linjer står som tekst. Åbn er et link. | DONE — `case-supplier-invoices-mobile-test` |
| Sagens øvrige omkostninger vises som kort under `md`. Kost og foreløbig DB kræver `showCost`. DB-testid bliver i tabellen. | DONE — `other-costs-mobile-test` |
| Timer på arbejdsordren vises som kort under `md`. Kost kræver `canSeeCost`. Salg kræver `canSeeSale`, også i overskriften. Satstype bruger samme skift. | DONE — `time-logs-mobile-test` |
| Fakturaer på sagen vises som kort under `md`. Beløb er inkl. moms. Hent har en synlig tekst. Kost vises ikke. | DONE — `case-invoices-mobile-test` |
| Bankafstemning viser kort under `md`. Status og auto-match er på dansk. Find faktura bruger samme match. | DONE — `bank-mobile-test` |
| Rapporter: top-kunder, sagsrentabilitet og team er kort under `md`. Kost på sagen kræver at kost er foldet ud. U88-testid bliver i tabellen. | DONE — `reports-mobile-test` |
| Indkøbsdrift viser kort under `md`. Beløb kræver `canAmt`. Linjer foldes ud med samme komponent. Paging er fælles. | DONE — `purchase-ops-mobile-test` |
| Medarbejderøkonomi viser kort under `md`. Kost og DB pr. medarbejder kræver `showRowCost`. Tom liste er uændret. | DONE — `employee-economy-mobile-test` |
| Leverandørprisliste viser kort under `md`. Kost følger `products.view.cost_prices` på hentningen. Fejl er en alert, ikke en tom liste. | DONE — `supplier-products-mobile-test` |
| Afvist timeregistrering kan rettes og slettes på kortet. Samme handlinger som tabellen. U155-testid bliver i tabellen. | DONE — `time-logs-mobile-test` |
| Tilbuddets lønsomhed navngiver linjer uden kostpris. Tallene er de samme. Foldede linjer er kort under `md`. | DONE — `offer-profit-missing-cost-test` |
| Fakturakontrol markerer fragt og gebyr i teksten. Overpris og motor er uændret. | DONE — `invoice-charge-label-test` |
| Kundens opgaver forklarer den tomme tilstand og åbner den samme formular. Kun udførte siges højt. | DONE — `customer-tasks-empty-test` |
| Kalenderens filtre og datovalg ombrydes på mobil. Forrige og næste har et navn. | DONE — `calendar-mobile-test` |
| Lead-detaljen siger det næste skridt. Statusovergange er de samme. | DONE — `lead-next-hint-test` |
| Tomt tilbud siger at der ingen linjer er. Tilføj-linje og skygge-DB er de samme. | DONE — `line-items-empty-test` |
| Dashboard-kort siger tomt, når tallet er 0. Beløb vises stadig, når det ikke er 0. | DONE — `dashboard-empty-stats-test` |
| Leverandørfakturaens linjer er kort under `md`. Antal, pris og konvertering er de samme. | DONE — `incoming-invoice-lines-mobile-test` |
| Kalenderens jobkort viser den ansvarlige. Den tætte ugevisning gør det ikke igen. | DONE — `calendar-mobile-test` |
| Afvisningsårsager og seneste afviste tilbud ombrydes på mobil. Beløbet er det samme. | DONE — `rejection-mobile-test` |
| Produktkataloget er kort under `md`. Kostpris kræver `canSeeCost`. Paging er fælles. | DONE — `products-mobile-test` |
| Tom mailsøgning siger at intet matchede, og søgningen kan ryddes. Tom indbakke er den samme tekst som før. | DONE — `mail-empty-search-test` |
| Salgstragten er kort under `md`. Række-testid bliver i tabellen. Beløb er ekskl. moms som før. | DONE — `sales-funnel-mobile-test` |
| Kundeprisaftaler ombrydes på mobil. Tom liste siger næste skridt. Ikoner har et navn. Kost og priser er de samme. | DONE — `customer-pricing-mobile-test` |
| Produktsøgning uden træf siger det og kan ryddes. Tomt katalog siger stadig at man opretter et produkt. | DONE — `products-empty-search-test` |
| Sagsoverblikket viser den tildelte. Mangler den, står der ikke tildelt. Opretteren bliver sælger i ansvar-panelet. | DONE — `case-assignee-test` |
| Sagsdokumenter er kort. Filnavnet ombrydes. Den tomme liste siger stadig at man tilføjer filer. | DONE — `document-name-test` |
| Leverandørkort ombryder navn, mail og knapper. Tom søgning kan ryddes. Tom liste siger stadig opret. | DONE — `suppliers-list-mobile-test` |
| Opgavefiltre og nøgletal ombrydes. Et filter uden træf kan ryddes. Tom liste uden filter er den samme. | DONE — `tasks-filter-mobile-test` |
| Besigtigelseskalenderens forrige og næste måned har et navn. Overskriften ombrydes. | DONE — `inspection-calendar-test` |
| Kundeopgave og påmindelse siger det, når datoen mangler. Personlige påmindelser ombrydes. Tiderne er de samme. | DONE — `missing-date-test` |
| Tom aktivitet på kunde, lead og tilbud siger hvad der lander der. | DONE — `activity-empty-test` |
| Sync-job og kørsler ombrydes. Ikonerne har et navn. Tom kørsel er den samme. | DONE — `sync-jobs-mobile-test` |
| Tomme rapportsektioner siger hvad der mangler. Team-teksten er den samme. | DONE — `reports-empty-test` |
| En tom dag i ugevisningen siger at der ikke er planlagte job. | DONE — `calendar-mobile-test` |
| Tom efterkalkulation kan nulstille filtrene. Titel på kortet ombrydes. Beløbene er de samme. | DONE — `aftercalc-empty-filter-test` |
| Tom fakturasøgning kan ryddes. Søgefeltet fylder bredden. Beløb og filtre er de samme. | DONE — `invoices-empty-search-test` |
| Tom beskedmappe siger om det er indbakke, sendt eller arkiv. | DONE — `messages-empty-test` |
| Tom notelog siger at man skriver ovenfor, når man må. Noten ombrydes. | DONE — `customer-notes-empty-test` |
| Tom sagslog siger at man skriver ovenfor, når man må. Uden rettighed er teksten den samme. | DONE — `case-notes-empty-test` |
| Luk-ikoner i opgave, projekt, tilbud, sol, besigtigelse og prisaftale har et navn. | DONE — `close-button-label-test` |
| Sagstitel og nøgletal ombrydes. Tildelt og sælger er de samme. | DONE — `case-assignee-test` |
| Kundens sager og sagens plan ombryder titlen. Den tomme plan er den samme. | DONE — `title-wrap-test` |
| Leverandørsøgning på tilbuddet ombryder produktnavn og badges. Kostpris og forældet-pris er de samme. | DONE — `offer-product-name-test` |
| Besigtigelsesrapporter på sagen ombryder titel og filnavn. Send-knappen er den samme. | DONE — `inspection-list-test` |
| Kommende besigtigelser ombryder kundenavn. Tom liste siger at man booker fra kunden eller sagen. Dagens adresse ombrydes. | DONE — `inspection-calendar-test` |
| Tom linjeliste i efterkalk og tilbud-mod-faktisk siger hvor linjer og forbrug kommer fra. Beløb og matching er de samme. | DONE — `economy-lines-empty-test` |
| Luk-ikoner på ny sag, tilbuds-opgave, tagtegning og kundeopgave har et navn. | DONE — `close-button-label-test` |
| Planlægningens køer ombryder sagstitel, kunde og montør. Årsagen er den samme. | DONE — `planning-backlog-mobile-test` |
| Tom leverandørfaktura-liste siger forfald, når forfaldsfilteret er aktivt. Leverandør og fakturanummer ombrydes. Beløb er de samme. | DONE — `incoming-invoices-mobile-test` |
| Sagsvælger på faktura og i planlægning skelner tom søgning fra ingen åbne sager og ombryder titlen. Loftet på 30 er det samme. | DONE — `case-picker-empty-test` |
| Mail-forslag og produktsøgning i tilbudslinjen ombryder navnet. Nettoprisen vises som før. | DONE — `mail-name-wrap-test` |
| Tilbudslinjer i mailen stables på smal skærm med etiketter. Linjetotalen regnes som før. Slet har et navn. | DONE — `quote-lines-mobile-test` |
| Tom besked-søgning kan ryddes og siger at søgningen ikke matchede. En tom mappe siger stadig hvilken mappe. | DONE — `messages-empty-test` |
| Lead-filtre og overskrift ombrydes. Status, kilde og søgning har et navn. Ryd alle og Kun mine er de samme. | DONE — `leads-filter-mobile-test` |
| Opgave-dialoger på projekt, tilbud og kunde stabler felter på smal skærm. Knapper ombrydes. Gem og luk er de samme. | DONE — `task-form-mobile-test` |
| Det operationelle overblik ombryder emne, afsender, nøgletal og fejltekst. Tallene og den tomme mail er de samme. | DONE — `dashboard-overview-mobile-test` |
| Kundeopgavens titel og ansvarlig ombrydes. Udført og genåbn har et navn. Manglende dato er den samme. | DONE — `customer-task-row-test` |
| Rapportens nøgletal, sagsnavn og afvigelses-filter ombrydes. Kost vises stadig kun når den er åbnet. | DONE — `reports-mobile-test` |
| Tilbudslistens handlinger, søgning og filtre ombrydes. Kortets titel ombrydes. Beløb og Ryd alle er de samme. | DONE — `offers-actions-mobile-test` |
| Sagens aktivitet ombryder beskrivelse og navn. Tidspunkt og tom liste er de samme. | DONE — `case-activity-wrap-test` |
| Medarbejderlisten ombryder navn og mail. Jobtitlen ombrydes. Løn vises stadig kun med samme gate. | DONE — `employees-mobile-test` |
| Tilbudsopfølgning ombryder titel, kunde og beløb. Ring, Åbn og den manuelle tekst er de samme. | DONE — `offer-followup-mobile-test` |
| Sagslisten ombryder titel og kunde. Søgefeltet fylder bredden. Tilbudt, revideret og fakturering er de samme. | DONE — `orders-list-mobile-test` |
| Mine job ombryder titel og kunde. Status, tom dag og navigering er de samme. | DONE — `my-jobs-mobile-test` |
| Opgavelisten viser kort på mobil. Udført, status og slet bruger de samme handlinger. Desktop-gitteret bliver. | DONE — `tasks-mobile-card-test` |
| Godkend timer ombryder sag, beskrivelse og begrundelse. Timer, sats og løntekst er de samme. | DONE — `time-approval-mobile-test` |
| Kundelisten ombryder firmanavn, kontakt og mail. Betalingsmærke og slet er de samme. | DONE — `customers-list-mobile-test` |
| Leadkortet ombryder firmanavn, kontakt, henvendelse og mail. Værdi og status er de samme. | DONE — `leads-list-mobile-test` |
| Mailrækken ombryder afsender og viser to linjer af emnet. Forhåndsvisningen bliver på én linje. | DONE — `mail-row-wrap-test` |
| Afviste tilbud og dagens opgaver ombryder titel og kunde. Beløb og tom liste er de samme. | DONE — `rejection-mobile-test`, `my-day-test` |
| Efterkalk-kortet ombryder kunde, ansvarlig og advarsel. Omsætning og DB er de samme. | DONE — `aftercalc-overview-mobile-test` |
| Produktkortets SKU ombrydes. Kost vises stadig kun med canSeeCost. | DONE — `products-mobile-test` |
| Sagens feltværdier ombrydes i stedet for at blive klippet ved 65 %. Nøgletal er de samme. | DONE — `case-field-wrap-test` |
| Konverterings-preview viser linjer som kort på mobil. Kostpris og forslag er de samme. Intet bogføres. | DONE — `conversion-preview-mobile-test` |
| e-conomic-forhåndsvisning viser linjer som kort. Nettobeløbet er det samme. Intet sendes. | DONE — `supplier-economic-preview-mobile-test` |
| Godkend-dialogen viser fakturalinjer som kort. Valg, total og Godkend er de samme. | DONE — `approve-lines-mobile-test` |
| Kalenderens dagsorden ombryder titlen. Ugekortenes chips bliver afkortet. Den tomme dag er den samme. | DONE — `calendar-agenda-test` |
| Arbejdsordre-dialogen ombryder titel og kunde. Status og luk er de samme. | DONE — `work-order-dialog-mobile-test` |
| Sagens plan ombryder overskrift og medarbejdermail. Tom liste og opret er de samme. | DONE — `title-wrap-test` |
| Tilbuddets kost- og DB-advarsler ombrydes. 0 kr-reglen og Udfyld kost er de samme. | DONE — `offer-warning-mobile-test` |
| Kundens dokumenttitler og filnavne ombrydes. PDF, deling og underskrift er de samme. | DONE — `customer-documents-wrap-test` |
| Faktura-hændelsen ombryder teksten. Beløbet er stadig inkl. moms. Kost vises ikke. | DONE — `invoices-mobile-test` |
| Bekræftelsens modtager og send-dialogen ombryder navn og mail. Send videre er den samme. | DONE — `recipient-wrap-test` |
| Efterkalk-panelet ombryder linje og højdepunkt. Beløb, match og tom tekst er de samme. | DONE — `economy-lines-mobile-test` |
| Tilbud mod faktisk ombryder linjen. Ukendt total og U81-status er de samme. | DONE — `economy-lines-mobile-test` |
| Chat-vedhæftningens filnavn ombrydes hos medarbejder og i portalen. Fjern bliver. | DONE — `chat-attachment-wrap-test` |
| Prissimulatoren stabler felter og ombryder scenarienavn. Starttal og moms er de samme. | DONE — `profit-simulator-mobile-test` |
| Dashboard-widgets ombryder navne. Beløb og tomme tekster er de samme. | DONE — `dashboard-widget-wrap-test` |
| Leverandørfakturaens hoved, felter og match-score ombrydes. Beløb, score og bogfør er de samme. | DONE — `incoming-invoice-lines-mobile-test` |
| Listen siger at e-conomic-bogføring forsøges og kan fejle, uden at godkendelser rulles tilbage. | DONE — `incoming-invoices-mobile-test` |
| Leadets mailfil ombryder filnavnet. Linket hentes stadig ved klik. | DONE — `lead-attachment-wrap-test` |
| Kundens mailtidslinje viser to linjer af emnet. Forhåndsvisningen bliver på én linje. | DONE — `customer-mail-wrap-test` |
| Tagtegningens titel ombrydes. Paneltallet er det samme. | DONE — `roof-title-wrap-test` |
| Beskedlisten ombryder afsender og viser to linjer af emnet. Forhåndsvisningen er stadig de første 100 tegn. | DONE — `messages-empty-test` |
| Importens produktnavn og varenummer ombrydes. Priser og udsnit er de samme. | DONE — `import-name-wrap-test` |
| Sync-jobbets navn og beskrivelse ombrydes. Fejlteksten på leverandørstatus ombrydes. | DONE — `sync-jobs-mobile-test` |
| Portalen ombryder dokument, fuldmagt og velkomst. PDF og fuldmagtstekst er de samme. | DONE — `portal-identity-wrap-test` |
| Efterkalk-tabellens sagstitel ombrydes. Omsætning og DB er de samme. | DONE — `aftercalc-overview-mobile-test` |
| Rapportens sag, kunde og medarbejder ombrydes. Kost bliver bag costOpen. | DONE — `reports-mobile-test` |
| Indkøbsdrift ombryder kunde, leverandør og fakturanavn. Beløb bliver bag canAmt. | DONE — `purchase-ops-mobile-test` |
| Ordrelistens titel, kunde og ansvarlig ombrydes. Tilbudt og faktureret bliver. | DONE — `orders-list-mobile-test` |
| Prisovervågning ombryder produkt, tilbud og trend. Priser og procenter bliver. | DONE — `pricing-name-wrap-test` |
| Materialer og øvrige omkostninger ombryder beskrivelse og note. Kost bliver bag de samme gates. | DONE — `materials-mobile-test`, `other-costs-mobile-test` |
| Timebeskrivelsen ombrydes på sagen og i fakturaudkastet. Timer og satser bliver. | DONE — `time-logs-mobile-test`, `billing-draft-desc-test` |
| Opgavelistens skrivebordsrække ombryder titel, kunde og ansvarlig. Status og slet bliver. | DONE — `tasks-mobile-card-test` |
| Styringscockpittet viser to linjer af emne og underlinje. Beløb og links bliver. | DONE — `cockpit-wrap-test` |
| Teamlisten ombryder navn og mail. Roller bliver. | DONE — `team-name-wrap-test` |
| Brødkrummen ombryder leddene. Home og navnet er de samme. | DONE — `breadcrumb-wrap-test` |
| Ny sag og kalkia-link har et navn på ikonknappen. Handlingen bliver. | DONE — `icon-button-label-test` |
| Revisionsloggen viser to linjer af objekt og bruger. 40-tegns forhåndsvisning bliver. | DONE — `audit-name-wrap-test` |
| Tilbud til sag ombryder sagsnummer og feltværdi. Beløb og fakturering bliver. | DONE — `offer-case-wrap-test` |
| Mine timer ombryder sag og afvisningsbegrundelse. Timer og status bliver. | DONE — `my-hours-wrap-test` |
| Aktivitetsloggen ombryder beskrivelse og udført af. Tom liste og loft bliver. | DONE — `activity-empty-test` |
| Betalingsrapportens status og historik ombrydes. Send og gem bliver. | DONE — `payment-report-wrap-test` |
| Mailens vedhæftede filnavn ombrydes. Download og luk har et navn. | DONE — `mail-attachment-wrap-test` |
| Sagens mail ombryder afsender, emne og filnavn. Download bliver. | DONE — `case-mail-wrap-test` |
| Tilbuddets part, listekunde og prislinje ombrydes. Beløb og opdatering bliver. | DONE — `offer-party-wrap-test` |
| Tilbudslistens kunde og den primære part ombrydes. Beløbet bliver. | DONE — `offer-party-wrap-test` |
| Sagens indkøbskort ombryder leverandørnavnet. Beløb bliver bag can_view_amounts. | DONE — `case-supplier-name-wrap-test` |
| Lead-kanban ombryder firma og kontakt. Træk og værdi bliver. | DONE — `leads-kanban-mobile-test` |
| Påmindelsen og prisadvarslen ombryder titlen. Luk har et navn. | DONE — `missing-date-test` |
| Leadlisten ombryder firma, kontakt, henvendelse og mail. Værdi og status bliver. | DONE — `leads-list-mobile-test` |
| Kundelisten ombryder firma, kontakt og mail. Betalingsmærke og kundenummer bliver. | DONE — `customers-list-mobile-test` |
| Projektlisten ombryder navn og kunde. Status og timer bliver. | DONE — `projects-name-wrap-test` |
| Grossistsøgning ombryder varenavn og SKU. Kost og salg bliver. | DONE — `supplier-search-name-test` |
| Materialebind ombryder leverandørnavn og SKU. Kost og Bind bliver. | DONE — `materials-bind-name-test` |
| Kundekobling ombryder firma, underlinje og fejl. Match og valg bliver. | DONE — `customer-link-name-test` |
| Udgående mail ombryder vedhæftet filnavn. Fjern og størrelse bliver. | DONE — `attachment-name-wrap-test` |
| Kundevælgeren ombryder det valgte navn og forslag. Fjern bliver. | DONE — `customer-picker-name-test` |
| Kundeimport viser hele filnavnet og fejlteksten. Tællere bliver. | DONE — `customer-import-name-test` |
| Adresseforslag ombryder vejnavnet. Valg bliver. | DONE — `address-suggestion-wrap-test` |
| Luk-knapper i toast, mail, kontakt, rapport og besigtigelse har et navn. Handlingen bliver. | DONE — `icon-button-label-test` |
| Global søgning viser to linjer af titel og underlinje. Navigation bliver. | DONE — `global-search-wrap-test` |
| Beskedtråden ombryder emnet, og svar, læst, arkiv og gendan har et navn. | DONE — `message-thread-wrap-test` |
| Partnerportalen ombryder sagstitel og dokumentnavn. Download bliver. | DONE — `partner-name-wrap-test` |
| Kalkia-materialelisten ombryder navnet. Kost, antal og DB bliver. | DONE — `kalkia-material-name-test` |
| Kalkia-forhåndsvisning ombryder komponent og materiale. Kost og antal bliver. | DONE — `kalkia-preview-name-test` |
| Kalkia-jobvælgeren ombryder jobnavn. Tid og valg bliver. | DONE — `kalkia-job-name-test` |
| Kalkia-pakkebrowseren ombryder pakkenavn. Pris, DB og Tilføj bliver. | DONE — `kalkia-package-name-test` |
| Kalkia-komponentbrowseren ombryder navnet. Tid og tilføj bliver. | DONE — `kalkia-component-name-test` |
| AI-projektets historik ombryder beskrivelsen og siger næste skridt. Pris bliver. | DONE — `ai-project-desc-test` |
| Rumfliser ombryder rummets navn. Valg og kostfelt bliver. | DONE — `room-name-wrap-test` |
| Integrationssiden ombryder webhook-URL og kald. Kopiér har et navn. | DONE — `integrations-url-wrap-test` |
| Kalkia-knuden ombryder leverandørvarens navn. Kost og fjern-link bliver. | DONE — `kalkia-node-name-test` |
| Mine job siger at kontoret planlægger, når ugen er tom. Links bliver. | DONE — `my-jobs-mobile-test` |
| Mine timer siger at tiden registreres under Planlægning, når ugen er tom. | DONE — `my-hours-wrap-test` |
| Medarbejderens tomme jobliste siger at jobbet planlægges i kalenderen. | DONE — `employees-mobile-test` |
| Pakkelisten skelner tom søgning fra ingen pakker, og menuen kan rammes på mobil. Priser bliver. | DONE — `packages-list-mobile-test` |
| Tomme faner på Godkend timer siger hvad afviste og godkendte timer betyder. Lønteksten bliver. | DONE — `time-approval-mobile-test` |
| Leverandørfaktura uden linjer siger at der ikke er noget at kontrollere, og peger på bilaget. | DONE — `incoming-invoice-lines-mobile-test` |
| Kundens tomme fakturaliste siger at fakturaer oprettes fra sagen. Beløb inkl. moms bliver. | DONE — `invoices-mobile-test` |
| Dashboardets tomme aktivitet siger hvad der vises, og handlingen ombrydes. | DONE — `dashboard-widget-wrap-test` |
| Pakkedetaljen stabler overblikket på mobil, linjerne kan rulles, og slet kan rammes. Priser bliver. | DONE — `package-detail-mobile-test` |
| Afleveringsfoto slettes fra et hjørne efter bekræftelse, ikke ved tryk på billedet. | DONE — `handover-photo-delete-test` |
| Bankafstemning forklarer tom liste og tom fakturasøgning, og reference ombrydes. Match er uændret. | DONE — `bank-mobile-test` |
| Tom efterkalkulation uden filter siger at sagen oprettes fra kunden. Filtre og tal bliver. | DONE — `aftercalc-empty-filter-test` |
| Team-produktivitet uden timer siger at tiden registreres under Planlægning. Timerne bliver. | DONE — `reports-empty-test` |
| Slet skabelon kan rammes på mobil og stopper ikke med at kræve bekræftelse. Prisen bliver. | DONE — `template-delete-mobile-test` |
| Profilbilledet viser kameraet på mobil, og navn og mail ombrydes. Upload er uændret. | DONE — `profile-avatar-mobile-test` |
| Komponentlisten ombryder navn og priser på mobil, og tom kategori siger at søgningen kan ændres. | DONE — `components-list-mobile-test` |
| Tom fakturakladde siger at linjerne tilføjes ovenfor. Andre fakturaer og beløb bliver. | DONE — `invoice-lines-empty-test` |
| Synk-job og planer forklarer tomme kørsler. Kør nu har et navn. Genforsøg bliver. | DONE — `sync-jobs-mobile-test` |
| Medarbejderøkonomi uden lukkede timer siger at de vises, når de er afsluttet. Kost-gate bliver. | DONE — `employee-economy-mobile-test` |
| Sagsvælgere uden åbne sager siger at sagen oprettes fra kunden. Søgeloftet bliver. | DONE — `case-picker-empty-test` |
| Tom lead-fase på mobil siger at man kan skifte fase eller bruge Ny Lead. Flyt og værdi bliver. | DONE — `leads-kanban-mobile-test` |
| Import-historik uden imports peger på Importer produkter, filnavnet ombrydes, og detaljer har et navn. | DONE — `import-name-wrap-test` |
| Marginreglens ikonknapper har navne, og rækken ombrydes. Procent og fast tillæg bliver. | DONE — `margin-rules-mobile-test` |
| Vis/skjul af adgangskode har et navn, og feltet får plads til ikonet. Værdien logges ikke. | DONE — `password-toggle-label-test` |
| Tom tagtegning peger på Tilføj tagflade, og værktøjslinjen ombrydes. Målestok bliver. | DONE — `roof-empty-mobile-test` |
| Indkøbskortets tre beløb stables på mobil, og overskriften ombrydes. Kosttal bliver. | DONE — `purchase-summary-mobile-test` |
| Materiale- og udlægsdialogen stables på mobil og kan rulles. Priser og DB bliver. | DONE — `case-cost-dialog-mobile-test` |
| Kalkulatorens nøgletal og beløbsrækker ombrydes på mobil. Kost-gate og tal bliver. | DONE — `calculator-results-mobile-test` |
| Leverandørvarekortets tre priser stables på mobil. Kost-gate og beløb bliver. | DONE — `supplier-products-mobile-test` |
| Kalkulationens avance, rabat, moms og linjefelter stables på mobil. Procenter bliver. | DONE — `calculation-form-mobile-test` |
| Kalkulationstype og LM-importens statuskort stables på mobil. Valg og tal bliver. | DONE — `three-col-cards-mobile-test` |
| Sagens projektøkonomi stables på mobil. Kun salgstal, og de bliver. | DONE — `project-economy-mobile-test` |
| Rettelse af en afvist time stables på mobil. Godkendelse og beløb bliver. | DONE — `time-logs-mobile-test` |
| Ukonverterede leverandørlinjer ombrydes på mobil. Kost-gate bliver. | DONE — `unconverted-lines-mobile-test` |
| Kundens sag i aktiviteten åbner sagen, og titler ombrydes. Beløb bliver. | DONE — `activity-empty-test` |
| Kunde- og partnerportalens ikoner har navne, og mailen ombrydes. Token-gate bliver. | DONE — `portal-access-mobile-test` |
| Tom leverandørfaktura-liste siger at kategorien eller forfaldet kan skiftes. Filteret bliver. | DONE — `incoming-invoices-mobile-test` |
| Afsendernavn i chat ombrydes hos medarbejder og i portalen. Beskeden bliver. | DONE — `chat-attachment-wrap-test` |
| Job uden tid siger at tiden registreres under Planlægning / Timer. Link, badge og dato bliver. | DONE — `planning-backlog-mobile-test` |
| Planlægningens kø siger hvad man gør, og sagen kan sætte dato og montør på en åben arbejdsordre. Opret og server-reglen bliver. | DONE — `planning-replan-mobile-test` |
| Gammelt lead i cockpittet siger at noten eller statusen opdateres på leadet. Linket bliver. | DONE — `cockpit-wrap-test` |
| Efterkalkulationens advarsel står som tekst på desktop, og sagsnummeret ombrydes. Tal og række-testid bliver. | DONE — `aftercalc-overview-mobile-test` |
| Leverandørfakturaens status vises på dansk i listen og på detaljen. Statusværdien og bogføringen bliver. | DONE — `incoming-invoices-mobile-test` |
| Sagens opgave kan markeres som udført med et navn, og titlen ombrydes. Fuldfør og tjeklisten bliver. | DONE — `order-tasks-mobile-test` |
| Kalenderens jobkort siger titel, sag, kunde og montør. Afkortningen bliver. | DONE — `calendar-mobile-test` |
| Besigtigelseskalenderens dag kan vælges med tastatur. Dagkortene bliver afkortet. | DONE — `inspection-calendar-test` |
| Tom sag uden upload-ret siger ikke at filen tilføjes ovenfor. Filnavnet bliver. | DONE — `document-name-test` |
| Tilbuddets titel ombrydes i tabellen, og nummeret ombrydes på kortet. Beløb bliver. | DONE — `offers-actions-mobile-test` |
| Sagens note kan redigeres og slettes med et navn, og teksten ombrydes. Bekræftelsen bliver. | DONE — `case-notes-empty-test` |
| Medarbejderlistens status og rolle har et navn, og nummeret ombrydes. Løn-gate bliver. | DONE — `employees-mobile-test` |
| Kundeportalen siger hvornår tilbud og sag vises, og sagens titel ombrydes. Beløb bliver. | DONE — `portal-identity-wrap-test` |
| Fakturaens kundenavn og nummer ombrydes. Beløb inkl. moms bliver. | DONE — `invoices-mobile-test` |
| Produktets navn og SKU ombrydes i tabellen. Listepris og kost-gate bliver. | DONE — `products-mobile-test` |
| Tom personlig påmindelse siger at den skrives ovenfor. Opret og udfør bliver. | DONE — `missing-date-test` |
| Leadets mail, telefon og firma ombrydes, noten har et navn, og aktiviteten ombrydes. Vedhæftningen hentes stadig ved klik. | DONE — `lead-attachment-wrap-test` |
| Grossistsøgning i API viser et mobilkort, og søgning, valg og prisknapper har et navn. Import og priser bliver. | DONE — `supplier-api-search-mobile-test` |
| Kundens mail, telefon og adresse ombrydes, og deaktiver, rediger og kontaktknapper har et navn. Pladsholder-mailen bliver. | DONE — `customer-contact-wrap-test` |
| Kalenderens dato, medarbejder og status har et navn, og nulstil er en knap. Ugechips bliver afkortet. | DONE — `calendar-mobile-test` |
| Efterkalkulationens nøgletal vises som kort på mobil, og manglende kost ombrydes. Tallene og række-testid bliver. | DONE — `economy-lines-mobile-test` |
| Opgavens søgning, filtre og formular har et navn, og felterne stables på mobil. Opret og den tomme liste bliver. | DONE — `tasks-filter-mobile-test` |
| Lukket tilbud-mod-faktisk siger at kosten er skjult, indtil panelet åbnes. Tal og data-status bliver. | DONE — `economy-lines-empty-test` |
| Timer-formularen har navne og stables på mobil, og den tomme liste siger at tiden vises når den er gemt. Kost-gate bliver. | DONE — `time-logs-mobile-test` |
| Leverandørfakturaens læsning og kilde vises på dansk. Statusværdien og bogføringen bliver. | DONE — `incoming-invoices-mobile-test` |
| Mailens søgning, sortering og læst-filter har et navn og ombrydes. Forhåndsvisningen bliver på én linje. | DONE — `mail-empty-search-test` |
| Tom sagsrentabilitet siger at sagen oprettes fra kunden. Hentningen bliver. | DONE — `reports-empty-test` |
| Driftsoverblikket viser fakturastatus på dansk, og tom mail, faktura og anbefaling siger næste skridt. Beløb bliver. | DONE — `dashboard-overview-mobile-test` |
| Driftstatus vises på dansk, og mail-tjenesten hedder Mail. Statusværdien til farven bliver. | DONE — `dashboard-overview-mobile-test` |
| Besigtigelsens felter og kabelveje har et navn. Værdien og billedsletningen bliver. | DONE — `icon-button-label-test` |
| Tagtegningens titel, panelvalg og målestok har et navn, og panelvalget kan fylde mobilbredden. Værdierne og gem bliver. | DONE — `roof-drawing-field-test` |
| Portal- og medarbejderchat har et navn på besked og send, og feltet kan krympe. Afsendelsen bliver. | DONE — `chat-composer-label-test` |
| Underskrift og fuldmagt kobler etiketten til feltet. Beløb, tekst og samtykke bliver. | DONE — `portal-sign-label-test` |
| Leverandørfakturaens revisionslog viser handlingen på dansk, og den tomme log siger næste skridt. Koden bliver. | DONE — `incoming-invoice-audit-label-test` |
| Fakturakontrollens linjetekst ombrydes på mobil. Overpris og 0-kr-sætningen bliver. | DONE — `invoice-control-wrap-test` |
| Tilbudslønsomhed ombrydes på mobil, og en manglende beregning siger at tilbuddet skal åbnes igen. Tallene bliver. | DONE — `offer-profit-wrap-test` |
| Planlagt afslutning vises i københavnsk tid, og beskrivelsen ombrydes. Statusknapperne bliver. | DONE — `planning-time-zone-test` |
| Agentindbakken viser modtagelse i københavnsk tid og sikkerhedstilstand på dansk. Udfør og live-send bliver. | DONE — `agent-inbox-time-test` |
| Kundens sagsliste peger på Ordrer, og titlen starter øverst. Sagsnummer og link bliver. | DONE — `customer-cases-empty-test` |
| Kundens mailtid vises i københavnsk tid, og meta-linjen kan ombrydes. Emnet bliver på to linjer. | DONE — `customer-mail-time-test` |
| Kundeopgavens forfald vises som københavnsk dato. Opret og den manglende dato bliver. | DONE — `customer-task-due-test` |
| Kundedokumentets dato og fuldmagtens underskrift vises i københavnsk dato. Teksten og databasen bliver. | DONE — `copenhagen-time-test` |
| Kundens oprettet og opdateret vises i københavnsk tid, og rækken kan ombrydes. Pladsholder-mailen bliver. | DONE — `customer-stamp-time-test` |
| Leadets oprettet, opdateret, modtagelse og aktivitet vises i københavnsk tid. Lukkedatoen bliver. | DONE — `lead-stamp-time-test` |
| Tilbuddets oprettet, sendt, set, accepteret og afvist vises i københavnsk tid. Gyldig-til bliver. | DONE — `offer-stamp-time-test` |
| Sagens mailtid og afleveringsunderskrift vises i københavnsk tid. Emnet og foto-sletningen bliver. | DONE — `case-stamp-time-test` |
| Prisadvarsel og opgavepåmindelse viser københavnsk tid uden år. Uden dato og luk bliver. | DONE — `reminder-stamp-time-test` |
| Beskedtrådens tid og svartid vises i københavnsk tid, og svaret kan ombrydes. Emnet og slet bliver. | DONE — `message-stamp-time-test` |
| Kundeaktivitet og tidslinjen viser københavnsk dato. Beløb, tom liste og loft bliver. | DONE — `activity-stamp-time-test` |
| Profil, kalkulationssnapshot, prisforklaring og leverandørtest viser københavnsk dato. Pris, status og adgangskode bliver. | DONE — `record-stamp-time-test` |
| Fakturaens eksporteret-tid vises i københavnsk tid, og statusrækken kan ombrydes. Bogføringen bliver. | DONE — `invoice-export-time-test` |
| Sagsdokumentets dato vises i københavnsk tid. Filnavn og tom liste bliver. | DONE — `case-doc-date-test` |
| SmartDate viser københavnsk dato før mount, så server og browser skriver det samme. Relativ tid bliver. | DONE — `smart-date-zone-test` |
| Tilbudsaktivitetens tid vises i københavnsk tid, og rækken kan ombrydes. Den tomme tekst bliver. | DONE — `offer-activity-time-test` |
| Regnskabswidgetens seneste fejl vises i københavnsk tid, og teksten kan ombrydes. Tællerne bliver. | DONE — `accounting-health-time-test` |
| Sagens aktivitetstid vises i københavnsk tid. Ugyldig dato og den tomme liste bliver. | DONE — `case-activity-time-test` |
| Synkloggens tidspunkt vises i københavnsk tid. Status, tom liste og prøv igen bliver. | DONE — `sync-log-time-test` |
| Sagsnotens tid vises i københavnsk tid. Ugyldig dato, tom liste og slet bliver. | DONE — `case-note-time-test` |
| Fakturaøkonomiens hændelsestid vises i københavnsk tid. Forfaldsdato og beløb bliver. | DONE — `invoice-economy-time-test` |
| Betalingsrapportens tidspunkt vises i københavnsk tid. Ugedag, test og tom historik bliver. | DONE — `payment-report-time-test` |
| Sagsfakturaens historiktid vises i københavnsk tid, og rækken kan ombrydes. Beløb bliver. | DONE — `case-invoice-history-time-test` |
| Eksportfejl-mailens tid vises i københavnsk tid. Afsender, beslutning og afsendelse bliver. | DONE — `export-error-time-test` |
| e-conomic-indstillingens synk og test vises i københavnsk tid, og statusrækkerne kan ombrydes. Nøgler, test og ryd bliver. | DONE — `economic-settings-time-test` |
| Leverandørsynkens sidste tid og sidst importeret vises i københavnsk tid, og oversigten kan ombrydes. Synk, import og produkttal bliver. | DONE — `supplier-sync-time-test` |
| Sagens oprettet, lukket og underskrevet vises i københavnsk tid. Start- og slutdato bliver. | DONE — `case-stamp-long-time-test` |
| Timelistens viste start, slut og dags dato er københavnske. Kost, salg og pladsholder bliver. | DONE — `time-log-clock-test` |
| Medarbejderens login og hændelser vises i københavnsk tid, og rækkerne kan ombrydes. Kalenderdatoer og beløb bliver. | DONE — `staff-clock-test` |
| Portal- og medarbejderchat viser københavnsk tid. Afsendelse bliver. | DONE — `chat-clock-test` |
| Mailens liste og detalje viser københavnsk tid. Forhåndsvisning og diagnostik bliver. | DONE — `mail-clock-test` |
| Dokument- og besigtigelsesbekræftelse vises i københavnsk tid. Indsendelse bliver. | DONE — `confirmation-clock-test` |
| AI-projektets tidligere analyser vises i københavnsk tid. Prisen bliver. | DONE — `ai-project-time-test` |
| Genereret tilbudstekst dateres i københavnsk kalender. Prislinjerne bliver. | DONE — `offer-text-date-test` |
| Lead-kanban på mobil viser den ansvarlige, og kolonne-meta kan ombrydes. Flyt og træk bliver. | DONE — `leads-kanban-mobile-test` |
| Opgavekortet på mobil siger ansvarlig og forfald. Udført, status og slet bliver. | DONE — `tasks-mobile-card-test` |
| Kundelisten på mobil viser kundenummer og om kunden er aktiv. Mail og slet bliver. | DONE — `customers-list-mobile-test` |
| Produktkortets rediger og slet siger hvilket produkt. Kost og listepris bliver. | DONE — `products-mobile-test` |
| Afvist tid kan rettes og slettes med medarbejderens navn. Kost og salg bliver. | DONE — `time-logs-mobile-test` |
| Pakke-admin navngiver gem, slet og tilvalgets felter. Pris og bekræftelse bliver. | DONE — `packages-button-name-test` |
| Marginreglens felter er koblet til etiketterne, og knapperne siger procenten. Procenterne bliver. | DONE — `margin-rules-mobile-test` |
| Kundeprisaftalens felter er koblet til etiketterne. Rabat, avance, prisliste og datoer bliver. | DONE — `customer-pricing-mobile-test` |
| Prisopslagets varenummer har et navn, og rediger/slet siger leverandøren. Priserne bliver. | DONE — `customer-pricing-mobile-test` |
| Planlæg og ret arbejdsordre kobler medarbejder, dato, titel og beskrivelse. Opret, gem og status bliver. | DONE — `work-order-dialog-mobile-test` |
| Besigtigelsens dato, tid og noter er koblet, og de stables på mobil. Afsendelsen bliver. | DONE — `book-besigtigelse-label-test` |
| Efterkalkulationens filtre stables på mobil, og datoerne hedder fra og til. Tallene og vinduet bliver. | DONE — `aftercalc-overview-mobile-test` |
| Leverandørfakturaens Åbn siger hvilken faktura, og filtrene viser om de er valgt. Beløb og bogføring bliver. | DONE — `incoming-invoices-mobile-test` |
| Fakturaens sagsknapper stables, og fjern siger sag. IBAN-knappen siger vis eller skjul. Beløb og bogføring bliver. | DONE — `incoming-invoice-lines-mobile-test` |
| Ny sag kobler felterne, og postnr, by og etage stables på mobil. Opret og opslag bliver. | DONE — `case-create-label-test` |
| Opret kunde kobler felterne, og privat/erhverv viser om det er valgt. Gem bliver. | DONE — `customer-create-label-test` |
| Kontaktformularen stabler titel, rolle, telefon og mobil på mobil. Roller og gem bliver. | DONE — `contact-form-mobile-test` |
| Tilbud fra mail kobler felterne, og de stables på mobil. Moms, rabat og gyldighed bliver. | DONE — `quote-form-label-test` |
| Produktformularen stabler kategori, enhed, kost og listepris på mobil. Priserne bliver. | DONE — `product-form-mobile-test` |
| Kreditnotaen kobler beløb, begrundelse, frist og note. Fortegn og loft bliver. | DONE — `credit-note-label-test` |
| Leverandørformularen stabler navn, kode, web, CVR og kontakt på mobil. Kode og e-conomic bliver. | DONE — `supplier-form-mobile-test` |
| Medarbejderens satser stables på mobil. Timeløn, salgspris og formlen bliver. | DONE — `employee-rate-mobile-test` |
| Personlige påmindelser siger hvilken titel der udføres, udsættes eller slettes. Tid og opret bliver. | DONE — `missing-date-test` |
| Kalkulationslinjens rediger og slet siger hvilken linje. Total og DB bliver. | DONE — `calculation-row-name-test` |
| Kalkulationens menu, tilbage, rum og antal siger hvad de rammer. Beløb og antal bliver. | DONE — `calculation-actions-name-test` |
| Komponentens varianter og materialer siger navnet, og tomme lister siger næste skridt. Tid og pris bliver. | DONE — `component-detail-name-test` |
| Leverandørfakturaens liste viser dublet, og detaljen åbner originalen. Status og bogføring bliver. | DONE — `incoming-invoice-duplicate-badge-test` |
| Tilbuddets leverandørsøgning ombrydes, og forældet måned er københavnsk. Pris og 60 dage bliver. | DONE — `offer-supplier-search-test` |
| Medarbejderens oprettet-tid er københavnsk. Ansættelse og fratrædelse bliver dato. | DONE — `employee-created-time-test` |
| Maillistens ældre dato er københavnsk. Relativ tid og forhåndsvisning bliver. | DONE — `mail-list-date-test` |
| Kundens sidste kontakt og flowdato er københavnsk. Trin og status bliver. | DONE — `customer-flow-time-test` |
| Projektaktivitet grupperes på københavnsk dato. Timer og sortering bliver. | DONE — `project-activity-time-test` |
| Læringsloggens dato er københavnsk, og rækken ombrydes. Værdierne bliver. | DONE — `learning-adjustment-time-test` |
| Manglende DB-afvigelse siger at den ikke kan beregnes. Tallene bliver. | DONE — `aftercalc-variance-text-test` |
| Sagens efterkalkulation siger når afvigelsen ikke kan beregnes. Beløb uden tal bliver en streg. | DONE — `aftercalc-line-variance-test` |
| Leverandørfakturaens tabel siger ikke konverteret, ligesom kortet. Beløb og bogføring bliver. | DONE — `invoice-line-conversion-text-test` |
| Godkendelsens kategori siger ikke relevant, når linjen ikke er øvrig. Valg og beløb bliver. | DONE — `approve-category-text-test` |
| Tom kalender siger det, når filtrene skjuler job. Ufiltreret tekst bliver. | DONE — `calendar-filter-empty-test` |
| Ugebordet siger, at tomme celler kan skyldes filtrene. Chips bliver afkortet. | DONE — `calendar-filter-empty-test` |
| Tilbud mod faktisk siger når afvigelsen ikke kan beregnes. Beløb uden tal bliver en streg. | DONE — `offer-vs-actual-variance-test` |
| Tilbudsoversigtens måned er københavnsk, som tallene. Hitrate og beløb bliver. | DONE — `offer-month-label-test` |
| Kundens indbakke ombrydes, og tom tilstand siger det når man ikke kan sende. Afsendelse bliver. | DONE — `customer-inbox-empty-test` |
| Mobilkanbanens flyt siger hvilket lead og hvilken fase. Synlig tekst og overgangene bliver. | DONE — `lead-move-name-test` |
| Sagens udfør siger hvilken opgave, og en fejl skjuler ikke listen. Handlingen bliver. | DONE — `order-tasks-mobile-test` |
| Kalenderens forrige og næste siger dag eller uge, og visningen kan ombrydes. Skridtet bliver. | DONE — `calendar-nav-label-test` |
| Listen siger når beløb eller leverandør mangler. Kendte beløb og fakturanummer bliver. | DONE — `invoice-list-missing-test` |
| Rapportens DB og kostafvigelse siger når de ikke kan beregnes. Kendte beløb bliver. | DONE — `report-profit-variance-test` |
| Påmindelseskortets knapper siger hvilken påmindelse, og rækken ombrydes. Tiderne bliver. | DONE — `reminder-action-name-test` |
| Produktsøgning og kategori har et navn. Filter og tom tilstand bliver. | DONE — `product-search-label-test` |
| Kalkulationslisten navngiver søgning, type og skabelon. Filtrene bliver. | DONE — `calculation-filter-label-test` |
| Pakkesøgning og kategori har et navn. Pris og søgeknap bliver. | DONE — `package-search-label-test` |
| Sagens slå-til siger hvilken række, og rækken ombrydes. Lav DB og auto-faktura bliver. | DONE — `case-toggle-name-test` |
| Tidsformularens gem og annullér kan rammes, og rækken ombrydes. Kost og salg bliver. | DONE — `time-log-form-touch-test` |
| Indkøbsfiltre siger hvad de er, og søgningen ombrydes. Filtrene bliver. | DONE — `purchase-filter-label-test` |
| Tilbudsoversigten siger når den henter eller fejler. Måned, hitrate og beløb bliver. | DONE — `offer-month-label-test` |
| Salgstragten siger når den ikke kunne hentes. Måned og beløb bliver. | DONE — `sales-funnel-error-test` |
| Mailens værktøjslinje ombrydes, og diagnose og reset siger når de fejler. Sync-kaldene bliver. | DONE — `mail-toolbar-wrap-test` |
| Sagsvælgeren siger når listen er skåret ned til 30. Søgning, loft og opret bliver. | DONE — `case-picker-cap-test` |
| Kommende besigtigelser følger dansk dato og siger når listen er skåret ned til 10. Datoen på kortet bliver. | DONE — `inspection-upcoming-test` |
| Sagens mails siger når hentningen fejler. Tom liste og rettighed bliver. | DONE — `case-mail-load-test` |
| Aktivitetsoversigten siger når et opslag fejler. Tom liste og beløb bliver. | DONE — `activity-load-note-test` |
| Kundens indbakke siger når hentningen fejler. Tom tekst og afsendelse bliver. | DONE — `customer-inbox-load-test` |
| Planens første hentning siger når den fejler. Tom plan og kost bliver. | DONE — `planning-load-view-test` |
| Noter, materialer og øvrige omkostninger siger når hentningen kaster. Tomme lister bliver. | DONE — `case-tab-load-throw-test` |
| Godkend timer siger når hentningen kaster. Tomme faner og løntekst bliver. | DONE — `time-approval-load-test` |
| Medarbejderens løn og job siger når hentningen kaster. Tom jobliste og satser bliver. | DONE — `employee-tab-load-test` |
| Tilbud til sag blokerer opret, når forhåndsvisningen fejler. Beløb og opret bliver. | DONE — `offer-case-preview-test` |
| Efterkalkulation siger når hentningen kaster. Afvigelse og 0 kr-reglen bliver. | DONE — `aftercalc-load-throw-test` |
| Fakturakontrol siger når hentningen kaster. Overpris og 0 kr-reglen bliver. | DONE — `invoice-control-load-test` |
| Leverandørpristjek på kladden siger når hentningen fejler. Tom liste, tilladelse og procent bliver. | DONE — `offer-price-load-test` |
| Portalen siger når besigtigelser ikke kan hentes, og knapperne ombrydes. Dato og tom liste bliver. | DONE — `portal-besigtigelse-load-test` |
| Overtidssatser seedes ikke når listen fejler. Satser og historik bliver. | DONE — `overtime-seed-guard-test` |
| Ny opgave siger når kundelisten fejler. Valg og tom opgaveliste bliver. | DONE — `task-customer-load-test` |
| Ny og ret sag siger når tilbudslisten fejler. Tom liste og koblingen bliver. | DONE — `order-offer-load-test` |
| Kalkulation og tilbud fra kalkulation siger når kundelisten fejler. Priser og valgfri kunde bliver. | DONE — `calc-customer-load-test` |
| Mine job siger når hentningen eller timetjekket fejler. Dato og tom uge bliver. | DONE — `my-jobs-load-test` |
| Tagtegninger siger når hentningen fejler. Tom liste og paneltal bliver. | DONE — `roof-load-test` |
| Prisovervågning siger når hentningen fejler. Priser og tomme tekster bliver. | DONE — `pricing-load-test` |
| AI-historik og kundevalg siger når hentningen fejler. Pris og tom liste bliver. | DONE — `ai-history-load-test` |
| Kalenderen siger når plan-køen eller job uden timer ikke kan hentes. Panelerne bliver. | DONE — `calendar-panel-load-test` |
| Medarbejderkortet siger når login, certifikater, udstyr, satser eller historik ikke kan hentes. Tomme tekster bliver. | DONE — `employee-profile-load-test` |
| Brugerstyring siger når invitationer eller aktivitet ikke kan hentes. Medlemmerne bliver. | DONE — `team-load-test` |
| Medarbejderlisten siger når hentningen fejler. Tom liste, tilladelse og timer bliver. | DONE — `employee-select-load-test` |
| Pakker og tilvalg siger når hentningen fejler. Tom liste, pris og bekræftelse bliver. | DONE — `package-load-test` |
| Sagens noter og aktivitet siger når hentningen fejler. Tom liste og tider bliver. | DONE — `case-history-load-test` |
| Kundens dokumenter siger når hentningen fejler. Tom liste, deling og dato bliver. | DONE — `customer-documents-load-test` |
| Team-produktivitet siger når timerne ikke kan hentes. Tom liste, måned og afviste timer bliver. | DONE — `report-team-load-test` |
| Topkunder og sagsrentabilitet siger når hentningen fejler. Tomme tekster, kost og DB bliver. | DONE — `report-section-load-test` |
| Omsætning og nøgletal siger når hentningen fejler. Beløb og søjler bliver. | DONE — `report-revenue-load-test` |
| Afvisninger siger når hentningen fejler. Tom tekst, beløb og rate bliver. | DONE — `report-rejection-load-test` |
| Dashboard siger når afvisninger ikke kan hentes. Tom tekst, rate og beløb bliver. | DONE — `dashboard-rejections-load-test` |
| Mine opgaver siger når hentningen fejler. Tomme sætninger og split bliver. | DONE — `my-day-load-test` |
| Afventende tilbud siger når hentningen fejler. Tom tekst og beløb bliver. | DONE — `pending-offers-load-test` |
| Seneste aktivitet siger når hentningen fejler. Tom tekst bliver, og en delvis liste beholdes. | DONE — `recent-activity-load-test` |
| Dashboard-nøgletal siger når hentningen fejler. Tomme tekster og formler bliver. | DONE — `dashboard-stats-load-test` |
| Tilbudsoversigten siger når hentningen fejler. Hitrate og måned bliver. | DONE — `monthly-offer-load-test` |
| Opgave-badge siger når hentningen fejler. Tal og montør-scope bliver. | DONE — `task-count-load-test` |
| Styringscockpit siger når tællingen fejler. Grønt nul og tomme tekster bliver ved succes. | DONE — `cockpit-load-test` |
| Øvrige cockpit-kort siger når hentningen fejler. Beløb og tomme tekster bliver. | DONE — `cockpit-rest-load-test` |
| Sagens dokumenter siger når hentningen fejler. Tom liste, dato og tilladelse bliver. | DONE — `case-documents-load-test` |
| Opgavelisten siger når hentningen fejler. Tomme tekster og montør-scope bliver. | DONE — `tasks-list-load-test` |
| Sagens opgaver siger når hentningen fejler. Tom tekst og udfør bliver. | DONE — `case-tasks-load-test` |
| Kundens opgaver siger når hentningen fejler. Tom tekst og tilladelse bliver. | DONE — `customer-tasks-load-test` |
| Leverandørfaktura-listen siger når hentningen fejler. Tom tekst, tilladelse og statusfiltre bliver. | DONE — `incoming-invoices-load-test` |
| Banklisten siger når hentningen fejler. Tom tekst og match-søgning bliver. | DONE — `bank-tx-load-test` |
| Påmindelser siger når hentningen fejler. Tom liste, tilladelse og udfør bliver. | DONE — `reminder-load-test` |
| Materialeadmin siger når hentningen fejler. Tom tekst, tilladelse og kost bliver. | DONE — `materials-admin-load-test` |
| Sagens materialer og øvrige omkostninger beholdes når hentningen fejler. Tom tekst og kost bliver. | DONE — `case-tab-load-throw-test` |
| Stage-fakturaer på sagen beholdes når hentningen fejler. Procent og beløb bliver. | DONE — `stage-invoices-load-test` |
| Sagens noter og aktivitet beholdes når hentningen fejler. Tom tekst og tider bliver. | DONE — `case-history-load-test` |
| Sagens mails beholdes når hentningen fejler. Tom tekst bliver. | DONE — `case-mail-load-test` |
| Prisadvarsler beholdes når hentningen fejler. Priser og tom tekst bliver. | DONE — `pricing-load-test` |
| Sagens opgaver beholdes når hentningen fejler. Tom tekst og udfør bliver. | DONE — `case-tasks-load-test` |
| Tilbudsopfølgning siger når hentningen fejler. Tom kort, tilladelse og tekster bliver. | DONE — `offer-followup-load-test` |
| Sagens fakturaer og historik beholdes når opdatering fejler. Tom tekst, beløb og tilladelse bliver. | DONE — `case-invoices-load-test` |
| Leverandørprodukter beholdes for samme søgning når hentningen fejler. 0, priser og tilladelse bliver. | DONE — `supplier-products-load-test` |
| Bekræftelsesstatus siger når hentningen fejler. Tom pille og send videre bliver. | DONE — `confirmation-load-test` |
| Leverandørfakturaens "ikke en faktura" siger når afsenderopslaget fejler. Reglen og statusfiltre bliver. | DONE — `incoming-invoice-sender-test` |
| Kundens indbakke beholdes når samme kunde ikke kan hentes igen. Tom tekst og afsendelse bliver. | DONE — `customer-inbox-keep-test` |
| Kundens sager og mailens sagsvælger siger når hentningen fejler. Tom tekst og kobling bliver. | DONE — `customer-cases-load-test` |
| Produktsøgning i mail-tilbud siger når søgningen fejler. Tom tekst og priser bliver. | DONE — `quote-product-search-test` |
| Sagsrentabilitet siger når sagslisten fejler. Tom tekst og kosttal bliver. | DONE — `report-cases-load-test` |
| Job uden tid siger når sag eller montør ikke kan hentes. Tom liste og dato bliver. | DONE — `jobs-without-time-load-test` |
| Afviste tilbud siger når kundenavnet ikke kan hentes. Beløb og tom liste bliver. | DONE — `rejection-names-load-test` |
| Cockpittets klar-til-lukning og timetal siger når tællingen fejler. Sagstallene bliver. | DONE — `cockpit-secondary-load-test` |
| Rapportens nøgletal siger når en delforespørgsel fejler. Accept-rate og beløb bliver. | DONE — `report-summary-load-test` |
| Planlægning opretter ikke et forslag, når arbejdsordretællingen fejler. 0 job er stadig uden blokering. | DONE — `planning-count-load-test` |
| Tilbud klar til sag siger når tællingen fejler. Grønt nul og beløb bliver. | DONE — `offer-conversion-load-test` |
| Kundelisten siger når mail-oprettede ikke kan tælles. Filteret bliver. | DONE — `customer-origin-count-test` |
| Afleveringsfoto fjerner ikke fluebenet, når resttællingen fejler. Et rigtigt 0 gør stadig. | DONE — `handover-count-load-test` |
| Pilot-tjeklisten bliver ikke grøn, når en tælling fejler. Grønt nul bliver. | DONE — `pilot-setup-load-test` |
| Go-live bliver ikke grøn, når en tælling fejler. Grønt nul og rykkertekst bliver. | DONE — `golive-count-load-test` |
| Fakturakontrol siger når faktura, linjer eller katalog fejler. Tom faktura og overpris bliver. | DONE — `invoice-control-query-test` |
| Pakker siger når tællingen fejler. Tom liste, kost og søgning bliver. | DONE — `packages-count-load-test` |
| Tidligere tilbud siger når hentningen fejler. Tom historik bliver. | DONE — `quote-history-load-test` |
| Kalkia-node slettes ikke, når undernoder ikke kan tælles. Et rigtigt 0 kan stadig slettes. | DONE — `kalkia-node-count-test` |
| Arbejdsordre bliver ikke udført, når åbne timere ikke kan tælles. En rigtig aktiv timer blokerer stadig. | DONE — `work-order-timer-count-test` |
| Materialebind siger når søgningen fejler. Tom søgning og kost bliver. | DONE — `materials-bind-search-test` |
| Rate og slutfaktura oprettes ikke, når et værn ikke kan læses. Procent og beløb bliver. | DONE — `stage-gate-load-test` |
| Materialeadmin viser kort på mobil, og bind-dialogen fylder skærmen. Kost og knapper bliver. | DONE — `materials-admin-mobile-test` |
| Cockpittets kladder skjuler ikke opfølgningstallet, når tællingen fejler. Et rigtigt 0 bliver skjult. | DONE — `cockpit-load-test` |
| Cockpittets portal, nye kunder og besigtigelser bliver ikke grønne, når hentningen fejler. Tomme tekster bliver. | DONE — `cockpit-rest-load-test` |
| Forfaldne fakturaer siger når kundenavnet ikke kan hentes. Beløb bliver. | DONE — `cockpit-rest-load-test` |
| Nye kunder uden tilbud tæller ikke leverandører som ingen, når opslaget fejler. | DONE — `cockpit-rest-load-test` |
| Webhenvendelser siger når kontakt eller eksisterende kunde ikke kan læses. 90 dage bliver. | DONE — `cockpit-rest-load-test` |
| Arbejdsordrer siger når medarbejdernavnet ikke kan hentes. Tom tildeling bliver. | DONE — `work-order-employee-load-test` |
| Opret og omplan siger når medarbejderen ikke kan tjekkes. Inaktiv og udført bliver. | DONE — `work-order-employee-check-test` |
| Kundelistens betalingstal siger når en tælling fejler. Listen og et ægte 0 bliver. | DONE — `customer-payment-count-test` |
| Kundekortet siger når tidligere mails ikke kan tælles. Kobling og pladsholder bliver. | DONE — `customer-unlinked-count-test` |
| Kobling siger fejl når opdateringen fejler. Opret kunde og et ægte 0 bliver. | DONE — `customer-unlinked-link-test` |
| Sletning af planlagt ordre kræver et læst job og et ægte 0 timer. Bekræftelsen bliver. | DONE — `work-order-delete-count-test` |
| Ansvarlig-listen siger når medarbejdere ikke kan hentes. Opgaver og et tomt valg bliver. | DONE — `task-profiles-load-test` |
| Medarbejderlisten og kalenderen siger når hentningen fejler. Tom tekst og satser bliver. | DONE — `employee-list-load-test` |
| Medarbejderkortet siger når hentningen fejler. Ikke-fundet og satser bliver. | DONE — `employee-detail-load-test` |
| Lønsomhed siger når timekost eller DB-mål ikke kan læses. Tallene bliver. | DONE — `offer-profit-load-test` |
| Grossist-sammenligning siger når opslaget fejler. Et ægte tomt svar bliver. | DONE — `offer-savings-load-test` |
| Forfaldsoverblik siger når listen ikke kan læses. Et ægte 0 bliver grønt. | DONE — `incoming-due-load-test` |
| Efterkalkulationens ansvarlig-filter siger når navnene ikke kan hentes. Sagerne bliver. | DONE — `aftercalc-assignees-load-test` |
| Leverandørvalget siger når listen ikke kan hentes. Et ægte tomt valg bliver. | DONE — `invoice-supplier-options-test` |
| Afsenderen siger når mailen ikke kan læses. Listen og en ægte privat mail bliver. | DONE — `invoice-supplier-sender-test` |
| Samme-domæne siger når søgningen fejler. Listen og et ægte 0 bliver. | DONE — `invoice-supplier-domain-count-test` |
| Fakturaen siger når den ikke kan læses. Ikke-fundet bliver. | DONE — `invoice-supplier-read-test` |
| Valgt leverandør siger når opslaget fejler. Ikke-fundet bliver. | DONE — `invoice-supplier-exists-test` |
| Bilagslinket siger når fakturaen ikke kan læses. Ingen fil bliver. | DONE — `invoice-file-url-test` |
| Konverteringsvisning siger når faktura eller linjer ikke kan læses. Ikke-fundet og kun-total bliver. | DONE — `conversion-preview-load-test` |
| Konverteringsvisning siger når sagen ikke kan læses. Ikke-matchet bliver. | DONE — `conversion-preview-case-test` |
| Konverteringsvisning siger når leverandørnavnet ikke kan læses. Linjerne bliver. | DONE — `conversion-preview-supplier-test` |
| Fakturahoved siger når fakturaen ikke kan læses. Ikke-fundet og lås bliver. | DONE — `invoice-header-read-test` |
| Sag-tilknytning siger når fakturaen ikke kan læses. Ikke-fundet og afsluttet bliver. | DONE — `invoice-case-match-read-test` |
| Genbogføring siger når fakturaen ikke kan læses. Den bogfører ikke. | DONE — `invoice-repost-read-test` |
| Testfaktura slettes ikke når linjer eller oprydning fejler. Vagten bliver. | DONE — `invoice-test-delete-test` |
| Fakturadetaljen siger når linjerne ikke kan hentes. Hovedet bliver. | DONE — `invoice-detail-lines-test` |
| Fakturadetaljen siger når leverandør, sag, ordre eller historik fejler. Hovedet bliver. | DONE — `invoice-detail-related-test` |
| Revisionsloggen siger når medarbejdernavnet ikke kan hentes. Posterne bliver. | DONE — `invoice-detail-names-test` |
| Listen siger når afsenderopslaget fejler. Rækkerne bliver. | DONE — `invoice-list-senders-test` |
| Pilot-health siger når agenttællinger ikke kan læses. Et ægte 0 bliver grønt. | DONE — `pilot-health-agent-count-test` |
| Pilot-health siger når integrationer ikke kan læses. Et ægte tomt svar bliver. | DONE — `pilot-health-integration-test` |
| Opfølgningsskyggen siger når indstillingerne ikke kan læses. Standard bliver. | DONE — `pilot-health-followup-settings-test` |
| Kalenderen siger når medarbejder eller sag ikke kan hentes. Jobbene bliver. | DONE — `calendar-relations-test` |
| Tilbudssøgning siger når kunderne ikke kan læses. Et ægte tomt match bliver. | DONE — `offer-search-customer-test` |
| Lead til kunde opretter ikke når læsningen fejler. Ikke-fundet bliver. | DONE — `lead-convert-read-test` |
| Lead-filen udleveres ikke når leadet ikke kan læses. Fremmed fil bliver. | DONE — `lead-attachment-read-test` |
| Besigtigelse bookes ikke når kunde eller dublet-tjek fejler. Dobbeltklik bliver. | DONE — `besigtigelse-book-read-test` |
| Opgave-ændring siger når opgaven ikke kan læses. Den ændres ikke. | DONE — `task-write-read-test` |
| Opgavelisten siger når ansvarliges navn ikke kan hentes. Opgaverne bliver. Ikke tildelt bliver når der ikke er en ansvarlig. | DONE — `task-assignee-names-test` |
| Månedskalenderen siger når ansvarliges navn ikke kan hentes. Aftalerne bliver. | DONE — `calendar-month-names-test` |
| Planlægningskøen siger når medarbejdere ikke kan hentes. Et tildelt job bliver ikke uden montør. | DONE — `planning-backlog-employees-test` |
| Sagens noter siger når forfatternavnet ikke kan hentes. Noterne bliver. | DONE — `case-note-authors-test` |
| Note-ændring siger når noten ikke kan læses. Den ændres ikke. | DONE — `case-note-write-read-test` |
| Udfyld manglende kost skriver ikke når tilbuddet eller leverandørkosten ikke kan læses. | DONE — `offer-fill-cost-read-test` |
| Tilbudsanalysen siger når tilbuddet ikke kan læses. DB beregnes ikke. | DONE — `offer-profit-read-test` |
| Download-links udleveres ikke når dokumenttjekket fejler. | DONE — `customer-doc-download-read-test` |
| Besigtigelsesbilleder siger når linket ikke kan laves. En tom mappe bliver. | DONE — `customer-image-url-test` |
| Deling siger når dokumentet ikke kan læses. Delingen ændres ikke. | DONE — `customer-doc-share-read-test` |
| Sags-upload uploader ikke når sagen ikke kan læses. | DONE — `case-doc-upload-read-test` |
| Lead-ændring og sletning siger når leadet ikke kan læses. Det ændres ikke. | DONE — `lead-write-read-test` |
| Lead-aktivitet siger når loggen ikke kan hentes. En ægte tom log bliver. | DONE — `lead-activity-load-test` |
| Portal-adgang siger når listen ikke kan hentes. Opret er slået fra. En ægte tom liste bliver. | DONE — `portal-tokens-load-test` |
| Kundeportalen siger når tilbud, sager, fakturaer, dokumenter, beskeder eller fuldmagter ikke kan hentes. Et ægte tomt svar bliver. | DONE — `portal-lists-load-test` |
| Portal-chat siger når beskederne ikke kan hentes. Allerede hentede beskeder bliver. En ægte tom chat bliver. | DONE — `portal-chat-load-test` |
| Tilknyttede fuldmagter siger når opslaget fejler. Egne dokumenter bliver. CPR udleveres ikke når signeren ikke kan slås op. | DONE — `portal-fuldmagt-load-test` |
| Portalen siger når tilbuddet ikke kan hentes. Ikke-fundet sender stadig til oversigten. | DONE — `portal-offer-load-test` |
| Fakturaen siger når den eller linjerne ikke kan hentes. Ikke-fundet og den tomme kladde bliver. | DONE — `invoice-detail-load-test` |
| Fakturaens kunde, sag og forgængere siger når opslaget fejler. Et ægte tomt svar bliver. | DONE — `invoice-detail-parties-test` |
| Produktkataloget siger når listen eller kategorierne ikke kan hentes. Et ægte tomt katalog bliver. | DONE — `products-load-test` |
| Kalkulationslisten siger når den ikke kan hentes. Et ægte tomt svar bliver. | DONE — `calculations-load-test` |
| Tilbuddets kalkulationsvælger siger når listen ikke kan hentes. Allerede hentede rækker bliver. Et ægte tomt svar bliver. | DONE — `offer-calculations-load-test` |
| Tilbuddets produktvælger siger når listen ikke kan hentes. Allerede hentede rækker bliver. Et ægte tomt svar bliver. | DONE — `offer-products-load-test` |
| Komponentlisten siger når den eller kategorierne ikke kan hentes. Et ægte tomt svar bliver. | DONE — `components-load-test` |
| Tilbuddets aktivitet siger når loggen ikke kan hentes. Et ægte tomt svar bliver. Et andet tilbuds rækker vises ikke. | DONE — `offer-activities-load-test` |
| Kalkia-noder siger når listen eller kategorierne ikke kan hentes. Et ægte tomt svar bliver. | DONE — `kalkia-nodes-load-test` |
| Revisionsloggen siger når den ikke kan hentes. Et ægte tomt svar bliver. Et andet filters rækker vises ikke. | DONE — `audit-load-test` |
| Ny sag og ret sag siger når kunder eller profiler ikke kan hentes. Et ægte tomt valg bliver. | DONE — `order-party-load-test` |
| Sagen siger når sagsnummeret eller sagen ikke kan hentes. Et ægte ukendt nummer bliver væk. | DONE — `order-edit-load-test` |
| Åbne arbejdsordrer siger når optællingen fejler. Et ægte 0 bliver. | DONE — `order-planned-count-test` |
| Hurtig kalkulation siger når skabeloner, rumtyper eller komponenter ikke kan hentes. Et ægte tomt rum bliver. | DONE — `quick-calc-load-test` |
| Tilbudstekster siger når listen ikke kan hentes. Et ægte tomt svar bliver. | DONE — `offer-texts-load-test` |
| Rumtyper siger når listen ikke kan hentes. Et ægte tomt svar bliver. | DONE — `room-types-load-test` |
| Materialekataloget siger når listen ikke kan hentes. Et ægte tomt svar bliver. | DONE — `materials-catalog-load-test` |
| Bygningsprofiler siger når listen ikke kan hentes. Et ægte 0 bliver. | DONE — `building-profiles-load-test` |
| Globale faktorer siger når listen ikke kan hentes. Et ægte tomt svar bliver. | DONE — `global-factors-load-test` |
| Kundevælgeren siger når søgningen fejler. Et ægte tomt match bliver. | DONE — `customer-picker-search-test` |
| Mailens kundekobling siger når søgningen fejler. Et ægte tomt match bliver. | DONE — `customer-link-search-test` |
| Ladestander-søgningen siger når kataloget ikke kan hentes. Et ægte tomt træf bliver. | DONE — `charger-search-test` |
| Fuldmagt og besigtigelse siger når sagerne ikke kan hentes. Et ægte tomt svar bliver. | DONE — `case-picker-load-test` |
| Kalkulationens produktvælger og pakkens lister siger når opslaget fejler. Et ægte tomt svar bliver. | DONE — `picker-catalog-load-test` |
| Produktet og pakkekategorierne siger når opslaget fejler. Et ukendt produkt bliver væk. | DONE — `category-select-load-test` |
| Kalkulationen og pakken siger når læsningen fejler. Et ægte ukendt id bliver væk. | DONE — `detail-read-load-test` |
| Kunde, tilbud, lead, komponent, projekt og leverandør siger når læsningen fejler. Et ægte ukendt id bliver væk. | DONE — `entity-read-load-test` |
| Variant-materialer siger når listen ikke kan hentes. Et ægte tomt svar bliver. | DONE — `variant-materials-load-test` |
| Kalkia-noden siger når læsningen fejler. Et ægte ukendt id bliver væk. | DONE — `kalkia-node-detail-load-test` |
| Indgående faktura siger når e-conomic-tjekket fejler. Et ægte ikke-opsat svar bliver. Bogføring bliver slået fra. | DONE — `economic-ready-load-test` |
| Fakturaoverblik siger når e-conomic-tjekket fejler. Et ægte ikke-opsat svar bliver. Eksport bliver slået fra. | DONE — `invoice-overview-economic-load-test` |
| Fakturaens regnskabspanel siger når e-conomic-tjekket fejler. Et ægte ikke-opsat svar bliver. Eksport bliver slået fra. | DONE — `invoice-accounting-ready-load-test` |
| Eksport-loggen siger når listen, tællerne eller e-conomic-tjekket fejler. Et ægte tomt svar bliver. | DONE — `sync-log-load-test` |
| Regnskabs-widgeten siger når e-conomic-tjekket eller en optælling fejler. Et ægte 0 bliver. | DONE — `accounting-health-load-test` |
| Leverandørfakturans forhåndsvisning siger når indstillinger, leverandør eller linjer ikke kan hentes. Et ægte ikke-opsat svar bliver. | DONE — `supplier-economic-ready-load-test` |
| Kundefakturans forhåndsvisning siger når faktura, linjer, kunde eller indstillinger ikke kan hentes. Et ægte tomt svar bliver. | DONE — `invoice-preview-load-test` |
| Betalingsforhåndsvisningen siger når faktura, indstillinger eller registrering ikke kan hentes. Et ægte ikke-fundet bliver. | DONE — `payment-preview-load-test` |
| Kundefakturans e-conomic-forhåndsvisning kan læses på mobil. Beløbene bliver. | DONE — `economic-preview-mobile-test` |
| Betalingsposteringen kan ombrydes på mobil. Beløbet bliver. | DONE — `payment-preview-mobile-test` |
| Tilbuddets linjer kan læses på mobil. Beløbene bliver. | DONE — `offer-lines-mobile-test` |
| Stage-fakturaer på sagen kan læses på mobil. Beløb, procent og status bliver. | DONE — `stage-invoices-mobile-test` |
| Forgængere på slutfakturaen kan læses på mobil. Fradrag, procent og status bliver. | DONE — `predecessor-invoices-mobile-test` |
| Fakturakladdens timer kan læses på mobil. Afkrydsning, timer og sats bliver. | DONE — `billing-time-mobile-test` |
| Fakturakladdens materialer kan læses på mobil. Afkrydsning, antal og pris bliver. | DONE — `billing-materials-mobile-test` |
| Fakturakladdens øvrige omkostninger kan læses på mobil. Afkrydsning, antal og total bliver. | DONE — `billing-other-mobile-test` |
| Fakturakladdens linjer kan læses på mobil. Antal, stk-pris og total bliver. | DONE — `draft-lines-mobile-test` |
| Fakturalinjer på fakturasiden kan læses på mobil. Antal, pris og total bliver. | DONE — `invoice-detail-lines-mobile-test` |
| Tidligere fakturaer på slutfakturaen kan læses på mobil. Fradrag og status bliver. | DONE — `invoice-predecessors-mobile-test` |
| Kreditnotaer på fakturaen kan læses på mobil. Beløb og status bliver. | DONE — `invoice-credits-mobile-test` |
| Kreditnota-dialogen kan vælge linjer på mobil. Antal og total bliver. | DONE — `credit-lines-mobile-test` |
| AI-projektets komponenter kan læses på mobil. Antal, enhedspris og total bliver. | DONE — `ai-components-mobile-test` |
| Autopilot-reglerne kan læses på mobil. Tilstand og skift bliver. | DONE — `golive-rules-mobile-test` |
| Rumkalkulatorens kabeloversigt kan læses på mobil. Meter og priser bliver. | DONE — `room-cables-mobile-test` |
| Rumkalkulatorens scenarier kan læses på mobil. Margin, pris og DB bliver. | DONE — `room-scenarios-mobile-test` |
| Komponentkalibreringen kan læses på mobil. Minutter, afvigelse og konfidens bliver. | DONE — `learning-calibrations-mobile-test` |
| Prisadvarsler kan læses på mobil. Gammel pris, ny pris og ændring bliver. | DONE — `price-alerts-mobile-test` |
| Påvirkede tilbud kan læses på mobil. Beløb og potentielt tab bliver. | DONE — `price-offers-mobile-test` |
| Pristendenser kan læses på mobil. Nuværende pris, 30 dage og 90 dage bliver. | DONE — `price-trends-mobile-test` |
| Revisionsloggens ændringer kan læses på mobil. Før og efter bliver. | DONE — `audit-changes-mobile-test` |
| Grossist-sammenligningen kan læses på mobil. Kost og besparelse bliver. | DONE — `offer-savings-mobile-test` |
| Kundeportalens tilbudslinjer kan læses på mobil. Antal, enhedspris og total bliver. | DONE — `portal-offer-lines-mobile-test` |
| Projektlisten kan læses på mobil. Status, timer og budget bliver. | DONE — `projects-mobile-test` |
| Overtidssatser og udstyr kan læses på mobil. Faktor, kost og salg bliver. | DONE — `employee-rates-mobile-test` |
| Solcelle-oversigtens år kan læses på mobil. Produktion og besparelse bliver. | DONE — `savings-years-mobile-test` |
| Eksport-loggen kan læses på mobil. Tidspunkt, status og fejltekst bliver. | DONE — `sync-log-mobile-test` |
| Kundeimportens forhåndsvisning kan læses på mobil. Firma, e-mail og status bliver. | DONE — `customer-import-mobile-test` |
| Låste tilbudslinjer kan læses på mobil. Antal, pris og kost-gate bliver. | DONE — `line-items-mobile-test` |
| Overtidseditoren kan læses på mobil. Faktor, kost, salg og gem bliver. | DONE — `overtime-editor-mobile-test` |
| Tilbudsforhåndsvisningens totaler og modtager kan læses på mobil. Beløbene bliver. | DONE — `offer-preview-mobile-test` |
| Kunde- og projektnavn ombrydes i sidehovedet. Status og budget-gate bliver. | DONE — `record-title-wrap-test` |
| Fakturaens sidehoved kan læses på mobil. Nummer, status og total bliver. | DONE — `invoice-header-mobile-test` |
| Leverandørfakturaens beløb kan læses på mobil. Beløb og test-sletning bliver. | DONE — `incoming-header-mobile-test` |
| Planlæg-dialogen kan rulles på mobil. Opret og dato bliver. | DONE — `plan-dialog-mobile-test` |
| Kontakt- og tidsdialogen kan rulles på mobil. Gem bliver. | DONE — `dialog-scroll-mobile-test` |
| Rediger-arbejdsordre-dialogen kan rulles på mobil. Gem og statusskift bliver. | DONE — `work-order-dialog-mobile-test` |
| Gem-som-skabelon kan rulles på mobil. Totalpris og gem bliver. | DONE — `save-template-mobile-test` |
| Sagvælgeren på leverandørfakturaen kan rulles på mobil. Søgning og loft bliver. | DONE — `invoice-case-picker-mobile-test` |
| Opgave-dialogen kan rulles på mobil. Opret og gem bliver. | DONE — `tasks-filter-mobile-test` |
| Kundeopgave-dialogen kan rulles på mobil. Opret og forfald bliver. | DONE — `customer-task-dialog-mobile-test` |
| Tilbudsopgave-dialogen kan rulles på mobil. Opret og forfald bliver. | DONE — `offer-task-dialog-mobile-test` |
| AI-kundevalget kan rulles på mobil. Luk har et navn. Satser bliver. | DONE — `ai-customer-modal-mobile-test` |
| Bekræftelsesdialogen kan rulles på mobil. Titel og knapper bliver. | DONE — `confirm-dialog-mobile-test` |
| Ny pakke kan rulles på mobil. Felter og opret bliver. | DONE — `package-create-mobile-test` |
| Efterkalkulationens filtre kan krympe på mobil. Dato og beløb bliver. | DONE — `aftercalc-overview-mobile-test` |
| Revisionsloggens filtre kan krympe på mobil. Søgning og forhåndsvisning bliver. | DONE — `audit-filter-mobile-test` |
| Leverandørfakturaens rediger-sidehoved stabler felter på mobil. Beløb og momsregel bliver. | DONE — `invoice-header-edit-mobile-test` |
| Personlige påmindelser kan krympe på mobil. Opret, udfør og udsæt bliver. | DONE — `personal-reminder-mobile-test` |
| Ny sag: planlagt start og slut kan krympe på mobil. Register og planlagte timer bliver. | DONE — `new-order-date-mobile-test` |
| Ret sag: planlagt start og slut kan krympe på mobil. Opdatering og planlagte timer bliver. | DONE — `edit-order-date-mobile-test` |
| Sagens plan: dato og omplan kan krympe på mobil. Opret og opdatering bliver. | DONE — `planning-date-mobile-test` |
| Kalkia-link: fejlet leverandørsøgning står ikke som ingen produkter. Kost og link bliver. | DONE — `supplier-options-load-test` |
| Grossistsøgning: fejlet søgning står ikke som ingen produkter. Kost og salg bliver. | DONE — `supplier-search-load-test` |
| Tilbuddets leverandørsøgning: fejlet søgning står ikke som ingen produkter. Priser og tilføj bliver. | DONE — `offer-supplier-search-load-test` |
| Kundeprisopslag: fejlet opslag står ikke som ingen priser. Beløb og bedste pris bliver. | DONE — `customer-price-lookup-test` |
| Pakkevælgeren rydder den forrige liste når søgningen fejler. Valg og pris bliver. | DONE — `package-picker-load-test` |
| Tidsregistrering: dato og klokkeslæt kan krympe på mobil. Gem, kost og salg bliver. | DONE — `time-log-date-mobile-test` |
| Andre omkostninger: datoen kan krympe på mobil. Beløb og gem bliver. | DONE — `other-cost-date-mobile-test` |
| Ny medarbejder: ansættelsesdatoer kan krympe på mobil. Register bliver. | DONE — `employee-date-mobile-test` |
| Ret medarbejder: ansættelsesdatoer kan krympe på mobil. Timeløn og formel bliver. | DONE — `employee-edit-date-mobile-test` |
| Lead: forventet lukkedato kan krympe på mobil. Værdi og status bliver. | DONE — `lead-date-mobile-test` |
| Tilbud: gyldig-til kan krympe på mobil. Rabat og moms bliver. | DONE — `offer-date-mobile-test` |
| Sagsrentabilitet siger når listen er klippet ved 15. Tallene bliver. | DONE — `report-cases-cap-test` |
| Mine timer siger når listen er klippet ved 12. Timer, dato og status bliver. | DONE — `my-hours-cap-test` |
| Indkøbskortet siger når leverandører eller fakturaer er klippet. Beløb bliver. | DONE — `purchase-summary-cap-test` |
| Ukonverterede fakturaer siger når listen er klippet ved 8. Beløb bliver. | DONE — `unconverted-invoices-cap-test` |
| Synkroniseringshistorik siger når listen er klippet ved 10. Kørsler bliver. | DONE — `sync-history-cap-test` |
| Hurtigkalkulation viser alle rumtyper, og knapperne ombrydes. addRoom bliver. | DONE — `quick-room-types-test` |
| Kalkia-rumvælgeren viser alle typer i to kolonner på mobil. Valg bliver. | DONE — `room-type-grid-test` |
| Kalenderens dag på mobil viser også ledige medarbejdere. Jobkortet bliver. | DONE — `calendar-day-free-test` |
| Kalenderens uge på mobil nævner ledige, når dagen har andre job. Tom tekst bliver. | DONE — `calendar-week-free-test` |
| Sagslisten med kun et faktureringsfilter siger at filtrene er tomme. Den ægte tomme liste bliver. | DONE — `orders-billing-empty-test` |
| Medarbejderlisten med kun inaktive siger at filtrene er tomme. Den ægte tomme liste bliver. | DONE — `employees-status-empty-test` |
| Fakturaoverblikket med et regnskabsfilter siger hvilken status der er tom. Søgning bliver. | DONE — `invoices-acc-empty-test` |
| Daglige søgefelter har et navn: kunder, projekter, leverandører, grossistprodukter og global søgning. | DONE — `search-field-label-test` |
| Kommandopalet og kalkulationssøgning har et navn. Søgningen bliver. | DONE — `picker-search-label-test` |
| Materialekatalog, komponenter og tilbudstekster har et navn. Søgningen bliver. | DONE — `catalog-search-label-test` |
| Kundelink, tilbuds-parter, leveringskunde og opret-tilbud har et navn. Søgningen bliver. | DONE — `customer-search-label-test` |
| Tilbuds-parter og leveringskunde siger når søgningen fejler. En anden søgnings rækker vises ikke. | DONE — `party-search-load-test` |
| Sagspartnere siger når søgningen fejler. En anden søgnings rækker vises ikke. | DONE — `case-party-search-test` |
| Leveringskontakter siger når hentningen fejler. En anden sags kontakter vises ikke. | DONE — `site-contacts-load-test` |
| Tagtegninger viser ikke en anden kundes billeder når hentningen fejler. Paneltallet bliver. | DONE — `roof-drawing-stale-test` |
| Portalen viser ikke et andet tokens besigtigelser når hentningen fejler. Bekræft bliver. | DONE — `portal-besigtigelse-stale-test` |
| Hurtiganalysen viser ikke det forrige projekts tal for en anden tekst. 450/25/5 bliver. | DONE — `ai-quick-stale-test` |
| Seneste analyser bliver synlige når samme hentning fejler. Prisen bliver. | DONE — `ai-history-keep-test` |
| Leverandørfakturaer viser ikke et andet filters rækker når hentningen fejler. Beløbet bliver. | DONE — `incoming-invoice-filter-stale-test` |
| Kalenderens tæller siger ikke 0 arbejdsordrer når hentningen fejler. Jobkortet bliver. | DONE — `calendar-count-load-test` |
| Sagsøkonomi siger fejl, og faktureringsfilteret bliver ikke en tom sagsliste. Beløbet bliver. | DONE — `orders-economy-load-test` |
| Portefølje-widgetten siger at en fejl ikke er 0 kr udestående. Den grønne tomme tekst og beløbet bliver. | DONE — `portfolio-load-test` |
| Fakturaopfølgning siger at en fejl ikke er 0 sager. Den grønne tomme tekst og tællerne bliver. | DONE — `billing-followup-load-test` |
| Indkøbsdrift siger at en fejl ikke er 0 sager. Den grønne tomme tekst og tællerne bliver. | DONE — `purchase-ops-widget-load-test` |
| Sagens projektøkonomi siger at en fejl ikke er 0 kr. Beløbene og kontraktsum-teksten bliver. | DONE — `project-economy-load-test` |
| Ukonverterede leverandørlinjer siger at en fejl ikke er 0 linjer. Den grønne tomme tekst og beløbet bliver. | DONE — `unconverted-lines-load-test` |
| Indkøbskortet siger at en fejl ikke er 0 kr. Den tomme tekst og beløbene bliver. | DONE — `purchase-summary-load-test` |
| Indkøbsdrift-siden siger at en fejl ikke er 0 sager. De tomme tekster og beløbet bliver. | DONE — `purchase-ops-page-load-test` |
| Regnskabsstatus siger at en fejl ikke er at e-conomic mangler, og ikke er 0. Ikke-opsat og den grønne tekst bliver. | DONE — `accounting-health-fetch-test` |
| Sagens økonomifane siger at en fejl ikke er 0 kr. Formlerne og leverandørlisten bliver. | DONE — `case-economy-load-test` |
| Konverteringsvisningens tomme fejl siger at linjerne ikke er 0. Kun-total og action-teksten bliver. | DONE — `conversion-preview-fallback-test` |
| Fakturakladden siger at en fejl ikke er 0 poster. Den ægte tomme tekst bliver. | DONE — `billing-unbilled-load-test` |
| Rate- og slutfakturakladden siger at en fejl ikke er 0 kr. Fradraget og den gule tekst bliver. | DONE — `billing-stage-load-test` |
| Udvidede leverandørfakturaer siger at en fejl ikke er 0 linjer. Den grønne tomme tekst bliver. | DONE — `purchase-ops-expand-load-test` |
| Forfalds-widgettens tomme fejl siger at beløbet ikke er 0 kr. Den grønne tekst og action-teksten bliver. | DONE — `incoming-due-fallback-test` |
| Det operationelle overblik viser ikke "ingen forfaldne" når første hentning fejler. De tidligere tal og de ægte tomme tekster bliver. | DONE — `ops-overview-load-test` |
| Leverandøroversigten siger at en fejl ikke er 0 leverandører. Den grønne tekst bliver. | DONE — `supplier-health-load-test` |
| Leverandørkortet siger at en manglende status ikke er offline. Et ægte offline-badge bliver. | DONE — `supplier-status-load-test` |
| En fejlet mail-sync er ikke "aldrig" og ikke 0. Indbakken hentes stadig. | DONE — `mail-sync-load-test` |
| En fejlet postkasseliste er ikke "ingen postkasser". Indbakken hentes stadig. | DONE — `mail-mailboxes-load-test` |
| En fejlet mailtælling er ikke 0 mails. Indbakken og leverandørerne hentes stadig. | DONE — `mail-stats-load-test` |
| En fejlet mailstatistik er ikke 0 sendte. Den ægte tomme periode bliver. | DONE — `email-stats-load-test` |
| Mailstatistikken henter alle mails, ikke kun de første 1.000. Formlerne og fejl-kastet bliver. | DONE — `email-stats-load-test` |
| Leadkortet på mobil viser kilde, sandsynlighed og ansvarlig. Status skiftes ikke ved et tryk. | DONE — `leads-mobile-meta-test` |
| Sagskortet på mobil viser reference, rekvirent, ansvarlig og formand. Beløb og fakturerings-gate bliver. | DONE — `orders-mobile-meta-test` |
| Kundekortet på mobil viser CVR, når det findes. Mail og kundenummer bliver. | DONE — `customers-mobile-cvr-test` |
| Fakturaens PDF-ikoner har et navn, og mobilkortet viser regnskabs-id. Beløb og påmindelse bliver. | DONE — `invoices-mobile-name-test` |
| Bilagsknappen på leverandørfakturaen ombryder filnavn og hjælpetekst. Linjebeløb og åbn bliver. | DONE — `incoming-invoice-file-wrap-test` |
| Medarbejderkortet ombryder navn, nummer og rolle. Løn og mail bliver. | DONE — `employees-mobile-role-test` |
| Tilbuddets lead-kontakt ombrydes. Linket bliver. | DONE — `offer-lead-contact-wrap-test` |
| En fejlet lead-læsning er ikke ingen leads. Indbakken bliver. | DONE — `mail-leads-load-test` |
| Efterkalkulationens beløb ombrydes i mobilkortet. Tallene bliver. | DONE — `aftercalc-money-wrap-test` |
| Sagsrentabilitetens beløb ombrydes i mobilkortet. Formlerne bliver. | DONE — `report-profit-money-wrap-test` |
| Salgstragtens beløb ombrydes i mobilkortet. 0-som-manglende og monthLabel bliver. | DONE — `sales-funnel-money-wrap-test` |
| Øvrige omkostningers beløb ombrydes i mobilkortet. Kost-gate og formler bliver. | DONE — `other-costs-money-wrap-test` |
| Timerkortets kost, salg og DB ombrydes. Gates og fmtAmount bliver. | DONE — `time-log-money-wrap-test` |
| Rapportens nøgletal kan krympe, og beløbet ombrydes. Label og formler bliver. | DONE — `report-kpi-wrap-test` |
| Indkøbsdriftens summering kan krympe, og beløbet ombrydes. kr() og canAmt bliver. | DONE — `purchase-ops-summary-wrap-test` |
| Medarbejderøkonomiens nøgletal og navn ombrydes. Formler og kost-gate bliver. | DONE — `employee-economy-wrap-test` |
| Projektets timer og budget ombrydes i kortet. Gates og procent bliver. | DONE — `project-budget-wrap-test` |
| Systemstatus kan krympe. Danske etiketter og tællinger bliver. | DONE — `system-status-wrap-test` |
| En fejl i AI-anbefalinger er ikke ingen anbefalinger. Den ægte tomme tekst bliver. | DONE — `ai-insights-load-test` |
| AI-anbefalingens detalje ombrydes. Farver og den tomme tekst bliver. | DONE — `ai-insights-detail-wrap-test` |
| En fejlet banklæsning er ikke manglende bank. Tilladelsen og advarslen bliver. | DONE — `bank-status-load-test` |
| Tilbudt vs. faktisk ombryder kostlinjer. kr() og Kan ikke beregnes bliver. | DONE — `offer-vs-actual-wrap-test` |
| En fejlet forvalgt kunde er ikke ingen kunde. Et ægte tomt opslag bliver. | DONE — `customer-picker-selected-load-test` |
| En fejlet lead-dubletsoegning er ikke ingen match. Et aegte tomt resultat bliver. | DONE — `lead-candidates-load-test` |
| En fejlet laesning kobler ikke leadet og er ikke "ikke fundet". Et aegte tomt opslag bliver. | DONE — `lead-link-read-test` |
| En fejlet faktureringsstatus er ikke intet at fakturere. Status og beloeb bliver. | DONE — `billing-status-load-test` |
| En fejlet revisionskaede er ikke ingen revisioner. Flag-tomheden bliver. | DONE — `offer-revisions-load-test` |
| En fejlet projektokonomi er ikke 0 kr. Rest-formlen bliver. | DONE — `project-economy-load-test` |
| En fejlet laesning af afsluttede sager er ikke 0 fakturahandlinger. Taellere bliver. | DONE — `billing-followup-closed-test` |
| En fejlet indkoebslaesning er ikke 0 kr. Summer og budget-raekkefoelge bliver. | DONE — `purchase-summary-query-test` |
| Revisionslisten ombryder nummer, status og afloest-tekst. Opret bliver. | DONE — `offer-revisions-wrap-test` |
| Projektokonomiens beloeb ombrydes. kr() og fejlteksten bliver. | DONE — `project-economy-wrap-test` |
| Indkoebskortets beloeb ombrydes. kr() og den tomme tekst bliver. | DONE — `purchase-summary-amount-wrap-test` |
| Faktureringsstatusens tekst ombrydes. Status-tekster og kr() bliver. | DONE — `billing-status-wrap-test` |
| En fejlet udstyrs- eller certifikatliste er ikke tom. Opret bliver. | DONE — `employee-gear-load-test` |
| Leverandoer- og fakturabeloeb paa indkoebskortet ombrydes. Loftet bliver. | DONE — `purchase-summary-line-wrap-test` |
| En fejlet statuslaesning omplanlaegger ikke og er ikke ikke-fundet. Vaernet bliver. | DONE — `work-order-replan-read-test` |
| En fejlet statuslaesning skifter ikke status og er ikke ikke-fundet. Timer-vaernet bliver. | DONE — `work-order-status-read-test` |
| Konverteringspreviewets hovedtal ombrydes. kr() og fejlteksterne bliver. | DONE — `conversion-preview-header-wrap-test` |
| Godkendelsespreviewets beloeb kan krympe. fmtAmount bliver. | DONE — `approve-header-wrap-test` |
| Godkendelsespreviewets sagstitel og kundenavn ombrydes. Link og match-knap bliver. | DONE — `approve-case-wrap-test` |
| Leverandoerfakturaens totalbeloeb kan krympe. fmtAmount og slet-teksten bliver. | DONE — `incoming-header-amount-wrap-test` |
| Fakturakontrollens overpris og daekning kan krympe. kr() og 0-kr-saetningen bliver. | DONE — `invoice-control-summary-wrap-test` |
| Fakturaokonomiens forfald og haendelser ombryder beloeb. kr() og den tomme tekst bliver. | DONE — `invoice-economy-amount-wrap-test` |
| Fakturaokonomiens noeglekort ombryder beloeb. kr() og links bliver. | DONE — `invoice-economy-card-wrap-test` |
| Kundens fakturanoegletal og mobilbeloeb ombrydes. kr() og den tomme liste bliver. | DONE — `customer-invoice-summary-wrap-test` |
| Kundens fakturahaendelse ombryder beloeb. kr() og handlingen bliver. | DONE — `customer-invoice-event-wrap-test` |
| Afviste tilbuds beloeb ombrydes. formatCurrency og den tomme tekst bliver. | DONE — `rejection-amount-wrap-test` |
| Materialebindets kostpris ombrydes. formatCurrency og Bind bliver. | DONE — `materials-bind-amount-wrap-test` |
| Grossistsoegningens kost og salg ombrydes. toLocaleString og billigste bliver. | DONE — `supplier-search-amount-wrap-test` |
| Tilbuddets grossistresultat ombryder netto og salg. formatCurrency og billigste bliver. | DONE — `offer-supplier-amount-wrap-test` |
| Mailens produktsogning ombryder netto og salg. formatCurrency og live-maerket bliver. | DONE — `quote-search-amount-wrap-test` |
| Laeringsloggens vaerdier ombrydes. old_value, new_value og koebenhavn-datoen bliver. | DONE — `learning-adjustment-wrap-test` |
| Fakturaoverblikkets noeglekort og mobilbeloeb ombrydes. kr() og summerne bliver. | DONE — `invoices-overview-summary-wrap-test` |
| Sagsfakturaens mobilkort ombryder nummer, kunde og beloeb. kr() og inkl. moms bliver. | DONE — `case-invoices-amount-wrap-test` |
| Stage-fakturaens subtotal og total ombrydes. fmtKr, procent og status bliver. | DONE — `stage-invoices-amount-wrap-test` |
| Rapportens topkunder ombryder omsaetning. formatCurrency og acceptprocenten bliver. | DONE — `report-customers-amount-wrap-test` |
| Prisadvarslens gamle og nye pris ombrydes. formatCurrency og graenserne bliver. | DONE — `price-alerts-amount-wrap-test` |
| Rumkalkulatorens slutpris, salgspris, DB og noeglekort ombrydes. formatCurrency bliver. | DONE — `room-scenarios-amount-wrap-test` |
| Rumkalkulatorens kabelbeloeb ombrydes. shrink-0 er vaek og formatCurrency bliver. | DONE — `room-cables-amount-wrap-test` |
| Tilbuddets subtotal, rabat, moms og total ombrydes. formatCurrency bliver. | DONE — `offer-totals-amount-wrap-test` |
| Tilbudslinjens mobilbeloeb ombrydes. formatCurrency bliver. | DONE — `offer-lines-amount-wrap-test` |
| Portaltilbuddets linjer og totaler ombrydes. formatCurrency bliver. | DONE — `portal-offer-amount-wrap-test` |
| Cockpittets ufakturerede beloeb og forfald ombrydes. kr() bliver. | DONE — `cockpit-amount-wrap-test` |
| Fakturalinjens mobilbeloeb og totaler ombrydes. fmtKr bliver, og headerens shrink-0 bliver. | DONE — `invoice-lines-amount-wrap-test` |
| Kladdefakturaens linjebeloeb ombrydes. fmt() og handlingerne bliver. | DONE — `draft-lines-amount-wrap-test` |
| Sagsfakturakladdens tid, materialer og oevrige poster ombryder totalen. fmtKr bliver. | DONE — `billing-draft-amount-wrap-test` |
| AI-projektets komponentbeloeb ombrydes. formatCurrency bliver. | DONE — `ai-components-amount-wrap-test` |
| Paavirkede tilbuds beloeb og tab ombrydes. formatCurrency bliver, og filen er uden truncate. | DONE — `price-offers-amount-wrap-test` |
| Pristendensens nuvaerende pris ombrydes. formatCurrency bliver, og filen er uden truncate. | DONE — `price-trends-amount-wrap-test` |
| Kreditnotaens linjebeloeb ombrydes. fmtKr og fortegnet bliver. | DONE — `credit-lines-amount-wrap-test` |
| Laaste tilbudslinjers beloeb ombrydes. formatCurrency og kost-gaten bliver. | DONE — `line-items-amount-wrap-test` |
| Rumopdelingens materialekost og total ombrydes. formatCurrency bliver. | DONE — `room-breakdown-amount-wrap-test` |
| Rumkalkulatorens tid- og materialesammendrag ombryder beloeb. formatCurrency bliver. | DONE — `room-summary-amount-wrap-test` |
| AI-projektets prisopbygning ombryder beloeb. formatCurrency og timeformlerne bliver. | DONE — `ai-price-amount-wrap-test` |
| Hurtigkalkulationens opsummering og endelige oversigt ombryder beloeb. formatCurrency og momsformlen bliver. | DONE — `quick-summary-amount-wrap-test` |
| Kalkulationens timepris og kundenavn ombrydes. formatCurrency og fallback-satsen bliver. | DONE — `calc-detail-amount-wrap-test` |
| Sagens DB, budget, hero-kort og opdeling ombrydes. fmtKr og DB-formlen bliver. | DONE — `case-economy-amount-wrap-test` |
| AI-projektets bygningsinformation ombrydes. Vaerdierne bliver. | DONE — `ai-building-wrap-test` |
| Kalkulationens tilstand, type og materialemarkup ombrydes. Markup-formlen bliver. | DONE — `calc-detail-amount-wrap-test` |
| Produktets listepris, kostpris og kategori ombrydes. formatCurrency og avanceformlen bliver. | DONE — `product-price-amount-wrap-test` |
| Pakkens kost, salg og DB ombrydes. calculateFinancialSummary og taersklerne bliver. | DONE — `package-summary-amount-wrap-test` |
| Pakkelistens kost, salg og DB ombrydes. 0-kost og taersklerne bliver. | DONE — `package-list-amount-wrap-test` |
| Tilbudsmailens linjer og totaler ombrydes. Formler, rabattegn og accent-klasse bliver. | DONE — `quote-preview-amount-wrap-test` |

AGENT: GROK
BRANCH: grok-next
LAST_COMMIT: 80ab0dab tilbudsmail (start paa skift 2026-10-18; forrige tekst pegede paa 926ccb1f)
TESTS: inspection-list-test, offer-product-name-test, title-wrap-test, close-button-label-test, case-notes-empty-test, customer-notes-empty-test, messages-empty-test, invoices-empty-search-test, aftercalc-empty-filter-test, calendar-mobile-test, reports-empty-test, reports-mobile-test, sync-jobs-mobile-test, activity-empty-test, missing-date-test, inspection-calendar-test, tasks-filter-mobile-test, suppliers-list-mobile-test, document-name-test, case-assignee-test, products-empty-search-test, customer-pricing-mobile-test, sales-funnel-mobile-test, mail-empty-search-test, products-mobile-test, rejection-mobile-test, incoming-invoice-lines-mobile-test, dashboard-empty-stats-test, line-items-empty-test, lead-next-hint-test, customer-tasks-empty-test, invoice-charge-label-test, offer-profit-missing-cost-test, supplier-products-mobile-test, time-logs-mobile-test, pricing-name-wrap-test, margin-rules-mobile-test, password-toggle-label-test, roof-empty-mobile-test, purchase-summary-mobile-test, case-cost-dialog-mobile-test, calculator-results-mobile-test, supplier-products-mobile-test, calculation-form-mobile-test, three-col-cards-mobile-test, project-economy-mobile-test, time-logs-mobile-test, unconverted-lines-mobile-test, activity-empty-test, portal-access-mobile-test, incoming-invoices-mobile-test, chat-attachment-wrap-test, planning-backlog-mobile-test, planning-replan-mobile-test, cockpit-wrap-test, aftercalc-overview-mobile-test, incoming-invoices-mobile-test, order-tasks-mobile-test, calendar-mobile-test, inspection-calendar-test, document-name-test, offers-actions-mobile-test, case-notes-empty-test, employees-mobile-test, portal-identity-wrap-test, invoices-mobile-test, products-mobile-test, missing-date-test, lead-attachment-wrap-test, supplier-api-search-mobile-test, customer-contact-wrap-test, calendar-mobile-test, economy-lines-mobile-test, economy-lines-empty-test, tasks-filter-mobile-test, tasks-mobile-card-test, economy-lines-empty-test, economy-lines-mobile-test, time-logs-mobile-test, incoming-invoices-mobile-test, mail-empty-search-test, mail-row-wrap-test, reports-empty-test, dashboard-overview-mobile-test, icon-button-label-test, roof-drawing-field-test, roof-empty-mobile-test, chat-composer-label-test, chat-attachment-wrap-test, portal-sign-label-test, portal-identity-wrap-test, incoming-invoice-audit-label-test, incoming-invoices-mobile-test, invoice-control-wrap-test, header-totals-test, offer-profit-wrap-test, offer-profit-missing-cost-test, planning-time-zone-test, planning-replan-mobile-test, title-wrap-test, agent-inbox-time-test, agent-inbox-ux-test, customer-cases-empty-test, customer-mail-time-test, customer-mail-wrap-test, customer-task-due-test, missing-date-test, copenhagen-time-test, document-name-test, portal-identity-wrap-test, customer-stamp-time-test, customer-contact-wrap-test, lead-stamp-time-test, lead-attachment-wrap-test, activity-empty-test, lead-next-hint-test, offer-stamp-time-test, offer-product-name-test, offer-warning-mobile-test, case-stamp-time-test, case-mail-wrap-test, handover-photo-delete-test, reminder-stamp-time-test, missing-date-test, icon-button-label-test, customer-stamp-time-test, message-stamp-time-test, message-thread-wrap-test, activity-stamp-time-test, activity-empty-test, copenhagen-time-test, record-stamp-time-test, profile-avatar-mobile-test, password-toggle-label-test, invoice-export-time-test, case-doc-date-test, document-name-test, smart-date-zone-test, format-dk-test, offer-activity-time-test, activity-empty-test, accounting-health-time-test, case-activity-time-test, case-activity-wrap-test, sync-log-time-test, case-note-time-test, case-notes-empty-test, invoice-economy-time-test, dashboard-widget-wrap-test, payment-report-time-test, payment-report-wrap-test, case-invoice-history-time-test, export-error-time-test, economic-settings-time-test, supplier-sync-time-test, case-stamp-long-time-test, case-field-wrap-test, case-assignee-test, time-log-clock-test, time-logs-mobile-test, staff-clock-test, team-name-wrap-test, chat-clock-test, chat-composer-label-test, chat-attachment-wrap-test, mail-clock-test, mail-row-wrap-test, mail-empty-search-test, confirmation-clock-test, ai-project-time-test, offer-text-date-test, leads-kanban-mobile-test, tasks-mobile-card-test, customers-list-mobile-test, products-mobile-test, time-logs-mobile-test, time-log-clock-test, packages-button-name-test, margin-rules-mobile-test, customer-pricing-mobile-test, close-button-label-test, customer-pricing-mobile-test, work-order-dialog-mobile-test, case-picker-empty-test, book-besigtigelse-label-test, close-button-label-test, aftercalc-overview-mobile-test, aftercalc-empty-filter-test, incoming-invoices-mobile-test, incoming-invoice-lines-mobile-test, incoming-invoice-audit-label-test, case-create-label-test, icon-button-label-test, close-button-label-test, customer-create-label-test, contact-form-mobile-test, quote-form-label-test, close-button-label-test, product-form-mobile-test, credit-note-label-test, supplier-form-mobile-test, employee-rate-mobile-test, missing-date-test, calculation-row-name-test, calculation-actions-name-test, component-detail-name-test, incoming-invoice-duplicate-badge-test, offer-supplier-search-test, employee-created-time-test, mail-list-date-test, customer-flow-time-test, project-activity-time-test, learning-adjustment-time-test, aftercalc-variance-text-test, aftercalc-line-variance-test, invoice-line-conversion-text-test, approve-category-text-test, calendar-filter-empty-test, offer-vs-actual-variance-test, offer-month-label-test, customer-inbox-empty-test, lead-move-name-test, order-tasks-mobile-test, calendar-nav-label-test, invoice-list-missing-test, report-profit-variance-test, reminder-action-name-test, product-search-label-test, calculation-filter-label-test, package-search-label-test, case-toggle-name-test, time-log-form-touch-test, purchase-filter-label-test, offer-month-label-test, sales-funnel-error-test, mail-toolbar-wrap-test, case-picker-cap-test, case-picker-empty-test, inspection-upcoming-test, inspection-calendar-test, calendar-agenda-test, case-mail-load-test, case-mail-wrap-test, case-stamp-time-test, activity-load-note-test, activity-empty-test, activity-stamp-time-test, customer-inbox-load-test, customer-inbox-empty-test, planning-load-view-test, planning-replan-mobile-test, planning-time-zone-test, case-tab-load-throw-test, case-notes-empty-test, case-note-time-test, materials-mobile-test, other-costs-mobile-test, time-approval-load-test, time-approval-mobile-test, employee-tab-load-test, employees-mobile-test, offer-case-preview-test, offer-case-wrap-test, aftercalc-load-throw-test, aftercalc-line-variance-test, offer-vs-actual-variance-test, invoice-control-load-test, invoice-control-wrap-test, offer-price-load-test, offer-party-wrap-test, portal-besigtigelse-load-test, overtime-seed-guard-test, task-customer-load-test, tasks-filter-mobile-test, tasks-mobile-card-test, order-offer-load-test, calc-customer-load-test, calculation-form-mobile-test, my-jobs-load-test, my-jobs-mobile-test, roof-load-test, roof-title-wrap-test, roof-empty-mobile-test, pricing-load-test, pricing-name-wrap-test, ai-history-load-test, ai-project-desc-test, ai-project-time-test, calendar-panel-load-test, planning-backlog-mobile-test, employee-profile-load-test, staff-clock-test, team-load-test, employee-select-load-test, planning-load-view-test, order-offer-load-test, time-logs-mobile-test, package-load-test, packages-button-name-test, case-history-load-test, case-tab-load-throw-test, case-activity-time-test, case-notes-empty-test, customer-documents-load-test, customer-documents-wrap-test, report-team-load-test, reports-empty-test, reports-mobile-test, sales-funnel-error-test, report-section-load-test, report-profit-variance-test, report-revenue-load-test, report-rejection-load-test, rejection-mobile-test, dashboard-rejections-load-test, my-day-load-test, my-day-test, pending-offers-load-test, dashboard-widget-wrap-test, recent-activity-load-test, dashboard-stats-load-test, dashboard-empty-stats-test, monthly-offer-load-test, offer-month-label-test, task-count-load-test, my-day-load-test, cockpit-load-test, cockpit-wrap-test, cockpit-rest-load-test, case-documents-load-test, case-doc-date-test, document-name-test, tasks-list-load-test, calendar-agenda-test, tasks-filter-mobile-test, tasks-mobile-card-test, case-tasks-load-test, order-tasks-mobile-test, customer-tasks-empty-test, customer-tasks-load-test, incoming-invoices-load-test, incoming-invoices-mobile-test, invoice-list-missing-test, bank-tx-load-test, bank-mobile-test, reminder-load-test, reminder-action-name-test, reminder-stamp-time-test, icon-button-label-test, materials-admin-load-test, materials-bind-name-test, case-tab-load-throw-test, materials-mobile-test, other-costs-mobile-test, stage-invoices-load-test, billing-draft-desc-test, case-history-load-test, case-tab-load-throw-test, case-notes-empty-test, case-note-time-test, case-activity-time-test, case-activity-wrap-test, case-mail-load-test, case-mail-wrap-test, pricing-load-test, pricing-name-wrap-test, case-tasks-load-test, order-tasks-mobile-test, offer-followup-load-test, offer-followup-mobile-test, offer-followup-test, case-invoices-load-test, case-invoices-mobile-test, case-invoice-history-time-test, supplier-products-load-test, supplier-products-mobile-test, confirmation-load-test, confirmation-clock-test, recipient-wrap-test, incoming-invoice-sender-test, incoming-invoices-load-test, sender-domain-test, customer-inbox-keep-test, customer-inbox-load-test, customer-inbox-empty-test, customer-mail-wrap-test, customer-mail-time-test, customer-cases-load-test, customer-cases-empty-test, title-wrap-test, mail-clock-test, quote-product-search-test, quote-lines-mobile-test, mail-name-wrap-test, report-cases-load-test, profitability-figures-test, report-profit-variance-test, jobs-without-time-load-test, calendar-panel-load-test, planning-backlog-mobile-test, rejection-names-load-test, dashboard-rejections-load-test, rejection-mobile-test, cockpit-secondary-load-test, cockpit-load-test, cockpit-wrap-test, report-summary-load-test, report-revenue-load-test, planning-count-load-test, agent-planning-test, offer-conversion-load-test, dashboard-widget-wrap-test, customer-origin-count-test, customers-list-mobile-test, handover-count-load-test, pilot-setup-load-test, golive-count-load-test, invoice-control-query-test, invoice-control-load-test, header-totals-test, price-at-date-test, packages-count-load-test, packages-list-mobile-test, package-load-test, quote-history-load-test, quote-form-label-test, kalkia-node-count-test, work-order-timer-count-test, materials-bind-search-test, materials-bind-name-test, materials-admin-load-test, stage-gate-load-test, stage-invoices-load-test, stage-net-test, materials-admin-mobile-test, materials-bind-name-test, materials-admin-load-test, cockpit-load-test, cockpit-secondary-load-test, cockpit-rest-load-test, work-order-employee-load-test, planning-load-view-test, employee-select-load-test, work-order-employee-check-test, planning-replan-mobile-test, customer-payment-count-test, customer-origin-count-test, customer-unlinked-count-test, customer-inbox-keep-test, customer-inbox-load-test, customer-unlinked-link-test, work-order-delete-count-test, work-order-timer-count-test, task-profiles-load-test, tasks-list-load-test, customer-tasks-load-test, employee-list-load-test, employees-mobile-test, employee-detail-load-test, offer-profit-load-test, offer-profit-wrap-test, offer-profit-missing-cost-test, offer-savings-load-test, incoming-due-load-test, dashboard-widget-wrap-test, aftercalc-assignees-load-test, aftercalc-empty-filter-test, aftercalc-overview-mobile-test, aftercalc-test, invoice-supplier-options-test, invoice-supplier-sender-test, invoice-supplier-options-test, invoice-supplier-domain-count-test, invoice-supplier-sender-test, invoice-supplier-options-test, invoice-supplier-read-test, invoice-supplier-options-test, invoice-supplier-sender-test, invoice-supplier-domain-count-test, invoice-supplier-exists-test, invoice-supplier-read-test, invoice-file-url-test, incoming-due-load-test, conversion-preview-load-test, conversion-preview-mobile-test, invoice-file-url-test, conversion-preview-case-test, conversion-preview-load-test, conversion-preview-mobile-test, conversion-preview-supplier-test, conversion-preview-case-test, conversion-preview-load-test, conversion-preview-mobile-test, invoice-header-read-test, invoice-case-match-read-test, invoice-header-read-test, invoice-repost-read-test, invoice-case-match-read-test, invoice-test-delete-test, invoice-repost-read-test, invoice-detail-lines-test, incoming-invoice-lines-mobile-test, invoice-detail-related-test, invoice-detail-lines-test, incoming-invoice-lines-mobile-test, invoice-detail-names-test, invoice-detail-related-test, invoice-list-senders-test, incoming-invoices-load-test, incoming-invoice-sender-test, pilot-health-agent-count-test, followup-shadow-test, pilot-health-integration-test, pilot-health-agent-count-test, followup-shadow-test, pilot-health-followup-settings-test, followup-shadow-test, calendar-relations-test, calendar-mobile-test, my-jobs-load-test, my-jobs-mobile-test, offer-search-customer-test, lead-convert-read-test, lead-attachment-read-test, lead-convert-read-test, besigtigelse-book-read-test, task-write-read-test, task-assignee-names-test, calendar-month-names-test, planning-backlog-employees-test, case-note-authors-test, case-note-write-read-test, offer-fill-cost-read-test, offer-profit-read-test, customer-doc-download-read-test, customer-image-url-test, customer-doc-share-read-test, case-doc-upload-read-test, lead-write-read-test, lead-activity-load-test, portal-tokens-load-test, portal-lists-load-test, portal-chat-load-test, portal-fuldmagt-load-test, portal-offer-load-test, invoice-detail-load-test, invoice-detail-parties-test, products-load-test, calculations-load-test, calculation-filter-label-test, calculation-actions-name-test, offer-calculations-load-test, offer-product-name-test, offer-supplier-search-test, offer-products-load-test, offer-calculations-load-test, offer-product-name-test, components-load-test, components-list-mobile-test, offer-activities-load-test, activity-empty-test, offer-activity-time-test, kalkia-nodes-load-test, kalkia-node-count-test, audit-load-test, audit-name-wrap-test, order-party-load-test, employee-select-load-test, order-offer-load-test, order-edit-load-test, order-party-load-test, order-planned-count-test, quick-calc-load-test, calculation-actions-name-test, offer-texts-load-test, room-types-load-test, materials-catalog-load-test, building-profiles-load-test, global-factors-load-test, customer-picker-search-test, customer-picker-name-test, customer-link-search-test, customer-link-name-test, charger-search-test, case-picker-load-test, icon-button-label-test, picker-catalog-load-test, category-select-load-test, products-load-test, detail-read-load-test, entity-read-load-test, variant-materials-load-test, component-detail-name-test, kalkia-node-detail-load-test, economic-ready-load-test, invoice-overview-economic-load-test, invoice-accounting-ready-load-test, sync-log-load-test, sync-log-time-test, accounting-health-load-test, accounting-health-time-test, supplier-economic-ready-load-test, supplier-economic-preview-mobile-test, invoice-preview-load-test, payment-preview-load-test, economic-preview-mobile-test, payment-preview-mobile-test, offer-lines-mobile-test, offer-warning-mobile-test, stage-invoices-mobile-test, stage-invoices-load-test, predecessor-invoices-mobile-test, billing-time-mobile-test, billing-draft-desc-test, billing-materials-mobile-test, billing-other-mobile-test, draft-lines-mobile-test, invoice-detail-lines-mobile-test, invoice-lines-empty-test, invoice-predecessors-mobile-test, invoice-credits-mobile-test, credit-lines-mobile-test, credit-note-label-test, ai-components-mobile-test, golive-rules-mobile-test, golive-count-load-test, room-cables-mobile-test, room-scenarios-mobile-test, learning-calibrations-mobile-test, price-alerts-mobile-test, pricing-name-wrap-test, price-offers-mobile-test, price-trends-mobile-test, pricing-name-wrap-test, audit-changes-mobile-test, audit-load-test, audit-name-wrap-test, offer-savings-mobile-test, offer-savings-load-test, portal-offer-lines-mobile-test, projects-mobile-test, projects-name-wrap-test, employee-rates-mobile-test, employee-profile-load-test, staff-clock-test, savings-years-mobile-test, sync-log-mobile-test, sync-log-load-test, sync-log-time-test, customer-import-mobile-test, customer-import-name-test, line-items-mobile-test, line-items-empty-test, offer-db-shadow-test, overtime-editor-mobile-test, overtime-seed-guard-test, offer-preview-mobile-test, offer-lines-mobile-test, offer-party-wrap-test, record-title-wrap-test, customer-contact-wrap-test, invoice-header-mobile-test, invoice-detail-lines-mobile-test, invoice-lines-empty-test, invoice-detail-load-test, incoming-header-mobile-test, incoming-invoice-lines-mobile-test, invoice-test-delete-test, plan-dialog-mobile-test, case-picker-empty-test, case-picker-cap-test, dialog-scroll-mobile-test, contact-form-mobile-test, icon-button-label-test, work-order-dialog-mobile-test, work-order-employee-check-test, planning-replan-mobile-test, save-template-mobile-test, template-delete-mobile-test, invoice-case-picker-mobile-test, case-picker-empty-test, case-picker-cap-test, tasks-filter-mobile-test, task-customer-load-test, tasks-mobile-card-test, customer-task-dialog-mobile-test, customer-task-due-test, task-form-mobile-test, close-button-label-test, customer-tasks-empty-test, offer-task-dialog-mobile-test, task-form-mobile-test, task-profiles-load-test, close-button-label-test, ai-customer-modal-mobile-test, ai-history-load-test, ai-project-desc-test, ai-project-time-test, confirm-dialog-mobile-test, package-create-mobile-test, category-select-load-test, aftercalc-overview-mobile-test, aftercalc-empty-filter-test, audit-filter-mobile-test, audit-load-test, audit-name-wrap-test, invoice-header-edit-mobile-test, invoice-header-read-test, invoice-header-edit-test, personal-reminder-mobile-test, missing-date-test, reminder-action-name-test, new-order-date-mobile-test, employee-select-load-test, order-party-load-test, order-offer-load-test, edit-order-date-mobile-test, employee-select-load-test, order-party-load-test, order-offer-load-test, planning-date-mobile-test, planning-replan-mobile-test, planning-load-view-test, planning-time-zone-test, employee-select-load-test, work-order-employee-load-test, work-order-delete-count-test, title-wrap-test, supplier-options-load-test, kalkia-node-name-test, icon-button-label-test, supplier-search-load-test, supplier-search-name-test, offer-supplier-search-load-test, offer-supplier-search-test, customer-price-lookup-test, customer-pricing-mobile-test, package-picker-load-test, packages-count-load-test, time-log-date-mobile-test, time-logs-mobile-test, time-log-form-touch-test, time-log-clock-test, other-cost-date-mobile-test, case-cost-dialog-mobile-test, employee-date-mobile-test, employee-edit-date-mobile-test, employee-rate-mobile-test, lead-date-mobile-test, lead-write-read-test, offer-date-mobile-test, report-cases-cap-test, report-profit-variance-test, reports-empty-test, reports-mobile-test, report-cases-load-test, my-hours-cap-test, my-hours-wrap-test, purchase-summary-cap-test, purchase-summary-mobile-test, case-supplier-name-wrap-test, unconverted-invoices-cap-test, unconverted-lines-mobile-test, case-supplier-name-wrap-test, sync-history-cap-test, sync-jobs-mobile-test, quick-room-types-test, quick-calc-load-test, room-type-grid-test, room-name-wrap-test, calendar-day-free-test, calendar-mobile-test, calendar-week-free-test, calendar-day-free-test, calendar-mobile-test, orders-billing-empty-test, employees-status-empty-test, employees-mobile-test, employee-list-load-test, invoices-acc-empty-test, invoices-empty-search-test, invoices-mobile-test, search-field-label-test, suppliers-list-mobile-test, global-search-wrap-test, supplier-products-mobile-test, customers-list-mobile-test, picker-search-label-test, package-picker-load-test, catalog-search-label-test, customer-search-label-test, customer-link-search-test, calc-customer-load-test, party-search-load-test, case-party-search-test, site-contacts-load-test, party-search-load-test, roof-drawing-stale-test, roof-load-test, portal-besigtigelse-stale-test, portal-besigtigelse-load-test, ai-quick-stale-test, ai-history-keep-test, ai-history-load-test, incoming-invoice-filter-stale-test, incoming-invoices-load-test, invoice-list-senders-test, calendar-count-load-test, calendar-relations-test, orders-economy-load-test, orders-billing-empty-test, portfolio-load-test, dashboard-widget-wrap-test, billing-followup-load-test, purchase-ops-widget-load-test, project-economy-load-test, project-economy-mobile-test, unconverted-lines-load-test, unconverted-lines-mobile-test, purchase-summary-load-test, purchase-summary-mobile-test, purchase-ops-page-load-test, purchase-ops-mobile-test, accounting-health-fetch-test, accounting-health-load-test, case-economy-load-test, case-supplier-invoices-mobile-test, conversion-preview-fallback-test, conversion-preview-load-test, billing-unbilled-load-test, billing-time-mobile-test, billing-stage-load-test, stage-net-test, purchase-ops-expand-load-test, purchase-ops-mobile-test, incoming-due-fallback-test, incoming-due-load-test, ops-overview-load-test, dashboard-overview-mobile-test, supplier-health-load-test, sync-jobs-mobile-test, supplier-status-load-test, mail-sync-load-test, supplier-health-load-test, sync-jobs-mobile-test, mail-mailboxes-load-test, mail-sync-load-test, mail-stats-load-test, mail-mailboxes-load-test, mail-sync-load-test, supplier-health-load-test, sync-jobs-mobile-test, email-stats-load-test, email-stats-load-test, leads-mobile-meta-test, leads-list-mobile-test, mobile-lists-test, orders-mobile-meta-test, mobile-lists-test, customers-mobile-cvr-test, customers-list-mobile-test, invoices-mobile-name-test, invoices-mobile-test, incoming-invoice-file-wrap-test, incoming-invoice-lines-mobile-test, employees-mobile-role-test, employees-mobile-test, offer-lead-contact-wrap-test, offer-party-wrap-test, mail-leads-load-test, mail-mailboxes-load-test, mail-stats-load-test, tsc --noEmit, aftercalc-money-wrap-test, aftercalc-overview-mobile-test, tsc --noEmit, report-profit-money-wrap-test, report-profit-variance-test, reports-mobile-test, report-cases-cap-test, tsc --noEmit, sales-funnel-money-wrap-test, sales-funnel-mobile-test, sales-funnel-error-test, tsc --noEmit, other-costs-money-wrap-test, other-costs-mobile-test, tsc --noEmit, time-log-money-wrap-test, time-logs-mobile-test, tsc --noEmit, report-kpi-wrap-test, reports-mobile-test, report-profit-money-wrap-test, tsc --noEmit, purchase-ops-summary-wrap-test, purchase-ops-mobile-test, tsc --noEmit, employee-economy-wrap-test, employee-economy-mobile-test, tsc --noEmit, project-budget-wrap-test, record-title-wrap-test, tsc --noEmit, system-status-wrap-test, dashboard-overview-mobile-test, tsc --noEmit, ai-insights-load-test, dashboard-overview-mobile-test, system-status-wrap-test, tsc --noEmit, ai-insights-detail-wrap-test, ai-insights-load-test, system-status-wrap-test, tsc --noEmit, bank-status-load-test, tsc --noEmit, offer-vs-actual-wrap-test, offer-vs-actual-variance-test, tsc --noEmit, customer-picker-selected-load-test, customer-picker-search-test, customer-picker-name-test, tsc --noEmit, lead-candidates-load-test, tsc --noEmit, lead-link-read-test, lead-candidates-load-test, tsc --noEmit, billing-status-load-test, tsc --noEmit, offer-revisions-load-test, tsc --noEmit, project-economy-load-test, tsc --noEmit, billing-followup-closed-test, billing-followup-load-test, tsc --noEmit, purchase-summary-query-test, purchase-summary-load-test, assert-oe9-3-security, tsc --noEmit, offer-revisions-wrap-test, offer-revisions-load-test, tsc --noEmit, project-economy-wrap-test, project-economy-mobile-test, project-economy-load-test, tsc --noEmit, purchase-summary-amount-wrap-test, purchase-summary-mobile-test, purchase-summary-load-test, tsc --noEmit, billing-status-wrap-test, billing-status-load-test, tsc --noEmit, employee-gear-load-test, tsc --noEmit, purchase-summary-line-wrap-test, purchase-summary-cap-test, purchase-summary-amount-wrap-test, tsc --noEmit, work-order-replan-read-test, work-order-employee-check-test, planning-replan-mobile-test, tsc --noEmit, work-order-status-read-test, work-order-timer-count-test, work-order-replan-read-test, tsc --noEmit, conversion-preview-header-wrap-test, conversion-preview-mobile-test, conversion-preview-case-test, conversion-preview-supplier-test, tsc --noEmit, approve-header-wrap-test, approve-category-text-test, approve-lines-mobile-test, tsc --noEmit, approve-case-wrap-test, approve-header-wrap-test, approve-category-text-test, approve-lines-mobile-test, tsc --noEmit, incoming-header-amount-wrap-test, incoming-header-mobile-test, incoming-invoice-lines-mobile-test, invoice-test-delete-test, tsc --noEmit, invoice-control-summary-wrap-test, invoice-control-wrap-test, invoice-control-load-test, invoice-control-query-test, header-totals-test, tsc --noEmit, invoice-economy-amount-wrap-test, invoice-economy-time-test, dashboard-widget-wrap-test, tsc --noEmit, invoice-economy-card-wrap-test, invoice-economy-amount-wrap-test, invoice-economy-time-test, dashboard-widget-wrap-test, tsc --noEmit, customer-invoice-summary-wrap-test, invoices-mobile-test, tsc --noEmit, customer-invoice-event-wrap-test, customer-invoice-summary-wrap-test, invoices-mobile-test, tsc --noEmit, rejection-amount-wrap-test, rejection-mobile-test, dashboard-rejections-load-test, tsc --noEmit, materials-bind-amount-wrap-test, materials-bind-name-test, materials-admin-load-test, materials-admin-mobile-test, tsc --noEmit, supplier-search-amount-wrap-test, supplier-search-name-test, supplier-search-load-test, tsc --noEmit, offer-supplier-amount-wrap-test, offer-supplier-search-test, offer-supplier-search-load-test, tsc --noEmit, quote-search-amount-wrap-test, quote-product-search-test, quote-lines-mobile-test, mail-name-wrap-test, tsc --noEmit, learning-adjustment-wrap-test, learning-adjustment-time-test, tsc --noEmit, invoices-overview-summary-wrap-test, invoices-mobile-test, invoices-mobile-name-test, tsc --noEmit, case-invoices-amount-wrap-test, case-invoices-mobile-test, case-invoices-load-test, tsc --noEmit, stage-invoices-amount-wrap-test, stage-invoices-mobile-test, stage-invoices-load-test, tsc --noEmit, report-customers-amount-wrap-test, reports-mobile-test, report-revenue-load-test, tsc --noEmit, price-alerts-amount-wrap-test, price-alerts-mobile-test, pricing-name-wrap-test, pricing-load-test, tsc --noEmit, room-scenarios-amount-wrap-test, room-scenarios-mobile-test, room-cables-mobile-test, tsc --noEmit, room-cables-amount-wrap-test, room-cables-mobile-test, room-scenarios-mobile-test, tsc --noEmit, offer-totals-amount-wrap-test, offer-preview-mobile-test, offer-lines-mobile-test, tsc --noEmit, offer-lines-amount-wrap-test, offer-lines-mobile-test, offer-preview-mobile-test, tsc --noEmit, portal-offer-amount-wrap-test, portal-offer-lines-mobile-test, tsc --noEmit, cockpit-amount-wrap-test, cockpit-wrap-test, cockpit-rest-load-test, tsc --noEmit, invoice-lines-amount-wrap-test, invoice-detail-lines-mobile-test, invoice-header-mobile-test, invoice-lines-empty-test, tsc --noEmit, draft-lines-amount-wrap-test, draft-lines-mobile-test, tsc --noEmit, billing-draft-amount-wrap-test, billing-time-mobile-test, billing-materials-mobile-test, billing-other-mobile-test, tsc --noEmit, ai-components-amount-wrap-test, ai-components-mobile-test, tsc --noEmit, price-offers-amount-wrap-test, price-offers-mobile-test, pricing-name-wrap-test, tsc --noEmit, price-trends-amount-wrap-test, price-trends-mobile-test, pricing-name-wrap-test, tsc --noEmit, credit-lines-amount-wrap-test, credit-lines-mobile-test, credit-note-label-test, tsc --noEmit, line-items-amount-wrap-test, line-items-mobile-test, line-items-empty-test, tsc --noEmit, room-breakdown-amount-wrap-test, room-scenarios-mobile-test, room-cables-mobile-test, tsc --noEmit, room-summary-amount-wrap-test, room-breakdown-amount-wrap-test, room-scenarios-amount-wrap-test, tsc --noEmit, ai-price-amount-wrap-test, ai-components-amount-wrap-test, ai-components-mobile-test, tsc --noEmit, quick-summary-amount-wrap-test, tsc --noEmit, calc-detail-amount-wrap-test, tsc --noEmit, case-economy-amount-wrap-test, case-economy-load-test, tsc --noEmit, ai-building-wrap-test, ai-price-amount-wrap-test, tsc --noEmit, calc-detail-amount-wrap-test, tsc --noEmit, product-price-amount-wrap-test, tsc --noEmit, package-summary-amount-wrap-test, package-detail-mobile-test, tsc --noEmit, package-list-amount-wrap-test, packages-list-mobile-test, package-search-label-test, tsc --noEmit, quote-preview-amount-wrap-test, quote-form-label-test, tsc --noEmit
BLOCKED_APPROVAL: 00221 er kørt af Claude på main (d318ebe5) — køres ikke igen. 00222 er kørt af Claude på main (47a5a977) — køres ikke igen. 00223 er kørt af Claude på main (bc5705a2) — køres ikke igen. 00224 er kørt af Claude på main (725df30d) — køres ikke igen. 00225 ACL er Claudes (8f97e621). F-4, F-5 (migration). PE-3/PE-4 og P-8 (arbejdskost-beslutning). GP-4 (avance-forrang). OIOUBL-kreditnota vendes ikke (beløb bliver stående). Ingen live mail, SMS, Telegram eller e-conomic. Claudes mail-feedback (67b1997d), påmindelsesbekræftelse (af645e9b), prisparser (80b9bdef) og FloatingMenu (287d616f) duplikeres ikke. Claudes main (83b2742d, b9077dd1, b8281df2, f6cdb197, 21fcd31e, ed4b7e9c, 5fbd779c, 81ce5c03) duplikeres ikke. getSystemHealth behandler en fejlet log-læsning som overall ok, og cron skriver den rollup (kan udløse admin-alert) — ændres ikke.
NEXT_QUEUE: Grok-shift 2026-10-18 nedenfor (15 sikre opgaver). Medarbejderkortets e-mail/adresse-ombrydning springes over: employee-detail-client.tsx er paa Claudes leave-liste (origin/main 2d979a03). Det er ikke BLOCKED_APPROVAL.

## Grok-shift 2026-10-18 (grok-next)

START: 80ab0dab. origin/main: 2d979a03 (299 commits foran; VAT/security/cron/storage/migrationer 00221–00262 roeres ikke). Koen er skrevet foer foerste produkt-aendring.

| # | Prio | Opgave | Graense |
|---|---|---|---|
| G18-1 | 1 Profit | DONE `ef833b0a` efterkalk-oversigten taeller manglende kost og ukendt DB foer paginering. | Penge, sortering, filtre og `varianceText` uændret. |
| G18-2 | 2 Faktura | DONE `356a74e7` tæller overpris, underpris og fragt/gebyr. | Motor, beløb og 0-linje-sætningen uændret. Ingen e-conomic. |
| G18-3 | 1 Profit | DONE `3199b17e` sagen viser antal `missing_cost_lines`. | Advarselstekst og totaler uændret. |
| G18-4 | 1 Profit | ALLEREDE I PRODUKT: mobilkortet bruger `varianceText`. Ingen ny commit. | `kr` / `pct` / `varianceText` bliver. |
| G18-5 | 4 Pris | DONE `8055c9c5` manglende kostpris er "Ingen lagret pris"; lagret 0 bliver 0 kr. | `canSeeCost`, listepris og avanceformel uændret. |
| G18-6 | 5 Plan | ALLEREDE I PRODUKT: `planningLoadView` skelner fejl fra tom liste. Ingen ny commit. | Kontrakten i `planning-load-view-test` bliver. |
| G18-7 | 6 Salg | DONE `eb73e7b7` månedens sendt- og vinderrate. | `reports.ts` og accepteret værdi uændret. |
| G18-8 | 7 Assistent | DONE `a61d701a` opslag siger ingen træf eller antal kandidater. | Ingen webhook. `handle-update.ts` uændret. |
| G18-9 | 8 Pilot | DONE leverandørlisten: fejlet hentning siger det og beholder sidste liste. Tom succes siger stadig opret. | Fejl forbliver fejl. |
| G18-10 | 3 Ledelse | DONE `05f1d751` oversigten tæller advarsler i filtret. | Samme quality-tal. Ingen ny forespørgsel. |
| G18-11 | 2 Faktura | DÆKKET AF `356a74e7`: tællingen ligger over mobil-listen og ombrydes. | Samme tal som desktop. |
| G18-12 | 4 Pris | DONE prishistorik siger datoen på den senest lagrede række, kun når listen har rækker. | Tom liste siger stadig ingen prisændringer. Ingen nutidspris. |
| G18-41 | 4 Pris | DONE hver prishistorik-række formaterer `effective_from` med Europe/Copenhagen. | Beløbene er uændret. |
| G18-42 | 8 Pilot | DONE prishistorik-rækken ombrydes, så dato og beløb bliver i kortet. | Datoformat og beløb er uændret. |
| G18-43 | 8 Pilot | DONE materialekortets kost og salg ombrydes. | `formatCurrency` og avanceformlen er uændret. |
| G18-44 | 8 Pilot | DONE materialenavn og varenummer ombrydes på kortet. | Priser og avance er uændret. |
| G18-45 | 8 Pilot | DONE mærke og enhed på materialekortet ombrydes. | Navn, varenummer, priser og avance er uændret. |
| G18-50 | 5 Plan | DONE linket under dagens påmindelser ombrydes. | Påmindelseslisten og overskriften er uændret. |
| G18-90 | 5 Plan | DONE titlerne i dagens påmindelsesliste ombrydes. | Overskriften og linket er uændret. |
| G18-99 | 5 Plan | DONE klokken under kommende besigtigelser ombrydes. | Kundens navn og booking-sætningen er uændret. |
| G18-101 | 5 Plan | DONE linket "Gå til kundekort" på den valgte dag ombrydes. | Adressen er uændret. |
| G18-104 | 5 Plan | DONE "Bekræftet af kunden" på den valgte dag ombrydes. | Bekræftelsesbetingelsen er uændret. |
| G18-13 | 6 Salg | ÅBEN. Tilbud ude: filter- eller tælle-mærke på en fil der ikke er offer-detail-client. | Kun eksisterende statusser. |
| G18-14 | 5 Plan | DONE dagsoverskriften viser antal hentede opgaver. Tom dag siger stadig ingen besigtigelser. | Ingen ny query. Påmindelser tælles ikke her. |
| G18-37 | 4 Pris | DONE null listepris siger "Ingen lagret pris". | Kost er G18-19. 0 kr forbliver 0 kr. Ingen opfundet pris. |
| G18-46 | 8 Pilot | ÅBEN. Leverandørvarens navn på skrivebordet ombrydes i stedet for `line-clamp-1`. | Priser og status er uændret. |
| G18-15 | 8 Pilot | ÅBEN. Desktop-celler i `pricing-client.tsx` for gammel/ny pris, tilbudsbeløb, difference og trendpris mangler `break-words`. Mobil ombryder allerede. | Ingen truncate. Ingen nye priser. |
| G18-16 | 2 Faktura | DONE fragt og gebyr vises hver for sig. Beløb og motor uændret. | Ingen e-conomic. |
| G18-17 | 1 Profit | DONE dansk faktureringsstatus på efterkalk-rækken fra `invoiced_state`. | Statusberegningen uændret. |
| G18-18 | 8 Pilot | ALLEREDE I PRODUKT: produktlisten siger at fejlet hentning ikke tælles som ingen produkter. Ingen ny commit. | Tom succes forbliver tom. |
| G18-19 | 4 Pris | DONE null kost på leverandørvaren siger "Ingen lagret pris". 0 kr forbliver 0 kr. | Listepris og salgspris uændret. |
| G18-40 | 4 Pris | DONE null salgspris siger "Ingen lagret pris". | Ingen opfundet salgspris. 0 kr forbliver 0 kr. |
| G18-47 | 8 Pilot | ÅBEN. Producentnavnet på leverandørvarens mobilkort ombrydes. | Priser, varenummer og status er uændret. |
| G18-20 | 6 Salg | ÅBEN. Ren konverteringstekst på en fil der ikke er leads-page-client eller lead-detail. | Ikke `follow-up.ts`. |
| G18-21 | 7 Assistent | ÅBEN. Note-svaret citerer de første 120 tegn af den gemte tekst. | Insert og afsendelse uændret. |
| G18-22 | 3 Ledelse | DONE oversigten siger Negativ DB, Positiv DB eller Alle. | `selectOverviewPage` uændret. |
| G18-31 | 5 Plan | DONE dagsoverskriften formateres i Europe/Copenhagen. | Opgavelisten og datostrengen er uændret. |
| G18-48 | 6 Salg | ÅBEN. Salgstragtens indledning ombrydes. | Satser, `pct` og `reports.ts` er uændret. |
| G18-23 | 7 Assistent | ÅBEN. Callback-svaret siger at kunden ikke er kontaktet. | Insert og afsendelse uændret. Ingen webhook. |
| G18-24 | 1 Profit | DONE "Vis dem" slår det eksisterende filter kun manglende kost til. | Filterreglen uændret. |
| G18-25 | 2 Faktura | SPRUNGET. `duplicate_of_id` ligger på leave-listet `detail-client.tsx`. Panelet har ikke feltet. | Ingen ny matching. Ikke BLOCKED_APPROVAL. |
| G18-26 | 1 Profit | DONE sagspanelet bruger `invoicedStateLabel`. | Samme tre ord. Beregningen uændret. |
| G18-27 | 2 Faktura | SPRUNGET. `LineControl` har ikke `quantity`. Loader er leave-listet og motoren ændres ikke. | Ikke BLOCKED_APPROVAL. |
| G18-28 | 5 Plan | DONE "Mine påmindelser" på den valgte dag viser antallet fra `remindersByDate`. | Blokken er skjult ved 0. Ingen ny query. |
| G18-73 | 5 Plan | DONE kalenderens fejl ved hentning ombrydes. | "Det tælles ikke som ingen aftaler" er uændret. |
| G18-88 | 5 Plan | ÅBEN. Sagens opgavefejl "Ansvarlige kunne ikke hentes" ombrydes. | Sætningen er uændret. |
| G18-29 | 1 Profit | DONE Forrige/Næste har min-h 44 px. | Sidetal og side-størrelse uændret. |
| G18-49 | 1 Profit | DONE "sager i visningen" ombrydes. | Sidetal og knapper er uændret. |
| G18-67 | 1 Profit | DONE efterkalk-oversigtens indledning ombrydes. | Beløbsteksten er uændret. |
| G18-68 | 1 Profit | DONE linket "Tilbage til rapporter" ombrydes. | Adressen er uændret. |
| G18-74 | 2 Faktura | DONE toleranceteksten under fakturakontrollen ombrydes. | Tolerancen og overprisen er uændret. |
| G18-75 | 2 Faktura | DONE fakturakontrollens statuslinje ombrydes. | Statusteksten er uændret. |
| G18-76 | 2 Faktura | DONE fejlen "Det tælles ikke som at priserne stemmer" ombrydes. | Sætningen er uændret. |
| G18-77 | 2 Faktura | DONE dom-mærket ombrydes. | De fire domme er uændret. |
| G18-78 | 2 Faktura | DONE "Kontrollerer priser…" ombrydes. | Teksten er uændret. |
| G18-79 | 1 Profit | DONE efterkalk-oversigtens "Henter…" ombrydes. | Teksten er uændret. |
| G18-80 | 1 Profit | DONE sagspanelets "Henter…" ombrydes. | Sætningen er uændret. |
| G18-81 | 1 Profit | DONE sagspanelets fejltekst ombrydes. | "Det tælles ikke som 0 kr." er uændret. |
| G18-82 | 1 Profit | DONE tilbud-mod-faktisk "Henter…" ombrydes. | Sætningen er uændret. |
| G18-83 | 1 Profit | DONE tilbud-mod-faktisk fejltekst ombrydes. | "Det tælles ikke som 0 kr." er uændret. |
| G18-84 | 1 Profit | DONE "Kost pr. linje er skjult" ombrydes. | Sætningen er uændret. |
| G18-85 | 1 Profit | DONE efterkalk-oversigtens medarbejderfejl ombrydes. | Fejludtrykket er uændret. |
| G18-86 | 5 Plan | DONE kalenderens "Ansvarlige kunne ikke hentes" ombrydes. | Sætningen er uændret. |
| G18-87 | 8 Pilot | ÅBEN. Kundens opgavefejl "Ansvarlige kunne ikke hentes" ombrydes. | Sætningen er uændret. |
| G18-30 | 2 Faktura | SPRUNGET. `LineControl` har ikke `unitPrice`. Samme lås som G18-27. | Afvigelsesbeløbet uændret. Ikke BLOCKED_APPROVAL. |
| G18-32 | 1 Profit | DONE beløb i sagspanelets highlight-liste ombrydes. | `kr()` uændret. |
| G18-36 | 1 Profit | DONE sagspanelets indledning ombrydes. | Faktureringsstatus og beløb uændret. |
| G18-51 | 1 Profit | DONE linje-forklaringen under efterkalk ombrydes. | Koblingsreglen og beløb er uændret. |
| G18-55 | 1 Profit | DONE tom linjeliste på sagspanelet ombrydes. | Teksten er uændret. |
| G18-61 | 1 Profit | DONE tomme højdepunkter på sagspanelet ombrydes. | Teksterne er uændret. |
| G18-62 | 1 Profit | DONE linjestatus på sagspanelet ombrydes. | Statusordene er uændret. |
| G18-33 | 1 Profit | DONE sagspanelets mobil-resumé ombryder tilbudt, faktisk og afvigelse. | Tallene uændret. |
| G18-38 | 1 Profit | DONE sagspanelets skrivebords-resumé ombrydes. | Tallene uændret. |
| G18-52 | 1 Profit | DONE skrivebordslinjens kostceller ombrydes. | `kr()` og `qty()` er uændret. |
| G18-56 | 1 Profit | DONE skrivebordslinjens afvigelse ombrydes. | `moneyDev` og "Kan ikke beregnes" er uændret. |
| G18-58 | 1 Profit | DONE mobil-linjens afvigelse ombrydes. | "Kan ikke beregnes" og `moneyDev` er uændret. |
| G18-59 | 1 Profit | DONE mobil-linjens enhed ombrydes. | Beskrivelse og antal er uændret. |
| G18-64 | 5 Plan | DONE "Klik på en dag" ombrydes. | Den tomme dags sætning er uændret. |
| G18-69 | 5 Plan | DONE "Ingen kommende besigtigelser" ombrydes. | Booking-sætningen er uændret. |
| G18-72 | 5 Plan | DONE "Viser … af …" under kommende besigtigelser ombrydes. | Tællingen og månedskalenderen er uændret. |
| G18-103 | 5 Plan | DONE den ansvarliges navn på den valgte dag ombrydes. | "Navn kunne ikke hentes" er uændret. |
| G18-34 | 1 Profit | DONE sagspanelets mobil-linje ombryder tilbudt og faktisk kost. | Kosttallet uændret. |
| G18-39 | 1 Profit | DONE sagspanelets mobil-linje ombryder tilbudt og faktisk antal. | `qty()` uændret. |
| G18-53 | 1 Profit | DONE skrivebordslinjens antalceller ombrydes. | `qty()` er uændret. |
| G18-57 | 1 Profit | DONE skrivebordslinjens enhed ombrydes. | Beskrivelse og kost er uændret. |
| G18-63 | 1 Profit | DONE højdepunktets overskrift ombrydes. | Titlerne er uændret. |
| G18-65 | 1 Profit | DONE sidetallet ved Forrige/Næste ombrydes. | Sidetallet er uændret. |
| G18-66 | 5 Plan | DONE den tomme dags sætning ombrydes. | "Klik på en dag" er uændret. |
| G18-70 | 1 Profit | DONE efterkalk-oversigtens fejltekst ombrydes. | Fejludtrykket er uændret. |
| G18-71 | 1 Profit | DONE "Viser de nyeste sager" ombrydes. | Sætningen og sagstallet er uændret. |
| G18-89 | 1 Profit | DONE den tomme efterkalk-oversigt ombrydes. | Begge tomme sætninger er uændret. |
| G18-91 | 1 Profit | DONE "Nulstil filtre" i den tomme efterkalk-oversigt ombrydes. | Knapteksten og begge tomme sætninger er uændret. |
| G18-92 | 1 Profit | DONE "Vis dem" i efterkalk-oversigten ombrydes. | Filterreglen og knapteksten er uændret. |
| G18-93 | 1 Profit | DONE "Kost og DB er skjult" på den lukkede efterkalk-oversigt ombrydes. | Sætningen er uændret. |
| G18-94 | 1 Profit | DONE "Kun manglende kostdata" ombrydes. | Afkrydsningen og teksten er uændret. |
| G18-95 | 1 Profit | DONE skrivebordets tilbudt og faktisk beløb i efterkalk-oversigten ombrydes. | `kr()` og `pct()` er uændret. |
| G18-96 | 1 Profit | DONE skrivebordets DB-afvigelse i efterkalk-oversigten ombrydes. | `varianceText` er uændret. |
| G18-97 | 1 Profit | DONE mobilstatus på efterkalk-kortet ombrydes. | Statusordene er uændret. |
| G18-98 | 1 Profit | DONE skrivebordets sagsstatus i efterkalk-oversigten ombrydes. | Statusordene er uændret. |
| G18-100 | 5 Plan | DONE klokken på den valgte dag ombrydes. | Adressen og statusmærket er uændret. |
| G18-102 | 5 Plan | DONE "Åbn rutevejledning" på den valgte dag ombrydes. | Adressen og linket er uændret. |
| G18-105 | 5 Plan | DONE "kommende / overskredet" i kalenderens overskrift ombrydes. | Tællingen er uændret. |
| G18-106 | 5 Plan | DONE overskriften "Kalender — Besigtigelser" ombrydes. | Ordene er uændret. |
| G18-107 | 5 Plan | DONE knappen "I dag" er mindst 44 px høj. | Teksten og goToToday er uændret. |
| G18-108 | 5 Plan | ÅBEN. "+N mere" på månedsdagen ombrydes. | Tællingen er uændret. Dagbrikkerne afkortes stadig. |
| G18-109 | 2 Faktura | DONE linjedommen på fakturakontrollen ombrydes. | Domsteksten er uændret. |
| G18-35 | 1 Profit | DONE sagspanelets advarsler ombrydes. | Advarselsteksten uændret. |
| G18-54 | 1 Profit | DONE den lukkede efterkalk-linje ombrydes. | Teksten er uændret. |
| G18-60 | 8 Pilot | ÅBEN. Producentnavnet på leverandørvarens skrivebordskort ombrydes. | Priser og mobilkortet er uændret. |
| G18-110 | 2 Faktura | DONE match-teksten på fakturakontrollens skrivebord ombrydes. | Match-ordene er uændret. |
| G18-111 | 5 Plan | ÅBEN. "+N påmindelser" på månedsdagen ombrydes. | Tællingen er uændret. Dagbrikkerne afkortes stadig. |
| G18-112 | 5 Plan | DONE Forrige og næste måned er mindst 44 px. | Aria-teksten er uændret. |
| G18-113 | 5 Plan | DONE månedens navn i kalenderen ombrydes. | MONTH_NAMES og året er uændret. |
| G18-114 | 2 Faktura | DONE forventet pris og afvigelse på fakturakontrollens skrivebord ombrydes. | `kr()` og `not_controllable` er uændret. |
| G18-115 | 2 Faktura | DONE forventet pris og afvigelse på fakturakontrollens mobilkort ombrydes. | Beløbene er uændret. |
| G18-116 | 2 Faktura | DONE kolonneoverskrifterne Forventet og Afvigelse ombrydes. | Ordene er uændret. |
| G18-117 | 2 Faktura | DONE kolonneoverskriften Match ombrydes. | Ordet er uændret. |
| G18-118 | 2 Faktura | DONE beskrivelsen på fakturakontrollens skrivebord kan krympe. | Teksten er uændret. |
| G18-119 | 2 Faktura | DONE linjenummeret på fakturakontrollens skrivebord ombrydes. | Nummeret er uændret. |
| G18-120 | 2 Faktura | DONE kolonneoverskriften Status ombrydes. | Ordet er uændret. |
| G18-121 | 2 Faktura | DONE kolonneoverskriften Beskrivelse ombrydes. | Ordet er uændret. |
| G18-122 | 2 Faktura | DONE sætningen om fragt og gebyr ombrydes. | Sætningen er uændret. |
| G18-123 | 2 Faktura | DONE kolonneoverskriften # kan krympe. | Tegnet er uændret. |
| G18-124 | 2 Faktura | DONE fragt- og gebyrmærket på linjen ombrydes. | Ordene Fragt og Gebyr er uændret. |
| G18-125 | 5 Plan | DONE ugedagsnavnene i kalenderen ombrydes. | Navnene er uændret. |
| G18-126 | 2 Faktura | DONE linjenummeret på fakturakontrollens mobilkort kan krympe. | Nummeret og punktummet er uændret. |
| G18-127 | 5 Plan | DONE overskriften "Mine påmindelser" ombrydes. | Ordene er uændret. |
| G18-128 | 2 Faktura | DONE etiketterne Kontrollerede linjer, Overpris i alt og Leverandør ombrydes. | Ordene og beløbene er uændret. |
| G18-129 | 5 Plan | DONE dagsoverskriften på den valgte dag ombrydes. | `calendarDayHeading` er uændret. |
| G18-130 | 5 Plan | DONE den tomme sagsliste "Ingen opgaver endnu" ombrydes. | Sætningerne er uændret. |
| G18-131 | 5 Plan | ÅBEN. "X af Y udestår" på sagens opgaver ombrydes. | Tællingen er uændret. |
| G18-132 | 8 Pilot | ÅBEN. Den tomme kundeliste "Ingen opgaver endnu" ombrydes. | Sætningerne er uændret. |

Staadig BLOCKED_APPROVAL (kun den opgave, arbejdet fortsaetter): 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198. VAT-vagten i 2d979a03 (`vat-guard.ts`) er Claudes og roeres ikke.

## Checkpoint 2026-10-18 (Grok-shift, grok-next)

Produktspids før dette checkpoint: `d29f508d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Hvert `git push origin grok-next` blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Commits

Docs: `47241aeb` kø med 15 opgaver. `065ea641` kø efter syv leverancer.

Profit / efterkalk: `ef833b0a` filtreret datakvalitet. `3199b17e` manglende kostlinjer på sagen. `05f1d751` advarsler i filtret. `e4cce248` dansk faktureringsstatus. `705908c1` Vis dem. `d0d8c7da` aktivt afvigelsesfilter. `aa700e15` fælles faktureringsstatus på sagspanelet. `8de7b141` højdepunktets beløb. `f625a8cc` mobil-resumé. `b09a8a09` mobil-linjens kost. `bddfbcc1` sagspanelets indledning. `a5430a40` skrivebords-resumé. `baeed2b6` mobil-antal. `b11b53db` advarsler. `69eef75f` linje-forklaring. `5847da04` skrivebordskost. `027cc5da` skrivebordsantal. `508bfa89` skrivebordsafvigelse. `104d95f7` mobilafvigelse. `583f67b9` lukket linje. `511ddb11` tom linjeliste. `d10fd0db` tomme højdepunkter. `7f9a23de` skrivebordsenhed. `bdd14049` mobilenhed. `0e18439e` højdepunktets overskrift. `6e161063` Forrige/Næste 44 px. `35fb02cd` sidetal. `9daadfc0` sager i visningen. `4232b0cf` oversigtsindledning. `cfb40753` tilbage til rapporter. `9aa7888f` oversigtsfejl. `4b936072` oversigtens Henter. `5666897f` sagspanelets Henter. `efc6353d` sagspanelets fejl. `972ad2c7` tilbud-mod-faktisk Henter. `dadd1649` tilbud-mod-faktisk fejl. `a06e6a06` skjult kostlinje. `9faab0d5` medarbejderfejl. `d29f508d` afkortningsnotice.

Faktura: `356a74e7` overpris, underpris, fragt/gebyr. `d3e70bd1` fragt og gebyr hver for sig. `0c7de99e` tolerance. `55aa8bdc` statuslinje. `afa96728` kontrolfejl. `47b6a1de` dom. `efbd62e1` kontrollerer priser. Ingen e-conomic.

Pris: `8055c9c5` manglende kost. `0bed1770` manglende leverandørkost. `4cc21d28` seneste lagrede dato. `4905d6a0` række-dato i dansk tid. `25fcbc76` manglende listepris. `33261682` manglende salgspris. `84007beb` historik-række. `81906982` kortets kost og salg. `ba59b060` navn og varenummer. `d20ddc9e` mærke og enhed. Ingen opfundne priser.

Plan: `b8c5f088` dagens opgavetal. `8e8c2f8e` dagsoverskrift i Europe/Copenhagen. `cfff4bc6` klik på en dag. `f322fa93` tom dag. `732a6851` ingen kommende besigtigelser. `8ea3a09d` påmindelsestal fra den hentede liste. `96e170ca` navnefejl. `4c9521c2` aftalefejl.

Salg: `eb73e7b7` månedens sendt- og vinderrate. `reports.ts` er uændret.

Assistent: `a61d701a` opslag siger ingen træf eller antal. Ingen webhook. `handle-update.ts` er uændret.

Pilot: `9837a396` fejlet leverandørhentning er ikke et tomt katalog.

### Features

Tilbudt mod faktisk og realiseret DB er uændret i regnemaskinen. Oversigten tæller manglende kost og ukendt DB i filtret, siger det aktive afvigelsesfilter, og kan slå filteret "kun manglende kost" til. Sagspanelet bruger den fælles faktureringsstatus. Manglende kost bliver ikke vist som 0 kr. Fakturakontrollen tæller overpris, underpris, fragt og gebyr hver for sig og poster ikke. Manglende lagret kost, listepris og salgspris siger at prisen ikke er lagret. Lagret 0 bliver 0 kr. Kalenderens dag er dansk tid, og dagens påmindelser tælles fra den liste der allerede er hentet. Lange beløb og fejltekster ombrydes på mobil. Fejlet hentning ligner ikke en tom liste.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil eller kalder den shippede funktion. De kørte med `npx tsx` og exiterede 0. Når `src/` ændredes, kørte `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` og exiterede 0 før commit. Én tidlig `tsc` døde med 134 (hukommelse) og blev kørt om med større heap før kost-committen. Resultaterne er tilføjet i `{SCRATCH}/tests.log`, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok i dette skift. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret: dublet-id og antal/enhedspris ligger på leave-listede filer eller findes ikke på `LineControl`.

### Claude review

Når `grok-next` må ses: kost-gates og falsk-tom leverandørliste først. Derefter efterkalk-tællinger, faktureringsstatus, Vis dem, afvigelsesfilter, fakturalinjernes fragt/gebyr-split, lagret-pris-tekst, kalenderens danske dag og påmindelsestal, og ombrydningerne. Ingen af dem poster, sender eller ændrer en lagret pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og falsk-tom først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-50, G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-62, G18-72, G18-89, G18-60.

## Checkpoint 2026-10-18 fortsat (Grok-shift, grok-next)

Dette checkpoint afløser den åbne kø i checkpointet ovenfor. Produktspids: `53cf508e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Hvert `git push origin grok-next` blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `80ab0dab..53cf508e`

```
53cf508e feat(plan): påmindelsestitler ombrydes
7ca6b1dd feat(efterkalk): mobilstatus ombrydes
dbb2daa3 feat(efterkalk): skrivebordsafvigelse ombrydes
41ba94d4 feat(efterkalk): skrivebordsbeloeb ombrydes
d70d8608 feat(efterkalk): manglende kostdata ombrydes
dd85f002 feat(efterkalk): skjult oversigt ombrydes
bee06793 feat(efterkalk): vis dem ombrydes
99a6a824 feat(efterkalk): nulstil filtre ombrydes
fa3a4a5c feat(efterkalk): den tomme oversigt ombrydes
3aa8baee feat(plan): påmindelseslinket ombrydes
a1f2bc11 docs: checkpoint for grok-shift 2026-10-18
d29f508d feat(efterkalk): afkortningsnoticen ombrydes
4c9521c2 feat(plan): aftalefejlen ombrydes
96e170ca feat(plan): navnefejlen ombrydes
9faab0d5 feat(efterkalk): medarbejderfejlen ombrydes
a06e6a06 feat(efterkalk): skjult kostlinje ombrydes
dadd1649 feat(efterkalk): tilbud mod faktisk fejl ombrydes
972ad2c7 feat(efterkalk): tilbud mod faktisk henter ombrydes
efc6353d feat(efterkalk): sagspanelets fejl ombrydes
5666897f feat(efterkalk): sagspanelets henter ombrydes
4b936072 feat(efterkalk): henter ombrydes
efbd62e1 feat(faktura): kontrollerer priser ombrydes
47b6a1de feat(faktura): dommen ombrydes
afa96728 feat(faktura): kontrolfejlen ombrydes
55aa8bdc feat(faktura): statuslinjen ombrydes
0c7de99e feat(faktura): toleranceteksten ombrydes
cfb40753 feat(efterkalk): tilbage til rapporter ombrydes
8ea3a09d feat(plan): dagens påmindelser tælles
732a6851 feat(plan): ingen kommende besigtigelser ombrydes
9aa7888f feat(efterkalk): fejlteksten ombrydes
f322fa93 feat(plan): den tomme dag ombrydes
cfff4bc6 feat(plan): klik på en dag ombrydes
4232b0cf feat(efterkalk): oversigtsindledningen ombrydes
9daadfc0 feat(efterkalk): sager i visningen ombrydes
35fb02cd feat(efterkalk): sidetallet ombrydes
0e18439e feat(efterkalk): højdepunktets overskrift ombrydes
bdd14049 feat(efterkalk): mobil-linjens enhed ombrydes
7f9a23de feat(efterkalk): skrivebordslinjens enhed ombrydes
d10fd0db feat(efterkalk): tomme højdepunkter ombrydes
511ddb11 feat(efterkalk): tom linjeliste ombrydes
583f67b9 feat(efterkalk): den lukkede linje ombrydes
104d95f7 feat(efterkalk): mobil-linjens afvigelse ombrydes
508bfa89 feat(efterkalk): skrivebordslinjens afvigelse ombrydes
027cc5da feat(efterkalk): skrivebordslinjens antal ombrydes
5847da04 feat(efterkalk): skrivebordslinjens kost ombrydes
69eef75f feat(efterkalk): linje-forklaringen ombrydes
b11b53db feat(efterkalk): sagspanelets advarsler ombrydes
baeed2b6 feat(efterkalk): mobil-linjen ombryder antal
a5430a40 feat(efterkalk): skrivebords-resuméet ombryder beløb
bddfbcc1 feat(efterkalk): sagspanelets indledning ombrydes
d20ddc9e feat(pris): materialekortets mærke og enhed ombrydes
6e161063 feat(efterkalk): Forrige og Næste er høje nok til en finger
8e8c2f8e feat(plan): dagsoverskriften vises i dansk tid
33261682 feat(pris): manglende salgspris siger at den ikke er lagret
25fcbc76 feat(pris): manglende listepris siger at den ikke er lagret
ba59b060 feat(pris): materialekortets navn og varenummer ombrydes
81906982 feat(pris): materialekortets kost og salg ombrydes
84007beb feat(pris): prishistorik-rækken ombrydes
4905d6a0 feat(pris): prishistorik-rækker viser dato i dansk tid
4cc21d28 feat(pris): prishistorik siger datoen på den senest lagrede række
0bed1770 feat(pris): manglende leverandørkost siger at prisen ikke er lagret
b09a8a09 feat(efterkalk): mobil-linjens kost ombrydes
f625a8cc feat(efterkalk): mobil-resuméet ombryder beløb
b8c5f088 feat(plan): dagsoverskriften tæller de hentede opgaver
8de7b141 feat(efterkalk): højdepunktets beløb ombrydes
aa700e15 feat(efterkalk): sagspanelet bruger den fælles faktureringsstatus
d0d8c7da feat(efterkalk): oversigten siger det aktive afvigelsesfilter
705908c1 feat(efterkalk): Vis dem slår manglende-kost-filteret til
e4cce248 feat(efterkalk): dansk faktureringsstatus på oversigtsrækken
d3e70bd1 feat(faktura): fragt og gebyr vises hver for sig
9837a396 fix(pilot): fejlet leverandørhentning er ikke et tomt katalog
065ea641 docs: opdater grok-shift-koen efter syv leverancer
8055c9c5 feat(pris): manglende kostpris siges, lagret nul bliver
05f1d751 feat(ledelse): efterkalk-oversigten tæller advarsler i filtret
a61d701a feat(assistent): opslag siger ingen træf eller antal kandidater
eb73e7b7 feat(salg): månedens sendt- og vinderrate i tragten
3199b17e feat(efterkalk): tæl linjer der mangler kost på sagen
356a74e7 feat(faktura): tæl overpris, underpris og fragt/gebyr
ef833b0a feat(efterkalk): filtreret datakvalitet i oversigten
47241aeb docs: koe med 15 sikre opgaver til grok-shift 2026-10-18
```

Listen er alle commits fra `80ab0dab` til og med `53cf508e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features siden `a1f2bc11`

Påmindelseslinket og titlerne i dagens liste ombrydes. Overskriften, adressen og tællingen er uændret. Efterkalk-oversigten ombryder den tomme tekst, "Nulstil filtre", "Vis dem", den lukkede oversigt, "Kun manglende kostdata", skrivebordets tilbudt og faktisk beløb, skrivebordets DB-afvigelse og mobilstatus. `kr()`, `pct()`, `varianceText` og statusordene er uændret. Ingen opfundne priser. Ingen e-conomic.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil eller kalder den shippede funktion. De kørte med `npx tsx` og exiterede 0. Når `src/` ændredes, kørte `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` og exiterede 0 før commit. Resultaterne er tilføjet i `{SCRATCH}/tests.log`, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv. G18-25, G18-27 og G18-30 er stadig sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og falsk-tom leverandørliste først. Derefter de nye ombrydninger på efterkalk-oversigten og kalenderens påmindelseslink og titler. Ingen af dem poster, sender eller ændrer en lagret pris.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og falsk-tom først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-99, G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-62, G18-72, G18-98, G18-60.

## Checkpoint 2026-10-18 tredje (Grok-shift, grok-next)

Dette checkpoint lister commits efter `dfd78f86`. Det omskriver ikke listen i checkpointet ovenfor. Produktspids: `9ecacb50`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Hvert push af `grok-next` blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `dfd78f86..9ecacb50`

```
9ecacb50 feat(plan): kalenderoverskrift ombrydes
3fefb3d0 test(faktura): behold hovedmaerkets daekning
d4102cee feat(faktura): linjedommen ombrydes
6fb22aa9 feat(efterkalk): linjestatus ombrydes
642d7801 feat(plan): kalenderens taelling ombrydes
a3f028cc feat(plan): bekraeftelse ombrydes
72dc1331 feat(plan): ansvarliges navn ombrydes
d2b8a770 feat(plan): rutevejledning ombrydes
f20e64a7 feat(plan): kundekortlinket ombrydes
78c3b012 feat(plan): kommende tælling ombrydes
2027a0b6 feat(plan): dagens klokkeslet ombrydes
8553f6ca feat(plan): kommende klokkeslet ombrydes
7392bcaf feat(efterkalk): skrivebordsstatus ombrydes
```

Listen er alle commits efter `dfd78f86` til og med `9ecacb50`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features siden `dfd78f86`

Efterkalk-oversigtens skrivebordsstatus og sagspanelets linjestatus ombrydes. Statusordene er uændret. Kalenderen ombryder kommende klokkeslæt, dagens klokkeslæt, kommende tælling, kundekortlinket, rutevejledningen, den ansvarliges navn, "Bekræftet af kunden", overskriftstællingen og titlen "Kalender — Besigtigelser". Fejlteksten "Navn kunne ikke hentes", adressen og bekræftelsesbetingelsen er uændret. Fakturakontrollens linjedom ombrydes. Hovedmærkets fire tekster og "Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr." er uændret. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil. `3fefb3d0` genindfører tjekket af hovedmærket i samme test. De kørte med `npx tsx` og exiterede 0. Når `src/` ændredes, kørte `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` og exiterede 0 før commit. Resultaterne er tilføjet i tests.log, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv. G18-25, G18-27 og G18-30 er stadig sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og falsk-tom leverandørliste først. Derefter ombrydningerne efter `dfd78f86`: skrivebordsstatus, linjestatus, kalenderens klokkeslæt, tælling, kundekort, rute, ansvarlig, bekræftelse, overskrift og fakturaens linjedom. Ingen af dem poster, sender eller ændrer en lagret pris.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og falsk-tom først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-107, G18-108, G18-60, G18-110, G18-111.

## Checkpoint 2026-10-18 fjerde (Grok-shift, grok-next)

Dette checkpoint lister commits efter `58e87d32`. Det omskriver ikke listerne ovenfor. Produktspids: `a808cab6`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `58e87d32..a808cab6`

```
a808cab6 feat(plan): maanedens navn ombrydes
bb2e5a31 feat(plan): maanedsknapper er hoeje nok
d1c90b60 feat(plan): I dag-knappen er hoej nok
```

Listen er alle commits efter `58e87d32` til og med `a808cab6`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

`58e87d32` lister `dfd78f86..9ecacb50`. Sammen dækker de to sektioner alle shift-commits fra `80ab0dab` frem til `a808cab6`, bortset fra docs-committerne selv.

### Features

"I dag" er mindst 44 px. Forrige og næste måned er mindst 44 px i begge retninger. Månedens navn ombrydes. Aria-tekst, `goToToday`, `MONTH_NAMES` og året er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-108, G18-60, G18-110, G18-111, G18-114.

## Checkpoint 2026-10-18 femte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `dc4a2a51`. Det omskriver ikke listerne ovenfor. Produktspids: `297b396b`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `dc4a2a51..297b396b`

```
297b396b feat(faktura): Match-overskriften ombrydes
a16bcf40 feat(faktura): match-teksten ombrydes
4f37b072 feat(faktura): kolonneoverskrifter ombrydes
152b0027 feat(faktura): mobilens forventet pris og afvigelse ombrydes
1e7dfbff feat(faktura): forventet pris og afvigelse ombrydes
```

Listen er alle commits efter `dc4a2a51` til og med `297b396b`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Fakturakontrollens skrivebord ombryder forventet pris, afvigelse, match-tekst og kolonneoverskrifterne Forventet, Afvigelse og Match. Mobilkortet ombryder forventet pris og afvigelse. `kr()`, `not_controllable` og match-ordene er uændret. Sætningen "Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr." er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-108, G18-60, G18-111, G18-118, G18-119.

## Checkpoint 2026-10-18 sjette (Grok-shift, grok-next)

Dette checkpoint lister commits efter `227e1344`. Det omskriver ikke listerne ovenfor. Produktspids: `eac7f0af`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `227e1344..eac7f0af`

```
eac7f0af feat(faktura): fragtnoten ombrydes
fff1ec31 feat(faktura): Beskrivelse-overskriften ombrydes
82ef0334 feat(faktura): Status-overskriften ombrydes
f5854dac feat(faktura): linjenummeret ombrydes
f91f706c feat(faktura): beskrivelsen kan krympe
```

Listen er alle commits efter `227e1344` til og med `eac7f0af`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Beskrivelsen på fakturakontrollens skrivebord kan krympe. Linjenummeret ombrydes. Kolonneoverskrifterne Status og Beskrivelse ombrydes. Sætningen "Fragt og gebyr er markeret i teksten. Overprisen er uændret." ombrydes. Tekst, nummer, fragtmærke og nul-linjen er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-108, G18-60, G18-111, G18-123, G18-124.

## Checkpoint 2026-10-18 syvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `e584cfad`. Det omskriver ikke listerne ovenfor. Produktspids: `a9833b0e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `e584cfad..a9833b0e`

```
a9833b0e feat(faktura): kontrolettiketter ombrydes
cc1a4391 feat(plan): Mine paamindelser ombrydes
91cecb64 feat(faktura): mobilens linjenummer kan krympe
d64a588c feat(plan): ugedagsnavne ombrydes
3459aa2a feat(faktura): fragtmaerket ombrydes
495bcce4 feat(faktura): kolonnen # kan krympe
```

Listen er alle commits efter `e584cfad` til og med `a9833b0e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Kolonneoverskriften # kan krympe. Fragt- og gebyrmærket ombrydes. Ugedagsnavnene ombrydes. Mobilens linjenummer kan krympe. Overskriften "Mine påmindelser" ombrydes. Etiketterne Kontrollerede linjer, Overpris i alt og Leverandør ombrydes. Tegn, ordene Fragt og Gebyr, ugedagsnavne, nummer og punktum, påmindelsesordene og beløbene er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-88, G18-87, G18-108, G18-60, G18-111, G18-129, G18-130.

## NEXT-11 (backlog-wave 2026-10-14 nat — mobil/brugervenlighed salg + kontor)
Kilde: read-only review (kode, 375 px). [H] = kræver Henrik.
| # | Fund | Status |
|---|---|---|
| M-1 (S2) | Mail (/dashboard/mail) side-om-side liste/detalje + faneblade uden scroll → ubrugelig på mobil | DONE (UI U153) |
| M-2 (S2) | Beskeder (/dashboard/inbox) fast w-56 mappekolonne + w-1/2 detalje | DONE (UI U153) |
| M-3 (S2) | Bundnavigationen (z-50, senere i DOM) ligger over alle modaler → skjult Send-knap, tab af input | DONE (UI U153) |
| M-4 (S2) | Opgavelisten: 8-kolonne-grid i overflow-hidden, handlinger kun ved hover | DONE (UI U153) |
| M-5 (S2) | Usynlige slet-knapper (hover) uden bekræftelse: tilbudslinjer, kundeopgaver | DONE (UI U153) |
| M-6/7 (S3) | Tilbuds-/lead-hoved med 8/4 knapper uden ombrydning | DONE (UI U153) |
| M-8 (S3) | Rækkemenuer/statusdropdown klippes i tabeller (overflow) | DONE — fælles `FloatingMenu` (portal, fixed, vendes opad, inden for skærmen, Esc): tilbud/kunder/leads/beskeder + statusdropdowns (tilbud, lead, sag) (UI U154) |
| M-9 (S3) | Tilbudslisten viser ikke kunden på mobil | DONE (UI U153) |
| M-10/11 (S3) | Knapper vises uden rettighed (kundekort, slet-knapper for salg) | DONE (UI U153) |
| M-12 (S3) | "Eksporter" på tilbud kræver settings.economic → fejltoast for salg/serviceleder | DONE (UI U153) |
| M-13/14 (S3) | Dashboard-genveje/-kort ignorerer rolle; "Nyt Projekt" opretter usynlige legacy-projekter | DONE (UI U153) |
| M-15 (S3) | Mobilmenuen mangler kontormoduler; salg mangler Leads i bundnavigationen | DONE (UI U153) |
| M-16 (S3) | Ny sag: "Ansvarlig" tom for serviceleder/salg (users.view); "+ Ny sag" vises for bogholderi | DONE (UI U153) |
| M-17 (S3) | Inline-linjer: dobbelt "Tilføj linje"; fejlet gem markeres som gemt | DONE (UI U153) |
| M-18 (S3) | Opgavedialog lukker ved tryk på baggrunden (tab af input) | DONE (UI U153) |
| M-19/20 (S4) | Skraldespand som luk-ikon; "Låst"-årsag kun hover; avatar "U"; padding | DONE (X-ikon, Låst ved tryk); avatar/padding: LATER |

## Checkpoint 2026-10-14 aften (long-run)
- **I prod (push = deploy):** L-7 ret fakturahoved · PE-6 kontraktsum-DB · PE-7 fælles DB-tærskler · arbejdskost trin 2 (adfærdsneutralt)
  · F-1 (S1) kreditering af fratrukket forskud blokeret · F-2/F-3 slutfaktura-vagter · F-8/F-9/F-10/F-12 · F-7 overbetaling
  · PL-1–PL-8 (montør/planlægning) · GP-1 app-vej · GP-2/3/5/7/8/9/10/11/12/13/14 · 3 små audit-punkter
- **Udkast BLOCKED_APPROVAL (branches, staging-testet):** 00221 L-10 (`l10-rejected-dup-00221`, rejected-dup 5/5) · 00222 PE-1/PE-2
  (`profit-engine-00222`, wo-profit 7/7, erstatter 00205) · 00223 GP-1 RLS (`calc-settings-rls-00223`, calc-settings-rls 3/3).
  · 00224 GP-6 (`package-pricing-00224`, package-pricing-check 3/3). Staging har 00221–00224 anvendt.
- **Nye beslutninger** i HENRIK-DECISIONS: lav-DB 20 vs 10, GP-1, GP-4, F-3 kontrakt-rest, F-4, F-5, PL-10.

## NEXT-10 (backlog-wave 2026-10-14 aften — planlægning/montør, kundefaktura, grossist/prissætning)
Kilde: tre read-only reviews 2026-10-14 aften. [H] = kræver Henrik. Prod-data er små (3 arbejdsordrer), så de fleste er latente.

### Kundefaktura (F)
| # | Fund | Status |
|---|---|---|
| F-1 (S1) | Forskud/rate kunne krediteres efter slutfakturaen havde fratrukket den → kunden fik beløbet to gange | DONE 5b086139 (invoice-guards-check) |
| F-2 (S2) | Slutfaktura/sagsfaktura prissætter timer uden timepris til hardcodet 650 kr/t, som forhåndsvisningen ikke viser | DONE (slutfaktura blokeres med klar besked; sagsfaktura-kladde advarer stadig) — fallback-værdien 650/495/695 = P-8 §5.4 [H] |
| F-3 (S2) | Slutfaktura kan oprettes med negativ total (typen final, ikke kreditnota); ingen "rest af kontraktsum" på kontraktsager | DONE negativ total afvises (før nummertildeling) · [H] rest-af-kontrakt-tilstand |
| F-4 (S2) | Krediteret slutfaktura låser sagen for altid (uq_invoices_one_final_per_case tæller annullerede; kilde-låse frigives ikke) | [H] migration + kreditér-og-genfakturér-flow |
| F-5 (S2) | Bankimport dropper en ægte 2. betaling med samme dato/beløb/reference (dedup-nøgle) | [H] migration (dedup på bank-id/rækkehash) |
| F-6 (S2) | Auto-faktura ved tilbudsaccept sætter ikke case_id (kun hvis reglen går ud af dry-run) | LATENT — prod: reglen er active + dry_run (prod-automation-rules 2026-10-14); [H] case_id skal sættes før dry_run slås fra |
| F-7 (S3) | Overbetaling/dobbeltbetaling markeres ikke | DONE — `overpaidBy` (summen mod udestående efter kredit); bankmatch → "overpayment" (register-payment-check +2) |
| F-8 (S3) | "Markér som sendt" kunne vinde over kladde-sletning | DONE f67e46b4 |
| F-9 (S3) | Kreditnota på momsfri faktura viste 25 % moms i PDF | DONE f67e46b4 |
| F-10 (S3) | Rykker-cron: fejlede afsendelser tæller med i loftet → kan gå i stå på de ældste | DONE — kun sendte tæller, nyligt fejlede sidst, tidsbudget 25 s (`reminder-run-test` 5/5) |
| F-11 (S4) | Tidszone-kanter (fakturaår ved nytår, CURRENT_DATE i SQL, rykker-cooldown floor) | LATER |
| F-12 (S4) | Slutfakturaens "Intern note" siger "Vises på fakturaen" (vises ikke, D34) | DONE |

### Planlægning / montør (PL)
| # | Fund | Status |
|---|---|---|
| PL-1 (S2) | Afvist timeregistrering kan ikke rettes/slettes af montøren og blokerer genindtastning (overlap tæller afviste) | DONE — overlap ignorerer afviste; montør retter (→ afventer, audit `time_log_corrected`) eller sletter (audit med øjebliksbillede) sin EGEN afviste, ufakturerede række; godkendte kan kun ændres af godkender; admin kan slette afviste (UI U155) |
| PL-2 (S2) | Godkender ser ikke satstype (overtid) → overtid godkendes uset | DONE — badge pr. række + ændret satstype efter visning springes over |
| PL-3 (S3) | Montør ser planlægnings-/statusknapper der altid fejler (kalenderdialog, "Planlæg medarbejder") | DONE — statusknapper efter getWorkOrderCapabilities, felter/Gem og "Planlæg medarbejder" kun med work_orders.plan |
| PL-4 (S3) | Montør ser "salgspris mangler"-advarsler (salg er skjult for ham) | DONE — kolonne/sum/advarsel kun med invoices.view.own_cases |
| PL-5 (S3) | Afvisningsårsag kun i hover — kan ikke læses på mobil | DONE — inline "Begrundelse:" (U62) |
| PL-6 (S3) | Ingen fornuftsgrænse på manuel tid (80 t, fremtidige datoer) | DONE — højst 16 t og højst i morgen (`time-log-span-test` 7/7) |
| PL-7 (S3) | Omplanlægning tjekker ikke fratrædelsesdato | DONE |
| PL-8 (S3) | "Mine job" skjuler udaterede og >14 dage gamle åbne job | DONE (UI U151) |
| PL-9 (S3/S4) | Kalender dagvisning trang på mobil; overlap kun app-niveau; tidsformular-felter | LATER |
| PL-10 | Montør ser kontraktsum i sagens Økonomi-panel (salg, ikke kost) — passer det med D42? | [H] beslutning |

### Grossist / prissætning (GP)
| # | Fund | Status |
|---|---|---|
| GP-1 (S1→S2) | Salg kan regne nettoindkøbspris baglæns: estimeret salgspris = kost × (1 + global avance), og avancen er læsbar for alle (calculation_settings RLS USING(true), ugated action) | DELVIS — app-vejen lukket: getCalculationSettings/getAllSettings udleverer ikke indkøbsavancer til roller uden kostadgang; server-beregning via lib/settings/product-margin (uændrede priser). Rest: RLS = udkast 00223 på branch `calc-settings-rls-00223` (staging `cli.ts calc-settings-rls` 3/3) BLOCKED_APPROVAL |
| GP-2 (S2) | Produktspecifikke kundepriser og aftalers gyldighedsdatoer ignoreres ved linjeoprettelse/-opdatering | DELVIS — gyldighedsdatoer håndhæves ved linjeoprettelse/-opdatering (`supplier-line-pricing-check`); gyldighed nu også i søgning, optimering og Kalkia (fælles `onlyValidAgreements`); produktspecifikke kundepriser går nu foran leverandøraftalen ved linjeoprettelse/-opdatering/optimering (som DB-funktionen) — DONE |
| GP-3 (S2) | Kategori-/underkategori-avanceregler bruges aldrig på manuelle linjer (p_category null) | DONE — kategori/underkategori sendes med (`supplier-line-pricing-check`) |
| GP-4 (S2) | Avance-fallback og forrang forskellig på hver sti (20/25 %/indstilling; regel slår kundeaftale) | [H] forrang + én resolver |
| GP-5 (S2) | optimizeOfferPrices: egen matematik, skriver bruttokost, navne-match på tværs af enheder, ukontrollerede fejl | DONE — supplierLinePricing, kun EAN + samme enhed, effektiv kost, fejl tjekkes (UI U152) |
| GP-6 (S2) | Pakke-/auto-tilbud: rabatteret kost gemt som leverandørkost (falsk "pris ændret"), avance gemt som 0, ROUND vs ceil | BLOCKED_APPROVAL — udkast 00224 på branch `package-pricing-00224` (rå kost + faktisk avance; staging `cli.ts package-pricing-check` 3/3; latent: 0 pakkelinjer i prod). Afrunding ROUND vs ceil: LATER |
| GP-7 (S2) | LM "API-sync" læser egne rækker og stempler last_synced_at → gamle priser ser friske ud | DONE — `readsLocalCatalog`: cron/manuel API-sync springer LM Classic over (ingen last_synced_at-stempel); live-søgning mærker LM-rækker "cache" (`supplier-client-catalog-test`) |
| GP-8 (S2) | Kalkia-materialesync skriver vejl. udsalgspris som salgspris, 0-kost, upagineret/uchunket | DONE — kun kostprisen synkroniseres (aldrig 0, salgspris urørt), "synk alle" pagineret + chunket med fejltjek (`material-price-plan-test` 7/7) |
| GP-9 (S3) | import: supplier_settings.upsert uden onConflict → last_import_at opdateres aldrig efter 1. import | DONE (onConflict) |
| GP-10 (S3) | 1.000-rækkers-afkortning i prisændringer fra import og kategoriliste | DONE (fetchAllRows) |
| GP-11 (S3) | getAffectedOffers tager højeste nye kost i vinduet, ikke seneste | DONE — første gamle → seneste nye |
| GP-12 (S3) | Manuel kostændring skriver ingen price_history | DONE for leverandørvarer (change_source manual); product_catalog: LATER |
| GP-13 (S3) | parseDanishNumber("1.234") = 1,234; FTP-insert kost 0; søgning sorterer 0-kr øverst | DELVIS — søgning udelader kost 0; "1.234"-tvetydighed + FTP-insert 0: TODO |
| GP-14 (S4) | Død line-item-form.tsx, ubrugt forespørgsel, maybeSingle i setDefaultSupplierMargin | DONE |

## NEXT-9 (backlog-wave 2026-10-14 — go-live/pilot, leverandørfakturaer, Profit Engine)
Kilde: tre read-only reviews 2026-10-14 (pilot-readiness, leverandørfaktura-kontrol, Profit Engine). [H] = kræver Henrik.

### Go-live-blockers
| # | Opgave | Ejer | Status |
|---|---|---|---|
| G-1 | Slå selvregistrering fra (Supabase Auth "Allow new users to sign up") — standardrolle er montør → enhver med anon-nøglen kan oprette en aktiv montør. Målt 2026-10-14: stadig `disable_signup:false` | [H] manuel | BLOCKED (`prod-auth-signup-status.ts`) |
| G-2 | Pilotbrugere: navne + roller (afgør om 00186 skal køres først — bogholderi ser ellers hele postkassen) | [H] beslutning | BLOCKED |
| G-3 | G11 montør #2 uden koblet medarbejder (målt 2026-10-14: 2 logins / 1 koblet) | [H] manuel | BLOCKED (`prod-montor-linkage.ts`) |
| G-4 | G12 bankoplysninger på fakturaer (Vercel `INVOICE_BANK_*` eller Indstillinger → Firma) | [H] manuel | BLOCKED |
| G-5 | Admin-alarmer når ingen: `ADMIN_ALERT_EMAIL` i Vercel eller branch `admin-alert-recipients-auth-email` / 00188 | [H] env/godkendelse | BLOCKED |
| G-6 | "Kør rykker-tjek nu" på go-live-siden sender rigtige rykkere uden bekræftelse/loft | dev | DONE eb94707c — bekræftelse + fælles loft `MAX_REMINDER_MAILS_PER_RUN` (3) |

### Pilot-uge-risici
| # | Opgave | Ejer | Status |
|---|---|---|---|
| P-1 | Mobil hamburger-menu ignorerer rettigheder (Mail/Tilbud for montør/salg/bogholderi → "ingen adgang") | dev | DONE eb94707c |
| P-2 | Interne beskeder (/dashboard/inbox) har intet menupunkt | dev | DONE eb94707c ("Beskeder") |
| P-3 | Tilbudsmail sendes uden PDF uden at brugeren får besked (`email.ts` "Continue without PDF") | dev | DONE eb94707c — klar fejl, mailen sendes ikke |
| P-4 | Go-live-tjeklisten: selvregistrerings-tjek, P-009-incident forældet (Pilot Health altid rød), menulink + admin-guard, `is_active` i montør-tjek | dev | DONE eb94707c |
| P-5 | 00186 bogholderi-mail-scope / 00211 / 00207 / 00204 sikkerhedspakke | [H] godkendelse | BLOCKED_APPROVAL |
| P-6 | Vercel-flag `INVOICE_ATTACHMENT_FETCH_ENABLED` (godkendt 09-29, ikke sat) og `MONTOR_START_JOB_ENABLED` | [H] Vercel | BLOCKED |
| P-7 | Kunde-mail-crons under pilot (rykkere/tilbudspåmindelser sender i dag intet), N74b auto-kunder, N69 "kræver svar", e-conomic (N12) | [H] beslutninger | BLOCKED |
| P-8 | Arbejdskost-modellen (`docs/design/labour-cost-model.md` §5: 4 spørgsmål) | [H] beslutning | BLOCKED |

### Leverandørfaktura-kontrol (review 2026-10-14)
| # | Fund | Status |
|---|---|---|
| L-1 (S1) | Parseren læste "Momsgrundlag" som moms og "Subtotal" som total; ingen konsistenskontrol | DONE — ordgrænser, sidste "I alt", konsistens (ekskl.+moms=inkl., moms ≤ 25 %) → manuel kontrol + bogføring blokeres (`invoice-parser-test` 10/10, `economic-supplier-draft-test`) |
| L-2 (S1) | Kreditnotaer bogført som positive fakturaer (fortegn tabt) | DONE — fortegn/"Kreditnota" → negative beløb (negative linjer i e-conomic), altid manuel kontrol |
| L-3 (S1/S2) | Valuta altid DKK (kolonnestandard vandt over parseren) | DONE — fremmed valuta gemmes, kræver kontrol, bogføring blokeres |
| L-4 (S2) | Genlæsning slettede en manuel sagskobling | DONE — eksisterende kobling bevares |
| L-5 (S2) | Konvertér+godkend tjekkede ikke statusskiftet | DONE — rækketjek + tilbagerulning af kørslens konverteringer |
| L-6 (S2) | Afvisning af godkendt faktura efterlod kost på sagen; afvisning under e-conomic-bogføring blev overskrevet | DONE — afvisning blokeres ved konverterede linjer / aktivt bogføringskrav; "bogført" kun med eget krav |
| L-7 (S2) | Fakturahoved (nr., dato, beløb, valuta) kan ikke rettes i UI'et | DONE — "Ret fakturahoved" på detaljesiden (`editIncomingInvoiceHeaderAction`, `incoming_invoices.edit`, kun ikke-afsluttede, audit `header_edited`, samme beløbsregel som parseren; `invoice-header-edit-test` 15/15, UI U149) |
| L-8 (S3) | Priskontrol overså merbetaling på lave enhedspriser | DONE — linje-tolerance (25 kr) ud over enhedstolerance (`invoice-control-test`) |
| L-9 (S3) | price_history uden paginering (forkert "gammel" pris) | DONE — fetchAllRows sorteret |
| L-10 (S3) | Gensendt rettet faktura (samme nr. som en afvist) annulleres som dublet (unik-indeks inkl. afviste) | BLOCKED_APPROVAL — udkast 00221 på branch `l10-rejected-dup-00221` (indeks uden rejected/cancelled + matcher: samme nr. som afvist → manuel kontrol). Staging `cli.ts rejected-dup` 5/5 (negativ kontrol ok). Prod read-only `prod-check-00221.ts`: latent (0 tilfælde) |
| L-11 | Konvertér+godkend kræver både `incoming_invoices.approve` og `materials.add_to_case` → kun admin; bogholderi kan ikke | [H] beslutning (rettighedsmodel) |
| L-12 | RLS lader admin/bogholderi ændre status/external_invoice_id direkte via REST (ingen overgangs-trigger); backfill-kandidater upagineret | LATER |

### Profit Engine (review 2026-10-14)
| # | Fund | Status |
|---|---|---|
| PE-1 (S1) | `calculate_work_order_profit` tæller kun timer (materialer kun via work_orders.source_offer_id, som aldrig sættes) og prissætter timer med live sats i stedet for sale_amount → forkert low_profit / AI-indsigter | BLOCKED_APPROVAL — udkast 00222 på branch `profit-engine-00222` (erstatter 00205): kost = timer + materialer/øvrige på ordren, omsætning = netto faktureret (kreditnotaer via original; kladder aldrig) ellers frossen timesalg + fakturerbare linjer. Staging `cli.ts wo-profit` 7/7 (negativ kontrol: 6 fejl før). Prod: latent (3 arbejdsordrer, 0 snapshots) |
| PE-2 (S2) | Profit-snapshots forældes (kreditnotaer når dem aldrig; timer/materialer efter "udført" opdaterer ikke) | BLOCKED_APPROVAL — i 00222: snapshot ved kreditnota/statusskift og ved kost-linjer på udført ordre; uændrede tal giver intet nyt snapshot |
| PE-3 (S2) | Tilbudt-vs-faktisk: arbejdslinjer uden kost tæller 0 på tilbudssiden men fuldt på faktisk-siden | TODO — afhænger af arbejdskost-modellen (P-8) |
| PE-4 (S2) | Lav-DB-afsendelsesværn tæller manglende arbejdskost som 0 og bruger anden tærskel end profitkortet | TODO — afhænger af P-8 + én tærskel |
| PE-5 (S2) | Medarbejderøkonomi talte salg på ikke-fakturerbare timer | DONE |
| PE-6 (S3) | Sagens hoved-DB bruger registrerede salgspriser i stedet for kontraktsum på kontraktsager | DONE — `lib/cases/expected-revenue.ts`: kontraktsum (revideret først, ekskl. moms), netto faktureret hvis højere, ellers registreret salg; Økonomi-fanen viser grundlaget (`case-revenue-test` 7/7, UI U150+U91) |
| PE-7 (S4) | DB-tærskler hardcoded og forskellige (10/15/db_red_threshold/minimum_db) | DONE (app) — `lib/profit/db-thresholds.ts` (calculation_settings, standarder = hidtidige 10/20/35; sags-flag/-farver, AI-risiko, afsendelsesværn); `db-thresholds-test` 7/7. Rest: SQL-trigger 15 % → med PE-1; minimum 20 vs. rød 10 → [H] beslutning |

## Prod-kørsel 2026-10-14 — 00218–00220 (Henrik: "GODKENDT TIL PROD")
| Nr. | Pre | Post | UI/tests |
|---|---|---|---|
| 00218 Del med kunde | 18 dokumenter, 15 portal-synlige, 3 mail-arkiv | kolonne findes; 15/15 eksisterende stadig delt; mail-arkiv 0 delt; ny manuel række intern; "Del med kunde" → i portalens forespørgsel; tjeksum uændret (16f2c95d); fuldmagter filtreres fortsat | customer-docs-share-check 5/5; portal-mail-UI 34/34; U61/U64/U65/U69/U22/U23/U25 |
| 00219 Kalkulationsrækker | 9 rækker (0 skjulte) | backfill ok; visible+hidden_included tæller, excluded ikke (12.000); total 16.200; DB efter avance/rabat 5.760; kalkulations- og ikke-kladde-tilbudstjeksummer UÆNDREDE (a0d8617b / f1d883ec) | calc-offer-mode-check 4/4; ren funktion `lib/offers/calc-import-lines` + unit-test 12/12 ("Øvrige materialer og ydelser" med kost); kalkulations-UI 9/9 |
| 00220 Notifikationer | kolonne mangler | kolonne + kolonne-grant (kun 4 eksisterende + notification_preferences); 0/5 profiler har noget slået til (alt FRA); egne kan gemmes, andres ikke; rolle kan ikke ændres | notify-prefs-check 7/7 (test-transport — ingen live-mail); U148 |
| DB-audit | — | HØJ=0 · MIDDEL=0 · LAV=0 | prod-version e9d010c |


## Henriks beslutninger 2026-10-10 — status
| # | Beslutning | Status |
|---|---|---|
| 1 | 00212–00217 til prod | DONE (se prod-kørsel nedenfor) |
| 2 | Kundedokumenter interne som standard ("Del med kunde") | Bygget + staging-testet på branch `customer-docs-share-00218` → **BLOCKED_APPROVAL** (migration 00218) |
| 3 | GDPR eksport/anonymisering | NEXT efter pilot (ikke go-live-blocker) |
| 4 | Kalkulationsrækker: skjult-men-medregnet vs. udeladt | Bygget + staging-testet på branch `calc-offer-mode-00219` → **BLOCKED_APPROVAL** (migration 00219) |
| 5 | Rumberegner: timepris = salgspris | DONE i prod (5496e2d; profit-simulatoren samme model; kostsats FALLBACK_COST_RATE 400). NB: hurtigkalkulationens arbejdskost er 295 kr/t (lærlingesats) — afviger fra 400; afklares ved lejlighed |
| 6 | Notifikationsindstillinger implementeres | Afsendere på main (DONE, springer over uden kolonne); side + kolonne på branch `notify-prefs-00220` → **BLOCKED_APPROVAL** (migration 00220) |
| 7 | CLAUDE.md: GatewayAPI/SMS ikke implementeret | DONE |
| 8 | U73 | DONE — adgangskontrollerne var korrekte (data fandtes; montør-scope ok); testen ventede på et netværkssvar der ikke altid blev opfanget → nu deterministisk via DOM (`case-time-totals`); 3/3 grønne |

## Prod-kørsel 2026-10-10 — 00212–00217 (Henrik: "GODKENDT TIL PROD")
| Trin | Resultat |
|---|---|
| Pre (rollback, rigtige personaer; salg simuleret inde i transaktionen) | `prod-flow-check-00212-00217.ts pre`: alle huller åbne som forventet (00214: 0 afvigende kunder i dag — forebyggende) |
| Migration + post pr. nummer | 00212 montør 1589→0 rækker (admin uændret) · 00213 case-flyt/annulleret→done 42501, afslut egen ordre OK · 00214 0 afvigelser · 00215 linje/rabat/forslag 42501, noter + kladde OK · 00216 109,42→109,41 · 00217 profilnavn, omskriv 42501, markér læst OK |
| Samlet post + tidligere flows | 15/15; 00208 10/10; 00198–00202 4/4 |
| DB-audit | HØJ=0 · MIDDEL=0 · LAV=0 |
| UI (staging, alle seks aktive) | smoke 8/8; tidligere: sales+portal 71/71, montør 23/23, beskeder U2/U11/U21 |

## CHECKPOINT 2026-10-10 ~01:00 (long-run)
- Reviews afsluttet og rettet siden 2026-10-09 eftermiddag: AI-mail, crons/alarmer, planlægning, rapporter/KPI, tilbudsforløb,
  kundemodul, IDOR-sweep, kalkulation (tabeller nedenfor). Fire læk-rettelser deployet direkte (besigtigelses-send, kundeskift på
  tilbud, fuldmagts-CPR i dokumentlister, rumberegner-kost).
- Nye BLOCKED_APPROVAL-udkast (alle staging-verificeret): 00212 health-log, 00213 arbejdsordre-guard, 00214 betalingsoversigt,
  00215 tilbuds-lås i DB, 00216 tilbudsafrunding — se docs/runbooks/HENRIK-DECISIONS-2026-10-08.md.
- UI-regression i dag (gruppevis): portal-mail 34/34, montør 23/23 (+guard), økonomi+smoke 38/38, sales+portal 71/71 (+00215/00216),
  montør+økonomi 54/55 (U73: kendt timing-flake i montør-tidsdata-delen), kalkulation 21/21, kunde-subset 10/10.
- Prod-version tjekkes via /api/public/version.

## Long-run 2026-10-10 — kommunikation (interne beskeder, portalchat) (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| KOM #3 (S2, PROD-REGRESSION) medarbejderes chat-upload brugte bruger-sessionen mod portal-attachments → fejlede efter 00209 | DONE (deployet) — service-klienten bag customers.edit. Sweep: ingen andre bruger-session-storagekald | U22/U23/U25/U92/U98 |
| KOM #1 (S2) chat-vedhæftninger: gemt 1-times link → døde links dagen efter | DONE — signeres friskt ved læsning (kun kundens mappe) | samme |
| KOM #5/#7/#8 skriv til kunde kun customers.edit + længdeloft; portal-afsendernavn fra token; medarbejder-læsning gated + UUID | DONE | samme |
| KOM #6 over 1.000 beskeder forsvandt de nyeste | DONE — nyeste 500, kronologisk | samme |
| KOM #4 interne beskeder: falsk afsendernavn; modtager kunne omskrive beskeden | **BLOCKED_APPROVAL** 00217 på branch `messages-integrity-00217` | `cli.ts messages-integrity-check` pre 2 huller → post 3/3; U2/U11/U21 med 00217 |
| KOM #2 portal-ratelimit/notifikation ikke atomisk (parallelle kald) | LATER — DB-lås/RPC (migration) | — |
| SMS: ingen GatewayAPI-kode i src (kun Relatel-stub) — CLAUDE.md's "SMS-notifikationer (GatewayAPI) ✅" er forældet | INFO til Henrik | — |

## Long-run 2026-10-10 — kalkulationsmotor (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| C #9b (læk) rumberegnerens calculateProject gav kost/DB til alle indloggede | DONE — tools.calculations | tsc/gates |
| C #1 (S2) kundens leverandørrabat droppet når en avanceregel fandtes (søgning 112,50 vs. linje 125,00) | DONE — fælles `supplierLinePricing` (rabat altid; regel → aftale-avance → produkt) | kalkule-UI |
| C #2 (S2) opdatér leverandørpris ændrede prisen ved uændret kost (regel/fast tillæg tabt, 0 % → 25 %, kost-betydning forskellig) | DONE — samme funktion; cost_price = faktisk indkøbspris ved både oprettelse og opdatering | kalkule-UI |
| C #5 (S2) starter-linjer/billigste match til 0 kr (0-kost fra live-import) | DONE — 0-kost vinder aldrig, starter-linje springes over, live-import uden pris oprettes ikke | tsc/gates |
| C #6 "Konverter til tilbud" på kalkulationssiden fejlede altid (forkert tabel) | DONE — `createOfferFromCalculationRecord` (kladde + importCalculationToOffer, rulles tilbage ved fejl) | kalkule-UI |
| C #3 skjulte rækker ("Vis på tilbud" fra) falder ud af tilbudstotalen (kalkulation 14.400 → tilbud 12.000) | FORRETNINGSVALG — skal skjulte rækker indgå i prisen (samlelinje) eller ej? | — |
| C #4 hurtigkalkulation anvender ikke komponent-varianter/kompleksitet (fx beton ×1,8) | NEXT — feature-hul (varianter er kun et navn i dag) | — |
| C #8 rumberegnerens "Timepris" behandles som KOST og lægges der avance på (495 × 1,15 × 1,25 ≈ 712 kr/t) | FORRETNINGSVALG — er feltet kost (≈400) eller salgspris? | — |
| C #9a kalkulationens dækningsbidrag ignorerer kalkulationens avance/rabat (DB-trigger 00015) | LATER — migration | — |
| C #7 + dormant Kalkia Pro-motor (ikke nåbar fra UI) | LATER — ryd op eller ret før den aktiveres | — |
| Søgningens "estimeret salgspris" bruger ikke avanceregler (estimat) | LATER — kan bruge supplierLinePricing pr. resultat (pris pr. kald) | — |

## Long-run 2026-10-09 — IDOR/scope-sweep af server-actions (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| I #2 (S2→S1-klasse: CPR) kundens og sagens dokumentlister returnerede fuldmagtens description med fødselsdato/CVR, underskrift og e-mail til alle med customers.view (montør) | DONE (deployet direkte — lukker læk) — `lib/documents/safe-description.ts` (kun ufølsomme felter) i kundedokumenter + sagsdokumenter | tsc/gates |
| I #1 createFuldmagt uden sag-scope (montør kunne oprette fuldmagt på enhver kunde/sag) | DONE — UUID + userCanViewCase (+ eksisterende sag↔kunde-tjek) | tsc/gates |
| I #3 tagtegninger: læse-ret var nok til at overskrive/slette enhver kundes tegning | DONE — customers.edit eller sag i scope der hører til kunden | tsc/gates |
| I #4 tilbudsmail-tråde/beskeder læsbare med login alene | DONE — offers.view | tsc/gates |
| I #5 sags-økonomi (kontraktsum/udestående) uden sag-scope for salg | DONE — userCanViewCase / getCaseScope-filter | tsc/gates |
| I #6 sagskontakter uden sag-scope | DONE | tsc/gates |
| I #7 ugatede 'use server'-eksporter (bekræftelser, hændelseslog, hurtig-kunde fra mail) | DONE — gates + forældede RBAC-undtagelser fjernet. route-preview/mail-route-resolvers kun server-importeret (cron uden session) → uændret | check:rbac |
| I #8 materiale med fremmed sags arbejdsordre | DONE — arbejdsordren skal høre til sagen | tsc/gates |
| RLS `USING (true)` på email_threads/messages, customer_documents, roof_drawings, case_materials m.fl. | LATER/BLOCKED_APPROVAL — DB-stramning når app-gates er på plads (samme mønster som 00204/00207) | — |
| Prod-overblik 2026-10-09 (`prod-open-select-tables.ts`): 102 tabeller læsbare for alle indloggede. Hemmelige kolonner (portal-/partner-/bekræftelses-tokens, integrations-/e-conomic-nøgler, leverandør-credentials) er LUKKET (`prod-secret-column-privs.ts`); kostkolonner på supplier_products/product_catalog/offer_line_items lukket (`prod-cost-column-privs.ts`). Stadig åbne kostdata: `packages` (00207-udkast) og `kalkia_calculation_rows.labor/material/total_cost` (ny kandidat). Følsomme rækker åbne: offer_signatures (underskrift + IP), portal_messages, email_*/sms_messages, customer_documents.description (fuldmagter — app filtrerer nu) | LATER — samlet RLS-plan pr. tabel (rolle + scope) til Henrik | scripts ovenfor |

## Long-run 2026-10-09 — kundemodul (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| K #1 (S2) kundekortets postkasse/forløb brugte klientens e-mail (direkte kald: læs vilkårlig postkasse; kunder gemt med kontakt@ viste hele postkassen inkl. leverandørkost); getCustomerFlow uden gate | DONE — adressen læses fra kunden, egne/pladsholder-/formular-adresser matches ikke, UUID-validering, gate | kunde-UI |
| K #2 (S2) manuelt uploadede kundedokumenter vises straks i portalen; montør/bogholderi kunne uploade til enhver kunde | DONE app: upload kræver customers.edit. **FORRETNINGSVALG + migration**: `visible_in_portal`-flag (default skjult for manuelle uploads) | — |
| K #3 (S2) prisaftaler kunne ikke rydde felter (avance/udløb blev ved at gælde); rabat uvalideret; klientdata spredt i rækken | DONE — eksplicit række (NULL), validering (rabat 0–100, avance, datoer) | tsc/gates |
| K #4 deleteCustomer: fejl talte som 0 (sletning kaskadede); manglende avanceregler | DONE — fail-closed (HEAD-fejl gentages for fejlkode), avanceregler + faktura-roller med | `cli.ts customer-delete-refs-probe`, U135 |
| K #5 mail fra kundekort koblet til vilkårlig kunde med samme adresse | DONE — kortets kunde-id sendes med | tsc/gates |
| K #6 opgaver: læsning uden gate; montør/bogholderi kunne slette/ændre enhver opgave | DONE — customers.edit eller egne opgaver; læsning gated | kunde-UI |
| K #7/#8 adresser/emner i logs; ?page=-1/sortBy fra URL | DONE | tsc/gates |
| K (gap) ingen GDPR-eksport/anonymisering eller kundefletning | FORRETNINGSVALG — design ved behov | — |

## Long-run 2026-10-09 — tilbudsforløb (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| T #1 (S1) kundeskift på kladde flyttede ikke parti-roller → tilbud + portal-token for kunde B mailet til kunde A (og sag/faktura til A) | DONE (deployet direkte — lukker læk) — parti-roller på den gamle kunde følger med; mail-routing "samme som kunden" bruger tilbuddets kunde. Prod: 0 berørte tilbud (`prod-offer-party-mismatch.ts`) | tsc/gates; sales/portal-UI |
| T #2 (S2) tilbud konverteret til sag kunne sættes tilbage til kladde og omprisses (sagen beholdt gammel kontraktsum) | DONE — kladde blokeret når converted_case_id er sat | sales-UI |
| T #3 (S2) portal-accept ikke bundet til det beløb kunden så | DONE — siden sender beløb + sent_at; accept afvises hvis ændret; compare-and-set på final_amount | portal-UI |
| T #4 (S2) kladde-lås og sletteregel kun i appen (salg via REST: ændre linjer på accepteret tilbud, slette underskrevet tilbud via is_proposal) | **BLOCKED_APPROVAL** 00215 på branch `offers-lock-00215` (triggere, ikke politikker) | `cli.ts offers-lock-check` pre: alle huller bekræftet |
| T #5 admin kunne slette accepteret/underskrevet tilbud | DONE — kun kladde/afvist (compare-and-set) | tsc/gates |
| T #6 portal-accept uden server-validering af underskrift | DONE — navn/e-mail/PNG-data med grænser | portal-UI |
| T #7 udløbet tilbud kunne sendes; afvist→kladde beholdt afvisningen | DONE | tsc/gates |
| T #8 createLineItem tog kostfelter fra salg | DONE — som updateLineItem (D43) | tsc/gates |
| T #9 1-øres afrundingsforskel trigger vs. app | **BLOCKED_APPROVAL** 00216 på branch `offer-rounding-00216` | offers-lock-check: 109,42 (gammel) vs 109,41 |
| T #10 kalkulation→tilbud: fejlet linje-insert efterlod tilbud uden linjer | DONE — rulles tilbage | tsc/gates |

## Long-run 2026-10-09 — rapporter/dashboard/KPI (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| R #1 (S2) cockpittets "Forfaldne fakturaer" + dashboard-API'ets forfaldsliste med fuldt beløb (delbetalt/krediteret) | DONE — fælles `lib/invoices/open-amount.ts` (final − betalt − kreditnotaer); fuldt dækkede udelades. View `v_customer_payment_summary` (00146, kundeliste + betalingsrapport) har samme fejl → **BLOCKED_APPROVAL** 00214 på branch `payment-summary-00214` (samme kolonner; åbent beløb + dansk dato) | economy-UI |
| R #2 (S2) tilbudsværdi tre måder (dashboard subtotal før rabat, rapporter inkl. moms, tragt ekskl. moms) | DONE — ekskl. moms efter rabat (final − tax) overalt | sales-funnel-test ✅, economy-UI |
| R #3 (S2) udestående-porteføljen udelod lukkede sager | DONE — kun konverterede udelades | economy-UI |
| R #4 (S2) AI-forecast talte kladder og AI-forslag + 1.000-grænse | DONE — kun sendte, is_proposal=false, pagineret, ekskl. moms | tsc/gates |
| R #5 (S2) AI "90-dages omsætning" talte alle profit-snapshots (append-only) | DONE — seneste pr. arbejdsordre, pagineret | tsc/gates |
| R #6–#9 projektrentabilitet med forslag; topkunder upagineret + acceptrate inkl. kladder; "sendt"-serien forkert; månedsgraf UTC/upagineret | DONE | tsc/gates |
| R #10 medarbejderøkonomi: rækkefølge efter DB afslørede kost uden løn-ret | DONE — sorteres efter timer efter maskering | tsc/gates |

## Long-run 2026-10-09 — planlægning (arbejdsordrer, kalender, besigtigelse) (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| PL #1 (S1) `sendBesigtigelsePdf`: dokument-id og kunde-id hver for sig → ethvert dokument (intern mailvedhæftning, tilbud, faktura) kunne mailes til en vilkårlig kunde som "Besigtigelsesrapport" (gate kun service.edit = også montør) | DONE (deployet direkte — lukker kun læk) — dokumentet skal tilhøre kunden, være en besigtigelsesrapport (ikke mailarkiv) og sagen være i brugerens scope | tsc/gates; montør-UI-gruppe |
| PL #2 (S2) montør kan via REST ændre alle kolonner på egen arbejdsordre (case_id → lukket sag, annulleret → done, dato/kunde/auto_invoice) | **BLOCKED_APPROVAL** 00213 på branch `work-orders-guard-00213` (BEFORE UPDATE-guard: montør kun status/completed_at fra planned/in_progress) | — |
| PL #3 besigtigelse gemt på vilkårlig sag; lukkede alle kundens "%esigtigelse%"-opgaver (også andre sagers bookinger og interne opgaver) uden completed_at | DONE — sag-scope; kun kundevendte opgaver på denne sag (eller uden sag); completed_at | tsc/gates |
| PL #4 kalenderens sags-vælger kun 200 højeste sagsnumre (inkl. forslag) | DONE — alle åbne, ikke forslag | tsc/gates |
| PL #5 createWorkOrderForCase: status fra klient ('done' direkte), inaktiv/fratrådt medarbejder, forslag-sager | DONE | tsc/gates |
| PL #6 "job uden tid" talte afviste timer som registreret; .limit(500) | DONE | tsc/gates |
| PL #7 besigtigelses-læseactions uden gate (sager/parter/modtagere for enhver kunde) | DONE — service.view + sag-scope | tsc/gates |
| PL #8 portal-besigtigelser: 50 første opgaver før filtrering | DONE — filtrerer på titel før grænsen | portal-mail-UI 34/34 |
| PL #9 slet arbejdsordre uden compare-and-set; kalender valgte UTC-dato; portalens maks-dato i UTC | DONE | tsc/gates |

## Long-run 2026-10-09 — AI-mailautomatik + crons/alarmer (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| M #1 (S2) mails indsat af en kørsel der døde blev aldrig linket/analyseret (DUPLICATE SKIP) — passer med ~59 'pending' i prod | DONE — backfill af 'pending' + processed_at NULL (14 d), AI-budget 60 mails/kørsel, email-sync maxDuration 300 | `cli.ts mail-backfill-probe` (staging 55 ubehandlede) |
| M #2 sendte mails tabt efter mislykket kørsel (last_sync_at flyttet ved fejl) / >25 pr. kørsel | DONE — cursor = kørslens start og kun ved succes; nextLink-paginering (10×50) | tsc/gates |
| M #3 AI-dagsloft tabte optællinger (læs-så-skriv, fire-and-forget) | DONE — compare-and-set med backoff, awaited alle steder. Atomisk RPC = senere (migration) | `cli.ts ai-budget-concurrency-check` 20 → +20 |
| M #4 én afsender kunne fylde kundelisten/brænde AI-budget | DONE — 25 auto-oprettede kunder/døgn + 60 mails/kørsel | tsc/gates |
| M #6 vedhæftninger med samme navn overskrev hinanden; afsenderens content-type (html/svg) stolet på; ingen størrelsesgrænse | DONE (begge uploadstier) — index-præfiks, aktive typer → octet-stream, 25 MB | tsc/gates |
| M #7/#8 mailagent: genkørsel lavede tomme runs; case-følsomt e-mail-match; HTML-mails gav 200 tegns udkast | DONE | tsc/gates |
| M (fund) mailvedhæftninger: prod 123/123 gemte links er `/object/public/`-links til den PRIVATE bucket → døde links i mail-UI'et; nye mails fik 1-års signerede links | DONE — detaljer (mail + sag) signerer friskt 1 t fra storagePath (kun mailens egen mappe / kundens outbound-mappe), listen bærer ingen links, intet link gemmes længere (heller ikke i customer_documents ved arkivering); faktura-ingest henter via storagePath og gemmer `attachments/<sti>`. Blanking af de gamle (ubrugelige) links er kosmetik — ikke sikkerhed | `cli.ts mail-attachment-links-check` 3/3; `prod-mail-attachment-url-kinds.ts` |
| C #1 (S2) bank-match læste de 500 ældste 'unmatched' (udbetalinger/umatchbare) → nye betalinger aldrig matchet → rykkere på betalte fakturaer | DONE — kun indbetalinger, nyeste først. `last_match_attempt_at` = senere (migration) | tsc/gates |
| C #2 (S2) admin-alarmer scannede 1 t, men kører dagligt → natlige cron-fejl aldrig mailet | DONE — 24 t | tsc/gates |
| C #3 cron med HTTP 200 + `status:'failed'`/`success:false`/`errors[]` logget 'ok' | DONE — bodyStatus → error/warning | `scripts/cron-paused-test.ts` 14/14 |
| C #4 én bell-advarsel pr. ændret vare (≤1.000 rækker) | DONE — én pr. leverandør/regeltype/dag, alle rækker (fetchAllRows) | `cli.ts system-alerts-check` ✅ |
| C #5 faktura-ingest 24 t-vindue mistede fakturaer synket sent | DONE — 72 t, nyeste først (idempotent) | tsc/gates |
| C #6 pauset cron loggede uautoriserede kald | DONE — 401 uden secret | cron-paused-test |
| C #7 system_health_log læsbar for alle indloggede (postkasser, bank-id'er, modtagere) | DONE app (dashboard-stats kun drift-roller). **BLOCKED_APPROVAL** 00212 på branch `health-log-00212` | — |
| C #8 notifikationsindstillinger gemmes men læses aldrig | FORRETNINGSVALG — implementér i afsendere eller skjul siden | — |

## Long-run 2026-10-08 — partner-/offentlige links + leads-tragt (review-fund)
| Fund | Status | Bevis |
|---|---|---|
| P #1/#4 integrations-webhook: rå offer_id/nummer → vilkårligt tilbud; 'draft'/'accepted' via webhook; fejlet auth fyldte integration_logs; ingen hård body-grænse | DONE | `cli.ts integration-webhook-check` 5/5; prod 0 integrationer (`prod-integrations-usage.ts`) |
| P #2 fuldmagt: samtidige underskrifter overskrev hinanden | DONE — compare-and-set krav ('signing') før PDF, frigives ved fejl, >10 min = afbrudt; 'signing' vises som ventende | `fuldmagt-sign-race-check` 5/5 + `portal-fuldmagt-leak-check` 4/4 |
| P #3 /api/public/contact uden grænser (nøglen er reelt offentlig) | DONE — 30/t globalt, dublet pr. e-mail 10 min, honeypot, hård body-grænse | `public-contact-limit-check` 4/4 |
| P #5 bekræftet besigtigelseslink viste PDF/persondata for evigt | DONE — efter udløb kun kvittering | `confirmation-expiry-check` 3/3 |
| P #6 partner-adgang uden udløb | DONE — standard 365 dage | tsc/gates |
| L #1 accept markerede ALLE kundens åbne leads vundet; vundet var irreversibelt | DONE — kun tilbuddets lead (uden lead_id: kun ved præcis ét åbent); won → negotiation; betinget statusskift | `lead-pipeline-check` 7/7 |
| L #9 leads kom aldrig i "Tilbud sendt" | DONE — begge sendeveje | samme |
| L #2 salgstragt: annulleret original + kreditnota trukket fra to gange | DONE — følger summarizeCaseInvoices | `sales-funnel-test` |
| L #3/#4 kunde fra mail lavede dublet-lead og leads uden customer_id | DONE | tsc/gates |
| L #5 noteret opfølgning fjernede ikke leadet fra "uden opfølgning" | DONE — aktivitet rører leads.updated_at | — |
| L #6 samtidige "Opret lead fra mail" | DONE app-niveau (ældste vinder, egen dublet fjernes). **BLOCKED_APPROVAL** (udkast 00204 på branch `leads-00204-read-scope`, prod-pre 0 dubletter): unikt delvist indeks `leads ((custom_fields->>'source_email_id')) WHERE … IS NOT NULL` (prod-dubletter tjekkes før) | — |
| L #7 konvertering ignorerede fejl ved kobling | DONE | — |
| L #8 lead-læsninger uden leads.view (aktivitetsoversigt, global søgning, besked-vælger) | DONE app. Prod: `leads`/`lead_activities` SELECT = `true` for authenticated (`prod-table-select-policies.ts`) → **BLOCKED_APPROVAL**: rolle-scopet SELECT (user_role() IN admin/serviceleder/montør/salg) | — |
| L #10 dublet-tjek uden telefon | DONE — sidste 8 cifre uanset format | `lead-phone-dupe-probe` |
| L #11 kundekortet fandt kun leads via e-mail | DONE — også custom_fields.customer_id | — |
| L #12 relatel-opslag `.limit(5000)` (=1.000) | DONE — side for side | `relatel-lookup` 3/3 |
| P1 selvregistrering | VENTER Henrik — 2026-10-08 stadig `disable_signup:false` | `prod-auth-signup-status.ts` |
| Ø #1 kreditnota sendt pr. mail annullerede ikke originalen | DONE | tsc/gates |
| Ø #2 e-conomic-eksport uden krav (dobbelt bogføring) | DONE — `pending-<ms>`-krav, afbrudt efter 15 min | tsc/gates (e-conomic ikke sat op) |
| Ø #3/#5/#6/#7 bankmatch mod kladder/kreditnotaer; tabt betaling ved samtidighed; refusion låste transaktion; "betalt" ignorerede kreditnotaer | DONE | `register-payment-check` 3/3 |
| Ø #4 + rater: samtidige kreditnotaer/rater kunne overstige 100 % | DONE | `credit-race-check`, `stage-race-check` |
| Ø #8 fakturaoverblik: udestående = fuldt beløb | DONE | — |
| Ø #9-#12 kladde slettet/redigeret under afsendelse; slutfaktura > 1.000 rækker; .in() > 350 | DONE | `draft-delete-claim-check` 3/3, `invoice-pipeline` 10/10 |
| Ø lav: manuelt betalt uden payment_status; rapport-summer upaginerede | DONE | — |
| Ø avance fra kladde-faktura (calculate_work_order_profit) | **BLOCKED_APPROVAL** — udkast 00205 på branch `profit-rate-00205` | — |
| M #1/#3 rykker: dræbt kørsel efter afsendelse → dublet; eskalering rullet tilbage dagligt; intet loft pr. kørsel | DONE — in_flight-log, manual_review tæller, 3 mails/kørsel | `reminder-reconcile-check` 6/6 |
| M #2 tilbudsmail: timeout → 'failed' + gensend; dobbeltklik | DONE — 'Ukendt udfald' uden gensend, ældste udgående vinder | — |
| M #4 automatik-mail med ukendt udfald frigav pladsen | DONE | — |
| M #5 sats på godkendte timer uden ny godkendelse | DONE app; DB-trigger i udkast 00205 (BLOCKED_APPROVAL) | `time-log-guards-test` |
| M #6 Cc/Bcc blev aldrig sendt | DONE | — |
| M #7 besigtigelse: mail før opgave, timeout = fejl, gate customers.view | DONE — opgave er kravet, customers.edit | `besigtigelse-task-test` |
| M #8/#9/#10 portalbesked til fremmed tilbud; rykker til deaktiveret kunde; historik-modtager; ICS efter kl. 22 | DONE (rolle-gaten på portalbeskeder uændret — forretningsvalg) | `ics-end-test` |
| L #1 leverandørfaktura bogført to gange i e-conomic (auto ved godkendelse + klik) | DONE — krav `pending-<ms>` | — |
| L #2 dobbelt kost ved samtidig linjekonvertering | DONE — bindingen er kravet | `invoice-line-convert-race-check` |
| L #3 **pakkeelementer fejlede for ALLE roller i prod siden 00201** (embed af product_catalog.cost_price → 42501) | DONE (S2-regression) | `package-embed-probe` (5 personaer: gammel 42501, ny ok) |
| L #4 pakke kunne indsættes i sendt/accepteret tilbud | DONE — redigeringslås | — |
| L #5/#6 kostpris 0 (ingen prisaftale) overskrev kendt kost (live-søgning, CSV, FTP) | DONE | — |
| L #7 kundeaftaler aldrig brugt i auto-tilbud/materialekatalog (forkert RPC) | DONE app. **Fund:** `get_customer_product_price` ignorerer rabat når aftalen ikke har egen avance (`record IS NOT NULL`) → **BLOCKED_APPROVAL** udkast 00206 på branch `customer-price-00206` | `customer-price-rpc-check` |
| L #8 genparsning genåbnede godkendt faktura; afvisning overskrev samtidig bogføring | DONE | — |
| L #9 samtidige prissyncs (cron + "Kør nu") | DONE — krav pr. leverandør, død efter 30 min | — |
| A #1 assistenten viste/handlede på sager uden for brugerens sags-scope (salg) | DONE — samme scope som CRM; arbejdsordre kun med rettighed | `assistant-case-scope-check` 3/3 |
| A #2/#5 rykkerloft omgået af regelmotoren; regelmotoren udførte uden krav ved DB-fejl | DONE (fail-closed) | `automation-claim-check` |
| A #3/#7 dobbelte påmindelser ved overlappende kørsler; genleveret Telegram-update udført to gange | DONE — krav før afsendelse; update_id-markør | `telegram-update-dedupe-check`, `notes-reminders-flow` |
| A #4/#10 "kl. 7" efter kl. 7 → i dag (aldrig sendt); "I dag" på sommertidsdøgn | DONE | `assistant-parser-test` |
| A #6/#8/#9 tale for deaktiverede/montør; præcist kundetræf overset; .in() > 350 | DONE | `assistant-resolve-check` |
| Kost-lockdown-audit (00192/00200/00201, alle læsesteder) | Ingen flere 42501-regressioner; ét kosmetisk: salg så "0 elementer" på pakker (antal hentes nu med admin-klienten, ingen kost). Sidefund (LATER): `packages`/`v_packages_summary` udstiller stadig total_cost_price/db_amount via REST for salg (appen skjuler dem) — kræver migration | agent-audit |
| P #2 Auth/rolle slået op igen for hver gate (10× på ordresiden) | DONE — request-scoped `cache()` (getUser, getUserRoleForPage, rolle i action-helpers) | UI-regression |
| P #7/#4/#8 mail-leads hentede alle mail-leads; prissync/intelligence-check uden maxDuration | DONE | `leads-json-in-probe` |
| P realtime: én fuld genindlæsning pr. ændret række + forældet closure (indbakken kunne vise gammelt filter efter en realtime-hændelse) | DONE — debounce 1,5 s + seneste callback | UI-regression |
| P #1/#3/#5/#6/#9/#10 "kræver svar" genberegnes pr. kald; dashboard-widgets i kæde; 25× lukkeklar-tjek; tællinger via hele tabeller; faktura-/ufaktureret-summer i JS | LATER — prod-volumen lille (5 leads, 109 kunder, 15 tilbud, ~800 mails); bedste løsning er DB-aggregater/visninger (kræver migration) eller samlet server-hentning af widgets | — |
| HR #1 (S1) time_logs skrivbar på alle kolonner via REST (egne timer: beløb, fakturabinding, sats) | **S1 CLOSED** — 00208 i prod 2026-10-09 (Henrik godkendt). 00205 var ikke kørt; guard-delen fjernet fra 00205-udkastet (00208 er overmængden) | prod `prod-flow-check-00208.ts` pre 10/10 (hul bekræftet med rigtig montør) → post 10/10 (42501 på beløb/faktura/snapshots/kollegas+inaktiv sats; egen sats + sluttid nulstiller godkendelse; ny registrering virker; kun 6 UPDATE-kolonner); `prod-flow-check-00198-00202` 4/4; db-audit 0/0/0; staging pipeline/afviste/grants grøn, UI 16/16 |
| HR #2 fire-øjne (indtaster = godkender) | BLOCKED_DECISION/migration (`created_by` på time_logs) | — |
| HR #3/#4/#5/#6/#7 godkendelse af ubeset ændring; afvisning af fakturerede timer; afviste timer i totaler; teamproduktivitet afkortet/"Ukendt" | DONE | `week-hours-test` |
| Eksport: tilbud/projekter/kalkulationer afkortet ved 1.000; kalkulationseksport uden gate | DONE | — |
| K #1 (S1) Kalkia "Opret tilbud" ≠ vist pris; #2 import uden avance/rabat/kost; #3 salgspakke på låst tilbud; #4 AI-tilbud fejlede altid; #5 arbejdskost kvadratisk; #6 sale_price ≠ unit_price | DONE | tsc/gates |
| S #1 (S1) storage-politikker kun på bucket_id (alle kan læse/overskrive alle filer) | **S1 CLOSED** — 00209 + 00210 i prod 2026-10-09 (se prod-kørsel øverst) | `prod-role-check-00209.ts post` 3/3 |
| S #2 (S1) partnerportalen udleverede fuldmagt-PDF (CPR + underskrift) | DONE (deployet) | `partner-fuldmagt-leak-check` 3/3 |
| S #3 besigtigelses-PDF overskrev hinanden (samme kunde, samme dag); #5/#6 upload uden type-/stitjek; #7 portalen signerede fremmede stier | DONE | `portal-token-rules-check` |
| S #4 1-årige signerede links gemt i file_url (læsbare for alle) | DELVIS — nye kundedokumenter gemmer intet link. Gemte links virker til udløb uanset RLS → **BLOCKED_APPROVAL** (dataændring): `UPDATE customer_documents SET file_url = ''` hvor storage_path findes (læsere signerer allerede fra storage_path) + øvrige skrivesteder (fuldmagt, mailvedhæftninger, sagsbilag) — foreslås sammen med 00209 | — |
| C #1 portal-links uden udløb og aktive for deaktiverede kunder | DONE — deaktiveret kunde afvises (også partner), nye links 365 dage, mail genbruger kun links med ≥ 30 dage tilbage | `portal-token-rules-check` |
| C #2/#3 sletning tabte noter/tagtegninger/roller stille; retro-kobling af egne/system-adresser | DONE | — |
| C #4–#7 CSV-import uden skema-validering/dublet-lås; primærkontakt; upload-oprydning | DONE (import: skema i forhåndsvisning + ved indsættelse, dublet-tjek lige før insert, retro-kobling; primærkontakt skiftes efter vellykket insert / ud fra kontaktens egen kunde) | `customer-csv-import-test`, UI 15/15 |
| S #4 rest: lead-vedhæftninger med 1-årigt link i leads.custom_fields | DONE — signeres ved klik (`getLeadAttachmentUrlAction`, kun stier på leadet, leads.view); intet link gemmes (prod: 0 leads med vedhæftninger → ingen dataændring) | U57/U133 |
| Settings #1–#5 (webhook sammenlignede med ciphertext → korrekte kald fik altid 401; nøgler i integration_logs; hemmeligheder til browser; whitelist på firmaindstillinger; e-conomic-notifikation gemtes ikke) | DONE (app); integration_logs-RLS LATENT | `integration-webhook-check` 5/5 m. krypteret nøgle |
| Sager #1 (faktura til betaler), #4–#10 | DONE | `case-payer-invoice-check` 2/2, planning-flow, invoice-pipeline |
| Sager #2/#3 (montør/salg skriver direkte via REST) | **BLOCKED_APPROVAL** 00211 på branch `case-write-rows-00211` | `prod-table-write-policies.ts` |
| Fuld UI-regression 2026-10-09 (efter 00208/00209/00210 på staging + dagens fixes) | smoke/crawl 21/21 · salg 29/29 · montør/økonomi 52/53 · portal/mail 33/33 → 135/136. Eneste afvigelse U73 = kendt flaky positiv kontrol (privatlivstjekket grønt, U44 bekræfter montørens timer). U88 fejlede pga. efterladt harness-sag fra afbrudt kørsel → test gjort robust (kolonneoverskrifter), sag ryddet | harness:ui-batches |
| T11 talebeskeder (fundament) | DONE staging — flag ASSISTANT_VOICE_ENABLED (OFF), ingen live | `assistant-voice-check` 7/7 |
| T12 ubesvaret opkald → tilbageringning | DONE (fundament) — `lib/integrations/relatel/missed-calls.ts`: kun ved præcis én kunde, idempotent pr. opkald, telefonsvarer i beskrivelsen, kalender 📞; Relatel-klienten er fortsat 'disabled' (ingen cron, intet live) | `missed-call-check` 8/8 |

## Prod-kørsel 2026-10-09 (Henrik: "00209 STORAGE LOCKDOWN GODKENDT TIL PROD" + "STORED DOWNLOAD URLS GODKENDT")
| Trin | Resultat |
|---|---|
| Server-side storage-kode live | `/api/public/version` = 7aa4be5 (indeholder 946ba4f) |
| Staging 00209 | `storage-persona-check` 7/7 (5 roller: hverken liste/hente/uploade; service-klient signerer + henter); UI upload/dokument/portal 21/21 |
| Prod pre | `prod-role-check-00209.ts pre`: admin+montør så 158 objekter; 7 brede authenticated-politikker |
| Prod 00209 | COMMIT; post: 0 politikker, admin+montør ser 0 objekter; objektantal uændret (158); `/api/brand/logo` (server-side download fra attachments) 200; `prod:db-audit` 0/0/0 |
| Prod 00210 | pre 11/18 gemte signerede links (alle med storage_path), tjeksum b622c071…; COMMIT; post 0/18, samme tjeksum (kun file_url ændret); staging `fresh-signed-url-check` 3/3 (friskt link virker) |

## NEXT-8 (genereret 2026-10-08 efter review-runde 2 — prod: 109 kunder, 15 tilbud, 8 sager, 5 leads, ~800 mails)
| # | Område | Opgave | Kræver | Status |
|---|---|---|---|---|
| N8-1 | Sikkerhed | `packages`/`v_packages_summary` kost-kolonner (total_cost_price/db_amount) læsbare via REST for salg | migration (00207) | App DONE (getPackages: gate + admin-klient for salg); **BLOCKED_APPROVAL** 00207 på branch `packages-cost-00207` |
| N8-2 | Perf | "Kræver svar" som DB-funktion/visning (én forespørgsel) i stedet for 30–60 kald pr. indbakke-indlæsning | migration | LATER (volumen lille) |
| N8-3 | Perf | Dashboard-widgets hentes samlet i server-komponenten (Promise.all) i stedet for 12 klient-kald i kæde | kode (stor UI-omlægning af 12 widgets) | LATER — gevinst moderat efter auth-cache; få brugere |
| N8-4 | Perf | Dashboard-tællinger/summer som DB-aggregater (leads/kunder/tilbud/timer, ufaktureret pr. sag) | migration | LATER |
| N8-5 | Leverandør | Prissync: kun ændrede varer opdateres — i dag én UPDATE pr. vare | kode | DONE (API-stien: uændrede = én samlet last_synced_at pr. batch) |
| N8-6 | Assistent | T13 SMS/Relatel live-klient (kontrakt findes) | token + godkendelse | BLOCKED_APPROVAL |
| N8-7 | Mail | Rolle-gate for portalbeskeder (montør/bogholderi) | beslutning | BLOCKED_DECISION |

## Prod-kørsel 2026-10-07 aften (Henrik: 00198/00199/00200+00201/00202 GODKENDT TIL PROD)
| Migration | Pre | Post | Flow (rollback) |
|---|---|---|---|
| 00198 faktura fra tilbud → unit_price + data | 6 berørte linjer | 0 berørte linjer | `prod-flow-check-00198-00202.ts`: 2.000/2.500 ✅ |
| 00199 customers.created_by SET NULL | 4/4 (CASCADE, 109 kunder) | 4/4 (SET NULL, 109 kunder) | `prod-flow-check-00199.ts` 5/5: bruger slettet → kunde + kontakt består, created_by NULL, antal uændret |
| 00200 + 00201 kost-lockdown bølge 2 | `prod-role-check-cost-wave2.ts pre` 38/38 (montør læste alt) | `… post` 38/38 (montør 0 rækker i 17 tabeller, cost_price nægtet, offentlige katalogfelter læsbare; admin alt) | personaer salg/serviceleder/bogholderi findes ikke i prod → dækket på staging (`cost-lockdown-check`, `cost-lockdown-2b-check`, 5 roller) |
| 00202 afviste timer i SQL-funktioner | 5/5 (0 betingelser) | 5/5 (1 + 2 betingelser, service_role) | 4/4: avance 2 t, faktura 2 t, afvist ikke bundet, godkendte uændret (500 × 2) |
`npm run prod:db-audit` efter alle: HØJ=0 · MIDDEL=0 · LAV=0. Alt prod-flow kørt i transaktioner der rulles tilbage.

## Beslutninger (Henrik 2026-10-07, aften) — status
| # | Beslutning | Udførelse |
|---|---|---|
| 1 | P1: Henrik slår selvregistrering fra i Supabase; verificér read-only | VENTER på Henrik — `scripts/prod-auth-signup-status.ts` viste 18:0x stadig `disable_signup:false`; genkøres og bekræftes når slået fra |
| 2 | 00199 godkendt til STAGING | DONE staging (se R-CUS-B) — prod BLOCKED_APPROVAL; pre-check 4/4 |
| 3 | Fratrædelse deaktiverer login som standard (bekræftelse, audit, intet slettes, admin kan genaktivere) | DONE — updateEmployeeAction + setEmployeeActiveAction: login først (sidste admin beskyttet), rul tilbage ved fejl, employee_events + audit_logs, fratrædelsesdato = i dag ved overgang, bekræftelsesdialog i Rediger-formularen; genaktivering i login-panelet. **Fund undervejs:** hver "Gem stamdata" AFKOBLEDE medarbejderens login (profile_id → null) — rettet (prod: 0 ramt, `scripts/prod-employee-login-unlinked.ts`). UI U145 + U89 PASS |
| 4 | Kost-lockdown bølge 2 (HIGH) — staging først, rigtige personaer, ingen prod uden approval | STAGING DONE — 00200 (15 tabeller rolle-scopet), 00201 (product_catalog kolonne-niveau uden cost_price; customer_supplier_prices + calculations rolle-scopet; salgsstier → admin-klient bag gate). Persona-tjek: `cli.ts cost-lockdown-check` (user_role() 5/5 + 5 tabeller med data) og `cost-lockdown-2b-check` 10/10; UI U75/U77/U84/U100/U55/U7/U8/U9/U51/U14 PASS. Prod pre-check `scripts/prod-role-check-cost-wave2.ts pre` 38/38 (montør læser alt i dag). **Prod BLOCKED_APPROVAL**: allowlist + apply 00200 → 00201 + `… post` |
| 4b | Fund under regression: medarbejderøkonomi-siden var TOM for alle siden 00192 (service læste time_logs.cost_amount med bruger-klienten → permission denied) | DONE — admin-klient bag action-gaten; U90 PASS |
| 5 | 00198 invoice pricing — HIGH NEXT | STAGING DONE — `harness:migrate-staging -- 00198`; `cli.ts offer-invoice-unit-price-check` 2/2 (sale_price 0 → faktureres til tilbudsprisen, ikke 0 kr) + `offer-invoice-discount` 4/4. Prod-pre: `scripts/prod-offer-invoice-price-exposure.ts` (6 linjer/5 tilbud); **prod BLOCKED_APPROVAL** (allowlist + apply + samme script som post: forventet 0 linjer) |
| 6 | Sendte tilbud immutable, ændring = ny revision, audit, portal viser gældende version | DEL 1 DONE — server-lås på alle 11 redigerende actions (kun kladde; interne noter undtaget), accepteret → kladde fjernet, "Låst" i UI (U146 + salg-regression). DEL 2 **STAGING DONE** (Henrik: 00203 godkendt til staging only): migration 00203 + `lib/offers/revisions.ts` bag flag OFFER_REVISIONS_ENABLED (prod: slået fra = uændret adfærd). Snapshot ved afsendelse (begge sendeveje), 'Ny revision' (kladde R<n>, kæde, kopierede linjer, kun én åben ad gangen, accepteret kan ikke revideres), afløsning ved afsendelse af ny revision, portal viser kun gældende revision + afløst kan ikke accepteres, underskrift bindes til snapshot_id, historikpanel. Test: `cli.ts offer-revisions-check` 18/18 (inkl. snapshot uforanderligt for alle 5 roller), UI U147 + regression U7/U8/U118/U146/U10/U22/U23/U125/U131. **PROD Trin A DONE 2026-10-08** (00203 i prod, flag OFF; post 9/9, tilbud/underskrifter uændrede via tjeksum, roller 6/6, portal-regression med flag OFF grøn). **Trin B klar** — smoke 7/7 (`scripts/prod-smoke-00203.ts`), aktivering venter på Henriks go: docs/runbooks/offer-revisions-activation.md |
| 7 | Afviste timer aldrig på faktura eller i kost/avance | DONE app (14 forespørgsler: fakturakladde/ufaktureret/faktura fra sag (reason 'rejected')/sagsøkonomi/efterkalkulation/rapporter/medarbejderøkonomi/dashboard) + 00202 STAGING (create_invoice_from_work_order + calculate_work_order_profit; staging-drift: service_role EXECUTE) — `cli.ts rejected-hours-check` 4/4. 00202 prod BLOCKED_APPROVAL |
| 8 | Portal limits — efter cost lockdown/00198 | DONE — sendPortalMessage: ≤ 5.000 tegn, ≤ 10 vedhæftninger, ≤ 20 beskeder/time pr. kunde, notifikationsmail højst hver 10. min. pr. kunde (beskeden gemmes altid); uploadPortalAttachment ≤ 20 pr. døgn pr. kunde. Staging `cli.ts portal-limits-check` 4/4 (kun afvisningsstier, ingen mail); portal-UI U10/U22/U23/U25/U41 PASS |
| 9 | T14 + reminder-cron issues — bagefter | Rykker-cron (R-MAIL-B) DONE i kode (latent indtil K1/X4d-resolveren godkendes): #3 rykker viser UDESTÅENDE (final − betalt − sendte kreditnotaer) og springes over ved ≤ 0 (også i getOverdueInvoices/cockpit), #7 tilbudsrykker kun for tilbud sendt ≤ 60 dage, #2 tilbudsrykker kræves før afsendelse, #9 hilsen til routerens modtager + intet forhåndstjek på tilbudskundens e-mail, #6 Graph-timeout = 'uncertain' → rykker-krav frigives ikke (ingen dublet). #11 DONE: regelmotoren kræver (regel, entitet) før handlingen via det unikke indeks — staging `cli.ts automation-claim-check` 3/3. #8 DONE 2026-10-08: afbrudt rykker-krav (tæller hævet, ingen log) genoprettes efter 15 min ud fra invoice_reminder_log; 'sent' og ukendt udfald ('uncertain_timeout') tæller som brugt → ingen dublet — staging `cli.ts reminder-reconcile-check` 4/4 (ingen mail). Agent send_reply: Graph-timeout (ok:false + uncertain) → needs_verification, aldrig auto-retry — unit `agent-sendreply-test` (nu i test:time). **T14** venter på Henriks valg af regler R1–R6 (docs/design/elta-assistant-telegram.md) |

## Beslutninger (Henrik 2026-10-02, efter overnight)
| # | Beslutning | Udførelse |
|---|---|---|
| D24 | Ingen kundekontakt. Dokumentér internt som lukket | LUKKET — se docs/pilot/INCIDENT_LOG.md (P-013) |
| D26 | Sagsfotos/-dokumenter er INTERNE som standard; brugeren vælger aktivt "Del med kunde". 00184 på STAGING, ikke prod | SUPERSEDED — løst af 00218 `visible_in_portal` (prod 2026-10-14); 00184 + branch `d26-internal-case-docs` køres/merges ikke |
| D18 | Montør må IKKE indtaste/redigere kostpriser på øvrige omkostninger; må registrere udgiften/kvitteringen/oplysningen — kostfelter styres af kontorroller | DONE (kode, ingen migration) — serveren gemmer kost/salg = 0 uden prisret (navngivet PRICE_FIELDS_PERMISSION som i case-materials); montørens dialog viser ingen prisfelter men "Priser udfyldes af kontoret" (beløb i note, kvitteringsfoto under Dokumenter — internt jf. D26); kontoret ser "Afventer pris" og prissætter via Rediger (other_costs.edit = admin/serviceleder) |
| D28 | Bogholderi skal se kundemails relevante for kunde/faktura/økonomi, men ikke hele virksomhedens postkasse — least-privilege design på staging | APP DONE (main) + 00186 STAGING DONE · prod BLOCKED_APPROVAL — app: ny tilladelse customers.emails.view (admin/serviceleder/salg/bogholderi); bogholderi ser på kundekortet kun mails KOBLET til kunden (ikke adresse-match), kun læsning (ingen Ny mail/Besvar), mail-body kun for kundekoblede mails; markér-læst kræver nu customers.emails.view (før customers.view — også montør). RLS 00186: bogholderi kun mails med customer_id eller kilde til leverandørfaktura (prod: 805 → 241 mails), kræver 00180 først. rls-read L9/L12 12/12, U61 |
| D27 | Price alerts beholdes som NEXT; korrekt foundation senere; fjern ikke | BLOCKED_APPROVAL — `price_alert_rules` findes ikke i prod (00046 aldrig kørt; docs/runbooks/system-alerts-00194.md). Mangler: Henrik godkender en prod-migration der opretter tabellen, eller bekræfter at prisadvarsler forbliver slået fra. Koden fjernes ikke. |
| N2 | Time approval: montør registrerer → serviceleder/admin godkender. Design på staging; ingen løn/finance-sideeffekter endnu | DONE — 00185 i PROD 2026-10-04 (Henrik-godkendt): pre/post ✅, db-audit 0/0/0, trigger-writes ok, personas ✅ (prod-verify-00185-personas); branch merget til main (U11/U62/U72 grønne) |
| N8a | WARNING (ikke hard block) ved lav DB; tydelig DB/margin-advarsel før tilbud sendes. Hard block først når kostdata er dokumenteret komplette | DONE (kode, ingen migration) — før: knappen "Send Tilbud" var deaktiveret (men "Send email"-linket omgik det) og updateOfferStatus hårdblokerede. Nu: gul advarsel på tilbuddet; send-dialogen viser DB/minimum og kræver afkrydsning "Jeg har set advarslen"; serveren (sendOfferEmail + updateOfferStatus) kræver bekræftelsen (LOW_DB_ACK_REQUIRED) og audit-logger afsendelse med lav DB; manuel "Sendt" spørger. Ren logik i src/lib/offers/low-db-warning.ts (unit: scripts/offer-low-db-test.ts i test:profit); U60 |

**Næste hovedfokus (Henrik 2026-10-02):** 1) D26/00184 på staging · 2) prod-gate-batch klar til samlet deployment · 3) 00180 og 00181 først · 4) én samlet pre/post-runbook for 00175–00183 · 5) ingen live e-conomic-posting uden nøgler/godkendelse · 6) derefter synlige GO-LIVE/NEXT-flows.

## GO-LIVE
| # | Flow | Problem (fundet) | Status |
|---|---|---|---|
| G0 | Medarbejdere/tid | Timeregistrering hardkodet +02:00 → alle timer 1 t forkert fra 25/10 (vintertid); redigering læste klokkeslæt i servertid (UTC) | DONE (kode) |
| G1 | Tilbud → kundeportal → accept | Kunden får "Der opstod en fejl" ved underskrift (webhook-payload kræver login, kastes uden try); intern mail + autopilot køres aldrig; sag/projekt oprettes aldrig fra portalen (kræver bruger-session) | DONE (kode) — webhooks flyttet til server-only service (kaster aldrig; lukker samtidig en ugatet eksporteret webhook-action), tilbud→sag-kerne med service-role og sælgeren som ansvarlig. ui-e2e U10 som kunde UDEN login (negativ kontrol: gammel kode fejler). Legacy-projektoprettelse fra portal uændret (fejler stille som før; projects-modulet er legacy) |
| G2 | Kundeportal | Første klik fra tilbudsmail sender kunden tilbage til oversigten (samme rodårsag, getPortalOffer) | DONE (kode) — U10 første klik |
| G3 | Kundeportal | Tilbudsmail fandt kun tokens med fremtidigt udløb (prod: alle 39 aktive tokens er UDEN udløb, 3 kunder har flere) → linket faldt tilbage til /view-offer-redirect; udløbne-men-aktive tokens blokerede nyt link | DONE (kode) — samme token-regel som portal-link/view-offer (NULL eller fremtid, nyeste), udløbne deaktiveres ved ny adgang (RLS: offers.send-roller har UPDATE). Prod-effekt i dag: links går direkte til portalen i stedet for via redirect |
| G4 | Planlægning/montør | Montør: tom kalender (employees-liste kræver employees.view), kunne ikke afslutte job (planned→in_progress krævede work_orders.edit), kunne ikke uploade fotos, landing viste ikke job, tom medarbejdervælger i timeformular; desuden kunne enhver montør afslutte ANDRES arbejdsordrer (ingen scope-tjek) | DONE (kode) — "Mine job" på landingssiden (ikke afsluttet / i dag / kommende → direkte til Planlægning-fanen), montør afslutter eget job direkte (planned→done; RLS 00171 tillader done), scope-tjek på statusskift, kun brugbare knapper pr. rolle, kalender viser egen række (+ forklaring hvis login ikke er koblet), foto/PDF-upload på sagens Dokumenter-fane (cases.edit.own + scope), timeformular forvalgt med montøren selv, kalender-"i dag" i dansk tid. ui-e2e U11 som montør; U30 kontor planlægger fra kalenderen ("Planlæg opgave": sag, montør, dato → arbejdsordre planned + vist i kalenderen). **Drift (Henrik):** prod har 2 montør-logins, kun 1 koblet til medarbejder → opret/knyt via Medarbejder → Rediger → Login |
| G5 | Planlægning | Serviceleder kan kun se egen employees-række (RLS 00096) → kan ikke planlægge montører | → G10 (Henrik: fortsæt på staging) |
| G6 | Kunder/sager (salg) | Rolle salg kunne oprette sag men ikke se den (cases.view.assigned manglede, selv om getCaseScope har et salg-mønster: egne sager via created_by/assigned_to); tilbudsmail fra salg uden PDF og med hardkodede firmaoplysninger (getCompanySettings kræver settings.view) | DONE (kode) — salg får cases.view.assigned (scope = egne sager), tilbudsmail/PDF læser kun offentlige firma-kolonner (aldrig SMTP/SMS-hemmeligheder). ui-e2e U13 som salg. pilot-roles + guard-audit grønne |
| G7 | Leverandørfaktura | Bogføring i e-conomic fejler altid: suppliers.external_supplier_id og costAccountNumber kan ikke sættes nogen steder | → NEXT (N12). Henrik: e-conomic ER del af 1.0, men må ikke blokere øvrig go-live |
| G8 | Leverandørfaktura | Ingen manuel upload af faktura (ingestFromUpload uden UI) | DONE (kode) — "Upload faktura" på listen (incoming_invoices.edit): PDF/JPG/PNG ≤15 MB gemmes privat (attachments/supplier-invoices, signeres ved visning), PDF-tekst → samme parse/match som mail, dedup med samme nøgle som mail (tekst-hash) → dublet åbner eksisterende og rydder filen op. ui-e2e U12; invoice-pipeline 10/10, invoice-attachments 8/8 |
| G9 | Mail/indbakke | Montør så og kunne arkivere/koble al firmamail (inbox.view uden scope) — privatliv | DONE (kode, Henrik 2026-10-01) — inbox.view fjernet for montør (menu + /dashboard/mail → ingen adgang); sagens mails/dokumenter scope-tjekkes (kun egne sager). ui-e2e U4 (3/3) + U11 (egen sagsmail synlig, fremmed skjult). **DB-del → G10** |
| G10 | Mail/medarbejdere (RLS) | incoming_emails SELECT USING(true) → montør kunne læse al mail via REST; serviceleder så kun egen employees-række (G5) | DONE i prod 2026-10-03 (00180) — tidligere: BLOCKED_APPROVAL — 00180 på staging grøn (rls-read L9/L10 + fuld regression), prod pre-check ✅, runbook docs/runbooks/00180-g10-mail-scope-employees.md. Rettelse: employees.cost_rate/hourly_rate er kost-/salgssatser (løn ligger i employee_compensation) → ingen kolonne-lockdown nødvendig |
| G11 | Opsætning før pilot | Montør #2 har login men ingen koblet medarbejder → ser ingen job, kan ikke registrere tid | TODO (Henrik, drift): Medarbejder → Rediger → Login → "Knyt eksisterende bruger". Verificér: `npx tsx scripts/prod-montor-linkage.ts` (koblet = montoer_logins) |
| G12 | Opsætning før pilot (faktura) | Bankoplysninger på kundefakturaer: PDF/mail har altid læst env INVOICE_BANK_REG_NO/INVOICE_BANK_ACCOUNT (Vercel — kan ikke læses herfra); firmaindstillingernes bank-felter var ubrugte og er TOMME i prod (read-only). Mangler begge, viser fakturaen "Bankoplysninger er ikke konfigureret" | TODO (Henrik, drift): bekræft at Vercel-env INVOICE_BANK_* er sat i prod — ELLER udfyld Indstillinger → Firma → reg.nr./konto (bruges nu som fallback). DONE (kode): én kilde `lib/invoices/bank-info.ts` (env først, firma som fallback) for PDF, fakturamail og advarsel på fakturasiden (U41). NB: tidligere checkpoint-påstand "prod mangler bank" var baseret på forkert kilde — rettet |
| G13 | Opsætning før pilot (oversigt) | Drift-opsætning var spredt (bank, firma, montør-koblinger, e-conomic-kunder) | DONE — "Opsætning før pilot" øverst på /dashboard/go-live (kun admin, skrivebeskyttet, kun ja/nej + antal): firma (navn/CVR), bank på fakturaer (samme kilde som PDF), montør-logins koblet til medarbejder (G11), fakturerede kunder koblet til e-conomic — med link til hvor det rettes. ui-e2e U53. Staging-note: 540 efterladte harness-testbrugere (@harness.test, heraf 23 med ugyldig rolle "montoer") — staging-hygiejne, ikke prod |

## NEXT
| # | Område | Opgave |
|---|---|---|
| N1 | Tilbudsopfølgning | Opfølgning synlig for sælger | DONE — kort "Opfølgning" på Tilbud: sendte tilbud prioriteret efter næste skridt (udløber snart → set/ubesvaret → ikke åbnet → afventer), Ring/Åbn, salg ser egne, admin/serviceleder alle; ærlig om at auto-påmindelser er slået fra. Ren regel (followup/offer-followup.ts, dansk kalender) 14 tests i CI; ui-e2e U14. Fundet+rettet undervejs: hydreringsfejl i kunde-/lead-/tilbudslister (relativ tid beregnet på server og klient) → SmartDate |
| N2 | Tid | Godkendelse af timer (time_logs.approve findes kun som permission) | DONE — 00185 i PROD 2026-10-04 (Henrik-godkendt): pre/post ✅, db-audit 0/0/0, trigger-writes ok, personas ✅ (prod-verify-00185-personas); branch merget til main (U11/U62/U72 grønne) |
| N3 | Grossist | AO manuel sync-knap (stub), SupplierStatusCard ikke monteret, syncSupplierPrices per-SKU/timeout | DELVIST — DONE: AO-prisopdatering virker end-to-end via prisfil: knappen "Importér prisfil" (før: "ikke implementeret"-fejl); FUND rettet: import-guiden læste filen som UTF-8 → AO's ISO-8859-1 mistede æøå og kolonnen "Indkøbspris" matchede ikke (kostpris tom) → bytes dekodes nu (UTF-8 strict, ellers windows-1252; test:decode i CI). ui-e2e U17: ISO-8859-1-fil → varer m. korrekt æøå + kostpris, ny fil → pris opdateret + prishistorik. Rest: BLOCKED_APPROVAL — automatisk AO-sync. Mangler: Henrik giver AO API/FTP-adgang. |
| N4 | Grossist | Produktsøgning ilike på 324k rækker uden trigram-indeks | BLOCKED_APPROVAL — målt i prod (read-only): søgninger uden træf 2,1–6,8 s (EAN-del 6.816 ms). 00183 (pg_trgm + 3 GIN-indeks) på staging med 200k syntetiske rækker: ~1.100 ms → 0,3–18 ms (index scan). Prod pre ✅ (`scripts/prod-verify-00183.ts`). Kør uden for natlig sync (indeksbygning blokerer skrivning til supplier_products) |
| N5 | Faktura | Faktura direkte fra tilbud i UI; kladde-redigering; "Markér som sendt" → e-conomic; kreditnotaer → e-conomic; betalinger → e-conomic | DELVIST — DONE: modtager efter samme routing som afsendelsen (faktura-kontakt før kundens mail; før: knap deaktiveret uden kunde-mail), redigering af kladder (beskrivelse/stk-pris; antal kun manuelle linjer; tilføj/slet manuelle; totaler + momssats genberegnet; kun status draft) — ui-e2e U15. "Fakturér på sagen" fra accepteret/konverteret tilbud (direkte til sagens fakturakladde; bevidst INGEN separat faktura-fra-tilbud-knap: create_invoice_from_offer kender ikke sagsfakturaer → dobbeltfakturering) — U13. Rest (e-conomic-dele) → N12 |
| N6 | Faktura | /dashboard/bank i sidebar | DONE — menupunkt "Bankafstemning" (bank.view) + ModuleGuard (før: fejlside uden rettighed) |
| N7 | Profit | Arbejdsordre-profit-snapshot skrives/vises aldrig (profitability.ts ukaldt) | VERIFICERET, ingen handling — snapshot skrives af DB-triggeren trg_work_orders_done_snapshot (00088) ved status done og bruges af AI-indsigter; sagsniveau-DB vises på sagens Økonomi-fane (economy.cost_prices) |
| N8 | Tilbud | acceptOffer håndhæver ikke status/udløb; send uden DB-tjek; portal viser tom sælger | DONE — accept-guard + gyldighedsregel, sælger vises i portalen (navn/mail/telefon fra tilbuddets opretter; U10). DB-tjek ved afsendelse = ADVARSEL med bekræftelse (Henrik N8a 2026-10-02; U60) |
| N9 | Sager | To parallelle sags-UI'er (Sager/Ordrer + Service) på samme tabel | DONE — analyse: Service (B) har 9 evner ordresiden (A) mangler. Opdelt: |
| N9a | Sager | Aflevering (tjekliste + fotos pr. punkt + kundens underskrift) på ordresiden | DONE — fanen "Aflevering": kontor eller montør på EGEN sag (service-role efter scope-tjek; klienten sender kun "punkt X udført"; underskrift valideret og lukker ikke sagen). Samme data som B. ui-e2e U11. Fund: B's status-dropdown kunne lukke sager uden cases.close-tjek (samme roller i dag) → rettet i updateServiceCase |
| N9b | Sager | KSR/EAN/kontakttelefon/koordinater kan kun rettes i B; "Naviger"-knap mangler i A | DONE — stedinfo-dialogen på ordresiden: telefon, KSR (6–10 cifre), EAN (13 cifre) valideret server-side (samme regler som B), koordinater fra adresseopslag (ryddes ved manuel adresseændring); "Naviger" (Google Maps rutevejledning) ved adressen. ui-e2e U18 |
| N9c | Sager | Statustællere/prioritet/oprettet-kolonner i A's liste; "Foreslå tilbud (agent)" kun i B; A's ?type-filter virker ikke | DONE — type-filter sendes nu videre (var ignoreret), "Haster"/"Høj"-mærke ved status, oprettet-dato som tooltip (listen har allerede 14 kolonner), statustællere i filteret (cases.view.all; tæller nu uden sags-forslag = samme mængde som listen — var forkert i B), agent-knap i ordre-headeren (admin), lukning kræver cases.close. ui-e2e U20 |
| N9d | Sager | Peg link-steder om til A og redirect /service-cases/* → /orders/* | DONE — Service-modulet samlet i Sager/Ordrer: /service-cases og /service-cases/[id] viderestiller (filtre bevares), menupunktet "Service" fjernet, 9 links peget om, vejr-widget flyttet til ordre-overblikket, døde klientfiler fjernet. Fund: mobil-bundmenuen gav montør "Indbakke" (lukket ved G9) og salg/bogholderi "Indbakke"/"Scan Mail" uden inbox.view → nu filtreret pr. rettighed (montør: Opgaver/Kalender/Sager). ui-e2e U21 |
| N13 | Salg | Lead → kunde fandtes ikke (leads kunne ikke blive til tilbud/portal) | DONE — "Opret som kunde" på leadet (idempotent via custom_fields.customer_id, dublet-værn på mail, status uændret, aktivitet logget) → kundesiden; "Gå til kunde" når koblet. ui-e2e U27 |
| N14 | Kunder | Kundevælgeren i tilbudsformularen: select med ALLE kunder (Supabase-loft 1.000) | DONE — fælles CustomerPicker (serversøgning m. debounce på navn/kontakt/mail/kundenr., sikre filtre, viser forvalgt kunde, kan ryddes); tilbudsformularen henter ikke længere alle kunder. ui-e2e U24 |
| N15 | Tilbud | Kopiér tilbud (variant/genbrug) fandtes ikke | DONE — "Kopiér" på tilbuddet (offers.create): ny kladde med nyt nr., "(kopi)", gyldighed fra firmastandard, samme kunde/parter/linjer inkl. kostpris og leverandørspor; ingen status/signatur/sag følger med; ingen halv kopi ved fejl. ui-e2e U42 |
| N16 | Planlægning | Omplanlægning (dato/montør) fra kalenderen uden e2e-dækning | DONE (verificeret) — klik job → ny dato + anden montør → gemt og vist på ny dag. ui-e2e U43; U30 dækker oprettelse |
| N17 | Montør | Montøren kunne ikke se sine egne registrerede timer | DONE — "Mine timer" på landingssiden: ugens timer pr. dag (man–søn, dansk kalender), total, registreringer m. sag, kørende timer markeret; kun egne rækker (employees.profile_id + RLS 00161). Ren ugeberegning (lib/time/week-hours.ts) 10 unit-tests i test:time. ui-e2e U44 |
| N18 | Salg | Leadlisten havde intet "mine leads"-filter (action understøttede assigned_to) | DONE — "Kun mine" (tildelt mig) på leadlisten, vises som aktivt filter. ui-e2e U45 |
| N12 | e-conomic | Opsætning før kobling | DELVIST — DONE (foundation, ingen bogføring): **e-conomic-forhåndsvisning på fakturaen** ("Vis hvad der sendes": præcis den kladde eksporten ville sende — linjer, dato, kunde, e-conomic-netto mod fakturaens; intet netværk/skrivning; settings.economic) via fælles `lib/economic/invoice-draft.ts` som live-eksporten nu også bruger: eksport AFVISES hvis e-conomic ville bogføre et andet beløb end kunden fik (antal × enhedspris ≠ linjetotal) eller ved tom faktura; bogføringsdato = dansk dato (før UTC → kunne blive dagen før PDF'ens). Tjeklisten viser nu "Fakturerede kunder koblet til e-conomic" (antal kunder med sendte fakturaer uden kobling → ville blive nye debitorer). **Kunde → eksisterende e-conomic-debitor** (kundekort → Fakturaer; kun settings.economic): første eksport oprettede ALTID en ny debitor → dubletter af Eltas eksisterende e-conomic-kunder; nu kobles kundenr. før go-live (validering, ét nr. pr. kunde, audit, service-role efter app-gate da bogholderi ikke har UPDATE i RLS) — ui-e2e U39. Regnskabsstatus "Kræver rettelse før eksport" (med årsag, eksportknap skjult) i stedet for "Klar til eksport" når fakturaen ville blive afvist. 12 unit-tests (CI), ui-e2e U37; prod read-only: 5 fakturaer, 0 afvigelser (scripts/prod-invoice-line-math.ts). alle krævede konti i opsætningen (omkostningskonto, kassekladde + bankkonto, kundegruppe, varenr. — før kun layout/betaling/moms; resten faldt stille til "1" eller blokerede), "Klar til bogføring?"-tjekliste pr. flow (kunde-/leverandørfakturaer, betalinger), e-conomic-leverandørnr. på leverandøren (validering, ryddes ved tom). ui-e2e U16. Rest: BLOCKED_APPROVAL — faktura direkte fra tilbud, "Markér som sendt"/kreditnota/betaling → e-conomic. Mangler: Henrik udleverer e-conomic-nøgler og godkender live bogføring. |
| N11 | Planlægning | Montør kan starte eget job | BLOCKED_APPROVAL — kode deployet bag MONTOR_START_JOB_ENABLED (OFF), RLS 00181 (WAVE5) på staging grøn: montør starter/afslutter KUN egne arbejdsordrer (lukker samtidig at montør kunne opdatere enhver arbejdsordre via REST). Prod pre ✅. Runbook: p009-rls-write-lockdown.md § Runde 5 |
| N10 | Planlægning | "Planlæg opgave"-knap vises for montør; interne beskeder: vedhæft fil "kommer snart" | DONE — planlæg-knap kun for work_orders.plan (G4); død "kommer snart"-knap fjernet (ingen tilbage i appen) |

## PRIVACY / SHOULDER-SURFING (Henrik 2026-10-03)
Princip: følsomme oplysninger (løn, kost, margin/DB, indkøbspriser, bank, secrets) står ALDRIG permanent på oversigter — heller ikke for roller med rettighed. De ligger i særskilte faner/sektioner, hentes først når de åbnes, vises maskeret ("Vis beløb") og skjules ved navigation/vindueskift. Både RBAC og shoulder-surfing.
| # | Område | Status |
|---|---|---|
| PV1 | Medarbejdere: faner Overblik · Job/Timer · Dokumenter · Økonomi & løn (employees.payroll.view; hentes ved åbning; maskeret, "Vis beløb", skjules ved vindueskift/fanebytte) · Login/Rettigheder; liste/overblik uden satser (også admin); D41 lønhistorik; D42 tidsdata | DONE (U73 + negativ kontrol) |
| PV2a (D43) | Tilbud: getOffer sendte linjernes kost/leverandørkost/avance til salg (kun skjult i UI) → strippes server-side uden offers.view.cost_prices; salgs redigering rører ikke de skjulte felter | DONE (U74) |
| PV2b (D44) | Tilbud: leverandørsøgning viste netto-/kostpris til salg → kun salgspris | DONE |
| PV2c (D45) | Tilbud: AI-prisforklaring regnede kost/avance i klienten for alle → kun kostpris-roller | DONE |
| PV3 (D46) | Sag: internt budget + lav-DB sendt til alle med sagsadgang og vist på overblik/hoved/liste → kun economy.cost_prices; fjernet fra overblik, hoved og sagsliste (Økonomi-fanen har dem) | DONE (U74) |
| PV4 (D47) | Produkter (tools.products inkl. salg): kostpris/margin i liste og detalje; products.ts uden tilladelsestjek | DONE — getProducts/getProduct kræver tools.products og stripper kost uden products.view.cost_prices; getSupplierProducts kræver products.view.cost_prices (før: enhver indlogget, også montør); kolonnen skjult. U75 |
| PV5 (D48) | Kalkulationer: kostmodel (DB, bruttoavance, materiale-/lønkost) | DONE (Henrik 2026-10-03: fjernet fra salg) — tools.calculations kun admin/serviceleder; læse-actions + importCalculationToOffer gated; "Fra kalkulation" kun kostpris-roller (U77) |
| PV6 (D49) | Dashboard: prisadvarsler (leverandørkost) og systemadvarsler (lav margin) til alle roller — kun login-tjek | DONE — alle 6 prisanalyse-handlinger + systemadvarsler kræver economy.cost_prices; widgets og /dashboard/pricing kun for kostpris-roller (funktionen bevaret jf. D27). U76 |
| PV7 (D50) | Tidsdata: kost pr. timeregistrering afslører medarbejderens kostsats (kost/timer) for serviceleder/bogholderi | DONE — uden employees.payroll.view strippes cost_amount/cost_rate_snapshot pr. række; sagens timekost kun aggregeret (getCaseLaborCostTotal); hourly_rate er salgssats og bevares (U80) |
| PV8 | Shoulder-surfing (tilladte roller): kost/DB åbent på sagsfaner og tilbud | DONE — "Vis kost/DB" (useCostReveal/CostRevealToggle) sammenfoldet som standard på Materialer/Øvrige/Planlægning (U79) og tilbuddets linjer + lønsomhed/besparelse/prisforklaring + DB%-banner (U83) |
| PV9 | Leverandørfaktura: IBAN umaskeret | DONE — maskeret server-side (•••• sidste 4); fuld værdi kun via revealIncomingInvoiceIbanAction (bank.view: admin, bogholderi), skjules igen ved vindues-/fanebytte (U78) |
| PV10 | Leverandør-credentials-fane synlig for serviceleder | DONE — fane + indhold kun ved suppliers.credentials (server-afgjort prop), U83 |
| PV11 (D44b) | Tilbud: live-leverandørsøgning (searchSupplierProductsLive, API-grenen) returnerede netto/avance til salg — fallback-grenene strippede, API-grenen ikke | DONE (læk-fix) |
| PV12 (D51b) | Solcelle-beregner: legacy-fallback viste komponentkost/arbejdsløn/avance og avance-skyder for alle; tomt produktkatalog gav tom V2 + konsolfejl | DONE — showInternal også i legacy; tomt katalog → standardberegneren. NB: staging har 0 solar_products |
| PV13 (D51c) | Solcelle-beregner sendte produkternes kostpris + lønsats/basis-installationskost til salg (UI-maskering var ikke nok) | DONE — getSolarProducts*/getSolarAssumptions stripper kost uden offers.view.cost_prices; salg beregner via calculateSolarQuote (server, fast standardavance 25 %, rabat ≤30 %, kun kundevendte tal) — U82 |
| PV14 (D48-audit S1) | getOffer sendte margin_percentage (kost kan udledes af salg + avance); tilføj/ret linje returnerede hele rækken inkl. kost; optimizeOfferPrices (netto/besparelse) åben for salg; pakke-vælger (getPackages) med kost/DB; kundesidens leverandørpriser (rabat/avance/kost) uden gate; /api/dashboard/ai-insights (admin-klient: margin, profit pr. medarbejder) for alle | DONE — stripLineCost på getOffer + alle linje-returneringer; optimering kun kostpris-roller; getPackages stripper, pakke-detaljer kræver tools.packages; customer-pricing læsninger + UI kræver tools.pricing; ai-insights kræver economy.cost_prices (medarbejder-indsigt kun payroll) — U84 |
| PV15 (D48-audit S2) | Ugatede kost-læsninger (ikke kaldt fra salgs UI): price-engine, margin-rules, suppliers-produkter/prishistorik, kalkia-leverandørpriser, ai-intelligence, auto-project, calculation-intelligence, exportProjects | DONE — permissionDenied-gate (offers.view.cost_prices / products.view.cost_prices / tools.calculations / tools.ai_project / economy.cost_prices). Bevidst ikke gatet: getCalculationSettings (kun server-kaldt; bruges til salgs prisberegning) |
| PV16 | Rediger medarbejder hentede og viste løn/satser (timeløn, intern kost, salgssats) så snart siden åbnede — også når man kun skulle rette fx telefon | DONE — "Løn og satser" + "Overtids- og tillægssatser" sammenfoldet; løn hentes først ved åbning (getEmployeeCompensationAction, payroll.view); foldes sammen ved vindues-/fanebytte — U89 |
| PV17 | Verifikator prod-rls-effective forventer at montør kan opdatere alle incoming_emails; efter 00180 (G10) kan montør kun se/opdatere mails på egne sager (0/813 i prod) — strammere end matrixen, besluttet adfærd | DONE — matrixen genererer migrations-SQL og må ikke ændres; i stedet regner prod-rls-effective nu forventningen som "alle rækker rollen kan SE" (has_table_privilege + count som persona). Prod: ✅ alle personaer |
| PV7b (D50b) | Medarbejderøkonomi (/dashboard/economy/employees, economy.cost_prices) viste kost/DB/DB% pr. medarbejder → kostsats kan udledes (kost/timer) for serviceleder/bogholderi | DONE — uden employees.payroll.view: kun timer + salg pr. medarbejder, kost/DB som samlede totaler (server-side); kort + kolonner sammenfoldet ("Vis kost/DB") — U90 |
| PV18 | Sagens Økonomi-fane viste kost/DB/budget straks ved åbning | DONE — "Vis økonomi" (data hentes først da), foldes sammen ved vindues-/fanebytte; U81 udvidet |
| PV-T | Testhuller i privacy-sporet | DONE — U74 (D43), U77 (D44 leverandørsøgning med egen vare + kendt kost, D47 produktdetalje, D48, D51) |
| OK | e-conomic-tokens og integrationshemmeligheder maskeres allerede; dashboardets pengewidgets er gatede; sagens Økonomi-fane hentes først ved åbning | — |

## NEXT-2 (genereret 2026-10-02 fra produktmål + prod read-only: 105 kunder, 15 tilbud, 8 sager, 5 fakturaer, 805 mails)
| # | Område | Opgave (vertikalt flow) | Kilde/fund | Status |
|---|---|---|---|---|
| N23 | Sager/planlægning | Sagsstatus følger arbejdet: sag → "I gang" når første job startes/tid registreres; "Klar til lukning" når alle job er udført og alt er faktureret; lukning fra hint | prod: ALLE 8 sager står "new" trods job/timer/fakturaer — intet flytter status | DONE — branch `n23-case-status` merget til main (sag → "I gang" ved første start/tid, "Klar til lukning", lukning fra hint; U63) |
| N24 | Mail/kundekommunikation | Ukoblede mails: (a) retro-kobling når en kunde oprettes/får mail (81 ukoblede mails fra kendte kundeadresser), (b) de 59 aldrig-behandlede (pending marts–juni), (c) webhenvendelser = D37 | prod: 591 af 805 ukoblede, heraf 231 bevidst ignoreret | (a) DONE + (c) DONE på branch `webform-inquiries` (U64/U65); (b) BLOCKED_APPROVAL — de 59 gamle pending-mails er prod-data. Ingen masseændring her. |
| N25 | Tilbud/Profit | Kostpris-mangler på tilbudslinjer: markér linjer uden kost, hurtig-udfyld fra leverandørvare/timekost, DB-advarsel forklarer usikkerhed | prod: 7 af 14 tilbudslinjer uden kostpris → DB (N8a) overvurderet | DONE — banner "N linjer uden kostpris — DB overvurderet" (antal, ingen beløb; kun kostpris-roller) + "Udfyld kost" (leverandørkost / firmaets timekost, salgspris uændret; kun kladder) — fillMissingOfferLineCosts, unit (offer-low-db-test) + U87 (negativ kontrol: fejler på gammel kode) |
| N26 | Efterkalkulation | Pr. sag: tilbudt vs. faktisk (timer, materialer, øvrige) med afvigelse og DB-realiseret; liste over sager med størst afvigelse | produktmål; kodeanalyse: økonomifanen sammenligner allerede faktisk tid/indkøb med planned_hours/budget — de var bare tomme | DONE på grok-next. N26c (linjeliste, U81) + efterkalkulation v1 (`2274215`: sag + `/dashboard/reports/aftercalc`, rabat én gang, tilbudshoved via admin efter sagstjek). Sagsrentabiliteten på `/dashboard/reports` bruger samme "manglende kost er ikke 0" (`profitability-figures-test`); linjelistens totaler er uændrede. |
| N27 | Ledelsesoverblik | Præciseret: dashboardet har allerede 10+ widgets (faktura, likviditet, konvertering, udestående, indkøb). Mangler: "Sager klar til lukning" + "timer afventer godkendelse" i styringscockpittet | produktmål + kodeanalyse | DONE — "Sager klar til lukning" (U67) + "timer afventer godkendelse" (N28, U72) i styringscockpittet; pilot-health viser godkendelseskøen (alarm > 7 dage) |
| N26a | Efterkalkulation | `offer-to-case` udfylder kun contract_sum — planned_hours/budget fra tilbuddets timelinjer/kost ved konvertering (forudsætning for tilbudt vs. faktisk) | kodeanalyse: offer-to-case.ts:221-261 | DONE på branch `n23-case-status` (ren logik + unit; sagsnote advarer om linjer uden kost) |
| N26b | Rapporter | Lønsomheds-/produktivitetsrapport læser gamle `projects`/`time_entries` — skal bygge på service_cases/time_logs | kodeanalyse: reports.ts:367/429 | DONE (merget til main via n23-case-status) |
| N26d | Rapporter | Sagsrentabilitet: tilbudt vs. faktisk kost + afvigelse pr. sag, sortering "største afvigelse"; budget/kost sammenfoldet (shoulder-surfing) | N26c | DONE — reports.ts genbruger compareOfferToActual (timekost aggregeret, D50); U88 |
| N30 | Øvrige omkostninger | Kvittering: upload-knap i stedet for manuel URL+filnavn (montør D18 tager i dag foto under Dokumenter) | case-other-cost-dialog.tsx:401 | DONE (main) — upload (billede/PDF ≤10 MB, mobil-kamera) til privat storage `receipts/<sag>/…`, aldrig kundedokument (uafhængig af D26); visning via signeret URL; gamle manuelle URL'er virker fortsat. U71 |
| N31 | Kundeportal | `portalBookBesigtigelse` findes men kaldes ikke — kunden kan ikke selv booke besigtigelse | portal.ts:1737 | DONE (Henrik 2026-10-03: staging, live mail gated) — "Book en besigtigelse" i portalen (dato ≤ ½ år, tidsrum, besked; maks 3 åbne); CRM-opgave (created_by null — før FK-fejl, bookingen kunne aldrig lykkes); bekræftelsesmail kun med PORTAL_BOOKING_CONFIRMATION_EMAIL_ENABLED=true (OFF). U69 |
| N32 | Ledelse | /dashboard/economy/employees (medarbejderøkonomi) har intet menupunkt | kodeanalyse | DONE på branch `n23-case-status` (menupunkt, economy.cost_prices) |
| N33 | Notifikationer | Notifikationsindstillinger gemmes men bruges ikke ("sendes endnu ikke") — enten forbind eller skjul | notifications-settings-client.tsx:117 | BLOCKED_APPROVAL — UI siger ærligt "sendes endnu ikke"; at forbinde = mail/SMS-udsendelse (live) |
| N34 | Grossist | Manuel synk viser "ikke implementeret" for alle undtagen LEMU (død knap for AO) | supplier-sync-overview.tsx:98 | ALLEREDE LØST (N3): ikke-LEMU viser "Importér prisfil"; teksten nås kun uden supplier_id |
| N35 | Salg/mail | "Opret lead" fra ukoblet mail/webhenvendelse: kontaktdata fra mailen (FormSubmit-tabellen forstås; aldrig FormSubmit som mail), kilde website/email, koblet via custom_fields.source_email_id, dublet-værn | D37: ~48 webhenvendelser, kun 3 website-leads | DONE (main, U68) |
| N36 | Legacy projekter | Gammel projects-model: prod 1 projekt (juni), 1 projektopgave, 0 time_entries, 0 beskeder (scripts/prod-legacy-projects.ts). Plan: /dashboard/projects → viderestil til Sager (bevarer data), søgning/kommandopalet/kundeoverblik/dashboard-widgets på sager i stedet for projekter; tabeller røres ikke (ingen prod-data-ændring) | D39 + NEXT-2 | DONE (main) — dashboardets "Aktive Sager"/"Fakturerbare Timer" viste den gamle model (0 i prod) → nu sager (count i DB; U70 fandt 1.000-rækkers-loft: 999 vs 1.286) og time_logs; aktivitetslisten linkede til /customers|/offers|/projects (404) → /dashboard/…, "Ny sag" i stedet for "Nyt projekt"; "Kommende opgaver" = kundeopgaver (før project_tasks); kundeoverblikkets projektsektion kun når der findes projekter ("gammel model"). Projektdetaljesiden bevaret (1 prod-projekt). Rest: leads/kunder/tilbud-tal på dashboardet henter også rækker (1.000-loft) — ufarligt ved nuværende størrelse, LATER |
| L-SMS | SMS | Ingen kode sender SMS via GatewayAPI (tabeller + indstillinger findes); skabeloner + hændelser | kodeanalyse | LATER — live SMS kræver godkendelse |
| L-Lager | Lager/indkøb | Ingen lager-/indkøbsordre-tabeller; kun læse-overblik over leverandørfakturaer | kodeanalyse | LATER (L) — kræver produktbeslutning |
| N28 | Timer (efter N2-merge) | Serviceleder: tæller "timer afventer godkendelse" på dashboard + påmindelse | N2 | DONE — i main efter 00185 (cockpit-tæller, time_logs.approve, count-query); U72 grøn |
| N29 | Opgaver | 26 åbne kundeopgaver i prod: "Mine forfaldne opgaver" + dagens liste på landingssiden | prod read-only; opgavelisten har allerede ansvarlig-filter + forfalden-tæller | DONE på grok-next — `splitMyDayTasks` (dansk kalenderdag) + listerne på dashboardet og opgavesiden. Kun opgaver tildelt den indloggede bruger. Kundeopgaver, ikke den gamle projekttabel. `my-day-test` |

## NEXT-3 (genereret 2026-10-04 — high-speed long-run; prod read-only: 107 kunder (13/30d), 813 mails (72/30d), 57 leverandørfakturaer (9/30d, kun 3 med linjer), 15 tilbud (0/30d), 8 sager, 5 fakturaer)
| # | Område | Opgave (vertikalt flow) | Kilde/fund | Status |
|---|---|---|---|---|
| N40 | Profit/økonomi | Realiseret DB pr. sag: netto faktureret ekskl. moms (udstedt − kreditnota; kladde/annulleret udelukket) mod faktisk kost, på Økonomi-fanen | produktmål (tilbudt vs. faktisk) | DONE — computeRealizedDb (unit) + kort på Økonomi-fanen (U91) |
| N41 | Leverandørfaktura/drift | 48 mail-fakturaer står "needs_review" med kun mailtekst (47/54 havde vedhæftning, 1 hentet) → "Vedhæft PDF fra mailen" på fakturaen: privat fil, PDF-tekst, genlæsning, audit | prod read-only (prod-invoice-sources) | DONE — "Vedhæft PDF fra mailen" (U92). Rod-årsag stadig BLOCKED_APPROVAL: INVOICE_ATTACHMENT_FETCH_ENABLED (Vercel, Henrik) |
| N42 | Rapporter | Sagsrentabilitet: realiseret DB pr. sag i rapporten (sammenfoldet) | N40 | DONE — faktureret netto + realiseret DB pr. sag i Sagsrentabilitet (U91) |
| N43 | Leverandørfaktura | Indbakke-filter "mangler bilag" (mail-fakturaer uden fil) + antal i bogholderiets overblik, så de 48 kan tages én for én | N41 | DONE — filter + tæller "Mangler bilag" (U92) |
| N44 | Salg | 0 tilbud på 30 dage i prod — gennemgå salgsflowet for friktion (lead→tilbud, kunde→tilbud, opfølgning) og find manglende genveje | prod read-only | DONE — analyse: 50 nye kunder/90 d, alle med mail, 0 med tilbud/sag (seneste tilbud 2026-06-23) → cockpit "Nye kunder uden tilbud" + "Opret tilbud" åbner kundens tilbudsformular (U93) |
| N45 | Kundekommunikation | 72 mails/30d: mail → opgave/sag-genveje og svar-skabeloner (ingen live afsendelse uden flag) | prod read-only | DONE — "Opret tilbud" fra koblet mail (U93); svar-skabeloner fandtes allerede (hurtigsvar) |
| N46 | e-conomic | Forhåndsvisning af kreditnota/betaling som e-conomic-kladde (ingen posting) — samme mønster som fakturaens "Vis hvad der sendes" | N12-rest | DONE — betalingens kassekladde-postering kan forhåndsvises (U94); kreditnota håndteres allerede af fakturakladden |
| N47 | Grossist/priser | Kladde-tilbud markerer linjer med ændret leverandørpris (±0,5 %) + "Opdater pris"; refreshLineItemPrice opdaterer nu også cost_price og afviser sendte tilbud | kodeanalyse (DB blev stående med gammel kost) | DONE (U95) |
| N48 | Planlægning | Kalender "Mangler planlægning": aktive sager uden arbejdsordre / arbejdsordre uden dato eller montør → Planlægning-fanen | kodeanalyse | DONE (U96) |
| N49 | Montør | "Mine job": Navigér-knap direkte til jobbets adresse (før kun inde på sagen) | kodeanalyse | DONE (U97) |
| N50 | Kundekommunikation | Portal-kundebeskeder: alle 8 i prod stod ulæste (ældste 199 d). Rod-årsag: RLS UPDATE tillod kun medarbejderens egne beskeder → markér-læst ramte 0 rækker tavst. Fix: read_at via service-role efter app-gate (kun kundebeskeder/valgte id'er); cockpit "Kundebeskeder (portal)"; #chat åbner chatten | prod read-only (prod-portal-unread) | DONE (U98) |
| N51 | Faktura | Cockpit "Klar til fakturering": sager med fakturerbart arbejde uden faktura (timer/materialer/øvrige) med salgsværdi → fakturakladden (invoices.create). Prod: 2 accepterede tilbud uden faktura | prod read-only (prod-offer-pipeline) | DONE (U99) |

### Checkpoint 2026-10-04 12:30
- N49–N57 + Q1 pushet: navigation, portal-ulæste (RLS-fejl), klar til fakturering, salgstragt, gamle kladder, forældede priser, rute-/mobil-crawls (2 fejl fundet og rettet).

## NEXT-4 (genereret 2026-10-04 11:40 — prod: 7 kladde-tilbud > 14 d, 2 sendte uden svar > 14 d, 4 accepterede (2 ufaktureret), leads ubrugt (5, 0/30 d), kunder oprettes fra mail)
| # | Område | Opgave | Kilde | Status |
|---|---|---|---|---|
| N52 | Tilbud | Gamle kladder (> 14 d) i cockpit/tilbudsliste med "Fortsæt" — 7 i prod står hen | prod-offer-pipeline | DONE — cockpittets tilbudskort viser "N kladder ældre end 14 dage" → kladdelisten (U100) |
| N53 | Ledelse | Salgstragt pr. måned (nye kunder → tilbud → sendt → accepteret → faktureret) i Rapporter | prod-customer-funnel | DONE — Rapporter → Salgstragt (6 mdr., dansk måned; forslag/kladder/annullerede udelukket; kreditnota fratrukket; sendt-/vinderrate) — unit + U100 |
| N54 | Tilbud | Accepteret tilbud uden faktura: "Fakturér" genvej fra tilbuddet (via sagens fakturakladde) | prod-offer-pipeline | ALLEREDE LØST — "Fakturér på sagen" findes på tilbuddets sagskort (N5) |
| N55 | Drift | Pilot-health: tilføj portal-ulæste + klar-til-fakturering + mangler-bilag som nøgletal (read-only) | N43/N50/N51 | DONE — prod: portal 8 ulæste (199 d, ALARM), 36 mail-fakturaer uden bilag, 1 sag m. ufakt. materialer |
| N56 | Data | Kundedubletter? 18 aktive kunder deler 5 e-mails — primært én partner-adresse (9 kunder) = bestiller for flere slutkunder (sagspartner-model), ikke dubletter; dubletværn ved oprettelse fra mail findes | prod read-only (prod-customer-duplicates, -dup-domains) | ANALYSE — ingen handling |
| N57 | Grossist/priser | Prod: AO-prislisten (1.343 varer) sidst opdateret 2026-02-28 (7 mdr.), LM frisk → tilbuddets leverandørsøgning viser "Pris fra <måned> — kan være forældet" for priser > 60 dage | prod read-only (prod-supplier-freshness) | DONE (U111). Rod-årsag: AO-import/-sync kører ikke (cron-beslutning, BLOCKED Henrik) |
| N58 | Sager/drift | Prod: alle 8 sager står "Ny" — 3 har arbejde/udstedt faktura (fra før N23). Sagen viser nu "Sagen står som Ny, men arbejdet er i gang: … → Sæt til I gang" (aktivt valg, audit via status-handlingen; ingen datamigrering) | prod read-only (prod-case-status-drift) | DONE — unit (case-progress-test) + U112 |
| N59 | Mail/drift | Prod (30 d): 70 mails, 50 ulæste (ældste 89 d), 25 ukoblede, 0 arkiveret — indbakken ryddes ikke. "Markér viste som læst" (masse, ikke-destruktiv, samme gate/RLS) | prod read-only (prod-mail-flow) | DONE (U113). Næste: multi-vælg + arkivér, filter "ukoblede" |
| Q1 | Kvalitet | Rute-/fane-/mobil-crawls: U101–U110 (64 sider × admin/salg/montør, 14 sagsfaner, montør/salg/kundeportal ved 375 px) | — | DONE — fandt 2 fejl: Faktura-mail-indstillinger crashede (null.trim), kundeportalens rækker flød ud på mobil; begge rettet |

## NEXT-5 (genereret 2026-10-04 13:40 — prod: 1 forfalden faktura uden rykker, 3 planlagte arbejdsordrer, 0 med tid; go-live-import af kunder)
| # | Område | Opgave | Kilde | Status |
|---|---|---|---|---|
| N60 | Kunder/go-live | CSV-import af kunder (e-conomic/regneark): forhåndsvisning ny/dublet/ugyldig, server genvaliderer, max 500, audit | go-live | DONE (U115, unit) — pushet 4c5bfe5 |
| N61 | Økonomi | Cockpit "Forfaldne fakturaer" (invoices.view.all): antal, beløb, dage over forfald, rykkere → fakturaen | prod-jobs-without-time (1 forfalden uden rykker) | DONE (U116) |
| N62 | Planlægning/faktura | Kalender "Job uden registreret tid": overståede job (60 d) med montør uden timer → sagens Planlægning-fane (work_orders.plan) | kodeanalyse (glemte timer faktureres aldrig) | DONE (U117) |
| N63 | Mail | Indbakke: filter "ukoblede" + arkivér valgte (ikke-destruktivt, is_archived) | N59 | DONE (U121) — fanen "Arkiveret" (tæller) + "Gendan til indbakken"; "Arkivér viste" på Uidentificerede (bekræftelse, max 500, kan gendannes). Filteret "ukoblede" fandtes ("Uidentificerede") |
| N64 | Montør | "Mine job": påmindelse om job fra i går/tidligere uden registreret tid (egen tid, ingen kost) | N62 | DONE (U119) — "Afsluttet uden timer — registrér din tid" |
| N65 | Tilbud | Tilbudsdetalje: "Kunden har ikke åbnet tilbuddet" / sidst set (viewed_at) i opfølgningen | salg | DONE (U118) — cockpittets opfølgning viser åbnet/ikke åbnet; "Set" fandtes på tilbuddet |
| N66 | Leverandørfaktura/økonomi | Prod: 57/57 mail-fakturaer uden leverandør — kun 2 leverandører findes (AO, LM), fakturaer kommer fra ~25 domæner. "Vælg leverandør" på fakturaen (incoming_invoices.edit) + "Opret ny" (settings.suppliers) med afsenderdomænet som website; matcheren kobler næste faktura fra samme domæne (sender_domain_match, kun ét hit, aldrig gratis-mail) | prod-incoming-invoice-pipeline/-senders | DONE (unit sender-domain-test, U120) |
| N67 | Salg/henvendelser | Prod: 43 webhenvendelser (23 på 90 d), 0 blev til kunde/lead, 31 ulæste — flowet "Opret lead/kunde fra mail" fandtes, men ingen så dem. Cockpit "Henvendelser fra hjemmesiden" (leads.create): 90 d, uden kunde og uden lead → mailen i fanen Webhenvendelser | prod-webform-funnel | DONE (U122) |
| N68 | Leverandørfaktura | Godkendelseskøen markerer "Ikke en faktura?" (privat-/gratis-mail uden leverandør og beløb) + filter — prod: 13 af 36 åbne er kundemails/ansøgninger. Kun markering; automatisk frasortering = N68b (BLOCKED_APPROVAL) | prod-incoming-invoice-rejects | DONE (U123, unit) |
| N66b | Leverandørfaktura | "Kobl også N andre åbne fakturaer fra <domæne>" (valgt som standard, audit pr. faktura) når leverandøren vælges/oprettes — de 6 fra mikma.dk kobles med ét klik | N66 + prod-senders | DONE (U120) |
| N67b | Salg/henvendelser | "Opret lead" direkte på hver webhenvendelse i cockpittet (samme action/dublet-værn som mailens knap) → leadet åbnes | N67 | DONE (U122) |
| N70 | Mail | Kundeforslag via firmadomæne for uidentificerede mails? Prod: 304 uidentificerede (78 gratis-mail, 196 firmadomæne, 30 fra eltasolar.dk); kun 7 har præcis én kunde med samme domæne (94 matcher flere) | prod-unidentified-mail-hints | ANALYSE — ikke værd at bygge (for få entydige; risiko for forkert kobling) |
| N71 | Mail/drift | Prod: email-sync-cronen kører kun dagligt 05:01 (Vercel) og mail-siden synker kun mens den er åben → cockpittet (webhenvendelser, "kræver svar") viste mails op til et døgn for sent. Cockpittet synker nu selv, når en konfigureret postkasse er > 10 min gammel (inbox.view; samme synk som mail-siden; max ét forsøg pr. 5 min pr. instans; ignorerer ikke-konfigurerede postkasser som crm@) | prod-cron-status-since, prod-mail-sync-state | DONE (unit mail-sync-freshness-test; U93/U116/U118/U122 grønne) |
| N72 | Tilbud (analyse) | Tilbudsmodulet: 15 tilbud (jan–jun), intet siden juni; 7 kladder, 6 uden linjer; 4 accepterede → sager. Brugsmønster, ikke kodefejl — til Henrik: bruges tilbud fortsat uden for CRM? | prod-offer-shape | ANALYSE |
| N73 | Mail/cockpit | Prod: 117 tråde "kræver svar", 95 ældre end 30 dage (svar fra personlige postkasser ses ikke, N69) → overskriften var støj. Cockpittet tæller nu kun tråde (ikke mails) fra de seneste 14 dage; ældre vises som note "+ N ældre tråde uden svar i CRM"; én beregning i stedet for to. Mail-fanen uændret | prod-requires-response | DONE (U124) |
| N74 | Kunder/datakvalitet | Prod (90 d): 50 nye kunder, alle oprettet af mail-automatikken (tag auto-email); 8 uden rigtig e-mail (@elta-crm.local), flere fra leverandørdomæner (dccenergi.dk ×4, willems.dk, materialetjek.dk — signaturens telefon/adresse). Kundelisten: "Oprettet fra mail (N)"-filter + mærket "Fra mail · mangler e-mail" til gennemgang. Automatikken selv ændres ikke (N74b) | prod-new-customer-quality | DONE (U125) |
| N75 | Salg/cockpit | "Nye kunder uden tilbud" viser ikke "kunder" hvis e-maildomæne tilhører en kendt leverandør (website/kontakt-mail; deterministisk, kun visning) — leverandør-"kunder" fra mail-automatikken (N74) fyldte kortet | N74 | DONE (U126; negativ kontrol på gammel kode fejler som forventet) |
| N76 | Leads | Lead fra webhenvendelse (source='website') viste ikke kilde-banneret, og "Se i Mail" søgte på leadets e-mail (som ikke er afsender på FormSubmit-mails) → banner for alle leads med source_email_id, "Oprettet fra webhenvendelse", link åbner selve mailen | N67b | DONE (U122) |
| N77 | Leads → kunde | "Opret kunde" fra et lead koblede ikke kildemailen → webhenvendelsen manglede i kundens mailhistorik og talte stadig som "uden kunde". Nu kobles en ukoblet kildemail til kunden (kun med inbox.view; best-effort) | N76 | DONE (U122: henvendelse → lead → kunde, mailen koblet) |
| N78 | Leads → kunde | Webformularens adresse gik tabt (leads har ingen adressefelter) → gemmes i lead.custom_fields og bliver kundens faktureringsadresse ved "Opret kunde"; vises på leadet. Parser-fejl rettet: "By:" efter "Postnummer:" blev ignoreret (by-blokken kørte kun uden postnr.) — påvirkede også mail-automatikkens kunder | N77 | DONE (U122 + unit email-parser-city-test; negativ kontrol fejler på gammel parser) |
| N79 | Leverandørfaktura | "Ikke en faktura" på fakturaen udfylder afvisningsbegrundelsen (kundemail/henvendelse) — afvisningen bekræftes som altid. Til de 13+ kundemails i køen (N68) | N68 | DONE (U127) |
| N80 | Mail/afsendelse | Kunder fra mail-automatikken uden e-mail har pladsholderen auto+…@elta-crm.local (N74). Begge transporter (Graph + SMTP) afviser nu .local/.localhost/.invalid-modtagere FØR afsendelse med en forståelig besked i stedet for bounce/teknisk fejl | N74 | DONE (unit undeliverable-test) |
| N80b | Kunder | Kundekortet viser "Mangler e-mail (oprettet automatisk fra en mail — ret via Rediger)" i stedet for pladsholder-adressen; mailtidslinjen skriver "Kunden mangler e-mail" og skjuler "Ny email"/"Kobl tidligere mails fra adressen" | N80 | DONE (U125 udvidet; U61/U64/U65 grønne) |
| N81 | Mail/henvendelser | Webhenvendelser: kontaktkort øverst i mailen (navn, telefon som ring-op-link, e-mail, adresse) med samme parser som "Opret lead" — før kun FormSubmits rå tabel | N67 | DONE (U122 udvidet) |
| N82 | Cockpit/henvendelser | Alle webhenvendelser har samme emne ("Ny henvendelse fra eltasolar.dk") → cockpitlisten var 5 ens rækker. Viser nu navn · by fra formularen (samme parser; kun de 5 viste) | N67 | DONE (U122) |
| N83 | Salg/cockpit | "Leads — opfølgning": åbne leads (ikke vundet/tabt) uden ændring i 7 dage, ældst først (leads.edit; kortet vises kun når der er nogen). Prod: alle 5 leads står åbne > 7 dage; N67 giver flere | prod-leads-state | DONE (U128) |
| N84 | Mail → kunde (fejl) | "Opret som ny kunde" på en webhenvendelse foreslog som standard FormSubmit som betalende kunde (formsubmit.co er ikke gratis-mail → "betaler + sted"), og hurtig-vejen i kobl-dialogen oprettede kunden "FormSubmit / submissions@formsubmit.co" → senere henvendelser ville matche den. Nu: standard "kunde fra formularen"; hurtig-vejen bruger formularens navn/e-mail/telefon eller afviser med forklaring. Prod: 0 sådanne kunder (read-only) | kodeanalyse | DONE (U129; negativ kontrol fejler på gammel dialog) |
| N85 | Mail/ydelse | Mail-listen hentede select * inkl. body_html → prod ~400 KB pr. side (25 mails; gns. 11 KB, p95 41 KB, max 108 KB) og igen ved hver baggrundsopdatering. Listen henter nu eksplicitte kolonner uden brødtekst (tjekket mod prod-skema); brødteksten hentes ved åbning (alle veje: klik, deeplink, auto-valg), forhåndsvisning + "Henter hele mailen…" imens | prod-mail-body-size, prod-mail-list-payload | DONE — målt på prod-data: 451,5 KB → 32 KB pr. listevisning (−93 %); åbning henter gns. 16 KB. Mail-gruppen 20/20 + U129 (brødtekst hentes ved deeplink); ingen ændring i rettigheder (samme RLS-klient, samme gates) |
| N86 | Salg/henvendelser | "Opret leads for alle (N)" på cockpittets webhenvendelser (bekræftelse; hver mail via createLeadFromEmailAction — samme gate/parser/dublet-værn; uden læsbar e-mail springes over og tælles; max 100). Prod: 23 åbne → ét klik | N67 | DONE (U130) |
| Q3 | Kvalitet/tid | "I dag" beregnet som UTC-dato (toISOString) 10 steder → mellem 00:00 og 01/02 dansk tid var dagen forkert: forfalds-badges på leverandørfakturaer, kalenderens i dag, min. dato ved besigtigelsesbooking (også portalen), returnerings-/fratrædelsesdato, indkøbsoverblik, system-health. Nu dansk kalenderdag (copenhagenParts) | kodeanalyse | DONE (U43/U52/U89/U92/U123 + test:time). Q3b: tilbuddets gyldig-til-standard (formular, Kalkia, tilbudsgenerator) og tidsregistreringens i dag — samme fejl (UTC-dato af nu + N dage); U74–U76/U93 |
| Q2 | Kvalitet | U16/U38 seed-konflikter på uq_suppliers_external (efterladte [HARNESS]-leverandører) — unikt nr. pr. kørsel / frigiv før seed; præcis dubletbesked i leverandørformularen | regression | DONE |

## NEXT-6 (genereret 2026-10-04 19:40 — prod-brug: mail + kunder aktive, alt andet stille; 92/107 kunder auto-oprettet)
| # | Område | Opgave | Kilde | Status |
|---|---|---|---|---|
| Q4 | Kvalitet | `npm run harness:ui-full [-- grupper]`: fuld regression i kørsler under 30-min-loftet (første bygger, resten genbruger), ikke-nåede samles i ekstra kørsel, FAIL genkøres isoleret → FLAKY/FAIL | regression i dag ramte loftet 2× | DONE (smoke 8/8 via ui-full) |
| N87 | Kunder | Dublet-forslag: lead → kunde matcher kun på e-mail; auto-kunde fra samme person (telefon) giver dublet → "Findes kunden allerede?" på leadet (samme telefon — sidste 8 cifre uanset format — eller samme fulde navn) + "Kobl til denne kunde" (kobler lead + kildemail; ingen fletning/ændring af kunden) | N74/N77 | DONE (U131) |
| N88 | Mail | Kontaktkortet (N81) vises også på ukoblede mails (fx privatpersoner, 78 fra gratis-mail) når parseren finder telefon eller adresse — "Kontaktdata i mailen"; ikke på kundekoblede mails | N81 | DONE (U132) |
| N89 | Faktura | Forfaldne fakturaer (N61): hver faktura viser næste rykkertrin ("næste: rykker 1 om 2 d" / "manuel gennemgang" / "alle rykkere brugt") efter PRÆCIS cronens regler — reglerne flyttet til lib/invoices/reminder-plan.ts (én kilde for cron og cockpit); intet sendes herfra | N61 | DONE (unit reminder-plan-test i test:time; U116/U29/U36) |
| N92 | Henvendelser/parser | Prod-måling (kun tal): parseren fandt navn i 15/43 rigtige webhenvendelser. Årsager: mailens HTML→tekst lægger cellerne på samme linje ("name Hanne Holm"), "postnr"-feltet manglede, og adressen løb ind i FormSubmits egen tekst. Rettet → navn 43/43, e-mail 43/43, telefon 42, adresse 32 (postnr. uden by i formularen). Påvirker lead/kunde fra henvendelse, kontaktkort og cockpittets navn·by | prod-webform-parse-quality, prod-webform-labels (kun gentagne feltnavne) | DONE (unit website-inquiry-test udvidet; U68/U122/U129/U130) |
| N94 | Leads | Leadlisten viser webhenvendelsens type · besked under kontakten (N93) — 23 bulk-oprettede leads kan prioriteres uden at åbne dem | N86/N93 | DONE (U130) |
| Q5 | Kvalitet/dubletter | `.ilike('email', x)` uden escaping 10 steder (dublet-værn ved lead→kunde, mail-linker, opret fra mail, kontaktformular, signatur): `_`/`%` i en adresse er jokertegn → "a_b@x.dk" kunne matche "axb@x.dk" og koble til forkert kunde. Nu escapeLike | kodeanalyse | DONE (U23/U25/U41/U122/U129/U131) |
| Q6 | Drift/overvågning | system-health: "email sync stale" fyrede HVER dag (30-min-grænse mod en daglig cron + den ikke-konfigurerede crm@) → støj der skjuler rigtige synkfejl. Nu kun konfigurerede postkasser og 26 t. Fund: admin-alarmer når ingen (`no_recipients`) → Henrik: ADMIN_ALERT_EMAIL i Vercel | prod-health-warnings | DONE (tsc; logik uden UI) |
| N95 | Henvendelser | Prod (kun tal): 9 af 23 åbne webhenvendelser er fra personer der allerede findes som kunde (samme e-mail; alle auto-oprettet), men mailen er ikke koblet → cockpittet viser "findes som kunde → Kobl" og "Opret leads for alle" kobler dem til kunden i stedet for at lave et lead (samme manuelle kobling som i mailen; resultatet viser antal koblede) | prod-webform-existing-customers | DONE (U133) |
| Q7 | Kode-review (4c5bfe5..HEAD) | Uafhængigt review fandt 2 middel + 4 lave fejl, alle rettet: (M) eltasolar.dk kunne blive "leverandørdomæne" ved videresendte fakturaer → eget domæne er aldrig et signal + oprindelig afsender bruges; (M) webhenvendelses-kortet vistes for salg uden indbakke-ret (knapperne fejlede) → samme gate som handlingerne; (L) .limit(5000) afkortes til 1000 af PostgREST → pagineret (leads-kilde, telefon-scan, timer pr. job); (L) flerlinjet besked afkortet → bevares uden sidefod; (L) samme-domæne-kobling kunne overskrive samtidig ændring → kun stadig-tomme, ikke-afsluttede; rykker-trin bruger cronens dagsberegning. N74b-branchen opdateret (eb0513d) | review-agent | DONE (unit + U68/U116/U117/U119/U120/U122/U123/U130/U131/U133) |
| Q8 | Kvalitet/skalering | 24 forespørgsler med .limit(>1000) afkortes stille af PostgREST (max_rows 1000). Gennemgået: de brugervendte med reel vækstrisiko er rettet (Q7); resten er linjer pr. tilbud, materialetællinger, 6-måneders rapporter m.m. — små i prod (fx 14 tilbudslinjer, 107 kunder). Ingen ændring nu; ved vækst: paginér som lib/leads/source-email.ts | kode-review | ANALYSE |
| N96 | Mail | Mail-listen viser "navn · postnr. · hjemmesiden" for webhenvendelser i stedet for afsenderen "FormSubmit" (alle havde samme afsender og emne). Serveren parser kun webhenvendelserne på siden; listen sender fortsat ingen brødtekst (N85) | N92 | DONE (U129) |
| Q9 | Kode-review (formiddagens commits) | 2. uafhængige review: (S2) medarbejderløn kunne udledes af totalen (employeeId-filter / én medarbejder) → skjult uden løn-adgang — lukket direkte (69756c0); portal-markér-læst kræver customers.edit + kun RLS-synlige beskeder; medarbejderøkonomi, "klar til fakturering" og salgstragt pagineret (1000-loftet); salgstragtens accepterede værdi ekskl. moms og faktura i udstedelsesmåneden; CSV-import afviser > 2000 rækker i stedet for at droppe tavst; samtidig vedhæftning kan ikke overskrive; "Markér viste som læst" ruller tilbage ved fejl; løn-sektionen mister ikke ulagrede rettelser ved skjult fane; CSV-eksport neutraliserer formel-injektion | review-agent | DONE (unit + U89/U90/U92/U98/U99/U100/U113/U115) |
| N90 | Tid | Server-side datoformatering uden tidszone gennemgået: resten er talformater; CSV-eksportens dato/tid (dannes på serveren i UTC) nu dansk tid. N93: webhenvendelsens type + besked i leadets noter/banner (før kun "Fra mail: <emne>") | Q3 | DONE (unit csv-export-tz-test under TZ=UTC, website-inquiry-test) |
| Q10 | Sikkerhedsreview (kundeportal/offentlige ruter) | Uafhængigt read-only review → rettet direkte (aktive/latente S1/S2-læk): (S1) portalsiderne sendte HELE company_settings (select '*' via admin) i sidens RSC-data → SMTP-adgangskode/SMS-nøgler for alle med et portallink — nu kun portal-kolonner (prod: felterne var TOMME → intet reelt lækket, ingen rotation nødvendig; 39 aktive portallinks); (S1 latent) /api/admin/setup-db sprang auth over med headeren `x-internal-call` og var åben uden CRON_SECRET, kørte DDL der genskaber 00064's anon-policy på customer_tasks (prod-tjek: policyen findes IKKE, anon-grants findes men RLS blokerer) → POST deaktiveret (410) + fail-closed, GET kræver secret, quote-generatoren kalder den ikke; /api/fuldmagt/pdf + /api/besigtigelse/pdf åbne (forfalskede dokumenter, `<Image src=URL>` → SSRF) → kun interne kald (CRON_SECRET timing-safe) + kun data:image png/jpeg; kundetekst escapes i interne notifikationsmails (phishing); fuldmagt-links ignorerede udløb (CPR/CVR + underskrift synlig, kunne underskrive) + allerede underskrevet fuldmagt kunne overskrives + samme dags PDF overskrev hinanden; integrations-webhook uden api_key var åben → fail-closed (prod: 0 integrationer); fremmed offer_id i portalbesked viste andet tilbuds nr./titel; kladde-tilbud kunne åbnes/hentes som PDF via UUID; migrate-roles `!==` → timing-safe; vejr-proxy åben (kvote) → kun indloggede + validerede koordinater. Rest (Henrik): `portalRequestReschedule` uden længde-/antalsgrænse (+ `created_by: customer_id` sandsynlig FK-fejl); portal-chat-vedhæftninger gemmer klientens URL (bør genopbygges fra sti); getPortalDocuments viser interne sagsfotos indtil 00184 i prod | sikkerhedsreview | DONE (c7bbdd0, 78cdc75 + lave rettelser; U134 ny, exemption-proofs 23/23 m. negative kontroller; U23/U69/U9/U109/U70/U10/U50) |
| Q11 | Faktura-review (pengelogik) | Uafhængigt review, 8 fund. Rettet: (HØJ) `create_invoice_from_offer` (SQL) ignorerer linje- og tilbudsrabat → rabat-tilbud afvises i createInvoiceFromOffer (automatikreglen er dry_run i prod; 0 rabat-tilbud; negativ kontrol på gammel kode FAIL); faktura-dashboardets `.limit(2000)` → paginering; "betalt denne måned" + forsidens "nye kunder" i dansk måned; forsidens nøgletal pagineret; betalingsfrist på rate-/slut-/kredit-/sagsfakturaer i dansk kalenderdato (før dagen før kl. 00–02). **Beslutninger til Henrik (ændrer pengeadfærd — ikke rørt):** B1 udestående = final − betalt − udstedte kreditnotaer (i dag: delvis kredit + betaling af resten → status "sendt" for evigt og rykkere for fuldt beløb); B2 betaling må kun registreres på sendte, ikke-annullerede fakturaer (i dag kan bankmatch ramme kladder → "betalt" uden at være sendt); B3 kladde-kreditnotaer tæller i slutfakturaens fradrag (slettes kladden bagefter → dobbeltfakturering) — kun udstedte, eller spær sletning; B4 kreditering pr. linje bruger Math.abs → forkert fortegn ved fradragslinjer; B5 annullering besluttes på inkl.-moms-totaler (afrunding kan forhindre annullering) → ekskl. moms; B6 kreditnota-kladder kan redigeres ud over det krediterbare; B7 SQL-rettelse af rabat i create_invoice_from_offer (migration); lave: sletning af fratrukket rate-kladde efterlader header uden linjer; PDF falder tilbage til 25 % moms ved 0-subtotal; samtidige kreditnotaer uden lås | faktura-review | DONE (ae690f2) · B1–B7 BLOCKED_APPROVAL (docs/runbooks/invoice-review-decisions.md) · B1/B2/B5 klar på branch `invoice-review-b` (976f251; staging-scenarie: main FAIL, branch PASS) |
| Q12 | Montør/planlægning/tid-review | Uafhængigt review (11 fund; services/time-tracking.ts + services/work-orders.ts var død kode → fjernet; de rigtige veje er actions/time-logs, work-orders, time-approval, my-hours. Fund: automatikreglen "Auto-faktura ved arbejdsordre færdig" udløses kun fra den døde service → fyrer aldrig — bevidst? (Henrik)). Rettet i kode: faktureret timeregistrering kunne ændres hvis den blev faktureret mellem læsning og opdatering (`.is('invoice_line_id', null)` på opdateringen); flyt af dato bevarede gammel sluttid (08–16 flyttet en dag tilbage = 32 t) → sluttid følger ny dato; status-skift på arbejdsordre betinget af den læste status (samtidig annullering kunne blive "udført"); montørens job-/sagsscope og sagens timetotaler (oversigt, økonomi, fakturerings-status) side for side (1.000-loftet). **DB-niveau (migration → Henrik):** M1 (S1 latent) RLS lader montør læse HELE time_logs-rækker for kollegers timer på sine ordrer, og salg rækker på egne sager — inkl. kost_rate/kost (lønafledt) via direkte API (prod: 0 sådanne rækker i dag, 1 montør) — valg: (a) montør kun egne rækker, salg ingen, eller (b) kost-kolonner ud i separat tabel/visning kun for admin/serviceleder/bogholderi; M2 time_logs kan opdateres direkte (fx `invoice_line_id = null` → dobbeltfakturering) → BEFORE UPDATE-trigger der afviser ændringer på fakturerede rækker og kun lader service-role sætte invoice_line_id; M3 montør kan via API ændre alle kolonner på egne arbejdsordrer (genåbne udført → profit-snapshot igen) → trigger der kun tillader status-overgange + completed_at; M4 `employee_rate_id` tjekkes ikke mod medarbejderen og nulstiller ikke godkendelse. **Forretning (Henrik):** F1 montør vælger selv satstype (Overtid 100 %/Helligdag) og fakturakladder medtager ikke-godkendte/afviste timer — kun godkendte? F2 ingen loft/overlap-tjek ved oprettelse (fx 300 t) | montør-review | kode DONE · M2 klar på branch `time-logs-invoice-lock` (00189, ikke kørt) · M1/M3/M4/F1–F2 BLOCKED_APPROVAL |
| Q13 | Tilbud/salg-review | Uafhængigt review (10 fund). Rettet direkte: (S1) `/view-offer/<uuid>` (uden login) slog kundens aktive portal-token op og videresendte med det i URL'en → enhver med et tilbuds-id (webhooks, logs, skærmdeling) fik fuld portaladgang; ruten udleverer nu aldrig token ("ugyldigt/udløbet link"); forslag (`getProposals`/`getProposalsCount`) uden gate → `inbox.view`; accept/afvis i portalen betinget af status (samtidig accept + afvis i to faner kunne ende "afvist" med underskrift og sag); kopi af tilbud: gyldighed i dansk dato; tilbudsrykker-cron: ingen rykkere på forslag + sidste gyldige dag tæller med (samme regel som portalen); `recomputeOfferTotals` (pakker/starterpakker) trak tilbudsrabatten fra to gange og gemte total_amount som netto → nu præcis DB-triggerens formel (staging-test: gammel kode 2.000 vs. trigger 2.250, ny = trigger). **Til Henrik:** T1 (S1 latent, migration) `offer_line_items` SELECT-policy er `USING (true)` → salg/montør kan læse kostpris/avance via direkte API (D43 kun i app'en) — kolonne-REVOKE + kost-visning for berettigede roller; T2 (HØJ, migration) auto-faktura fra tilbud: `COALESCE(sale_price, unit_price)` men sale_price er NOT NULL DEFAULT 0 → manuelle linjer faktureres til 0 kr (samme funktion som B7; afvises nu kun ved rabat); T4 (HØJ) ændret rabat/moms på tilbuddet genberegner ikke totalerne (kunden accepterer gammel total med ny rabattekst); T5 (HØJ) sendte/accepterede tilbud kan redigeres (linjer, rabat, pakker) — kun kladder? T6 accepteret → kladde efterlader underskrift/accept (ny accept fejler); T7 sagens kontraktsum er inkl. moms men sammenlignes med fakturering ekskl. moms ("mangler at fakturere 25.000"); T8 tilbudsmail kan sendes på forslag; rapporters tilbudssummer uden paginering | salgs-review | kode DONE · T2 klar som migration 00190 på branch `offer-invoice-amounts` (ikke kørt) · T1/T4–T8 BLOCKED_APPROVAL |
| Q14 | Kundekommunikation-review | Uafhængigt review (8 fund; ingen SMS-kode i repo — Relatel er stub; alle sendeveje går via sendEmail/sendEmailViaGraph, så .local-værnet gælder overalt). Rettet: (S1) mail-vedhæftninger arkiveres automatisk på kunden ("Download" i mailen) — også fra leverandørmails koblet til kunden — og getPortalDocuments viste ALLE kundedokumenter → mail-vedhæftninger (source_email_id) vises aldrig i portalen (prod: 3 synlige, alle fra kundens eget domæne; negativ kontrol FAIL på gammel kode); (S1) domæne-kobling af mails manglede hotmail.dk/live.dk/outlook.dk/gmx/tele.dk m.fl. → alle mails fra fx @hotmail.dk koblet til første kunde med det domæne → én fælles gratis-mail-liste (lib/email/free-mail-domains.ts) for linker + leverandørsignal (prod: 0 fejlkoblinger fundet); besigtigelses-rykkeren ERSTATTEDE opgavebeskrivelsen (adresse/noter) med {"reminder_sent":…} (prod: 5 opgaver ramt, senest 2026-03-19 — originalteksten kan ikke genskabes) → tekst bevares, markør tilføjes; kundetekst escapes i udgående mails (svar-citat, afsendernavn, tilbuds-/rykker-/quote-skabeloner, påmindelser) — før kunne en afsender indsætte links med Elta-udseende i et svar sendt fra Elta-domænet; sendte mails med flere modtagere blev koblet til den SIDSTE modtager (eller ingen) → første kunde-match vinder. **Til Henrik:** K1 tilbudsrykker-cron sender aldrig (resolveren bruger cookie-klient → anon i cron → "Tilbud ikke fundet") — at rette den STARTER live kundemails; K2 besigtigelses-rykker sendes også for medarbejder-bookede besøg ("vi har ikke modtaget din bekræftelse") — kun portal-bookinger der afventer bekræftelse?; K3 (RLS) montør kan læse alle kunders mail-vedhæftninger i customer_documents via API (USING true) og email_messages/threads (tilbudsmails) for alle roller → migration; svar på webhenvendelse uden reply_to kunne gå til submissions@formsubmit.co (ikke verificeret) | kommunikations-review | DONE (kode) · K1–K4 BLOCKED_APPROVAL |
| Q15 | Leverandør/priser/e-conomic-review | Uafhængigt review (11 fund). Rettet: `getSupplierOptionsForMaterial` returnerede kostpris uden gate → `products.view.cost_prices` (D48); import overskrev kostpris/listepris/kategori m.m. med NULL ved tom/ulæselig celle (uden prishistorik) — også FTP-cron → kun felter med værdi opdateres; import slog alle filens varenumre op i ét `.in()` (for lang URL/1.000-loft, fejl ignoreret → eksisterende varer behandlet som nye) → bidder á 300 med fejl; fejlede indsættelser blev ignoreret og importen meldt "fuldført" → tælles og vises; API-produkter uden pris gav kostpris 0, der overskrev eksisterende → 0 skrives aldrig; talformat: "1 234,56" gav 1 og "1.234.567" gav 1.234 → rettet (ét punktum uden komma er tvetydigt og uændret); e-conomic: `createInvoiceInEconomic` bogfører kun sendte/betalte, ikke-annullerede almindelige fakturaer (exportInvoiceToEconomicAction manglede tjekket — kladde/kreditnota kunne bogføres); at gemme nøgler uden eksplicit valg tændte live-bogføring (`active` default true) → false; adgangsoplysninger maskeres hårdere (6-tegns adgangskode var 2/3 synlig). **Til Henrik:** L1 (S1 latent, migration) `supplier_products` SELECT er `USING (true)` → salg/montør kan læse kostpris på ~324k varer via API (som T1); L2 (migration) `get_customer_product_price` bruger `IF rec IS NOT NULL` (sand kun når ALLE felter er udfyldt) → kundeaftaler ignoreres; L3 kaldet `get_best_price_for_customer` har forkerte parametre → kundeaftaler anvendes aldrig i pakker/salgsmotor (prod: 0 kundeaftaler, så ingen effekt i dag — at rette det ændrer priser); L4 e-conomic bogfører moms via momszone/vare 1 for alle linjer — fakturaer med anden momssats end 25 % bør blokeres; synk/cron af leverandørpriser stoppede ved 1.000 varer → side for side (rettet) | leverandør-review | DONE (kode; U17/U16/U37/U38/U39/U34/U51/U8/U9/U53) · L1–L4 BLOCKED_APPROVAL |
| Q16 | Sager/leads/kunder-review | Uafhængigt review (9 fund). Rettet: (HØJ) sletning af en kunde slettede stille tilbud, UNDERSKRIFTER, portal-links og dokumenter (offers ON DELETE CASCADE) og efterlod fakturaer/sager uden kunde → kunder med tilbud/fakturaer/sager kan ikke slettes ("deaktivér i stedet"); (S2) montør så alle kunders dokumenter inkl. arkiverede mail-vedhæftninger (leverandørers kostpriser) og `getDocumentDownloadUrls` signerede ENHVER sti i attachments → gate + mail-dokumenter kun med customers.emails.view + kun stier til synlige dokumenter/besigtigelsesbilleder; (S2) sagsnoter (inkl. AI-resuméer af kundemails) uden sags-scope → samme scope som sagens mails; sagens "Faktureret"/"Rest at fakturere" summerede kladder, annullerede og kreditnotaer som + (60k + kredit 60k + 40k = 160k) → netto udstedt ekskl. moms; kunde-, lead- og kalkulations-eksport fejlede ALTID (billing_zip, leads.description, calculations.total_amount og join'et profiles!assigned_to findes ikke) og manglede gate/paginering → rigtige kolonner, gates (også tilbudseksport: offers.view), side for side; lead kunne konverteres to gange (dobbeltklik → to kunder) → optimistisk lås; redigering af lead sprang statusreglerne over; porteføljetotaler over 1.000 fakturaer. **Til Henrik (migration):** S1 `customers.created_by` er ON DELETE CASCADE til profiles (verificeret i prod; leads har ingen sådan FK) → sletning af en tidligere medarbejders bruger sletter alle deres kunder (og kaskaden videre); S2 offers.customer_id CASCADE → RESTRICT (app-værnet dækker kun app'en) | sags-review | DONE (U135/U136 nye, U91/U32/U35/U48/U27/U54/U57/U40; unit net-invoiced-test) · S1–S2 klar som 00191 på branch `fk-delete-safety` (ikke kørt) |
| Q17 | Automatik/AI/agent-review | Uafhængigt review (7 fund; automatik-handlingerne respekterer dry_run, Executor genverificerer godkendelser, live-afsendelse dobbelt-gated, auto-oprettelse slået fra). Rettet: (HØJ) mail-AI'en tolker ethvert citeret svar ("Fra:"-linje) som videresendt og udtrækker fra det citerede (Eltas egen signatur) → en allerede KORREKT koblet mail blev flyttet til en forkert/ny kunde → AI'en kobler kun ukoblede mails; AI-udtrukket navn brugt som jokertegn-mønster ("** **" matchede enhver kunde) → escapes; godkendt kunde-valg i agent-indbakken kunne ændres bagefter (godkendt A, udført B) → kun før godkendelse, betinget; rykkere kunne sendes to gange ved samtidige kørsler (cron + "Kør rykkere nu") → kravet tages atomisk før afsendelse, rulles tilbage ved fejl; personoplysninger (navn/telefon/adresse, resumé) i Vercel-logs → kun ja/nej + id'er; AI-dagsresumé brugte UTC-døgn og stoppede ved 1.000 rækker; agentens svar på en webhenvendelse ville gå til submissions@formsubmit.co → kundens e-mail fra formularen (ellers intet forslag). **Til Henrik/design:** A1 agenternes dry_run håndhæves ikke i Executor (harness bruger dry-run-kørsler til at teste udførelse; i prod oprettes ingen) — skal dry_run betyde "kan aldrig udføres"?; A2 "Fra:"-videresendelses-detektionen bør strammes (kun Fwd/VS-emne eller "Videresendt"-separator); A3 AI-budgettet tæller ikke atomisk og er "fail-open"; A4 intelligence-check-cron skriver til `system_alerts` (findes ikke i prod — D27) og learning-feedback-cron bruger cookie-klient (gør intet) | automatik-review | DONE (U29/U36/U116/U120/U2; send-producer 5/5, agent-gating 13/13) · A1–A4 BLOCKED_APPROVAL |
| Q18 | 1.000-loftet (opfølgning Q8) | Gennemgået de 26 resterende `.limit(>1000)`: rettet hvor totaler/fuldstændighed afhænger af det — betalingseksporten (kundeview: "ingen data" gav præcis 1.000, nu 1.819 på staging), Pilot Healths cron-status (5-min-crons giver > 1.000 logrækker på 9 dage → ugentlige crons så ud til at mangle), likviditetsgrafen og e-conomic-go-live-tjekket (fakturerede kunder). Resten er små per-tilbud/-sag-opslag eller admin-værktøjer (uændret). | Q8 | DONE (staging: payment-export-probe, pilot-snapshot) |
| Q19 | Rapporter/kalkulation-review | Uafhængigt review (11 fund). Rettet: (HØJ, latent overfakturering) sager oprettet fra tilbud fik kontraktsummen INKL. moms, mens rate-/slutfakturaer behandler den som ekskl. moms og lægger 25 % på → en 100 %-rate ville fakturere 156.250 for et tilbud på 125.000 (prod: 4 sager med kontraktsum = tilbud inkl. moms, 0 rater endnu) → ny sag får beløbet ekskl. moms; rate på kontraktsum afvises med klar besked, hvis summen er tilbuddets inkl.-moms-beløb; "Rest at fakturere" i projektøkonomien beregnes ekskl. moms; (S1) kalkulations-actions (`generateOfferFromCalculation`, `getKalkiaCalculation(s)`, `calculateFromNodes`, `getComponentsWithPricing`) returnerede kostpriser/DB med kun login-tjek → samme gate som modulet (`tools.calculations`); tilbudslinjer fra kalkulation gemte rækkens SAMLEDE kost i kolonnen pr. enhed (antal 10 → 10× for høj kost, negativ DB); antal 0 gav NaN; projekt-rentabiliteten stoppede ved 1.000 timeregistreringer/materialer; "Timer denne måned" læste den gamle tabel (≈ 0) i UTC-måned → time_logs, dansk måned; omsætning pr. periode i danske måneder. **Til Henrik:** R0 data-rettelse af de 4 sagers kontraktsum (SQL i docs/runbooks/review-decisions-2026-10-04.md); R1 tilbud fra kalkulation: tilbuddets total ≠ den viste kalkulation (overhead/margin/overstyrede salgspriser ikke på linjerne); R2 timer i kalkulatoren koster med SALGS-satsen (495) i stedet for kostsatsen → DB undervurderet; R3 Rapporters "Omsætning" er inkl. moms, dashboardet før rabat ekskl. moms, salgstragten ekskl. moms — ét grundlag?; R4 cockpittets forfaldne: antal begrænset til top-N og beløb uden delbetalinger (B1-branch løser beløbet) | rapport-review | R0 UDFØRT i prod 2026-10-06 (00193, post-check OK) · DONE 07c990e (U36/U32/U35/U10/U100) · rapport-ændringerne (rentabilitet side for side, timer denne måned, danske måneder) DONE efter U66/U88/U77/U91 · R0–R4 BLOCKED_APPROVAL |
| Q20 | Login/roller/indstillinger-review | Uafhængigt review (7 fund). Rettet direkte: (HØJ) `updateProfile` skrev HELE klient-objektet på egen profil → `avatar_storage_path` kunne pege på en vilkårlig fil (fuldmagt, leverandørfaktura) som profilsiden signerede med admin-klienten = læs enhver fil → kun navn/telefon/afdeling skrives, og kun `avatars/<eget id>-` signeres/slettes (også teamlisten); (account takeover) "sæt kode"-link brugte `profiles.email` (bruger-ændrbar; admins har tom e-mail i prod) → login-e-mailen fra Auth; open redirect i auth-callback (`next=@evil.com`); legacy-ruten migrate-roles (gav admin efter navnemønster brugere selv styrer) fjernet; rolle-skrivninger kun kendte roller + den sidste aktive admin kan hverken degraderes eller deaktiveres (alle veje); mail-AI-statistik krævede ingen login → inbox.view. **Til Henrik:** P1 slå selvregistrering FRA i Supabase (Auth → Sign In / Providers → "Allow new users to sign up") — i dag kan enhver måske oprette en konto og få en aktiv montør-session (kan ikke ses/ændres herfra); P2 migration: kolonne-rettigheder på `profiles` (authenticated må kun opdatere full_name/phone/department/notification_preferences) — lukker samme hul via direkte REST | auth-review | DONE (S1 deployet direkte; U10/U53/U134 grønne, unit avatar-path-test; U137 grøn 2026-10-05) · P1 verificeret SLÅET TIL i prod (runbook supabase-disable-signup.md) · P2 i 00192 (staging) |
| Q21 | Kost-/løndata på databaseniveau (T1/L1/M1/P2) | Migration 00192 (STAGING, Henrik 2026-10-05): kolonne-REVOKE af kostkolonner (offer_line_items, supplier_products, time_logs) for `authenticated`; work_order_profit kun kostroller; calculate_work_order_profit ikke kaldbar af brugere; profiles kun navn/telefon/afdeling. App-kode (~60 steder, bagudkompatibel): bruger-klienten vælger ikke-kost-kolonner; kost via admin-klienten bag eksisterende gates; kost-læsende DB-funktioner via admin-klienten (pakke-indsættelse tjekker tilbuddets synlighed først); lav-DB-advarslen gælder stadig salg (uden tal). Verificeret med rigtige rolle-sessioner: før 51/71 fejl, efter 75/75; UI mod staging m. 00192: U7/U8/U9/U17/U42/U51/U66/U88/U91/U40/U50/U77/U62/U63/U10/U54/U83/U84/U86/U74 grønne. Fund undervejs: `saveNotificationPreferences` skriver `profiles.notification_preferences`, som ikke findes i prod (00048 ikke anvendt) — siden er bevidst skjult (redirect), så ingen synlig fejl; `compareProductPrices`/`analyzeOfferMargins` bruger ikke-eksisterende kolonner | Henrik 2026-10-05 | DONE — 00192 i PROD 2026-10-05 (pre 25/25, post 33/33, rolle 28/28, løn OK, db-audit 0 fund) |
| Q22 | Forespørgsler mod kolonner der ikke findes (statisk tjek) | Nyt værktøj `npx tsx scripts/prod-select-columns-check.ts` sammenligner 1.367 `.from().select()` i src med prod-skemaet (read-only): 14 med ukendte kolonner. Rettet: kommandopalettens tilbudssøgning valgte `offers.total` (findes ikke) → søgningen fejlede ALTID (bekræftet med rolle-sessioner: gammel fejler, ny 619/619) + søgeteksten escapes nu i `.or()`; mail-linkerens tråd-kobling valgte `in_reply_to` (findes ikke) → hele opslaget fejlede, så heller ikke samtale-koblingen (conversation_id) kørte. **Til Henrik (K5):** mail-linkeren kører med cookie-klienten — i sync-cronen (ingen session) = anon → den automatiske kobling på e-mail/kontakt/domæne virker reelt ikke i cronen (prod: linker 2 mails på 30 dage mod AI'ens 28). At rette det (admin-klient) genoptager automatisk kobling af alle synkede mails → ændret adfærd. Resten (ikke synlige/AI/rapport-værktøjer): calc_components.price/time_estimate/unit/category (AI-projektmatch), customers.metadata (pris-motor, projektestimat), offer_line_items.unit_cost, import_batches.updated_prices, auto_calculations.offer_id, profiles.notification_preferences (skjult side); kode refererer tabeller der ikke findes i prod (calculation_anomalies, component_time_intelligence, installation_types, price_alert_rules, room_calculations, system_alerts) | statisk tjek | DONE (palette + linker) · K5 BLOCKED_APPROVAL · rest LATER |

### Checkpoint 2026-10-05 09:30
- Probed milepæls-regression 07:27–09:29: ingen FAIL; staging gav seed-/login-fejl (NOT_RUN) i lange perioder og faldt ud igen før U58 → loopet stoppede selv. Fuld regression er ikke mulig så længe staging er ustabil; alle Q10–Q19-ændringer er dækket af målrettede grønne batches + direkte staging-prober.
- Approval-branches (invoice-review-b, offer-invoice-amounts, time-logs-invoice-lock, fk-delete-safety) opdateret med main (konfliktfrit/løst), tsc + unit grønne, pushet. Ingen anvendt.
- CLAUDE.md: konventioner fra reviews (kontraktsum ekskl. moms, 1.000-loft, kostgates, gratis-mail-liste, escaping, portal).

### Checkpoint 2026-10-05 07:05
- Q19 (rapport/kalkulation-review): latent 25 %-overfakturering via kontraktsum inkl. moms lukket + S1 kostgate på kalkulations-actions → pushet 07c990e (U36/U32/U35/U10/U100 grønne). Rapport-ændringer i reports.ts holdt tilbage til U66/U88 kan køres (staging Auth 504 igen kl. 06:57 → UI-test stoppet straks).
- R0 data-rettelse (4 sagers kontraktsum) som SQL til Henrik.

### Checkpoint 2026-10-05 06:45
- Probed regression startet 06:15: batch 1 grøn (U7–U11); fra 06:20 timeouts igen (Pilot Health, seed "tilbud ikke oprettet") selvom Auth-proben bestod → stoppet hurtigt (proces-træ dræbt, 0 node-processer). Staging-udfald dokumenteret i memory (staging-auth-probe).
- Q18: 1.000-loftet på fire steder rettet og verificeret direkte mod staging.

### Checkpoint 2026-10-05 06:35
- Q16 + Q17 testet målrettet efter staging-udfaldet (auth-probe før hver batch, fast-fail): 15/15 grønne (U135/U136 efter rettet testselektor + endnu en reel eksportfejl: join'et profiles!assigned_to og calculations.total_amount findes ikke). send-producer 5/5, agent-gating 13/13, exemption-proofs 25/25. Pushet.
- 00191 (`fk-delete-safety`) forbliver approval-gated — ikke anvendt nogen steder.

### Checkpoint 2026-10-05 04:45
- Staging ustabil hele natten: genkørsel af economy/portal-mail/sales (02:52–04:35) — login til admin/montør/salg fejler periodisk, /dashboard/agents og Pilot Health timer ud, kl. 04:37 kan harness ikke oprette testbrugere (`createUser admin: {}` — staging Auth), databasen svarer langsomt. Bestået i de kørsler der nåede frem; ingen kodefejl påvist (U120's domæne-logik verificeret direkte). Q16 og Q17 holdes til staging svarer — intet pushes uden grøn målrettet test.
- Q17 (automatik/AI/agent-review) rettet i kode (se rækken).

### Checkpoint 2026-10-05 02:50
- Fuld regression (milepæl efter Q10–Q15): kørsel 1–4 grønne 92/92. Fra kørsel 5 (~02:10) svarede staging-databasen ikke ("upstream request timeout", login til salg/montør fejlede, mgmt-SQL "connection timeout") → resten NOT_RUN/TIMEOUT; ingen lokale processer hængende — miljøfejl på staging, ikke kode. Genkøres når staging svarer.
- Q16 (sager/leads/kunder-review) rettet i kode, venter på målrettet test (U135/U136 nye + U27/U54/U57/U91/U48/U32/U35/U40) før commit.

### Checkpoint 2026-10-05 00:45
- Fem uafhængige reviews gennemført (sikkerhed/portal Q10, faktura Q11, montør Q12, tilbud/salg Q13, kommunikation Q14, leverandør/e-conomic Q15). Rettet og pushet: c7bbdd0, ae690f2, 78cdc75, f629f79, 9e9132b, 7b305bc, fa27614 (+ Q15 efter test).
- S1-læk lukket direkte: portal-hemmeligheder, setup-db, åbne PDF-ruter, `/view-offer` udleverede portal-token, mail-bilag i portalen, gratis-mail-domæne-kobling.
- Approval-branches: `invoice-review-b`, `offer-invoice-amounts` (00190), `time-logs-invoice-lock` (00189). Samlet beslutningsliste: `docs/runbooks/review-decisions-2026-10-04.md`.
- Regression i dag: montør 23/23 + 24, portal-mail 24/24, målrettede batches grønne.

### Checkpoint 2026-10-05 00:10
- Montør-review (Q12): kode-rettelser (faktureret-lås ved samtidighed, dato-flyt, betinget statusskift, 1.000-loft i scope/sagstotaler), død kode fjernet; DB-punkt M2 klar som migration 00189 på branch `time-logs-invoice-lock` (ikke kørt); M1/M3/M4 + F1/F2 til Henrik.
- Faktura B1/B2/B5 klar på branch `invoice-review-b` (staging-scenarie: main FAIL, branch PASS).
- Dansk dato i eksport-filnavne og importbatch (sidste `toISOString().slice(0,10)` for "i dag").
- Tilbud/salg-review (Q13): S1 `/view-offer` udleverede portal-token → lukket; forslag gated; accept/afvis race; T1–T8 til Henrik.

### Checkpoint 2026-10-04 23:55
- Sikkerhedsreview (Q10): 2 kritiske + 1 høj + 3 middel + lave → rettet og pushet (c7bbdd0, 78cdc75 + lave). Prod read-only: portal-hemmelighederne var tomme (intet reelt læk), anon-policyen på customer_tasks findes ikke.
- Faktura-review (Q11): rabat-tilbud afvises i auto-faktura, dashboards over 1.000 rækker, dansk betalingsfrist (ae690f2). B1–B7 (pengeadfærd) til Henrik.
- Forsidens nøgletal pagineret (N36-rest).

### Checkpoint 2026-10-04 23:15
- Fuld UI-regression grøn: 126/126 via `harness:ui-full` (portal-mail+sales 57, montør+economy+crawl+smoke 69).
- To uafhængige kode-reviews: aftenens commits (Q7, 6 fejl) og formiddagens (Q9, inkl. S2-lønlæk lukket direkte i 69756c0) — alle rettet og testet. Sikkerhedsreview af kundeportal/offentlige ruter kører.
- Nyt: N95 (henvendelser fra eksisterende kunder kobles), N96 (navn i mail-listen).

### Checkpoint 2026-10-04 22:00
- Regression via `harness:ui-full`: portal-mail + sales 57/57; montør 24/24, economy 23/23 (resten kører).
- Uafhængigt kode-review af aftenens commits: 2 middel + 4 lave fejl → alle rettet (Q7), testes efter regressionen sammen med N95 (henvendelser fra eksisterende kunder kobles).
- Nye branches klar til godkendelse: `profiles-email-from-auth` (00188 — roden til tomme profil-e-mails), `admin-alert-recipients-auth-email`; N74b opdateret (eb0513d).

### Checkpoint 2026-10-04 21:00
- Pushet siden 19:00: N84 (webhenvendelse blev kunden "FormSubmit"), N85 (mail-liste 451→32 KB), N86 (leads for alle), Q3/Q3b (dansk "i dag" 15 steder), cockpit-tidszone, N87 (lead → eksisterende kunde), Q4 (`harness:ui-full`), N88, N89 (næste rykkertrin, delte regler), N90 (CSV-tid), N92 (parser: navn 15→43/43 på rigtige henvendelser), go-live-punkt "kunder uden e-mail".
- Klar på branches (afventer Henrik, runbook docs/runbooks/pending-branches-n68b-n69-n74b.md): N68b, N69 (+ migration 00187, ikke kørt), N74b.
- N93/N94/Q5/Q6 pushet efter grøn regression: portal-mail + sales via ui-full 57/57, verifikation 8/8.
- Proces: commit kun ved grønne tjek (en rød rls-matrix nåede main i få min. kl. ~19:55 — rettet 2e9511c; regel i memory + CLAUDE.md).

### Checkpoint 2026-10-04 19:00
- Fuld regression (alle grupper, 5 sekventielle kørsler): grøn; kun forventede/flaky afvigelser, alle genkørt grønt på frisk build (U15 race i audit-tjek rettet; U73 flaky positiv kontrol; U55/U58/U60 + portal/mail-rest ikke nået pga. 30-min-loftet → kørt bagefter: grønne).
- Nyt siden 16:30: N76–N83 (web-lead-banner, mail kobles ved kunde fra lead, adresse fra formular + parser-fix, "Ikke en faktura", pladsholder-mail afvises ved afsendelse + vises som "Mangler e-mail", kontaktkort på webhenvendelser, navn·by i cockpittet, leads-opfølgning), "kræver svar" nyeste-først (latent fejl), watchdog navngiver nu den test der faktisk hænger.
- Prod-fund: 92/107 kunder auto-oprettet fra mail (14 uden e-mail) → N74b til Henrik.

### Checkpoint 2026-10-04 16:30
- Pushet siden 14:25: N63 (mail-arkiv + gendan), N66/N66b (leverandør på mail-faktura + samme-domæne-kobling + domæne-match), N67/N67b (webhenvendelser i cockpit + ét-klik lead), N68 ("Ikke en faktura?"), N71 (cockpit synker mail), N73 ("kræver svar" 14 dage), N74 (kunder oprettet fra mail), N75, go-live-punkter, perf (ét auth-opslag i cockpittet).
- Regression i dag: economy, sales (30/30), montør + portal/mail (36/36), crawl/mobil (13/13) — alle grønne; nye tests U116–U126.
- Nye Henrik-beslutninger: N68b (indtag springer privat-mail over), N69 (svar fra personlige postkasser), N74b (ingen auto-kunder fra leverandørdomæner); drift: opret mikma/aceve/fasetech/dccenergi som leverandører.
- Prod-brug: kun mail (72/30 d) og kunder (13/30 d) er aktive; 1 aktiv bruger på 30 d; tilbud/sager/fakturaer stille siden juni (N72).

### Checkpoint 2026-10-04 14:25
- Pushet: N60 (kundeimport), N61 (forfaldne fakturaer), N62 (job uden tid), N64 (Mine job uden timer), N65 (tilbud åbnet).
- Klar (tests kører): N63 (mail-arkiv + gendan), N66 (leverandør på mail-faktura + domæne-match), N67 (webhenvendelser i cockpit).
- Regression: economy del 2 grøn (U38 seed-konflikt rettet); sales kører i 5-test-batches.
- Prod read-only fund: 57/57 mail-fakturaer uden leverandør (kun 2 leverandører), 43 webhenvendelser uden opfølgning, 1 forfalden faktura uden rykker.

### Checkpoint 2026-10-04 11:00
- N40–N48 pushet (realiseret DB, vedhæft PDF, mangler-bilag, nye kunder uden tilbud, mail→tilbud, e-conomic-betalingsforhåndsvisning, leverandørprisændring, mangler planlægning). Hver med isoleret e2e ≤ 5 min.

### Checkpoint 2026-10-04 (formiddag)
- 00185 i prod (pre/post/personas grønne) · N2/N28 merget og deployet · pilot-health viser godkendelseskøen
- Privacy: D50b, PV16, PV17, PV18 (negative kontroller grønne inden for 10 min) · MONTOR_START_JOB_ENABLED: runbook klar, flag OFF (Henrik/Vercel)
- BLOCKED_APPROVAL: INVOICE_ATTACHMENT_FETCH_ENABLED (Vercel), MONTOR_START_JOB_ENABLED (Vercel), e-conomic-nøgler, live mail/SMS

## NEXT-7 (long-run 2026-10-07 13:30 — Henrik: parkér approvals, arbejd kontinuerligt)

| # | Område | Opgave | Status |
|---|---|---|---|
| S2 | AI-tilbud | ELTA-komponenter i auto-tilbud (flag AI_PROJECT_ELTA_COMPONENTS) | BLOCKED_APPROVAL — mangler: (1) godkendelse af tavleintervaller (forslag ≤12 grp → TAVLE-S, 13–36 → TAVLE-L, >36 Ikke prissat; TAVLE-NY/-LILLE aldrig automatisk), (2) bekræftelse af tavlepriser i kataloget (TAVLE-S kost 800 kr virker lavt), (3) flag i prod. Alt andet færdigt: docs/runbooks/s2-elta-components-examples.md |
| X1 | Økonomi | Read-only fejlreview af faktura/Profit Engine/tilbudt vs faktisk/leverandørfakturakontrol (agent, 15 fund — alle verificeret i koden) | DONE (45013fb, 48a2e63, cc35bf7): #1 dobbelt fradrag ved fuldt krediteret faktura, #3 forfald fra afsendelse + PDF-dato, #4 falsk "Overfaktureret" (inkl./ekskl. moms), #5 manuelt betalt vises betalt, #6 negativ slutfaktura, #7 linjekredit-fortegn, #8 kladde-redigering pr. fakturatype + låste fradrag, #9 slutfaktura afviser kladde-forgængere, #10 foreløbig DB kun fakturerbart, #12 retur på leverandørfaktura, #13 likviditet danske måneder, #14 fakturakontrol på fakturadatoen, #15 ufaktureret som fakturaen; rykker-cutoff dansk dato. Unit + staging invoice-guards-check 12/12 + UI 17 tests grønne |
| X1b | Økonomi | #2 rykker/udestående efter delbetaling og delkreditering | BLOCKED_APPROVAL — allerede løst på branch `invoice-review-b` (B1/B2/B5, merge-klar); reviewet bekræfter at det er reelt (rykker kræver 12.500 når 10.000 er betalt) → anbefal godkendelse |
| X1c | Økonomi | #5 skrive-siden: "Markér betalt" sætter ikke amount_paid/payment_status (visning er rettet) · #11 kreditering frigiver ikke sagens timer/materialer til genfakturering | BESLUTNING — ændrer finansdata/forretningsadfærd; forslag: sæt amount_paid=final_amount + payment_status='paid' ved manuel markering; tilbyd "frigiv" efter fuld kreditering |
| X4 | Planlægning/kommunikation/grossist | Read-only fejlreview (3 agenter, alle fund verificeret i koden/prod read-only) | DONE (8521f6f, a608130, 343a052, 6ace93f+eb948b9, + tidsregistrering): planlægningsagent foreslår ikke udførte job igen og når nye sager; inaktiv montørs ordrer synlige i kalender + backlog; backlog alle åbne sager; **besigtigelses-kunderykker + portal kun bookede besigtigelser (live S2: interne opgaver blev rykket/kunne bekræftes)**; portal-bekræftelse uden dobbeltmail; hurtigsvar aldrig til FormSubmit; svar matches på kundens adresse (ikke citeret "Fra: Elta"); kundetekst escapes; **LM-synk kender alle 322k produkter (0 price_history-rækker i prod før)**; 0-kost overskriver ikke; sync-logs skrives ('partial'→'failed'); kostgate på importens prisændringer; død ugatet offer-pricing.ts fjernet; tidsregistrering: overlap afvises, sats skal være medarbejderens egen; arbejdsordre: ingen omplanlægning af udført/annulleret, ingen tom titel |
| X4b | Grossist/tid | DB-del (migrationer): compute_time_log_rates tjekker ejer/aktiv + godkendelse nulstilles ved satsskift; get_customer_product_price bruger FOUND + én præcedens (customer vs produkt-margin); supplier_sync_logs/schedules CHECK ('partial','ftp') | BLOCKED_APPROVAL — kode-vagterne er på plads; SQL skal vises før staging |
| X4c | Grossist | Kundeaftaler anvendes ikke i auto-tilbud/pakker (forkert RPC-signatur get_best_price_for_customer) + linje fra leverandørprodukt ignorerer kategoriregler og dropper kunderabat når en regel matcher; JS (ceil) vs DB (round) afrunding | BLOCKED_APPROVAL (L3) — prod har 0 kundeaftaler. Mangler: Henrik vælger én afrundingsregel (JS ceil eller DB round) før RPC-rettelsen. Pengeadfærd ændres ikke her. |
| X4d | Kommunikation | Tilbudsrykkere sender aldrig (cookie-klient i cron = anon, P-003/F7) og linket ville være dødt (portal-token læses som anon) | BLOCKED_APPROVAL (eksisterende kundemail-cron-beslutning) — ret resolver + token-læsning samtidig |
| X4e | S3 | "Kræver svar" pr. tråd + paginering; tilbudsopfølgning alle åbne; importforhåndsvisning i bidder; dublet-SKU i manuel import | DONE (da47d19, f1ada66, 26f1d80 Kalkia dublet-historik, + prisstatistik/prisoversigt pagineret og 'produkter med ændring' tæller produkter, ikke rækker). Afvist efter verifikation: getNextRunTime (Vercel-cron er UTC = serverens ur → korrekt). Parkeret: leverandørkategori-filter (kræver DISTINCT i DB → migration), faktureres timer uden godkendelse → AFKLARET: bevidst (00185, Henrik 2026-10-02: "fakturering, løn og e-conomic påvirkes IKKE af godkendelsen (endnu)"). **BLOCKED_APPROVAL (Henrik):** skal AFVISTE timer udelukkes fra fakturering/efterkalkulation, og skal 'pending' blokere faktura? (kode-ændring lille: filter i invoice-from-case/unbilled; ændrer forretningsadfærd) |
| X4f | S3 | 1.000-loft: fakturakontrol-dækning (incoming_invoices/-lines .limit(5000/50000)) + bankmatch på betalingsreference (.limit(2000)) | DONE — fetchAllRows; harness `coverage-check` (loader = SQL-optælling, PASS). Gennemgået og fravalgt: tilbudslinjer pr. tilbud (.limit(10000), >1.000 linjer på ét tilbud er urealistisk) |
| X4g | S3 | 1.000-loft: medarbejder-avance (work_order_profit nyeste 1.000 + ubegrænset time_logs .in()), regnskabs-statustællere, materialers brugstælling, pilot-opsætning fakturerede kunder, medarbejderøkonomi pr. projekt (employee-economics, hele historikken) | DONE — fetchAllRows/bidder á 200; tællere via count head. Fravalgt: system-health (1 t vindue), godkendte leverandørfakturaer (≤1.000 realistisk) |
| X4h | S3 | Fakturakontrol: opslag med normaliserede koder (STORE, uden mellemrum) mod case-sensitiv supplier_sku/ean | AFVIST efter verifikation — prod 0/323.860 varenumre med små bogstaver/mellemrum (`scripts/prod-sku-case.ts`, kun antal). Genkør efter nye leverandør-importformater. Efterkalkulationens timer pagineret (052ace1) |
| X4i | S2 | Margin-advarsel (intelligence-check): kost = enhedskost uden antal mod linjetotal → marginen overvurderet, lav-margin-tilbud gav ingen advarsel | DONE — `lib/alerts/offer-margin.ts` (kost × antal; salg uændret = alle linjer), test i test:profit. Prod-estimat (read-only, `scripts/prod-margin-alert-estimate.ts`): 0 nye advarsler i dag (2 aktive tilbud med kost). + .in()-lister i bidder á 200 (leverandørprodukter/eksisterende advarsler); staging system-alerts-check bestået (margin_below oprettes, 2. kørsel 0 dubletter) |
| X4j | S4 | UTC-dato i filnavne/testfaktura (betalingsliste-CSV/PDF, besigtigelsesrapport, test-leverandørfaktura dato+forfald) | DONE — copenhagenParts/copenhagenDatePlusDays. Gennemgået og OK: ai-budget (bevidst UTC-døgn), øvrige 15 er dato-aritmetik på T12:00Z. UI-regression økonomi U127/U123/U120/U116/U99/U94/U92/U91/U89/U88 PASS efter X4e–X4i |
| X4k | S3 | Profitabilitetsrapport: tilbudslinjer for 50 sager (>1.000 linjer) afkortet → tilbudt kost manglede; porteføljens udestående + dashboard 'ufaktureret salg' med ubegrænset .in() (URL-længde → tom liste/0 kr) | DONE — fetchAllRows / bidder á 200 |
| X4l | S2 | `.in()`-URL-grænse: målt på staging 300 UUID OK / 400 fejler (`cli.ts in-list-limit`). Fakturaoversigten (op til 500) mistede stille kundenavne, sagsnumre og regnskabsfejl-markering ved >~350 fakturaer | DONE — `lib/supabase/in-chunks.ts` (`selectInChunks`, bid 200) i listInvoicesOverviewAction. Resten af de 164 `.in()`-kald klassificeres (agent) → rettes i prioriteret rækkefølge |
| X4m | Info | Pilot-health prod: 36 åbne leverandørfakturaer uden leverandør — fejler auto-koblingen? | AFVIST som kodefejl (read-only `scripts/prod-invoices-no-supplier.ts`): 0 matcher kendt leverandør på navn eller afsenderdomæne; 13 forskellige afsenderdomæner = leverandører der ikke er oprettet (kun AO/LM findes). **Henrik/drift:** opret de faste grossister via "Opret ny" på mail-fakturaen (N66) → fremtidige fakturaer kobles automatisk. 22 webhenvendelser uden lead = kendt (N67-cockpit) |
| X4n | S2 | `.in()`-URL-grænse, systematisk (agent-klassificering af 164 kald → 15 RISIKO) | DONE: ordrelistens økonomi-batch (op til 500 sager), dashboardets kræver-svar (bid 500→200), inbox-fanen Kræver svar (`pageWithinIds`: id+sortering i bidder → side → fulde rækker; staging-tjek `page-within-ids-check` 650 id'er PASS), auto-opgaver for ubesvarede mails + auto-luk, samme-domæne-fakturaer, indkøbsoverblik, bilags-backfill, materialebrug, leverandør-cache-tal (via join, ingen id-liste; `cache-count-check`), markCacheStale, montør/salg-scope: sagsliste (pageWithinIds) + arbejdsordrer/kalender (filtrering efter hentning). **Ekstra fund:** getAffectedOffers fejlede ALTID (`'pending'` findes ikke i offer_status) → vendt om (aktive tilbudslinjer → deres prishistorik i bidder) med draft/sent/viewed; intelligence-check sprang 'viewed'-tilbud over (prod-estimat: 0 nye advarsler). Unit `in-chunks-test` i test:profit. Grænsetilfælde ikke rettet: accounting-health `.limit(300)` (virker), customers.filters.customerIds (ingen kalder) |
| S1-P1 | S1 (privatliv) | Portal: fuldmagtens CPR/CVR, underskrift og underskrevne PDF gik til ALLE parter på sagen (betaler/partner/leveringskunde) i RSC-props + PDF'en lå i betalerens dokumentliste | DONE 1ddc677 — kun tiltænkt underskriver; fuldmagter ude af dokumentlisten. Staging `portal-fuldmagt-leak-check` 4/4 (2 fejl uden rettelse). Prod read-only (`prod-fuldmagt-exposure.ts`): 4 fuldmagter, 0 på anden kundes kort, 0 sager med særskilt leveringskunde → ingen faktisk eksponering |
| S1-O3 | S1 (penge) | Auto-faktura ved portal-accept (regel AKTIV i prod) prissatte med sale_price, som manuelle linjer aldrig satte (DEFAULT 0) → faktura til 0 kr SENDT til kunden | DONE (beskyttelse): createInvoiceFromOffer afviser tilbud hvor fakturapris ≠ tilbudspris; create/updateLineItem sætter sale_price. Staging `offer-invoice-discount` 4/4. Prod (`prod-offer-invoice-price-exposure.ts`): 6 linjer/5 tilbud, 1 åbent, 0 fakturaer fra tilbud endnu. **BLOCKED_APPROVAL:** 00198 (udkast) — funktionen prissætter med unit_price + data-rettelse af de 6 linjer; indtil da faktureres de berørte tilbud manuelt |
| R-OFR | S2 | Tilbuds-review 2026-10-07 (agent, verificeret): totaler ved ændret rabat-/moms-% (updateOffer), auto-tilbud recalculateOfferFull (forkert total_amount + dobbelt rabat → fjernet), dobbelt-accept slettede vindende underskrift, statusskift uden status-vagt, 'set' overskrev samtidig accept | DONE 80f14cb |
| R-OFR-B | S2 | **BLOCKED_APPROVAL (Henrik):** (a) sendte/accepterede tilbud kan stadig redigeres (Rediger-knap + server actions tjekker kun offers.edit) → underskrevet indhold kan ændres uden spor. Forslag: kun 'draft' kan redigeres; ændring kræver 'Tilbage til kladde' (ny version). (b) accepted→draft efterlader underskrift/accepted_at/sag/faktura → forslag: blokér når sag/faktura findes, ellers arkivér underskrift + ryd accepted_at. Begge ændrer salgsflowet |
| R-PRT | S2 | Portal-review 2026-10-07: getPortalServiceCases tog kunde-id fra kalderen (latent IDOR) → token | DONE 80f14cb |
| R-PRT-B | S3 | **BLOCKED_APPROVAL (Henrik):** (a) portal-chat/upload uden længde-/mængdeloft (mail til kontakt@ pr. besked; 10 MB pr. upload uden kvote) → forslag: besked ≤ 5.000 tegn, ≤ 20 beskeder/time og ≤ 20 uploads/døgn pr. kunde, notifikationsmail højst hver 10. min. (b) interne sagsfotos/kundedokumenter vises i portalen = D26 — DONE via 00218 (prod 2026-10-14) |
| R-RBAC | S2 | Kost-/løn-review 2026-10-07 (6 audits): app-lag-læk lukket — kalibreringsprofiler, hurtigjobs kostpris, arbejdsordrers lav-DB, projekters budget/kost (62628db); egen avance på leverandørlinje (salg kunne aflæse eksakt kostpris, dc5ac3a); materiale-kostprishistorik, leverandørindstillinger, avance-orakel, DB%-metadata i aktiviteter (b05e558) | DONE |
| R-RBAC-B | S2 | **BLOCKED_APPROVAL (Henrik):** bølge 2 af kost-kolonne-lockdown — 18 tabeller læsbare for alle medarbejdere via REST (prod-verificeret; i dag kun montør berørt), plan i docs/runbooks/rls-cost-columns.md § Bølge 2. Desuden (lav): 00096-trigger hourly_rate = COALESCE(sales_rate, hourly_wage) — løn som salgssats hvis salgssats mangler (prod: 0 ramt); employees.cost_rate/hourly_rate læsbar for serviceleder; employee-economy kan inferere enkeltsats via flere perioder; omkostningsbaseret timekost i tilbudsanalyse (n=1) |
| R-CUS | S2 | Kunde-/leads-review 2026-10-07: dublet-kunder fra mail-automatik (e-mail + telefon sidste 8 cifre; staging `find-or-create-customer-check` 5/5), koblede mails om-klassificeret til ignoreret, domæne-kobling til vilkårlig kunde/eget domæne, intern afsender som kunde-e-mail, SAG-nummer-kollision, auto-kobling nulstillede manuel sag, kunde fra mail uden nummer-retry + lead-aktivitet med forkert kolonne, kundesletning kaskaderede projekter/dokumenter/opgaver/portal | DONE a984279 |
| R-CUS-B | **S1 (latent datatab)** | **STAGING DONE 2026-10-07 (Henrik: godkendt til staging)** — `harness:migrate-staging -- 00199`; `cli.ts user-delete-cascade-check` 5/5 (rigtig auth-bruger slettes → kunde/kontakt/opgave består, created_by NULL; kun profil + personlige data (assistant_links, personal_reminders) kaskaderer); `pilot-roles` 35/35 (1 kendt afvigelse: v_supplier_products_with_supplier, 00192-runbook pkt. 4, uafhængig). Prod-pre-check `scripts/prod-verify-00199.ts pre` 4/4 (109 kunder). **Prod BLOCKED_APPROVAL**: allowlist-post + `prod:apply-migration -- 00199 --approved-by-henrik` + `prod-verify-00199.ts post`. Oprindeligt fund: customers.created_by → profiles er ON DELETE CASCADE i prod: slettes brugeren der oprettede 101 af 109 kunder (mail-automatikkens admin), slettes de kunder og alt der kaskaderer. Ingen app-sti sletter brugere — kun Supabase-dashboard/SQL. **Indtil 00199 er kørt: slet ALDRIG en bruger i Supabase; deaktivér i CRM.** 00199 (udkast): created_by nullable + ON DELETE SET NULL |
| R-CUS-C | S3 | Resterende fra kunde-review: (3) RETTET — kun eksplicit videresendelse; svar udtrækkes fra teksten før citatet (unit forwarded-detect-test 5/5); (10) RETTET — navne-match kun ved én kunde + postnr. skal passe (staging find-or-create-customer-check 9/9); (12) RETTET — /api/public/contact matcher også deaktiverede + postal_code-nøgle | DONE |
| R-MAIL | S2 | Mail-cron-review 2026-10-07: (5) sagsbekræftelses-mail escapede ikke kundens tekst/indgående mails emne; (4) faktura-mail kunne sendes to gange (dobbeltklik/manuel + automatik) → krav via sent_at før afsendelse (staging `invoice-send-claim-check` 3/3); (2) fuldmagt-/besigtigelsesrykker skrev markøren EFTER afsendelse → gentaget ved tidsgrænse → krav før afsendelse + højst 5 pr. kørsel; (10) deaktiverede kunder rykkes ikke; (1) tilbud der er blevet til sag rykkes ikke | DONE |
| R-MAIL-B | S2 | Latente (tilbuds-/faktura-rykker-cron sender i dag intet pga. resolver-K1/X4d, BLOCKED_APPROVAL): (3) rykker viser fuldt beløb ved delbetaling/delkreditering → skal vise udestående og springe ≤0 over; (7) første aktivering ville rykke ALLE gamle åbne tilbud → aldersgrænse (fx 60 d); (8) rykker-niveau kan forbruges uden mail (krav uden lease); (9) hilsen/forhåndstjek på forkert part; (6) Graph-timeout tolkes som 'ikke sendt'; (11) regelmotor tjekker-før-handling uden lås. **Skal rettes i samme ændring som resolver-rettelsen (K1/X4d)** |
| R-AUTH | S2 | Auth-review 2026-10-07: app-rolle-fallback var 'montør' (reelle rettigheder) ved manglende profil/læsefejl → nu ingen rettigheder, og deaktiveret profil = ingen adgang (action-helpers + page-guard); inviteEmployeeLogin validerer rollen og logger rolle-fejl | DONE |
| R-AUTH-B | **S1** | **BLOCKED (Henrik, 2 min, dashboard) — P1 åben selvregistrering:** enhver kan via den offentlige anon-nøgle oprette sig og bliver AKTIV montør (handle_new_user) → via REST læse kunder/kontakter/dokumenter/tilbudslinjer og skrive hvor montør må. /register er lukket i appen, men Supabase 'Allow new users to sign up' er stadig TIL (runbook docs/runbooks/supabase-disable-signup.md). Prod read-only (`scripts/prod-self-registered-users.ts`): 3 ikke-inviterede konti uden medarbejderkobling = 2 admin + 1 montør (kendt G11), nyeste 31/1 → intet tegn på misbrug. Forsvar i dybden (migration, godkendelse): handle_new_user opretter ikke-inviterede som inaktive; user_role() returnerer NULL ved is_active=false (adgangstoken gælder ellers ≤1 t efter deaktivering) |
| R-AUTH-C | S3 | Fratrædelse → login (Henrik 2026-10-07: login deaktiveres som standard) | DONE — se D-2026-10-07 #3 |
| X2 | Telegram | Kommandoer: hjælp, "i dag" (mine opkald/påmindelser), flyt tidspunkt via kommando; opslag med næste arbejdsordre | DONE — staging assistant-commands-check 10/10; parser 28/28; øvrige assistent-suites grønne |
| X3 | Static-check | Død kode: lib/actions/price-engine.ts + project-estimation.ts (ingen kaldere, ukendte kolonner) | DONE — fjernet (+ types); tsc/rbac/rls-matrix grønne |

**Checkpoint 2026-10-07 15:20 (long-run):** ingen hængende processer (diagnosticeret efter Henriks "STOP WAITING": kun brugerens Chrome kører; seneste UI-batch afsluttet 15:07:30 exit 0). Fremover: UI-batches KUN i baggrunden (≤ 15 min), arbejde fortsætter imens — ingen kædede forgrunds-ventetider.

**Checkpoint 2026-10-07 16:05 (long-run):** X4e–X4n leveret (1.000-række-loft i prisstatistik/fakturakontrol/bankmatch/medarbejderavance/efterkalkulation/profitabilitet; margin-advarsel kost × antal; `.in()`-URL-grænse målt (300 OK/400 fejl) og 15 risikokald rettet med `selectInChunks`/`pageWithinIds`; getAffectedOffers virkede aldrig ('pending'-enum) → rettet). UI-regression grøn: økonomi 20 tests, mail 10 tests, U120/U124/U28/U38. Én flaky: U4 (montør /dashboard/pilot-health ikke NoAccess i én kørsel) → genkørt. Nye BLOCKED_APPROVAL: afviste/ventende timer i fakturering (X4e). Næste: resten af NEXT-7-sikre opgaver.

**Checkpoint 2026-10-07 16:50 (long-run):** NEXT tømt → ny backlog via 2 read-only reviews (tilbud, portal). Leveret: S1-P1 fuldmagt-CPR-læk (1ddc677, prod-eksponering 0), S1-O3 0-kr-auto-faktura (446afa3 beskyttelse; 00198 udkast BLOCKED_APPROVAL), R-OFR/R-PRT (80f14cb). UI grøn: salg 10, portal 10. Beslutninger til Henrik: 00198, R-OFR-B, R-PRT-B, X4e afviste timer, T14. Næste: RBAC-kost-review + kunder/leads-review (kører).

**Checkpoint 2026-10-07 17:20 (long-run):** RBAC-runde (R-RBAC DONE; DB-bølge 2 BLOCKED_APPROVAL), kunde-/leads-runde (R-CUS + R-CUS-C DONE; **R-CUS-B 00199 vigtig**). GitHub-push fejler siden 15:07 UTC med 'Internal Server Error' (også tom commit/anden gren; fetch virker, status.github = operational) → commits ligger lokalt (fra a984279) og pushes når GitHub svarer; prod har derfor endnu ikke kunde-/mail-rettelserne. Repoet er PUBLIC (til Henrik). Næste: review af mail-sendende crons (kører).

## NEXT-HIGH — ELTA ASSISTANT / TELEGRAM (Henrik 2026-10-07)

**Formål:** Telegram = hurtigt personligt assistent-interface til ELTA CRM. **CRM er altid source of truth** — Telegram
har intet eget/parallelt datasæt; alle handlinger skriver til CRM'ets eksisterende tabeller (kundeopgaver, kalender,
noter) og læser derfra. **Prioritet:** NEXT-HIGH efter de aktuelle kritiske security/economy-opgaver; må udvikles
parallelt med øvrige NEXT-flows, når core gates (tsc, check:rls-matrix, check:rbac) er grønne.
**Gate:** ingen live Telegram-/Relatel-aktivering i prod uden separat godkendelse (bot-token, webhook, afsendelse).

| # | Fase | Opgave | Status |
|---|---|---|---|
| T1 | 1 | Tekstkommando "Ring til kunde X i morgen kl. 10" → find korrekt kunde/sag (tvetydighed → spørg, aldrig gæt) → opret opgave/callback i CRM | DONE (motor, intet live) — fortolker (unit 20/20) + entydig kunde/sag (assistant-resolve-check 6/6) + opret CRM-opgave (assistant-run-check 9/9) |
| T2 | 1 | Callback/opgave vises i CRM-kalenderen | DONE — månedsvisning viser assistent-opkald 📞/påmindelser ⏰; kalenderen grupperer nu på dansk dato (U140) |
| T3 | 1 | Telegram-påmindelse før tidspunktet med knapper: Ring nu · Åbn kunde · Udsæt · Udført (skriver tilbage til CRM-opgaven) | DONE på staging (intet live) — Telegram-besked med Ring nu · Åbn kunde · Udsæt · Udført (telegram-check 20/20); cron /api/cron/assistant-reminders ikke planlagt; prod kræver ny godkendelse |
| T4 | 1 | Påmindelsen følger tidspunktet i CRM (flyttes/slettes opgaven i CRM → påmindelsen ændres; ingen kopi af tidspunktet i Telegram-laget) | DONE — tidspunktet læses fra customer_tasks.reminder_at ved hver kørsel; ændret tid → ny påmindelse (testet) |
| T5 | 1 | Opret kalenderaftale/besigtigelse fra Telegram | DONE — 'Besigtigelse/aftale hos X …' → CRM-aftale i kalenderen (📅), ingen kundemail |
| T6 | 1 | Skriv note på kunde/sag | DONE på staging — 00196 anvendt på staging: sag → case_notes (+source), kunde → customer_notes (notelog på kundesiden, U142); customers.notes overskrives aldrig; assistent-noter m. rolle-tjek + audit (notes-reminders-flow) |
| T7 | 1 | "Mind mig om …" → CRM-opgave | DONE på staging — med kunde/sag: customer_tasks; uden kunde: personal_reminders (00197, staging) — 'Mine påmindelser' i CRM (U143), fra Telegram, ret tid/udsæt/udført, kun ejer, påmindelse følger CRM-tiden |
| T8 | 1 | Opslag: kunde, sag, status (respekterer brugerens rolle/rettigheder som i CRM) | DONE (kontorroller) — montør afvist i fase 1 (scope kan ikke håndhæves med admin-klient) |
| T9 | 1 | Audit-log af ALLE Telegram-handlinger (hvem, hvad, hvilken kunde/sag) | DONE — audit_logs entity_type 'assistant' (oprettet, opslag, tvetydig, afvist) + påmindelse sendt |
| T10 | 1 | Fundament: kobling Telegram-bruger ↔ CRM-bruger (kun inviterede medarbejdere), webhook med hemmelighed, rettigheder = CRM-permissions | DONE på staging — 00195 anvendt på staging; webhook (flag + secret, fail-closed), kobling via engangskode (U141), rolle pr. handling, audit. Prod: secrets + flag + webhook kræver ny godkendelse |
| T11 | 2 | Talebeskeder (voice commands) → transskription → samme kommandoer som tekst | DONE staging (flag ASSISTANT_VOICE_ENABLED OFF) — `assistant-voice-check` 7/7 |
| T12 | 2 | Ubesvaret opkald/telefonsvarer → transskription → kunde-/sagsmatch → forslag/opgave om tilbageringning | DONE (fundament, intet live) — `missed-call-check` 8/8; live kræver Relatel-token + godkendelse |
| T13 | 2 | Relatel-/SMS-integration (live kræver godkendelse) | BLOCKED_APPROVAL — mangler Relatel-token og godkendelse af live SMS. Ingen klient bygges her. |
| T14 | 2 | Regelbaseret opfølgning | BLOCKED_APPROVAL — spec mangler; forslag R1–R6 (genbruger eksisterende signaler, kun besked til medarbejder) i docs/design/elta-assistant-telegram.md § T14. Henrik vælger regler/grænser/modtagere/cron |
| T15 | 3 | Live AI-telefonreceptionist | LATER |

## Fund registreret i delivery mode
| # | Sev | Fund | Status |
|---|---|---|---|
| D1 | S3 | audit_logs har ingen INSERT-policy for authenticated → 15 direkte audit-inserts med bruger-session (fakturaer sendt/betalt/krediteret, materialer, øvrige omk., indstillinger, regnskab) fejlede stille; prod: 0 sådanne rækker | DONE — insertAuditRow (service-role, user_id fra serversession); U15 verificerer at audits lander |
| D2 | S3 | log_audit_event (SECURITY DEFINER, authenticated EXECUTE) tager p_user_id som parameter → en bruger kan forfalske user_id i en audit-række via direkte RPC | BLOCKED_APPROVAL — 00182 på staging: bruger-session tvinges til auth.uid() + profil, kun service-role angiver identitet (agent-audit uændret). rls-read L11: før=ADMIN (forfalsket), efter=kalderen. Prod pre ✅ (`scripts/prod-verify-00182.ts pre|post`) |
| D5 | S3 | 49 steder byggede PostgREST-.or()-filtre med brugerens søgetekst uden citering → søgning med komma FEJLEDE ("failed to parse logic tree" — fx kabeldimension "3x1,5", "Hansen, Jens"), og , ( ) kunne ændre filterets struktur; 4 steder uden LIKE-escape (e-mail-match: _ blev wildcard) | DONE — pgQuote/escapeLike/ilikeContains (src/lib/validations/postgrest-filter.ts); semantik bevist mod staging-PostgREST (harness or-filter, 11 checks); unit-test i CI; ui-e2e U19 |
| D4 | S2 (opgraderet → P-012) | Login-formularen: klik før hydrering gav native GET-submit med e-mail + adgangskode i URL'en (historik/request-logs); samme i opret-konto, nulstil og glemt-adgangskode | DONE — method="post" + submit deaktiveret indtil hydreret (useHydrated); ui-e2e U22 (login uden JS). Henrik: tjek Vercel-request-logs for `password=` |
| D6 | S3 | Chat (portal + medarbejder): Enter/send mens en fil uploadede → beskeden gik uden bilaget, og bilaget røg med NÆSTE besked | DONE — send blokeret under upload (knap + Enter); ui-e2e U23 (portal-chat kunde uden login ↔ sælger m. PDF) |
| D7 | S3 | Kundekortet: portal-/partnerlinks havde absolut href i browseren men relativ på serveren → hydreringsfejl | DONE — relativ href, absolut URL kun ved kopiering |
| D8 | S3 | Godkendelse af leverandørfaktura: varelinjer uden produktmatch ("Kabel 3x1,5") blev som standard foreslået som ØVRIG omkostning i stedet for materiale (Sprint 5E-2-fallback) → forkert i sagens økonomi/fakturering | DONE — varelinjer (antal + stk-pris, ingen service-nøgleord) foreslås som materiale; nøgleord (kørsel, fragt, lift, gebyr…) stadig øvrig; bruger kan ændre pr. linje. ui-e2e U28 (godkendt, 2 materialer, kobling begge veje, ingen bogføring) |
| D9 | S3 | Fakturakladde på sagen: ikke-fakturerbare timer blev vist og FORVALGT (materialer/øvrige filtreres) men sprunget stille over ved oprettelse → kladden viste et andet beløb end fakturaen; forhåndsvisningen prissatte timer med live medarbejdersats mens fakturaen bruger det frosne salgssnapshot (overtid/satsændring → afvigelse); dato vist i UTC | DONE — samme regler som oprettelsen (billable-filter, snapshot før live sats, dansk dato). ui-e2e U31 (montørtimer → del-faktura: åben timer advarer, intern time skjult, timelinje = snapshot, timen låst); U15/U26 grønne |
| D10 | S2 | Slutfaktura prissatte timer med medarbejderens NUVÆRENDE sats (hardkodet 650 ved manglende sats) og ignorerede rate engine-snapshottet (overtid/satsændring) — del-faktura brugte snapshottet → samme time kunne faktureres forskelligt efter fakturatype; forkert beløb til kunden ved satsændring | DONE — én prisregel `lib/invoices/time-log-price.ts` (snapshot → live sats → fallback) i del-faktura, slutfaktura og kladde-visning; 8 unit-tests i test:time (CI). ui-e2e U32 (forskud 300 + 2 t, sats hævet 500→700 efter arbejdet → timelinje 1.000, fradrag −300, total 700, time låst); negativ kontrol: gammel kode fakturerede 1.400. Testrace i U26/U31 (header før totaler) rettet |
| D11 | S2 | Talfelter tolkede dansk tusindtal forkert: `Number(s.replace(",", "."))` → "1.250" blev 1,25 og "1.234,56" ugyldig. Ramte beløb på kreditnota (bevist: "1.000" gav kreditnota på −1 kr), sagsmaterialer/øvrige omkostninger (kost/salgspris → underfakturering uden fejl), fakturakladde-linjer ("2.5" blev 25), timer, overtidssatser, standard-timekost, a conto-procent | DONE — fælles `lib/utils/danish-number.ts` (parseDanishDecimal/toNumberDa; samme tom/ugyldig-semantik som før) på 19 felter; 21 unit-tests i test:decode (CI). ui-e2e U33 (kreditnota: "1.000" → −1.000, over-kredit blokeret, fuld rest → i alt −2.000; negativ kontrol −1/−1.999). Tegneværktøjets meter-felt (LATER) uændret |
| D12 | S3 | Del-/slutfaktura låste kilderækker (timer/materialer/øvrige) med `.is(invoice_line_id, null)` uden at tjekke at rækken faktisk blev låst; slutfakturaen ignorerede fejl helt → ved samtidig fakturering kunne en linje blive stående på to fakturaer | DONE (hærdning) — låsen skal ramme præcis 1 række; del-faktura fjerner linjen (already_billed), slutfaktura rulles helt tilbage med klar besked. Race IKKE reproduceret i praksis (harness C7/C8 grønne før og efter) — tilføjet som regressionsvagt |
| D13 | S2 | Slutfaktura fratrak forskud/rater FULDT selv når de var krediteret (helt eller delvist) → kunden fik krediteringen to gange (bevist: forskud 300 krediteret + rate 500 krediteret 200 + materiale 1.000 → slutfaktura 200 kr i stedet for 700); kladde-visningen viste samme forkerte fradrag | DONE — fradrag = beløb − krediteret (alle kreditnota-statusser, aldrig negativt) i slutfaktura, invoice_predecessors-snapshot og visning ("x − krediteret y"). ui-e2e U35 (negativ kontrol 200 → 700). Fulgt op (S3): krediteret andel tæller ikke længere mod 100 %-loftet for nye rater (service + UI, fælles `lib/invoices/stage-net.ts`, 9 unit-tests) — ui-e2e U36 (rate 100 % krediteret → ny rate 50 % = 5.000; negativ kontrol: blokeret) |
| D14 | S3 | getUser() ignorerede fejlen fra Supabase Auth → en forbigående fejl (netværk/429/5xx) blev til AUTH_REQUIRED og en tom side uden besked (set 1 gang i fuld regression: leverandørfaktura-listen). Årsag ikke påvist (dev-serverens log fanges ikke) | DONE (hærdning + diagnose) — ét nyt forsøg KUN ved forbigående fejl (udløbet/manglende session prøves ikke igen) + advarsel i serverloggen med fejlnavn/status (ingen tokens). Næste forekomst viser årsagen. Testfejl rettet: U33 delte fakturanummer med U15 |
| D15 | S3 | Død, eksporteret server-action `sendOffer` (200 linjer, ikke brugt af UI — afsendelse går via sendOfferEmail): egen mailsti med getCompanySettings (kræver settings.view, læser hele indstillingsrækken) + egen portal-token-oprettelse uden udløbs-oprydning → divergerende anden afsendelsesvej | DONE — fjernet + ubrugte imports. check:rbac grøn (396 gatet), ui-e2e U10/U13/U14/U24 grønne |
| D16 | S2 (latent — aktiveres med e-conomic-nøgler) | Leverandørfaktura → e-conomic (kører AUTOMATISK ved godkendelse når e-conomic er opsat): bogførte SUMMEN AF UDLÆSTE LINJER som omkostning (PDF-udlæsning er best-effort → manglende fragt/gebyrer = for lav omkostning); uden linjer + uden netto bogførtes beløb INKL. moms som omkostning; manglende fakturadato → dags dato (forkert periode); linje uden total → kun stk-pris | DONE — fælles `lib/economic/supplier-invoice-draft.ts`: differencelinje så bogført = fakturaens netto, netto udledt af inkl.−moms ellers afvist, manglende dato afvist, antal × stk-pris. Forhåndsvisning "Vis hvad der bogføres i e-conomic" FØR godkendelse (incoming_invoices.approve; intet sendes). 9 unit-tests (CI), ui-e2e U38, invoice-pipeline 10/10 |
| D17 | S2 (latent — aktiveres med e-conomic-nøgler) | Betaling → e-conomic-kassekladde (kører automatisk når fakturaen bliver fuldt betalt): bogføringsdato = dags dato i UTC (ikke betalingsdatoen → sent registreret betaling i forkert periode); faktura der kun er kladde i e-conomic ("draft-…") → bookedInvoiceNumber NaN; kreditnota bogført som INDbetaling | DONE — `lib/economic/payment-entry.ts`: dato = paid_at som dansk dag, kladde/kreditnota afvises med klar besked i sync-loggen. 10 unit-tests (CI); U29 grøn |
| D18 | S3 (fortrolighed/UX) | Montør på egen sag så ALLE faner (Fakturakladde, Handlinger), kostpris-/DB-kolonner (0,00 + rød "Foreløbig DB 0 %") og kunne indtaste kost-/salgspris på materialer, som blev gemt | DONE — montør ser kun relevante faner, materialer uden priser ("priser sættes af kontoret"), serveren ignorerer priser fra roller uden kost-ret; kontoret ser uændret priser/Handlinger. ui-e2e U40 (+U11/U26/U34 grønne). Opfølgning: "Øvrige omkostninger" viser heller ikke kost-kolonner/DB for montør (serveren sendte allerede 0) — U40 udvidet. BESLUTNING (Henrik) står stadig: må montør angive kostbeløb (kvittering) på øvrige omkostninger? (dialogen urørt) |
| D19 | S3 | Kunde-faktura-PDF via portalen læste firmaindstillinger med select(*) (inkl. SMTP-felter i hukommelsen) | DONE — kun offentlige kolonner. Fund: staging har INGEN firmarække (portal-PDF gav 500 på staging) — testen seeder/rydder selv. ui-e2e U41 (sendt faktura + PDF, kladde skjult/404, anden kundes 404) |
| D20 | S3 | "Forfalden"/dage over forfald blev beregnet med serverens UTC-midnat (4 steder: fakturaoversigt, kundens fakturaoverblik, betalingsadfærd) → først forfalden kl. 02:00 dansk tid dagen efter | DONE — fælles calendarDaysSince (dansk kalender) + 6 unit-tests (test:time). Automatiske rykkere ikke berørt |
| D21 | S2 | Fakturamail sendt af bogholderi (invoices.send uden settings.view) gik til kunden UDEN faktura-PDF (getCompanySettings fejlede → PDF stille droppet); bankinfo i mailtekst og PDF kunne komme fra forskellige kilder | DONE — firmaoplysninger (offentlige kolonner) via service-role efter gaten til både mailtekst og PDF; fælles bankkilde; mislykket PDF vises nu som "sendt UDEN PDF" i stedet for stille succes. Rykker-flowet bevidst urørt (automatiske rykkere må ikke ændres). Kan ikke e2e-testes (mail neutraliseret) — dækket af U46/U47 (samme firmadata-sti) + typecheck |
| D22 | S2 | PDF-routes: tilbuds-PDF gav 500 for salg på EGNE tilbud og faktura-PDF gav 500 for bogholderi (begge krævede settings.view via getCompanySettings); adgang var kun implicit (login + tilfældigt settings.view) | DONE — eksplicit adgang (faktura: invoices.view.all eller own_cases + sags-scope; tilbud: offers.view), firmadata via offentlige kolonner. Negativ kontrol: gammel kode gav salg 500 og montør 500 (IKKE data-læk — settings.view blokerede tilfældigvis). ui-e2e U46 (admin 200, montør 404 på faktura- og tilbuds-PDF), U47 (salg 200) |
| D23 | S2 (omsætning) | En sag kunne lukkes (3 veje: status-dropdown, "Markér afsluttet", rediger-formular) med ufakturerede timer/materialer/øvrige eller kørende timer — stille tabt omsætning | DONE — serverværn i setServiceCaseStatus + updateServiceCase: lukning afvises med opgørelse ("1 materiale for i alt 300,00 kr ekskl. moms er ikke faktureret på sagen"); UI spørger og kan "luk alligevel" (audit: "lukket trods …"). Ren optælling lib/invoices/unbilled.ts (6 unit-tests). ui-e2e U48 (fortryd = åben, bekræft = lukket + audit) |
| D24 | S2 (fortrolighed) | Kundeportalen sendte tilbudslinjer med select(*) til KUNDENS browser — inkl. kostpris, leverandørkost, margin og interne noter (bevist: 777.777 kostpris + intern note i sidens data på både tilbudsdetalje og oversigt). UI viste dem ikke, men de lå i sidens data | DONE — eksplicitte kunde-sikre linjefelter (= PortalOfferLineItem) i begge forespørgsler. ui-e2e U50 m. negativ kontrol. Prod-omfang (read-only 2026-10-01, `scripts/prod-portal-cost-exposure.ts`): 7 tilbud åbnet i portalen, heraf 2 (2 kunder) med kostpris på linjerne i sidens data (kun synligt i sidekilden); 0 med interne noter. Rettelsen er deployet. BESLUTNING (Henrik): skal de 2 kunder/tilbud vurderes? |
| D25 | S3 | Dashboard "Forfaldne fakturaer": talte forfald I DAG som forfalden, UTC-dato, medtog kreditnotaer og annullerede (fakturalisten gør ikke) + "betalinger i dag" i UTC-døgn | DONE — samme regel som fakturalisten (forfald før dansk dag, uden kreditnota/annulleret), dage via calendarDaysSince, dansk døgn for betalinger. ui-e2e U49 m. negativ kontrol |
| D26 | S2 (privatliv) — BESLUTNING | Fotos/PDF'er uploadet på sagens Dokumenter-fane (G4, montør/kontor) gemmes i customer_documents og vises i KUNDEPORTALEN — uden at UI'et sagde det; ingen måde at uploade internt | STAGING DONE (2026-10-02, Henrik: interne som standard) — 00184 `customer_documents.visible_to_customer` (default true for eksisterende/kontor-dokumenter; sagsuploads + mailbilag sættes interne), anvendt på staging. Kode på branch `d26-internal-case-docs`: kunde-/partnerportal (liste+download) kun delte; upload med "Del med kunde"-valg (default fra); mailbilag interne; pr. dokument Delt/Intern-badge + skift (cases.edit / egen sag) med audit. U59 7/7 på staging; negativ kontrol (portal-filter fjernet): U59 fejler på portal_skjuler_intern — testen fanger regressionen. Prod-effekt (read-only): 3 mailbilag bliver interne, 15 forbliver synlige, 0 sagsuploads. SUPERSEDED 2026-10-14 af 00218 `visible_in_portal` (prod; 15/15 eksisterende delt, mailbilag interne) — 00184/branchen bruges ikke |
| D27 | S3 (drift/støj) | Notifikationsklokken forespurgte `system_alerts` ved hver opdatering — tabellen findes IKKE i prod eller staging (00046 aldrig kørt; read-only bekræftet, også `price_alert_rules`) → fejl-log + undtagelse hver gang (støj der skjuler reelle fejl). NB: CLAUDE.md lister begge som eksisterende | DONE — "tabel mangler" (PGRST205) = ingen advarsler, ingen fejl-log; øvrige fejl logges som før. Fundet via ny dev-server-log i ui-e2e. Beslutning (senere): skal prisadvarsler bygges (migration) eller koden fjernes? |
| D28 | S2 | Kundekortets mail-tidslinje fejlede ALTID (PGRST201: tvetydig join incoming_emails↔service_cases — to FK'er, også i prod) → kundens mails blev aldrig vist; desuden ingen tilladelsestjek på kundens mails/mail-body (kun RLS, og incoming_emails er åben i prod indtil G10) | DONE — entydig FK (`!incoming_emails_service_case_id_fkey`) + gate customers.edit (admin/serviceleder/salg; ikke montør jf. G9) på liste, body og ulæst-tæller. Fundet via dev-server-log. ui-e2e U52 m. negativ kontrol. BESLUTNING (Henrik): skal bogholderi se kundens mails? (i dag: nej) |
| D29 | S3 (støj) | Portal-accept: intern "Tilbud accepteret"-mail kalder getSmtpSettings/getCompanySettings uden session → AUTH_REQUIRED i loggen. Prod har INGEN SMTP i firmaindstillinger (read-only) → mail bruger env-SMTP ligesom for indloggede — ingen funktionel forskel | DONE — portal-accept kalder ikke længere de session-krævende indstillinger; samme adfærd (env-SMTP, ingen aktivering), firmanavn via offentlig kolonne. 0 AUTH_REQUIRED-linjer i loggen; U10 grøn |
| D30 | S3 (salg) | Tilbudsformularen fik firmaindstillinger via getCompanySettings (kræver settings.view) → for SALG var de null: sælgers tilbud fik INGEN gyldighedsdato (udløber aldrig, opfølgning kan ikke sige "udløber snart") og ingen standardbetingelser | DONE — formularen henter selv standarder (gyldighed, moms, betingelser) via getOfferFormDefaultsAction (offers.create, kun de 3 felter) når siden ikke kunne. Negativ kontrol: gammel formular → valid_until null for salg. Prod (read-only): 1/15 tilbud uden gyldighed (admin), ingen salgs-tilbud endnu → forebyggende. ui-e2e U54 |
| D31 | S3 (salg, kundevendt) | Tilbudssiden, tilbudslisten, kundekortet og dashboardet hentede firmaoplysninger via getCompanySettings (kræver settings.view) → for salg: tilbuds-print/forhåndsvisning viste "Virksomhed" uden navn, CVR, adresse og kontakt | DONE — getDocumentCompanySettings: settings.view-roller får fuld række som før; øvrige (offers.view/customers.view) kun offentlige kolonner. Negativ kontrol: gammel kode → intet firmanavn/CVR på sælgers print. ui-e2e U55 (+U7/U13/U24/U27 grønne) |
| D32 | S2 (privatliv) | Sagens "Bemærkninger (interne)" (status_note — sådan hedder feltet i sagsformularen; også "Note" i Handlinger) blev VIST for kunden i kundeportalen | DONE — portalen henter og viser ikke længere status_note. Negativ kontrol: gammel kode viste bemærkningen i kundens side. Prod (read-only): 0 sager med note → intet lækket endnu (forebyggende før pilot). ui-e2e U56. Samme læk fundet i PARTNERPORTALEN (status_note i sidedata til eksterne partnere) — også fjernet |
| D33 | S2 (privatliv) | Kundens tilbuds-PDF (medarbejder-download, portal-PDF OG mail-vedhæftning) printede tilbuddets "Interne noter" under "OBS / Bemærkninger" + linjernes noter — selvom tilbudssiden siger "Interne noter — vises IKKE på PDF/portal" | DONE — noterne udeladt fra kundens PDF (kundevendt tekst = "Opgavens omfang"). Unit-test på PDF-elementtræet i test:time (CI) m. negativ kontrol (gammel skabelon: begge noter med). Prod (read-only): 10 sendte tilbud, 0 med interne noter/linjenoter → intet lækket. Quote-generatorens egne skabeloner har et separat, bevidst kundevendt notes-felt (urørt) |
| D34 | S2 (privatliv) | Kundens faktura-PDF printede fakturaens note under "Note" — feltet hedder "Intern note (valgfri)" alle 4 steder det udfyldes (del-/slut-/a conto-faktura, kreditnota) | DONE — noten udeladt fra kundens faktura. Unit-test (test:time, CI) m. negativ kontrol. Prod (read-only): 5 sendte fakturaer, 0 med intern note → intet lækket. U41/U46 grønne |
| D35 | S3 (kundevendt) | Datoformatering (formatDateLongDK/formatDateTimeDK/formatSmartDate) brugte processens tidszone → på Vercel (UTC): faktura-/tilbuds-PDF og server-renderede sider viste gårsdagens dato for tidsstempler kl. 00–02 dansk tid, og klokkeslæt var 1–2 timer forkert (31 kaldesteder) | DONE — tidsstempler omregnes til dansk "vægur" før formatering (rene datoer uændret, samme outputformat). Unit-test der selv kører i UTC (som Vercel) i test:time (CI); negativ kontrol: 4 fejl med gammel kode. Opfølgning: 17 server-datoformateringer uden tidszone (fuldmagt-dokumentdato, besigtigelses-bekræftelser, citat i mailsvar, opgavedatoer, betalingsrapport, intern accept-mail) har fået timeZone Europe/Copenhagen. Tilbuds-påmindelses-cron bevidst urørt (automatik) |
| D36 | CI | check:rls-matrix (CI-blokerende) var RØD fra `88ab138` (D18) til `d671d59`: den statiske skrivevej-scanner læser hasPermission('…')-literaler i en skrivefunktion som skrive-gates, og D18's pris-visningsret (materials.view.cost_prices, inkl. bogholderi) blev tolket som "bogholderi skriver case_materials" | DONE — navngivet konstant + kommentar (samme adfærd). Fundet ved lokal kørsel af alle CI-trin (gh CLI ikke tilgængelig her → CI-status kunne ikke læses direkte). Øvrige CI-trin lokalt grønne: lint (0 fejl), check:rbac, check:offers-embeds, test:profit/time/decode/invoice-pdf |
| D37 | S2 (tabt salg) | Henvendelser fra hjemmesidens kontaktformular (FormSubmit) blev HARD-ignoreret som støj siden 2026-04-30: prod read-only ~48 "Ny henvendelse fra eltasolar.dk" (47 ignored), kun 3 website-leads i alt. Desuden 81 ukoblede mails fra kendte kunders adresser, 59 aldrig behandlet (pending marts–juni) | FIX på branch `webform-inquiries` (kode, ingen migration, ingen data ændres): webhenvendelser → "unidentified" (manuel, ALDRIG auto-kunde — afsender er FormSubmit), fanen "Webhenvendelser" viser også de historisk ignorerede, "Opret fra mail" læser formularfelterne; unit + U64. Merge til main efter e2e. Henrik: de ~47 historiske henvendelser bør gennemgås (fanen viser dem). Rest → N24 (retro-kobling af 81 kunde-mails, 59 pending) |
| D38 | Testmiljø (ydeevnefejl) | Fuld/subset-ui-e2e tog 4+ t: `next dev` kompilerer hver side ved første besøg (offers/[id] >180 s → 2×180 s goto-timeouts pr. besøg), op til 3,5 GB heap på en 6 GB-maskine → genstart/OOM (dev-serveren døde helt kl. 16:29); resultater blev først udskrevet til sidst; ~540 efterladte testbrugere på staging | DONE: harness kører nu mod produktionsbuild (`next build`+`next start`, UI_E2E_SERVER=dev = fallback), streamer resultater, telemetri pr. test (JSONL: start/varighed/ok/timeouts/retries), grupper UI_E2E_GROUP=smoke|sales|montor|economy|portal-mail, `harness:cleanup-users` (533 slettet), **watchdog-batches `harness:ui-batches`** (1–5 tests pr. batch-proces, 5 min uden resultat → FAILED_TIMEOUT + kill tree + sidste output, 15 min/batch, 30 min i alt). Målt: montør-gruppe 282 s, portal-mail 308 s, smoke 3,5 min inkl. build. Politik: smoke ≤10 min, målrettet ≤20 min, fuld kun natligt |
| D39 | S3 (støj/legacy) | Kundeportal-accept kalder createProjectFromOffer (gammel projects-model) med bruger-session — kunden er ikke logget ind → AUTH_REQUIRED + "Error auto-creating project" ved hver accept; prod: 1 projekt / 4 accepterede tilbud. Den rigtige sag oprettes via service_cases (U10 grøn) | DONE (kode) — legacy-projektkaldet fjernet fra portal-accept (eneste reference verificeret; createProjectFromOffer bevaret i projects.ts; ingen data ændret); U10/U23/U41 grønne. Rest: dashboard/eksport/læring læser stadig projects (legacy-oprydning, LATER) |
| D40 | S2 (privatliv) | Kundeportalens besigtigelses-sektion faldt tilbage til ALLE kundens opgaver (titel + beskrivelse, også interne) når kunden ingen besigtigelse havde; bekræft/ombook kunne ramme vilkårlige opgaver. Prod read-only 2026-10-03: 1 portalkunde, 2 interne opgaver eksponeret (scripts/prod-portal-tasks-exposure.ts) | FIX (kode): kun besigtigelsesopgaver; til klienten kun dato/status/tidspunkt (ingen interne titler/beskrivelser i payload); bekræft/ombook kun på besigtigelser. U69 (negativ kontrol: intern opgave ikke i sidens HTML) |
| D41 | S2 (RBAC, løn) | Medarbejderhistorik (employees.view → også serviceleder) returnerede hele hændelsen inkl. metadata.real_hourly_cost og begrundelse for lønændring | FIX: metadata sendes aldrig; begrundelse på lønhændelser kun med employees.payroll.view. U73 |
| D42 | S2 (RBAC, kost) | listTimeLogsForCase strippede intet → montør (time_logs.view.own) fik cost_amount, kostsats og medarbejdersats i sagens tidsdata; listTimeLogsForWorkOrder lækkede medarbejdersats | FIX: fælles stripTimeLogPrices — uden economy.cost_prices ingen kost/sats, uden invoices.view.own_cases heller ingen salg. U73 |
| O1 | Observation → ÅRSAG FUNDET (miljø) | Fuld regression: "network error"/side-fejl og til sidst ERR_CONNECTION_REFUSED sent i lange kørsler | LØST (test-miljø) — dev-serverens log viste "Server is approaching the used memory threshold, restarting…": `next dev` genstarter ved hukommelsespres (maskinen ~6 GB RAM). IKKE en app-fejl (prod kører build). Harness: gotoSafe venter på genstart og prøver igen; U5 henfører netværksfejl under en logget genstart til miljø (vises i noten, fejler ikke), alle andre fejl fejler stadig Opfølgning: efter en genstart fejlede resten af kørslen (10 tests — alle grønne i målrettet genkørsel; prod verificeret ren for test-data: scripts/prod-harness-leak-check.ts). Testserveren får nu --max-old-space-size=3584 (genstart sker ved 80 % af heap-grænsen); mail-neutralisering holder også efter genstart (tomme env-værdier overskrives ikke af .env.local) |
| N19 | Tilbud | Tilbudslinje fra grossistkatalog uden e2e-dækning | DONE (verificeret) — "Fra leverandør" → søg varenr. → "+ Tilføj" → linje m. leverandørspor, kostpris gemt, salgspris via marginregel (40 → 48). ui-e2e U51. (Tjekket: DB%/profitkort falder korrekt tilbage til leverandørkost når cost_price ikke er sat) |
| N20 | Salg | Intet "Opret tilbud" fra leadet (sælger skulle forlade leadet og huske at vælge det) | DONE — "Opret tilbud" på leadet (offers.create): tilbudsformularen forudfyldt med leadet — eller kunden, hvis leadet er blevet kunde (N13). ui-e2e U54 |
| N21 | Salg | Accepteret tilbud opdaterede aldrig leadet → salgspipelinen ("Vundne leads") stod stille | DONE — ved accept (kundeportal og medarbejder) markeres tilknyttede åbne leads som vundet + aktivitet: tilbuddets lead_id og leads konverteret til tilbuddets kunde (N13). Tabte/vundne urørt; afvisning sætter bevidst ikke "tabt" (flere tilbud pr. lead). Kaster aldrig. Negativ kontrol: gammel kode → leads uændrede. ui-e2e U57 |
| N22 | Tilbud | Sendte tilbud efter "gyldig til" så aktive ud, men kundeportalens accept-værn afviser dem — sælger kunne ikke se at kunden sidder fast | DONE — "Udløbet"-mærke i tilbudslisten og på tilbuddet (med hint: forlæng via Rediger), samme regel som portalen (dansk dag), vises efter hydrering. Ingen statusændring/automatik. ui-e2e U58 |
| D3 | S3 | Kunde-/lead-/tilbudslister beregnede relativ tid på server og klient → hydreringsfejl ved minutskifte | DONE (SmartDate) |

## LATER
Floorplan/3D · fuld Kalkia-motor · F2b katalog-prisspænd (migration) · generelle audits/refactors · Relatel trin 1–5 (ekstern aktivering gated)

## Ventende godkendelser (BLOCKED_APPROVAL)

**KØRT I PROD 2026-10-03 09:52–10:00 (Henrik godkendt i chat):** 00180 → 00181 → 00175 → 00176 → 00177 → 00179 → 00178 → 00182 → 00183, én ad gangen med pre/post — alle grønne; samlet `prod:batch-check post` 6/6 ✅; prod-db-audit HØJ/MIDDEL/LAV = 0; produktsøgning 55–166 ms (før 2–7 s; 00183 tog 49 s). Udestår (Henrik, Vercel): `MONTOR_START_JOB_ENABLED=true` + redeploy (efter 00181). Tabellens rækker 1–6 herunder er hermed DONE.

**KØRT I PROD 2026-10-04 (Henrik godkendt i chat):** 00185 (N2 timegodkendelse) — pre/post/personas ✅; branch n2-time-approval merget og deployet.

**ÅBNE HENRIK-HANDLINGER (status 2026-10-04 11:50):**
| Handling | Hvorfor / effekt | Klar? |
|---|---|---|
| Vercel: `INVOICE_ATTACHMENT_FETCH_ENABLED=true` + redeploy (godkendt 2026-09-29) | 36 mail-fakturaer uden bilag / 48 "needs_review" — bilag hentes og læses automatisk | ✅ runbook invoice-attachment-backfill.md (manuel vej imens: "Vedhæft PDF fra mailen") |
| Vercel: `MONTOR_START_JOB_ENABLED=true` + redeploy | montør starter eget job → sag "I gang" automatisk | ✅ prod-RLS verificeret; runbook n11-montor-start-job-flag.md |
| Prod 00184 (D26) → merge `d26-internal-case-docs` | sagsdokumenter interne som standard | ✅ staging |
| Prod 00186 (D28) — 00180 er kørt, så den kan køre nu | bogholderi ser kun kunde-/fakturamails | ✅ staging + pre |
| e-conomic: API-nøgler + godkendelse af live-bogføring | eksport/betaling/leverandørfaktura (forhåndsvisninger klar) | foundation færdig |
| Drift G11: knyt montør #2 til medarbejder | montør #2 ser ingen job | 1 klik (Medarbejder → Login) |
| Drift (N66): opret de faste leverandører fra én faktura hver (Leverandørfaktura → "Vælg leverandør" → "Opret ny"): mikma.dk (6 fakturaer), aceve.com (5), fasetech.dk (4), dccenergi.dk (3) | de øvrige fakturaer fra samme domæne kobles derefter automatisk ved "Kør parse + match igen"/næste mail; 21/54 er fra gmail/hotmail → filteret "Ikke en faktura?" | 4 klik |
| Drift: læs de 8 portal-kundebeskeder (ældste 199 d) | kunder venter på svar (fejl rettet: kan nu markeres læst) | cockpit "Kundebeskeder (portal)" |
| Beslutning: kundemail-crons (offer-/invoice-reminders) og døde anon-crons | ændrer cron-adfærd | analyse færdig |
| Drift/beslutning: admin-alarmer når ingen | system-health sender alarmer (e-conomic ikke sat op, bankimport forældet) til ingen — `no_recipients` hver dag. Årsag: ADMIN_ALERT_EMAIL er ikke sat, og fallback'en læser `profiles.email`, som er tom for alle 3 admins (e-mailen står kun i auth.users). Valg: (a) sæt ADMIN_ALERT_EMAIL i Vercel, eller (b) godkend kodefix der bruger auth-e-mailen — begge AKTIVERER daglige alarmmails. NB: `profiles.email` er tom for alle admins — læses også af mailsignatur og faktura-mail-indstillinger; en backfill fra auth.users er en dataændring (kræver godkendelse) | (b) ✅ klar på branch `admin-alert-recipients-auth-email` (ca6a8a7); bedre: (c) migration 00188 på branch `profiles-email-from-auth` (65b8910) retter roden (trigger + backfill) |
| Beslutning (N69): "Kræver svar" kan ikke se svar sendt fra personlige postkasser | prod: kun kontakt@ og ordre@ synkes (crm@ stoppede 2026-02-28); 72 indgående/30 d men 2 udgående — medarbejderne svarer fra hc@/lj@/… → tråde står "kræver svar" for evigt (ældste ulæste 89 d). Valg: (a) synk "Sendt post" fra de personlige postkasser (privacy-beslutning: kun sendt post, kun tråde der allerede findes i CRM) eller (b) manuel "Markér som besvaret" (kræver migration: incoming_emails.responded_at timestamptz + responded_by uuid — SQL vises før kørsel) | (b) ✅ klar på branch `n69-mark-thread-answered` (cb1ab0c): migration 00187 (SQL + rollback i headeren, IKKE kørt), action + knap "Besvaret uden for CRM", kræver-svar-logik; tsc/rbac/rls-matrix grønne — e2e efter staging-migration |
| Beslutning (N74b): mail-automatikken opretter kunder ud fra leverandørers signatur (dccenergi.dk ×4 m.fl.) — prod: 92 af 107 kunder er auto-oprettet fra mail (14 uden e-mail), ingen af dem har tilbud/sag/faktura (scripts/prod-placeholder-customers.ts) | forslag: opret ALDRIG kunde automatisk, når afsenderdomænet tilhører en kendt leverandør (suppliers.website/kontakt — N66) eller er eltasolar.dk; oprydning af eksisterende (deaktivér/flet) kræver også godkendelse | ✅ klar på branch `n74b-no-auto-customer-from-suppliers` (eb0513d, tsc grøn; ikke merget). Kundelisten har filteret "Oprettet fra mail" (N74) |
| Beslutning (N68b): mail→leverandørfaktura-indtag springer privat-/gratis-mail over, når mailen hverken har PDF-bilag eller "faktura" i emnet | prod: 13/36 åbne "fakturaer" er kundemails/ansøgninger fra gmail/hotmail; 11/19 afviste ligeså. Ændrer hvad der bliver til leverandørfakturaer → kræver godkendelse | ✅ klar på branch `n68b-skip-private-mail-ingest` (3d39496, tsc grøn; ikke merget). N68 markerer dem imens ("Ikke en faktura?") |

**Samlet køreplan i rækkefølge:** docs/runbooks/PROD-GATE-BATCH-2026-10.md

| Gate | Forberedt | Runbook |
|---|---|---|
| **Samlet pre-check (read-only):** `npm run -s prod:batch-check -- pre` | 2026-10-02: ✅ 6/6 trin i køreplanens rækkefølge | docs/runbooks/PROD-GATE-BATCH-2026-10.md (allowlist-linjer klar, tilføjes først ved godkendelse) |
| 1. Prod 00180 (G10: montør kun mails på egne sager + serviceleder ser medarbejdere) — prioriteret først (Henrik 2026-10-02) | staging grøn, prod pre ✅ | docs/runbooks/00180-g10-mail-scope-employees.md |
| 2. Prod 00181 (WAVE5: montør starter/afslutter kun egne arbejdsordrer) + derefter Vercel MONTOR_START_JOB_ENABLED=true | staging grøn, prod pre ✅ | docs/runbooks/p009-rls-write-lockdown.md § Runde 5 |
| 3. Prod 00175–00177 + 00179 (læse-side: tokens, hemmeligheder, beskeder, underskrifter) | kode deployet; staging + rls-read 8/8; NY verifier `prod:verify-read-lockdown` (kolonnelister læst fra migrationerne): prod pre ✅, staging post ✅, prod post fanger korrekt 16 afvigelser (negativ kontrol) | samlet runbook |
| 4. Prod 00178 (runde 4: 44 kalkulations-/katalogtabeller) | staging 44/44, prod pre ✅ | samme |
| 5. Prod 00182 (D2: audit-identitet kan ikke forfalskes via RPC) | staging grøn (L11), prod pre ✅ | migrationens header + scripts/prod-verify-00182.ts |
| 6. Prod 00183 (N4: produktsøgning 2–7 s → ms; kør uden for 02:00-sync) | staging målt, prod pre ✅ | migrationens header + scripts/prod-verify-00183.ts |
| Separat: Prod 00184 (D26: sagsdokumenter/mailbilag interne som standard) → derefter merge af branch `d26-internal-case-docs` | staging ✅, U59 7/7; prod-effekt: 3 mailbilag bliver interne | samlet runbook § Separate gates |
| Separat: Prod 00186 (D28: bogholderi kun kunde-/fakturamails) — EFTER 00180 | staging ✅ (rls-read L12), prod pre stopper korrekt indtil 00180 er kørt; effekt 805 → 241 mails for bogholderi | `npx tsx scripts/prod-verify-00186.ts pre|post` |
| Separat: Prod 00185 (N2: timegodkendelse) → derefter merge af branch `n2-time-approval` | staging ✅ (rls-read L13, U62) | migrationens header (rollback) |
| Vercel: INVOICE_ATTACHMENT_FETCH_ENABLED=true (faktura-backfill) | kode deployet, baseline taget | docs/runbooks/invoice-attachment-backfill.md |
| Aktivering af hidtil døde crons (cookie-klient → service-role): unanswered-mails (interne opgaver), offer-reminders (KUNDEMAIL), supplier-sync | analyse færdig; ændrer cron-adfærd → kræver separat godkendelse | — |
| Opfølgning: prod-cron-status efter 00170–00174 | VERIFICERET 12:02 UTC: 9 crons ok (bank-match, export-error-notification, incoming-invoices, incoming-invoices-api, invoice-reminders, offer-reminders, payment-report, system-health-check, unanswered-mails-check). Udestår kun natlige (supplier-sync, intelligence-check, learning-feedback, email-sync) | — |

## P0 — Sikkerhed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 1 | R1: salg må kun læse fakturaer efter besluttet adgangsmodel | DONE (staging) | Model SPRINT_7A own_cases (sag created_by); 00161 · prod → P0-gate |
| 2 | R2: time_logs ikke læsbar for alle authenticated | DONE (staging) | Scope = app case-scope (employee.profile_id/work_orders); skriv kun egen medarbejder+ordre; 00161 |
| 3 | R3: supplier_credentials ikke læsbar for almindelige brugere | DONE (kode i prod, DB staging) | Server-only secrets-modul + settings.suppliers-gate (pushet); kolonne-grants i 00161 |
| 4 | Security harness: R1–R4 kan ikke regressere (rigtige probe-rækker) | DONE | rls-residuals.ts (35 checks) + views + hemmelige kolonner i pilot-roles/prod:role-policies; scripts/security-static-test.ts |

## P1 — Pilot-robusthed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 5 | Udvid audit af alle rollefølsomme tabeller | DONE (staging) | db-audit (T1–T4, F1–F3, V1) prod+staging; fund P-004 → 00162; anon-surface-probes i pilot-roles. 112 tabeller hvor alle indloggede kan skrive (T4, app-lag) → egen hærdnings-opgave |
| 6 | Test sessions, invitationer, deaktiverede brugere, rolleændringer | DONE | harness:session-lifecycle 7/7: signup-rolle ignoreres, ingen selv-eskalering, rolleændring live i aktiv session, deaktivering → login/refresh afvist og gyldigt token behandles som anon med det samme. Staging-paritet: auth-trigger on_auth_user_created tilføjet (harness:staging-parity) |
| 7 | Samtidige brugere/race conditions i centrale workflows | DONE | harness:concurrency 6/6 (stabil 5 koersler): parallel executeAction, runOfferAgent, handler (UNIQUE source_case_id), tilbudsnumre, opfølgningsagent, kundenumre. **2 race-fejl fundet og rettet:** (a) tilbudsnummer: 4/8 samtidige oprettelser fejlede (3 forsøg, 3 generatorer helt uden retry) → alle 5 generatorer samlet i services/offer-number.ts, 10 forsøg m. jitter-backoff, retry kun ved nummer-kollision; kundenummer samme (10 forsøg). (b) runOfferAgent kunne give 2 aktive forslag pr. sag → idempotency-generation = antal inaktive forslag |
| 8 | Fejloplevelser og tomme states i pilotens vigtigste UI | DONE | **Permission denied:** 55 sider under menu-gatede moduler havde ingen server-guard (direkte URL → tom liste/rå fejl) → `ModuleGuard` + layout pr. modul (29 layouts), settings-hub viser kun personlige kort for ikke-admins. **Stale data:** godkend/afvis på allerede afgjort forslag gav "Godkendt"; udfør på afgjort gav "Udført" → decision-guard + info-toast. **Recovery:** global-error.tsx (root-layout-fejl gav hvid side). Tests: `npm run ui:guard-audit` (G1–G4 inkl. blindgyde-check menu↔guard) + `harness:ui-states` 3/3. Empty states fandtes allerede i pilot-lister |
| 9 | Logging, incident-synlighed, supplier-sync-cron (discovery) | DONE | Alle 15 crons pakket i `withCronRun` → hver kørsel i system_health_log (før: 1/15). Cron-register (`cron-registry.ts`) = vercel.json (`ops:cron-check`). `harness:cron-log` 6/6. Read-only prod-måling: 0 kundemails fra crons seneste 30 d; supplier-sync har 0 planer; 3 andre crons er stille no-ops (anon-klient). Intet aktiveret. Rapport: docs/pilot/CRON_DISCOVERY.md |
| 10 | Pilot Operations-dashboard/health så enkelt som muligt | DONE | `/dashboard/pilot-health` (admin, read-only): 7 sektioner — system, crons (seneste kørsel/forsinket/kendte fund), brugere pr. rolle, agenter+sikkerhedsflag, åbne incidents, integrationer (mail/e-conomic/bank/leverandør), **live anon-prober** (SELECT-only). Hver sektion fejler isoleret. `harness:health-snapshot` 7/7 inkl. detektion (aktiveret agent → rød, cron-fejl → rød) og probe-rækker mod vakuøse resultater. Incident-register synkront med INCIDENT_LOG (`ops:incident-check`). |

## P2 — Agent Core
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 11 | Audit af alle capabilities mod approval/executor-model | DONE | 4 defense-in-depth-huller lukket i Executor: klasse/approval/ejer udledes af capability-registeret (rækken kan kun skærpe), ejerskab `agentTypes`, approvals genverificeres efter claim; registrering kaster ved skrivende klasse uden approval. `harness:agent-gating` 8/8 (inkl. positiv kontrol). Fund: `mail.send_reply` uden producent (→ #13); DB-trigger-hærdning = DDL-gate. Rapport: docs/agent-capability-audit.md |
| 12 | Udvid stale-state/idempotency/concurrency-tests | DONE | Matrix for alle 7 capabilities (samtidig udførelse, gentagelse, stale, samtidige forslag). **Fejl fundet+rettet:** `mail.link_customer` overskrev en manuel kobling til en anden kunde → atomisk betinget UPDATE. Hængende `executing` vises nu rødt i Pilot Health. `harness:agent-actions` 7/7 + link-unit 9/9. Se docs/agent-capability-audit.md |
| 13 | Forbered næste agent-milepæl (ingen live send/cron/finance) | DONE | Fase 6 forberedt: planlægningsagent `planning.propose_work_order` (intern arbejdsordre efter approval; dato+montør efter belastning; ingen besked, ingen cron; disabled). Unit + `harness:planning-flow` 6/6. Roadmap/live-gates opdateret (send_reply-producent + scope-model som krav før live). |
| 14 | Agent Inbox reviewer-UX (konkrete problemer) | DONE | 6 konkrete fund rettet i Agent Inbox. Fejlede/uvisse forslag viser nu årsagen på dansk ("Hvorfor: Forslaget er forældet: …"). "Godkend" vises ikke efter godkendelse. "Udfør" er slået fra (med forklaring) før godkendelse og når agenten er slået fra. Hvert run viser "agent aktiv/slået fra". needs_verification og hængende udførelse har en advarsel om ikke at gentage. Titler, status og afvisningsårsager er på dansk. Regler i `inbox-presentation.ts` + `agent-inbox-ux-test` (inkl. drift-vagter: alle capabilities/statusser har labels). **P2 komplet.** |

## P3 — Næste produktmoduler (discovery/design)
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 15 | Relatel: teknisk discovery + integrationskontrakt (ingen rigtig SMS) | DONE (discovery + foundation) | docs/integrations/RELATEL_CONTRACT.md er baseret på den offentlige API-dokumentation. Fund: iframe-API'et er usigneret (kun `?number=`), `X-Frame-Options: DENY` + SameSite-cookies forhindrer indlogget iframe, og telefonformaterne er blandede. Foundation er bygget: nummer-normalisering, opkalds-opslag `/dashboard/cti?number=` (login + RLS), kontrakt-typer og en deaktiveret klient uden netværk. Tests: `relatel-test` + `harness:relatel-lookup` 3/3 + ui-e2e U6. **BLOCKED:** access-token + beslutning om trin 1–5 (CTI-side, opkaldslog, click-to-call, SMS-udbyder). |
| 16 | Deterministic follow-up engine (design, ingen live automation) | DONE (design + motor) | 10 tidsdrevne regler kortlagt med konflikter: parallel kundemail + agent på samme tilbud, 3 alders- og udløbsbegreber, UTC-crons, intet loft pr. kunde, samtidighedsrisiko. En ren deterministisk motor er bygget (dansk kalender, stabile nøgler, én regel pr. situation, loft på 1 kundepåmindelse pr. dag); unit-tests inkl. DST og determinisme. Read-only skygge mod prod fandt, at **fakturarykkere aldrig har virket** (anon-klient i mail-router, P-003-familien). 2026-10-09 grok-next: trin 1 er tællinger i Pilot Health (`followup-shadow-test`). Trin 2–4 og kundemail er uændret. docs/followup/FOLLOWUP_ENGINE_DESIGN.md |
| 17 | Grossist/KlarPris discovery (datamodel, prisimport, lager, rabatter, sammenligning) | DONE (discovery) + sikkerhedsfund rettet | docs/integrations/GROSSIST_DISCOVERY.md. KlarPris-benchmark er med. Prod: LM 322k produkter (friske), AO 1,3k (7 mdr. gammel), 564 EAN hos begge, **0 prishistorik** (CHECK afviste FTP-kilder → 00165), 0 aftaler/lager. **P-005 (S3):** 50 pris-/leverandør-actions var ugatede, og `materials.ts` var service-role uden login. Gates er tilføjet i kode, og audit `security:actions` = 0 ugatede i domænet / 0 eksponerede uautentificerede. `supplier_settings` er låst på staging (00164). `harness:supplier-lockdown` 5/5, pilot-roles grøn. Resten af appen: 201 skrivende actions uden genkendt gate → egen RBAC-milepæl. |
| 18 | Profit Engine-datamodel (materiale + timer + overhead + DB → salgspris) | DONE (design + motor) | 4 divergerende prisalgoritmer er kortlagt. Den rene Profit Engine (`src/lib/profit/engine.ts`) adskiller indkøb (grossistrabat → nettokost) og salg (avance/mål-DB → kunderabat). DB beregnes altid på reel kost. Den har timer med risikobuffer, DB1/DB2 med overhead og advarsler; unit-tests er grønne. **Rettet:** send-gaten ignorerede tilbudsrabat (et tilbud med 30 % rabat kunne sendes med −14 % reel DB; latent, 0 tilbud med rabat) og `\|\|`-default i beregningsindstillinger. Datamodel-SQL er kun foreslået (ikke anvendt). docs/profit/PROFIT_ENGINE_DESIGN.md |
| 19 | Invoice Control pipeline (design) | DONE (design + motor) | Pipelinen er kortlagt. Prod: 53 leverandørfakturaer, kun 3 med linjer, 0 linjer koblet til produkt, så prisdækningen er **0 %**. Den rene kontrolmotor `controlInvoice` (tolerance, dækning, merbetaling; aldrig 'ok' uden data) har grønne tests. **Rettet (fejl på vejen mod e-conomic):** reparse kunne genåbne godkendte eller bogførte fakturaer (dobbelt-bogføring); en tabt godkendelses-race pushede alligevel; dubletkontrollen fandt altid fakturaen selv; og en materialepris-action var ugatet. `harness:invoice-pipeline` 4/4 (uden e-conomic). docs/invoice-control/INVOICE_CONTROL_DESIGN.md. **P3 komplet.** |

## P2-rest (før P3)
| # | Opgave | Status | Note |
|---|---|---|---|
| A | DB-trigger-hærdning (capability-guard) | DONE (prod 2026-09-29) | Migration 00163: `agent_capabilities` + `trg_agent_actions_capability_guard`, fail-closed på klasse/approval/agent/capability-ændring og executing uden approval. `harness:agent-gating` 13/13; testfixtures med opdigtede capabilities rettet. Prod pre-check grøn. Runbook: docs/runbooks/00163-agent-capability-guard.md |
| B | `mail.send_reply`-producer | DONE | Årsag: transportlaget blev bygget i Fase 3, og produceren blev bevidst udskudt. Den eneste prod-række var en intern test. Nu findes en sikker producer: "Forbered afsendelse" på et udført, udfyldt svarudkast opretter et forslag til afsenderen med "Re:". Den afviser skabelon-udkast og giver ét aktivt forslag pr. mail. Hård kill-switch `AGENT_LIVE_SEND_ENABLED` (default OFF) i Executor og handler; den vises i Pilot Health og i `safety:flags`. `harness:send-producer` 5/5 (ingen afsendelse mulig: kræver Graph ukonfigureret + flag off). |
| C | Browser/UI-verifikation (Agent Inbox/Pilot Health) | DONE | `npm run harness:ui-e2e` 5/5. Syntetiske staging-brugere (admin + montør) med password der kun lever i processen. `next dev` startes med staging-env, og eksterne integrationer tømmes. Headless Playwright klikker kun navigation, aldrig handlinger. **Fundet og rettet:** (1) `/dashboard/agents` kørte `getAgentInbox()` for ikke-admins (layout og side renderes parallelt) og loggede en serverfejl ved hvert besøg; (2) Pilot Health viste "Samlet: Ukendt" blot fordi crons ikke havde kørt endnu. Skærmbilleder gennemset. |

## Fakturapipeline-fejl (efter P3 #19)
| # | Opgave | Status | Note |
|---|---|---|---|
| F-a | API-import må ikke overskrive hoveddata med tomme værdier (IC5) | DONE | Eksisterende værdi vinder, og strukturerede hints bruges. `harness:invoice-pipeline` I5 |
| F-b | Linje→produkt-match | DONE | Varenummer bevares. Deterministisk varenr. → EAN → tekst-varenr. (samme leverandør). I6 |
| F-c | Reel dækningsgrad | DONE | `coverage.ts` + prod-script + Pilot Health. Prod: 0 % (ærligt). I7. 2026-10-09 grok-next: Pilot Health bruger kostprisen på fakturadatoen (`price_history`, samme grænse som fakturapanelet). Uden dato eller uden kendt gammel pris falder målingen ikke tilbage til dagens pris som en afvigelse. `price-at-date-test`. |
| F-d | RLS på incoming_invoices* | DONE (prod 2026-09-29) | `incoming_invoices` var allerede låst af 00160, men **linjer + audit-log var åbne i prod (P-007, S3)**. Migration 00166 giver dem samme model, og audit-loggen bliver append-only. `harness:invoice-rls` 5/5 med rigtige rolle-sessioner. Runbook: docs/runbooks/00166-incoming-invoices-rls.md |
| F-e | Faktura-PDF læses aldrig (IC11) | DONE (kode, flag OFF) | `INVOICE_ATTACHMENT_FETCH_ENABLED` (default OFF, i `safety:flags` + Pilot Health). Når flaget er TIL: Graph-hent af vedhæftninger før parsing, sikker fallback til brødtekst. `harness:invoice-pipeline` 10/10 (I8–I10). `backfillEmailAttachments` var ugatet (skrev via service, så auditten så den ikke). Nu gatet med `inbox.view`. **RBAC-auditten fanger nu også indirekte skrivning** (kendte skrivende services + storage upload/remove/move). Nyt fund i samme ombæring: `uploadEmployeeAttachment` var ugatet → `customers.view`. `uploadPortalAttachment` er token-undtaget. |
| F-f | Backfill + PDF-parse + klassifikation (IC11–IC14) | DONE (kode) · afventer Vercel-flag | Opgradering af SAMME brødtekst-faktura (ingen dubletter), backfill i faktura-cron'en (8/kørsel, idempotent, audit pr. mail), pdf-parse v2-fejl rettet (IC12), kundens egne mails frasorteres (IC13), ingen portal-arkivering (IC14). `harness:invoice-attachments` 7/7, `harness:invoice-pipeline` 10/10. Runbook: docs/runbooks/invoice-attachment-backfill.md |
| IC10 | Leverandørmatch på CVR (00167) | DONE (prod 2026-09-30) | Kolonne + trigger-normalisering (samme regel som parser) + CHECK + indeks, bevidst ingen UNIQUE (0 data; tvetydig = intet gæt). CVR-felt i leverandørformularen. `harness:supplier-vat` 8/8. Runbook: docs/runbooks/00167-00168-suppliers-vat-lockdown.md |

## Blokerede opgaver uden for nummerering
| Opgave | Status | Mangler |
|---|---|---|
| Prod-migration 00166 (fakturalinjer/audit RLS, P-007) | DONE | Kørt i prod 2026-09-29 (godkendt). `prod-verify-00166.ts post` grøn: montør 0/0, admin alle |
| Prod-migrationer 00164 (supplier_settings, P-005) + 00165 (prishistorik) | DONE | Kørt i prod 2026-09-29 (godkendt). Post-checks grønne |
| RBAC app-lag (P-006): skrivende server-actions uden rettighedstjek | DONE | Runde 1: 27 actions med ekstern effekt/globale indstillinger. Runde 2: 84 (modul-paritet). **Runde 3:** 46 gatet (opgaver, projekter/tid, mail-ops, besigtigelse, fuldmagt, dokumenter, tagtegning, advarsler, mailskabeloner, filer). **46 bevist undtaget** (`scripts/action-gate-exemptions.ts`): 28 server-only (auditten fejler, hvis de importeres i klientkode), 8 token-validerede kunde-actions (dynamisk bevist: `harness:exemption-proofs` 11/11, alle afviser 4 slags ugyldige tokens og kryds-kunde, positiv kontrol) og 10 egne data (bevist: bundet til den indloggede bruger). **`npm run check:rbac` er blokerende i CI:** en ny ugatet skrivende action, en falsk undtagelse eller en stale undtagelse fejler. Audit-negativtests 11/11. Resultat: 365 skrivende actions, 318 gatet, 47 bevist undtaget, 0 fejl (efter F-e). Fund: `files`-tabellen findes ikke i prod, så `files.ts`/`file-upload.tsx` er død kode. |
| Prod-migration 00163 (agent capability-guard) | DONE | Kørt i prod 2026-09-29 (godkendt). `prod:verify-00163` grøn |
| P1-gate: prod-migration 00162 (anon-eksponering, P-004) | DONE | Kørt i prod 2026-09-28 (godkendt). db-audit HØJ 21→0; prod:verify-00162 grøn; P-004 lukket. |
| P0-gate: prod-migration 00161 (R1–R4) | DONE | Kørt i prod 2026-09-27 (godkendt). prod:role-policies 0·0·0; prod:verify-00161 struktur + adfærd (admin/montør) grøn. |
| Beslutning: kundemail-crons (offer-/invoice-reminders) aktive under pilot? | BLOCKED | Henrik. Ingen sendt seneste 30 d, men kan sende uden varsel; invoice-reminders har ingen kill-switch (CRON_DISCOVERY F6/F7) |
| Beslutning: ret anon-crons (supplier-sync, learning-feedback, unanswered-mails, email-linker) | BLOCKED | Henrik — rettelse aktiverer adfærd i prod; supplier-sync = integration-gate (CRON_DISCOVERY F1–F4) |
| Aktivér `INVOICE_ATTACHMENT_FETCH_ENABLED` i prod (GODKENDT 2026-09-29) | BLOCKED (adgang) | Henrik sætter env i Vercel + redeploy (ingen Vercel-adgang her). Derefter kører backfill automatisk. Efter-måling: runbook invoice-attachment-backfill |
| IC13-oprydning: kundens egne mails i fakturakøen | DONE (prod 2026-09-30) | Read-only preview → 18 deterministiske rækker afvist samlet via data-migration 00169 (regel genverificeret i transaktionen, abort ved afvigelse; testet abort-sti på staging). Intet slettet; audit pr. række. 2 med intern afsender (eltasolar.dk) bevidst udeladt → manuel vurdering. Kø: 51 → 33 åbne |
| Prod-migrationer 00167 (CVR) + 00168 (suppliers skrivelås, P-008 S2) | DONE | Kørt i prod 2026-09-30 (godkendt). Alle pre/post-checks + persona-checks grønne; P-008 lukket |
| P-009 runde 1 (00170): customers, customer_contacts, offers, offer_line_items, portal_access_tokens, customer_documents, incoming_emails | DONE (prod 2026-10-01) | Matrix → genereret SQL; CI check:rls-matrix; harness:rls-lockdown 7/7 (172 checks, rigtige sessioner); regression grøn. Runbook: docs/runbooks/p009-rls-write-lockdown.md |
| P-009 runde 2A (00171): finance/arbejdsordrer, integrationer/webhooks, automation, skabeloner (15 tabeller) | DONE (prod 2026-10-01) | 339 persona-checks grønne. Trigger-fund: profit-snapshot skrev som brugeren → trigger-funktioner SECURITY DEFINER + revoke. App: egne timer håndhæves nu. db-audit LAV 101→86 |
| P-009 runde 2B (00172): leverandørprisdata (10 tabeller) | DONE (prod 2026-10-01) | Kode: API-drevne system-skrivninger → service-role i gatede actions; supplier_products kun admin. 210 persona-checks. Anon-grants bevaret på 4 cron-tabeller (P-003) — RLS blokerer stadig |
| P-009 runde 3A (00173): sager/projekter/leads/tilbudstilbehør/underskrifter/beskeder/partner-tokens (21 tabeller) | DONE (prod 2026-10-01) | 489 persona-checks. Trigger-fund: timer → projects.actual_hours som brugeren → SECURITY DEFINER. Underskrifter kan ikke længere forfalskes via REST |
| P-009 runde 3B (00174): mail/SMS-log, mail-synk-tilstand, AI-forbrug/-prompts, mail-intelligens (11 tabeller) | DONE (prod 2026-10-01) | 231 checks. Trigger-fund: tråd-statistik som brugeren → SECURITY DEFINER. AI-budgetloft og promptskabeloner kan ikke længere ændres via REST |
| P-009 runde 4 (00178): kalkulation/katalog/master data (44 tabeller) | DONE (staging) · prod-gate | Auto-specs fra metadata; FØR 44/44 huller, EFTER 44/44 som matrixen. Fund: betingede policies blev ikke droppet → rettet + strengere pre-check |
| P-009 anon-kontekst-korrektion | DONE | Anon-crons (P-003) læser tabeller som ellers ville skifte fra tom til fejl → keepAnonGrants + CI-check; 00170 rettet (customer_contacts, incoming_emails) |
| P-009 læse-side A1–A3 (00175–00177): portal-/partner-tokens, integrationshemmeligheder, bekræftelses-tokens, underskrifter, beskeder | DONE (staging) · prod-gate | harness:rls-read 7/7, bevist FØR/EFTER. Følsom-kolonne-scan (prod-sensitive-columns) → resten: company_settings-hemmeligheder (0 værdier) + e-conomic-tokens = A4 |
| P-009 læse-side A4 (00179): company_settings-hemmeligheder + e-conomic-tokens | DONE (staging) · prod-gate | Fund: getCompanySettings sendte SMTP-password/SMS-nøgler til browseren for settings.view. Nu eksplicitte offentlige kolonner; hemmeligheder kun via service-role i gatede stier. rls-read L8, bevist FØR/EFTER |
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Feature delivery (efter P-009)
| # | Opgave | Status | Note |
|---|---|---|---|
| F1 | Lønsomhedsanalyse på tilbud (Profit Engine i brug) | DONE | Fund (prod): 7/14 tilbudslinjer uden kostpris → eksisterende DB-visning regner timer som 0 kr (staging-eksempel: 90 % vist, realistisk 31,7 %). Ny ren analyse (offer-analysis.ts: kendt/estimeret/ukendt kost, realistisk DB, kostdækning, advarsler, dom) + action (offers.view.cost_prices; timekost efter firmaets kostbasis, aggregeret) + kort på tilbudssiden. test:profit (CI) 11/11, ui-e2e U7 |
| F2 | Grossist-prissammenligning på tilbud (KlarPris-foundation) | DONE | Prod: 564 EAN hos både AO og LM, 460 med >5 % forskel (gns. spænd 16,7 %). Ren sammenligning (EAN-13/GTIN-14-normalisering, tærskel, deterministisk) + action (offers.view.cost_prices) + kort "Billigere hos anden grossist" med besparelse pr. linje. test:profit (CI) + ui-e2e U8 |
| F2b | Indkøbsoversigt: største prisforskelle på tværs af kataloget | BLOCKED_APPROVAL | Kræver DB-view/RPC over 323k varer (migration). Forberedes til næste migrationsbatch |
| F3 | Fakturakontrol på leverandørfaktura | DONE | Kontrolmotor (controlInvoice) + samme matching som dækningsmålingen (gemt link → varenr. → EAN → varenr. i tekst) vist som panel på /dashboard/incoming-invoices/[id]: dom, dækning, overpris, match og forventet pris pr. linje. Kun læsning, gate incoming_invoices.view (linjer RLS 00166). ui-e2e U9 |
| F3b | IC8 hovedbeløb mod linjesum | DONE på grok-next | Samme panel viser om linjesummen stemmer med beløb ekskl. moms, og om momsen stemmer med inkl. moms. Manglende linjebeløb bliver ikke 0. Ingen godkendelse, ingen e-conomic. `header-totals-test`. e-conomic-fejlsvaret er uændret (BLOCKED_APPROVAL, bogføringsstien). |
| F3c | OIOUBL-linjer | DONE på grok-next | `parseOioubl` læser faktura og kreditnota (hoved + linjer). `parseAndMatch` bruger felterne i stedet for regex og gemmer linjer kun når der ingen er. Låst faktura genåbnes ikke. `oioubl-test`. Ingen e-conomic. |

## Fund registreret undervejs
- P-004 (S1) anon kunne læse 310k leverandørpriser via view + forfalske audit (→ 00162).
- Offers-RLS: UPDATE/DELETE `USING (true)` for alle indloggede (montør kan slette tilbud via REST). Ikke eksponeret for anon. → vurderes i #11/RBAC-milestone (kræver DDL-gate).
- P-001 getDecryptedCredentials var ugatet server action (rettet i kode) · P-002 v_recent_audit_logs omgik RLS (R4, i 00161) · P-003 supplier-sync-cron bruger anon-klient (→ #9).

## Log
- 2026-10-10: Ny scan af alle tabelrækker, der ikke er DONE, LATER eller BLOCKED_APPROVAL, plus design-trinene i opfølgning, fakturakontrol og Profit Engine. Ingen sikker grok-next-opgave. G11, G12 og P1 er drift hos Henrik. N56, N70, N72 og Q8 er analyse. N8-7 og HR #2 er BLOCKED_DECISION (rolle-gate og fire-øjne; HR #2 kræver også migration). X1c ændrer finansdata. N3, N5 og N12 har kun live e-conomic eller AO API/FTP tilbage. Opfølgning trin 2–4, fakturakontrol trin 4–6 og Profit Engine trin 3–5 er uændret blokeret. Prod-migrationer og Vercel-flag er Claudes spor eller Henrik.
- 2026-10-09: Verifikation efter `c8d1f00`. `aftercalc-test` (omsætning 18.000, DB 6.000, ens tekst er ikke matchet, manglende kost er ikke en besparelse), `offer-vs-actual-test` og `price-at-date-test` (1.001 senere ændringer → første gamle pris) er exit 0. Frisk scan: G11/G12 er drift hos Henrik. N3, N5 og N12 har kun live e-conomic eller AO API/FTP tilbage (BLOCKED_APPROVAL). Opfølgning trin 2–4, fakturakontrol trin 4–6, Profit Engine trin 3–5 og IC7 er uændret blokeret. IC10 er DONE i prod (00167). Ingen yderligere sikker NOW/NEXT-række.
- 2026-10-09: Fakturapanelet paginerer `price_history` (`fetchAllRows`, samme loft som dækningen). Ét `.in().gte()` tabte den tidligste tilbagerulning, når der var over 1.000 ændringer efter fakturadatoen, så forventet pris blev en senere gammel pris eller dagens pris. `price-at-date-test` kalder `loadInvoiceControl` med 1.001 senere ændringer og kræver den første gamle pris. Genlæsning af NOW/NEXT, design-trin og fund: ingen yderligere række, som kan bygges på grok-next uden prod-godkendelse, live afsendelse, migration eller Claudes spor. Profit Engine trin 3–5 og IC7 er BLOCKED_APPROVAL. IC10 var allerede DONE i prod (00167).
- 2026-10-09: Efter Profit Engine trin 2 er der ingen yderligere NOW/NEXT-række, som kan bygges på grok-next uden prod-godkendelse, live afsendelse, migration eller Claudes spor. Trin 3–5 og IC7 er BLOCKED_APPROVAL. IC10 var allerede DONE i prod (00167). Den sætning holdt ikke: fakturapanelets prishistorik var ikke pagineret. Rettet i linjen ovenfor.
- 2026-10-09: Profit Engine trin 2 DONE på grok-next. Tilbuddets linjefod viser reel DB efter tilbudsrabat ved siden af tallet før rabat (`offer-db-shadow-test`). Priser og send-gate er uændrede. IC7 (konverteret linje til 0 kr og fakturerbar) er BLOCKED_APPROVAL: Henrik skal godkende salgsprisen eller at linjen ikke faktureres før prisen er sat.
- 2026-10-09: N29 DONE på grok-next. Mine forfaldne og dagens opgaver på dashboardet og opgavesiden (`my-day-test`). Fakturakontrol trin 2 (varenummer/EAN → supplier_product_id, IC5, OIOUBL) var allerede i koden og er markeret DONE i designet.
- 2026-10-09: Efter F3c er der ingen NOW/NEXT-række, der kan bygges på grok-next uden prod-godkendelse, live afsendelse, migration eller Claudes spor. Opfølgning trin 2–4, fakturakontrol trin 4 og 6, og IC8-push forbliver BLOCKED_APPROVAL. N29 står som NÆSTEN DÆKKET (før fakturakontrol; opgavelisten har allerede filter og tæller).
- 2026-10-01: P-009 læse-side A4 (00179) på staging; pilot-roles-probe gjort uafhængig af skjulte kolonner.
- 2026-10-01: P-009 læse-side A1–A3 (00175–00177) + runde 4 (00178) på staging; prod afventer gate.
- 2026-10-01: P-009 runde 1–3B (00170–00174) kørt i prod (godkendt); alle pre/post/trigger/effektiv-adgang-checks grønne; åbne skrive-tabeller 108→44.
- 2026-09-30: P-009 runde 3B (00174) på staging: 11 tabeller; alle 5 runder (64 tabeller) grønne samlet; db-audit LAV 44.
- 2026-09-30: P-009 runde 3A (00173) på staging: 21 tabeller, 489 checks; trigger-fund (projekttimer) rettet; db-audit LAV 55. Anon-kontekst-regel (P-003) indført.
- 2026-09-30: P-009 runde 2B (00172) på staging: 10 leverandørpris-tabeller låst (supplier_products kun admin); 210 checks; db-audit LAV 76.
- 2026-09-30: P-009 runde 2A (00171) på staging: 15 tabeller, 339 checks; nyt transitivt trigger-audit (prod-trigger-writes) fangede 2 brud → rettet.
- 2026-09-30: P-009 runde 1 (00170) på staging: 7 tabeller låst til appens roller, 172 persona-checks grønne; prod afventer gate.
- 2026-09-30: RBAC-audit tæller nu også mail/SMS/e-conomic-effekter og hjælpere i action-filer → 24 ugatede actions gatet (AI-mailassistent, besigtigelses-/kundemails, test-mail uden login [S3: åben relay med fast indhold], indstillinger, sager, sync); 9 token-/public-undtagelser dynamisk bevist (exemption-proofs 20/20, action-auth 6/6). check:rbac: 442 skrivende, 386 gatet, 56 undtaget, 0 fejl.
- 2026-09-30: RBAC-audit udvidet med transitiv service-skrive-analyse (AST, scripts/rls-write-sites.ts) → 15 nye ugatede skrivende actions fundet og gatet, heriblandt P-010 (S2, uautentificeret sletning af kundedokumenter) og P-011 (S2, bankmatch uden rettighed). `harness:action-auth` 5/5. check:rbac: 399 skrivende, 352 gatet, 47 undtaget, 0 fejl.
- 2026-09-30: 00169 (IC13) kørt i prod: 18 kundemails afvist som ikke-faktura, 2 interne til manuel vurdering. IC13-reglen i koden udelader nu også interne afsendere.
- 2026-09-30: 00167 + 00168 kørt i prod (godkendt), alle checks grønne; P-008 lukket. Vercel-flag INVOICE_ATTACHMENT_FETCH_ENABLED: godkendt, men ikke sat (ingen Vercel-adgang) — backfill afventer.
- 2026-09-29: npm audit fix (ikke-breaking): 27 sårbarheder (3 kritiske: basic-ftp path traversal i LM-FTP, next, fast-xml-parser) → 1 high (nodemailer, kræver major-opgradering, åben). Harness-fund: harness:smoke blokeres fail-closed af env-guard (sammenligner staging med sig selv efter app-env-genbinding) — åben, lav.
- 2026-09-29: IC10/00167 (CVR) + 00168 (P-008) på staging, 8/8. Nyt read-only audit `prod-write-policies` → P-009: 109 tabeller åbne for skrivning (S2 systemisk).
- 2026-09-29: F-f: faktura-backfill-design (opgradering, idempotent, ingen portal-arkivering), IC12 pdf-parse v2-fejl, IC13 kundens egne mails. Prod-baseline taget (read-only).
- 2026-09-29: F-e (IC11) faktura-vedhæftninger: flag-gatet hentning (OFF), backfill-action gatet, RBAC-audit udvidet til indirekte skrivning (365 actions, 0 fejl).
- 2026-09-29: død kode fjernet: src/lib/actions/files.ts + src/components/shared/file-upload.tsx (tabellen files findes ikke i prod; komponenten blev ikke importeret).
- 2026-09-29: prod-migrationer 00163→00164→00165→00166 kørt (godkendt), alle pre/post-checks grønne; P-005 + P-007 lukket.
- 2026-09-29: fakturapipeline F-d: 00166 (linjer + audit RLS) på staging; P-007 registreret.
- 2026-09-29: fakturapipeline F-a/F-b/F-c (hoveddata bevares, linje→produkt, reel dækning).
- 2026-09-29: RBAC runde 3 færdig — 0 ugatede skrivende actions; streng audit blokerende i CI.
- 2026-09-28: RBAC runde 2 (modul-paritet): 84 actions i kalkulations-/stamdata-/pakkedomænet gatet; 176 → 92.
- 2026-09-28: RBAC app-lag runde 1 (P-006): 27 actions med ekstern effekt/globale indstillinger gatet.
- 2026-09-28: P3 #19 fakturakontrol (motor + design) + 3 e-conomic-vejfejl rettet. **P3 komplet.**
- 2026-09-28: P3 #18 Profit Engine (ren motor + design) + 2 prisfejl rettet.
- 2026-09-28: P3 #17 grossist-discovery + P-005 (S3) rettet i kode; 00164/00165 på staging.
- 2026-09-28: P3 #16 opfølgningsmotor designet + bygget (ren); fakturarykker-fund dokumenteret.
- 2026-09-28: P3 #15 Relatel discovery + CTI-foundation (ingen netværk, ingen SMS).
- 2026-09-28: P2-rest C: reproducerbar UI-E2E (staging, syntetiske brugere) + 2 UI-fejl rettet. P2-rest A–C færdig.
- 2026-09-28: P2-rest B: send_reply-producer + live-send kill-switch (intet sendt).
- 2026-09-28: P2-rest A: 00163 capability-guard på staging (prod-gate).
- 2026-09-28: P2 #14 Inbox reviewer-UX færdig. **P2 komplet.**
- 2026-09-28: P2 #13 næste milepæl (Fase 6 planlægningsagent) forberedt og testet, disabled.
- 2026-09-28: P2 #12 stale/idempotens/samtidighed for alle agent-actions (1 fejl rettet).
- 2026-09-28: P2 #11 capability-audit færdig (Executor hærdet).
- 2026-09-28: 00162 kørt i prod og verificeret; P-004 CLOSED. P2 startet.
- 2026-09-27: P1 #10 Pilot Health færdig. **P1 komplet** (#9/#10 med 2 Henrik-beslutninger BLOCKED).
- 2026-09-27: P1 #9 cron-synlighed + discovery færdig (intet aktiveret; 2 beslutninger til Henrik).
- 2026-09-27: P1 #8 UI-tilstande færdige (permission-guards, stale-beslutninger, global-error).
- 2026-09-27: P1 #7 race-tests færdige; 2 race-fejl rettet i kode (tilbuds-/kundenummer, dobbelt tilbudsforslag).
- 2026-09-27: P1 #5 db-audit færdig; P-004 fundet, 00162 forberedt (gate).
- 2026-09-27: 00161 kørt i prod (godkendt) og verificeret; P0 lukket.
- 2026-09-27: P0 #1–#4 færdige på staging; 00161 forberedt (gate).
- 2026-09-27: backlog oprettet (Henrik). Forudgående: 00159 + 00160 kørt i prod, Pilot Ops PROD READY.
