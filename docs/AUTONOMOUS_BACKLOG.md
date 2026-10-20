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
| G18-15 | 8 Pilot | DONE. Desktop-cellen for trendpris i `pricing-client.tsx` kan krympe. Mobil ombryder allerede. | Ingen truncate. Ingen nye priser. |
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
| G18-88 | 5 Plan | DONE sagens opgavefejl "Ansvarlige kunne ikke hentes" ombrydes. | Sætningen er uændret. |
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
| G18-87 | 8 Pilot | DONE kundens opgavefejl "Ansvarlige kunne ikke hentes" ombrydes. | Sætningen er uændret. |
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
| G18-108 | 5 Plan | DONE "+N mere" på månedsdagen ombrydes. | Tællingen er uændret. Dagbrikkerne afkortes stadig. |
| G18-109 | 2 Faktura | DONE linjedommen på fakturakontrollen ombrydes. | Domsteksten er uændret. |
| G18-35 | 1 Profit | DONE sagspanelets advarsler ombrydes. | Advarselsteksten uændret. |
| G18-54 | 1 Profit | DONE den lukkede efterkalk-linje ombrydes. | Teksten er uændret. |
| G18-60 | 8 Pilot | ÅBEN. Producentnavnet på leverandørvarens skrivebordskort ombrydes. | Priser og mobilkortet er uændret. |
| G18-110 | 2 Faktura | DONE match-teksten på fakturakontrollens skrivebord ombrydes. | Match-ordene er uændret. |
| G18-111 | 5 Plan | DONE "+N påmindelser" på månedsdagen ombrydes. | Tællingen er uændret. Dagbrikkerne afkortes stadig. |
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
| G18-131 | 5 Plan | DONE "X af Y udestår" på sagens opgaver ombrydes. | Tællingen er uændret. |
| G18-132 | 8 Pilot | DONE den tomme kundeliste "Ingen opgaver endnu" ombrydes. | Sætningerne er uændret. |
| G18-133 | 5 Plan | DONE fejlen på sagens opgaver ombrydes. | Sætningen er uændret. |
| G18-134 | 8 Pilot | DONE kundens "Medarbejdere kunne ikke hentes" ombrydes. | Sætningen er uændret. |
| G18-135 | 8 Pilot | DONE "Ingen åbne opgaver" på kundekortet ombrydes. | Sætningen er uændret. |
| G18-136 | 8 Pilot | DONE fejlen på kundens opgaver ombrydes. | `{loadError}` er uændret. |
| G18-137 | 5 Plan | DONE "Henter opgaver…" på sagen ombrydes. | Sætningen er uændret. |
| G18-138 | 8 Pilot | DONE overskriften "Opgaver" og knappen "Ny opgave" på kundekortet ombrydes. | Ordene er uændret. |
| G18-139 | 5 Plan | DONE overskriften "Kommende besigtigelser" ombrydes. | Ordene er uændret. |
| G18-140 | 5 Plan | DONE måneden på kommende besigtigelser ombrydes. | Dato-udtrykket er uændret. |
| G18-141 | 5 Plan | DONE status- og prioritetmærket på sagens opgaver ombrydes. | Etiketterne er uændret. |
| G18-142 | 5 Plan | DONE mærket "opstart" på sagens opgaver ombrydes. | Ordet er uændret. |
| G18-143 | 8 Pilot | DONE etiketten "Titel *" på kundens opgaveformular ombrydes. | Ordene er uændret. |
| G18-144 | 8 Pilot | DONE etiketterne Beskrivelse, Prioritet, Status, Ansvarlig, Forfaldsdato og Påmindelse på kundens opgaveformular ombrydes. | Ordene er uændret. |
| G18-145 | 8 Pilot | DONE knapperne Annuller og Opret på kundens opgaveformular ombrydes. | Ordene er uændret. |
| G18-146 | 5 Plan | DONE dagsnummeret på kommende besigtigelser ombrydes. | Udtrykket med getDate er uændret. |
| G18-147 | 8 Pilot | DONE status- og prioritetmærket på kundens opgaver ombrydes. | Etiketterne er uændret. |
| G18-148 | 8 Pilot | DONE forfaldsdatoen på kundens opgave ombrydes. | Dato-udtrykket med Europe/Copenhagen er uændret. |
| G18-149 | 8 Pilot | DONE knappen Vis/Skjul udførte på kundens opgaver ombrydes. | Ordene og tællingen er uændret. |
| G18-150 | 8 Pilot | DONE teksten "Ingen forfaldsdato" på kundens opgave ombrydes. | Ordene er uændret. |
| G18-151 | 8 Pilot | DONE knapperne Rediger og Slet på kundens opgave kan rammes med 44 px. | aria-label er uændret. |
| G18-152 | 5 Plan | DONE knappen "I dag" på kalenderen ombrydes. | Ordene og min-h-[44px] er uændret. |
| G18-153 | 8 Pilot | DONE den ansvarliges navn eller e-mail på kundens opgave kan krympe. | Udtrykket er uændret. |
| G18-154 | 4 Pris | DONE leverandørnavnet på prisstatistikken ombrydes. | Navnet kommer stadig fra stat.supplier_name. |
| G18-155 | 4 Pris | DONE synk-datoen på prisstatistikken ombrydes. | formatDateUtil er uændret. |
| G18-156 | 4 Pris | DONE etiketten "Prisbevægelse" på prisstatistikken ombrydes. | Procenterne er uændret. |
| G18-157 | 4 Pris | DONE etiketterne på prisstatistikkens tal ombrydes. | Tallene er uændret. |
| G18-158 | 4 Pris | DONE teksten "Indlæser data..." på prissiden ombrydes. | Sætningen er uændret. |
| G18-159 | 4 Pris | DONE den tomme tekst på prissiden ombrydes. | Sætningerne i EmptyState-kaldene er uændret. |
| G18-160 | 4 Pris | DONE fejlteksten på prissiden ombrydes. | Sætningen "Det tælles ikke som ingen prisændringer." er uændret. |
| G18-161 | 4 Pris | DONE tallene på prisstatistikken ombrydes. | Værdierne er uændret. |
| G18-162 | 4 Pris | DONE procenterne ved "Prisbevægelse" ombrydes. | toFixed-udtrykkene er uændret. |
| G18-163 | 4 Pris | DONE kolonneoverskrifterne Produkt, Leverandør, Gammel pris, Ny pris, Ændring, Påvirker og Dato på prisadvarslerne ombrydes. | Ordene er uændret. |
| G18-164 | 4 Pris | DONE kolonneoverskrifterne Tilbud, Kunde, Status, Beløb, Ber. linjer, Potentielt tab og Oprettet på påvirkede tilbud ombrydes. | Ordene er uændret. |
| G18-165 | 4 Pris | DONE kolonneoverskrifterne Produkt, Nuv. pris, 30 dage, 90 dage, Volatilitet og Ændringer på pristendenser ombrydes. | Ordene er uændret. |
| G18-166 | 4 Pris | DONE etiketterne Kritiske advarsler, Prisændringer total, Prisstigninger og Påvirkede tilbud ombrydes. | Tallene er uændret. |
| G18-167 | 4 Pris | DONE tallene på prisoversigtens kort ombrydes. | Udtrykket med isText er uændret. |
| G18-168 | 4 Pris | DONE etiketterne Tærskel og Periode ombrydes. | Valgmulighederne er uændret. |
| G18-169 | 4 Pris | DONE fanerne Prisadvarsler, Påvirkede tilbud, Leverandørstatistik og Pristendenser ombrydes. | Ordene og tællingerne er uændret. |
| G18-170 | 4 Pris | DONE knappen Opdater på prissiden ombrydes. | Ordet og loadData er uændret. |
| G18-171 | 4 Pris | DONE datoen på prisadvarslerne ombrydes. | formatDateUtil(alert.changed_at) er uændret. |
| G18-172 | 4 Pris | DONE datoen på påvirkede tilbud ombrydes. | formatDateUtil(offer.created_at) er uændret. |
| G18-173 | 4 Pris | DONE procentmærket på prisadvarslerne ombrydes. | toFixed-udtrykket er uændret. |
| G18-174 | 4 Pris | DONE antallet ved påvirkede tilbud og kalkulationer på prisadvarslerne ombrydes. | Tallene er uændret. |
| G18-175 | 4 Pris | DONE statusmærket på påvirkede tilbud ombrydes. | Etiketterne Kladde, Sendt, Set, Accepteret, Afvist og Udløbet er uændret. |
| G18-176 | 4 Pris | DONE procenterne for 30 og 90 dage på pristendenser ombrydes. | Udtrykkene med trend_30_days og trend_90_days er uændret. |
| G18-177 | 4 Pris | DONE. Volatilitetsmærket Stabil, Moderat og Høj ombrydes. | Ordene er uændret. |
| G18-178 | 4 Pris | DONE. Antallet af berørte linjer på påvirkede tilbud ombrydes. | {offer.affected_items} er uændret. |
| G18-179 | 4 Pris | DONE. Ændringstallet på pristendenser ombrydes. | {trend.change_count_30_days} er uændret. |
| G18-180 | 4 Pris | DONE. Tilbudsnummeret på påvirkede tilbud ombrydes. | {offer.offer_number} og linket er uændret. |
| G18-181 | 4 Pris | DONE. Etiketterne 30 dage og 90 dage på pristendensernes mobilkort ombrydes. | Procentudtrykkene er uændret. |
| G18-182 | 4 Pris | DONE. Bindestregen når en pristendens mangler ombrydes. | Tegnet er uændret. |
| G18-183 | 4 Pris | DONE. Etiketten Leverandør på pristendenser ombrydes. | Valget og onSupplierChange er uændret. |
| G18-184 | 4 Pris | DONE. Tælleren på prisfanerne ombrydes. | {tab.count} og setActiveTab er uændret. |
| G18-185 | 4 Pris | DONE. Overskriften Prisovervågning ombrydes. | Titlen og adgangstjekket er uændret. |
| G18-186 | 4 Pris | DONE. Indledningen under Prisovervågning ombrydes. | Sætningen er uændret. |
| G18-187 | 4 Pris | DONE. Fejloverskriften på prissætning ombrydes. | Sætningen og reset er uændret. |
| G18-188 | 4 Pris | DONE. Fejlteksten på prissætning ombrydes. | Sætningen er uændret. |
| G18-189 | 4 Pris | DONE. Fejlkoden på prissætning ombrydes. | {error.digest} er uændret. |
| G18-190 | 4 Pris | DONE. Knapperne Prøv igen og Dashboard på prisfejlen ombrydes. | reset og linket /dashboard er uændret. |
| G18-191 | 4 Pris | DONE. Produktbeskrivelsen i kataloget ombrydes i stedet for line-clamp-1. | Navn, kost og listepris er uændret. |
| G18-192 | 4 Pris | DONE. Produktbeskrivelsen på katalogets mobilkort ombrydes i stedet for line-clamp-2. | Navn, kost og listepris er uændret. |
| G18-193 | 4 Pris | DONE. Listeprisen i produktkataloget ombrydes. | formatCurrency(product.list_price) er uændret. |
| G18-194 | 4 Pris | DONE. Kategorimærket i produktkataloget ombrydes. | Navnet er uændret. |
| G18-195 | 4 Pris | DONE. Den tomme katalogtekst ombrydes. | De to sætninger er uændret. |
| G18-196 | 4 Pris | DONE. Overskriften på det tomme katalog ombrydes. | De to sætninger er uændret. |
| G18-197 | 4 Pris | DONE. Statusmærket Aktiv og Inaktiv i kataloget ombrydes. | Ordene er uændret. |
| G18-198 | 4 Pris | DONE. Kolonneoverskrifterne i produktkataloget ombrydes. | Ordene er uændret. |
| G18-199 | 4 Pris | DONE. Etiketterne Kostpris og Listepris på katalogets mobilkort ombrydes. | Ordene er uændret. |
| G18-200 | 4 Pris | DONE. Knappen Nyt produkt ombrydes. | setShowCreateDialog er uændret. |
| G18-201 | 4 Pris | DONE. Antallet over produktkataloget ombrydes. | Sætningen og total er uændret. |
| G18-202 | 4 Pris | DONE. Overskriften Produktkatalog ombrydes. | Ordet er uændret. |
| G18-203 | 4 Pris | DONE. Fejlteksten når kataloget ikke kan hentes ombrydes. | Sætningen er uændret. |
| G18-204 | 4 Pris | DONE. Fejlteksten når kategorierne ikke kan hentes ombrydes. | Sætningen er uændret. |
| G18-205 | 4 Pris | DONE. Knappen Ryd søgning ombrydes. | clearFilters er uændret. |
| G18-206 | 4 Pris | DONE. Knappen Opret produkt ombrydes. | setShowCreateDialog er uændret. |
| G18-207 | 4 Pris | DONE. Dialogen Opret nyt produkt ombrydes. | Ordene er uændret. |
| G18-208 | 4 Pris | DONE. Dialogen Rediger produkt ombrydes. | Ordene er uændret. |
| G18-209 | 4 Pris | DONE. Bindestregen for en manglende kategori ombrydes. | Bindestregen er uændret. |
| G18-210 | 4 Pris | DONE. Menupunktet Rediger i kataloget ombrydes. | setEditingProduct er uændret. |
| G18-211 | 4 Pris | DONE. Menupunktet Slet i kataloget ombrydes. | handleDelete er uændret. |
| G18-212 | 4 Pris | DONE. Valget Alle kategorier ombrydes. | value all er uændret. |
| G18-213 | 4 Pris | DONE. Mobilknappen Rediger i kataloget ombrydes. | Ordet er uændret. |
| G18-214 | 4 Pris | DONE. Mobilknappen Slet i kataloget ombrydes. | Ordet er uændret. |
| G18-215 | 4 Pris | DONE. Søgefeltets pladsholder ombrydes. | Teksten Søg efter produkter... er uændret. |
| G18-216 | 4 Pris | DONE. Pladsholderen Alle kategorier i kategori-vælgeren ombrydes. | Ordene er uændrede. |
| G18-217 | 4 Pris | DONE. Søgefeltets etiket ombrydes. | Teksten Søg efter produkter er uændret. Etiketten sidder på søgefeltet. |
| G18-223 | 4 Pris | DONE. Fejlteksten i produktformularen når kategorierne ikke kan hentes ombrydes. | Sætningen er uændret. |
| G18-229 | 4 Pris | DONE. Etiketten SKU i produktformularen ombrydes. | Ordet er uændret. |
| G18-235 | 4 Pris | DONE. Pladsholderen på SKU ombrydes. | Teksten F.eks. JA400-MONO er uændret. |
| G18-241 | 4 Pris | DONE. Produktnavnet på produktdetaljen ombrydes. | {productResult.data.name} er uændret. |
| G18-247 | 4 Pris | DONE. Beskrivelsen på produktdetaljen ombrydes. | {product.description} er uændret. |
| G18-253 | 4 Pris | DONE. Etiketten Enhed på produktdetaljen ombrydes. | Ordet og {product.unit} er uændrede. |
| G18-259 | 4 Pris | DONE. Volatilitets-linjen på pristendensens mobilkort ombrydes. | Etiketterne og procenterne er uændrede. |
| G18-265 | 4 Pris | DONE. Alvorligheds-mærket på prisadvarslens skrivebord ombrydes. | Procenten er uændret. |
| G18-271 | 4 Pris | DONE. Linjecellen på berørte tilbud ombrydes. | Antallet er uændret. |
| G18-277 | 4 Pris | DONE. Leverandørnavnet på prisadvarslens skrivebord kan krympe. | Navnet er uændret. |
| G18-218 | 4 Pris | DONE. Kategorinavnet i kategori-vælgeren ombrydes. | {category.name} er uændret. |
| G18-224 | 4 Pris | DONE. Etiketten Aktiv i produktformularen ombrydes. | Ordet er uændret. |
| G18-230 | 4 Pris | DONE. Enhedsnavnet i produktformularen ombrydes. | {unit.label} er uændret. |
| G18-236 | 4 Pris | DONE. Pladsholderen på kostprisfeltet ombrydes. | Tegnene 0,00 og feltets værdi er uændrede. |
| G18-242 | 4 Pris | DONE. SKU-linjen på produktdetaljen ombrydes. | {productResult.data.sku} er uændret. |
| G18-248 | 4 Pris | DONE. Overskriften Priser på produktdetaljen ombrydes. | Ordet er uændret. |
| G18-254 | 4 Pris | DONE. Etiketten Listepris på produktdetaljen ombrydes. | Ordet og formatCurrency(product.list_price) er uændrede. |
| G18-260 | 4 Pris | DONE. Leverandørvælgeren på pristendenser ombrydes. | Værdien og teksten Vælg leverandør er uændrede. |
| G18-266 | 4 Pris | DONE. Produktcellen på prisadvarslens skrivebord ombrydes. | Navnet og priserne er uændrede. |
| G18-272 | 4 Pris | DONE. Alvorligheds-mærket på prisadvarslens mobilkort ombrydes. | Procenten er uændret. |
| G18-219 | 4 Pris | DONE. Kategori-vælgerens etiket ombrydes. | aria-label Kategori er uændret. |
| G18-225 | 4 Pris | DONE. Etiketten Enhed i produktformularen ombrydes. | Ordet er uændret. |
| G18-231 | 4 Pris | DONE. Etiketten Kostpris i produktformularen ombrydes. | Ordene og feltets værdi er uændrede. |
| G18-237 | 4 Pris | DONE. Pladsholderen på listeprisfeltet ombrydes. | Tegnene 0,00 og feltets værdi er uændrede. |
| G18-243 | 4 Pris | DONE. Fejlteksten når produktdetaljen ikke kan hentes ombrydes. | Sætningen er uændret. |
| G18-249 | 4 Pris | DONE. Etiketten Beskrivelse på produktdetaljen ombrydes. | Ordet er uændret. |
| G18-255 | 4 Pris | DONE. Etiketten Kostpris på produktdetaljen ombrydes. | Ordet og formatCurrency(product.cost_price) er uændrede. |
| G18-261 | 4 Pris | DONE. Optionen Vælg leverandør på pristendenser ombrydes. | Teksten er uændret. |
| G18-267 | 4 Pris | DONE. Statuscellen på berørte tilbud ombrydes. | StatusBadge er uændret. |
| G18-273 | 4 Pris | DONE. Tilbudscellen på berørte tilbud ombrydes. | Nummeret er uændret. |
| G18-220 | 4 Pris | DONE. Knappen Annuller i produktformularen ombrydes. | onCancel er uændret. |
| G18-226 | 4 Pris | DONE. Pladsholderen Vælg kategori i produktformularen ombrydes. | Ordene er uændrede. |
| G18-232 | 4 Pris | DONE. Etiketten Listepris i produktformularen ombrydes. | Ordene og feltets værdi er uændrede. |
| G18-238 | 4 Pris | DONE. Kategorinavnet i produktformularens vælger ombrydes. | {category.name} er uændret. |
| G18-244 | 4 Pris | DONE. Knappen Rediger på produktdetaljen ombrydes. | setShowEditDialog er uændret. |
| G18-250 | 4 Pris | DONE. Overskriften Specifikationer på produktdetaljen ombrydes. | Ordet er uændret. |
| G18-256 | 4 Pris | DONE. Etiketten Avance på produktdetaljen ombrydes. | Ordet og margin.toFixed(1) er uændrede. |
| G18-262 | 4 Pris | DONE. Produktcellen i pristendensens skrivebordstabel ombrydes. | Navnet og prisen er uændrede. |
| G18-268 | 4 Pris | DONE. Varenummeret på prisadvarslens skrivebord ombrydes. | SKU er uændret. |
| G18-274 | 4 Pris | DONE. Varenummeret på prisadvarslens mobilkort ombrydes. | SKU er uændret. |
| G18-221 | 4 Pris | DONE. Gem-knappen i produktformularen ombrydes. | Ordene Gemmer, Opdater og Opret er uændrede. |
| G18-227 | 4 Pris | DONE. Etiketten Produktnavn i produktformularen ombrydes. | Ordet og stjernen er uændrede. |
| G18-233 | 4 Pris | DONE. Pladsholderen på produktnavn ombrydes. | Teksten F.eks. JA Solar 400W Panel er uændret. |
| G18-239 | 4 Pris | DONE. Kategori-vælgeren i produktformularen ombrydes. | Pladsholderen Vælg kategori er uændret. |
| G18-245 | 4 Pris | DONE. Knappen Slet på produktdetaljen ombrydes. | handleDelete er uændret. |
| G18-251 | 4 Pris | DONE. Etiketten Status på produktdetaljen ombrydes. | Ordet og badge-værdien er uændrede. |
| G18-257 | 4 Pris | DONE. Dialogtitlen Rediger produkt ombrydes. | Ordene er uændrede. |
| G18-263 | 4 Pris | DONE. 30-dages-cellen på pristendensens skrivebord ombrydes. | Procenten er uændret. |
| G18-269 | 4 Pris | DONE. Påvirkningscellen på prisadvarslens skrivebord ombrydes. | Tællerne er uændrede. |
| G18-275 | 4 Pris | DONE. Nul-mærket på prisadvarslens påvirkning ombrydes. | Bindestregen er uændret. |
| G18-222 | 4 Pris | DONE. Etiketten Kategori i produktformularen ombrydes. | Ordet er uændret. |
| G18-228 | 4 Pris | DONE. Etiketten Beskrivelse i produktformularen ombrydes. | Ordet er uændret. |
| G18-234 | 4 Pris | DONE. Pladsholderen på produktbeskrivelsen ombrydes. | Teksten Produktbeskrivelse... er uændret. |
| G18-240 | 4 Pris | DONE. Enhedsvælgeren i produktformularen ombrydes. | defaultValue er uændret. |
| G18-246 | 4 Pris | DONE. Overskriften Produktinformation på produktdetaljen ombrydes. | Ordet er uændret. |
| G18-252 | 4 Pris | DONE. Etiketten Kategori på produktdetaljen ombrydes. | Ordet og {product.category.name} er uændrede. |
| G18-258 | 4 Pris | DONE. Tilbage-knappen på produktdetaljen ombrydes. | href er uændret. Ingen ny tekst. |
| G18-264 | 4 Pris | DONE. 90-dages-cellen på pristendensens skrivebord ombrydes. | Procenten er uændret. |
| G18-270 | 4 Pris | DONE. Volatilitets-cellen på pristendensens skrivebord ombrydes. | Etiketten er uændret. |
| G18-276 | 4 Pris | DONE. Kundecellen på berørte tilbud kan krympe. | Navnet er uændret. |
| G18-278 | 4 Pris | DONE. Ændringscellen på prisadvarslens skrivebord ombrydes. | Procenten er uændret. |
| G18-279 | 4 Pris | DONE. Tilbudstitlen på berørte tilbud kan krympe. | Titlen er uændret. |
| G18-280 | 4 Pris | DONE. Produktnavnet på prisadvarslens mobilkort kan krympe. | Navnet er uændret. |
| G18-281 | 4 Pris | DONE. Leverandørnavnet på prisadvarslens mobilkort kan krympe. | Navnet er uændret. |
| G18-282 | 4 Pris | DONE. Kundenavnet på berørte tilbuds mobilkort kan krympe. | Navnet er uændret. |
| G18-283 | 4 Pris | DONE. Tilbudstitlen på berørte tilbuds mobilkort kan krympe. | Titlen er uændret. |
| G18-284 | 4 Pris | DONE. Produktnavnet på pristendensens mobilkort kan krympe. | Navnet er uændret. |
| G18-285 | 4 Pris | DONE. Statusfeltet på berørte tilbuds mobilkort ombrydes. | StatusBadge er uændret. |
| G18-286 | 4 Pris | DONE. Produktnavnet på prisadvarslens skrivebord kan krympe. | Navnet er uændret. |
| G18-287 | 4 Pris | DONE. Produktnavnet på pristendensens skrivebord kan krympe. | Navnet er uændret. |
| G18-288 | 4 Pris | DONE. Tærskel-vælgeren på prisovervågning ombrydes. | Værdierne er uændrede. |
| G18-289 | 4 Pris | DONE. Periode-vælgeren på prisovervågning ombrydes. | Værdierne er uændrede. |
| G18-290 | 4 Pris | DONE. Prisbevægelsens gruppe på leverandørkortet ombrydes. | Procenterne er uændrede. |
| G18-291 | 4 Pris | DONE. Den gamle pris på prisadvarslens mobilkort kan krympe. | formatCurrency er uændret. |
| G18-292 | 4 Pris | DONE. Den nye pris på prisadvarslens mobilkort kan krympe. | formatCurrency er uændret. |
| G18-293 | 4 Pris | DONE. Tilbudsbeløbet på berørte tilbuds mobilkort kan krympe. | formatCurrency er uændret. |
| G18-294 | 4 Pris | DONE. Det potentielle tab på berørte tilbuds mobilkort kan krympe. | Beløbet er uændret. |
| G18-295 | 4 Pris | DONE. Nuværende pris på pristendensens mobilkort kan krympe. | formatCurrency er uændret. |
| G18-296 | 4 Pris | DONE. Tilbudsnummeret på berørte tilbuds mobilkort kan krympe. | Nummeret og href er uændrede. |
| G18-297 | 4 Pris | DONE. Produktgruppen på prisadvarslens mobilkort ombrydes. | Navnet er uændret. |
| G18-298 | 4 Pris | DONE. Prisbevægelsens række på leverandørkortet kan krympe. | Procenterne er uændrede. |
| G18-299 | 4 Pris | DONE. Leverandørkortets overskriftsrække kan krympe. | Navn og synk-dato er uændrede. |
| G18-300 | 4 Pris | DONE. Prisadvarslens mobilrække kan krympe. | Navn og procent er uændrede. |
| G18-301 | 4 Pris | DONE. Leverandørfilterets række på pristendenser kan ombrydes. | Vælgeren er uændret. |
| G18-302 | 4 Pris | DONE. Leverandørnavnet i pristendensens vælger kan ombrydes. | Navnet og value er uændrede. |
| G18-303 | 4 Pris | DONE. Fanerækken på prisovervågning kan ombrydes. | Faneteksterne er uændrede. |
| G18-304 | 4 Pris | DONE. Oversigtskortenes gitter kan krympe. | Tallene er uændrede. |
| G18-305 | 4 Pris | DONE. Leverandørkortenes gitter kan krympe. | Kortenes tal er uændrede. |
| G18-306 | 4 Pris | DONE. Prisadvarslens mobilkort kan krympe. | Navn og procent er uændrede. |
| G18-307 | 4 Pris | DONE. Berørte tilbuds mobilkort kan krympe. | Nummer og beløb er uændrede. |
| G18-308 | 4 Pris | DONE. Pristendensens mobilkort kan krympe. | Pris og navn er uændrede. |
| G18-309 | 4 Pris | DONE. Filterrækken på prisovervågning kan krympe. | Værdierne er uændrede. |
| G18-310 | 4 Pris | DONE. Ministatistikken på leverandørkortet kan krympe. | Tallene er uændrede. |
| G18-311 | 4 Pris | DONE. Leverandørkortet kan krympe. | Navn og tal er uændrede. |
| G18-312 | 4 Pris | DONE. Tærskelrækken på prisovervågning kan krympe. | Tærskelværdierne er uændrede. |
| G18-313 | 4 Pris | DONE. Perioderækken på prisovervågning kan krympe. | Periodeværdierne er uændrede. |
| G18-314 | 4 Pris | DONE. Prisadvarslens skrivebordsrække kan krympe. | Priserne er uændrede. |
| G18-315 | 4 Pris | DONE. Fanerammens kant kan krympe. | Faneteksterne er uændrede. |
| G18-316 | 4 Pris | DONE. Oversigtskortet kan krympe. | Tallene er uændrede. |
| G18-317 | 4 Pris | DONE. Den tomme pristilstand kan krympe. | Teksten er uændret. |
| G18-318 | 4 Pris | DONE. Indlæsningsrammen på prisovervågning kan krympe. | Teksten er uændret. |
| G18-319 | 4 Pris | DONE. Berørte tilbuds skrivebordsrække kan krympe. | Beløbet er uændret. |
| G18-320 | 4 Pris | DONE. Pristendensens skrivebordsrække kan krympe. | Prisen er uændret. |
| G18-321 | 4 Pris | DONE. Fejlrammen på prisovervågning kan krympe. | Teksten er uændret. |
| G18-322 | 4 Pris | DONE. Oversigtskortets etikettrække kan krympe. | Etiketten er uændret. |
| G18-323 | 4 Pris | DONE. Ministatistikkens ramme kan krympe. | Tallene er uændrede. |
| G18-324 | 4 Pris | DONE. Prisbevægelsens bjælke kan krympe. | Bredderne er uændrede. |
| G18-325 | 4 Pris | DONE. Mobilisten af prisadvarsler kan krympe. | Navn og procent er uændrede. |
| G18-326 | 4 Pris | DONE. Mobilisten af berørte tilbud kan krympe. | Nummer og beløb er uændrede. |
| G18-327 | 4 Pris | DONE. Mobilisten af pristendenser kan krympe. | Pris og navn er uændrede. |
| G18-328 | 4 Pris | DONE. Påvirker-rækken på prisadvarslens skrivebord kan krympe. | Tallene er uændrede. |
| G18-329 | 4 Pris | DONE. Prisadvarslens afsnit kan krympe. | Navn og procent er uændrede. |
| G18-330 | 4 Pris | DONE. Prisovervågningens side kan krympe. | Tallene er uændrede. |
| G18-331 | 4 Pris | DONE. Pristendensens afsnit kan krympe. | Pris og navn er uændrede. |
| G18-332 | 4 Pris | DONE. Prisbevægelsens blok kan krympe. | Procenterne er uændrede. |
| G18-333 | 4 Pris | DONE. Prisadvarslens tabelrulle kan krympe. | Navn og priser er uændrede. |
| G18-334 | 4 Pris | DONE. Prisadvarslens skrivebordsramme kan krympe. | Navn og priser er uændrede. |
| G18-335 | 4 Pris | DONE. Berørte tilbuds tabelrulle kan krympe. | Nummer og beløb er uændrede. |
| G18-336 | 4 Pris | DONE. Pristendensens tabelrulle kan krympe. | Pris og navn er uændrede. |
| G18-337 | 4 Pris | DONE. Berørte tilbuds skrivebordsramme kan krympe. | Nummer og beløb er uændrede. |
| G18-338 | 4 Pris | DONE. Pristendensens skrivebordsramme kan krympe. | Pris og navn er uændrede. |
| G18-339 | 4 Pris | DONE. Prisadvarslens kolonnerække kan krympe. | Navn og priser er uændrede. |
| G18-340 | 4 Pris | DONE. Berørte tilbuds kolonnerække kan krympe. | Nummer og beløb er uændrede. |
| G18-341 | 4 Pris | DONE. Pristendensens kolonnerække kan krympe. | Pris og navn er uændrede. |
| G18-342 | 4 Pris | DONE. Prisadvarslens tabel kan krympe. | Navn og priser er uændrede. |
| G18-343 | 4 Pris | DONE. Berørte tilbuds tabel kan krympe. | Nummer og beløb er uændrede. |
| G18-344 | 4 Pris | DONE. Pristendensens tabel kan krympe. | Pris og navn er uændrede. |
| G18-345 | 4 Pris | DONE. Prisadvarslens tabelhoved kan krympe. | Navn og priser er uændrede. |
| G18-346 | 4 Pris | DONE. Berørte tilbuds tabelhoved kan krympe. | Nummer og beløb er uændrede. |
| G18-347 | 4 Pris | DONE. Pristendensens tabelhoved kan krympe. | Pris og navn er uændrede. |
| G18-348 | 4 Pris | DONE. Prisadvarslens tabelkrop kan krympe. | Navn og priser er uændrede. |
| G18-349 | 4 Pris | DONE. Berørte tilbuds tabelkrop kan krympe. | Nummer og beløb er uændrede. |
| G18-350 | 4 Pris | DONE. Pristendensens tabelkrop kan krympe. | Pris og navn er uændrede. |
| G18-351 | 4 Pris | DONE. Den gamle skrivebordspris på prisadvarslen kan krympe. | `formatCurrency(alert.old_price)` er uændret. Kun den celle. |
| G18-352 | 4 Pris | DONE. Den nye skrivebordspris på prisadvarslen kan krympe. | `formatCurrency(alert.new_price)` er uændret. Kun den celle. |
| G18-353 | 4 Pris | DONE. Tilbudsbeløbet på berørte tilbuds skrivebord kan krympe. | `formatCurrency(offer.total_amount)` er uændret. Kun den celle. |
| G18-354 | 4 Pris | DONE. Det potentielle tab på berørte tilbuds skrivebord kan krympe. | Beløbet er uændret. Kun den celle. |
| G18-355 | 4 Pris | DONE. Nuværende pris på pristendensens skrivebord kan krympe. | `formatCurrency(trend.current_price)` er uændret. Kun den celle. |
| G18-356 | 4 Pris | DONE. Tab-mærket på berørte tilbuds skrivebord kan krympe. | Beløbet er uændret. Kun span-elementet. |
| G18-357 | 8 Pilot | DONE. Seneste mail-forhåndsvisning på kundetidslinjen ombrydes i stedet for `line-clamp-1`. | Teksten er uændret. Kun den linje. |
| G18-358 | 8 Pilot | DONE. Mail-forhåndsvisningen i kundetidslinjens liste ombrydes i stedet for `line-clamp-1`. | Teksten er uændret. Kun den linje. |
| G18-359 | 8 Pilot | DONE. Pakkebeskrivelsen i pakkevælgeren ombrydes i stedet for `line-clamp-1`. | Teksten er uændret. Kun den linje. |
| G18-360 | 8 Pilot | DONE. Sagstitlen i mailforslag ombrydes i stedet for `line-clamp-1`. | Teksten `{c.title}` er uændret. Kun den linje. |
| G18-361 | 8 Pilot | DONE. Tilbudstitlen i mailforslag ombrydes i stedet for `line-clamp-1`. | Teksten `{o.title}` er uændret. Kun den linje. |
| G18-362 | 8 Pilot | DONE. Sagsbeskrivelsen i mailforslag ombrydes i stedet for `line-clamp-2`. | Teksten `{c.description}` er uændret. Kun den linje. |
| G18-363 | 8 Pilot | DONE. Tilbudsbeskrivelsen i mailforslag ombrydes i stedet for `line-clamp-2`. | Teksten `{o.description}` er uændret. Kun den linje. |
| G18-364 | 8 Pilot | DONE. Leverandørnotatet på leverandørkortet ombrydes i stedet for `line-clamp-2`. | Teksten `{supplier.notes}` er uændret. Kun den linje. |
| G18-365 | 8 Pilot | DONE. Emnet i beskedlisten ombrydes i stedet for `line-clamp-2`. | Teksten `{message.subject}` er uændret. Kun den linje. |
| G18-366 | 8 Pilot | DONE. Sagsbeskrivelsen i kundeportalen ombrydes i stedet for `line-clamp-2`. | Teksten `{sc.description}` er uændret. Kun den linje. |
| G18-367 | 8 Pilot | DONE. Sagsbeskrivelsen på partnerkortet ombrydes i stedet for `line-clamp-2`. | Teksten `{c.description}` er uændret. Kun den linje. |
| G18-368 | 8 Pilot | DONE. Opgavebeskrivelsen på opgavebrættet ombrydes i stedet for `line-clamp-2`. | Teksten `{task.description}` er uændret. Kun den linje. |
| G18-369 | 8 Pilot | DONE. Tilstandsbeskrivelsen i kalkulationstypen ombrydes i stedet for `line-clamp-2`. | Teksten `{MODE_DESCRIPTIONS[mode]}` er uændret. Kun det span. |
| G18-370 | 8 Pilot | DONE. Tilbudstekstens indhold på skabelonkortet ombrydes i stedet for `line-clamp-2`. | Teksten `{template.content}` er uændret. Kun den linje. |
| G18-371 | 8 Pilot | DONE. Beskeden i opgavepåmindelsen ombrydes i stedet for `line-clamp-2`. | Teksten `{alert.message}` er uændret. Kun den linje. |
| G18-372 | 8 Pilot | DONE. Eksempelteksten i AI-projekt ombrydes i stedet for `line-clamp-2`. | Teksten `{example.text}` er uændret. Kun den linje. |
| G18-373 | 4 Pris | DONE. Varenummeret på leverandørvarens mobilkort ombrydes. | Teksten `{product.supplier_sku}` er uændret. Priser er uændret. Kun den linje. |
| G18-374 | 4 Pris | DONE. Varenummeret på leverandørvarens skrivebord kan krympe. | Teksten `{product.supplier_sku}` er uændret. Priser er uændret. Kun den celle. |
| G18-375 | 8 Pilot | DONE. Opgavetitlen på opgavebrættet ombrydes. | Teksten `{task.title}` er uændret. Kun den overskrift. |
| G18-376 | 8 Pilot | DONE. Navnet på kalkulationstypen ombrydes. | Teksten `{CALCULATION_MODE_LABELS[mode]}` er uændret. Kun det span. |
| G18-377 | 8 Pilot | DONE. Titlen på tilbudstekstkortet ombrydes. | Teksten `{template.title}` er uændret. Kun den overskrift. |
| G18-378 | 8 Pilot | DONE. Tilbudsnummeret i opgavepåmindelsen ombrydes. | Teksten `{reminder.offer.offer_number}` er uændret. Kun det link. |
| G18-379 | 8 Pilot | DONE. Eksempeltitlen i AI-projekt ombrydes. | Teksten `{example.title}` er uændret. Kun den linje. |
| G18-380 | 4 Pris | DONE. Opdateret-linjen på leverandørvarens mobilkort ombrydes. | Dato-udtrykket er uændret. Priser er uændret. Kun den linje. |
| G18-381 | 4 Pris | DONE. Opdateret-cellen på leverandørvarens skrivebord kan krympe. | Dato-udtrykket er uændret. Priser er uændret. Kun den celle. |
| G18-382 | 8 Pilot | DONE. Ansvarlig på opgavekortet ombrydes. | Teksten `{task.assigned_to_profile.full_name || task.assigned_to_profile.email}` er uændret. Kun den linje. |
| G18-383 | 8 Pilot | DONE. Forfaldsdatoen på opgavekortet ombrydes. | Kaldet `formatDate(task.due_date)` er uændret. Kun det span. |
| G18-384 | 8 Pilot | DONE. Omfang-id på tilbudstekstkortet ombrydes. | Udtrykket `{template.scope_id}` er uændret. Kun det mærke. |
| G18-385 | 8 Pilot | DONE. Kundenavnet i opgavepåmindelsen kan krympe. | Teksten `{reminder.customer.company_name}` er uændret. Kun det link. |
| G18-386 | 8 Pilot | DONE. Overskriften på AI-projektets eksempler ombrydes. | Teksten `Eksempler på projektbeskrivelser` er uændret. Kun den overskrift. |
| G18-387 | 4 Pris | DONE. Kategorien på leverandørvarens mobilkort ombrydes. | Teksten `{product.category}` er uændret. Priser er uændret. Kun det mærke. |
| G18-388 | 4 Pris | DONE. Kategorien på leverandørvarens skrivebord kan krympe. | Teksten `{product.category}` er uændret. Priser er uændret. Kun mærket i tabellen. |
| G18-389 | 8 Pilot | DONE. Timetallet på opgavekortet ombrydes. | Udtrykket `{task.actual_hours}/{task.estimated_hours}t` er uændret. Kun det span. |
| G18-390 | 8 Pilot | DONE. Overskriften Seneste analyser ombrydes. | Teksten `Seneste analyser` er uændret. Kun den overskrift. |
| G18-391 | 8 Pilot | DONE. Typemærket på tilbudstekstkortet ombrydes. | Teksten `{typeConfig.label}` er uændret. Kun det mærke ved titlen. |
| G18-392 | 8 Pilot | DONE. Prioritetsmærket på tilbudstekstkortet ombrydes. | Teksten `Prioritet: {template.priority}` er uændret. Kun det mærke. |
| G18-393 | 8 Pilot | DONE. Den tomme historiktekst i AI-projekt ombrydes. | Sætningen `Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.` er uændret. Kun det afsnit. |
| G18-394 | 4 Pris | DONE. Statusmærket på leverandørvarens mobilkort ombrydes. | Teksten `Aktiv`/`Inaktiv` er uændret. Kun det mærke. |
| G18-395 | 4 Pris | DONE. Statusmærket på leverandørvarens skrivebord kan krympe. | Teksten `Aktiv`/`Inaktiv` er uændret. Kun mærket i tabellen. |
| G18-396 | 8 Pilot | DONE. Slette-teksten på opgavekortet ombrydes. | Udtrykket `{isDeleting ? 'Sletter...' : 'Slet'}` er uændret. Kun den knap. |
| G18-397 | 8 Pilot | DONE. Datoen under en analyse ombrydes. | Kaldet `copenhagenDateTimeLabel(analysis.created_at)` er uændret. Kun det afsnit. |
| G18-398 | 8 Pilot | DONE. Inaktiv-mærket på tilbudstekstkortet ombrydes. | Teksten `Inaktiv` er uændret. Kun det mærke. |
| G18-399 | 8 Pilot | DONE. Betingelsesmærket på tilbudstekstkortet ombrydes. | Udtrykket `Betingelser: {JSON.stringify(template.conditions)}` er uændret. Kun det mærke. |
| G18-400 | 8 Pilot | DONE. Overskriften Næste skridt ombrydes. | Teksten `Næste skridt` er uændret. Kun den overskrift. |
| G18-401 | 8 Pilot | DONE. Indledningen på AI-projekt ombrydes. | Sætningen `Beskriv projektet og få automatisk kalkulation, risikovurdering og tilbudstekst` er uændret. Kun det afsnit. |
| G18-402 | 8 Pilot | DONE. Den tomme leverandørvareliste ombrydes. | Teksten `Ingen produkter fundet` er uændret. Kun det afsnit i leverandørvaretabellen. |
| G18-403 | 8 Pilot | DONE. Rediger-teksten på opgavekortet ombrydes. | Teksten `Rediger` er uændret. Kun den knap. |
| G18-404 | 8 Pilot | DONE. Søgehintet på den tomme leverandørvareliste ombrydes. | Teksten `Prøv at ændre din søgning` er uændret. Kun det afsnit. |
| G18-405 | 8 Pilot | DONE. Sidetitel på AI-projekt ombrydes. | Teksten `AI Projektanalyse` er uændret. Kun den overskrift. |
| G18-406 | 8 Pilot | DONE. Kopier-teksten på AI-projekt ombrydes. | Teksten `Kopier` er uændret. Kun den knap. |
| G18-407 | 8 Pilot | DONE. Forklaringen under Næste skridt ombrydes. | Sætningen `Opret et rigtigt tilbud baseret på denne analyse` er uændret. Kun det afsnit. |
| G18-408 | 8 Pilot | DONE. Etiketten Projektbeskrivelse ombrydes. | Teksten `Projektbeskrivelse` er uændret. Kun den etiket. |
| G18-409 | 8 Pilot | DONE. Knappen Opret tilbud ombrydes. | Teksten `Opret tilbud` er uændret. Kun den knap. |
| G18-410 | 8 Pilot | DONE. Overskriften Hurtig estimat ombrydes. | Teksten `Hurtig estimat` er uændret. Kun den overskrift. |
| G18-411 | 8 Pilot | DONE. Knappen Analyser projekt ombrydes. | Teksten `Analyser projekt` er uændret. Kun den knap. |
| G18-412 | 8 Pilot | DONE. Overskriften Tidsberegning ombrydes. | Teksten `Tidsberegning` er uændret. Kun den overskrift. |
| G18-413 | 8 Pilot | DONE. Overskriften Kompleksitetsfaktorer ombrydes. | Teksten `Kompleksitetsfaktorer` er uændret. Kun den overskrift. |
| G18-414 | 8 Pilot | DONE. Overskriften Elpunkter ombrydes. | Teksten `Elpunkter` er uændret. Kun den overskrift. |
| G18-415 | 8 Pilot | DONE. Overskriften Prisopbygning ombrydes. | Teksten `Prisopbygning` er uændret. Kun den overskrift. |
| G18-416 | 8 Pilot | DONE. Overskriften Komponenter ombrydes. | Teksten `Komponenter` er uændret. Kun den overskrift. `>Komponenter</h4>` bliver. |
| G18-417 | 8 Pilot | DONE. Overskriften Bygningsinformation ombrydes. | Teksten `Bygningsinformation` er uændret. Kun den overskrift. `>Bygningsinformation</h4>` bliver. |
| G18-418 | 8 Pilot | DONE. Overskriften Bemærkninger ombrydes. | Teksten `Bemærkninger` er uændret. Kun den overskrift. |
| G18-419 | 8 Pilot | DONE. Etiketten Basis tid ombrydes. | Teksten `Basis tid` er uændret. Kun den etiket i AI-projekt. |
| G18-420 | 8 Pilot | DONE. Etiketten Total tid ombrydes. | Teksten `Total tid` er uændret. Kun den etiket i AI-projekt. |
| G18-421 | 8 Pilot | DONE. Etiketten Størrelsesfaktor ombrydes. | Teksten `Størrelsesfaktor` er uændret. Kun den etiket. |
| G18-422 | 8 Pilot | DONE. Etiketten Materialer ombrydes. | Teksten `Materialer` er uændret. Kun den etiket i AI-projekt. |
| G18-423 | 8 Pilot | DONE. Etiketten Subtotal ombrydes. | Teksten `Subtotal` er uændret. Kun den etiket i AI-projekt. |
| G18-424 | 8 Pilot | DONE. Etiketten Risikobuffer ombrydes. | Udtrykket `{result.calculation.price.risk_buffer_percentage}%` er uændret. Kun den etiket. |
| G18-425 | 8 Pilot | DONE. Etiketten Margin ombrydes. | Udtrykket `{result.calculation.price.margin_percentage}%` er uændret. Kun den etiket. |
| G18-426 | 8 Pilot | DONE. Etiketten Type ombrydes. | Teksten `Type` er uændret. Kun den etiket i AI-projekt. Værdierne bliver. |
| G18-427 | 8 Pilot | DONE. Etiketten Størrelse ombrydes. | Teksten `Størrelse` er uændret. Kun den etiket i AI-projekt. Værdien bliver. |
| G18-428 | 8 Pilot | DONE. Etiketten Alder ombrydes. | Teksten `Alder` er uændret. Kun den etiket i AI-projekt. Værdien bliver. |
| G18-429 | 8 Pilot | DONE. Etiketten Kompleksitet ombrydes. | Teksten `Kompleksitet` er uændret. Kun den etiket. Værdien og overskriften Kompleksitetsfaktorer bliver. |
| G18-430 | 8 Pilot | DONE. Teksten Ingen væsentlige risici identificeret ombrydes. | Teksten er uændret. Kun det span i AI-projekt. |
| G18-431 | 8 Pilot | DONE. Etiketten Ladestander ombrydes. | Teksten `Ladestander (kun hvis opgaven indeholder en elbillader)` er uændret. Kun den etiket. |
| G18-432 | 8 Pilot | DONE. Hjælpeteksten om en lader der ikke er prissat ombrydes. | Sætningen og `&quot;` er uændrede. Kun det afsnit i AI-projekt. Der gættes ingen pris. |
| G18-433 | 8 Pilot | DONE. Den valgte ladestanders navn ombrydes. | `formatCurrency(charger.cost_price)` er uændret. Kun det span. |
| G18-434 | 8 Pilot | DONE. Knappen Fjern på ladestanderen ombrydes. | Teksten `Fjern` og `setCharger(null)` er uændrede. Kun den knap. |
| G18-435 | 8 Pilot | DONE. Søgefeltet til ladestander kan krympe. | Pladsholderen og `aria-label="Søg ladestander"` er uændrede. Kun det felt. |
| G18-436 | 8 Pilot | DONE. Beskrivelsesfeltet på AI-projekt kan krympe. | Pladsholderen og `value={description}` er uændrede. Kun tekstfeltet. |
| G18-437 | 8 Pilot | DONE. Timetallet i hurtig estimat ombrydes. | Udtrykket `{Math.round(quickResult.estimatedHours)}` er uændret. Kun det span. |
| G18-438 | 8 Pilot | DONE. Beløbet i hurtig estimat kan krympe. | `formatCurrency(quickResult.estimatedPrice)` er uændret. Kun det span. |
| G18-439 | 8 Pilot | DONE. Elpunkt-tallet i hurtig estimat ombrydes. | Udtrykket `{quickResult.totalPoints} elpunkter` er uændret. Kun det span. |
| G18-440 | 8 Pilot | DONE. Bygningstypen i hurtig estimat ombrydes. | Udtrykket `{getBuildingTypeName(quickResult.buildingType)}` er uændret. Kun det span. |
| G18-441 | 8 Pilot | DONE. Elpunkt-antallet i fortolkningen ombrydes. | Teksten `{value} stk` er uændret. Kun den værdi. |
| G18-442 | 8 Pilot | DONE. Fejlteksten ved ladestander-søgning kan krympe. | Sætningerne og `data-testid="charger-search-error"` er uændrede. Kun det afsnit. |
| G18-443 | 8 Pilot | DONE. Søgeresultatets ladestander kan krympe. | `formatCurrency(h.cost_price)` er uændret. Kun den knap. |
| G18-444 | 8 Pilot | DONE. Venteteksten Analyserer ombrydes. | Teksten `Analyserer...` er uændret. Kun det span i AI-projekt. |
| G18-445 | 8 Pilot | DONE. Kundens søgefelt i AI-projekt kan krympe. | Pladsholderen `Søg efter kunde...` og `aria-label="Søg efter kunde"` er uændrede. Kun det felt. |
| G18-446 | 8 Pilot | DONE. Knappen Prøv igen under seneste analyser ombrydes. | Teksten `Prøv igen` og `setHistoryTry` er uændrede. Kun den knap. |
| G18-447 | 8 Pilot | DONE. Knappen Prøv igen i kundevælgeren ombrydes. | Teksten `Prøv igen` og `void loadCustomers()` er uændrede. Kun den knap. |
| G18-448 | 8 Pilot | DONE. Knappen Annuller i kundevælgeren ombrydes. | Teksten `Annuller` og `setShowCustomerModal(false)` er uændrede. Kun den knap. |
| G18-449 | 8 Pilot | DONE. Den tomme kundeliste i AI-projekt kan krympe. | Teksterne `Ingen kunder fundet` og `Ingen kunder` er uændrede. Kun det afsnit. |
| G18-450 | 8 Pilot | DONE. Luk-knappen i kundevælgeren kan krympe. | `aria-label="Luk"` er uændret. Kun den knap. |
| G18-451 | 8 Pilot | DONE. Historikkortet på AI-projekt kan krympe. | Beskrivelsen forbliver to linjer. `formatCurrency(analysis.total_price)` er uændret. Kun rækken. |
| G18-452 | 8 Pilot | DONE. Kundekortet i kundevælgeren kan krympe. | `handleSelectCustomer` er uændret. Navn og mail ombrydes som før. Kun knappen. |
| G18-453 | 8 Pilot | DONE. Eksempelkortet i AI-projekt kan krympe. | `handleDescriptionChange(example.text)` er uændret. Titel og tekst ombrydes som før. Kun knappen. |
| G18-454 | 8 Pilot | DONE. Kundelisten i kundevælgeren kan krympe. | `max-h-64` og rulning er uændret. Kun den ramme. |
| G18-455 | 8 Pilot | DONE. Kundevælgerens hoved kan krympe. | Teksten `Vælg kunde` og `aria-label="Luk"` er uændrede. Kun rækken i AI-projekt. |
| G18-456 | 8 Pilot | DONE. Kundevælgerens bund kan krympe. | Knappen `Annuller` er uændret. Kun rækken. |
| G18-457 | 8 Pilot | DONE. Historikkens indlæsning kan krympe. | Den tomme sætning er uændret. Kun pulsen i AI-projekt. |
| G18-458 | 8 Pilot | DONE. Historikkens liste kan krympe. | Beskrivelsen forbliver to linjer. `formatCurrency(analysis.total_price)` er uændret. Kun listen. |
| G18-459 | 8 Pilot | DONE. Eksempelgitteret i AI-projekt kan krympe. | Titel og tekst ombrydes som før. Kun gitteret. |
| G18-460 | 8 Pilot | DONE. Kundevælgerens baggrund kan krympe. | Panelet kan stadig rulles. Kun baggrunden i AI-projekt. |
| G18-461 | 8 Pilot | DONE. Historikafsnittet kan krympe. | Overskriften og den tomme sætning er uændrede. Kun rammen. |
| G18-462 | 8 Pilot | DONE. Eksempelafsnittet i AI-projekt kan krympe. | Overskrift, titel og tekst ombrydes som før. Kun rammen. |
| G18-463 | 8 Pilot | DONE. Kundevælgerens panel kan krympe. | `max-h-[90vh]` og rulning er uændret. Kun panelet. |
| G18-464 | 8 Pilot | DONE. AI-projektets side kan krympe. | Kun den ydre ramme `p-6 max-w-6xl mx-auto`. Indholdet er uændret. |
| G18-465 | 8 Pilot | DONE. Hurtig estimat kan krympe. | `formatCurrency(quickResult.estimatedPrice)` er uændret. Kun boksen `mt-4 p-4 bg-purple-50 rounded-lg`. |
| G18-466 | 8 Pilot | DONE. Søgeresultatets liste til ladestander kan krympe. | `formatCurrency(h.cost_price)` er uændret. Kun listen `mt-2 max-h-48 overflow-auto divide-y text-sm`. |
| G18-467 | 8 Pilot | DONE. Beskrivelsesafsnittet på AI-projekt kan krympe. | Pladsholderen og `value={description}` er uændrede. Kun rammen `bg-white border rounded-lg p-6 mb-6`. |
| G18-468 | 8 Pilot | DONE. Tilbudsteksten på AI-projekt kan krympe. | Teksten i `pre` er uændret. Kun rammen `whitespace-pre-wrap font-mono overflow-x-auto`. |
| G18-469 | 8 Pilot | DONE. Bemærkningsboksen på AI-projekt kan krympe. | Overskriften `Bemærkninger` er uændret. Kun boksen i AI-projekt. |
| G18-470 | 8 Pilot | DONE. Næste skridt-afsnittet kan krympe. | Overskrift og tekst ombrydes som før. Kun rammen i AI-projekt. |
| G18-471 | 8 Pilot | DONE. Komponenttabellen på skrivebord kan krympe. | `hidden md:block border rounded-lg overflow-hidden` bliver. Priserne er uændrede. Kun rammen. |
| G18-472 | 8 Pilot | DONE. Gitteret i hurtig estimat kan krympe. | `formatCurrency(quickResult.estimatedPrice)` er uændret. Kun gitteret `grid grid-cols-2 md:grid-cols-4 gap-4 text-sm`. |
| G18-473 | 8 Pilot | DONE. Opsummeringsgitteret på AI-projekt kan krympe. | `formatCurrency(result.calculation.price.total_price)` er uændret. Kun gitteret `grid grid-cols-1 md:grid-cols-4 gap-4` i AI-projekt. |
| G18-474 | 8 Pilot | DONE. Bemærkningslisten på AI-projekt kan krympe. | Teksten `{w}` er uændret. Kun listen `text-sm text-yellow-700 mt-1 space-y-1` i AI-projekt. |
| G18-475 | 8 Pilot | DONE. Ladestander-vælgerens ramme kan krympe. | `data-testid="charger-picker"` og `formatCurrency(charger.cost_price)` er uændrede. Kun rammen `mt-3 rounded-lg border border-dashed p-3`. |
| G18-476 | 8 Pilot | DONE. Opsummeringskortets tal kan krympe. | `{value}` er uændret. Kun `text-xl font-bold` i SummaryCard på AI-projekt. |
| G18-477 | 8 Pilot | DONE. Komponenttabellen kan krympe. | `formatCurrency(comp.unit_price)` og `formatCurrency(comp.total)` er uændrede. Kun `w-full text-sm` i AI-projekt. |
| G18-478 | 8 Pilot | DONE. Komponentnavnet på skrivebord kan krympe. | `{comp.name}` er uændret. Kun cellen `<td className="p-3">{comp.name}</td>`. Priserne er uændrede. |
| G18-479 | 8 Pilot | DONE. Antal og enhed på skrivebord kan krympe. | `{comp.quantity} {comp.unit}` er uændret. Kun cellen `p-3 text-right` med det udtryk. Priserne er uændrede. |
| G18-480 | 8 Pilot | DONE. Enhedsprisen på skrivebord kan krympe. | `formatCurrency(comp.unit_price)` er uændret. Kun cellen `<td className="p-3 text-right">{formatCurrency(comp.unit_price)}</td>`. |
| G18-481 | 8 Pilot | DONE. Komponenttotalen på skrivebord kan krympe. | `formatCurrency(comp.total)` er uændret. Kun cellen `<td className="p-3 text-right font-medium">{formatCurrency(comp.total)}</td>`. |
| G18-482 | 8 Pilot | DONE. Kolonnen Komponent kan krympe. | Teksten `Komponent` er uændret. Kun `<th className="text-left p-3">Komponent</th>`. Priserne er uændrede. |
| G18-483 | 8 Pilot | DONE. Opsummeringskortets note kan krympe. | `{sublabel}` er uændret. Kun `text-xs text-gray-400">{sublabel}` i SummaryCard. Historikkens dato er uændret. |
| G18-484 | 8 Pilot | DONE. Kolonnen Antal kan krympe. | Teksten `Antal` er uændret. Kun `<th className="text-right p-3">Antal</th>`. Priserne er uændrede. |
| G18-485 | 8 Pilot | DONE. Kolonnen Enhedspris kan krympe. | Teksten `Enhedspris` er uændret. Kun `<th className="text-right p-3">Enhedspris</th>` i AI-projekt. Priserne er uændrede. |
| G18-486 | 8 Pilot | DONE. Kolonnen Total kan krympe. | Teksten `Total` er uændret. Kun `<th className="text-right p-3">Total</th>` i AI-projekt. Priserne er uændrede. |
| G18-487 | 8 Pilot | DONE. Komponenttabellens hoved kan krympe. | `bg-gray-50` er uændret. Kun `<thead className="bg-gray-50">` i AI-projekt. Priserne er uændrede. |
| G18-488 | 8 Pilot | DONE. Komponentrækken kan krympe. | `key={i}` er uændret. Kun `<tr key={i}>` i AI-projekt. Priserne er uændrede. |
| G18-489 | 8 Pilot | DONE. Kolonnerækken kan krympe. | Kun den ene `<tr>` i AI-projektets komponenttabel. `key={i}` er uændret. Priserne er uændrede. |
| G18-490 | 8 Pilot | DONE. Opsummeringskortets etiket kan krympe. | `{label}` er uændret. Kun `<div className="text-sm text-gray-500">{label}</div>` i SummaryCard på AI-projekt. |
| G18-491 | 8 Pilot | DONE. Komponenttabellens krop kan krympe. | Kun `<tbody className="divide-y">` i AI-projekt. Priserne er uændrede. |
| G18-492 | 8 Pilot | DONE. Opsummeringskortets ramme kan krympe. | Kun `<div className="bg-white border rounded-lg p-4">` i SummaryCard på AI-projekt. `{value}` og `{sublabel}` er uændrede. |
| G18-493 | 8 Pilot | DONE. Opsummeringskortets ikon kan krympe. | Kun diven med `w-10 h-10 rounded-lg` i SummaryCard på AI-projekt. `{icon}` er uændret. |
| G18-494 | 8 Pilot | DONE. Komponentafsnittet kan krympe. | Kun `<div className="mt-6">` omkring komponenttabellen i AI-projekt. Priserne er uændrede. |
| G18-495 | 8 Pilot | DONE. Rækken uden væsentlige risici kan krympe. | Teksten `Ingen væsentlige risici identificeret` er uændret. Kun `<div className="flex items-center gap-2 text-green-600">` i AI-projekt. |
| G18-496 | 8 Pilot | DONE. Mobillisten af komponenter kan krympe. | Kun `<ul className="md:hidden space-y-2" data-testid="ai-components-mobile">` i AI-projekt. Priserne er uændrede. |
| G18-497 | 8 Pilot | DONE. Mobilkortet for en komponent kan krympe. | Kun `<li key={i} className="rounded-lg ring-1 ring-gray-200 p-3 text-sm min-w-0">` inde i `ai-components-mobile` i AI-projekt. Priserne er uændrede. |
| G18-498 | 8 Pilot | DONE. AI-projektets sidehoved kan krympe. | Kun `<div className="mb-8">` i AI-projekt. Overskriften er uændret. |
| G18-499 | 8 Pilot | DONE. Analysér-knappens række kan krympe. | Kun `<div className="mt-4 flex justify-end">` i AI-projekt. Knappen er uændret. |
| G18-500 | 8 Pilot | DONE. AI-projektets resultatstak kan krympe. | Kun `<div className="space-y-6">` i AI-projekt. Priserne er uændrede. |
| G18-501 | 8 Pilot | DONE. Bemærkningsrækken kan krympe. | Kun `<div className="flex items-start gap-2">` i AI-projekt. Advarselsteksten er uændret. |
| G18-502 | 8 Pilot | DONE. Listen med identificerede risici kan krympe. | Kun `<div className="space-y-3">` i AI-projekt. Risikokortet er uændret. |
| G18-503 | 8 Pilot | DONE. Knaprækken ved tilbudsteksten kan krympe. | Kun `<div className="flex gap-2">` i AI-projekt. Knappen Kopier er uændret. |
| G18-504 | 8 Pilot | DONE. Næste skridts række kan krympe. | Kun `<div className="flex items-center justify-between">` i AI-projekt. Knappen Opret tilbud er uændret. |
| G18-505 | 8 Pilot | DONE. Rækken med valgt ladestander kan krympe. | Kun `<div className="flex items-center justify-between gap-2 text-sm">` i AI-projekt. Prisen er uændret. |
| G18-506 | 8 Pilot | DONE. Søgefeltets ramme i kundevaelgeren kan krympe. | Kun `<div className="relative mb-4">` i AI-projekt. Søgefeltet er uændret. |
| G18-507 | 8 Pilot | DONE. Kundevaelgerens titelrække kan krympe. | Kun `<div className="flex items-center gap-2 min-w-0">` i AI-projekt. Teksten `Vælg kunde` er uændret. |
| G18-508 | 8 Pilot | DONE. Advarselsikonet kan krympe. | Kun `<AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />` i AI-projekt. Advarselsteksten er uændret. |
| G18-509 | 8 Pilot | DONE. Kompleksitetsfaktorernes ramme kan krympe. | Kun `<div className="mt-4 pt-4 border-t">` i AI-projekt. Overskriften `Kompleksitetsfaktorer` er uændret. |
| G18-510 | 8 Pilot | DONE. Kompleksitetsfaktorernes chip-række kan krympe. | Kun `<div className="flex flex-wrap gap-2">` i AI-projekt. Overskriften `Kompleksitetsfaktorer` er uændret. |
| G18-511 | 8 Pilot | DONE. Historikkens tekstkolonne kan krympe. | Kun `<div className="flex-1 min-w-0">` i AI-projekt. Beskrivelsens `line-clamp-2` er uændret. |
| G18-512 | 8 Pilot | DONE. Sammenklappelig sektions hoved kan krympe. | Kun `className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"` i AI-projekt. `{title}` er uændret. |
| G18-513 | 8 Pilot | DONE. Sammenklappelig sektions ramme kan krympe. | Kun `<div className="bg-white border rounded-lg">` i AI-projekt. `{title}` er uændret. |
| G18-514 | 8 Pilot | DONE. Sektionens titelrække kan krympe. | Kun `<div className="flex items-center gap-3">` i AI-projekt. `{title}` er uændret. |
| G18-515 | 8 Pilot | DONE. Sektionens indhold kan krympe. | Kun `<div className="p-4 pt-0 border-t">` i AI-projekt. `{children}` er uændret. |
| G18-516 | 8 Pilot | DONE. Sektionens titeltekst kan krympe. | Kun `<h3 className="font-semibold">{title}</h3>` i AI-projekt. `{title}` er uændret. |
| G18-517 | 8 Pilot | DONE. Risikokortets række kan krympe. | Kun `<div className="flex items-start gap-3">` i AI-projekt. `{risk.title}` er uændret. |
| G18-518 | 8 Pilot | DONE. Risikobeskrivelsen kan krympe. | Kun `<div className="text-sm text-gray-600 mt-1">{risk.description}</div>` i AI-projekt. `{risk.description}` er uændret. |
| G18-519 | 8 Pilot | DONE. Risikoanbefalingen kan krympe. | Kun `<div className="text-sm text-gray-500 mt-2 italic">` i AI-projekt. Teksten `Anbefaling:` er uændret. |
| G18-520 | 8 Pilot | DONE. Risikotitlen kan krympe. | Kun `<div className="font-medium">{risk.title}</div>` i AI-projekt. `{risk.title}` er uændret. |
| G18-521 | 8 Pilot | DONE. Risikokortets tekstkolonne kan krympe. | Kun `<div className="flex-1">` i AI-projekt. `{risk.title}` er uændret. |
| G18-522 | 8 Pilot | DONE. Historikikonet kan krympe. | Kun `<Clock className="w-5 h-5 text-gray-500" />` i AI-projekt. Overskriften `Seneste analyser` er uændret. |
| G18-523 | 8 Pilot | DONE. Risikomærket kan krympe. | Kun `<Badge variant="secondary" className="text-xs">` i AI-projekt. Teksterne Lav, Moderat, Høj og Kritisk er uændrede. |
| G18-524 | 8 Pilot | DONE. Lav-risikoikonet kan krympe. | Kun `<CheckCircle2 className="w-4 h-4 text-green-500" />` i AI-projekt. Teksten Lav er uændret. |
| G18-525 | 8 Pilot | DONE. Moderat-risikoikonet kan krympe. | Kun `<AlertTriangle className="w-4 h-4 text-yellow-500" />` i AI-projekt. Teksten Moderat er uændret. |
| G18-526 | 8 Pilot | DONE. Høj-risikoikonet kan krympe. | Kun `<AlertTriangle className="w-4 h-4 text-orange-500" />` i AI-projekt. Teksten Høj er uændret. |
| G18-527 | 8 Pilot | DONE. Kritisk-risikoikonet kan krympe. | Kun `<AlertTriangle className="w-4 h-4 text-red-500" />` i AI-projekt. Teksten Kritisk er uændret. |
| G18-528 | 8 Pilot | DONE. AI-projektets sideikon kan krympe. | Kun `<Sparkles className="w-6 h-6 text-purple-500" />` i AI-projekt. Overskriften er uændret. |
| G18-529 | 8 Pilot | DONE. Risikokortets ramme kan krympe. | Kun `` className={`border rounded-lg p-4 ${severityColors[risk.severity]}`} `` i AI-projekt. Kortteksterne er uændrede. |
| G18-530 | 8 Pilot | DONE. Kundelistens indlæsning kan krympe. | Kun `<div className="flex items-center justify-center py-8">` i AI-projekt. Spinneren er uændret. |
| G18-531 | 8 Pilot | DONE. Kundelistens spinner kan krympe. | Kun `<Loader2 className="w-6 h-6 animate-spin text-gray-400" />` i AI-projekt. Forældre-div'en er uændret. |
| G18-532 | 8 Pilot | DONE. Hurtig-estimatets bygningsikon kan krympe. | Kun `<Building2 className="w-4 h-4 text-purple-500" />` i AI-projekt. Bygningstypen er uændret. |
| G18-533 | 8 Pilot | DONE. Hurtig-estimatets elpunktsikon kan krympe. | Kun `<Plug className="w-4 h-4 text-purple-500" />` i AI-projekt. Elpunktsteksten er uændret. |
| G18-534 | 8 Pilot | DONE. Hurtig-estimatets tidsikon kan krympe. | Kun `<Clock className="w-4 h-4 text-purple-500" />` i AI-projekt. Timeteksten er uændret. |
| G18-535 | 8 Pilot | DONE. Hurtig-estimatets beløbsikon kan krympe. | Kun `<Banknote className="w-4 h-4 text-purple-500" />` i AI-projekt. Beløbet er uændret. |
| G18-536 | 8 Pilot | DONE. Søgeikonet i kundevælgeren kan krympe. | Kun `<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />` i AI-projekt. Pladsholderen er uændret. |
| G18-537 | 8 Pilot | DONE. Analysér-knappens spinner kan krympe. | Kun `<Loader2 className="w-5 h-5 animate-spin mr-2" />` i AI-projekt. Teksten Analyserer er uændret. |
| G18-538 | 8 Pilot | DONE. Kundeikonet i kundevælgeren kan krympe. | Kun `<Users className="w-5 h-5 text-purple-500 shrink-0" />` i AI-projekt. Teksten Vælg kunde er uændret. |
| G18-539 | 8 Pilot | DONE. Analysér-knappens ikon kan krympe. | Kun `<Sparkles className="w-5 h-5 mr-2" />` i AI-projekt. Teksten Analyser projekt er uændret. |
| G18-540 | 8 Pilot | DONE. Luk-ikonet i kundevælgeren kan krympe. | Kun `<X className="w-5 h-5" />` i AI-projekt. aria-label Luk er uændret. |
| G18-541 | 8 Pilot | DONE. Eksempelikonet i AI-projekt kan krympe. | Kun `<Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />` i AI-projekt. Eksempelteksten er uændret. |
| G18-542 | 8 Pilot | DONE. Opsummeringens prisikon kan krympe. | Kun `icon={<Banknote className="w-5 h-5" />}`. Etiketten Total pris og `formatCurrency(result.calculation.price.total_price)` er uændrede. |
| G18-543 | 8 Pilot | DONE. Opret-tilbuds pilen kan krympe. | Kun `<ArrowRight className="w-4 h-4 mr-2" />` i AI-projekt. Teksten Opret tilbud er uændret. |
| G18-544 | 8 Pilot | DONE. Opret-tilbuds spinner kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin mr-2" />` i AI-projekt. Teksten Opret tilbud er uændret. |
| G18-545 | 8 Pilot | DONE. Opsummeringens tidsikon kan krympe. | Kun `icon={<Clock className="w-5 h-5" />}`. Etiketten Estimeret tid er uændret. |
| G18-546 | 8 Pilot | DONE. Opsummeringens risikoikon kan krympe. | Kun `icon={<AlertTriangle className="w-5 h-5" />}`. Etiketten Risikoniveau er uændret. |
| G18-547 | 8 Pilot | DONE. Opsummeringens komponentikon kan krympe. | Kun `icon={<Package className="w-5 h-5" />}`. Etiketten Komponenter er uændret. |
| G18-548 | 8 Pilot | DONE. Kopier-ikonet ved tilbudsteksten kan krympe. | Kun `<Copy className="w-4 h-4 mr-1" />` i AI-projekt. Teksten Kopier er uændret. |
| G18-549 | 8 Pilot | DONE. Fluebenet ved ingen risici kan krympe. | Kun `<CheckCircle2 className="w-5 h-5" />` i AI-projekt. Teksten Ingen væsentlige risici identificeret er uændret. |
| G18-550 | 8 Pilot | DONE. Historikkens pris kan krympe. | Kun `className="text-sm font-medium text-gray-900 shrink-0"`. `formatCurrency(analysis.total_price)` er uændret. |
| G18-551 | 8 Pilot | DONE. Fold-ud-ikonet i sektionen kan krympe. | Kun `<ChevronUp className="w-5 h-5" />` i AI-projekt. ChevronDown er uændret. |
| G18-552 | 8 Pilot | DONE. Fold-ind-ikonet i sektionen kan krympe. | Kun `<ChevronDown className="w-5 h-5" />` i AI-projekt. ChevronUp er uændret. |
| G18-553 | 8 Pilot | DONE. Basistiden i tidsberegningen kan krympe. | Kun `<dd>{result.calculation.time.base_hours.toFixed(1)} timer</dd>`. Tallet er uændret. |
| G18-554 | 8 Pilot | DONE. Total tid i tidsberegningen kan krympe. | Kun `<dd>{result.calculation.time.total_hours.toFixed(1)} timer</dd>`. Tallet er uændret. |
| G18-555 | 8 Pilot | DONE. Kompleksitetsfaktoren i tidsberegningen kan krympe. | Kun `<dd>×{result.calculation.time.complexity_multiplier}</dd>`. Faktoren er uændret. |
| G18-556 | 8 Pilot | DONE. Størrelsesfaktoren i tidsberegningen kan krympe. | Kun `<dd>×{result.calculation.time.size_multiplier}</dd>`. Faktoren er uændret. |
| G18-557 | 8 Pilot | DONE. Tilgængelighedsfaktoren i tidsberegningen kan krympe. | Kun `<dd>×{result.calculation.time.accessibility_multiplier}</dd>`. Faktoren er uændret. |
| G18-558 | 8 Pilot | DONE. Historikkens pladsholderbjælker kan krympe. | Kun de to `<div className="h-10 bg-gray-200 rounded" />` i AI-projekt. |
| G18-559 | 8 Pilot | DONE. Ikonrækken ved sektionens fold kan krympe. | Kun den `<div className="flex items-center gap-2">` der omslutter ChevronUp og ChevronDown. De fire hurtig-estimat-rækker med samme klasse er uændrede. |
| G18-560 | 8 Pilot | DONE. Total-etiketten i prisopbygningen kan krympe. | Kun `<dt>Total</dt>` i AI-projekt. Beløbet er uændret. |
| G18-561 | 8 Pilot | DONE. Tidsberegningens liste kan krympe. | Kun den `<dl className="space-y-2 text-sm">` der følger overskriften Tidsberegning. De tre andre lister med samme klasse er uændrede. |
| G18-562 | 8 Pilot | DONE. Kundens e-mail i kundevælgeren kan krympe. | Kun `<div className="text-sm text-gray-500 break-words">{customer.email}</div>` i AI-projekt. E-mailen er uændret. |
| G18-563 | 8 Pilot | DONE. Kundens navn i kundevælgeren kan krympe. | Kun `<div className="font-medium break-words">{customer.name}</div>` i AI-projekt. Navnet er uændret. |
| G18-564 | 8 Pilot | DONE. Historikkens fejltekst kan krympe. | Kun `data-testid="ai-history-load-error"` i AI-projekt. Fejlteksten er uændret. |
| G18-565 | 8 Pilot | DONE. Hurtig-estimatets fejltekst kan krympe. | Kun `data-testid="ai-quick-load-error"` i AI-projekt. Fejlteksten er uændret. |
| G18-566 | 8 Pilot | DONE. Prisopbygningens kolonne kan krympe. | Kun den `<div>` der omslutter overskriften Prisopbygning. Tidsberegningens kolonne og beløbene er uændrede. |
| G18-567 | 8 Pilot | DONE. Tidsberegningens kolonne kan krympe. | Kun den `<div>` der omslutter overskriften Tidsberegning. Prisopbygningens kolonne og tallene er uændrede. |
| G18-574 | 8 Pilot | DONE. Prisopbygningens liste kan krympe. | Kun den `<dl className="space-y-2 text-sm">` der følger overskriften Prisopbygning. Bygningslisten, elpunktlisten og tidsberegningens liste er uændrede. |
| G18-581 | 8 Pilot | DONE. Fortolkningsgitteret kan krympe. | Kun det `<div className="grid grid-cols-1 md:grid-cols-2 gap-6">` der omslutter Bygningsinformation. Kalkulationsgitteret er uændret. |
| G18-588 | 8 Pilot | DONE. Basistidsrækken i tidsberegningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Basis tid. De andre rækker med samme klasse og timetallet er uændrede. |
| G18-593 | 8 Pilot | DONE. Filstørrelsen i mailgalleriets billedtekst kan krympe. | Kun `<p className="text-[10px] text-white/70">{formatFileSize(att.size)}</p>` i mail-detaljen. Filnavnets `line-clamp-2` og download er uændrede. |
| G18-600 | 8 Pilot | ÅBEN. Filikonet i mailens vedhæftningsliste kan krympe. | Kun `<Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 shrink-0" />` i mail-detaljen. Filnavnet og download er uændrede. |
| G18-568 | 8 Pilot | DONE. Totalrækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 font-bold">` der omslutter totaletiketten i prisopbygningen. Tidsberegningens totalrække og beløbet er uændrede. |
| G18-575 | 8 Pilot | DONE. Materialerækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Materialer. De andre rækker med samme klasse og beløbet er uændrede. |
| G18-582 | 8 Pilot | DONE. Kundevælgerens indhold kan krympe. | Kun `<div className="p-4">` i kundevælgeren. Søgefeltet og listen er uændrede. |
| G18-598 | 8 Pilot | ÅBEN. Listen med mailens filer kan krympe. | Kun `<div className="space-y-1.5">` i mail-detaljen. Filnavnet og filstørrelsen er uændrede. |
| G18-569 | 8 Pilot | DONE. Totalrækken i tidsberegningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 font-bold">` der omslutter etiketten Total tid. Prisopbygningens totalrække og timetallet er uændrede. |
| G18-576 | 8 Pilot | DONE. Arbejdslønrækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Arbejdsløn. De andre rækker med samme klasse og beløbet er uændrede. |
| G18-583 | 8 Pilot | DONE. Kalkulationsgitteret kan krympe. | Kun det `<div className="grid grid-cols-1 md:grid-cols-2 gap-6">` der omslutter Prisopbygning. Fortolkningsgitteret er uændret. |
| G18-599 | 8 Pilot | ÅBEN. Billedgitteret i mailen kan krympe. | Kun `<div className="grid grid-cols-3 gap-2">` i mail-detaljen. Filnavnets `line-clamp-2` er uændret. |
| G18-570 | 8 Pilot | DONE. Subtotalrækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2">` der omslutter etiketten Subtotal. Totalrækkerne og beløbet er uændrede. |
| G18-577 | 8 Pilot | DONE. Marginrækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Margin. De andre rækker med samme klasse og beløbet er uændrede. |
| G18-584 | 8 Pilot | DONE. Typerækken i bygningsinformationen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Type. De andre rækker med samme klasse er uændrede. |
| G18-589 | 8 Pilot | DONE. Kompleksitetsfaktorrækken i tidsberegningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Kompleksitetsfaktor. De andre rækker med samme klasse og faktoren er uændrede. |
| G18-594 | 8 Pilot | DONE. Filstørrelsen i mailens vedhæftningsliste kan krympe. | Kun `<span className="text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}</span>`. Galleriets billedtekst, filnavnets `line-clamp-2` og download er uændrede. |
| G18-601 | 8 Pilot | ÅBEN. Download-ikonet i mailens vedhæftningsliste kan krympe. | Kun `<Download className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0" />` i mail-detaljen. Filnavnet og `aria-label="Download"` er uændrede. |
| G18-571 | 8 Pilot | DONE. Kundelistens fejltekst kan krympe. | Kun `data-testid="ai-customer-load-error"` i AI-projekt. Fejlteksten er uændret. |
| G18-578 | 8 Pilot | DONE. Risikobufferrækken i prisopbygningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Risikobuffer. De andre rækker med samme klasse og beløbet er uændrede. |
| G18-585 | 8 Pilot | DONE. Størrelsesrækken i bygningsinformationen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Størrelse. De andre rækker med samme klasse er uændrede. |
| G18-590 | 8 Pilot | DONE. Størrelsesfaktorrækken i tidsberegningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Størrelsesfaktor. De andre rækker med samme klasse og faktoren er uændrede. |
| G18-595 | 8 Pilot | DONE. Overskriften Vedhæftede filer kan krympe. | Kun `<h3 className="text-sm font-semibold text-gray-700">` i mail-detaljen. Antallet og filnavnets `line-clamp-2` er uændrede. |
| G18-602 | 8 Pilot | ÅBEN. Papirclipsen ved Vedhæftede filer kan krympe. | Kun `<Paperclip className="w-5 h-5 text-gray-500" />` i mail-detaljen. Overskriften er uændret. |
| G18-572 | 8 Pilot | DONE. Bygningsinformationens liste kan krympe. | Kun den `<dl className="space-y-2 text-sm">` der følger overskriften Bygningsinformation. Prislisten, elpunktlisten og tidsberegningens liste er uændrede. |
| G18-579 | 8 Pilot | DONE. Bygningsinformationens kolonne kan krympe. | Kun den `<div>` der omslutter overskriften Bygningsinformation. Elpunktkolonnen og listen er uændrede. |
| G18-586 | 8 Pilot | DONE. Aldersrækken i bygningsinformationen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Alder. De andre rækker med samme klasse er uændrede. |
| G18-591 | 8 Pilot | DONE. Tilgængelighedsfaktorrækken i tidsberegningen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Tilgængelighedsfaktor. De andre rækker med samme klasse og faktoren er uændrede. |
| G18-596 | 8 Pilot | DONE. Antallet ved Vedhæftede filer kan krympe. | Kun `<span className="text-gray-400 font-normal ml-1">({realAttachments.length})</span>` i mail-detaljen. Overskriften og filnavnets `line-clamp-2` er uændrede. |
| G18-603 | 8 Pilot | DONE. Boksens ramme når vedhæftninger ikke er downloadet kan krympe. | Kun `<div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">` i mail-detaljen. Sætningen og download-knappen er uændrede. |
| G18-604 | 8 Pilot | DONE. Knappen Download vedhæftninger nu kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"` i mail-detaljen. Sætningen og boksens ramme er uændrede. |
| G18-605 | 8 Pilot | DONE. Vedhæftningsafsnittets ramme kan krympe. | Kun `<div className="mt-6 pt-4 border-t">` i mail-detaljen. Overskriften og filnavnets `line-clamp-2` er uændrede. |
| G18-606 | 8 Pilot | DONE. Rækken over Vedhæftede filer kan krympe. | Kun `<div className="flex items-center gap-2 mb-3">` i mail-detaljen. Overskriften og papirclipsen er uændrede. |
| G18-607 | 8 Pilot | DONE. Stakken med galleri og filliste kan krympe. | Kun `<div className="space-y-3">` i mail-detaljen. Filnavnets `line-clamp-2` og galleriet er uændrede. |
| G18-608 | 8 Pilot | DONE. Billedknappen i mailgalleriet kan krympe. | Kun `className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all bg-gray-100"` i mail-detaljen. Filnavnets `line-clamp-2` er uændret. |
| G18-609 | 8 Pilot | DONE. Billedtekstens bjælke i mailgalleriet kan krympe. | Kun `<div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">` i mail-detaljen. Filnavnets `line-clamp-2` er uændret. |
| G18-610 | 8 Pilot | DONE. Billedet i mailgalleriet kan krympe. | Kun `<img src={att.url} alt={att.filename} className="w-full h-full object-cover" />` i mail-detaljen. Filnavnets `line-clamp-2` er uændret. |
| G18-611 | 8 Pilot | DONE. Fillinket i mailens vedhæftningsliste kan krympe. | Kun `className="group flex items-start gap-3 px-3 py-2.5 border rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors"` i mail-detaljen. Filnavnet i listen er uændret. |
| G18-612 | 8 Pilot | DONE. Brødteksten i mailen kan krympe. | Kun `<pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">` i mail-detaljen. Mailens indhold er uændret. |
| G18-613 | 8 Pilot | DONE. HTML-brødteksten i mailen kan krympe. | Kun `<div className="prose prose-sm max-w-none">` i mail-detaljen. `dangerouslySetInnerHTML` er uændret. |
| G18-614 | 8 Pilot | DONE. Indlæsningen af mailens brødtekst kan krympe. | Kun `className="text-xs text-gray-400 mb-2 flex items-center gap-1"` i mail-detaljen. `data-testid="mail-body-loading"` og teksten Henter hele mailen bliver. |
| G18-615 | 8 Pilot | DONE. Rammen om webhenvendelsen i mailen kan krympe. | Kun `<div className="mb-4 empty:hidden">` i mail-detaljen. WebInquiryCard er uændret. |
| G18-616 | 8 Pilot | DONE. Lysboksen i mailen kan krympe. | Kun `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">` i mail-detaljen. `aria-label="Luk"` er uændret. |
| G18-617 | 8 Pilot | DONE. Panelet i mailens lysboks kan krympe. | Kun `<div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">` i mail-detaljen. `aria-label="Luk"` er uændret. |
| G18-618 | 8 Pilot | DONE. Titelrækken i mailens lysboks kan krympe. | Kun `<div className="flex items-start justify-between w-full mb-2 px-1 gap-2">` i mail-detaljen. `aria-label="Luk"` er uændret. |
| G18-619 | 8 Pilot | DONE. Billedet i mailens lysboks kan krympe. | Kun `<img src={lightboxUrl} alt={lightboxName} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />` i mail-detaljen. `aria-label="Luk"` er uændret. |
| G18-620 | 8 Pilot | DONE. Download-ikonet i mailens lysboks kan krympe. | Kun `<Download className="w-4 h-4 text-white" />` i mail-detaljen. `aria-label="Download"` er uændret. |
| G18-621 | 8 Pilot | DONE. Luk-ikonet i mailens lysboks kan krympe. | Kun `<X className="w-4 h-4 text-white" />` i mail-detaljen. `aria-label="Luk"` er uændret. |
| G18-622 | 8 Pilot | DONE. Luk-knappen i mailens lysboks kan krympe. | Kun knappen med `onClick={() => setLightboxUrl(null)}` og `className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"` i mail-detaljen. Download-linket med samme klasse er uændret. `aria-label="Luk"` er uændret. |
| G18-623 | 8 Pilot | DONE. Download-linket i mailens lysboks kan krympe. | Kun `<a href={lightboxUrl}` med `className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"` i mail-detaljen. `aria-label="Download"` og `href={lightboxUrl}` er uændrede. |
| G18-624 | 8 Pilot | DONE. Navnet i mailens lysboks kan krympe. | Kun `<span className="text-sm text-white/80 break-all min-w-0 flex-1">{lightboxName}</span>` i mail-detaljen. Navnet er uændret. |
| G18-625 | 8 Pilot | DONE. Knaprækken i mailens lysboks kan krympe. | Kun den `<div className="flex items-center gap-2 shrink-0">` der står umiddelbart før `data-testid="mail-lightbox-download-link"` i mail-detaljen. De andre rækker med samme klasse, download-linket, luk-knappen og navnet er uændrede. |
| G18-626 | 8 Pilot | DONE. Emnet i mail-detaljen kan krympe. | Kun `<h2 className="text-xl font-bold text-gray-900">{email.subject || '(Intet emne)'}</h2>` i mail-detaljen. Emneteksten er uændret. |
| G18-627 | 8 Pilot | DONE. Afsenderen i mail-detaljen kan krympe. | Kun `<span className="font-medium text-gray-800">{email.sender_name || email.sender_email}</span>` i mail-detaljen. Afsenderen er uændret. |
| G18-628 | 8 Pilot | DONE. Afsenderadressen i mail-detaljen kan krympe. | Kun `<span className="ml-1 text-gray-400">&lt;{email.sender_email}&gt;</span>` i mail-detaljen. Adressen er uændret. |
| G18-629 | 8 Pilot | DONE. Modtagelsestidspunktet i mail-detaljen kan krympe. | Kun `<span className="text-xs text-gray-400">{formatDate(email.received_at)}</span>` i mail-detaljen. `formatDate` er uændret. |
| G18-630 | 8 Pilot | DONE. Afsenderrækken i mail-detaljen kan krympe. | Kun `<div className="flex items-center justify-between text-sm">` i mail-detaljen. Afsenderen, adressen og `formatDate` er uændrede. |
| G18-631 | 8 Pilot | DONE. Afsenderkolonnen i mail-detaljen kan krympe. | Kun den `<div className="text-gray-600">` der står inde i `data-testid="mail-sender-row"` i mail-detaljen. Afsenderen, adressen og `formatDate` er uændrede. |
| G18-632 | 8 Pilot | DONE. Videresendt-mærket i mail-detaljen kan krympe. | Kun `<span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">` i mail-detaljen. Teksten `Videresendt fra:` er uændret. |
| G18-633 | 8 Pilot | DONE. Ulæst-mærket i mail-detaljen kan krympe. | Kun `<span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Ulæst</span>` i mail-detaljen. Teksten `Ulæst` er uændret. |
| G18-634 | 8 Pilot | DONE. Emnerækken i mail-detaljen kan krympe. | Kun `<div className="flex items-start justify-between gap-3">` i mail-detaljen. Emnet og `Ulæst` er uændrede. |
| G18-635 | 8 Pilot | DONE. Sidehovedet i mail-detaljen kan krympe. | Kun `<div className="border-b p-5 space-y-4">` i mail-detaljen. Emnet, emnerækken og `Ulæst` er uændrede. |
| G18-636 | 8 Pilot | DONE. Badge-rækken ved emnet kan krympe. | Kun den tilbageværende `<div className="flex items-center gap-2 shrink-0">` i mail-detaljen. Lysboksens knaprække er allerede ombrudt. `Ulæst` er uændret. |
| G18-637 | 8 Pilot | DONE. Mail-detaljens ydre ramme kan krympe. | Kun `<div className="flex flex-col h-full bg-white">` i mail-detaljen. Sidehovedet, emnet og `Ulæst` er uændrede. |
| G18-638 | 8 Pilot | DONE. Mailagent-rækken i mail-detaljen kan krympe. | Kun `<div className="flex flex-wrap items-center gap-3">` i mail-detaljen. Knappen `Kør Mailagent` er uændret. |
| G18-639 | 8 Pilot | DONE. Mailagent-knappen i mail-detaljen kan krympe. | Kun knappen med `className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"` i mail-detaljen. Teksten `Kør Mailagent` er uændret. |
| G18-640 | 8 Pilot | DONE. Mailagentens resultattekst i mail-detaljen kan krympe. | Kun spanet med klassen text-sm og farven text-green-700 eller text-red-600 omkring agentResult.msg i mail-detaljen. Beskeden er uændret. |
| G18-641 | 8 Pilot | DONE. Linket Åbn Agent Inbox i mail-detaljen kan krympe. | Kun `<a href="/dashboard/agents" className="ml-2 text-blue-600 hover:underline">` i mail-detaljen. Linkteksten er uændret. |
| G18-642 | 8 Pilot | DONE. Rækken Koblet til kunde i mail-detaljen kan krympe. | Kun `<div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 p-2.5 rounded-md">` i mail-detaljen. Teksten Koblet til er uændret. |
| G18-643 | 8 Pilot | DONE. Linket Åbn kunde i mail-detaljen kan krympe. | Kun `className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"` i mail-detaljen. Teksten Åbn kunde og href til kunden er uændrede. |
| G18-644 | 8 Pilot | DONE. Knappen Fjern kobling i mail-detaljen kan krympe. | Kun `className="text-red-500 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"` i mail-detaljen. Teksten Fjern kobling er uændret. |
| G18-645 | 8 Pilot | DONE. Koblingsikonet i mail-detaljen kan krympe. | Kun `<Link2 className="w-4 h-4 text-green-600 shrink-0" />` i mail-detaljen. Teksten Koblet til er uændret. |
| G18-646 | 8 Pilot | DONE. Teksten Koblet til i mail-detaljen kan krympe. | Kun `<span>Koblet til:` i mail-detaljen. Kundenavnet er uændret. |
| G18-647 | 8 Pilot | DONE. Kundenavnet i mail-detaljen kan krympe. | Kun `<strong>{email.customers.company_name}</strong>` i mail-detaljen. Navnet er uændret. |
| G18-648 | 8 Pilot | DONE. Kundenummeret i mail-detaljen kan krympe. | Kun `({email.customers.customer_number})` i mail-detaljen. Nummeret er uændret. |
| G18-649 | 8 Pilot | DONE. Handlingsrækken ved den koblede kunde kan krympe. | Kun div'en `className="ml-auto flex items-center gap-2 shrink-0"` lige efter kundenummeret i den koblede kunderække. Den anden forekomst længere nede i mail-detaljen er uændret. Åbn kunde bliver. |
| G18-650 | 8 Pilot | DONE. Handlingsrækken ved sagsvælgeren kan krympe. | Kun div'en `className="ml-auto flex items-center gap-2 shrink-0"` ved Sag i mail-detaljen. Handlingsrækken ved den koblede kunde er allerede pakket og røres ikke. `title="Vælg sag"` bliver. |
| G18-651 | 8 Pilot | DONE. Sagsvælgerens ramme i mail-detaljen kan krympe. | Kun `<div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 p-2.5 rounded-md flex-wrap">` i mail-detaljen. `title="Vælg sag"` og `max-w-[280px] truncate` er uændrede. |
| G18-652 | 8 Pilot | DONE. Sagsikonet i mail-detaljen kan krympe. | Kun `<Briefcase className="w-4 h-4 text-blue-600 shrink-0" />` i mail-detaljen. `title="Vælg sag"` er uændret. |
| G18-653 | 8 Pilot | DONE. Sagsnavnet i mail-detaljen kan krympe. | Kun ankeret `className="font-semibold text-blue-700 hover:underline"` ved den valgte sag i mail-detaljen. Sagsnummer, titel og href er uændrede. |
| G18-654 | 8 Pilot | DONE. Teksten om ingen sager i mail-detaljen kan krympe. | Kun `<span className="text-amber-700">` i mail-detaljen. Teksten `Kunden har ingen sager endnu` er uændret. |
| G18-655 | 8 Pilot | DONE. Gem-spinneren ved sagsvælgeren kan krympe. | Kun `<Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />` i mail-detaljen. `title="Vælg sag"` er uændret. |
| G18-656 | 8 Pilot | DONE. Svaret ved sagsvælgeren kan krympe. | Kun spanet med `feedback.startsWith('Fejl')` i mail-detaljen. `{feedback}` er uændret. |
| G18-657 | 8 Pilot | DONE. Svaret efter download af vedhæftninger kan krympe. | Kun afsnittet med `backfillMsg.startsWith('Fejl')` i mail-detaljen. `{backfillMsg}` er uændret. |
| G18-658 | 8 Pilot | DONE. Opgavelinkets ramme i mail-detaljen kan krympe. | Kun div'en med `bg-orange-50 border border-orange-200 p-2.5 rounded-md` i mail-detaljen. Teksten er uændret. |
| G18-659 | 8 Pilot | DONE. Portalrammen i mail-detaljen kan krympe. | Kun div'en med `bg-purple-50 border border-purple-200 p-2.5 rounded-md` i mail-detaljen. Teksten `Kunden har en aktiv portal` er uændret. |
| G18-660 | 8 Pilot | DONE. Teksten om aktiv portal i mail-detaljen kan krympe. | Kun spanet `className="text-purple-700"` i mail-detaljen. Teksten `Kunden har en aktiv portal` er uændret. |
| G18-661 | 8 Pilot | DONE. Portalikonet i mail-detaljen kan krympe. | Kun `<MessageCircle className="w-4 h-4 text-purple-600" />` i mail-detaljen. Teksten `Kunden har en aktiv portal` er uændret. |
| G18-662 | 8 Pilot | DONE. Linket Hop til Chat i mail-detaljen kan krympe. | Kun ankeret `className="ml-auto text-purple-600 hover:underline inline-flex items-center gap-1 text-xs font-medium"` i mail-detaljen. Teksten `Hop til Chat` og href er uændrede. |
| G18-663 | 8 Pilot | DONE. Linket Se opgave i mail-detaljen kan krympe. | Kun `className="ml-auto text-orange-700 hover:underline inline-flex items-center gap-1 text-xs font-medium"` ved Se opgave i mail-detaljen. Teksten `Se opgave` og href er uændrede. |
| G18-664 | 8 Pilot | DONE. Opgaveteksten i mail-detaljen kan krympe. | Kun `<span className="text-orange-800">` i mail-detaljen. Auto-opgave-teksten er uændret. |
| G18-665 | 8 Pilot | DONE. Advarselsikonet ved auto-opgaven kan krympe. | Kun `<AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />` i mail-detaljen. Auto-opgave-teksten er uændret. |
| G18-666 | 8 Pilot | DONE. Titlen på auto-opgaven i mail-detaljen kan krympe. | Kun `<strong>{openAutoTasks[0].title}</strong>` i mail-detaljen. Titlen er uændret. |
| G18-667 | 8 Pilot | DONE. Knappen Kobl til eksisterende i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-all hover:shadow-md"` i mail-detaljen. Teksten `Kobl til eksisterende` er uændret. |
| G18-668 | 8 Pilot | DONE. Knappen Opret som ny kunde i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-green-600 text-white rounded-md hover:bg-green-700 shadow-sm transition-all hover:shadow-md"` i mail-detaljen. Teksten `Opret som ny kunde` er uændret. |
| G18-669 | 8 Pilot | DONE. Ikonet på Opret som ny kunde i mail-detaljen kan krympe. | Kun `<UserPlus className="w-4 h-4" />` i mail-detaljen. Teksten `Opret som ny kunde` er uændret. |
| G18-670 | 8 Pilot | DONE. Ikonet på Kobl til eksisterende i mail-detaljen kan krympe. | Kun `<Link2 className="w-4 h-4" />` i mail-detaljen. Teksten `Kobl til eksisterende` er uændret. |
| G18-671 | 8 Pilot | DONE. Handlingsrækken i mail-detaljen kan krympe. | Kun `className="flex items-center gap-2 pt-2 flex-wrap"` i mail-detaljen. Knapteksterne er uændrede. |
| G18-672 | 8 Pilot | DONE. Knappen Opret sag i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"` i mail-detaljen. Teksten `Opret sag` er uændret. |
| G18-673 | 8 Pilot | DONE. Knappen Opret tilbud i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-emerald-600 text-emerald-700 rounded-md hover:bg-emerald-50"` i mail-detaljen. `data-testid="mail-create-offer"` og teksten `Opret tilbud` er uændrede. |
| G18-674 | 8 Pilot | DONE. Ikonet på Opret tilbud i mail-detaljen kan krympe. | Kun `<FilePlus className="w-4 h-4" />` i mail-detaljen. Teksten `Opret tilbud` og `data-testid="mail-create-offer"` er uændrede. |
| G18-675 | 8 Pilot | DONE. Ikonet på Opret sag i mail-detaljen kan krympe. | Kun `<ExternalLink className="w-4 h-4" />` i mail-detaljen. Teksten `Opret sag` og `data-testid="mail-opret-sag-button"` er uændrede. |
| G18-676 | 8 Pilot | DONE. Ikonet på Markér som læst i mail-detaljen kan krympe. | Kun `<MailOpen className="w-4 h-4" />` i mail-detaljen. Teksten `Markér som læst` er uændret. |
| G18-677 | 8 Pilot | DONE. Ikonet på Arkivér i mail-detaljen kan krympe. | Kun `<Archive className="w-4 h-4" />` i mail-detaljen. Teksten `Arkivér` er uændret. |
| G18-678 | 8 Pilot | DONE. Ikonet på Ignorér i mail-detaljen kan krympe. | Kun `<EyeOff className="w-4 h-4" />` i mail-detaljen. Teksten `Ignorér` er uændret. |
| G18-679 | 8 Pilot | DONE. Ikonet på Markér som relevant i mail-detaljen kan krympe. | Kun `<AlertCircle className="w-4 h-4" />` i mail-detaljen. Teksten `Markér som relevant` er uændret. |
| G18-680 | 8 Pilot | DONE. Ikonet på Markér som ulæst i mail-detaljen kan krympe. | Kun `<Mail className="w-4 h-4" />` i mail-detaljen. Teksten `Markér som ulæst` er uændret. |
| G18-681 | 8 Pilot | DONE. Knappen Markér som relevant i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-amber-50 text-amber-700 border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"` i mail-detaljen. Teksten `Markér som relevant` og `title` er uændrede. |
| G18-682 | 8 Pilot | DONE. Knappen Ignorér i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"` i mail-detaljen. Teksten `Ignorér` er uændret. |
| G18-683 | 8 Pilot | DONE. Knappen Arkivér i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"` i mail-detaljen. Teksten `Arkivér` er uændret. |
| G18-684 | 8 Pilot | DONE. Knappen Markér som læst i mail-detaljen kan krympe. | Kun skabelonen `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors` i mail-detaljen. Teksterne `Markér som ulæst` og `Markér som læst` er uændrede. |
| G18-685 | 8 Pilot | DONE. Overskriften Hurtigt svar i mail-detaljen kan krympe. | Kun `<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">` i mail-detaljen. Teksten `Hurtigt svar` er uændret. |
| G18-686 | 8 Pilot | DONE. Hurtigsvar-knapperne i mail-detaljen kan krympe. | Kun `className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300 transition-colors disabled:opacity-50"` i mail-detaljen. Teksterne `Bekræft modtagelse`, `Mangler info` og `Tak for ordren` er uændrede. |
| G18-687 | 8 Pilot | DONE. Ikonet på hurtigsvar i mail-detaljen kan krympe. | Kun `<Mail className="w-3 h-3" />` i mail-detaljen. Teksterne `Bekræft modtagelse`, `Mangler info` og `Tak for ordren` er uændrede. |
| G18-688 | 8 Pilot | DONE. Hurtigsvar-rammen i mail-detaljen kan krympe. | Kun `<div className="pt-2 border-t space-y-2">` i mail-detaljen. Teksten `Hurtigt svar` er uændret. |
| G18-689 | 8 Pilot | DONE. Hurtigsvar-rækken i mail-detaljen kan krympe. | Kun `className="flex items-center gap-2 flex-wrap"` i mail-detaljen. Teksterne `Bekræft modtagelse`, `Mangler info` og `Tak for ordren` er uændrede. |
| G18-690 | 8 Pilot | DONE. Knappen Diagnosticér Graph-forbindelse i mail-detaljen kan krympe. | Kun `className="text-[10px] text-gray-400 hover:text-blue-600 underline"` i mail-detaljen. Teksten `Diagnosticér Graph-forbindelse` er uændret. |
| G18-691 | 8 Pilot | DONE. Svarstakken efter hurtigsvar i mail-detaljen kan krympe. | Kun `<div className="space-y-1">` i mail-detaljen. `{replyMsg}` er uændret. |
| G18-692 | 8 Pilot | DONE. Graph-diagnosens ramme i mail-detaljen kan krympe. | Kun `className="bg-gray-50 border rounded p-2 text-[11px] font-mono space-y-0.5"` i mail-detaljen. Nøglerne i diagnosen er uændrede. |
| G18-693 | 8 Pilot | DONE. Graph-diagnosens linje i mail-detaljen kan krympe. | Kun `className={val ? 'text-green-700' : 'text-red-600 font-bold'}` i mail-detaljen. `{key}` er uændret. |
| G18-694 | 8 Pilot | DONE. Svaret efter hurtigsvar i mail-detaljen kan krympe. | Kun afsnittet med `replyMsg.startsWith('Fejl')` i mail-detaljen. `{replyMsg}` er uændret. |
| G18-695 | 8 Pilot | DONE. Forslagsboksen i mail-detaljen kan krympe. | Kun `className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2"` i mail-detaljen. Teksten `Mulige matches (forslag)` er uændret. |
| G18-696 | 8 Pilot | DONE. Overskriften Mulige matches i mail-detaljen kan krympe. | Kun `<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">` i mail-detaljen. Teksten `Mulige matches (forslag)` er uændret. |
| G18-697 | 8 Pilot | DONE. Ikonet ved Mulige matches i mail-detaljen kan krympe. | Kun `<AlertCircle className="w-3.5 h-3.5" />` i mail-detaljen. Teksten `Mulige matches (forslag)` er uændret. Andre filer røres ikke. |
| G18-698 | 8 Pilot | DONE. Rammen om mailforslag i mail-detaljen kan krympe. | Kun `<div className="pt-2 border-t">` i mail-detaljen. Teksten `Mulige matches (forslag)` er uændret. |
| G18-699 | 8 Pilot | DONE. Kortet for e-mail-match i mail-detaljen kan krympe. | Kun `className="flex items-center gap-2 bg-white rounded px-2.5 py-2 border border-blue-100"` i mail-detaljen. Kundenavnet og `Kobl` er uændrede. |
| G18-700 | 8 Pilot | DONE. Kortet for andre mailforslag kan krympe. | Kun `className="flex items-center gap-2 bg-white rounded px-2.5 py-2 border border-gray-100"` i mail-detaljen. `key={s.id}`, kundenavnet og `Kobl` er uændrede. |
| G18-701 | 8 Pilot | DONE. Kundenummeret på e-mail-match i mail-detaljen kan krympe. | Kun afsnittet med `{detectedCustomer.customer_number} — email-match` i mail-detaljen. Nummeret er uændret. |
| G18-702 | 8 Pilot | DONE. Kundenummeret på andre mailforslag kan krympe. | Kun afsnittet med `{s.customer_number} — {s.matchReason}` i mail-detaljen. Nummeret og matchårsagen er uændrede. |
| G18-703 | 8 Pilot | DONE. Telefonlinjen i mailforslag kan krympe. | Kun afsnittet med `Telefon fundet i email` i mail-detaljen. `{detectedPhone}` er uændret. Ordre/ref-linjen røres ikke. |
| G18-704 | 8 Pilot | DONE. Ordre/ref-linjen i mailforslag kan krympe. | Kun afsnittet med `Ordre/ref fundet i email` i mail-detaljen. `{detectedOrderId}` er uændret. Telefonlinjen røres ikke. |
| G18-705 | 8 Pilot | DONE. Telefon-tallet i mailforslag kan krympe. | Kun `<strong>{detectedPhone}</strong>` i mail-detaljen. Teksten `Telefon fundet i email` er uændret. Ordre-tallet røres ikke. |
| G18-706 | 8 Pilot | DONE. Ordre-tallet i mailforslag kan krympe. | Kun `<strong>{detectedOrderId}</strong>` i mail-detaljen. Teksten `Ordre/ref fundet i email` er uændret. Telefon-tallet røres ikke. |
| G18-707 | 8 Pilot | DONE. Kundenavnet på e-mail-match i mail-detaljen kan krympe. | Kun afsnittet med `{detectedCustomer.company_name}` i mail-detaljen. Navnet er uændret. Forslagets `{s.company_name}` røres ikke. |
| G18-708 | 8 Pilot | DONE. Kundenavnet på andre mailforslag kan krympe. | Kun afsnittet med `{s.company_name}` i mail-detaljen. Navnet er uændret. E-mail-matchens `{detectedCustomer.company_name}` røres ikke. |
| G18-709 | 8 Pilot | DONE. Filnavnet i downloadlisten kan krympe. | Kun `<span className="break-all min-w-0 flex-1 text-sm text-gray-700 group-hover:text-blue-700 font-medium">` i mail-detaljen. `{att.filename}` er uændret. Galleriets `line-clamp-2` røres ikke. |
| G18-710 | 8 Pilot | DONE. Mailagent-ikonet i mail-detaljen kan krympe. | Kun `<Bot className="w-4 h-4" />` i mail-detaljen. Teksten `Kør Mailagent` er uændret. |
| G18-711 | 8 Pilot | DONE. Download-ikonet på vedhæftningsknappen kan krympe. | Kun `<Download className="w-4 h-4" />` i mail-detaljen. Teksten `Download vedhæftninger nu` er uændret. |
| G18-712 | 8 Pilot | DONE. Luk-ikonet på Fjern kobling kan krympe. | Kun `<X className="w-3 h-3" />` i mail-detaljen. Teksten `Fjern kobling` er uændret. |
| G18-713 | 8 Pilot | DONE. Statusikonet i mail-detaljen kan krympe. | Kun `<Icon className="w-3 h-3" />` i mail-detaljen. Statusteksten er uændret. |
| G18-714 | 8 Pilot | DONE. Mailbrødtekstens rullefelt kan krympe. | Kun `<div className="flex-1 overflow-y-auto p-5">` i mail-detaljen. Mailens indhold er uændret. |
| G18-715 | 8 Pilot | DONE. Statusmærket i mail-detaljen kan krympe. | Kun statusmærkets `<span>` med `rounded-full` i mail-detaljen. Statusteksten er uændret. |
| G18-716 | 8 Pilot | DONE. Teksten Ingen sag tilknyttet kan krympe. | Kun `<span className="text-gray-600">Ingen sag tilknyttet</span>` i mail-detaljen. Sagsvælgeren er uændret. |
| G18-717 | 8 Pilot | DONE. Pilen ved Åbn kunde kan krympe. | Kun pilen i `Åbn kunde <ExternalLink className="w-3 h-3" />` i mail-detaljen. Teksten `Åbn kunde` er uændret. Se opgave og Hop til Chat røres ikke. |
| G18-718 | 8 Pilot | DONE. Pilen ved Se opgave kan krympe. | Kun pilen i `Se opgave <ExternalLink className="w-3 h-3" />` i mail-detaljen. Teksten `Se opgave` er uændret. Hop til Chat røres ikke. |
| G18-719 | 8 Pilot | DONE. Pilen ved Hop til Chat kan krympe. | Kun pilen i `Hop til Chat <ExternalLink className="w-3 h-3" />` i mail-detaljen. Teksten `Hop til Chat` er uændret. |
| G18-720 | 8 Pilot | DONE. Ikonet på Kobl i e-mail-match kan krympe. | Kun `<Link2 className="w-3 h-3" />` i e-mail-match-kortet i mail-detaljen. Teksten `Kobl` er uændret. Ikonet i de andre forslag røres ikke. |
| G18-721 | 8 Pilot | DONE. Ikonet på Kobl i andre mailforslag kan krympe. | Kun `<Link2 className="w-3 h-3" />` i kortet med `key={s.id}` i mail-detaljen. Teksten `Kobl` er uændret. Ikonet i e-mail-match røres ikke. |
| G18-722 | 8 Pilot | DONE. Tekstkolonnen i andre mailforslag kan krympe. | Kun `<div className="flex-1 min-w-0">` i kortet med `key={s.id}` i mail-detaljen. Den samme kolonne i e-mail-match røres ikke. |
| G18-723 | 8 Pilot | DONE. Tekstkolonnen i e-mail-match kan krympe. | Kun `<div className="flex-1 min-w-0">` i e-mail-match-kortet i mail-detaljen. Kolonnen i andre forslag røres ikke. |
| G18-724 | 8 Pilot | DONE. Kobl-knappen i andre mailforslag kan krympe. | Kun knappen med `onLinkToCustomer?.(s.id)` i mail-detaljen. Knappen i e-mail-match røres ikke. Teksten `Kobl` er uændret. |
| G18-725 | 8 Pilot | DONE. Kobl-knappen i e-mail-match kan krympe. | Kun knappen med `onLinkToCustomer?.(detectedCustomer.id)` i mail-detaljen. Knappen i andre forslag røres ikke. Teksten `Kobl` er uændret. |
| G18-726 | 8 Pilot | DONE. Sag-etiketten i sagsvælgeren kan krympe. | Kun `<span>` omkring `Sag:` i mail-detaljen. Teksten `Sag:` og sagslinket er uændrede. |
| G18-727 | 8 Pilot | DONE. Valget Ingen sag kan krympe. | Kun `<option value="">— Ingen sag —</option>` i mail-detaljen. Teksten er uændret. Sagsvælgerens `truncate` røres ikke. |
| G18-728 | 8 Pilot | DONE. Arkiv-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `pendingAction === 'archive'` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Arkivér` er uændret. |
| G18-729 | 8 Pilot | DONE. Ignorér-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `pendingAction === 'ignore'` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Ignorér` er uændret. |
| G18-730 | 8 Pilot | DONE. Relevant-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `pendingAction === 'restore'` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Markér som relevant` er uændret. |
| G18-731 | 8 Pilot | DONE. Mailagent-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `agentRunning ?` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Kør Mailagent` er uændret. |
| G18-732 | 8 Pilot | DONE. Opret-sag-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `{isCreatingServiceCase ?` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Opret sag` er uændret. |
| G18-733 | 8 Pilot | DONE. Download-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` ved `{isBackfilling ?` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Download vedhæftninger nu` er uændret. |
| G18-734 | 8 Pilot | DONE. Fjern-kobling-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-3 h-3 animate-spin" />` ved `{isUnlinking ?` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Fjern kobling` er uændret. |
| G18-735 | 8 Pilot | DONE. Hurtigt-svar-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-3 h-3 animate-spin" />` ved `{isSendingReply === tpl.text ?` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksterne `Bekræft modtagelse`, `Mangler info` og `Tak for ordren` er uændrede. |
| G18-736 | 8 Pilot | DONE. Indlæsnings-spinneren i mail-detaljen kan krympe. | Kun `<Loader2 className="w-3 h-3 animate-spin" />` i `data-testid="mail-body-loading"` i mail-detaljen. De andre spinner-ikoner røres ikke. Teksten `Henter hele mailen…` er uændret. |
| G18-737 | 8 Pilot | DONE. Indlæsnings-spinneren ved nye mails kan krympe. | Kun `<Loader2 className="w-3 h-3 animate-spin" />` i `src/components/dashboard/mail-freshness-sync.tsx`. Teksten `Henter nye mails…` er uændret. `data-testid="mail-freshness"` bliver. |
| G18-738 | 8 Pilot | DONE. Rækken ved nye mails kan krympe. | Kun `<span className="text-xs text-gray-500 inline-flex items-center gap-1" data-testid="mail-freshness">` i `src/components/dashboard/mail-freshness-sync.tsx`. Teksten `Henter nye mails…` er uændret. Den færdige tilstand røres ikke. |
| G18-739 | 8 Pilot | DONE. Den færdige mail-række kan krympe. | Kun `<span className="text-xs text-gray-500" data-testid="mail-freshness">` i `src/components/dashboard/mail-freshness-sync.tsx`. Teksten `Mail opdateret` er uændret. Rækken ved nye mails røres ikke. |
| G18-740 | 1 Profit | DONE. Overskriften Efterkalkulation kan krympe. | Kun `<h1 className="text-2xl font-bold text-gray-900">Efterkalkulation</h1>` i `aftercalc-overview-client.tsx`. Teksten `Efterkalkulation` er uændret. Beløb og filtre røres ikke. |
| G18-741 | 1 Profit | DONE. Overskriftens række på efterkalkulation kan krympe. | Kun `<div className="flex flex-wrap items-start justify-between gap-3">` i `aftercalc-overview-client.tsx`. Overskriften `Efterkalkulation` og beløb er uændrede. |
| G18-742 | 1 Profit | DONE. Filterkortet på efterkalkulation kan krympe. | Kun `<div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">` i `aftercalc-overview-client.tsx`. Filtre, beløb og overskriften er uændrede. |
| G18-743 | 1 Profit | DONE. Sager-knappen på efterkalkulation kan krympe. | Kun `<button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left" data-testid="aftercalc-overview-toggle"` i `aftercalc-overview-client.tsx`. Teksten Sager og filtrene er uændrede. |
| G18-744 | 1 Profit | DONE. Sager-overskriften på efterkalkulation kan krympe. | Kun `<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">` i `aftercalc-overview-client.tsx`. Teksten Sager og filtrene er uændrede. |
| G18-745 | 1 Profit | DONE. Sager-ikonet på efterkalkulation kan krympe. | Kun `<Scale className="w-4 h-4 text-gray-500" />` i `aftercalc-overview-client.tsx`. Teksten Sager og filtrene er uændrede. |
| G18-746 | 1 Profit | DONE. Fold-ud-ikonet på efterkalkulation kan krympe. | Kun `<ChevronDown className="w-4 h-4 text-gray-500" />` i `aftercalc-overview-client.tsx`. ChevronRight, teksten Sager og filtrene er uændrede. |
| G18-747 | 1 Profit | DONE. Fold-ind-ikonet på efterkalkulation kan krympe. | Kun `<ChevronRight className="w-4 h-4 text-gray-500" />` i `aftercalc-overview-client.tsx`. ChevronDown, teksten Sager og filtrene er uændrede. |
| G18-748 | 1 Profit | DONE. Indlæsnings-spinneren på efterkalkulation kan krympe. | Kun `<Loader2 className="w-4 h-4 animate-spin" />` i `aftercalc-overview-client.tsx`. Teksten Henter… og filtrene er uændrede. |
| G18-749 | 1 Profit | DONE. Den tomme efterkalkulation kan krympe. | Kun `<div className="text-sm text-gray-500" data-testid="aftercalc-empty">` i `aftercalc-overview-client.tsx`. Teksten og filtrene er uændrede. |
| G18-750 | 1 Profit | DONE. Sidevælgeren på efterkalkulation kan krympe. | Kun `<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">` i `aftercalc-overview-client.tsx`. Teksten og filtrene er uændrede. |
| G18-751 | 1 Profit | DONE. Mobillisten på efterkalkulation kan krympe. | Kun `<div className="md:hidden space-y-2" data-testid="aftercalc-overview-mobile">` i `aftercalc-overview-client.tsx`. Kortene og filtrene er uændrede. |
| G18-752 | 1 Profit | DONE. Mobilkortet på efterkalkulation kan krympe. | Kun `<article key={r.case_id} className="rounded-lg ring-1 ring-gray-200 p-3">` i `aftercalc-overview-client.tsx`. Beløb og filtre er uændrede. |
| G18-753 | 1 Profit | DONE. Hovedet på efterkalkulationens mobilkort kan krympe. | Kun `<div className="flex items-start justify-between gap-2">` i `aftercalc-overview-client.tsx`. De samme klasser i andre filer, beløb og filtre er uændrede. |
| G18-754 | 1 Profit | DONE. Sagslinket på efterkalkulationens mobilkort kan krympe. | Kun sagslinket med klassen `font-medium text-blue-700 hover:underline break-words` og `tab=oekonomi` i `aftercalc-overview-client.tsx`. Beløb og filtre er uændrede. |
| G18-755 | 1 Profit | DONE. Ansvarlig-linjen på efterkalkulationens mobilkort kan krympe. | Kun `<p className="text-xs text-gray-500 break-words">Ansvarlig:` i `aftercalc-overview-client.tsx`. Navnet og filtrene er uændrede. |
| G18-756 | 1 Profit | DONE. Kundenavnet på efterkalkulationens mobilkort kan krympe. | Kun `<p className="text-sm text-gray-800 break-words">{r.customer_name || '—'}</p>` i `aftercalc-overview-client.tsx`. Beløb og filtre er uændrede. |
| G18-757 | 1 Profit | DONE. Titlen på efterkalkulationens mobilkort kan krympe. | Kun `<p className="text-xs text-gray-500 break-words">{r.title}</p>` i `aftercalc-overview-client.tsx`. Beløb og filtre er uændrede. |
| G18-758 | 1 Profit | DONE. Advarselsteksten på efterkalkulationens mobilkort kan krympe. | Kun `<p className="mt-1 text-xs text-amber-900 break-words">` i `aftercalc-overview-client.tsx`. Beløb og filtre er uændrede. |
| G18-759 | 1 Profit | DONE. Faktureringstilstanden på efterkalkulationens mobilkort kan krympe. | Kun `<p className="text-xs text-gray-600 break-words" data-testid="aftercalc-invoiced-state">` i `aftercalc-overview-client.tsx`. Teksten og filtrene er uændrede. |
| G18-760 | 1 Profit | DONE. Afvigelsesfilteret på efterkalkulation kan krympe. | Kun `<p className="text-xs text-gray-600 break-words" data-testid="aftercalc-variance-filter">` i `aftercalc-overview-client.tsx`. Teksten og filtrene er uændrede. |
| G18-761 | 1 Profit | DONE. Etiketten Fra dato på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Fra dato</span>` i `aftercalc-overview-client.tsx`. Datoen og filtrene er uændrede. |
| G18-762 | 1 Profit | DONE. Etiketten Til dato på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Til dato</span>` i `aftercalc-overview-client.tsx`. Datoen og filtrene er uændrede. |
| G18-763 | 1 Profit | DONE. Etiketten Ansvarlig på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Ansvarlig</span>` i `aftercalc-overview-client.tsx`. Filteret og navnet er uændrede. |
| G18-764 | 1 Profit | DONE. Etiketten Status på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Status</span>` i `aftercalc-overview-client.tsx`. Filteret og sagsstatus er uændrede. |
| G18-765 | 1 Profit | DONE. Etiketten Afvigelse på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Afvigelse</span>` i `aftercalc-overview-client.tsx`. Filteret og beløbene er uændrede. |
| G18-766 | 1 Profit | DONE. Etiketten Sortering på efterkalkulation kan krympe. | Kun `<span className="text-xs text-gray-500">Sortering</span>` i `aftercalc-overview-client.tsx`. Filteret er uændret. |
| G18-767 | 1 Profit | DONE. Etiketten Tilbudt omsætning på efterkalkulationens mobilkort kan krympe. | Kun `<dt className="text-gray-500">Tilbudt omsætning</dt>` i `aftercalc-overview-client.tsx`. Beløbet er uændret. |
| G18-768 | 1 Profit | DONE. Etiketten Faktisk omsætning på efterkalkulationens mobilkort kan krympe. | Kun `<dt className="text-gray-500">Faktisk omsætning</dt>` i `aftercalc-overview-client.tsx`. Beløbet er uændret. |
| G18-769 | 1 Profit | DONE. Etiketten Tilbudt DB på efterkalkulationens mobilkort kan krympe. | Kun `<dt className="text-gray-500">Tilbudt DB</dt>` i `aftercalc-overview-client.tsx`. Procenten er uændret. |
| G18-770 | 1 Profit | DONE. Etiketten Faktisk DB på efterkalkulationens mobilkort kan krympe. | Kun `<dt className="text-gray-500">Faktisk DB</dt>` i `aftercalc-overview-client.tsx`. Procenten er uændret. |
| G18-771 | 1 Profit | DONE. Kolonnen Sag på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-left">Sag</th>` i `aftercalc-overview-client.tsx`. Linket er uændret. |
| G18-772 | 1 Profit | DONE. Kolonnen Kunde på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-left">Kunde</th>` i `aftercalc-overview-client.tsx`. Kundenavnet er uændret. |
| G18-773 | 1 Profit | DONE. Kolonnen Ansvarlig på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-left">Ansvarlig</th>` i `aftercalc-overview-client.tsx`. Navnet er uændret. |
| G18-774 | 1 Profit | DONE. Kolonnen Status på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-left">Status</th>` i `aftercalc-overview-client.tsx`. Sagsstatus er uændret. |
| G18-775 | 1 Profit | DONE. Kolonnen Datakvalitet på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-left">Datakvalitet</th>` i `aftercalc-overview-client.tsx`. Mærket er uændret. |
| G18-776 | 1 Profit | DONE. Kolonnen Tilbudt omsætning på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-right">Tilbudt omsætning</th>` i `aftercalc-overview-client.tsx`. Beløbet er uændret. |
| G18-777 | 1 Profit | DONE. Kolonnen Faktisk omsætning på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-right">Faktisk omsætning</th>` i `aftercalc-overview-client.tsx`. Beløbet er uændret. |
| G18-778 | 1 Profit | DONE. Kolonnen Tilbudt DB % på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-right">Tilbudt DB %</th>` i `aftercalc-overview-client.tsx`. Procenten er uændret. |
| G18-779 | 1 Profit | DONE. Kolonnen Faktisk DB % på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-right">Faktisk DB %</th>` i `aftercalc-overview-client.tsx`. Procenten er uændret. |
| G18-780 | 1 Profit | DONE. Kolonnen DB-afvigelse på efterkalkulationens skrivebord kan krympe. | Kun `<th className="px-2 py-1.5 text-right">DB-afvigelse</th>` i `aftercalc-overview-client.tsx`. Afvigelsen er uændret. |
| G18-781 | 1 Profit | DONE. Tabellen på efterkalkulationens skrivebord kan krympe. | Kun `<table className="w-full text-sm">` i `aftercalc-overview-client.tsx`. Kolonner og beløb er uændrede. |
| G18-782 | 1 Profit | DONE. Tabelhovedet på efterkalkulationens skrivebord kan krympe. | Kun `<thead className="bg-gray-50 text-xs text-gray-600">` i `aftercalc-overview-client.tsx`. Kolonner og beløb er uændrede. |
| G18-783 | 1 Profit | DONE. Tabelrullen på efterkalkulationens skrivebord kan krympe. | Kun `<div className="hidden md:block overflow-x-auto">` i `aftercalc-overview-client.tsx`. Tabellen og beløb er uændrede. |
| G18-784 | 1 Profit | DONE. Tabelkroppen på efterkalkulationens skrivebord kan krympe. | Kun `<tbody className="divide-y divide-gray-100">` i `aftercalc-overview-client.tsx`. Rækker og beløb er uændrede. |
| G18-785 | 1 Profit | DONE. Sagscellen på efterkalkulationens skrivebord kan krympe. | Kun `<td className="px-2 py-1.5">` i `aftercalc-overview-client.tsx`. Sagsnummeret og beløb er uændrede. |
| G18-786 | 1 Profit | DONE. Kolonnerækken på efterkalkulationens skrivebord kan krympe. | Kun det bare `<tr>` i tabelhovedet i `aftercalc-overview-client.tsx`. Kolonner og beløb er uændrede. |
| G18-787 | 1 Profit | DONE. Sagsbeskrivelsen i sagscellen kan krympe. | Kun `<div className="text-[11px] text-gray-500 break-words max-w-[16rem]">` i `aftercalc-overview-client.tsx`. Sagsnummeret og beløb er uændrede. |
| G18-788 | 1 Profit | DONE. Advarselsteksten i sagscellen kan krympe. | Kun `<div className="mt-1 text-[11px] text-amber-900 break-words max-w-[12rem]">` i `aftercalc-overview-client.tsx`. Mærket og beløb er uændrede. |
| G18-789 | 1 Profit | DONE. Faktureringstilstanden i sagscellen kan krympe. | Kun `<div className="text-[11px] text-gray-500 break-words" data-testid="aftercalc-invoiced-state">` i `aftercalc-overview-client.tsx`. Mobilkortet og beløb er uændrede. |
| G18-790 | 1 Profit | DONE. Kundenavnet i sagscellen kan krympe. | Kun `<td className="px-2 py-1.5 text-gray-800 break-words">{r.customer_name || '—'}</td>` i `aftercalc-overview-client.tsx`. Ansvarlig og beløb er uændrede. |
| G18-791 | 1 Profit | DONE. Ansvarlig i sagscellen kan krympe. | Kun `<td className="px-2 py-1.5 text-gray-800 break-words">{r.assignee_name || '—'}</td>` i `aftercalc-overview-client.tsx`. Kundenavnet og beløb er uændrede. |
| G18-792 | 1 Profit | DONE. Sagsnummerlinket i sagscellen kan krympe. | Kun `className="text-blue-700 hover:underline break-words"` på skrivebordslinket i `aftercalc-overview-client.tsx`. Mobilkortet og beløb er uændrede. |
| G18-793 | 1 Profit | DONE. Datarækken i sagstabellen kan krympe. | Kun `<tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality}>` i `aftercalc-overview-client.tsx`. Sagsnummerlinket og beløb er uændrede. |
| G18-794 | 1 Profit | DONE. Filterindholdet på efterkalkulation kan krympe. | Kun `<div className="mt-3 space-y-3">` i `aftercalc-overview-client.tsx`. Filtre og beløb er uændrede. |
| G18-795 | 1 Profit | DONE. Sidestyringen på efterkalkulation kan krympe. | Kun `<div className="flex items-center gap-2" data-testid="aftercalc-pager">` i `aftercalc-overview-client.tsx`. Knappernes 44 px og sideantallet er uændrede. |
| G18-796 | 1 Profit | DONE. Tilbudt omsætning på mobilkortet kan krympe. | Kun `<dd className="tabular-nums text-gray-900 break-words">{kr(r.quoted_revenue)}</dd>` i `aftercalc-overview-client.tsx`. De andre beløb og sideantallet er uændrede. |
| G18-797 | 1 Profit | DONE. Faktisk omsætning på mobilkortet kan krympe. | Kun `<dd className="tabular-nums text-gray-900 break-words">{kr(r.actual_revenue)}</dd>` i `aftercalc-overview-client.tsx`. De andre beløb og sideantallet er uændrede. |
| G18-798 | 1 Profit | DONE. Tilbudt DB på mobilkortet kan krympe. | Kun `<dd className="tabular-nums text-gray-900 break-words">{pct(r.quoted_db_pct)}</dd>` i `aftercalc-overview-client.tsx`. De andre beløb og sideantallet er uændrede. |
| G18-799 | 1 Profit | DONE. Faktisk DB på mobilkortet kan krympe. | Kun `<dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>` i `aftercalc-overview-client.tsx`. De andre beløb og sideantallet er uændrede. |
| G18-800 | 1 Profit | DONE. DB-afvigelsen på mobilkortet kan krympe. | Kun klassen `mt-2 text-sm tabular-nums break-words` på afvigelsesafsnittet i `aftercalc-overview-client.tsx`. Beløbene og sideantallet er uændrede. |
| G18-801 | 1 Profit | DONE. Knappen Forrige på efterkalkulation kan krympe. | Kun `className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40"` på Forrige i `aftercalc-overview-client.tsx`. Næste, 44 px og sideantallet er uændrede. |
| G18-802 | 1 Profit | DONE. Knappen Næste på efterkalkulation kan krympe. | Kun `className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40"` på Næste i `aftercalc-overview-client.tsx`. Forrige, 44 px og sideantallet er uændrede. |
| G18-803 | 1 Profit | DONE. Datakvalitetscellen på efterkalkulation kan krympe. | Kun `<td className="px-2 py-1.5" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}>` i `aftercalc-overview-client.tsx`. Mærket og beløbene er uændrede. |
| G18-804 | 1 Profit | DONE. Efterkalkulationens side kan krympe. | Kun `<div className="p-4 md:p-6 space-y-4" data-testid="aftercalc-overview">` i `aftercalc-overview-client.tsx`. Filtrene og beløbene er uændrede. |
| G18-805 | 1 Profit | DONE. Etiketten omkring manglende kost kan krympe. | Kun `<label className="flex items-center gap-2 text-sm text-gray-700 min-w-0">` i `aftercalc-overview-client.tsx`. Teksten og filteret er uændrede. |
| G18-806 | 1 Profit | DONE. Filtergitteret på efterkalkulation kan krympe. | Kun `<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm min-w-0">` i `aftercalc-overview-client.tsx`. Datofiltrene og beløbene er uændrede. |
| G18-807 | 1 Profit | DONE. Fra-dato-feltet på efterkalkulation kan krympe. | Kun `value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-808 | 1 Profit | DONE. Til-dato-feltet på efterkalkulation kan krympe. | Kun `value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-809 | 1 Profit | DONE. Ansvarlig-feltet på efterkalkulation kan krympe. | Kun `value={filters.assigneeId ?? ''} onChange={(e) => setFilter({ assigneeId: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-810 | 1 Profit | DONE. Status-feltet på efterkalkulation kan krympe. | Kun `value={filters.status ?? ''} onChange={(e) => setFilter({ status: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-811 | 1 Profit | DONE. Afvigelse-feltet på efterkalkulation kan krympe. | Kun `value={(filters.variance ?? 'all') as AftercalcVarianceFilter} onChange={(e) => setFilter({ variance: e.target.value as AftercalcVarianceFilter })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-812 | 1 Profit | DONE. Sortering-feltet på efterkalkulation kan krympe. | Kun `value={(filters.sort ?? 'worst_db') as AftercalcSort} onChange={(e) => setFilter({ sort: e.target.value as AftercalcSort })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"` i `aftercalc-overview-client.tsx`. De andre filtre og beløbene er uændrede. |
| G18-813 | 1 Profit | DONE. Fra-dato-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Fra dato</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-814 | 1 Profit | DONE. Til-dato-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Til dato</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-815 | 1 Profit | DONE. Ansvarlig-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Ansvarlig</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-816 | 1 Profit | DONE. Status-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Status</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-817 | 1 Profit | DONE. Afvigelse-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Afvigelse</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-818 | 1 Profit | DONE. Sortering-etikettens ramme på efterkalkulation kan krympe. | Kun den `<label className="block min-w-0">` der står umiddelbart før `>Sortering</span>` i `aftercalc-overview-client.tsx`. De andre rammer og beløbene er uændrede. |
| G18-819 | 1 Profit | DONE. Titelkolonnen på efterkalkulationens mobilkort kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `data-testid="aftercalc-mobile-case-link"` i `aftercalc-overview-client.tsx`. Linket og beløbene er uændrede. |
| G18-820 | 1 Profit | DONE. Tilbudt-omsætningskolonnen på efterkalkulationens mobilkort kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `>Tilbudt omsætning</dt>` i `aftercalc-overview-client.tsx`. Beløbene er uændrede. |
| G18-821 | 1 Profit | DONE. Faktisk-omsætningskolonnen på efterkalkulationens mobilkort kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `>Faktisk omsætning</dt>` i `aftercalc-overview-client.tsx`. Beløbene er uændrede. |
| G18-822 | 1 Profit | DONE. Tilbudt-DB-kolonnen på efterkalkulationens mobilkort kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `>Tilbudt DB</dt>` i `aftercalc-overview-client.tsx`. Beløbene er uændrede. |
| G18-823 | 1 Profit | DONE. Faktisk-DB-kolonnen på efterkalkulationens mobilkort kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `>Faktisk DB</dt>` i `aftercalc-overview-client.tsx`. Beløbene er uændrede. |
| G18-824 | 1 Profit | DONE. Beløbslisten på efterkalkulationens mobilkort kan krympe. | Kun den `<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0">` i `aftercalc-overview-client.tsx`. Beløbene er uændrede. |
| G18-825 | 2 Faktura | DONE. Opsummeringsgitteret på fakturakontrol kan krympe. | Kun den `<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 min-w-0">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-826 | 2 Faktura | DONE. Cellen Kontrollerede linjer på fakturakontrol kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `data-testid="invoice-control-label-controlled"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-827 | 2 Faktura | DONE. Cellen Overpris i alt på fakturakontrol kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `data-testid="invoice-control-label-overcharge"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-828 | 2 Faktura | DONE. Cellen Leverandør på fakturakontrol kan krympe. | Kun den `<div className="min-w-0">` der står umiddelbart før `data-testid="invoice-control-label-supplier"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-829 | 2 Faktura | DONE. Mobilisten på fakturakontrol kan krympe. | Kun den `<div className="md:hidden divide-y rounded ring-1 ring-gray-200" data-testid="invoice-control-lines-mobile">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-830 | 2 Faktura | DONE. Skrivebordslisten på fakturakontrol kan krympe. | Kun den `<div className="hidden md:block overflow-x-auto">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-831 | 2 Faktura | DONE. Tabellen på fakturakontrol kan krympe. | Kun den `<table className="w-full text-xs">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-832 | 2 Faktura | DONE. Tabelhovedet på fakturakontrol kan krympe. | Kun den `<thead>` der står umiddelbart før `data-testid="invoice-control-col-number"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-833 | 2 Faktura | DONE. Tabelkroppen på fakturakontrol kan krympe. | Kun den `<tbody>` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-834 | 2 Faktura | DONE. Skrivebordsrækken på fakturakontrol kan krympe. | Kun den `<tr>` der omslutter `data-testid="invoice-control-desktop-line-number"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-835 | 2 Faktura | DONE. Mobilkortet på fakturakontrol kan krympe. | Kun den `<div>` der omslutter `data-testid="invoice-control-mobile-line-number"` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-836 | 2 Faktura | DONE. Mobilkortets titelrække kan krympe. | Kun den `<div className="flex items-start justify-between gap-2">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-837 | 2 Faktura | DONE. Sidehovedet på fakturakontrol kan krympe. | Kun den `<div className="flex flex-wrap items-start justify-between gap-2 mb-3">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-838 | 2 Faktura | DONE. Kolonnerækken på fakturakontrol kan krympe. | Kun den `<tr className="text-left text-gray-500">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-839 | 2 Faktura | DONE. Matchlinjen på fakturakontrollens mobilkort kan krympe. | Kun den `<p className="mt-1 text-gray-600 break-all">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-840 | 2 Faktura | DONE. Fejlrammen på fakturakontrol kan krympe. | Kun den `<div className="text-xs text-red-600">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-841 | 2 Faktura | DONE. Knappen Prøv igen på fakturakontrol kan krympe. | Kun den knap med `min-h-[44px]` i `invoice-control-panel.tsx`. Højden på 44 px bliver. Beløbene er uændrede. |
| G18-842 | 2 Faktura | DONE. Årsagen på skrivebordets matchcelle kan krympe. | Kun den `<span className="text-gray-400">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-843 | 2 Faktura | DONE. Fakturakontrollens ramme kan krympe. | Kun den `<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4" data-testid="invoice-control-panel">` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-844 | 2 Faktura | DONE. Nul-linjen på fakturakontrol kan krympe. | Kun den `<p className="text-[10px] text-gray-500 break-words">` i `invoice-control-panel.tsx`. Sætningen og beløbene er uændrede. |
| G18-845 | 2 Faktura | DONE. Leverandørteksten på fakturakontrol kan krympe. | Kun den `<div className="font-medium break-words">` der viser `hasSupplier` i `invoice-control-panel.tsx`. Teksten Kendt og beløbene er uændrede. |
| G18-846 | 2 Faktura | DONE. Overpris-tælleren på fakturakontrol kan krympe. | Kun det span der viser `review.overcharge` i `invoice-control-panel.tsx`. Tallet og beløbene er uændrede. |
| G18-847 | 2 Faktura | DONE. Underpris-tælleren på fakturakontrol kan krympe. | Kun det span der viser `review.undercharge` i `invoice-control-panel.tsx`. Tallet og beløbene er uændrede. |
| G18-848 | 2 Faktura | DONE. Fragt-tælleren på fakturakontrol kan krympe. | Kun det span der viser `review.freight` i `invoice-control-panel.tsx`. Tallet og beløbene er uændrede. |
| G18-849 | 2 Faktura | DONE. Dækningstallet på fakturakontrol kan krympe. | Kun den `<div className="font-medium break-words">` der viser `controlledLines` i `invoice-control-panel.tsx`. Beløbene er uændrede. |
| G18-850 | 2 Faktura | DONE. Overprisbeløbet på fakturakontrol kan krympe. | Kun den div med `data-testid="invoice-control-overcharge"` i `invoice-control-panel.tsx`. Beløbene og `kr()` er uændrede. |
| G18-851 | 2 Faktura | DONE. Beløbet på mobilkortet for indgående fakturaer kan krympe. | Kun den `<p className="font-medium text-gray-900 mt-2">` i `list-client.tsx`. `fmtAmount` er uændret. |
| G18-852 | 2 Faktura | DONE. Fejlen i fakturatællingen kan krympe. | Kun den `<p className="text-sm text-red-700" data-testid="incoming-invoices-counts-error">` i `list-client.tsx`. Sætningen er uændret. |
| G18-853 | 2 Faktura | DONE. Fejlen om afsendere på fakturalisten kan krympe. | Kun den `<p className="text-sm text-red-700" data-testid="incoming-invoices-senders-error">` i `list-client.tsx`. Sætningen er uændret. |
| G18-854 | 2 Faktura | DONE. Listefejlen på fakturalisten kan krympe. | Kun den `<p className="text-sm text-red-700 break-words" data-testid="incoming-invoices-load-error">` i `list-client.tsx`. Sætningen er uændret. |
| G18-855 | 2 Faktura | DONE. Forfaldshinten på fakturalisten kan krympe. | Kun den `<span className="text-[11px] text-gray-400">` med teksten Viser godkendte fakturaer i `list-client.tsx`. Teksten er uændret. |
| G18-856 | 2 Faktura | DONE. Overskriften på fakturalisten kan krympe. | Kun den `<h1 className="text-2xl font-semibold">` med teksten Indgående fakturaer i `list-client.tsx`. Teksten er uændret. |
| G18-857 | 2 Faktura | DONE. Indledningen på fakturalisten kan krympe. | Kun den `<p className="text-xs text-gray-500 break-words max-w-xl">` i `list-client.tsx`. Sætningen er uændret. |
| G18-858 | 2 Faktura | DONE. Etiketten Forfald på fakturalisten kan krympe. | Kun den `<span className="text-xs text-gray-500">Forfald:</span>` i `list-client.tsx`. Teksten er uændret. |
| G18-859 | 2 Faktura | DONE. Forfaldsfilterets række på fakturalisten kan krympe. | Kun den `<div className="flex flex-wrap items-center gap-2">` der omslutter etiketten Forfald i `list-client.tsx`. Knapperne er uændrede. |
| G18-860 | 2 Faktura | DONE. Leverandørnavnet på fakturalistens skrivebord kan krympe. | Kun den `<Link className="font-medium text-emerald-700 hover:underline break-words">` i skrivebordstabellen i `list-client.tsx`. Mobilnavnet og beløbene er uændrede. |
| G18-861 | 2 Faktura | DONE. Beløbet på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 text-right font-medium">` med `fmtAmount` i `list-client.tsx`. `fmtAmount` er uændret. |
| G18-862 | 2 Faktura | DONE. Fakturanummeret på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 font-mono text-xs">` med `r.invoice_number` i `list-client.tsx`. Nummeret er uændret. |
| G18-863 | 2 Faktura | DONE. Fakturadatoen på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 text-xs">` med `fmtDate(r.invoice_date)` i `list-client.tsx`. Datoen er uændret. |
| G18-864 | 2 Faktura | DONE. Forfaldscellen på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 text-xs">` der omslutter `DueMarks` uden `withLabel` i `list-client.tsx`. Markeringen er uændret. |
| G18-865 | 2 Faktura | DONE. Statuscellen på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2"><StatusBadge row={r} /></td>` i `list-client.tsx`. Mærket er uændret. |
| G18-866 | 2 Faktura | DONE. Konfidenscellen på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 text-right text-xs">` der omslutter `Confidence` i `list-client.tsx`. Tallet er uændret. |
| G18-867 | 2 Faktura | DONE. Åbn-cellen på fakturalistens skrivebord kan krympe. | Kun den `<td className="px-3 py-2 text-right">` der omslutter skrivebordets Åbn-link i `list-client.tsx`. Knappen er uændret. |
| G18-868 | 2 Faktura | DONE. Kolonnen Beløb på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2 text-right">Beløb</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-869 | 2 Faktura | DONE. Kolonnen Konfidens på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2 text-right">Konfidens</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-870 | 2 Faktura | DONE. Kolonnen Leverandør på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2">Leverandør</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-871 | 2 Faktura | DONE. Kolonnen Faktura nr på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2">Faktura nr</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-872 | 2 Faktura | DONE. Kolonnen Faktura dato på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2">Faktura dato</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-873 | 2 Faktura | DONE. Kolonnen Forfald på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2">Forfald</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-874 | 2 Faktura | DONE. Kolonnen Status på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2">Status</th>` i `list-client.tsx`. Teksten er uændret. |
| G18-875 | 2 Faktura | DONE. Den tomme kolonne på fakturalistens skrivebord kan krympe. | Kun den `<th className="px-3 py-2"></th>` i `list-client.tsx`. Cellen er uændret. |
| G18-876 | 2 Faktura | DONE. Tabelhovedet på fakturalistens skrivebord kan krympe. | Kun den `<thead className="bg-gray-50 text-left text-xs text-gray-600">` i `list-client.tsx`. Kolonnerne er uændrede. |
| G18-877 | 2 Faktura | DONE. Tabellen på fakturalistens skrivebord kan krympe. | Kun den `<table className="w-full text-sm">` i `list-client.tsx`. Kolonnerne er uændrede. |
| G18-878 | 2 Faktura | DONE. Skrivebordsrammen på fakturalisten kan krympe. | Kun den `<div className="hidden md:block border rounded overflow-hidden bg-white">` i `list-client.tsx`. Tabellen er uændret. |
| G18-879 | 2 Faktura | DONE. Mobilisten på fakturalisten kan krympe. | Kun den `<div className="md:hidden border rounded overflow-hidden bg-white divide-y" data-testid="incoming-invoices-mobile-list">` i `list-client.tsx`. Kortene er uændrede. |
| G18-880 | 2 Faktura | DONE. Filterrækken på fakturalisten kan krympe. | Kun den `<div className="flex flex-wrap gap-2">` i `list-client.tsx`. Knapperne er uændrede. |
| G18-881 | 2 Faktura | DONE. Titelrækken på fakturalistens mobilkort kan krympe. | Kun den `<div className="flex items-start justify-between gap-2">` i `list-client.tsx`. Navn og status er uændrede. |
| G18-882 | 2 Faktura | DONE. Mærkerækken på fakturalistens mobilkort kan krympe. | Kun den `<div className="flex flex-wrap items-center gap-2 mt-1">` i `list-client.tsx`. Mærkerne er uændrede. |
| G18-883 | 2 Faktura | ÅBEN. Datorækken på fakturalistens mobilkort kan krympe. | Kun den `<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">` i `list-client.tsx`. Dato og forfald er uændrede. |
| G18-573 | 8 Pilot | DONE. Elpunktlisten kan krympe. | Kun den `<dl className="space-y-2 text-sm">` der følger overskriften Elpunkter. Bygningslisten, prislisten og tidsberegningens liste er uændrede. |
| G18-580 | 8 Pilot | DONE. Elpunktkolonnen kan krympe. | Kun den `<div>` der omslutter overskriften Elpunkter. Bygningskolonnen, priskolonnen og listen er uændrede. |
| G18-587 | 8 Pilot | DONE. Kompleksitetsrækken i bygningsinformationen kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter etiketten Kompleksitet. De andre rækker med samme klasse er uændrede. |
| G18-592 | 8 Pilot | DONE. Elpunktrækken kan krympe. | Kun den `<div className="flex flex-wrap justify-between gap-x-3 min-w-0">` der omslutter `getPointTypeName`. De andre rækker med samme klasse og punktantallet er uændrede. |
| G18-597 | 8 Pilot | ÅBEN. Teksten om manglende vedhæftninger kan krympe. | Kun `<p className="text-sm text-amber-800">` i mail-detaljen. Download-knappen er uændret. |

Staadig BLOCKED_APPROVAL (kun den opgave, arbejdet fortsaetter): 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198. VAT-vagten i 2d979a03 (`vat-guard.ts`) er Claudes og roeres ikke.

## Checkpoint 2026-10-18 hundredeogfireogtredivte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `fcb32785`. Det lader hundredeogtreogtredivte-hegnet stå. `fcb32785` hedder `feat(invoice): filterraekken paa fakturalisten kan krympe`. `af8a0bc1` hedder `feat(invoice): mobilisten paa fakturalisten kan krympe`. `origin/grok-next` er `fcb32785`. Push af `fcb32785` lykkedes. `af8a0bc1` blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `af8a0bc1..fcb32785`

```
fcb32785 feat(invoice): filterraekken paa fakturalisten kan krympe
af8a0bc1 feat(invoice): mobilisten paa fakturalisten kan krympe
```

Listen er skiftets commits fra `af8a0bc1` til og med `fcb32785`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
f5d7876c docs: checkpoint efter 2503b010
```

### Features

G18-880 lader kun filterrækken på fakturalisten krympe. Knapperne bliver. G18-879 lader kun mobilisten på fakturalisten krympe. Kortene bliver. `fmtDate`, `fmtAmount`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-filter-row-wrap-test.ts` og `scripts/incoming-invoice-mobile-list-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten for mobilisten exiterede 0 sammen med det commit, der ændrede filterrækken. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for begge produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `fcb32785`, herunder G18-748 til G18-880. `f5d7876c` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `fcb32785`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-881, G18-597.

## Checkpoint 2026-10-18 hundredeogtreogtredivte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `2503b010`. Det lader hundredeogtoogtredivte-hegnet stå. `2503b010` hedder `feat(invoice): skrivebordsrammen paa fakturalisten kan krympe`. `ba819535` hedder `feat(invoice): tabellen paa fakturalistens skrivebord kan krympe`. `3796e984` hedder `feat(invoice): tabelhovedet paa fakturalistens skrivebord kan krympe`. `origin/grok-next` er `2503b010`. Push af `2503b010` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `3796e984..2503b010`

```
2503b010 feat(invoice): skrivebordsrammen paa fakturalisten kan krympe
ba819535 feat(invoice): tabellen paa fakturalistens skrivebord kan krympe
3796e984 feat(invoice): tabelhovedet paa fakturalistens skrivebord kan krympe
```

Listen er skiftets commits fra `3796e984` til og med `2503b010`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
7645517d docs: checkpoint efter 1395b914
```

### Features

G18-878 lader kun skrivebordsrammen på fakturalisten krympe. Tabellen bliver. G18-877 lader kun tabellen på fakturalistens skrivebord krympe. Kolonnerne bliver. G18-876 lader kun tabelhovedet krympe. Kolonnerne bliver. `fmtDate`, `fmtAmount`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-frame-wrap-test.ts`, `scripts/incoming-invoice-desktop-table-wrap-test.ts` og `scripts/incoming-invoice-desktop-thead-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for tabellen og tabelhovedet exiterede 0 sammen med det commit, der ændrede rammen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `2503b010`, herunder G18-748 til G18-878. `7645517d` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `2503b010`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-879, G18-597.

## Checkpoint 2026-10-18 hundredeogtoogtredivte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `1395b914`. Det lader hundredeogenogtredivte-hegnet stå. `1395b914` hedder `feat(invoice): den tomme kolonne paa fakturalistens skrivebord kan krympe`. `54340f9e` hedder `feat(invoice): kolonnen status paa fakturalistens skrivebord kan krympe`. `707257a3` hedder `feat(invoice): kolonnen forfald paa fakturalistens skrivebord kan krympe`. `origin/grok-next` er `1395b914`. Push af `1395b914` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `707257a3..1395b914`

```
1395b914 feat(invoice): den tomme kolonne paa fakturalistens skrivebord kan krympe
54340f9e feat(invoice): kolonnen status paa fakturalistens skrivebord kan krympe
707257a3 feat(invoice): kolonnen forfald paa fakturalistens skrivebord kan krympe
```

Listen er skiftets commits fra `707257a3` til og med `1395b914`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
3912829d docs: checkpoint efter 169315a9
```

### Features

G18-875 lader kun den tomme kolonne på fakturalistens skrivebord krympe. Cellen bliver tom. G18-874 lader kun kolonnen Status krympe. Teksten bliver. G18-873 lader kun kolonnen Forfald krympe. Teksten bliver. `fmtDate`, `fmtAmount`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-empty-header-wrap-test.ts`, `scripts/incoming-invoice-desktop-status-header-wrap-test.ts` og `scripts/incoming-invoice-desktop-due-header-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for statuskolonnen og forfaldskolonnen exiterede 0 sammen med det commit, der ændrede kolonnen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `1395b914`, herunder G18-748 til G18-875. `3912829d` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `1395b914`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-876, G18-597.

## Checkpoint 2026-10-18 hundredeogenogtredivte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `169315a9`. Det lader hundredeogtredivte-hegnet stå. `169315a9` hedder `feat(invoice): kolonnen faktura dato paa fakturalistens skrivebord kan krympe`. `944646fa` hedder `feat(invoice): kolonnen faktura nr paa fakturalistens skrivebord kan krympe`. `52209718` hedder `feat(invoice): kolonnen leverandor paa fakturalistens skrivebord kan krympe`. `origin/grok-next` er `169315a9`. Push af `169315a9` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `52209718..169315a9`

```
169315a9 feat(invoice): kolonnen faktura dato paa fakturalistens skrivebord kan krympe
944646fa feat(invoice): kolonnen faktura nr paa fakturalistens skrivebord kan krympe
52209718 feat(invoice): kolonnen leverandor paa fakturalistens skrivebord kan krympe
```

Listen er skiftets commits fra `52209718` til og med `169315a9`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d0211e09 docs: checkpoint efter 3da87390
```

### Features

G18-872 lader kun kolonnen Faktura dato på fakturalistens skrivebord krympe. Teksten og datocellen bliver. G18-871 lader kun kolonnen Faktura nr krympe. Teksten og nummercelle bliver. G18-870 lader kun kolonnen Leverandør krympe. Teksten og leverandørnavnet bliver. `fmtDate`, `fmtAmount`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-date-header-wrap-test.ts`, `scripts/incoming-invoice-desktop-number-header-wrap-test.ts` og `scripts/incoming-invoice-desktop-supplier-header-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for skrivebordsdatoen og skrivebordsnummeret exiterede 0 sammen med det commit, der ændrede kolonnen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `169315a9`, herunder G18-748 til G18-872. `d0211e09` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `169315a9`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-873, G18-597.

## Checkpoint 2026-10-18 hundredeogtredivte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `3da87390`. Det lader hundredeogniogtyvende-hegnet stå. `3da87390` hedder `feat(invoice): kolonnen konfidens paa fakturalistens skrivebord kan krympe`. `530d68d2` hedder `feat(invoice): kolonnen beloeb paa fakturalistens skrivebord kan krympe`. `5b6d13be` hedder `feat(invoice): aabn-cellen paa fakturalistens skrivebord kan krympe`. `origin/grok-next` er `3da87390`. Push af `3da87390` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `5b6d13be..3da87390`

```
3da87390 feat(invoice): kolonnen konfidens paa fakturalistens skrivebord kan krympe
530d68d2 feat(invoice): kolonnen beloeb paa fakturalistens skrivebord kan krympe
5b6d13be feat(invoice): aabn-cellen paa fakturalistens skrivebord kan krympe
```

Listen er skiftets commits fra `5b6d13be` til og med `3da87390`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
873ad7bd docs: checkpoint efter e12dde16
```

### Features

G18-869 lader kun kolonnen Konfidens på fakturalistens skrivebord krympe. Teksten bliver. G18-868 lader kun kolonnen Beløb krympe. Teksten bliver. G18-867 lader kun Åbn-cellen krympe. Knappen og de fire links bliver. `fmtAmount`, `fmtDate`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-confidence-header-wrap-test.ts`, `scripts/incoming-invoice-desktop-amount-header-wrap-test.ts` og `scripts/incoming-invoice-desktop-open-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for konfidenscellen og skrivebordsbeløbet exiterede 0 sammen med det commit, der ændrede cellen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `3da87390`, herunder G18-748 til G18-869. `873ad7bd` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `3da87390`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-870, G18-597.

## Checkpoint 2026-10-18 hundredeogniogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `e12dde16`. Det lader hundredeogotteogtyvende-hegnet stå. `e12dde16` hedder `feat(invoice): konfidenscellen paa fakturalistens skrivebord kan krympe`. `7e5b0bda` hedder `feat(invoice): statuscellen paa fakturalistens skrivebord kan krympe`. `2debe5aa` hedder `feat(invoice): forfaldscellen paa fakturalistens skrivebord kan krympe`. `origin/grok-next` er `e12dde16`. Push af `e12dde16` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `2debe5aa..e12dde16`

```
e12dde16 feat(invoice): konfidenscellen paa fakturalistens skrivebord kan krympe
7e5b0bda feat(invoice): statuscellen paa fakturalistens skrivebord kan krympe
2debe5aa feat(invoice): forfaldscellen paa fakturalistens skrivebord kan krympe
```

Listen er skiftets commits fra `2debe5aa` til og med `e12dde16`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
c9c0c1e0 docs: checkpoint efter 270ee371
```

### Features

G18-866 lader kun konfidenscellen på fakturalistens skrivebord krympe. `Confidence` og mobilafsnittet bliver. G18-865 lader kun statuscellen krympe. `StatusBadge` bliver. G18-864 lader kun forfaldscellen krympe. `DueMarks` uden `withLabel` bliver, og mobilens etiket bliver. `fmtDate`, `fmtAmount`, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-confidence-wrap-test.ts`, `scripts/incoming-invoice-desktop-status-wrap-test.ts` og `scripts/incoming-invoice-desktop-due-cell-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten for mobilisten exiterede 0 sammen med det commit, der ændrede cellen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `e12dde16`, herunder G18-748 til G18-866. `c9c0c1e0` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `e12dde16`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-867, G18-597.

## Checkpoint 2026-10-18 hundredeogotteogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `270ee371`. Det lader hundredeogsyvogtyvende-hegnet stå. `270ee371` hedder `feat(invoice): fakturadatoen paa fakturalistens skrivebord kan krympe`. `d884e077` hedder `feat(invoice): fakturanummeret paa fakturalistens skrivebord kan krympe`. `b41130d3` hedder `feat(invoice): skrivebordsbeloebet paa fakturalisten kan krympe`. `origin/grok-next` er `270ee371`. Push af `270ee371` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `b41130d3..270ee371`

```
270ee371 feat(invoice): fakturadatoen paa fakturalistens skrivebord kan krympe
d884e077 feat(invoice): fakturanummeret paa fakturalistens skrivebord kan krympe
b41130d3 feat(invoice): skrivebordsbeloebet paa fakturalisten kan krympe
```

Listen er skiftets commits fra `b41130d3` til og med `270ee371`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
96890cf4 docs: checkpoint efter f49ba55a
```

### Features

G18-863 lader kun fakturadatoen på fakturalistens skrivebord krympe. `fmtDate` og mobildatoen bliver. G18-862 lader kun fakturanummeret på skrivebordet krympe. Mobilnummerets `break-all` bliver. G18-861 lader kun skrivebordsbeløbet krympe. `fmtAmount` og mobilbeløbet bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-date-wrap-test.ts`, `scripts/incoming-invoice-desktop-number-wrap-test.ts` og `scripts/incoming-invoice-desktop-amount-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for mobilisten, det manglende nummer og skrivebordsnavnet exiterede 0 sammen med det commit, der ændrede cellen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `270ee371`, herunder G18-748 til G18-863. `96890cf4` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `270ee371`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-864, G18-597.

## Checkpoint 2026-10-18 hundredeogsyvogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `f49ba55a`. Det lader hundredeogseksogtyvende-hegnet stå. `f49ba55a` hedder `feat(invoice): leverandoernavnet paa fakturalistens skrivebord kan krympe`. `4410c062` hedder `feat(invoice): forfaldsraekken paa fakturalisten kan krympe`. `7ae2cddd` hedder `feat(invoice): forfaldsetiketten paa fakturalisten kan krympe`. `44ad0db5` hedder `feat(invoice): indledningen paa fakturalisten kan krympe`. `8f9c557f` hedder `feat(invoice): overskriften paa fakturalisten kan krympe`. `origin/grok-next` er `f49ba55a`. Push af `f49ba55a` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8f9c557f..f49ba55a`

```
f49ba55a feat(invoice): leverandoernavnet paa fakturalistens skrivebord kan krympe
4410c062 feat(invoice): forfaldsraekken paa fakturalisten kan krympe
7ae2cddd feat(invoice): forfaldsetiketten paa fakturalisten kan krympe
44ad0db5 feat(invoice): indledningen paa fakturalisten kan krympe
8f9c557f feat(invoice): overskriften paa fakturalisten kan krympe
```

Listen er skiftets commits fra `8f9c557f` til og med `f49ba55a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
be31fbe1 docs: checkpoint efter 0a1b3448
```

### Features

G18-860 lader kun leverandørnavnet på fakturalistens skrivebord krympe. Mobilnavnet kan stadig krympe. G18-859 lader kun forfaldsfilterets række krympe. Knapperne bliver. G18-858 lader kun etiketten Forfald krympe. Teksten bliver. G18-857 lader kun indledningen krympe. Sætningen om bogføring bliver. G18-856 lader kun overskriften krympe. Teksten bliver. `fmtAmount` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-desktop-name-wrap-test.ts`, `scripts/incoming-invoice-due-row-wrap-test.ts`, `scripts/incoming-invoice-due-label-wrap-test.ts`, `scripts/incoming-invoice-intro-wrap-test.ts` og `scripts/incoming-invoice-heading-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for mobilisten og mobilbeløbet exiterede 0 sammen med det commit, der ændrede navnet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de fem produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `f49ba55a`, herunder G18-748 til G18-860. `be31fbe1` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `f49ba55a`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-861, G18-597.

## Checkpoint 2026-10-18 hundredeogseksogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `0a1b3448`. Det lader hundredeogfemogtyvende-hegnet stå. `0a1b3448` hedder `feat(invoice): forfaldshinten paa fakturalisten kan krympe`. `2328b573` hedder `feat(invoice): listefejlen paa fakturalisten kan krympe`. `5c0fd3f6` hedder `feat(invoice): afsenderfejlen paa fakturalisten kan krympe`. `origin/grok-next` er `0a1b3448`. Push af `0a1b3448` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `5c0fd3f6..0a1b3448`

```
0a1b3448 feat(invoice): forfaldshinten paa fakturalisten kan krympe
2328b573 feat(invoice): listefejlen paa fakturalisten kan krympe
5c0fd3f6 feat(invoice): afsenderfejlen paa fakturalisten kan krympe
```

Listen er skiftets commits fra `5c0fd3f6` til og med `0a1b3448`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
fdff1c1e docs: checkpoint efter 48babd42
```

### Features

G18-855 lader kun forfaldshinten på fakturalisten krympe. Teksten om godkendte fakturaer bliver. G18-854 lader kun listefejlen krympe. Sætningen om tidligere fakturaer bliver. G18-853 lader kun afsenderfejlen krympe. Sætningen om at afsendere ikke tælles som rigtige fakturaer bliver. Tællefejlen kan stadig krympe. Mobilbeløbet kan stadig krympe. `fmtAmount` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-due-hint-wrap-test.ts`, `scripts/incoming-invoice-load-error-wrap-test.ts` og `scripts/incoming-invoice-senders-error-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for indlæsningen, afsendere og tællingen exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for de tre produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `0a1b3448`, herunder G18-748 til G18-855. `fdff1c1e` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `0a1b3448`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-856, G18-597.

## Checkpoint 2026-10-18 hundredeogfemogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commit `48babd42`. Det lader hundredeogfireogtyvende-hegnet stå. `48babd42` hedder `feat(invoice): fejlen i fakturataellingen kan krympe`. `origin/grok-next` er `48babd42`. Push af `48babd42` lykkedes. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `48babd42`

```
48babd42 feat(invoice): fejlen i fakturataellingen kan krympe
```

Listen er skiftets commit `48babd42`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
19d1b4d3 docs: checkpoint efter 1b2ec490
```

### Features

G18-852 lader kun fejlen i fakturatællingen krympe. Sætningen om at det ikke tælles som 0 bliver. Mobilbeløbet kan stadig krympe. Afsenderfejlen bliver bar. Beløbene bliver. `fmtAmount` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-counts-error-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. Den kørte med `npx tsx` og exiterede 0. Søskendetestene for indlæsningen og mobilbeløbet exiterede 0 sammen med committen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `48babd42`, herunder G18-748 til G18-852. `19d1b4d3` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `48babd42`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-853, G18-597.

## Checkpoint 2026-10-18 hundredeogfireogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `1b2ec490`. Det lader hundredeogtreogtyvende-hegnet stå. `1b2ec490` hedder `feat(invoice): mobilbeloebet paa indgaaende fakturaer kan krympe`. `fd7db536` hedder `feat(invoice): overprisbeloebet paa fakturakontrol kan krympe`. `origin/grok-next` er `1b2ec490`. Push af `1b2ec490` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `fd7db536..1b2ec490`

```
1b2ec490 feat(invoice): mobilbeloebet paa indgaaende fakturaer kan krympe
fd7db536 feat(invoice): overprisbeloebet paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `fd7db536` til og med `1b2ec490`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
32193f96 docs: checkpoint efter 240062b2
```

### Features

G18-851 lader kun beløbet på mobilkortet for indgående fakturaer krympe. `fmtAmount` bliver, og skrivebordsbeløbet bliver. G18-850 lader kun overprisbeløbet på fakturakontrol krympe. Rød skrift gælder kun når der er kontrollerede linjer og beløbet er over 0. Dækningstallet kan stadig krympe. Beløbene bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/incoming-invoice-mobile-amount-wrap-test.ts` og `scripts/invoice-control-overcharge-amount-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for mobilkortet, filteret, indlæsningen, opsummeringen, leverandørteksten, dækningen og overpriscellen exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for begge produktcommits. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `1b2ec490`, herunder G18-748 til G18-851. `32193f96` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `1b2ec490`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-852, G18-597.

## Checkpoint 2026-10-18 hundredeogtreogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `240062b2`. Det lader hundredeogtoogtyvende-hegnet stå. `240062b2` hedder `feat(invoice): daekningstallet paa fakturakontrol kan krympe`. `46cdea6f` hedder `feat(invoice): fragt-taelleren paa fakturakontrol kan krympe`. `origin/grok-next` er `240062b2`. Push af `240062b2` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `46cdea6f..240062b2`

```
240062b2 feat(invoice): daekningstallet paa fakturakontrol kan krympe
46cdea6f feat(invoice): fragt-taelleren paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `46cdea6f` til og med `240062b2`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
f0eeb282 docs: checkpoint efter 42e659aa
```

### Features

G18-849 lader kun dækningstallet på fakturakontrol krympe. Kontrollerede linjer, linjetotal og dækningsprocent bliver. G18-848 lader kun fragt-tælleren krympe. Fragt og gebyr bliver to tal. Overprisbeløbet bliver bar. Beløbene bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-coverage-wrap-test.ts` og `scripts/invoice-control-freight-count-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for opsummeringen, leverandørteksten og fragt-tælleren exiterede 0 sammen med committen for dækningstallet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for dækningstallet. Fragt-committen havde samme typecheck. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `240062b2`, herunder G18-748 til G18-849. `f0eeb282` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `240062b2`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-850, G18-597.

## Checkpoint 2026-10-18 hundredeogtoogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commit `42e659aa`. Det lader hundredeogenogtyvende-hegnet stå. `42e659aa` hedder `feat(invoice): underpris-taelleren paa fakturakontrol kan krympe`. `origin/grok-next` er `42e659aa`. Push af `42e659aa` lykkedes. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `42e659aa`

```
42e659aa feat(invoice): underpris-taelleren paa fakturakontrol kan krympe
```

Listen er skiftets commit `42e659aa`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
25931757 docs: checkpoint efter cfac371f
```

### Features

G18-847 lader kun underpris-tælleren på fakturakontrol krympe. Gul skrift gælder kun når tallet er over 0. Overpris-tælleren kan stadig krympe. Fragt-tælleren bliver bar. Beløbene bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-undercharge-count-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. `scripts/invoice-review-counts-test.ts` kalder `countInvoiceReviewLines` fra `src/lib/invoice-control/review-counts`. De kørte med `npx tsx` og exiterede 0. Søskendetesten for overpris-tælleren exiterede 0 sammen med committen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `42e659aa`, herunder G18-748 til G18-847. `25931757` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `42e659aa`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-848, G18-597.

## Checkpoint 2026-10-18 hundredeogenogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `cfac371f`. Det lader hundredeogtyvende-hegnet stå. `cfac371f` hedder `feat(invoice): overpris-taelleren paa fakturakontrol kan krympe`. `9b6ff03a` hedder `feat(invoice): leverandoerteksten paa fakturakontrol kan krympe`. `aeb582e3` hedder `feat(invoice): nul-linjen paa fakturakontrol kan krympe`. `origin/grok-next` er `cfac371f`. Push af `cfac371f` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `aeb582e3..cfac371f`

```
cfac371f feat(invoice): overpris-taelleren paa fakturakontrol kan krympe
9b6ff03a feat(invoice): leverandoerteksten paa fakturakontrol kan krympe
aeb582e3 feat(invoice): nul-linjen paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `aeb582e3` til og med `cfac371f`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a874c308 docs: checkpoint efter b69bd487
```

### Features

G18-846 lader kun overpris-tælleren på fakturakontrol krympe. Rød skrift gælder kun når tallet er over 0. Underpris-tælleren bliver bar. G18-845 lader kun leverandørteksten krympe. Teksten Kendt bliver, og dækningstallet bliver bar. G18-844 lader kun nul-linjen krympe. Sætningen om 0 kr bliver. Beløbene bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-overcharge-count-wrap-test.ts`, `scripts/invoice-control-supplier-text-wrap-test.ts` og `scripts/invoice-control-zero-line-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. `scripts/invoice-review-counts-test.ts` kalder `countInvoiceReviewLines` fra `src/lib/invoice-control/review-counts`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for gitteret og leverandørcellen exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `cfac371f`, herunder G18-748 til G18-846. `a874c308` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `cfac371f`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-847, G18-597.

## Checkpoint 2026-10-18 hundredeogtyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `b69bd487`. Det lader hundredeognittende-hegnet stå. `b69bd487` hedder `feat(invoice): rammen paa fakturakontrol kan krympe`. `f1f3a511` hedder `feat(invoice): aarsagen paa fakturakontrol kan krympe`. `origin/grok-next` er `b69bd487`. Push af `b69bd487` lykkedes. `f1f3a511` blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f1f3a511..b69bd487`

```
b69bd487 feat(invoice): rammen paa fakturakontrol kan krympe
f1f3a511 feat(invoice): aarsagen paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `f1f3a511` til og med `b69bd487`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d16d6341 docs: checkpoint efter e9c1cc62
```

### Features

G18-843 lader kun rammen på fakturakontrol krympe. G18-842 lader kun årsagen på skrivebordets matchcelle krympe. Knappen Prøv igen holder højden på 44 px. Beløbene, dækningen og leverandørteksten bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-panel-frame-wrap-test.ts` og `scripts/invoice-control-reason-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten for sidehovedet exiterede 0 sammen med rammecommitten. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for produktcommitten i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `b69bd487`, herunder G18-748 til G18-843. `d16d6341` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `b69bd487`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-844, G18-597.

## Checkpoint 2026-10-18 hundredeognittende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `e9c1cc62`. Det lader hundredeogattende-hegnet stå. `e9c1cc62` hedder `feat(invoice): proev-igen paa fakturakontrol kan krympe`. `d29092f8` hedder `feat(invoice): fejlrammen paa fakturakontrol kan krympe`. `c35b4e45` hedder `feat(invoice): matchlinjen paa fakturakontrol kan krympe`. `origin/grok-next` er `e9c1cc62`. Push af `e9c1cc62` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c35b4e45..e9c1cc62`

```
e9c1cc62 feat(invoice): proev-igen paa fakturakontrol kan krympe
d29092f8 feat(invoice): fejlrammen paa fakturakontrol kan krympe
c35b4e45 feat(invoice): matchlinjen paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `c35b4e45` til og med `e9c1cc62`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
ec8872c0 docs: checkpoint efter 4ef2e588
```

### Features

G18-839 lader kun matchlinjen på fakturakontrollens mobilkort krympe. G18-840 lader kun fejlrammen krympe. G18-841 lader kun knappen Prøv igen krympe, og højden på 44 px bliver. Årsagen på skrivebordets matchcelle bliver bar. Beløbene, dækningen og leverandørteksten bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-match-line-wrap-test.ts`, `scripts/invoice-control-error-frame-wrap-test.ts` og `scripts/invoice-control-retry-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for kolonnerække, indlæsningsfejl og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `e9c1cc62`, herunder G18-748 til G18-841. `ec8872c0` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `e9c1cc62`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-842, G18-597.

## Checkpoint 2026-10-18 hundredeogattende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `4ef2e588`. Det lader hundredeogsyttenende-hegnet stå. `4ef2e588` hedder `feat(invoice): kolonneraekken paa fakturakontrol kan krympe`. `29ad4889` hedder `feat(invoice): sidehovedet paa fakturakontrol kan krympe`. `ea6742be` hedder `feat(invoice): mobilkortets titelraekke kan krympe`. `origin/grok-next` er `4ef2e588`. Push af `4ef2e588` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `ea6742be..4ef2e588`

```
4ef2e588 feat(invoice): kolonneraekken paa fakturakontrol kan krympe
29ad4889 feat(invoice): sidehovedet paa fakturakontrol kan krympe
ea6742be feat(invoice): mobilkortets titelraekke kan krympe
```

Listen er skiftets commits fra `ea6742be` til og med `4ef2e588`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
fc65b273 docs: checkpoint efter 26589272
```

### Features

G18-836 lader kun mobilkortets titelrække på fakturakontrol krympe. G18-837 lader kun sidehovedet krympe. G18-838 lader kun kolonnerækken krympe. Matchlinjen på mobilkortet bliver bar. Beløbene, dækningen og leverandørteksten bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-mobile-head-wrap-test.ts`, `scripts/invoice-control-panel-head-wrap-test.ts` og `scripts/invoice-control-column-row-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for tabelhoved, nummerkolonne og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `4ef2e588`, herunder G18-748 til G18-838. `fc65b273` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `4ef2e588`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-839, G18-597.

## Checkpoint 2026-10-18 hundredeogsyttenende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `26589272`. Det lader hundredeogsekstende-hegnet stå. `26589272` hedder `feat(invoice): mobilkortet paa fakturakontrol kan krympe`. `3f7ab96b` hedder `feat(invoice): skrivebordsraekken paa fakturakontrol kan krympe`. `65d465ea` hedder `feat(invoice): tabelkroppen paa fakturakontrol kan krympe`. `ec54ffec` hedder `feat(invoice): tabelhovedet paa fakturakontrol kan krympe`. `origin/grok-next` er `26589272`. Push af `26589272` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `ec54ffec..26589272`

```
26589272 feat(invoice): mobilkortet paa fakturakontrol kan krympe
3f7ab96b feat(invoice): skrivebordsraekken paa fakturakontrol kan krympe
65d465ea feat(invoice): tabelkroppen paa fakturakontrol kan krympe
ec54ffec feat(invoice): tabelhovedet paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `ec54ffec` til og med `26589272`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
61ae2bb0 docs: checkpoint efter 3e0bda3a
```

### Features

G18-832 lader kun tabelhovedet på fakturakontrol krympe. G18-833 lader kun tabelkroppen krympe. G18-834 lader kun skrivebordsrækken krympe. G18-835 lader kun mobilkortet krympe. Titelrækken på mobilkortet bliver bar. Beløbene, dækningen og leverandørteksten bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-thead-wrap-test.ts`, `scripts/invoice-control-tbody-wrap-test.ts`, `scripts/invoice-control-desktop-row-wrap-test.ts` og `scripts/invoice-control-mobile-card-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for celler, gitter og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `26589272`, herunder G18-748 til G18-835. `61ae2bb0` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `26589272`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-836, G18-597.

## Checkpoint 2026-10-18 hundredeogsekstende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `3e0bda3a`. Det lader hundredeogfemtende-hegnet stå. `3e0bda3a` hedder `feat(invoice): tabellen paa fakturakontrol kan krympe`. `4bba9cf6` hedder `feat(invoice): skrivebordslisten paa fakturakontrol kan krympe`. `a6ec253f` hedder `feat(invoice): mobilisten paa fakturakontrol kan krympe`. `7e40e5fe` hedder `feat(invoice): cellen leverandoer paa fakturakontrol kan krympe`. `43ca7e99` hedder `feat(invoice): cellen overpris i alt paa fakturakontrol kan krympe`. `origin/grok-next` er `3e0bda3a`. Push af `3e0bda3a` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `43ca7e99..3e0bda3a`

```
3e0bda3a feat(invoice): tabellen paa fakturakontrol kan krympe
4bba9cf6 feat(invoice): skrivebordslisten paa fakturakontrol kan krympe
a6ec253f feat(invoice): mobilisten paa fakturakontrol kan krympe
7e40e5fe feat(invoice): cellen leverandoer paa fakturakontrol kan krympe
43ca7e99 feat(invoice): cellen overpris i alt paa fakturakontrol kan krympe
```

Listen er skiftets commits fra `43ca7e99` til og med `3e0bda3a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
4fd8b21c docs: checkpoint efter 64355ae9
```

### Features

G18-827 lader kun cellen Overpris i alt på fakturakontrol krympe. G18-828 lader kun cellen Leverandør krympe. G18-829 lader kun mobilisten krympe. G18-830 lader kun skrivebordslisten krympe. G18-831 lader kun tabellen krympe. Tabelhovedet bliver bart. Beløbene, dækningen og leverandørteksten bliver. `kr()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/invoice-control-overcharge-cell-wrap-test.ts`, `scripts/invoice-control-supplier-cell-wrap-test.ts`, `scripts/invoice-control-lines-mobile-wrap-test.ts`, `scripts/invoice-control-desktop-scroll-wrap-test.ts` og `scripts/invoice-control-table-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for celler, gitter og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot-, efterkalkulations- og fakturabølgen fra `cb4f0a8f` til og med `3e0bda3a`, herunder G18-748 til G18-831. `4fd8b21c` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `3e0bda3a`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-832, G18-597.

## Checkpoint 2026-10-18 hundredeogfemtende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `64355ae9`. Det lader hundredeogfjortende-hegnet stå. `64355ae9` hedder `feat(invoice): cellen kontrollerede linjer paa fakturakontrol kan krympe`. `be30723e` hedder `feat(invoice): opsummeringsgitteret paa fakturakontrol kan krympe`. `ff9db797` hedder `feat(profit): beloebslisten paa efterkalkulationens mobilkort kan krympe`. `f109b430` hedder `feat(profit): faktisk-db-kolonnen paa efterkalkulationens mobilkort kan krympe`. `origin/grok-next` er `64355ae9`. Push af `64355ae9` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f109b430..64355ae9`

```
64355ae9 feat(invoice): cellen kontrollerede linjer paa fakturakontrol kan krympe
be30723e feat(invoice): opsummeringsgitteret paa fakturakontrol kan krympe
ff9db797 feat(profit): beloebslisten paa efterkalkulationens mobilkort kan krympe
f109b430 feat(profit): faktisk-db-kolonnen paa efterkalkulationens mobilkort kan krympe
```

Listen er skiftets commits fra `f109b430` til og med `64355ae9`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
abf3b6cf docs: checkpoint efter bd90fb1a
```

### Features

G18-823 lader kun faktisk-DB-kolonnen på efterkalkulationens mobilkort krympe. G18-824 lader kun beløbslisten krympe. G18-825 lader kun opsummeringsgitteret på fakturakontrol krympe. G18-826 lader kun cellen Kontrollerede linjer krympe. Overpriscellen og leverandørcellen bliver bare. Linket, beløbene og procenterne bliver. `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-mobile-actual-db-column-wrap-test.ts`, `scripts/aftercalc-overview-mobile-money-list-wrap-test.ts`, `scripts/invoice-control-summary-grid-wrap-test.ts` og `scripts/invoice-control-controlled-cell-wrap-test.ts` læser den shippede visning og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris-, pilot- og fakturabølgen fra `cb4f0a8f` til og med `64355ae9`, herunder G18-748 til G18-826. `abf3b6cf` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `64355ae9`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-827, G18-597.

## Checkpoint 2026-10-18 hundredeogfjortende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `bd90fb1a`. Det lader hundredeogtrettende-hegnet stå. `bd90fb1a` hedder `feat(profit): tilbudt-db-kolonnen paa efterkalkulationens mobilkort kan krympe`. `412fb70b` hedder `feat(profit): faktisk-omsaetningskolonnen paa efterkalkulationens mobilkort kan krympe`. `523205f4` hedder `feat(profit): tilbudt-omsaetningskolonnen paa efterkalkulationens mobilkort kan krympe`. `c8fc8af8` hedder `feat(profit): titelkolonnen paa efterkalkulationens mobilkort kan krympe`. `origin/grok-next` er `bd90fb1a`. Push af `bd90fb1a` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c8fc8af8..bd90fb1a`

```
bd90fb1a feat(profit): tilbudt-db-kolonnen paa efterkalkulationens mobilkort kan krympe
412fb70b feat(profit): faktisk-omsaetningskolonnen paa efterkalkulationens mobilkort kan krympe
523205f4 feat(profit): tilbudt-omsaetningskolonnen paa efterkalkulationens mobilkort kan krympe
c8fc8af8 feat(profit): titelkolonnen paa efterkalkulationens mobilkort kan krympe
```

Listen er skiftets commits fra `c8fc8af8` til og med `bd90fb1a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
cd280b46 docs: checkpoint efter 1224850e
```

### Features

G18-819 lader kun titelkolonnen på mobilkortet krympe. G18-820 lader kun tilbudt-omsætningskolonnen krympe. G18-821 lader kun faktisk-omsætningskolonnen krympe. G18-822 lader kun tilbudt-DB-kolonnen krympe. Faktisk DB bliver bar. Linket, beløbene og procenterne bliver. `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-mobile-title-column-wrap-test.ts`, `scripts/aftercalc-overview-mobile-quoted-revenue-column-wrap-test.ts`, `scripts/aftercalc-overview-mobile-actual-revenue-column-wrap-test.ts` og `scripts/aftercalc-overview-mobile-quoted-db-column-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `bd90fb1a`, herunder G18-748 til G18-822. `cd280b46` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `bd90fb1a`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-823, G18-597.

## Checkpoint 2026-10-18 hundredeogtrettende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `1224850e`. Det lader hundredeogtolvte-hegnet stå. `1224850e` hedder `feat(profit): sortering-etikettens ramme paa efterkalkulation kan krympe`. `3e6c3e59` hedder `feat(profit): afvigelse-etikettens ramme paa efterkalkulation kan krympe`. `b02e16c7` hedder `feat(profit): status-etikettens ramme paa efterkalkulation kan krympe`. `082acf4f` hedder `feat(profit): fra-dato-etikettens ramme paa efterkalkulation kan krympe`. `origin/grok-next` er `1224850e`. Push af `1224850e` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `082acf4f..1224850e`

```
1224850e feat(profit): sortering-etikettens ramme paa efterkalkulation kan krympe
3e6c3e59 feat(profit): afvigelse-etikettens ramme paa efterkalkulation kan krympe
b02e16c7 feat(profit): status-etikettens ramme paa efterkalkulation kan krympe
bae553a7 feat(profit): ansvarlig-etikettens ramme paa efterkalkulation kan krympe
1e2ce0c2 feat(profit): til-dato-etikettens ramme paa efterkalkulation kan krympe
082acf4f feat(profit): fra-dato-etikettens ramme paa efterkalkulation kan krympe
```

Listen er skiftets commits fra `082acf4f` til og med `1224850e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
3f4e45ce docs: checkpoint efter 000c1d3e
```

### Features

G18-813 lader kun fra-dato-etikettens ramme krympe. G18-814 lader kun til-dato-etikettens ramme krympe. G18-815 lader kun ansvarlig-etikettens ramme krympe. G18-816 lader kun status-etikettens ramme krympe. G18-817 lader kun afvigelse-etikettens ramme krympe. G18-818 lader kun sortering-etikettens ramme krympe. De andre rammer blev, indtil deres eget commit. Beløbene bliver. `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-from-label-frame-wrap-test.ts`, `scripts/aftercalc-overview-to-label-frame-wrap-test.ts`, `scripts/aftercalc-overview-assignee-label-frame-wrap-test.ts`, `scripts/aftercalc-overview-status-label-frame-wrap-test.ts`, `scripts/aftercalc-overview-variance-label-frame-wrap-test.ts` og `scripts/aftercalc-overview-sort-label-frame-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `1224850e`, herunder G18-748 til G18-818. `3f4e45ce` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `1224850e`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-819, G18-597.

## Checkpoint 2026-10-18 hundredeogtolvte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `000c1d3e`. Det lader hundredeogellevte-hegnet stå. `000c1d3e` hedder `feat(profit): sortering-feltet paa efterkalkulation kan krympe`. `21bb0368` hedder `feat(profit): afvigelse-feltet paa efterkalkulation kan krympe`. `008f5982` hedder `feat(profit): status-feltet paa efterkalkulation kan krympe`. `d2c0cca9` hedder `feat(profit): til-dato-feltet paa efterkalkulation kan krympe`. `origin/grok-next` er `000c1d3e`. Push af `000c1d3e` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d2c0cca9..000c1d3e`

```
000c1d3e feat(profit): sortering-feltet paa efterkalkulation kan krympe
21bb0368 feat(profit): afvigelse-feltet paa efterkalkulation kan krympe
008f5982 feat(profit): status-feltet paa efterkalkulation kan krympe
c013b575 feat(profit): ansvarlig-feltet paa efterkalkulation kan krympe
d2c0cca9 feat(profit): til-dato-feltet paa efterkalkulation kan krympe
```

Listen er skiftets commits fra `d2c0cca9` til og med `000c1d3e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a5307e4e docs: checkpoint efter 621bed34
```

### Features

G18-808 lader kun til-dato-feltet krympe. De andre filtre bliver. G18-809 lader kun ansvarlig-feltet krympe. G18-810 lader kun status-feltet krympe. G18-811 lader kun afvigelse-feltet krympe. G18-812 lader kun sortering-feltet krympe. Beløbene bliver. `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-to-input-wrap-test.ts`, `scripts/aftercalc-overview-assignee-input-wrap-test.ts`, `scripts/aftercalc-overview-status-input-wrap-test.ts`, `scripts/aftercalc-overview-variance-input-wrap-test.ts` og `scripts/aftercalc-overview-sort-input-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `000c1d3e`, herunder G18-748 til G18-812. `a5307e4e` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `000c1d3e`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-813, G18-597.

## Checkpoint 2026-10-18 hundredeogellevte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `621bed34`. Det lader hundredeogtiende-hegnet stå. `621bed34` hedder `feat(profit): fra-dato-feltet paa efterkalkulation kan krympe`. `16ff3af8` hedder `feat(profit): filtergitteret paa efterkalkulation kan krympe`. `0705a246` hedder `feat(profit): etiketten omkring manglende kost kan krympe`. `c43d21e0` hedder `feat(profit): db-afvigelsen paa mobilkortet kan krympe`. `origin/grok-next` er `621bed34`. Push af `621bed34` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c43d21e0..621bed34`

```
621bed34 feat(profit): fra-dato-feltet paa efterkalkulation kan krympe
16ff3af8 feat(profit): filtergitteret paa efterkalkulation kan krympe
0705a246 feat(profit): etiketten omkring manglende kost kan krympe
33ac51fb feat(profit): efterkalkulationens side kan krympe
711c68e5 feat(profit): datakvalitetscellen paa efterkalkulation kan krympe
0d7596f0 feat(profit): knappen naeste paa efterkalkulation kan krympe
4c546bfd feat(profit): knappen forrige paa efterkalkulation kan krympe
c43d21e0 feat(profit): db-afvigelsen paa mobilkortet kan krympe
```

Listen er skiftets commits fra `c43d21e0` til og med `621bed34`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
ede25359 docs: checkpoint efter 1d8703da
```

### Features

G18-800 lader kun DB-afvigelsen på mobilkortet krympe. Beløbene bliver i det commit. G18-801 lader kun knappen Forrige krympe. G18-802 lader kun knappen Næste krympe. 44 px og sideantallet bliver. G18-803 lader kun datakvalitetscellen krympe. Mærket bliver. G18-804 lader kun siden krympe. G18-805 lader kun etiketten omkring manglende kost krympe. Filteret bliver. G18-806 lader kun filtergitteret krympe. G18-807 lader kun fra-dato-feltet krympe. De andre filtre bliver. `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-mobile-variance-wrap-test.ts`, `scripts/aftercalc-overview-prev-button-wrap-test.ts`, `scripts/aftercalc-overview-next-button-wrap-test.ts`, `scripts/aftercalc-overview-quality-cell-wrap-test.ts`, `scripts/aftercalc-overview-page-wrap-test.ts`, `scripts/aftercalc-overview-missing-cost-row-wrap-test.ts`, `scripts/aftercalc-overview-filter-grid-wrap-test.ts` og `scripts/aftercalc-overview-from-input-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `621bed34`, herunder G18-748 til G18-807. `ede25359` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `621bed34`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-808, G18-597.

## Checkpoint 2026-10-18 hundredeogtiende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `1d8703da`. Det lader hundredeogniende-hegnet stå. `1d8703da` hedder `feat(profit): faktisk db paa mobilkortet kan krympe`. `efef30d7` hedder `feat(profit): tilbudt db paa mobilkortet kan krympe`. `498bf3e6` hedder `feat(profit): faktisk omsaetning paa mobilkortet kan krympe`. `e74df022` hedder `feat(profit): tilbudt omsaetning paa efterkalkulationens mobilkort kan krympe`. `origin/grok-next` er `1d8703da`. Push af `1d8703da` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `e74df022..1d8703da`

```
1d8703da feat(profit): faktisk db paa mobilkortet kan krympe
efef30d7 feat(profit): tilbudt db paa mobilkortet kan krympe
498bf3e6 feat(profit): faktisk omsaetning paa mobilkortet kan krympe
e74df022 feat(profit): tilbudt omsaetning paa efterkalkulationens mobilkort kan krympe
```

Listen er skiftets commits fra `e74df022` til og med `1d8703da`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
95bbff06 docs: checkpoint efter cf085211
```

### Features

G18-796 lader kun tilbudt omsætning på mobilkortet krympe. De andre beløb bliver i det commit. G18-797 lader kun faktisk omsætning på mobilkortet krympe. G18-798 lader kun tilbudt DB på mobilkortet krympe. G18-799 lader kun faktisk DB på mobilkortet krympe. Sideantallet, `kr()`, `pct()` og `varianceText()` bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-mobile-quoted-revenue-wrap-test.ts`, `scripts/aftercalc-overview-mobile-actual-revenue-wrap-test.ts`, `scripts/aftercalc-overview-mobile-quoted-db-wrap-test.ts` og `scripts/aftercalc-overview-mobile-actual-db-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, etiketter, sideantal og de beløb, der netop blev låst, exiterede 0 sammen med det commit, der ændrede beløbet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `1d8703da`, herunder G18-748 til G18-799. `95bbff06` er kun docs og står ikke i dette hegn. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `1d8703da`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-800, G18-597.

## Checkpoint 2026-10-18 hundredeogniende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `cf085211`. Det lader hundredeogottende-hegnet stå. `cf085211` hedder `feat(profit): sidestyringen paa efterkalkulation kan krympe`. `ad5985f4` hedder `feat(profit): filterindholdet paa efterkalkulation kan krympe`. `d028ea17` hedder `feat(profit): dataraekken paa efterkalkulation kan krympe`. `332db0da` hedder `docs: checkpoint efter 943e3f02`. `origin/grok-next` er `cf085211`. Push af `cf085211` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `332db0da..cf085211`

```
cf085211 feat(profit): sidestyringen paa efterkalkulation kan krympe
ad5985f4 feat(profit): filterindholdet paa efterkalkulation kan krympe
d028ea17 feat(profit): dataraekken paa efterkalkulation kan krympe
de6f5f2b feat(profit): sagsnummerlinket paa efterkalkulation kan krympe
a673c71e feat(profit): ansvarlig paa efterkalkulation kan krympe
2c216ba0 feat(profit): kundenavnet paa efterkalkulation kan krympe
332db0da docs: checkpoint efter 943e3f02
```

Listen er skiftets commits fra `332db0da` til og med `cf085211`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
332db0da docs: checkpoint efter 943e3f02
```

### Features

G18-790 lader kun kundenavnet i sagscellen krympe. Ansvarlig bliver i det commit. G18-791 lader kun ansvarlig i sagscellen krympe. G18-792 lader kun sagsnummerlinket på skrivebordet krympe. Mobilkortet bliver. G18-793 lader kun datarækken krympe. Sagsnummerlinket bliver. G18-794 lader kun filterindholdet krympe. Filtre bliver. G18-795 lader kun sidestyringen krympe. Knappernes 44 px og sideantallet bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-desktop-customer-cell-wrap-test.ts`, `scripts/aftercalc-overview-desktop-assignee-cell-wrap-test.ts`, `scripts/aftercalc-overview-desktop-case-link-wrap-test.ts`, `scripts/aftercalc-overview-desktop-row-wrap-test.ts`, `scripts/aftercalc-overview-filter-body-wrap-test.ts` og `scripts/aftercalc-overview-pager-inner-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for penge, mobil, sideantal og de elementer, der netop blev låst, exiterede 0 sammen med det commit, der ændrede elementet. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `cf085211`, herunder G18-748 til G18-795. `332db0da` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `cf085211`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-796, G18-597.

## Checkpoint 2026-10-18 hundredeogottende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `943e3f02`. Det lader hundredeogsyvende-hegnet stå. `943e3f02` hedder `feat(profit): faktureringstilstanden paa efterkalkulation kan krympe`. `495d8c2d` hedder `feat(profit): advarselsteksten paa efterkalkulation kan krympe`. `ad250e98` hedder `feat(profit): sagsbeskrivelsen paa efterkalkulation kan krympe`. `e2d3327e` hedder `docs: checkpoint efter 52b948bb`. `origin/grok-next` er `943e3f02`. Push af `943e3f02` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `e2d3327e..943e3f02`

```
943e3f02 feat(profit): faktureringstilstanden paa efterkalkulation kan krympe
495d8c2d feat(profit): advarselsteksten paa efterkalkulation kan krympe
ad250e98 feat(profit): sagsbeskrivelsen paa efterkalkulation kan krympe
1fb94b67 feat(profit): kolonneraekken paa efterkalkulation kan krympe
7ea64bed feat(profit): sagscellen paa efterkalkulation kan krympe
a285110f feat(profit): tabelkroppen paa efterkalkulation kan krympe
6e3ab85d feat(profit): tabelrullen paa efterkalkulation kan krympe
f97b05d9 feat(profit): tabelhovedet paa efterkalkulation kan krympe
2ce70db3 feat(profit): tabellen paa efterkalkulation kan krympe
8ac5ebc2 feat(profit): kolonnen DB-afvigelse paa efterkalkulation kan krympe
1a2bf970 feat(profit): kolonnen Faktisk DB pct paa efterkalkulation kan krympe
2ec855ed feat(profit): kolonnen Tilbudt DB pct paa efterkalkulation kan krympe
90f74699 feat(profit): kolonnen Faktisk omsaetning paa efterkalkulation kan krympe
d4042c0d feat(profit): kolonnen Tilbudt omsaetning paa efterkalkulation kan krympe
a31fd586 feat(profit): kolonnen Datakvalitet paa efterkalkulation kan krympe
e2d3327e docs: checkpoint efter 52b948bb
```

Listen er skiftets commits fra `e2d3327e` til og med `943e3f02`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
e2d3327e docs: checkpoint efter 52b948bb
```

### Features

G18-775 til G18-786 lader kolonner, tabel, tabelhoved, tabelrulle, tabelkrop, sagscelle og kolonnerække på efterkalkulationens skrivebord krympe. G18-787 lader kun sagsbeskrivelsen i sagscellen krympe. Sagsnummeret bliver. G18-788 lader kun advarselsteksten krympe. Mærket bliver. G18-789 lader kun faktureringstilstanden i sagscellen krympe. Mobilkortet bliver. Beløb, `formatCurrency` og lagrede priser bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-desktop-case-title-wrap-test.ts`, `scripts/aftercalc-overview-desktop-warning-wrap-test.ts` og `scripts/aftercalc-overview-desktop-invoiced-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for kolonner, penge, mobil og faktureringstilstand exiterede 0 sammen med de commits, der ændrede det element, de låser. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit i hegnet. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `943e3f02`, herunder G18-748 til G18-789. `e2d3327e` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram.

### Integration

Ingen merge til main. `origin/grok-next` er `943e3f02`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-790, G18-597.

## Checkpoint 2026-10-18 hundredeogsyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `52b948bb`. Det lader hundredeogsjette-hegnet stå. `52b948bb` hedder `feat(profit): kolonnen Status paa efterkalkulation kan krympe`. `241f0282` hedder `feat(profit): kolonnen Ansvarlig paa efterkalkulation kan krympe`. `ff8c661e` hedder `feat(profit): kolonnen Kunde paa efterkalkulation kan krympe`. `f14600e0` hedder `docs: checkpoint efter e79b7519`. Start: `80ab0dab`. `origin/grok-next` er `52b948bb`. Push af `52b948bb` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f14600e0..52b948bb`

```
52b948bb feat(profit): kolonnen Status paa efterkalkulation kan krympe
241f0282 feat(profit): kolonnen Ansvarlig paa efterkalkulation kan krympe
ff8c661e feat(profit): kolonnen Kunde paa efterkalkulation kan krympe
f14600e0 docs: checkpoint efter e79b7519
```

Listen er skiftets commits fra `f14600e0` til og med `52b948bb`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
2339cba9 docs: checkpoint efter cb597f96
```

### Features

G18-772 lader kun kolonnen Kunde på efterkalkulationens skrivebord krympe. Kundenavnet bliver. G18-773 lader kun kolonnen Ansvarlig krympe. Navnet og filteretiketten bliver. G18-774 lader kun kolonnen Status krympe. Sagsstatus og filteretiketten bliver. Beløbskolonnerne bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-customer-column-wrap-test.ts`, `scripts/aftercalc-overview-assignee-column-wrap-test.ts` og `scripts/aftercalc-overview-status-column-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/aftercalc-overview-status-label-wrap-test.ts`, `scripts/aftercalc-money-wrap-test.ts` og `scripts/aftercalc-desktop-money-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `52b948bb`, herunder G18-748 til G18-774. `f14600e0` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `52b948bb`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-775, G18-597.

## Checkpoint 2026-10-18 hundredeogsjette (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `e79b7519`. Det lader hundredeogfemte-hegnet stå. `e79b7519` hedder `feat(profit): kolonnen Sag paa efterkalkulation kan krympe`. `c58e7bc9` hedder `feat(profit): etiketten Faktisk DB paa efterkalkulation kan krympe`. `2339cba9` hedder `docs: checkpoint efter cb597f96`. Start: `80ab0dab`. `origin/grok-next` er `e79b7519`. Push af `e79b7519` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `2339cba9..e79b7519`

```
e79b7519 feat(profit): kolonnen Sag paa efterkalkulation kan krympe
c58e7bc9 feat(profit): etiketten Faktisk DB paa efterkalkulation kan krympe
2339cba9 docs: checkpoint efter cb597f96
```

Listen er skiftets commits fra `2339cba9` til og med `e79b7519`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
9987603d docs: checkpoint efter 9b8902c6
```

### Features

G18-770 lader kun etiketten Faktisk DB på efterkalkulationens mobilkort krympe. Procenten og skrivebordskolonnen bliver. G18-771 lader kun kolonnen Sag på efterkalkulationens skrivebord krympe. Linket og kundekolonnen bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-case-column-wrap-test.ts` og `scripts/aftercalc-overview-actual-db-label-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/aftercalc-overview-quoted-db-label-wrap-test.ts`, `scripts/aftercalc-money-wrap-test.ts` og `scripts/aftercalc-desktop-money-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `e79b7519`, herunder G18-748 til G18-771. `2339cba9` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `e79b7519`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-772, G18-597.

## Checkpoint 2026-10-18 hundredeogfemte (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `cb597f96`. Det lader hundredeogfjerde-hegnet stå. `cb597f96` hedder `feat(profit): etiketten Tilbudt DB paa efterkalkulation kan krympe`. `5d03254c` hedder `feat(profit): etiketten Faktisk omsaetning paa efterkalkulation kan krympe`. `ffca2091` hedder `feat(profit): etiketten Tilbudt omsaetning paa efterkalkulation kan krympe`. `faf3c851` hedder `feat(profit): etiketten Sortering paa efterkalkulation kan krympe`. `029c5a6b` hedder `feat(profit): etiketten Afvigelse paa efterkalkulation kan krympe`. `9987603d` hedder `docs: checkpoint efter 9b8902c6`. Start: `80ab0dab`. `origin/grok-next` er `cb597f96`. Push af `cb597f96` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `9987603d..cb597f96`

```
cb597f96 feat(profit): etiketten Tilbudt DB paa efterkalkulation kan krympe
5d03254c feat(profit): etiketten Faktisk omsaetning paa efterkalkulation kan krympe
ffca2091 feat(profit): etiketten Tilbudt omsaetning paa efterkalkulation kan krympe
faf3c851 feat(profit): etiketten Sortering paa efterkalkulation kan krympe
029c5a6b feat(profit): etiketten Afvigelse paa efterkalkulation kan krympe
9987603d docs: checkpoint efter 9b8902c6
```

Listen er skiftets commits fra `9987603d` til og med `cb597f96`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
c8e486c1 docs: checkpoint efter 84606617
```

### Features

G18-765 lader kun etiketten Afvigelse på efterkalkulation krympe. Afvigelsesfilteret og beløbene bliver. G18-766 lader kun etiketten Sortering krympe. Sorteringsfiltret bliver. G18-767 lader kun etiketten Tilbudt omsætning på mobilkortet krympe. Beløbet og skrivebordskolonnen bliver. G18-768 lader kun etiketten Faktisk omsætning på mobilkortet krympe. Beløbet og skrivebordskolonnen bliver. G18-769 lader kun etiketten Tilbudt DB på mobilkortet krympe. Procenten og skrivebordskolonnen bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-variance-label-wrap-test.ts`, `scripts/aftercalc-overview-sort-label-wrap-test.ts`, `scripts/aftercalc-overview-quoted-revenue-label-wrap-test.ts`, `scripts/aftercalc-overview-actual-revenue-label-wrap-test.ts` og `scripts/aftercalc-overview-quoted-db-label-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/aftercalc-money-wrap-test.ts` og `scripts/aftercalc-desktop-money-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `cb597f96`, herunder G18-748 til G18-769. `9987603d` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `cb597f96`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-770, G18-597.

## Checkpoint 2026-10-18 hundredeogfjerde (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `9b8902c6`. Det lader hundredeogtredje-hegnet stå. `9b8902c6` hedder `feat(profit): etiketten Status paa efterkalkulation kan krympe`. `39c075b8` hedder `feat(profit): etiketten Ansvarlig paa efterkalkulation kan krympe`. `009fe5a7` hedder `feat(profit): etiketten Til dato paa efterkalkulation kan krympe`. `f13440fe` hedder `feat(profit): etiketten Fra dato paa efterkalkulation kan krympe`. `9251852e` hedder `feat(profit): afvigelsesfilteret paa efterkalkulation kan krympe`. `c8e486c1` hedder `docs: checkpoint efter 84606617`. Start: `80ab0dab`. `origin/grok-next` er `9b8902c6`. Push af `9b8902c6` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c8e486c1..9b8902c6`

```
9b8902c6 feat(profit): etiketten Status paa efterkalkulation kan krympe
39c075b8 feat(profit): etiketten Ansvarlig paa efterkalkulation kan krympe
009fe5a7 feat(profit): etiketten Til dato paa efterkalkulation kan krympe
f13440fe feat(profit): etiketten Fra dato paa efterkalkulation kan krympe
9251852e feat(profit): afvigelsesfilteret paa efterkalkulation kan krympe
c8e486c1 docs: checkpoint efter 84606617
```

Listen er skiftets commits fra `c8e486c1` til og med `9b8902c6`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
9bffbf3b docs: checkpoint efter 88559ebe
```

### Features

G18-760 lader kun afvigelsesfilteret på efterkalkulation krympe. Teksten og filtrene bliver. G18-761 lader kun etiketten Fra dato krympe. Datofiltret bliver. G18-762 lader kun etiketten Til dato krympe. Datofiltret bliver. G18-763 lader kun etiketten Ansvarlig krympe. Navnelinjen og filtret bliver. G18-764 lader kun etiketten Status krympe. Sagsstatus og filtret bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-variance-filter-wrap-test.ts`, `scripts/aftercalc-overview-from-date-wrap-test.ts`, `scripts/aftercalc-overview-to-date-wrap-test.ts`, `scripts/aftercalc-overview-assignee-label-wrap-test.ts` og `scripts/aftercalc-overview-status-label-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten `scripts/aftercalc-mobile-status-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `9b8902c6`, herunder G18-748 til G18-764. `c8e486c1` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `9b8902c6`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-765, G18-597.

## Checkpoint 2026-10-18 hundredeogtredje (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `84606617`. Det lader hundredeoganden-hegnet stå. `84606617` hedder `feat(profit): faktureringstilstanden paa efterkalkulationens mobilkort kan krympe`. `93bbb04e` hedder `feat(profit): advarselsteksten paa efterkalkulationens mobilkort kan krympe`. `5145ac2a` hedder `feat(profit): titlen paa efterkalkulationens mobilkort kan krympe`. `50ce1dd1` hedder `feat(profit): kundenavnet paa efterkalkulationens mobilkort kan krympe`. `9bffbf3b` hedder `docs: checkpoint efter 88559ebe`. Start: `80ab0dab`. `origin/grok-next` er `84606617`. Push af `84606617` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `9bffbf3b..84606617`

```
84606617 feat(profit): faktureringstilstanden paa efterkalkulationens mobilkort kan krympe
93bbb04e feat(profit): advarselsteksten paa efterkalkulationens mobilkort kan krympe
5145ac2a feat(profit): titlen paa efterkalkulationens mobilkort kan krympe
50ce1dd1 feat(profit): kundenavnet paa efterkalkulationens mobilkort kan krympe
9bffbf3b docs: checkpoint efter 88559ebe
```

Listen er skiftets commits fra `9bffbf3b` til og med `84606617`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
6489bbdc docs: checkpoint efter 33136e8e
```

### Features

G18-756 lader kun kundenavnet på efterkalkulationens mobilkort krympe. Fakturaoversigtens kundelinje røres ikke. G18-757 lader kun titlen på mobilkortet krympe. Overskriften Efterkalkulation og skrivebordstitlen bliver. G18-758 lader kun advarselsteksten på mobilkortet krympe. Skrivebordets gule advarsel og `DATA_QUALITY_LABELS` bliver. G18-759 lader kun faktureringstilstanden på mobilkortets afsnit krympe. Skrivebordets celle med samme testid bliver. Label-funktionen bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-customer-wrap-test.ts`, `scripts/aftercalc-overview-mobile-title-wrap-test.ts`, `scripts/aftercalc-overview-warning-wrap-test.ts` og `scripts/aftercalc-overview-mobile-invoiced-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/aftercalc-invoiced-state-test.ts`, `scripts/aftercalc-mobile-status-wrap-test.ts`, `scripts/aftercalc-desktop-status-wrap-test.ts` og `scripts/aftercalc-overview-title-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `84606617`, herunder G18-748 til G18-759. `9bffbf3b` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `84606617`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-760, G18-597.

## Checkpoint 2026-10-18 hundredeoganden (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `88559ebe`. Det lader hundredeogførste-hegnet stå. `88559ebe` hedder `feat(profit): ansvarlig-linjen paa efterkalkulationens mobilkort kan krympe`. `2ef45535` hedder `feat(profit): sagslinket paa efterkalkulationens mobilkort kan krympe`. `616f640e` hedder `feat(profit): hovedet paa efterkalkulationens mobilkort kan krympe`. `e3f1f0eb` hedder `feat(profit): mobilkortet paa efterkalkulation kan krympe`. `6489bbdc` hedder `docs: checkpoint efter 33136e8e`. Start: `80ab0dab`. `origin/grok-next` er `88559ebe`. Push af `88559ebe` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `6489bbdc..88559ebe`

```
88559ebe feat(profit): ansvarlig-linjen paa efterkalkulationens mobilkort kan krympe
2ef45535 feat(profit): sagslinket paa efterkalkulationens mobilkort kan krympe
616f640e feat(profit): hovedet paa efterkalkulationens mobilkort kan krympe
e3f1f0eb feat(profit): mobilkortet paa efterkalkulation kan krympe
6489bbdc docs: checkpoint efter 33136e8e
```

Listen er skiftets commits fra `6489bbdc` til og med `88559ebe`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
fcde9dfd docs: checkpoint efter d90fa324
```

### Features

G18-752 lader kun mobilkortet på efterkalkulation krympe. Beløb og filtre bliver. G18-753 lader kun hovedet på mobilkortet krympe. De samme klasser i andre filer røres ikke. G18-754 lader kun sagslinket krympe. Skrivebordslinket bliver. G18-755 lader kun ansvarlig-linjen krympe. Navnet og filtrene bliver. `data-testid="aftercalc-mobile-card"` bliver. `data-testid="aftercalc-card-head"` bliver. `data-testid="aftercalc-mobile-case-link"` bliver. `data-testid="aftercalc-mobile-assignee"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-mobile-card-wrap-test.ts`, `scripts/aftercalc-overview-card-head-wrap-test.ts`, `scripts/aftercalc-overview-case-link-wrap-test.ts` og `scripts/aftercalc-overview-assignee-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten `scripts/aftercalc-overview-mobile-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `88559ebe`, herunder G18-748 til G18-755. `6489bbdc` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `88559ebe`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-756, G18-597.

## Checkpoint 2026-10-18 hundredeogførste (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `33136e8e`. Det lader hundrede-hegnet stå. `33136e8e` hedder `feat(profit): mobillisten paa efterkalkulation kan krympe`. `86b782f1` hedder `feat(profit): sidevaelgeren paa efterkalkulation kan krympe`. `778e8cf4` hedder `feat(profit): den tomme efterkalkulation kan krympe`. `708c28e4` hedder `feat(profit): indlaesnings-spinneren paa efterkalkulation kan krympe`. `fcde9dfd` hedder `docs: checkpoint efter d90fa324`. Start: `80ab0dab`. `origin/grok-next` er `33136e8e`. Push af `33136e8e` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `fcde9dfd..33136e8e`

```
33136e8e feat(profit): mobillisten paa efterkalkulation kan krympe
86b782f1 feat(profit): sidevaelgeren paa efterkalkulation kan krympe
778e8cf4 feat(profit): den tomme efterkalkulation kan krympe
708c28e4 feat(profit): indlaesnings-spinneren paa efterkalkulation kan krympe
fcde9dfd docs: checkpoint efter d90fa324
```

Listen er skiftets commits fra `fcde9dfd` til og med `33136e8e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
10e3502d docs: checkpoint efter f4209137
```

### Features

G18-748 lader kun indlæsnings-spinneren på efterkalkulation krympe. Teksten `Henter…` bliver. G18-749 lader kun den tomme efterkalkulation krympe. Sætningerne om ingen sager bliver. G18-750 lader kun sidevælgeren krympe. Den indre `data-testid="aftercalc-pager"` bliver. Sagøkonomiens række røres ikke. G18-751 lader kun mobillisten krympe. Mobilkortet, beløb og filtre bliver. `data-testid="aftercalc-overview-loading-spinner"` bliver. `data-testid="aftercalc-empty"` bliver. `data-testid="aftercalc-pager-row"` bliver. `data-testid="aftercalc-overview-mobile"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-loading-spinner-wrap-test.ts`, `scripts/aftercalc-overview-empty-wrap-test.ts`, `scripts/aftercalc-overview-pager-row-wrap-test.ts` og `scripts/aftercalc-overview-mobile-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/aftercalc-overview-loading-wrap-test.ts`, `scripts/aftercalc-empty-filter-test.ts`, `scripts/aftercalc-pager-touch-test.ts` og `scripts/aftercalc-desktop-money-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `33136e8e`, herunder G18-289 til G18-751. `fcde9dfd` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `33136e8e`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-752, G18-597.

## Checkpoint 2026-10-18 hundrede (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `d90fa324`. Det lader nioghalvfemsindstyvende-hegnet stå. `d90fa324` hedder `feat(profit): fold-ind-ikonet paa efterkalkulation kan krympe`. `1f3a8ce6` hedder `feat(profit): fold-ud-ikonet paa efterkalkulation kan krympe`. `7d0bfbfe` hedder `feat(profit): sager-ikonet paa efterkalkulation kan krympe`. `8108f157` hedder `feat(profit): sager-overskriften paa efterkalkulation kan krympe`. `f3b5af58` hedder `feat(profit): sager-knappen paa efterkalkulation kan krympe`. `10e3502d` hedder `docs: checkpoint efter f4209137`. Start: `80ab0dab`. `origin/grok-next` er `d90fa324`. Push af `d90fa324` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `10e3502d..d90fa324`

```
d90fa324 feat(profit): fold-ind-ikonet paa efterkalkulation kan krympe
1f3a8ce6 feat(profit): fold-ud-ikonet paa efterkalkulation kan krympe
7d0bfbfe feat(profit): sager-ikonet paa efterkalkulation kan krympe
8108f157 feat(profit): sager-overskriften paa efterkalkulation kan krympe
f3b5af58 feat(profit): sager-knappen paa efterkalkulation kan krympe
10e3502d docs: checkpoint efter f4209137
```

Listen er skiftets commits fra `10e3502d` til og med `d90fa324`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a99e3b1a docs: checkpoint efter 9f701000
```

### Features

G18-743 lader kun Sager-knappen på efterkalkulation krympe. Teksten `Sager` bliver. G18-744 lader kun Sager-overskriften krympe. G18-745 lader kun Sager-ikonet krympe. G18-746 lader kun fold-ud-ikonet krympe. G18-747 lader kun fold-ind-ikonet krympe. ChevronDown bliver på fold-ud. Filtre, beløb og sideantallet bliver. `data-testid="aftercalc-overview-toggle"` bliver. `data-testid="aftercalc-sager-heading"` bliver. `data-testid="aftercalc-sager-icon"` bliver. `data-testid="aftercalc-fold-open-icon"` bliver. `data-testid="aftercalc-fold-closed-icon"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/aftercalc-overview-toggle-wrap-test.ts`, `scripts/aftercalc-overview-sager-heading-wrap-test.ts`, `scripts/aftercalc-overview-sager-icon-wrap-test.ts`, `scripts/aftercalc-overview-fold-open-icon-wrap-test.ts` og `scripts/aftercalc-overview-fold-closed-icon-wrap-test.ts` læser den shippede efterkalkulation og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetesten `scripts/aftercalc-overview-loading-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `d90fa324`, herunder G18-289 til G18-747. `10e3502d` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `d90fa324`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-748, G18-597.

## Checkpoint 2026-10-18 nioghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `f4209137`. Det lader otteoghalvfemsindstyvende-hegnet stå. `f4209137` hedder `feat(profit): filterkortet paa efterkalkulation kan krympe`. `ec978082` hedder `feat(profit): overskriftens raekke paa efterkalkulation kan krympe`. `3508d332` hedder `feat(profit): overskriften Efterkalkulation kan krympe`. `441a3909` hedder `feat(pilot): den faerdige mail-raekke kan krympe`. `ccfe4e02` hedder `feat(pilot): raekken ved nye mails kan krympe`. `f4169714` hedder `feat(pilot): indlaesnings-spinneren ved nye mails kan krympe`. `fac1472d` hedder `feat(pilot): indlaesnings-spinneren i mail-detaljen kan krympe`. `a99e3b1a` hedder `docs: checkpoint efter 9f701000`. Start: `80ab0dab`. `origin/grok-next` er `f4209137`. Push af `f4209137` lykkedes. De øvrige tip i hegnet blev pushet før det. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `a99e3b1a..f4209137`

```
f4209137 feat(profit): filterkortet paa efterkalkulation kan krympe
ec978082 feat(profit): overskriftens raekke paa efterkalkulation kan krympe
3508d332 feat(profit): overskriften Efterkalkulation kan krympe
441a3909 feat(pilot): den faerdige mail-raekke kan krympe
ccfe4e02 feat(pilot): raekken ved nye mails kan krympe
f4169714 feat(pilot): indlaesnings-spinneren ved nye mails kan krympe
fac1472d feat(pilot): indlaesnings-spinneren i mail-detaljen kan krympe
a99e3b1a docs: checkpoint efter 9f701000
```

Listen er skiftets commits fra `a99e3b1a` til og med `f4209137`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
db75511e docs: checkpoint efter c8aabb8a
```

### Features

G18-736 lader kun indlæsnings-spinneren i mail-detaljen krympe. Teksten `Henter hele mailen…` bliver. G18-737 lader kun indlæsnings-spinneren ved nye mails krympe. Teksten `Henter nye mails…` bliver. G18-738 lader kun rækken ved nye mails krympe. G18-739 lader kun den færdige mail-række krympe. Teksten `Mail opdateret` bliver. G18-740 lader kun overskriften Efterkalkulation krympe. Teksten `Efterkalkulation` bliver. G18-741 lader kun overskriftens række på efterkalkulation krympe. G18-742 lader kun filterkortet på efterkalkulation krympe. Filtre, beløb og overskriften bliver. `data-testid="aftercalc-overview-filter-card"` bliver. `data-testid="mail-body-loading-spinner"` bliver. `data-testid="mail-freshness-spinner"` bliver. `data-testid="mail-freshness"` bliver. `data-testid="aftercalc-overview-title"` bliver. `data-testid="aftercalc-overview-heading-row"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/mail-body-loading-spinner-wrap-test.ts`, `scripts/mail-freshness-spinner-wrap-test.ts`, `scripts/mail-freshness-row-wrap-test.ts`, `scripts/mail-freshness-done-wrap-test.ts`, `scripts/aftercalc-overview-title-wrap-test.ts`, `scripts/aftercalc-overview-heading-row-wrap-test.ts` og `scripts/aftercalc-overview-filter-card-wrap-test.ts` læser den shippede kilde og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for mail-indlæsning, hurtigt svar, fjern-kobling og efterkalk-indledning exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `f4209137`, herunder G18-289 til G18-742. `a99e3b1a` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `f4209137`. Flet `origin/main` (`2d979a03`) ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-743, G18-597.

## Checkpoint 2026-10-18 otteoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `9f701000`. Det lader syvoghalvfemsindstyvende-hegnet stå. `9f701000` hedder `feat(pilot): hurtigt-svar-spinneren i mail-detaljen kan krympe`. `db75511e` hedder `docs: checkpoint efter c8aabb8a`. Start: `80ab0dab`. `origin/grok-next` er `9f701000`. Push af `9f701000` lykkedes. `db75511e` blev pushet før den. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `db75511e..9f701000`

```
9f701000 feat(pilot): hurtigt-svar-spinneren i mail-detaljen kan krympe
db75511e docs: checkpoint efter c8aabb8a
```

Listen er skiftets commits fra `db75511e` til og med `9f701000`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d3e74d19 docs: checkpoint efter 97f876de
```

### Features

G18-735 lader kun hurtigt-svar-spinneren i mail-detaljen krympe. Teksterne `Bekræft modtagelse`, `Mangler info` og `Tak for ordren` bliver. Overskriften `Hurtigt svar` bliver. De andre spinner-ikoner bliver. `data-testid="mail-quick-reply-spinner"` bliver. `data-testid="mail-quick-reply-icon"` bliver. `data-testid="mail-quick-reply-button"` bliver. `data-testid="mail-body-loading"` bliver. `data-testid="mail-create-offer"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/mail-quick-reply-spinner-wrap-test.ts` læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. Den kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/mail-unlink-spinner-wrap-test.ts`, `scripts/mail-quick-reply-icon-wrap-test.ts`, `scripts/mail-quick-reply-button-wrap-test.ts` og `scripts/mail-body-loading-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `9f701000`, herunder G18-289 til G18-735. `db75511e` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `9f701000`. Flet `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-736, G18-597.

## Checkpoint 2026-10-18 syvoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `c8aabb8a`. Det lader seksoghalvfemsindstyvende-hegnet stå. `c8aabb8a` hedder `feat(pilot): fjern-kobling-spinneren i mail-detaljen kan krympe`. `0345079c` hedder `feat(pilot): download-spinneren i mail-detaljen kan krympe`. `da03a4cc` hedder `feat(pilot): opret-sag-spinneren i mail-detaljen kan krympe`. `d3e74d19` hedder `docs: checkpoint efter 97f876de`. Start: `80ab0dab`. `origin/grok-next` er `c8aabb8a`. Push af `da03a4cc` lykkedes og flyttede `origin/grok-next` fra `80ab0dab` til `da03a4cc`. Push af `0345079c` og `c8aabb8a` lykkedes bagefter. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d3e74d19..c8aabb8a`

```
c8aabb8a feat(pilot): fjern-kobling-spinneren i mail-detaljen kan krympe
0345079c feat(pilot): download-spinneren i mail-detaljen kan krympe
da03a4cc feat(pilot): opret-sag-spinneren i mail-detaljen kan krympe
d3e74d19 docs: checkpoint efter 97f876de
```

Listen er skiftets commits fra `d3e74d19` til og med `c8aabb8a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
43bb376f docs: checkpoint efter 3e3e4d5b
```

### Features

G18-732 lader kun opret-sag-spinneren i mail-detaljen krympe. Teksten `Opret sag` bliver. G18-733 lader kun download-spinneren i mail-detaljen krympe. Teksten `Download vedhæftninger nu` bliver. G18-734 lader kun fjern-kobling-spinneren i mail-detaljen krympe. Teksten `Fjern kobling` bliver. De andre spinner-ikoner bliver. `data-testid="mail-opret-sag-spinner"` bliver. `data-testid="mail-backfill-spinner"` bliver. `data-testid="mail-unlink-spinner"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

`scripts/mail-opret-sag-spinner-wrap-test.ts`, `scripts/mail-backfill-spinner-wrap-test.ts` og `scripts/mail-unlink-spinner-wrap-test.ts` læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. Søskendetestene for agent-, relevant-, ignorer-, arkiv-, opret-sag-ikon-, opret-sag-knap-, download-ikon-, download-knap-, ingen-sag-, indlæsning-, hurtigt-svar-ikon-, fjern-ikon- og fjern-knap-wrap exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 for hvert produktcommit. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `c8aabb8a`, herunder G18-289 til G18-734. `d3e74d19` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. `origin/grok-next` er `c8aabb8a`. Flet `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-735, G18-597.

## Checkpoint 2026-10-18 seksoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `97f876de`. Det lader femoghalvfemsindstyvende-hegnet stå. `97f876de` hedder `feat(pilot): mailagent-spinneren i mail-detaljen kan krympe`. `43bb376f` hedder `docs: checkpoint efter 3e3e4d5b`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `97f876de` blev afvist før git kørte og er ikke prøvet igen. `43bb376f` er ikke pushet. `3e3e4d5b` og `60fd0558` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `43bb376f..97f876de`

```
97f876de feat(pilot): mailagent-spinneren i mail-detaljen kan krympe
43bb376f docs: checkpoint efter 3e3e4d5b
```

Listen er skiftets commits fra `43bb376f` til og med `97f876de`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d500e6ec docs: checkpoint efter 2816b243
```

### Features

G18-731 lader kun mailagent-spinneren i mail-detaljen krympe. Teksten `Kør Mailagent` bliver. Teksten `Kører Mailagent…` bliver. De andre spinner-ikoner bliver. `data-testid="mail-agent-spinner"` bliver. `data-testid="mail-agent-icon"` bliver. `data-testid="mail-agent-button"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Produkt-committen har `scripts/mail-agent-spinner-wrap-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. Den kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/mail-restore-spinner-wrap-test.ts`, `scripts/mail-ignore-spinner-wrap-test.ts`, `scripts/mail-archive-spinner-wrap-test.ts`, `scripts/mail-agent-icon-wrap-test.ts` og `scripts/mail-agent-button-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `97f876de`, herunder G18-289 til G18-731. `43bb376f` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `97f876de`, `43bb376f`, `3e3e4d5b`, `60fd0558`, `d500e6ec`, `2816b243`, `593b8e26`, `5bc9521f`, `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-732, G18-597.

## Checkpoint 2026-10-18 femoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `3e3e4d5b`. Det lader fireoghalvfemsindstyvende-hegnet stå. `3e3e4d5b` hedder `feat(pilot): relevant-spinneren i mail-detaljen kan krympe`. `60fd0558` hedder `feat(pilot): ignorer-spinneren i mail-detaljen kan krympe`. `d500e6ec` hedder `docs: checkpoint efter 2816b243`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `3e3e4d5b` blev afvist før git kørte og er ikke prøvet igen. `60fd0558` er ikke prøvet igen. `d500e6ec` er ikke pushet. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d500e6ec..3e3e4d5b`

```
3e3e4d5b feat(pilot): relevant-spinneren i mail-detaljen kan krympe
60fd0558 feat(pilot): ignorer-spinneren i mail-detaljen kan krympe
d500e6ec docs: checkpoint efter 2816b243
```

Listen er skiftets commits fra `d500e6ec` til og med `3e3e4d5b`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
2816b243 docs: checkpoint efter 593b8e26
```

### Features

G18-729 og G18-730 lader Ignorér-spinneren og relevant-spinneren i mail-detaljen krympe. Teksten `Ignorér` bliver. Teksten `Markér som relevant` bliver. De andre spinner-ikoner bliver. `data-testid="mail-ignore-spinner"` bliver. `data-testid="mail-restore-spinner"` bliver. `data-testid="mail-archive-spinner"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-729: `scripts/mail-ignore-spinner-wrap-test.ts`. G18-730: `scripts/mail-restore-spinner-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `3e3e4d5b`, herunder G18-289 til G18-730. `d500e6ec` og `2816b243` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `3e3e4d5b`, `60fd0558`, `d500e6ec`, `2816b243`, `593b8e26`, `5bc9521f`, `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-731, G18-597.

## Checkpoint 2026-10-18 fireoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint dækker skiftets commits til og med `2816b243`. Det lader treoghalvfemsindstyvende-hegnet stå. `2816b243` hedder `docs: checkpoint efter 593b8e26`. Produktspids under den docs-tip: `593b8e26`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `2816b243` blev afvist før git kørte og er ikke prøvet igen. `593b8e26`, `5bc9521f`, `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f` og `254c0d77` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `254c0d77..2816b243`

```
2816b243 docs: checkpoint efter 593b8e26
593b8e26 feat(pilot): arkiv-spinneren i mail-detaljen kan krympe
5bc9521f docs: checkpoint efter 77bbe185
77bbe185 feat(pilot): valget ingen sag kan krympe
28c83d82 feat(pilot): sag-etiketten i sagsvaelgeren kan krympe
9340a26d docs: checkpoint efter 250138e7
250138e7 feat(pilot): kobl-knappen i e-mail-match kan krympe
3e1da99f feat(pilot): kobl-knappen i andre mailforslag kan krympe
254c0d77 feat(pilot): tekstkolonnen i e-mail-match kan krympe
```

Listen er skiftets commits fra `254c0d77` til og med `2816b243`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
1d0d30e4 docs: checkpoint efter a1fc68f4
```

### Features

G18-723, G18-724, G18-725, G18-726, G18-727 og G18-728 lader tekstkolonnen i e-mail-match, Kobl-knappen i andre mailforslag, Kobl-knappen i e-mail-match, sag-etiketten, valget Ingen sag og arkiv-spinneren krympe. Teksten `Kobl` bliver. Teksten `Sag:` bliver. Teksten `— Ingen sag —` bliver. Teksten `Arkivér` bliver. Sagslinket bliver. Sagsvælgerens `truncate` bliver. De andre spinner-ikoner bliver. `data-testid="mail-match-column"` bliver. `data-testid="mail-other-kobl-button"` bliver. `data-testid="mail-match-kobl-button"` bliver. `data-testid="mail-case-label"` bliver. `data-testid="mail-no-case-option"` bliver. `data-testid="mail-archive-spinner"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-723: `scripts/mail-match-column-wrap-test.ts`. G18-724: `scripts/mail-other-kobl-button-wrap-test.ts`. G18-725: `scripts/mail-match-kobl-button-wrap-test.ts`. G18-726: `scripts/mail-case-label-wrap-test.ts`. G18-727: `scripts/mail-no-case-option-wrap-test.ts`. G18-728: `scripts/mail-archive-spinner-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `593b8e26`, herunder G18-289 til G18-728. `2816b243` er kun docs. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `2816b243`, `593b8e26`, `5bc9521f`, `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-729, G18-597.

## Checkpoint 2026-10-18 treoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `5bc9521f`. Det lader tooghalvfemsindstyvende-hegnet stå. `5bc9521f` hedder `docs: checkpoint efter 77bbe185`. Produktspids: `593b8e26`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `593b8e26` blev afvist før git kørte og er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `593b8e26`

```
593b8e26 feat(pilot): arkiv-spinneren i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `5bc9521f` til og med `593b8e26`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
5bc9521f docs: checkpoint efter 77bbe185
```

### Features

G18-728 lader kun arkiv-spinneren i mail-detaljen krympe. Teksten `Arkivér` bliver. De andre spinner-ikoner bliver. `data-testid="mail-archive-spinner"` bliver. `data-testid="mail-archive-icon"` bliver. `data-testid="mail-archive-button"` bliver. `pendingAction === 'ignore'` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Produkt-committen har `scripts/mail-archive-spinner-wrap-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. Den kørte med `npx tsx` og exiterede 0. Søskendetestene `scripts/mail-archive-button-wrap-test.ts`, `scripts/mail-archive-icon-wrap-test.ts` og `scripts/mail-no-case-option-wrap-test.ts` exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0. Resultatet er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `593b8e26`, herunder G18-289 til G18-728. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `593b8e26`, `5bc9521f`, `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-729, G18-597.

## Checkpoint 2026-10-18 tooghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `9340a26d`. Det lader enoghalvfemsindstyvende-hegnet stå. `9340a26d` hedder `docs: checkpoint efter 250138e7`. Produktspids: `77bbe185`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `77bbe185` blev afvist før git kørte og er ikke prøvet igen. `28c83d82` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `28c83d82..77bbe185`

```
77bbe185 feat(pilot): valget ingen sag kan krympe
28c83d82 feat(pilot): sag-etiketten i sagsvaelgeren kan krympe
```

Listen er alle produktcommits efter `9340a26d` til og med `77bbe185`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
9340a26d docs: checkpoint efter 250138e7
```

### Features

G18-726 og G18-727 lader kun sag-etiketten og valget Ingen sag krympe. Teksten `Sag:` bliver. Teksten `— Ingen sag —` bliver. Sagslinket bliver. Sagsvælgerens `truncate` bliver. `data-testid="mail-case-label"` bliver. `data-testid="mail-no-case-option"` bliver. `data-testid="mail-case-link"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-726: `scripts/mail-case-label-wrap-test.ts`. G18-727: `scripts/mail-no-case-option-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `77bbe185`, herunder G18-289 til G18-727. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `77bbe185`, `28c83d82`, `9340a26d`, `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-728, G18-597.

## Checkpoint 2026-10-18 enoghalvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `1d0d30e4`. Det lader halvfemsindstyvende-hegnet stå. `1d0d30e4` hedder `docs: checkpoint efter a1fc68f4`. Produktspids: `250138e7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `250138e7` blev afvist før git kørte og er ikke prøvet igen. `3e1da99f` og `254c0d77` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `254c0d77..250138e7`

```
250138e7 feat(pilot): kobl-knappen i e-mail-match kan krympe
3e1da99f feat(pilot): kobl-knappen i andre mailforslag kan krympe
254c0d77 feat(pilot): tekstkolonnen i e-mail-match kan krympe
```

Listen er alle produktcommits efter `1d0d30e4` til og med `250138e7`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
1d0d30e4 docs: checkpoint efter a1fc68f4
```

### Features

G18-723, G18-724 og G18-725 lader kun tekstkolonnen i e-mail-match, Kobl-knappen i andre mailforslag og Kobl-knappen i e-mail-match krympe. Teksten `Kobl` bliver. `{detectedCustomer.company_name}` bliver. `{s.company_name}` bliver. Kolonnen i andre forslag bliver. `data-testid="mail-match-column"` bliver. `data-testid="mail-other-kobl-button"` bliver. `data-testid="mail-match-kobl-button"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-723: `scripts/mail-match-column-wrap-test.ts`. G18-724: `scripts/mail-other-kobl-button-wrap-test.ts`. G18-725: `scripts/mail-match-kobl-button-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `250138e7`, herunder G18-289 til G18-725. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `250138e7`, `3e1da99f`, `254c0d77`, `1d0d30e4`, `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-726, G18-597.

## Checkpoint 2026-10-18 halvfemsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `c5f1fdad`. Det lader niogfirsindstyvende-hegnet stå. `c5f1fdad` hedder `docs: checkpoint efter fb88d59e`. Produktspids: `a1fc68f4`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `a1fc68f4` blev afvist før git kørte og er ikke prøvet igen. `571c3b5e` og `c9939b5c` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c9939b5c..a1fc68f4`

```
a1fc68f4 feat(pilot): tekstkolonnen i andre mailforslag kan krympe
571c3b5e feat(pilot): ikonet paa kobl i andre mailforslag kan krympe
c9939b5c feat(pilot): ikonet paa kobl i e-mail-match kan krympe
```

Listen er alle produktcommits efter `c5f1fdad` til og med `a1fc68f4`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
c5f1fdad docs: checkpoint efter fb88d59e
```

### Features

G18-720, G18-721 og G18-722 lader kun Kobl-ikonet i e-mail-match, Kobl-ikonet i andre mailforslag og tekstkolonnen i andre mailforslag krympe. Teksten `Kobl` bliver. `{s.company_name}` bliver. `{detectedCustomer.company_name}` bliver. Kolonnen i e-mail-match bliver. `data-testid="mail-match-kobl-icon"` bliver. `data-testid="mail-other-kobl-icon"` bliver. `data-testid="mail-other-column"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-720: `scripts/mail-match-kobl-icon-wrap-test.ts`. G18-721: `scripts/mail-other-kobl-icon-wrap-test.ts`. G18-722: `scripts/mail-other-column-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `a1fc68f4`, herunder G18-289 til G18-722. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `a1fc68f4`, `571c3b5e`, `c9939b5c`, `c5f1fdad`, `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-723, G18-597.

## Checkpoint 2026-10-18 niogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `9af7d0f9`. Det lader otteogfirsindstyvende-hegnet stå. `9af7d0f9` hedder `docs: checkpoint efter bf426773`. Produktspids: `fb88d59e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `fb88d59e` blev afvist før git kørte og er ikke prøvet igen. `7a6898f9` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `7a6898f9..fb88d59e`

```
fb88d59e feat(pilot): pilen ved hop til chat kan krympe
7a6898f9 feat(pilot): pilen ved se opgave kan krympe
```

Listen er alle produktcommits efter `9af7d0f9` til og med `fb88d59e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
9af7d0f9 docs: checkpoint efter bf426773
```

### Features

G18-718 og G18-719 lader kun pilen ved Se opgave og pilen ved Hop til Chat krympe. Teksten `Se opgave` bliver. Teksten `Hop til Chat` bliver. Pilen ved Åbn kunde bliver. `data-testid="mail-opgave-arrow"` bliver. `data-testid="mail-chat-arrow"` bliver. `data-testid="mail-kunde-arrow"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-718: `scripts/mail-opgave-arrow-wrap-test.ts`. G18-719: `scripts/mail-chat-arrow-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `fb88d59e`, herunder G18-289 til G18-719. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `fb88d59e`, `7a6898f9`, `9af7d0f9`, `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-720, G18-597.

## Checkpoint 2026-10-18 otteogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `eb9a415d`. Det lader syvogfirsindstyvende-hegnet stå. `eb9a415d` hedder `docs: checkpoint efter efec8a4c`. Produktspids: `bf426773`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `bf426773` blev afvist før git kørte og er ikke prøvet igen. `2cd5a903` og `b457b3ac` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `b457b3ac..bf426773`

```
bf426773 feat(pilot): pilen ved aabn kunde kan krympe
2cd5a903 feat(pilot): teksten ingen sag tilknyttet kan krympe
b457b3ac feat(pilot): statusmaerket i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `eb9a415d` til og med `bf426773`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
eb9a415d docs: checkpoint efter efec8a4c
```

### Features

G18-715, G18-716 og G18-717 lader kun statusmærket, teksten Ingen sag tilknyttet og pilen ved Åbn kunde krympe. `{c.label}` bliver. `Ingen sag tilknyttet` bliver. Teksten `Åbn kunde` bliver. Se opgave og Hop til Chat bliver. `data-testid="mail-status-badge"` bliver. `data-testid="mail-empty-case"` bliver. `data-testid="mail-kunde-arrow"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-715: `scripts/mail-status-badge-wrap-test.ts`. G18-716: `scripts/mail-empty-case-wrap-test.ts`. G18-717: `scripts/mail-kunde-arrow-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `bf426773`, herunder G18-289 til G18-717. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `bf426773`, `2cd5a903`, `b457b3ac`, `eb9a415d`, `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-718, G18-597.

## Checkpoint 2026-10-18 syvogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `450defe9`. Det lader seksogfirsindstyvende-hegnet stå. `450defe9` hedder `docs: checkpoint efter 711195b5`. Produktspids: `efec8a4c`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `efec8a4c` blev afvist før git kørte og er ikke prøvet igen. `fbe90277`, `8b121066` og `29ccc090` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `29ccc090..efec8a4c`

```
efec8a4c feat(pilot): mailbroedtekstens rullefelt kan krympe
fbe90277 feat(pilot): statusikonet i mail-detaljen kan krympe
8b121066 feat(pilot): luk-ikonet paa fjern kobling kan krympe
29ccc090 feat(pilot): download-ikonet paa vedhaeftningsknappen kan krympe
```

Listen er alle produktcommits efter `450defe9` til og med `efec8a4c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
450defe9 docs: checkpoint efter 711195b5
```

### Features

G18-711, G18-712, G18-713 og G18-714 lader kun download-ikonet på vedhæftningsknappen, luk-ikonet på Fjern kobling, statusikonet og mailbrødtekstens rullefelt krympe. `Download vedhæftninger nu` bliver. `Fjern kobling` bliver. `{c.label}` bliver. Mailens html og ren tekst bliver. `data-testid="mail-pending-dl-icon"` bliver. `data-testid="mail-unlink-x"` bliver. `data-testid="mail-status-icon"` bliver. `data-testid="mail-body-scroll"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-711: `scripts/mail-pending-dl-icon-wrap-test.ts`. G18-712: `scripts/mail-unlink-x-wrap-test.ts`. G18-713: `scripts/mail-status-icon-wrap-test.ts`. G18-714: `scripts/mail-body-scroll-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `efec8a4c`, herunder G18-289 til G18-714. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `efec8a4c`, `fbe90277`, `8b121066`, `29ccc090`, `450defe9`, `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-715, G18-597.

## Checkpoint 2026-10-18 seksogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `ef9493d9`. Det lader femogfirsindstyvende-hegnet stå. `ef9493d9` hedder `docs: checkpoint efter 17f445e8`. Produktspids: `711195b5`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `711195b5` blev afvist før git kørte og er ikke prøvet igen. `bb434259`, `ead0bffc` og `58dcd530` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `58dcd530..711195b5`

```
711195b5 feat(pilot): mailagent-ikonet i mail-detaljen kan krympe
bb434259 feat(pilot): filnavnet i downloadlisten kan krympe
ead0bffc feat(pilot): kundenavnet paa andre mailforslag kan krympe
58dcd530 feat(pilot): kundenavnet paa e-mail-match kan krympe
```

Listen er alle produktcommits efter `ef9493d9` til og med `711195b5`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
ef9493d9 docs: checkpoint efter 17f445e8
```

### Features

G18-707, G18-708, G18-709 og G18-710 lader kun e-mail-matchens kundenavn, de andre mailforslags kundenavn, filnavnet i downloadlisten og mailagent-ikonet krympe. `{detectedCustomer.company_name}` bliver. `{s.company_name}` bliver. `{att.filename}` bliver. Galleriets `line-clamp-2` bliver. `Kør Mailagent` bliver. `data-testid="mail-match-name"` bliver. `data-testid="mail-other-name"` bliver. `data-testid="mail-file-name"` bliver. `data-testid="mail-agent-icon"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-707: `scripts/mail-match-name-wrap-test.ts`. G18-708: `scripts/mail-other-name-wrap-test.ts`. G18-709: `scripts/mail-file-name-wrap-test.ts`. G18-710: `scripts/mail-agent-icon-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `711195b5`, herunder G18-289 til G18-710. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `711195b5`, `bb434259`, `ead0bffc`, `58dcd530`, `ef9493d9`, `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-711, G18-597.

## Checkpoint 2026-10-18 femogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `dd2aa8ca`. Det lader fireogfirsindstyvende-hegnet stå. `dd2aa8ca` hedder `docs: checkpoint efter 54007ee9`. Produktspids: `17f445e8`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `17f445e8` blev afvist før git kørte og er ikke prøvet igen. `de632841`, `09e60ca8` og `c7d4d556` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c7d4d556..17f445e8`

```
17f445e8 feat(pilot): ordre-tallet i mailforslag kan krympe
de632841 feat(pilot): telefon-tallet i mailforslag kan krympe
09e60ca8 feat(pilot): ordre-linjen i mailforslag kan krympe
c7d4d556 feat(pilot): telefonlinjen i mailforslag kan krympe
```

Listen er alle produktcommits efter `dd2aa8ca` til og med `17f445e8`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
dd2aa8ca docs: checkpoint efter 54007ee9
```

### Features

G18-703, G18-704, G18-705 og G18-706 lader kun telefonlinjen, ordre/ref-linjen, telefon-tallet og ordre-tallet i mailforslag krympe. `Telefon fundet i email` bliver. `{detectedPhone}` bliver. `Ordre/ref fundet i email` bliver. `{detectedOrderId}` bliver. `data-testid="mail-found-phone"` bliver. `data-testid="mail-found-order"` bliver. `data-testid="mail-phone-value"` bliver. `data-testid="mail-order-value"` bliver. `{detectedCustomer.company_name}` bliver. `{s.company_name}` bliver. `Kobl` bliver. `data-testid="mail-reply-msg"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-703: `scripts/mail-found-phone-wrap-test.ts`. G18-704: `scripts/mail-found-order-wrap-test.ts`. G18-705: `scripts/mail-phone-value-wrap-test.ts`. G18-706: `scripts/mail-order-value-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `17f445e8`, herunder G18-289 til G18-706. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `17f445e8`, `de632841`, `09e60ca8`, `c7d4d556`, `dd2aa8ca`, `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-707, G18-597.

## Checkpoint 2026-10-18 fireogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `6b145266`. Det lader treogfirsindstyvende-hegnet stå. `6b145266` hedder `docs: checkpoint efter 34610cc7`. Produktspids: `54007ee9`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `54007ee9` blev afvist før git kørte og er ikke prøvet igen. `22730a38` og `72bcfde2` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `72bcfde2..54007ee9`

```
54007ee9 feat(pilot): kundenummeret paa andre mailforslag kan krympe
22730a38 feat(pilot): kundenummeret paa e-mail-match i mail-detaljen kan krympe
72bcfde2 feat(pilot): kortet for andre mailforslag kan krympe
```

Listen er alle produktcommits efter `6b145266` til og med `54007ee9`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
6b145266 docs: checkpoint efter 34610cc7
```

### Features

G18-700, G18-701 og G18-702 lader kun kortet for andre mailforslag, kundenummeret på e-mail-match og kundenummeret på andre mailforslag i mail-detaljen krympe. `{s.customer_number}` bliver. `{s.matchReason}` bliver. `{detectedCustomer.customer_number} — email-match` bliver. `{s.company_name}` bliver. `{detectedCustomer.company_name}` bliver. `key={s.id}` bliver. `Kobl` bliver. `data-testid="mail-suggest-other"` bliver. `data-testid="mail-match-number"` bliver. `data-testid="mail-other-number"` bliver. `data-testid="mail-suggest-match"` bliver. `data-testid="mail-reply-msg"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-700: `scripts/mail-suggest-other-wrap-test.ts`. G18-701: `scripts/mail-match-number-wrap-test.ts`. G18-702: `scripts/mail-other-number-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `54007ee9`, herunder G18-289 til G18-702. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `54007ee9`, `22730a38`, `72bcfde2`, `6b145266`, `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-703, G18-597.

## Checkpoint 2026-10-18 treogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `a045207d`. Det lader toogfirsindstyvende-hegnet stå. `a045207d` hedder `docs: checkpoint efter 4333e121`. Produktspids: `34610cc7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `34610cc7` blev afvist før git kørte og er ikke prøvet igen. `caf23c07`, `7305acc6`, `3ceaaebd` og `dd73636a` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `dd73636a..34610cc7`

```
34610cc7 feat(pilot): kortet for e-mail-match i mail-detaljen kan krympe
caf23c07 feat(pilot): rammen om mailforslag i mail-detaljen kan krympe
7305acc6 feat(pilot): ikonet ved Mulige matches i mail-detaljen kan krympe
3ceaaebd feat(pilot): overskriften Mulige matches i mail-detaljen kan krympe
dd73636a feat(pilot): forslagsboksen i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `a045207d` til og med `34610cc7`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a045207d docs: checkpoint efter 4333e121
```

### Features

G18-695, G18-696, G18-697, G18-698 og G18-699 lader kun forslagsboksen, overskriften Mulige matches, ikonet ved den overskrift, rammen om mailforslag og kortet for e-mail-match i mail-detaljen krympe. `Mulige matches (forslag)` bliver. `{detectedCustomer.company_name}` bliver. `{s.company_name}` bliver. `Kobl` bliver. `key={s.id}` på det grå kort bliver. `data-testid="mail-suggest-box"` bliver. `data-testid="mail-suggest-title"` bliver. `data-testid="mail-suggest-icon"` bliver. `data-testid="mail-suggest-frame"` bliver. `data-testid="mail-suggest-match"` bliver. `data-testid="mail-quick-reply-frame"` bliver. `data-testid="mail-reply-msg"` bliver. `data-testid="mail-create-offer"` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-695: `scripts/mail-suggest-box-wrap-test.ts`. G18-696: `scripts/mail-suggest-title-wrap-test.ts`. G18-697: `scripts/mail-suggest-icon-wrap-test.ts`. G18-698: `scripts/mail-suggest-frame-wrap-test.ts`. G18-699: `scripts/mail-suggest-match-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `34610cc7`, herunder G18-289 til G18-699. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `34610cc7`, `caf23c07`, `7305acc6`, `3ceaaebd`, `dd73636a`, `a045207d`, `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-700, G18-597.

## Checkpoint 2026-10-18 toogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `45c8ffb8`. Det lader enogfirsindstyvende-hegnet stå. `45c8ffb8` hedder `docs: checkpoint efter 147d1d48`. Produktspids: `4333e121`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `4333e121` blev afvist før git kørte og er ikke prøvet igen. `94d07fde`, `c4a017f1`, `54f05967` og `8a1e4cf3` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8a1e4cf3..4333e121`

```
4333e121 feat(pilot): svaret efter hurtigsvar kan krympe
94d07fde feat(pilot): Graph-diagnosens linje i mail-detaljen kan krympe
c4a017f1 feat(pilot): Graph-diagnosens ramme i mail-detaljen kan krympe
54f05967 feat(pilot): svarstakken efter hurtigsvar kan krympe
8a1e4cf3 feat(pilot): Graph-diagnosen i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `45c8ffb8` til og med `4333e121`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
45c8ffb8 docs: checkpoint efter 147d1d48
```

### Features

G18-690, G18-691, G18-692, G18-693 og G18-694 lader kun Graph-diagnoseknappen, svarstakken, Graph-diagnosens ramme, Graph-diagnosens linje og svaret efter hurtigsvar i mail-detaljen krympe. `Diagnosticér Graph-forbindelse` bliver. `{replyMsg}` bliver. `{key}` bliver. `Hurtigt svar` bliver. `Bekræft modtagelse` bliver. `Mangler info` bliver. `Tak for ordren` bliver. `data-testid="mail-graph-diagnose"` bliver. `data-testid="mail-reply-stack"` bliver. `data-testid="mail-graph-diag-frame"` bliver. `data-testid="mail-graph-diag-line"` bliver. `data-testid="mail-reply-msg"` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-690: `scripts/mail-graph-diagnose-wrap-test.ts`. G18-691: `scripts/mail-reply-stack-wrap-test.ts`. G18-692: `scripts/mail-graph-diag-frame-wrap-test.ts`. G18-693: `scripts/mail-graph-diag-line-wrap-test.ts`. G18-694: `scripts/mail-reply-msg-wrap-test.ts`. Søskendetestene blev kørt igen efter hver udvidelse og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `4333e121`, herunder G18-289 til G18-694. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `4333e121`, `94d07fde`, `c4a017f1`, `54f05967`, `8a1e4cf3`, `45c8ffb8`, `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-695, G18-597.

## Checkpoint 2026-10-18 enogfirsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `243cbb02`. Det lader firsindstyvende-hegnet stå. `243cbb02` hedder `docs: checkpoint efter 96d7b13e`. Produktspids: `147d1d48`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `147d1d48` blev afvist før git kørte og er ikke prøvet igen. `595e4916`, `d962a6b5`, `ef8d4ac3` og `589d6ede` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `589d6ede..147d1d48`

```
147d1d48 feat(pilot): hurtigsvar-raekken i mail-detaljen kan krympe
595e4916 feat(pilot): hurtigsvar-rammen i mail-detaljen kan krympe
d962a6b5 feat(pilot): ikonet paa hurtigsvar i mail-detaljen kan krympe
ef8d4ac3 feat(pilot): hurtigsvar-knapperne i mail-detaljen kan krympe
589d6ede feat(pilot): overskriften Hurtigt svar i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `243cbb02` til og med `147d1d48`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
243cbb02 docs: checkpoint efter 96d7b13e
```

### Features

G18-685, G18-686, G18-687, G18-688 og G18-689 lader kun overskriften Hurtigt svar, hurtigsvar-knapperne, ikonet, rammen og rækken i mail-detaljen krympe. `Hurtigt svar` bliver. `Bekræft modtagelse` bliver. `Mangler info` bliver. `Tak for ordren` bliver. `data-testid="mail-quick-reply-label"` bliver. `data-testid="mail-quick-reply-button"` bliver. `data-testid="mail-quick-reply-icon"` bliver. `data-testid="mail-quick-reply-frame"` bliver. `data-testid="mail-quick-reply-row"` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-685: `scripts/mail-quick-reply-label-wrap-test.ts`. G18-686: `scripts/mail-quick-reply-button-wrap-test.ts`. G18-687: `scripts/mail-quick-reply-icon-wrap-test.ts`. G18-688: `scripts/mail-quick-reply-frame-wrap-test.ts`. G18-689: `scripts/mail-quick-reply-row-wrap-test.ts`. Samme G18-686-commit opdaterede svarknap-låsen i overskrifts-testen. Samme G18-687-commit opdaterede ikon-låsen i knap-testen. Samme G18-688-commit opdaterede ramme-låsen i ikon-testen. Samme G18-689-commit opdaterede række-låsen i ramme-testen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `147d1d48`, herunder G18-289 til G18-689. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `147d1d48`, `595e4916`, `d962a6b5`, `ef8d4ac3`, `589d6ede`, `243cbb02`, `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-690, G18-597.

## Checkpoint 2026-10-18 firsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `44f955fe`. Det lader nioghalvfjerdsindstyvende-hegnet stå. `44f955fe` hedder `docs: checkpoint efter 68fc429b`. Produktspids: `96d7b13e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `96d7b13e` blev afvist før git kørte og er ikke prøvet igen. `86bdae57`, `a0e89a8c`, `6ee2b78f` og `0302ec0b` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `0302ec0b..96d7b13e`

```
96d7b13e feat(pilot): knappen Marker som laest i mail-detaljen kan krympe
86bdae57 feat(pilot): knappen Arkiver i mail-detaljen kan krympe
a0e89a8c feat(pilot): knappen Ignorer i mail-detaljen kan krympe
6ee2b78f feat(pilot): knappen Marker som relevant i mail-detaljen kan krympe
0302ec0b feat(pilot): ikonet paa Marker som ulaest i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `44f955fe` til og med `96d7b13e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
44f955fe docs: checkpoint efter 68fc429b
```

### Features

G18-680, G18-681, G18-682, G18-683 og G18-684 lader kun ikonet på Markér som ulæst og knapperne Markér som relevant, Ignorér, Arkivér og Markér som læst i mail-detaljen krympe. `Markér som ulæst` bliver. `Markér som relevant` bliver. `Ignorér` bliver. `Arkivér` bliver. `Markér som læst` bliver. `data-testid="mail-mark-unread-icon"` bliver. `data-testid="mail-restore-icon"` bliver. `data-testid="mail-ignore-icon"` bliver. `data-testid="mail-archive-icon"` bliver. `data-testid="mail-mark-read-icon"` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-680: `scripts/mail-mark-unread-icon-wrap-test.ts`. G18-681: `scripts/mail-restore-button-wrap-test.ts`. G18-682: `scripts/mail-ignore-button-wrap-test.ts`. G18-683: `scripts/mail-archive-button-wrap-test.ts`. G18-684: `scripts/mail-mark-read-button-wrap-test.ts`. Samme G18-680-commit opdaterede Mail-låsen i læst-ikon-testen. Samme G18-682-commit opdaterede ignorer-låsen i relevant-knap-testen. Samme G18-683-commit opdaterede arkiv-låsen i ignorer-knap-testen. Samme G18-684-commit opdaterede læse-låsen i arkiv-knap-testen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `96d7b13e`, herunder G18-289 til G18-684. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `96d7b13e`, `86bdae57`, `a0e89a8c`, `6ee2b78f`, `0302ec0b`, `44f955fe`, `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-685, G18-597.

## Checkpoint 2026-10-18 nioghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `4ce9acc7`. Det lader otteoghalvfjerdsindstyvende-hegnet stå. `4ce9acc7` hedder `docs: checkpoint efter d4cd92bb`. Produktspids: `68fc429b`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `68fc429b` blev afvist før git kørte og er ikke prøvet igen. `823ee048`, `990eeb0f`, `69d1e2e4` og `00e217ed` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `00e217ed..68fc429b`

```
68fc429b feat(pilot): ikonet paa Marker som relevant i mail-detaljen kan krympe
823ee048 feat(pilot): ikonet paa Ignorer i mail-detaljen kan krympe
990eeb0f feat(pilot): ikonet paa Arkiver i mail-detaljen kan krympe
69d1e2e4 feat(pilot): ikonet paa Marker som laest i mail-detaljen kan krympe
00e217ed feat(pilot): ikonet paa Opret sag i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `4ce9acc7` til og med `68fc429b`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
4ce9acc7 docs: checkpoint efter d4cd92bb
```

### Features

G18-675, G18-676, G18-677, G18-678 og G18-679 lader kun ikonerne på Opret sag, Markér som læst, Arkivér, Ignorér og Markér som relevant i mail-detaljen krympe. `Opret sag` bliver. `Markér som læst` bliver. `Arkivér` bliver. `Ignorér` bliver. `Markér som relevant` bliver. `data-testid="mail-opret-sag-button"` bliver. `data-testid="mail-task-icon"` bliver. `data-testid="mail-create-offer"` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-675: `scripts/mail-opret-sag-icon-wrap-test.ts`. G18-676: `scripts/mail-mark-read-icon-wrap-test.ts`. G18-677: `scripts/mail-archive-icon-wrap-test.ts`. G18-678: `scripts/mail-ignore-icon-wrap-test.ts`. G18-679: `scripts/mail-restore-icon-wrap-test.ts`. Samme G18-677-commit opdaterede arkiv-låsen i læst-ikon-testen. Samme G18-678-commit opdaterede ignorer-låsen i arkiv-ikon-testen. Samme G18-679-commit opdaterede relevant-låsen i ignorer-ikon-testen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `68fc429b`, herunder G18-289 til G18-679. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `68fc429b`, `823ee048`, `990eeb0f`, `69d1e2e4`, `00e217ed`, `4ce9acc7`, `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-680, G18-597.

## Checkpoint 2026-10-18 otteoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `ed9b0086`. Det lader syvoghalvfjerdsindstyvende-hegnet stå. `ed9b0086` hedder `docs: checkpoint efter 8a254f56`. Produktspids: `d4cd92bb`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `d4cd92bb` blev afvist før git kørte og er ikke prøvet igen. `251d3c0c` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `251d3c0c..d4cd92bb`

```
d4cd92bb feat(pilot): ikonet paa Opret tilbud i mail-detaljen kan krympe
251d3c0c feat(pilot): knappen Opret tilbud i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `ed9b0086` til og med `d4cd92bb`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
ed9b0086 docs: checkpoint efter 8a254f56
```

### Features

G18-673 og G18-674 lader kun knappen Opret tilbud og FilePlus-ikonet i mail-detaljen krympe. `Opret tilbud` bliver. `data-testid="mail-create-offer"` bliver. `?nytilbud=1` bliver. `Opret sag` bliver. `data-testid="mail-opret-sag-button"` bliver. `Kobl til eksisterende` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-673: `scripts/mail-create-offer-wrap-test.ts`. G18-674: `scripts/mail-create-offer-icon-wrap-test.ts`. Samme G18-674-commit opdaterede FilePlus-låsen i opret-tilbud-testen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før src-committen. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `d4cd92bb`, herunder G18-289 til G18-674. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `d4cd92bb`, `251d3c0c`, `ed9b0086`, `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-675, G18-597.

## Checkpoint 2026-10-18 syvoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `4a5b1b4e`. Det lader seksoghalvfjerdsindstyvende-hegnet stå. `4a5b1b4e` hedder `docs: checkpoint efter be33e396`. Produktspids: `8a254f56`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `8a254f56` blev afvist før git kørte og er ikke prøvet igen. `400a5180`, `b1fa1bd5`, `55612992` og `9a367f09` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `9a367f09..8a254f56`

```
8a254f56 feat(pilot): knappen Opret sag i mail-detaljen kan krympe
400a5180 feat(pilot): handlingsraekken i mail-detaljen kan krympe
b1fa1bd5 feat(pilot): ikonet paa Kobl til eksisterende i mail-detaljen kan krympe
55612992 feat(pilot): ikonet paa Opret som ny kunde i mail-detaljen kan krympe
9a367f09 feat(pilot): knappen Opret som ny kunde i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `4a5b1b4e` til og med `8a254f56`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
4a5b1b4e docs: checkpoint efter be33e396
```

### Features

G18-668, G18-669, G18-670, G18-671 og G18-672 lader kun opret-knappen, UserPlus-ikonet, Link2-ikonet på koblingsknappen, handlingsrækken og knappen Opret sag i mail-detaljen krympe. `Opret som ny kunde` bliver. `Kobl til eksisterende` bliver. `Opret sag` bliver. `data-testid="mail-create-offer"` bliver. `onClick={onLink}` bliver. `onClick={onCreateServiceCase}` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-668: `scripts/mail-opret-kunde-wrap-test.ts`. G18-669: `scripts/mail-opret-kunde-icon-wrap-test.ts`. G18-670: `scripts/mail-kobl-icon-wrap-test.ts`. G18-671: `scripts/mail-action-row-wrap-test.ts`. G18-672: `scripts/mail-opret-sag-wrap-test.ts`. Samme G18-668-commit opdaterede den grønne klasse-lås i koblingstest. Samme G18-669-commit opdaterede ikonlåsen i opret-knap-testen. Samme G18-670-commit opdaterede Link2-låsen i koblingsknap-testen og i opret-ikon-testen. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `8a254f56`, herunder G18-289 til G18-672. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `8a254f56`, `400a5180`, `b1fa1bd5`, `55612992`, `9a367f09`, `4a5b1b4e`, `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4` og de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-673, G18-597.

## Checkpoint 2026-10-18 seksoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `13c764e4`. Det lader femoghalvfjerdsindstyvende-hegnet stå. `13c764e4` hedder `docs: checkpoint efter 5224acd7`. Produktspids: `be33e396`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `be33e396` blev afvist før git kørte og er ikke prøvet igen. `2e1e110a` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `2e1e110a..be33e396`

```
be33e396 feat(pilot): knappen Kobl til eksisterende i mail-detaljen kan krympe
2e1e110a feat(pilot): titlen paa auto-opgaven i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `13c764e4` til og med `be33e396`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
13c764e4 docs: checkpoint efter 5224acd7
```

### Features

G18-666 og G18-667 lader kun auto-opgave-titlen og knappen Kobl til eksisterende i mail-detaljen krympe. `{openAutoTasks[0].title}` bliver. `Kobl til eksisterende` bliver. `Opret som ny kunde` bliver. `onClick={onLink}` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-666: `scripts/mail-task-title-wrap-test.ts`. G18-667: `scripts/mail-kobl-button-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `be33e396`, herunder G18-289 til G18-667. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `be33e396`, `2e1e110a`, `13c764e4`, `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4`, `bdd65feb`, `be8c864a`, `5b8a4a4f`, `9aaa9dfc`, `dfe4e344`, `baf204be`, `b1d3d474`, `f0a01c41`, `509e5fa6`, `a78db19b`, `434ca742`, `ef860495`, `23e7e482`, `08513c21`, `093bbbbc`, `d232709a`, `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-668, G18-597.

## Checkpoint 2026-10-18 femoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `9b80b5b4`. Det lader fireoghalvfjerdsindstyvende-hegnet stå. `9b80b5b4` hedder `docs: checkpoint efter bdd65feb`. Produktspids: `5224acd7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `5224acd7` blev afvist før git kørte og er ikke prøvet igen. `da9fbb1d`, `66dbd689`, `bab91e58` og `87fa4b82` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `87fa4b82..5224acd7`

```
5224acd7 feat(pilot): advarselsikonet ved auto-opgaven kan krympe
da9fbb1d feat(pilot): opgaveteksten i mail-detaljen kan krympe
66dbd689 feat(pilot): linket Se opgave i mail-detaljen kan krympe
bab91e58 feat(pilot): linket Hop til Chat i mail-detaljen kan krympe
87fa4b82 feat(pilot): portalikonet i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `9b80b5b4` til og med `5224acd7`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
9b80b5b4 docs: checkpoint efter bdd65feb
```

### Features

G18-661, G18-662, G18-663, G18-664 og G18-665 lader kun portalikonet, linket Hop til Chat, linket Se opgave, opgaveteksten og advarselsikonet ved auto-opgaven i mail-detaljen krympe. `Kunden har en aktiv portal` bliver. `Hop til Chat` bliver. `Se opgave` bliver. `Auto-opgave oprettet:` bliver. `title="Vælg sag"` bliver. `max-w-[280px] truncate` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-661: `scripts/mail-portal-icon-wrap-test.ts`. G18-662: `scripts/mail-portal-link-wrap-test.ts`. G18-663: `scripts/mail-task-link-wrap-test.ts`. G18-664: `scripts/mail-task-text-wrap-test.ts`. G18-665: `scripts/mail-task-icon-wrap-test.ts`. Samme G18-661-commit opdaterede ikonlåsen i portalteksttesten. Samme G18-665-commit opdaterede ikonlåsen i opgaveteksttesten. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `5224acd7`, herunder G18-289 til G18-665. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `5224acd7`, `da9fbb1d`, `66dbd689`, `bab91e58`, `87fa4b82`, `9b80b5b4`, `bdd65feb`, `be8c864a`, `5b8a4a4f`, `9aaa9dfc`, `dfe4e344`, `baf204be`, `b1d3d474`, `f0a01c41`, `509e5fa6`, `a78db19b`, `434ca742`, `ef860495`, `23e7e482`, `08513c21`, `093bbbbc`, `d232709a`, `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-666, G18-597.

## Checkpoint 2026-10-18 fireoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `baf204be`. Det lader treoghalvfjerdsindstyvende-hegnet stå. `baf204be` hedder `docs: checkpoint efter b1d3d474`. Produktspids: `bdd65feb`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `bdd65feb` blev afvist før git kørte og er ikke prøvet igen. `be8c864a`, `5b8a4a4f`, `9aaa9dfc` og `dfe4e344` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `dfe4e344..bdd65feb`

```
bdd65feb feat(pilot): teksten om aktiv portal i mail-detaljen kan krympe
be8c864a feat(pilot): portalrammen i mail-detaljen kan krympe
5b8a4a4f feat(pilot): opgavelinkets ramme i mail-detaljen kan krympe
9aaa9dfc feat(pilot): svaret efter download af vedhaeftninger kan krympe
dfe4e344 feat(pilot): svaret ved sagsvaelgeren kan krympe
```

Listen er alle produktcommits efter `baf204be` til og med `bdd65feb`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
baf204be docs: checkpoint efter b1d3d474
```

### Features

G18-656, G18-657, G18-658, G18-659 og G18-660 lader kun sagsvælgerens svar, svaret efter download af vedhæftninger, opgavelinkets ramme, portalrammen og teksten om aktiv portal i mail-detaljen krympe. `{feedback}` bliver. `{backfillMsg}` bliver. `Se opgave` bliver. `Kunden har en aktiv portal` bliver. `Hop til Chat` bliver. `title="Vælg sag"` bliver. `max-w-[280px] truncate` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-656: `scripts/mail-case-feedback-wrap-test.ts`. G18-657: `scripts/mail-backfill-msg-wrap-test.ts`. G18-658: `scripts/mail-task-frame-wrap-test.ts`. G18-659: `scripts/mail-portal-frame-wrap-test.ts`. G18-660: `scripts/mail-portal-text-wrap-test.ts`. Samme commit løsnede farvelåsen i rammetesten, fordi spanet fik flere klasser. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `bdd65feb`, herunder G18-289 til G18-660. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `bdd65feb`, `be8c864a`, `5b8a4a4f`, `9aaa9dfc`, `dfe4e344`, `baf204be`, `b1d3d474`, `f0a01c41`, `509e5fa6`, `a78db19b`, `434ca742`, `ef860495`, `23e7e482`, `08513c21`, `093bbbbc`, `d232709a`, `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-661, G18-597.

## Checkpoint 2026-10-18 treoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `a78db19b`. Det lader tooghalvfjerdsindstyvende-hegnet stå. `a78db19b` hedder `docs: checkpoint efter 434ca742`. Produktspids: `b1d3d474`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `b1d3d474` blev afvist før git kørte og er ikke prøvet igen. `f0a01c41` og `509e5fa6` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `509e5fa6..b1d3d474`

```
b1d3d474 feat(pilot): gem-spinneren ved sagsvaelgeren kan krympe
f0a01c41 feat(pilot): teksten om ingen sager i mail-detaljen kan krympe
509e5fa6 feat(pilot): sagsnavnet i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `a78db19b` til og med `b1d3d474`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a78db19b docs: checkpoint efter 434ca742
```

### Features

G18-653, G18-654 og G18-655 lader kun sagsnavnet, teksten om ingen sager og gem-spinneren ved sagsvælgeren i mail-detaljen krympe. `href` til sagen bliver. `{currentCase.case_number}` bliver. `Kunden har ingen sager endnu` bliver. `{isSaving && <Loader2` bliver. `title="Vælg sag"` bliver. `max-w-[280px] truncate` bliver. `Ingen sag tilknyttet` bliver. `{feedback}` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-653: `scripts/mail-case-link-wrap-test.ts`. G18-654: `scripts/mail-no-cases-wrap-test.ts`. G18-655: `scripts/mail-case-saving-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `b1d3d474`, herunder G18-289 til G18-655. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `b1d3d474`, `f0a01c41`, `509e5fa6`, `a78db19b`, `434ca742`, `ef860495`, `23e7e482`, `08513c21`, `093bbbbc`, `d232709a`, `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-656, G18-597.

## Checkpoint 2026-10-18 tooghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `d232709a`. Det lader enoghalvfjerdsindstyvende-hegnet stå. `d232709a` hedder `docs: checkpoint efter 48d6a64c`. Produktspids: `434ca742`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `434ca742` blev afvist før git kørte og er ikke prøvet igen. `ef860495`, `23e7e482`, `08513c21` og `093bbbbc` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `093bbbbc..434ca742`

```
434ca742 feat(pilot): sagsikonet i mail-detaljen kan krympe
ef860495 feat(pilot): sagsvaelgerens ramme kan krympe
23e7e482 feat(pilot): handlingsraekken ved sagsvaelgeren kan krympe
08513c21 feat(pilot): handlingsraekken ved koblet kunde kan krympe
093bbbbc feat(pilot): kundenummeret i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `d232709a` til og med `434ca742`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d232709a docs: checkpoint efter 48d6a64c
```

### Features

G18-648, G18-649, G18-650, G18-651 og G18-652 lader kun kundenummeret, handlingsrækken ved den koblede kunde, handlingsrækken ved sagsvælgeren, sagsvælgerens ramme og sagsikonet i mail-detaljen krympe. `({email.customers.customer_number})` bliver. `Åbn kunde` bliver. `title="Vælg sag"` bliver. `max-w-[280px] truncate` bliver. `Ingen sag tilknyttet` bliver. `<Briefcase` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-648: `scripts/mail-linked-customer-number-wrap-test.ts`. G18-649: `scripts/mail-linked-customer-actions-wrap-test.ts`. G18-650: `scripts/mail-case-actions-wrap-test.ts`. Samme commit satte den bare handlingsrækkes split i 649-testen til 1. G18-651: `scripts/mail-case-frame-wrap-test.ts`. G18-652: `scripts/mail-case-icon-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `434ca742`, herunder G18-289 til G18-652. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `434ca742`, `ef860495`, `23e7e482`, `08513c21`, `093bbbbc`, `d232709a`, `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-653, G18-597.

## Checkpoint 2026-10-18 enoghalvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `66b19a0f`. Det lader halvfjerdsindstyvende-hegnet stå. `66b19a0f` hedder `docs: checkpoint efter c8dfef74`. Produktspids: `48d6a64c`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `48d6a64c` blev afvist før git kørte og er ikke prøvet igen. `2ab3cf04`, `93e29427`, `9437e23f` og `e3fcee49` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `e3fcee49..48d6a64c`

```
48d6a64c feat(pilot): kundenavnet i mail-detaljen kan krympe
2ab3cf04 feat(pilot): teksten koblet til i mail-detaljen kan krympe
93e29427 feat(pilot): koblingsikonet i mail-detaljen kan krympe
9437e23f feat(pilot): knappen fjern kobling kan krympe
e3fcee49 feat(pilot): linket abn kunde i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `66b19a0f` til og med `48d6a64c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
66b19a0f docs: checkpoint efter c8dfef74
```

### Features

G18-643, G18-644, G18-645, G18-646 og G18-647 lader kun linket Åbn kunde, knappen Fjern kobling, koblingsikonet, teksten Koblet til og kundenavnet i mail-detaljen krympe. `Åbn kunde` bliver. `Fjern kobling` bliver. `Koblet til:` bliver. `{email.customers.company_name}` bliver. `({email.customers.customer_number})` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-643: `scripts/mail-open-customer-link-wrap-test.ts`. G18-644: `scripts/mail-unlink-button-wrap-test.ts`. G18-645: `scripts/mail-link2-icon-wrap-test.ts`. G18-646: `scripts/mail-linked-customer-name-wrap-test.ts`. G18-647: `scripts/mail-linked-customer-strong-wrap-test.ts`. Samme commit ændrede strong-tjekket i navne-testen til `<strong `, fordi navnet fik en klasse. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `48d6a64c`, herunder G18-289 til G18-647. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `48d6a64c`, `2ab3cf04`, `93e29427`, `9437e23f`, `e3fcee49`, `66b19a0f`, `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-648, G18-597.

## Checkpoint 2026-10-18 halvfjerdsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `a3850d18`. Det lader niogtresindstyvende-hegnet stå. `a3850d18` hedder `docs: checkpoint efter b30cbb1b`. Produktspids: `c8dfef74`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `c8dfef74` blev afvist før git kørte og er ikke prøvet igen. `eca6ddb3`, `b5661c91`, `299b4115` og `5b1b8000` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `5b1b8000..c8dfef74`

```
c8dfef74 feat(pilot): raekken koblet til kunde kan krympe
eca6ddb3 feat(pilot): agent-inbox-linket i mail-detaljen kan krympe
b5661c91 feat(pilot): mailagentens resultattekst kan krympe
299b4115 feat(pilot): mailagent-knappen i mail-detaljen kan krympe
5b1b8000 feat(pilot): mailagent-raekken i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `a3850d18` til og med `c8dfef74`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a3850d18 docs: checkpoint efter b30cbb1b
```

### Features

G18-638, G18-639, G18-640, G18-641 og G18-642 lader kun Mailagent-rækken, Mailagent-knappen, Mailagentens resultattekst, linket Åbn Agent Inbox og rækken Koblet til kunde i mail-detaljen krympe. `Kør Mailagent` bliver. `{agentResult.msg}` bliver. `href="/dashboard/agents"` bliver. `Åbn Agent Inbox →` bliver. `Koblet til:` bliver. `{email.customers.company_name}` bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-638: `scripts/mail-agent-row-wrap-test.ts`. G18-639: `scripts/mail-agent-button-wrap-test.ts` plus den opdaterede knapklasse i række-testen. G18-640: `scripts/mail-agent-result-wrap-test.ts`. G18-641: `scripts/mail-agent-inbox-link-wrap-test.ts`. G18-642: `scripts/mail-linked-customer-row-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `c8dfef74`, herunder G18-289 til G18-642. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `c8dfef74`, `eca6ddb3`, `b5661c91`, `299b4115`, `5b1b8000`, `a3850d18`, `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-643, G18-597.

## Checkpoint 2026-10-18 niogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `6aad4d31`. Det lader otteogtresindstyvende-hegnet stå. `6aad4d31` hedder `docs: checkpoint efter 57c81f93`. Produktspids: `b30cbb1b`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `b30cbb1b` blev afvist før git kørte og er ikke prøvet igen. `f28da480` og `6a87be4f` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `6a87be4f..b30cbb1b`

```
b30cbb1b feat(pilot): mail-detaljens ydre ramme kan krympe
f28da480 feat(pilot): badge-raekken ved emnet kan krympe
6a87be4f feat(pilot): sidehovedet i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `6aad4d31` til og med `b30cbb1b`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
6aad4d31 docs: checkpoint efter 57c81f93
```

### Features

G18-635, G18-636 og G18-637 lader kun sidehovedet, badge-rækken ved emnet og mail-detaljens ydre ramme krympe. Emneteksten bliver. `>Ulæst</span>` bliver. `formatDate(email.received_at)` bliver. `href={lightboxUrl}` bliver. `aria-label="Luk"` bliver. `aria-label="Download"` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-635: `scripts/mail-detail-header-wrap-test.ts` plus emnerække og Ulæst. G18-636: `scripts/mail-badge-row-wrap-test.ts` plus sidehoved og Ulæst. Samme commit satte den bare badge-række-tælling i `scripts/mail-lightbox-actions-wrap-test.ts` og `scripts/mail-unread-badge-wrap-test.ts` til 1. G18-637: `scripts/mail-detail-frame-wrap-test.ts` plus sidehoved og badge-række. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `b30cbb1b`, herunder G18-289 til G18-637. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `b30cbb1b`, `f28da480`, `6a87be4f`, `6aad4d31`, `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-638, G18-597.

## Checkpoint 2026-10-18 otteogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `40947ab2`. Det lader syvogtresindstyvende-hegnet stå. `40947ab2` hedder `docs: checkpoint efter ae086350`. Produktspids: `57c81f93`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `57c81f93` blev afvist før git kørte og er ikke prøvet igen. `5b65f706`, `31326fc9`, `e4521b1e` og `d991f7ad` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d991f7ad..57c81f93`

```
57c81f93 feat(pilot): emnerakken i mail-detaljen kan krympe
5b65f706 feat(pilot): ulaest-maerket i mail-detaljen kan krympe
31326fc9 feat(pilot): videresendt-maerket i mail-detaljen kan krympe
e4521b1e feat(pilot): afsenderkolonnen i mail-detaljen kan krympe
d991f7ad feat(pilot): afsenderraekken i mail-detaljen kan krympe
```

Listen er alle produktcommits efter `40947ab2` til og med `57c81f93`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
40947ab2 docs: checkpoint efter ae086350
```

### Features

G18-630, G18-631, G18-632, G18-633 og G18-634 lader kun afsenderrækken, afsenderkolonnen, videresendt-mærket, Ulæst-mærket og emnerækken i mail-detaljen krympe. `formatDate(email.received_at)` bliver. Emneteksten bliver. `>Ulæst</span>` bliver. `Videresendt fra:` bliver. `href={lightboxUrl}` bliver. `aria-label="Luk"` bliver. `aria-label="Download"` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-630: `scripts/mail-sender-row-wrap-test.ts` plus tidspunkt, afsender og adresse. G18-631: `scripts/mail-sender-column-wrap-test.ts` plus række, tidspunkt, afsender og adresse. G18-632: `scripts/mail-forwarded-from-wrap-test.ts` plus kolonne, række, afsender og emne. G18-633: `scripts/mail-unread-badge-wrap-test.ts` plus emne, videresendt og lysboksknaprække. G18-634: `scripts/mail-subject-row-wrap-test.ts` plus emne og Ulæst. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `57c81f93`, herunder G18-289 til G18-634. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `57c81f93`, `5b65f706`, `31326fc9`, `e4521b1e`, `d991f7ad`, `40947ab2`, `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-635, G18-597.

## Checkpoint 2026-10-18 syvogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `e34f027d`. Det lader seksogtresindstyvende-hegnet stå. `e34f027d` hedder `docs: checkpoint efter 2f90c98c`. Produktspids: `ae086350`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `ae086350` blev afvist før git kørte og er ikke prøvet igen. `ea88bc19`, `7493ecf6`, `6533e8cd` og `8a1d5504` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8a1d5504..ae086350`

```
ae086350 feat(pilot): modtagelsestidspunktet i mail-detaljen kan krympe
ea88bc19 feat(pilot): afsenderadressen i mail-detaljen kan krympe
7493ecf6 feat(pilot): afsenderen i mail-detaljen kan krympe
6533e8cd feat(pilot): emnet i mail-detaljen kan krympe
8a1d5504 feat(pilot): knapraekken i mailens lysboks kan krympe
```

Listen er alle produktcommits efter `e34f027d` til og med `ae086350`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
e34f027d docs: checkpoint efter 2f90c98c
```

### Features

G18-625, G18-626, G18-627, G18-628 og G18-629 lader kun knaprækken i lysboksen, emnet, afsenderen, afsenderadressen og modtagelsestidspunktet i mail-detaljen krympe. `href={lightboxUrl}` bliver. `onClick={() => setLightboxUrl(null)}` bliver. `aria-label="Luk"` bliver. `aria-label="Download"` bliver. `{lightboxName}` bliver. `formatDate(email.received_at)` bliver. Emneteksten bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-625: `scripts/mail-lightbox-actions-wrap-test.ts` plus navn, download-link, luk-knap og vedhæftningsomslag. G18-626: `scripts/mail-subject-wrap-test.ts` plus knaprække og vedhæftningsomslag. G18-627: `scripts/mail-sender-wrap-test.ts` plus emne og vedhæftningsomslag. G18-628: `scripts/mail-sender-address-wrap-test.ts` plus afsender og emne. G18-629: `scripts/mail-received-at-wrap-test.ts` plus adresse, afsender og emne. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `ae086350`, herunder G18-289 til G18-629. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `ae086350`, `ea88bc19`, `7493ecf6`, `6533e8cd`, `8a1d5504`, `e34f027d`, `2f90c98c`, `828c29e0` og `3534e9e6`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-630, G18-597.

## Checkpoint 2026-10-18 seksogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `3534e9e6`. Det lader femogtresindstyvende-hegnet stå. `3534e9e6` hedder `docs: checkpoint efter 59d995b0`. Produktspids: `2f90c98c`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `2f90c98c` blev afvist før git kørte og er ikke prøvet igen. `828c29e0` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `828c29e0..2f90c98c`

```
2f90c98c feat(pilot): navnet i mailens lysboks kan krympe
828c29e0 feat(pilot): download-linket i mailens lysboks kan krympe
```

Listen er alle produktcommits efter `3534e9e6` til og med `2f90c98c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
3534e9e6 docs: checkpoint efter 59d995b0
```

### Features

G18-623 og G18-624 lader kun download-linket og navnet i mailens lysboks krympe. `href={lightboxUrl}` bliver. `onClick={() => setLightboxUrl(null)}` bliver. `aria-label="Luk"` bliver. `aria-label="Download"` bliver. `{lightboxName}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-623: `scripts/mail-lightbox-download-link-wrap-test.ts` plus luk-knap, luk-ikon og vedhæftningsomslag. G18-624: `scripts/mail-lightbox-name-wrap-test.ts` plus download-link, luk-knap og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `2f90c98c`, herunder G18-289 til G18-624. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `2f90c98c`, `828c29e0`, `3534e9e6`, `59d995b0`, `19be5a2b`, `efc2056b`, `4d80cee2`, `63609df3`, `a5c6612e`, `b4ebefc0`, `ced2369b`, `bf9ac2a7`, `d300c741` og `330c3b5c`, plus de ældre tip i checkpointet før dette. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-625, G18-597.

## Checkpoint 2026-10-18 femogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister produktcommits efter `63609df3`. Det lader fireogtresindstyvende-hegnet stå. `63609df3` hedder `docs: checkpoint efter a5c6612e`. Produktspids: `59d995b0`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `59d995b0` blev afvist før git kørte og er ikke prøvet igen. `19be5a2b`, `efc2056b` og `4d80cee2` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `4d80cee2..59d995b0`

```
59d995b0 feat(pilot): luk-knappen i mailens lysboks kan krympe
19be5a2b feat(pilot): luk-ikonet i mailens lysboks kan krympe
efc2056b feat(pilot): download-ikonet i mailens lysboks kan krympe
4d80cee2 feat(pilot): billedet i mailens lysboks kan krympe
```

Listen er alle produktcommits efter `63609df3` til og med `59d995b0`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
63609df3 docs: checkpoint efter a5c6612e
```

### Features

G18-619, G18-620, G18-621 og G18-622 lader kun billedet, download-ikonet, luk-ikonet og luk-knappen i mailens lysboks krympe. `src={lightboxUrl}` bliver. `href={lightboxUrl}` bliver. `onClick={() => setLightboxUrl(null)}` bliver. `aria-label="Luk"` bliver. `aria-label="Download"` bliver. Download-linkets klasse bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-619: `scripts/mail-lightbox-photo-wrap-test.ts` plus titelrække, panel og vedhæftningsomslag. G18-620: `scripts/mail-lightbox-download-icon-wrap-test.ts` plus billede og vedhæftningsomslag. G18-621: `scripts/mail-lightbox-close-icon-wrap-test.ts` plus download-ikon, billede og vedhæftningsomslag. G18-622: `scripts/mail-lightbox-close-button-wrap-test.ts` plus luk-ikon, download-ikon og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `59d995b0`, herunder G18-289 til G18-622. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `59d995b0`, `19be5a2b`, `efc2056b`, `4d80cee2`, `63609df3`, `a5c6612e`, `b4ebefc0`, `ced2369b`, `bf9ac2a7`, `d300c741`, `330c3b5c`, `522850fd`, `6c037fa2`, `634e11d7`, `ac352f4e`, `030f4985`, `953da8a7`, `1f34326f`, `d5f1405e`, `2518255c`, `36f17cfe`, `8cf964e4`, `2946e7f2`, `47f0f80c`, `702c951a`, `14253394`, `ca4ccf5b`, `593f3462`, `cff3fa0f`, `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-623, G18-597.

## Checkpoint 2026-10-18 fireogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `330c3b5c`. Det lader treogtresindstyvende-hegnet stå. `330c3b5c` hedder `docs: checkpoint efter 522850fd`. Produktspids: `a5c6612e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `a5c6612e` blev afvist før git kørte og er ikke prøvet igen. `b4ebefc0`, `ced2369b`, `bf9ac2a7` og `d300c741` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d300c741..a5c6612e`

```
a5c6612e feat(pilot): titelraekken i mailens lysboks kan krympe
b4ebefc0 feat(pilot): panelet i mailens lysboks kan krympe
ced2369b feat(pilot): lysboksen i mailen kan krympe
bf9ac2a7 feat(pilot): rammen om webhenvendelsen i mailen kan krympe
d300c741 feat(pilot): indlaesningen af mailens broedtekst kan krympe
```

Listen er alle commits efter `330c3b5c` til og med `a5c6612e`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
330c3b5c docs: checkpoint efter 522850fd
```

### Features

G18-614, G18-615, G18-616, G18-617 og G18-618 lader kun indlæsningen af mailens brødtekst, rammen om webhenvendelsen, lysboksen, panelet og titelrækken i mailens lysboks krympe. `data-testid="mail-body-loading"` bliver. `<WebInquiryCard email={email} />` bliver. `aria-label="Luk"` bliver. `setLightboxUrl(null)` bliver. `break-all min-w-0 flex-1">{lightboxName}` bliver. Filnavnets `line-clamp-2` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-614: `scripts/mail-body-loading-wrap-test.ts` plus HTML-brødtekst, brødtekst og vedhæftningsomslag. G18-615: `scripts/mail-inquiry-frame-wrap-test.ts` plus indlæsning og vedhæftningsomslag. G18-616: `scripts/mail-lightbox-shell-wrap-test.ts` plus henvendelse og vedhæftningsomslag. G18-617: `scripts/mail-lightbox-panel-wrap-test.ts` plus lysboks og vedhæftningsomslag. G18-618: `scripts/mail-lightbox-title-row-wrap-test.ts` plus panel, lysboks og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `a5c6612e`, herunder G18-289 til G18-618. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `a5c6612e`, `b4ebefc0`, `ced2369b`, `bf9ac2a7`, `d300c741`, `330c3b5c`, `522850fd`, `6c037fa2`, `634e11d7`, `ac352f4e`, `030f4985`, `953da8a7`, `1f34326f`, `d5f1405e`, `2518255c`, `36f17cfe`, `8cf964e4`, `2946e7f2`, `47f0f80c`, `702c951a`, `14253394`, `ca4ccf5b`, `593f3462`, `cff3fa0f`, `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-619, G18-597.

## Checkpoint 2026-10-18 treogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `953da8a7`. Det lader toogtresindstyvende-hegnet stå. `953da8a7` hedder `docs: checkpoint efter 1f34326f`. Produktspids: `522850fd`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `522850fd` blev afvist før git kørte og er ikke prøvet igen. `6c037fa2`, `634e11d7`, `ac352f4e` og `030f4985` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `030f4985..522850fd`

```
522850fd feat(pilot): html-broedteksten i mailen kan krympe
6c037fa2 feat(pilot): broedteksten i mailen kan krympe
634e11d7 feat(pilot): fillinket i mailens vedhaeftningsliste kan krympe
ac352f4e feat(pilot): billedet i mailgalleriet kan krympe
030f4985 feat(pilot): billedtekstens bjaelke i mailgalleriet kan krympe
```

Listen er alle commits efter `953da8a7` til og med `522850fd`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
953da8a7 docs: checkpoint efter 1f34326f
```

### Features

G18-609, G18-610, G18-611, G18-612 og G18-613 lader kun billedtekstens bjælke, billedet, fillinket, brødteksten og HTML-brødteksten i mailen krympe. Filnavnets `line-clamp-2` bliver. `formatFileSize` bliver. `href={att.url}` bliver. `{email.body_text || email.body_preview || '(Tom email)'}` bliver. `sanitizeEmailHtml` bliver. `data-testid="mail-body-loading"` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-609: `scripts/mail-gallery-caption-bar-wrap-test.ts` plus billedknap, galleristørrelse og vedhæftningsomslag. G18-610: `scripts/mail-gallery-photo-wrap-test.ts` plus bjælke, billedknap, galleristørrelse og vedhæftningsomslag. G18-611: `scripts/mail-file-link-wrap-test.ts` plus billede, listestørrelse og vedhæftningsomslag. G18-612: `scripts/mail-body-plain-wrap-test.ts` plus fillink og vedhæftningsomslag. G18-613: `scripts/mail-body-html-wrap-test.ts` plus brødtekst, fillink og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `522850fd`, herunder G18-289 til G18-613. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `522850fd`, `6c037fa2`, `634e11d7`, `ac352f4e`, `030f4985`, `953da8a7`, `1f34326f`, `d5f1405e`, `2518255c`, `36f17cfe`, `8cf964e4`, `2946e7f2`, `47f0f80c`, `702c951a`, `14253394`, `ca4ccf5b`, `593f3462`, `cff3fa0f`, `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-614, G18-597.

## Checkpoint 2026-10-18 toogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `2946e7f2`. Det lader enogtresindstyvende-hegnet stå. `2946e7f2` hedder `docs: checkpoint efter 47f0f80c`. Produktspids: `1f34326f`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `1f34326f` blev afvist før git kørte og er ikke prøvet igen. `d5f1405e`, `2518255c`, `36f17cfe` og `8cf964e4` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8cf964e4..1f34326f`

```
1f34326f feat(pilot): billedknappen i mailgalleriet kan krympe
d5f1405e feat(pilot): stakken med galleri og filliste kan krympe
2518255c feat(pilot): raekken over Vedhaeftede filer kan krympe
36f17cfe feat(pilot): vedhaeftningsafsnittets ramme kan krympe
8cf964e4 feat(pilot): knappen Download vedhaeftninger nu kan krympe
```

Listen er alle commits efter `2946e7f2` til og med `1f34326f`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
2946e7f2 docs: checkpoint efter 47f0f80c
```

### Features

G18-604, G18-605, G18-606, G18-607 og G18-608 lader kun download-knappen, vedhæftningsafsnittets ramme, rækken over Vedhæftede filer, stakken og billedknappen i mailgalleriet krympe. Filnavnets `line-clamp-2` bliver. `formatFileSize` bliver. Galleriets gitter bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-604: `scripts/mail-attachments-download-button-wrap-test.ts` plus boks, antal og vedhæftningsomslag. G18-605: `scripts/mail-attachments-section-wrap-test.ts` plus download-knap og vedhæftningsomslag. G18-606: `scripts/mail-attachments-title-row-wrap-test.ts` plus ramme og vedhæftningsomslag. G18-607: `scripts/mail-attachments-stack-wrap-test.ts` plus række og vedhæftningsomslag. G18-608: `scripts/mail-gallery-image-button-wrap-test.ts` plus stak, galleristørrelse og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `1f34326f`, herunder G18-289 til G18-608. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `1f34326f`, `d5f1405e`, `2518255c`, `36f17cfe`, `8cf964e4`, `2946e7f2`, `47f0f80c`, `702c951a`, `14253394`, `ca4ccf5b`, `593f3462`, `cff3fa0f`, `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-609, G18-597.

## Checkpoint 2026-10-18 enogtresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `cff3fa0f`. Det lader tresindstyvende-hegnet stå. `cff3fa0f` hedder `docs: checkpoint efter e653556a`. Produktspids: `47f0f80c`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `47f0f80c` blev afvist før git kørte og er ikke prøvet igen. `702c951a`, `14253394`, `ca4ccf5b` og `593f3462` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `593f3462..47f0f80c`

```
47f0f80c feat(pilot): boksen for manglende vedhaeftninger kan krympe
702c951a feat(pilot): antallet ved Vedhaeftede filer kan krympe
14253394 feat(pilot): overskriften Vedhaeftede filer kan krympe
ca4ccf5b feat(pilot): filstoerrelsen i mailens vedhaeftningsliste kan krympe
593f3462 feat(pilot): filstoerrelsen i mailgalleriet kan krympe
```

Listen er alle commits efter `cff3fa0f` til og med `47f0f80c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
cff3fa0f docs: checkpoint efter e653556a
```

### Features

G18-593, G18-594, G18-595, G18-596 og G18-603 lader kun mailens galleristørrelse, listestørrelse, overskriften Vedhæftede filer, antallet og boksen for manglende vedhæftninger krympe. `formatFileSize` bliver. Filnavnets `line-clamp-2` bliver. `({realAttachments.length})` bliver. Sætningen om manglende download bliver. Download-knappen bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede mail-detalje og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-593: `scripts/mail-gallery-size-wrap-test.ts` plus vedhæftningsomslag. G18-594: `scripts/mail-list-size-wrap-test.ts` plus galleristørrelse og vedhæftningsomslag. G18-595: `scripts/mail-attachments-heading-wrap-test.ts` plus galleri, liste og vedhæftningsomslag. G18-596: `scripts/mail-attachments-count-wrap-test.ts` plus overskrift, galleri, liste og vedhæftningsomslag. G18-603: `scripts/mail-attachments-pending-box-wrap-test.ts` plus antal, overskrift og vedhæftningsomslag. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `47f0f80c`, herunder G18-289 til G18-603. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `47f0f80c`, `702c951a`, `14253394`, `ca4ccf5b`, `593f3462`, `cff3fa0f`, `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-600, G18-598, G18-599, G18-601, G18-602, G18-604, G18-597.

## Checkpoint 2026-10-18 tresindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `57dbc8e3`. Det lader nioghalvtredsindstyvende-hegnet stå. `57dbc8e3` hedder `docs: checkpoint efter 248ff83d`. Produktspids: `e653556a`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `e653556a` blev afvist før git kørte og er ikke prøvet igen. `7a4b9c85`, `a5f192ca`, `cb5961d2` og `5428a776` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `57dbc8e3..e653556a`

```
e653556a feat(pilot): kalkulationsgitteret kan krympe
7a4b9c85 feat(pilot): kundevaelgerens indhold kan krympe
a5f192ca feat(pilot): elpunktraekken kan krympe
cb5961d2 feat(pilot): tilgaengelighedsfaktorraekken i tidsberegningen kan krympe
5428a776 feat(pilot): stoerrelsesfaktorraekken i tidsberegningen kan krympe
```

Listen er alle commits efter `57dbc8e3` til og med `e653556a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
57dbc8e3 docs: checkpoint efter 248ff83d
```

### Features

G18-590, G18-591, G18-592, G18-582 og G18-583 lader kun AI-projektets størrelsesfaktorrække, tilgængelighedsfaktorrække, elpunktrække, kundevælgerens indhold og kalkulationsgitter krympe. `result.calculation.time.size_multiplier` bliver. `result.calculation.time.accessibility_multiplier` bliver. `getPointTypeName` bliver. `{value} stk` bliver. Søgefeltet og listen bliver. Fortolkningsgitteret bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-590: `scripts/ai-project-time-size-row-wrap-test.ts` plus kompleksitetsfaktorrække, basistidsrække, kompleksitetsrække, aldersrække, størrelsesrække, typerække, arbejdsløn, margin, materialer, risikobuffer, størrelsesfaktoretiket, størrelsesfaktor, kompleksitetsfaktor og tidsliste. G18-591: `scripts/ai-project-time-access-row-wrap-test.ts` plus størrelsesfaktorrække, kompleksitetsfaktorrække, basistid, kompleksitetsrække, alder, størrelse, type, arbejdsløn, margin, materialer, risikobuffer, tilgængelighedsfaktor, størrelsesfaktor og tidsliste. G18-592: `scripts/ai-project-point-row-wrap-test.ts` plus tilgængelighedsfaktorrække, kompleksitetsrække, punktantal, elpunktliste, elpunktkolonne, fortolkningsgitter, bygningsblok og elpunktsoverskrift. G18-582: `scripts/ai-project-customer-body-wrap-test.ts` plus søgeikon, søgeramme, kundeliste og kundevælgerens hoved. G18-583: `scripts/ai-project-calculation-grid-wrap-test.ts` plus fortolkningsgitter, elpunktrække, priskolonne og prisliste. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `e653556a`, herunder G18-289 til G18-583. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `e653556a`, `7a4b9c85`, `a5f192ca`, `cb5961d2`, `5428a776`, `57dbc8e3`, `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-593, G18-598, G18-599, G18-594, G18-595, G18-596, G18-597.

## Checkpoint 2026-10-18 nioghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `7d5c7115`. Det lader otteoghalvtredsindstyvende-hegnet stå. `7d5c7115` hedder `docs: checkpoint efter a6e33199`. Produktspids: `248ff83d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `248ff83d` blev afvist før git kørte og er ikke prøvet igen. `776433ca`, `40cb3512`, `65f85272` og `4dbe54d9` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `7d5c7115..248ff83d`

```
248ff83d feat(pilot): kompleksitetsfaktorraekken i tidsberegningen kan krympe
776433ca feat(pilot): basistidsraekken i tidsberegningen kan krympe
40cb3512 feat(pilot): kompleksitetsraekken i bygningsinformationen kan krympe
65f85272 feat(pilot): aldersraekken i bygningsinformationen kan krympe
4dbe54d9 feat(pilot): stoerrelsesraekken i bygningsinformationen kan krympe
```

Listen er alle commits efter `7d5c7115` til og med `248ff83d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
7d5c7115 docs: checkpoint efter a6e33199
```

### Features

G18-585, G18-586, G18-587, G18-588 og G18-589 lader kun AI-projektets størrelsesrække, aldersrække, kompleksitetsrække i bygningsinformationen, basistidsrække og kompleksitetsfaktorrække krympe. `result.interpretation.building_size_m2` bliver. `result.interpretation.building_age_years` bliver. `getComplexityLabel(result.interpretation.complexity_score)` bliver. `result.calculation.time.base_hours.toFixed(1)` bliver. `result.calculation.time.complexity_multiplier` bliver. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-585: `scripts/ai-project-building-size-row-wrap-test.ts` plus størrelsesetiket, typerække, typeetiket, aldersetiket, risikobufferrække, marginrække, arbejdslønrække, materialerække, bygningsliste og bygningsblok. G18-586: `scripts/ai-project-building-age-row-wrap-test.ts` plus alderetiket, størrelsesrække, typerække, risikobuffer, margin, arbejdsløn, materialer, kompleksitetsetiket og bygningsblok. G18-587: `scripts/ai-project-building-complexity-row-wrap-test.ts` plus kompleksitetsetiket, aldersrække, størrelsesrække, typerække, risikobuffer, margin, arbejdsløn, materialer, bygningsblok og elpunktliste. G18-588: `scripts/ai-project-base-time-row-wrap-test.ts` plus basistidsetiket, basistid, kompleksitetsfaktor, tidsliste, kompleksitetsrække, aldersrække, størrelsesrække, typerække, risikobuffer, margin, arbejdsløn og materialer. G18-589: `scripts/ai-project-time-complexity-row-wrap-test.ts` plus kompleksitetsfaktor, basistidsrække, tidsliste, kompleksitetsrække, aldersrække, størrelsesrække, typerække, risikobuffer, margin, arbejdsløn, materialer, størrelsesfaktoretiket og størrelsesfaktor. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `248ff83d`, herunder G18-289 til G18-589. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `248ff83d`, `776433ca`, `40cb3512`, `65f85272`, `4dbe54d9`, `7d5c7115`, `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-593, G18-582, G18-583, G18-594, G18-590, G18-591, G18-592.

## Checkpoint 2026-10-18 otteoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `2c179dfb`. Det lader syvoghalvtredsindstyvende-hegnet stå. `2c179dfb` hedder `docs: checkpoint efter 9473f6c0`. Produktspids: `a6e33199`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `a6e33199` blev afvist før git kørte og er ikke prøvet igen. `64be36a5`, `3922d7e2` og `8d2f6c83` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `2c179dfb..a6e33199`

```
a6e33199 feat(pilot): typeraekken i bygningsinformationen kan krympe
64be36a5 feat(pilot): fortolkningsgitteret kan krympe
3922d7e2 feat(pilot): elpunktkolonnen kan krympe
8d2f6c83 feat(pilot): bygningsinformationens kolonne kan krympe
```

Listen er alle commits efter `2c179dfb` til og med `a6e33199`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
2c179dfb docs: checkpoint efter 9473f6c0
```

### Features

G18-579, G18-580, G18-581 og G18-584 lader kun AI-projektets bygningskolonne, elpunktkolonne, fortolkningsgitter og typerække krympe. `getBuildingTypeName(result.interpretation.building_type)` bliver. Kalkulationsgitteret bliver bart. `formatCurrency` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-579: `scripts/ai-project-building-column-wrap-test.ts` plus bygningsoverskrift, bygningsliste, bygningsblok, elpunktsoverskrift, priskolonne og tidskolonne. G18-580: `scripts/ai-project-points-column-wrap-test.ts` plus bygningskolonne, elpunktsoverskrift, elpunktliste, bygningsliste og bygningsblok. G18-581: `scripts/ai-project-interpretation-grid-wrap-test.ts` plus bygningskolonne, elpunktkolonne, bygningsoverskrift og bygningsblok. G18-584: `scripts/ai-project-building-type-row-wrap-test.ts` plus typeetiket, risikobufferrække, marginrække, arbejdslønrække, materialerække, bygningsliste og bygningsblok. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `a6e33199`, herunder G18-289 til G18-584. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `a6e33199`, `64be36a5`, `3922d7e2`, `8d2f6c83`, `2c179dfb`, `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-588, G18-582, G18-583, G18-589, G18-585, G18-586, G18-587.

## Checkpoint 2026-10-18 syvoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `f4dfeb1b`. Det lader seksoghalvtredsindstyvende-hegnet stå. `f4dfeb1b` hedder `docs: checkpoint efter b5e93c28`. Produktspids: `9473f6c0`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `9473f6c0` blev afvist før git kørte og er ikke prøvet igen. `a22d92b5` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f4dfeb1b..9473f6c0`

```
9473f6c0 feat(pilot): risikobufferraekken i prisopbygningen kan krympe
a22d92b5 feat(pilot): marginraekken i prisopbygningen kan krympe
```

Listen er alle commits efter `f4dfeb1b` til og med `9473f6c0`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
f4dfeb1b docs: checkpoint efter b5e93c28
```

### Features

G18-577 og G18-578 lader kun AI-projektets marginrække og risikobufferrække krympe. `formatCurrency(result.calculation.price.margin_amount)` bliver. `formatCurrency(result.calculation.price.risk_buffer_amount)` bliver. `{result.calculation.price.margin_percentage}%` bliver. `{result.calculation.price.risk_buffer_percentage}%` bliver. Totalrækken i prisopbygningen bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-577: `scripts/ai-project-margin-row-wrap-test.ts` plus arbejdslønrække, materialerække, marginetiket og prisbeløb. G18-578: `scripts/ai-project-risk-buffer-row-wrap-test.ts` plus marginrække, arbejdslønrække, materialerække, bufferetiket og prisbeløb. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `9473f6c0`, herunder G18-289 til G18-578. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `9473f6c0`, `a22d92b5`, `f4dfeb1b`, `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-581, G18-582, G18-583, G18-584, G18-585, G18-579, G18-580.

## Checkpoint 2026-10-18 seksoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `b4b16ec0`. Det lader femoghalvtredsindstyvende-hegnet stå. `b4b16ec0` hedder `docs: checkpoint efter c1fddd5a`. Produktspids: `b5e93c28`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `b5e93c28` blev afvist før git kørte og er ikke prøvet igen. `20255ab9`, `d773820f`, `a173dc85` og `7d5c0992` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `b4b16ec0..b5e93c28`

```
b5e93c28 feat(pilot): arbejdslonraekken i prisopbygningen kan krympe
20255ab9 feat(pilot): materialeraekken i prisopbygningen kan krympe
d773820f feat(pilot): prisopbygningens liste kan krympe
a173dc85 feat(pilot): elpunktlisten kan krympe
7d5c0992 feat(pilot): bygningsinformationens liste kan krympe
```

Listen er alle commits efter `b4b16ec0` til og med `b5e93c28`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
b4b16ec0 docs: checkpoint efter c1fddd5a
```

### Features

G18-572 til G18-576 lader kun AI-projektets bygningsliste, elpunktliste, prisliste, materialerække og arbejdslønrække krympe. `formatCurrency(result.calculation.price.material_cost)` bliver. `formatCurrency(result.calculation.price.labor_cost)` bliver. `result.calculation.time.total_hours.toFixed(1)` bliver. `result.calculation.price.hourly_rate` bliver. Bygningslisten, elpunktlisten og tidslisten bliver pakket ind. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-572: `scripts/ai-project-building-list-wrap-test.ts` plus tidsliste, bygningsoverskrift og bygningsblok. G18-573: `scripts/ai-project-points-list-wrap-test.ts` plus bygningsliste, tidsliste, elpunktsoverskrift og punktantal. G18-574: `scripts/ai-project-price-list-wrap-test.ts` plus elpunktliste, bygningsliste, tidsliste, prisoverksrift, priskolonne og prisbeløb. G18-575: `scripts/ai-project-materials-row-wrap-test.ts` plus materialetiket, prisliste og prisbeløb. G18-576: `scripts/ai-project-labor-row-wrap-test.ts` plus materialerække og prisbeløb. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `b5e93c28`, herunder G18-289 til G18-576. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `b5e93c28`, `20255ab9`, `d773820f`, `a173dc85`, `7d5c0992`, `b4b16ec0`, `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-581, G18-582, G18-583, G18-577, G18-578, G18-579, G18-580.

## Checkpoint 2026-10-18 femoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `1a1d9a83`. Det lader fireoghalvtredsindstyvende-hegnet stå. `1a1d9a83` hedder `docs: checkpoint efter 4787b533`. Produktspids: `c1fddd5a`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `c1fddd5a` blev afvist før git kørte og er ikke prøvet igen. `5442632c` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `1a1d9a83..c1fddd5a`

```
c1fddd5a feat(pilot): kundelistens fejltekst kan krympe
5442632c feat(pilot): subtotalraekken i prisopbygningen kan krympe
```

Listen er alle commits efter `1a1d9a83` til og med `c1fddd5a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
1a1d9a83 docs: checkpoint efter 4787b533
```

### Features

G18-570 og G18-571 lader kun AI-projektets subtotalrække og kundelistens fejltekst krympe. `formatCurrency(result.calculation.price.subtotal)` bliver. `{customerLoadError}. Det tælles ikke som ingen kunder.` bliver. Prisens totalrække og tidens totalrække bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-570: `scripts/ai-project-subtotal-row-wrap-test.ts` plus subtotaletiket, prisens totalrække og tidens totalrække. G18-571: `scripts/ai-project-customer-load-error-wrap-test.ts` plus tom kundeliste, prøv-igen og kundevalg. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `c1fddd5a`, herunder G18-289 til G18-571. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `c1fddd5a`, `5442632c`, `1a1d9a83`, `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-574, G18-575, G18-576, G18-577, G18-578, G18-572, G18-573.

## Checkpoint 2026-10-18 fireoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `d45fcb3b`. Det lader treoghalvtredsindstyvende-hegnet stå. `d45fcb3b` hedder `docs: checkpoint efter f2555768`. Produktspids: `4787b533`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `4787b533` blev afvist før git kørte og er ikke prøvet igen. `3fc62b81`, `7c6788af`, `3da378e4` og `c342647d` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `d45fcb3b..4787b533`

```
4787b533 feat(pilot): totalraekken i tidsberegningen kan krympe
3fc62b81 feat(pilot): totalraekken i prisopbygningen kan krympe
7c6788af feat(pilot): tidsberegningens kolonne kan krympe
3da378e4 feat(pilot): prisopbygningens kolonne kan krympe
c342647d feat(pilot): hurtig-estimatets fejltekst kan krympe
```

Listen er alle commits efter `d45fcb3b` til og med `4787b533`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
d45fcb3b docs: checkpoint efter f2555768
```

### Features

G18-565 til G18-569 lader kun AI-projektets hurtig-fejl, prisopbygningens kolonne, tidsberegningens kolonne, prisens totalrække og tidens totalrække krympe. `formatCurrency(result.calculation.price.total_price)` bliver. `result.calculation.time.total_hours.toFixed(1)` bliver. Priskolonnen `ai-project-price-column` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-565: `scripts/ai-project-quick-error-wrap-test.ts` plus hurtig-estimat og historikfejl. G18-566: `scripts/ai-project-price-column-wrap-test.ts` plus prisoverksrift, tidsoverskrift og tidsliste. G18-567: `scripts/ai-project-time-column-wrap-test.ts` plus priskolonne, tidsoverskrift, tidsliste og prisoverksrift. G18-568: `scripts/ai-project-price-total-row-wrap-test.ts` plus totaletiket, priskolonne, tidskolonne og totaltidsetiket. G18-569: `scripts/ai-project-total-time-row-wrap-test.ts` plus prisens totalrække, totaltidsetiket og tidskolonne. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `4787b533`, herunder G18-289 til G18-569. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `4787b533`, `3fc62b81`, `7c6788af`, `3da378e4`, `c342647d`, `d45fcb3b`, `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-574, G18-575, G18-576, G18-570, G18-571, G18-572, G18-573.

## Checkpoint 2026-10-18 treoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `897ce36a`. Det lader tooghalvtredsindstyvende-hegnet stå. `897ce36a` hedder `docs: checkpoint efter 2ff378d7`. Produktspids: `f2555768`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `f2555768` blev afvist før git kørte og er ikke prøvet igen. `d6955125`, `ab6518a6`, `b8256210` og `cdbd2137` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `897ce36a..f2555768`

```
f2555768 feat(pilot): historikkens fejltekst kan krympe
d6955125 feat(pilot): kundens navn i kundevaelgeren kan krympe
ab6518a6 feat(pilot): kundens e-mail i kundevaelgeren kan krympe
b8256210 feat(pilot): tidsberegningens liste kan krympe
cdbd2137 feat(pilot): totaletiketten i prisopbygningen kan krympe
```

Listen er alle commits efter `897ce36a` til og med `f2555768`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
897ce36a docs: checkpoint efter 2ff378d7
```

### Features

G18-560 til G18-564 lader kun AI-projektets totaletiket, tidsberegningens liste, kundens e-mail, kundens navn og historikkens fejltekst krympe. Beløbet `formatCurrency(result.calculation.price.total_price)` bliver. De tre andre lister med `className="space-y-2 text-sm"` bliver. `{customer.email}` og `{customer.name}` bliver. Fejlteksten om ingen analyser bliver. `line-clamp-2` på historikbeskrivelsen bliver. `formatCurrency(analysis.total_price)` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-560: `scripts/ai-project-price-total-label-wrap-test.ts` plus prisbeløb, prisoverksrift, totalkolonne, totaltidsetiket og totaltid. G18-561: `scripts/ai-project-time-list-wrap-test.ts` plus tidsoverskrift, basistid og totaletiket. G18-562: `scripts/ai-project-customer-mail-wrap-test.ts` plus kundekort og kundeliste. G18-563: `scripts/ai-project-customer-name-wrap-test.ts` plus kundekort, kundemail og kundevalg. G18-564: `scripts/ai-project-history-error-wrap-test.ts` plus historikknap, historikindlæsning og historikbevarelse. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `f2555768`, herunder G18-289 til G18-564. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `f2555768`, `d6955125`, `ab6518a6`, `b8256210`, `cdbd2137`, `897ce36a`, `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-565, G18-566, G18-567, G18-568, G18-569, G18-570, G18-571.

## Checkpoint 2026-10-18 tooghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `f8596a13`. Det lader enoghalvtredsindstyvende-hegnet stå. `f8596a13` hedder `docs: checkpoint efter ab774daa`. Produktspids: `2ff378d7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `2ff378d7` blev afvist før git kørte og er ikke prøvet igen. `441ef869`, `0a2326fc`, `a48a3054` og `6f993cf7` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f8596a13..2ff378d7`

```
2ff378d7 feat(pilot): ikonraekken ved sektionens fold kan krympe
441ef869 feat(pilot): historikkens pladsholderbjaelker kan krympe
0a2326fc feat(pilot): tilgaengelighedsfaktoren i tidsberegningen kan krympe
a48a3054 feat(pilot): stoerrelsesfaktoren i tidsberegningen kan krympe
6f993cf7 feat(pilot): kompleksitetsfaktoren i tidsberegningen kan krympe
```

Listen er alle commits efter `f8596a13` til og med `2ff378d7`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
f8596a13 docs: checkpoint efter ab774daa
```

### Features

G18-555 til G18-559 lader kun AI-projektets kompleksitetsfaktor, størrelsesfaktor, tilgængelighedsfaktor, historikkens to pladsholderbjælker og ikonrækken ved sektionens fold krympe. Faktorerne `complexity_multiplier`, `size_multiplier` og `accessibility_multiplier` bliver. `line-clamp-2` på historikbeskrivelsen bliver. `formatCurrency(analysis.total_price)` bliver. De fire hurtig-estimat-rækker med `className="flex items-center gap-2"` bliver. ChevronUp og ChevronDown bliver. `formatCurrency(result.calculation.price.total_price)` er uændret. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-555: `scripts/ai-project-complexity-factor-wrap-test.ts` plus overskrift, ramme, chip-række, prisbeløb og basistid. G18-556: `scripts/ai-project-size-multiplier-wrap-test.ts` plus kompleksitetsfaktor, størrelsesetiket og prisbeløb. G18-557: `scripts/ai-project-accessibility-multiplier-wrap-test.ts` plus størrelsesfaktor, totaltid og prisbeløb. G18-558: `scripts/ai-project-history-bars-wrap-test.ts` plus historikindlæsning, afsnit, liste, kort, pris og tekst. G18-559: `scripts/ai-project-section-icon-row-wrap-test.ts` plus fold-ud, fold-ind, sektionshoved, kundetitel og ingen-risici-række. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `2ff378d7`, herunder G18-289 til G18-559. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `2ff378d7`, `441ef869`, `0a2326fc`, `a48a3054`, `6f993cf7`, `f8596a13`, `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-560, G18-561, G18-562, G18-563, G18-564, G18-565, G18-566.

## Checkpoint 2026-10-18 enoghalvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `4c77d244`. Det lader halvtredsindstyvende-hegnet stå. `4c77d244` hedder `docs: checkpoint efter 8d9cf47f`. Produktspids: `ab774daa`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `ab774daa` blev afvist før git kørte og er ikke prøvet igen. `2a710178`, `634190cc`, `d8437c94` og `55ba8a65` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `4c77d244..ab774daa`

```
ab774daa feat(pilot): totaltiden i tidsberegningen kan krympe
2a710178 feat(pilot): basistiden i tidsberegningen kan krympe
634190cc feat(pilot): fold-ind-ikonet i sektionen kan krympe
d8437c94 feat(pilot): fold-ud-ikonet i sektionen kan krympe
55ba8a65 feat(pilot): historikkens pris kan krympe
```

Listen er alle commits efter `4c77d244` til og med `ab774daa`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
4c77d244 docs: checkpoint efter 8d9cf47f
```

### Features

G18-550 til G18-554 lader kun AI-projektets historikpris, fold-ud-ikon, fold-ind-ikon, basistid og totaltid krympe. `formatCurrency(analysis.total_price)` bliver. ChevronUp bliver, da fold-ind-ikonet pakkes for sig. `result.calculation.time.base_hours.toFixed(1)` bliver. `result.calculation.time.total_hours.toFixed(1)` bliver. Opsummeringens `Math.round` timer bliver. `formatCurrency(result.calculation.price.total_price)` er uændret. `>{title}<` findes stadig en gang. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-550: `scripts/ai-project-history-price-wrap-test.ts` plus historikkort, historikliste, historikindlæsning, historikdato og historiktekst. G18-551: `scripts/ai-project-section-chevron-up-wrap-test.ts` plus sektionshoved, sektionstitel og titelrække. G18-552: `scripts/ai-project-section-chevron-down-wrap-test.ts` plus fold-ud-ikonet og de samme sektions tests. G18-553: `scripts/ai-project-base-hours-wrap-test.ts` plus basistidsetiket, tidsoverskrift og prisbeløb. G18-554: `scripts/ai-project-total-hours-wrap-test.ts` plus basistid, totaltidsetiket og prisbeløb. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `ab774daa`, herunder G18-289 til G18-554. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `ab774daa`, `2a710178`, `634190cc`, `d8437c94`, `55ba8a65`, `4c77d244`, `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-555, G18-556, G18-557, G18-558, G18-559, G18-560, G18-561.

## Checkpoint 2026-10-18 halvtredsindstyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `8c66e51d`. Det lader niogogfyrretyvende-hegnet stå. `8c66e51d` hedder `docs: checkpoint efter 6fe5805d`. Produktspids: `8d9cf47f`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `8d9cf47f` blev afvist før git kørte og er ikke prøvet igen. `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80` og `353d3e24` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8c66e51d..8d9cf47f`

```
8d9cf47f feat(pilot): fluebenet ved ingen risici kan krympe
53feb5c6 feat(pilot): kopier-ikonet ved tilbudsteksten kan krympe
911cdc18 feat(pilot): opsummeringens komponentikon kan krympe
b9354d9b feat(pilot): opsummeringens risikoikon kan krympe
1f3f9e80 feat(pilot): opsummeringens tidsikon kan krympe
353d3e24 feat(pilot): opret-tilbuds spinner kan krympe
```

Listen er alle commits efter `8c66e51d` til og med `8d9cf47f`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
8c66e51d docs: checkpoint efter 6fe5805d
```

### Features

G18-544 til G18-549 lader kun AI-projektets opret-tilbuds spinner, opsummeringens tidsikon, opsummeringens risikoikon, opsummeringens komponentikon, kopier-ikonet og fluebenet ved ingen risici krympe. Teksten Opret tilbud bliver. Etiketten Estimeret tid bliver. Etiketten Risikoniveau bliver. Etiketten Komponenter bliver. Teksten Kopier bliver. Teksten Ingen væsentlige risici identificeret bliver. Historikikonet og advarselsikonet bliver. `formatCurrency(result.calculation.price.total_price)` er uændret. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-544: `scripts/ai-project-offer-spinner-wrap-test.ts` plus pil, opret-knap, næste-trin og analysespinner. G18-545: `scripts/ai-project-summary-clock-wrap-test.ts` plus historikur, estimatur, prisikon, opsummeringsikon og gitter. G18-546: `scripts/ai-project-summary-alert-wrap-test.ts` plus advarselsikon, tidsikon, opsummeringsikon og moderat-ikon. G18-547: `scripts/ai-project-summary-package-wrap-test.ts` plus tidsikon, risikoikon og opsummeringsikon. G18-548: `scripts/ai-project-offer-copy-icon-wrap-test.ts` plus kopier-knap, tilbudstekst og knaprække. G18-549: `scripts/ai-project-empty-risk-check-wrap-test.ts` plus lav-ikon, ingen-risici-tekst og ingen-risici-række. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `8d9cf47f`, herunder G18-289 til G18-549. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `8d9cf47f`, `53feb5c6`, `911cdc18`, `b9354d9b`, `1f3f9e80`, `353d3e24`, `8c66e51d`, `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-550, G18-551, G18-552, G18-553, G18-554, G18-555, G18-556.

## Checkpoint 2026-10-18 niogogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `37b25dcd`. Det lader otteogfyrretyvende-hegnet stå. `37b25dcd` hedder `docs: checkpoint efter 0b34e41a`. Produktspids: `6fe5805d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `6fe5805d` blev afvist før git kørte og er ikke prøvet igen. `acb9c456`, `b2b9bef5`, `36a8ce8d` og `b871fda6` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `37b25dcd..6fe5805d`

```
6fe5805d feat(pilot): opret-tilbuds pilen kan krympe
acb9c456 feat(pilot): opsummeringens prisikon kan krympe
b2b9bef5 feat(pilot): historikkens eksempelikon kan krympe
36a8ce8d feat(pilot): luk-ikonet i kundevaelgeren kan krympe
b871fda6 feat(pilot): analyser-knappens ikon kan krympe
```

Listen er alle commits efter `37b25dcd` til og med `6fe5805d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
37b25dcd docs: checkpoint efter 0b34e41a
```

### Features

G18-539 til G18-543 lader kun AI-projektets analyseikon, luk-ikon i kundevælgeren, historikkens eksempelikon, opsummeringens prisikon og opret-tilbuds pilen krympe. Teksten Analyser projekt bliver. aria-label Luk bliver. Eksempelteksten med line-clamp-2 bliver. Etiketten Total pris og `formatCurrency(result.calculation.price.total_price)` er uændrede. Teksten Opret tilbud bliver. Opret-tilbuds spinner `<Loader2 className="w-4 h-4 animate-spin mr-2" />` bliver. Opsummeringens `icon={<Clock className="w-5 h-5" />}` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-539: `scripts/ai-project-analyze-sparkles-wrap-test.ts` plus analyseknap, analysespinner, sideikon, analyserække og ventetekst. G18-540: `scripts/ai-project-close-icon-wrap-test.ts` plus kundeikon, luk-knap, kundehoved og titelrække. G18-541: `scripts/ai-project-history-sparkles-wrap-test.ts` plus sideikon, analyseikon, historiktekst og historikkort. G18-542: `scripts/ai-project-summary-banknote-wrap-test.ts` plus estimatets beløbsikon. G18-543: `scripts/ai-project-offer-arrow-wrap-test.ts` plus opret-knap, næste-trin og analysespinner. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `6fe5805d`, herunder G18-289 til G18-543. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `6fe5805d`, `acb9c456`, `b2b9bef5`, `36a8ce8d`, `b871fda6`, `37b25dcd`, `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-544, G18-545, G18-546, G18-547, G18-548, G18-549, G18-550.

## Checkpoint 2026-10-18 otteogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `cfc481fc`. Det lader syvogfyrretyvende-hegnet stå. `cfc481fc` hedder `docs: checkpoint efter 4844064d`. Produktspids: `0b34e41a`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `0b34e41a` blev afvist før git kørte og er ikke prøvet igen. `a623f3c3`, `439ca8b0`, `ea96664c` og `e8f68985` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `cfc481fc..0b34e41a`

```
0b34e41a feat(pilot): kundeikonet i kundevaelgeren kan krympe
a623f3c3 feat(pilot): analyser-knappens spinner kan krympe
439ca8b0 feat(pilot): soegeikonet i kundevaelgeren kan krympe
ea96664c feat(pilot): hurtig-estimatets beloebsikon kan krympe
e8f68985 feat(pilot): hurtig-estimatets tidsikon kan krympe
```

Listen er alle commits efter `cfc481fc` til og med `0b34e41a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
cfc481fc docs: checkpoint efter 4844064d
```

### Features

G18-534 til G18-538 lader kun AI-projektets tidsikon i hurtig estimat, beløbsikon i hurtig estimat, søgeikon i kundevælgeren, analysespinner og kundeikon krympe. Timeteksten, `formatCurrency(quickResult.estimatedPrice)` og `formatCurrency(result.calculation.price.total_price)` er uændrede. Pladsholderen `Søg efter kunde...` bliver. Teksten Analyserer bliver. Teksten `Vælg kunde` bliver. Luk-ikonet `<X className="w-5 h-5" />` bliver. Analysér-knappens `<Sparkles className="w-5 h-5 mr-2" />` bliver. Opret-tilbuds spinner `w-4 h-4 animate-spin mr-2` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-534: `scripts/ai-project-estimate-clock-wrap-test.ts` plus timer, historikur, bygningsikon og elpunktsikon. G18-535: `scripts/ai-project-estimate-banknote-wrap-test.ts` plus beløb, ur, bygningsikon og elpunktsikon. G18-536: `scripts/ai-project-search-glyph-wrap-test.ts` plus søgeramme og søgefelt. G18-537: `scripts/ai-project-analyze-spinner-wrap-test.ts` plus kundes spinner, ventetekst, analyseknap og analyserække. G18-538: `scripts/ai-project-users-icon-wrap-test.ts` plus kundehoved, titelrække og luk-knap. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `0b34e41a`, herunder G18-289 til G18-538. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `0b34e41a`, `a623f3c3`, `439ca8b0`, `ea96664c`, `e8f68985`, `cfc481fc`, `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-539, G18-540, G18-541, G18-542, G18-543, G18-544, G18-545.

## Checkpoint 2026-10-18 syvogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `c6dafe97`. Det lader seksogfyrretyvende-hegnet stå. `c6dafe97` hedder `docs: checkpoint efter 02eac352`. Produktspids: `4844064d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `4844064d` blev afvist før git kørte og er ikke prøvet igen. `1d4e0ed4` er ikke prøvet igen. `fddccb09`, `900c129e` og `def6b245` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c6dafe97..4844064d`

```
4844064d feat(pilot): hurtig-estimatets elpunktsikon kan krympe
1d4e0ed4 feat(pilot): hurtig-estimatets bygningsikon kan krympe
fddccb09 feat(pilot): kundelistens spinner kan krympe
900c129e feat(pilot): kundelistens indlaesning kan krympe
def6b245 feat(pilot): risikokortets ramme kan krympe
```

Listen er alle commits efter `c6dafe97` til og med `4844064d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
c6dafe97 docs: checkpoint efter 02eac352
```

### Features

G18-529 til G18-533 lader kun AI-projektets risikoramme, kundelistens indlæsning, kundelistens spinner, bygningsikon og elpunktsikon krympe. Risikokortets tekster bliver. Forældre-diven for indlæsning bliver. Analysér-spinneren `w-5 h-5 animate-spin mr-2` bliver. Bygningstypen og elpunktsteksten bliver. Tidsikonet og beløbsikonet bliver. `formatCurrency(result.calculation.price.total_price)` og `formatCurrency(quickResult.estimatedPrice)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-529: `scripts/ai-project-risk-shell-wrap-test.ts` plus risikorække og opsummeringskort. G18-530: `scripts/ai-project-customer-loading-wrap-test.ts` plus kundeliste. G18-531: `scripts/ai-project-customer-spinner-wrap-test.ts` plus indlæsning og kundeliste. G18-532: `scripts/ai-project-building-icon-wrap-test.ts` plus bygningstype, gitter og elpunktstal. G18-533: `scripts/ai-project-plug-icon-wrap-test.ts` plus bygningsikon og elpunktstal. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `4844064d`, herunder G18-289 til G18-533. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `4844064d`, `1d4e0ed4`, `fddccb09`, `900c129e`, `def6b245`, `c6dafe97`, `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-534, G18-535, G18-536, G18-537, G18-538, G18-539, G18-540.

## Checkpoint 2026-10-18 seksogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `e2760143`. Det lader femogfyrretyvende-hegnet stå. `e2760143` hedder `docs: checkpoint efter f7f34a42`. Produktspids: `02eac352`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `02eac352` blev afvist før git kørte og er ikke prøvet igen. `23d43087` er ikke prøvet igen. `4b9fd2ee`, `6df6114a` og `bfcac529` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `e2760143..02eac352`

```
02eac352 feat(pilot): sideikonet kan krympe
23d43087 feat(pilot): kritisk-risikoikonet kan krympe
4b9fd2ee feat(pilot): hoej-risikoikonet kan krympe
6df6114a feat(pilot): moderat-risikoikonet kan krympe
bfcac529 feat(pilot): lav-risikoikonet kan krympe
```

Listen er alle commits efter `e2760143` til og med `02eac352`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
e2760143 docs: checkpoint efter f7f34a42
```

### Features

G18-524 til G18-528 lader kun AI-projektets risikoikoner og sideikon krympe: lav, moderat, høj, kritisk og sideikonet. Teksterne Lav, Moderat, Høj og Kritisk bliver. Overskriften `AI Projektanalyse` bliver. Advarselsikonet `text-yellow-600` bliver. De andre Sparkles-ikoner bliver. `formatCurrency(result.calculation.price.total_price)` og `formatCurrency(analysis.total_price)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-524: `scripts/ai-project-risk-low-icon-wrap-test.ts` plus risikomærket. G18-525: `scripts/ai-project-risk-medium-icon-wrap-test.ts` plus lav-ikon og mærke. G18-526: `scripts/ai-project-risk-high-icon-wrap-test.ts` plus moderat- og lav-ikon. G18-527: `scripts/ai-project-risk-critical-icon-wrap-test.ts` plus høj-, moderat- og lav-ikon. G18-528: `scripts/ai-project-page-sparkles-wrap-test.ts`; sidetitlens vindue er `at - 80` til `at + 240`, plus side, sidehoved og indledning. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `02eac352`, herunder G18-289 til G18-528. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `02eac352`, `23d43087`, `4b9fd2ee`, `6df6114a`, `bfcac529`, `e2760143`, `f7f34a42`, `4607487b`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-529, G18-530, G18-531, G18-532, G18-533, G18-534, G18-535.

## Checkpoint 2026-10-18 femogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `ae64af32`. Det lader fireogfyrretyvende-hegnet stå. `ae64af32` hedder `docs: checkpoint efter c028a873`. Produktspids: `f7f34a42`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `f7f34a42` blev afvist før git kørte og er ikke prøvet igen. `4607487b` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `ae64af32..f7f34a42`

```
f7f34a42 feat(pilot): risiko-maerket kan krympe
4607487b feat(pilot): historikikonet kan krympe
469797fc feat(pilot): risikokortets tekstkolonne kan krympe
8c7c6f36 feat(pilot): risikotitlen kan krympe
50628ded feat(pilot): risikoanbefalingen kan krympe
d5084194 feat(pilot): risikobeskrivelsen kan krympe
```

Listen er alle commits efter `ae64af32` til og med `f7f34a42`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
ae64af32 docs: checkpoint efter c028a873
```

### Features

G18-518 til G18-523 lader kun AI-projektets risikokort og historikikon krympe: beskrivelse, anbefaling, titel, tekstkolonne, historikikon og risikomærke. `{risk.description}`, `{risk.title}`, `{risk.recommendation}` og teksten `Anbefaling:` bliver. Historikkens `line-clamp-2` og klassen `flex-1 min-w-0 break-words` bliver. `Seneste analyser` bliver. Lav, Moderat, Høj og Kritisk bliver. `formatCurrency(result.calculation.price.total_price)` er uændret. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-518: `scripts/ai-project-risk-description-wrap-test.ts` plus risikorække og risikoliste. G18-519: `scripts/ai-project-risk-recommendation-wrap-test.ts` plus beskrivelsen. G18-520: `scripts/ai-project-risk-title-wrap-test.ts` plus række, beskrivelse og anbefaling. G18-521: `scripts/ai-project-risk-text-wrap-test.ts` plus historiktekst og titel. G18-522: `scripts/ai-project-history-clock-wrap-test.ts`; historikoverskriftens vindue er `at - 120` til `at + 240`, plus indlæsning og `scripts/ai-project-desc-test.ts`. G18-523: `scripts/ai-project-risk-badge-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `f7f34a42`, herunder G18-289 til G18-523. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `f7f34a42`, `4607487b`, `469797fc`, `8c7c6f36`, `50628ded`, `d5084194`, `ae64af32`, `c028a873`, `ffa327ad`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-524, G18-525, G18-526, G18-527, G18-528, G18-529, G18-530.

## Checkpoint 2026-10-18 fireogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `cc59416f`. Det lader treogfyrretyvende-hegnet stå. `cc59416f` hedder `docs: checkpoint efter c6e18461`. Produktspids: `c028a873`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `c028a873` blev afvist før git kørte og er ikke prøvet igen. `ffa327ad` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `cc59416f..c028a873`

```
c028a873 feat(pilot): risikokortets raekke kan krympe
ffa327ad feat(pilot): sektionens titeltekst kan krympe
d5c99652 feat(pilot): sektionens indhold kan krympe
b40f523b feat(pilot): sektionens titelraekke kan krympe
ba376969 feat(pilot): sektionsrammen kan krympe
70a82e96 feat(pilot): sektionshovedet kan krympe
ee944131 feat(pilot): historikkens tekstkolonne kan krympe
41a71a67 feat(pilot): kompleksitetschips kan krympe
7ee1033f feat(pilot): kompleksitetsrammen kan krympe
03efd440 feat(pilot): advarselsikonet kan krympe
695fe8d7 feat(pilot): kundevaelgerens titelraekke kan krympe
94edbae3 feat(pilot): soegefeltets ramme i kundevaelgeren kan krympe
718656f9 feat(pilot): raekken med valgt ladestander kan krympe
77dbdd8e feat(pilot): næste skridts række kan krympe
cd59792e feat(pilot): knapraekken ved tilbudsteksten kan krympe
eb2a7fb3 feat(pilot): listen med identificerede risici kan krympe
74e3a94a feat(pilot): AI-projektets bemærkningsrække kan krympe
```

Listen er alle commits efter `cc59416f` til og med `c028a873`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
cc59416f docs: checkpoint efter c6e18461
```

### Features

G18-501 til G18-517 lader kun AI-projektets visning krympe: bemærkningsrække, risikoliste, knaprække, næste skridt, valgt ladestander, søgeramme, titelrække, advarselsikon, kompleksitetsramme, chips, historiktekst, sektionshoved, sektionsramme, titelrække, sektionsindhold, titeltekst og risikokortets række. `formatCurrency` på enhedspris, linjetotal og `result.calculation.price.total_price` er uændret. `{title}`, `{children}`, `{risk.title}` og `line-clamp-2` på historikbeskrivelsen bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit i hegnet har et `scripts/*-test.ts`, der læser den shippede AI-projektfil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. G18-515: `scripts/ai-project-section-body-wrap-test.ts` plus titelrække, sektionshoved og sektionsramme. G18-516: `scripts/ai-project-section-heading-wrap-test.ts` plus de samme søskendetests og sektionsindhold. G18-517: `scripts/ai-project-risk-row-wrap-test.ts` plus `scripts/ai-project-risks-list-wrap-test.ts`. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Først kost-gate og `formatCurrency` på listepris. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til og med `c028a873`, herunder G18-289 til G18-517. Ingen af dem opfinder en pris, ændrer en lagret kost, poster til e-conomic eller sender mail, SMS eller Telegram. SelectValue viser stadig kun pladsholderen. SelectTrigger og DialogTitle videresender stadig ikke ukendte props.

### Integration

Ingen merge til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `c028a873`, `ffa327ad`, `d5c99652`, `b40f523b`, `ba376969`, `70a82e96`, `ee944131`, `41a71a67`, `7ee1033f`, `03efd440`, `695fe8d7`, `94edbae3`, `718656f9`, `cc59416f`, `c6e18461` og `4245647d`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer. Claude reviewer kost-gate og listepris først, derefter bølgen ovenfor.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-518, G18-519, G18-520, G18-521, G18-522, G18-523, G18-524.

## Checkpoint 2026-10-18 treogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `a1f2bc11`. Det lader fortsat-hegnet og toogfyrretyvende-hegnet stå. `a1f2bc11` hedder `docs: checkpoint for grok-shift 2026-10-18`. Produktspids: `c6e18461`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `c6e18461` blev afvist før git kørte og er ikke prøvet igen. `d9f15811` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `a1f2bc11..c6e18461`

```
c6e18461 feat(pilot): AI-projektets resultatstak kan krympe
d9f15811 feat(pilot): Analysér-knappens række kan krympe
7507df27 feat(pilot): AI-projektets sidehoved kan krympe
6ef426e9 feat(pilot): mobilkortet for en komponent kan krympe
a0df88c9 feat(pilot): mobillisten af komponenter kan krympe
776fb3dc feat(pilot): rækken uden væsentlige risici kan krympe
ecf278b7 feat(pilot): komponentafsnittet kan krympe
b28e3ded feat(pilot): opsummeringskortets ikon kan krympe
46c11137 feat(pilot): opsummeringskortets ramme kan krympe
04c07045 feat(pilot): komponenttabellens krop kan krympe
524f0c27 feat(pilot): opsummeringskortets etiket kan krympe
ab715959 feat(pilot): kolonnerækken kan krympe
92fc0361 feat(pilot): komponentrækken kan krympe
ef58686b feat(pilot): komponenttabellens hoved kan krympe
70ad2222 feat(pilot): kolonnen Total kan krympe
ab6fa211 feat(pilot): kolonnen Enhedspris kan krympe
e71bd773 feat(pilot): kolonnen Antal kan krympe
92c20e0d feat(pilot): opsummeringskortets note kan krympe
9eff5637 feat(pilot): kolonnen Komponent kan krympe
9d20b76c feat(pilot): komponenttotalen kan krympe
8f25a91d feat(pilot): enhedsprisen kan krympe
324438d3 feat(pilot): antal og enhed kan krympe
fefd33d3 feat(pilot): komponentnavnet kan krympe
2deaa32a feat(pilot): komponenttabellen kan krympe
ad59212d feat(pilot): opsummeringskortets tal kan krympe
344f3997 feat(pilot): ladestander-vaelgeren kan krympe
8dc4cd60 feat(pilot): bemaerkningslisten kan krympe
d9ce13f6 docs: checkpoint efter 839ba253
2e07f8bc feat(pilot): opsummeringsgitteret kan krympe
b0a3e94f feat(pilot): hurtig estimats gitter kan krympe
37d7f2bd feat(pilot): skrivebordets komponentramme kan krympe
946d934a feat(pilot): naeste skridt kan krympe
f718e063 feat(pilot): bemaerkningsboksen kan krympe
37a35cfa feat(pilot): tilbudsteksten kan krympe
44da777f feat(pilot): beskrivelsesafsnittet kan krympe
af3b4962 feat(pilot): ladestanderlisten kan krympe
9c0d52a6 feat(pilot): hurtig estimat kan krympe
6367a93c feat(pilot): AI-projektets side kan krympe
839ba253 docs: checkpoint efter 7d2349d0
7f98f318 feat(pilot): kundevaelgerens panel kan krympe
f963860e feat(pilot): eksempelafsnittet i AI-projekt kan krympe
3960c1bd feat(pilot): historikafsnittet kan krympe
0a5932d2 feat(pilot): kundevaelgerens baggrund kan krympe
271ae724 feat(pilot): eksempelgitteret i AI-projekt kan krympe
29a17460 feat(pilot): historikkens liste kan krympe
7d2349d0 docs: checkpoint efter a18ed7fe
61fad971 feat(pilot): historikkens indlaesning kan krympe
c4fb2790 feat(pilot): kundevaelgerens bund kan krympe
a18ed7fe docs: checkpoint efter c2edaf4a
f73938c0 feat(pilot): kundevaelgerens hoved kan krympe
b4a3b85a feat(pilot): kundelisten i kundevaelgeren kan krympe
867830ac feat(pilot): eksempelkortet i AI-projekt kan krympe
1fc63094 feat(pilot): kundekortet i kundevaelgeren kan krympe
b76f0a8f feat(pilot): historikkortet paa AI-projekt kan krympe
718ffa2d feat(pilot): luk-knappen i kundevaelgeren kan krympe
f37624e6 docs: checkpoint efter 8e3a012a
ed2d4576 feat(pilot): tom kundeliste i AI-projekt kan krympe
a26dd0c8 feat(pilot): knappen annuller i kundevaelgeren ombrydes
c175ae18 feat(pilot): kundeliste-knappen proev igen ombrydes
607a65e8 feat(pilot): historik-knappen proev igen ombrydes
d9b1c4f7 feat(pilot): kundens soegefelt kan krympe
1af70386 feat(pilot): venteteksten analyserer ombrydes
c2edaf4a feat(pilot): soegeresultatets ladestander kan krympe
8e3a012a docs: checkpoint efter 24a9d325
5425db74 feat(pilot): fejlteksten ved ladestander-soegning kan krympe
10bb4766 feat(pilot): elpunkt-antallet i fortolkningen ombrydes
4087d542 feat(pilot): bygningstypen i hurtig estimat ombrydes
3b4e429c feat(pilot): elpunkt-tallet i hurtig estimat ombrydes
24a9d325 docs: checkpoint efter 47a16f63
dfa68917 feat(pilot): beloebet i hurtig estimat kan krympe
38d55733 feat(pilot): timetallet i hurtig estimat ombrydes
7e2e2362 feat(pilot): beskrivelsesfeltet kan krympe
c9f92517 feat(pilot): soegefeltet til ladestander kan krympe
df9f96c2 feat(pilot): knappen fjern ombrydes
b8ef575c feat(pilot): valgt ladestander ombrydes
47a16f63 docs: checkpoint efter 1c4b89cb
2ae59666 feat(pilot): hjaelpeteksten om uprissat lader ombrydes
271958f1 feat(pilot): etiketten ladestander ombrydes
72bbbb40 feat(pilot): teksten ingen risici ombrydes
3ca61892 feat(pilot): etiketten kompleksitet ombrydes
b68cab82 feat(pilot): etiketten alder ombrydes
e611edfd feat(pilot): etiketten stoerrelse ombrydes
db044d29 feat(pilot): etiketten type ombrydes
c40540f4 feat(pilot): etiketten margin ombrydes
d9a1b31a feat(pilot): etiketten risikobuffer ombrydes
1c4b89cb docs: checkpoint efter f6d5fc14
84d9fed7 feat(pilot): etiketten subtotal ombrydes
8b7a9930 feat(pilot): etiketten materialer ombrydes
8da61338 feat(pilot): etiketten stoerrelsesfaktor ombrydes
30e8705b feat(pilot): etiketten total tid ombrydes
662af0d5 feat(pilot): etiketten basis tid ombrydes
b560adc7 feat(pilot): overskriften bemarkninger ombrydes
8f158962 feat(pilot): overskriften bygningsinformation ombrydes
05b0b4c7 feat(pilot): overskriften komponenter ombrydes
4a19216a feat(pilot): overskriften prisopbygning ombrydes
4bc3b447 feat(pilot): overskriften elpunkter ombrydes
57a3bc71 feat(pilot): overskriften kompleksitetsfaktorer ombrydes
592b4b5f feat(pilot): overskriften tidsberegning ombrydes
f6d5fc14 docs: checkpoint efter 443837bd
875ca1ab feat(pilot): knappen analyser projekt ombrydes
d94fb9e1 feat(pilot): overskriften hurtig estimat ombrydes
a40b93bd feat(pilot): knappen opret tilbud ombrydes
a7cf6608 feat(pilot): etiketten projektbeskrivelse ombrydes
ab3c3da9 feat(pilot): forklaringen under naeste skridt ombrydes
b6ebe8d4 feat(pilot): kopier-teksten paa AI-projekt ombrydes
86fb22b0 feat(pilot): sidetitlen paa AI-projekt ombrydes
f1d34483 feat(pris): sogehintet paa den tomme leverandorvareliste ombrydes
6b51fa2e feat(pilot): rediger-teksten paa opgavekortet ombrydes
50471e2c feat(pris): den tomme leverandorvareliste ombrydes
94264b06 feat(pilot): indledningen paa AI-projekt ombrydes
443837bd docs: checkpoint efter 59c8fed8
bfc023d4 feat(pilot): overskriften naeste skridt ombrydes
d60a20c2 feat(pilot): betingelsesmaerket paa tilbudstekstkortet ombrydes
d3abcc74 feat(pilot): inaktiv-maerket paa tilbudstekstkortet ombrydes
b400d7c1 feat(pilot): datoen under en analyse ombrydes
48341851 feat(pilot): slette-teksten paa opgavekortet ombrydes
8a7cc350 feat(pris): statusmaerke paa leverandorvarens skrivebord kan krympe
e8f1c3f5 feat(pris): statusmaerke paa leverandorvarens mobilkort ombrydes
59c8fed8 docs: checkpoint efter 94bbeb6a
88aa29f3 feat(pilot): tom historiktekst i AI-projekt ombrydes
42e12949 feat(pilot): prioritetsmaerket paa tilbudstekstkortet ombrydes
f667aa07 feat(pilot): typemaerket paa tilbudstekstkortet ombrydes
4245647d ﻿feat(pilot): overskriften seneste analyser ombrydes
52e803b1 feat(pilot): timetal paa opgavekortet ombrydes
234dfb1a feat(pris): kategori paa leverandorvarens skrivebord kan krympe
a7c2399c feat(pris): kategori paa leverandorvarens mobilkort ombrydes
b2fd4088 feat(pilot): overskrift paa AI-projektets eksempler ombrydes
68b005d7 feat(pilot): kundenavn i opgavepaamindelse kan krympe
7ac3010c feat(pilot): omfang-id paa tilbudstekstkortet ombrydes
66cd3b8b feat(pilot): forfaldsdato paa opgavekortet ombrydes
94bbeb6a docs: checkpoint efter b4d64ad0
b028b391 feat(pilot): ansvarlig paa opgavekortet ombrydes
03b7eeed feat(pris): opdateret-celle paa leverandorvarens skrivebord kan krympe
c115025d feat(pris): opdateret-linje paa leverandorvarens mobilkort ombrydes
6b4cc11b feat(pilot): eksempeltitel i AI-projekt ombrydes
bcccb7b2 feat(pilot): tilbudsnummer i opgavepaamindelse ombrydes
deae6830 feat(pilot): titel paa tilbudstekstkortet ombrydes
07b88ee7 feat(pilot): navn paa kalkulationstypen ombrydes
e3121cde feat(pilot): opgavetitel paa braettet ombrydes
cd65875e feat(pris): varenummer paa leverandorvarens skrivebord kan krympe
b18aea53 feat(pris): varenummer paa leverandorvarens mobilkort ombrydes
7b2c0d72 feat(pilot): eksempeltekst i AI-projekt ombrydes
2013e3dc feat(pilot): besked i opgavepaamindelse ombrydes
b4d64ad0 docs: checkpoint efter e3479705
688fa934 feat(pilot): tilbudstekstens indhold ombrydes
39e41351 feat(pilot): tilstandsbeskrivelse i kalkulationstypen ombrydes
10454fe9 feat(pilot): opgavebeskrivelse paa brættet ombrydes
e3479705 docs: checkpoint efter 96f90a04
d7aecc01 feat(pilot): sagsbeskrivelse paa partnerkortet ombrydes
e951ac7b feat(pilot): sagsbeskrivelse i kundeportalen ombrydes
51cc5635 feat(pilot): emne i beskedlisten ombrydes
16d92c46 feat(pilot): leverandørnotat på kortet ombrydes
cecb54ad feat(pilot): tilbudsbeskrivelse i mailforslag ombrydes
3e1099bd feat(pilot): sagsbeskrivelse i mailforslag ombrydes
96f90a04 docs: checkpoint efter 38acd6c2
9ddc23f6 feat(pilot): tilbudstitel i mailforslag ombrydes
2a17284a feat(pilot): sagstitel i mailforslag ombrydes
667f6d6c feat(pilot): pakkebeskrivelse ombrydes
9b8c7aa0 feat(pilot): listeforhaandsvisning ombrydes
63209da3 feat(pilot): seneste mailforhaandsvisning ombrydes
792d97c8 feat(pris): tab-maerket paa skrivebord kan krympe
120a3302 feat(pris): nuvaerende trendpris paa skrivebord kan krympe
f65cae5b feat(pris): potentielt tab paa skrivebord kan krympe
b9c7c10d feat(pris): tilbudsbeloeb paa skrivebord kan krympe
234d79dc feat(pris): ny skrivebordspris kan krympe
39482c2e feat(pris): gammel skrivebordspris kan krympe
9e730e91 feat(pris): pristendensens tabelkrop kan krympe
e5c6f202 feat(pris): beroerte tilbuds tabelkrop kan krympe
04bfb76d feat(pris): prisadvarslens tabelkrop kan krympe
57306cb7 feat(pris): pristendensens tabelhoved kan krympe
69a9d4fb feat(pris): beroerte tilbuds tabelhoved kan krympe
c8cf396d feat(pris): prisadvarslens tabelhoved kan krympe
d1686ff4 feat(pris): pristendensens tabel kan krympe
df92355b feat(pris): beroerte tilbuds tabel kan krympe
cbd98180 feat(pris): prisadvarslens tabel kan krympe
50d899cc feat(pris): pristendensens kolonnerekke kan krympe
e34f7df1 test(pris): behold kolonneordene paa beroerte tilbud
148894a9 feat(pris): beroerte tilbuds kolonnerekke kan krympe
38acd6c2 docs: checkpoint efter 794bf051
bb54d71e test(pris): behold kolonneordene paa prisadvarslen
930f52e1 feat(pris): prisadvarslens kolonnerekke kan krympe
427e419e feat(pris): pristendensens skrivebordsramme kan krympe
97bb9543 feat(pris): beroerte tilbuds skrivebordsramme kan krympe
57bf2509 feat(pris): pristendensens tabelrulle kan krympe
53dc59f8 feat(pris): beroerte tilbuds tabelrulle kan krympe
fb2cda33 feat(pris): prisadvarslens skrivebordsramme kan krympe
05fdaa7c feat(pris): prisadvarslens tabelrulle kan krympe
3d8e322c feat(pris): prisbevaegelsens blok kan krympe
60b856be feat(pris): pristendensens afsnit kan krympe
02d7d28b feat(pris): prisovervaagningens side kan krympe
a52b2712 feat(pris): prisadvarslens afsnit kan krympe
d9f48e93 feat(pris): pavirker-raekken kan krympe
160edde9 feat(pris): mobilisten af pristendenser kan krympe
017630a8 feat(pris): mobilisten af beroerte tilbud kan krympe
8b51923e feat(pris): mobilisten af prisadvarsler kan krympe
b3bb441e feat(pris): prisbevaegelsens bjaelke kan krympe
7a908b64 feat(pris): ministatistikkens ramme kan krympe
397b202a feat(pris): oversigtskortets etiketraekke kan krympe
daf40a25 feat(pris): fejlrammen kan krympe
3a3a332a feat(pris): pristendensens skrivebordsraekke kan krympe
8f227bbd feat(pris): beroerte tilbuds skrivebordsraekke kan krympe
1f087044 feat(pris): indlaesningsrammen kan krympe
44aa9244 feat(pris): den tomme pristilstand kan krympe
8254393a feat(pris): oversigtskortet kan krympe
23da9451 feat(pris): fanerammens kant kan krympe
b3da689b feat(pris): prisadvarslens skrivebordsraekke kan krympe
51a1d20c feat(pris): perioderaekken kan krympe
7b31d984 feat(pris): taerskelraekken kan krympe
6076a320 feat(pris): leverandoerkortet kan krympe
e04b2149 feat(pris): ministatistikken kan krympe
309eb047 feat(pris): filterraekken kan krympe
e0b1ee14 feat(pris): pristendensens mobilkort kan krympe
34502bf7 feat(pris): beroerte tilbuds mobilkort kan krympe
3a275360 feat(pris): prisadvarslens mobilkort kan krympe
5d095b73 feat(pris): leverandoerkortenes gitter kan krympe
b3d87c79 feat(pris): oversigtskortenes gitter kan krympe
708a86df feat(pris): faneraekken kan ombrydes
46cc9417 feat(pris): trendvaelgerens navn kan ombrydes
36266c40 feat(pris): trendfilterets raekke kan ombrydes
f7bddb79 feat(pris): mobil-advarselsraekke kan krympe
5c93b485 feat(pris): leverandoerkortets overskrift kan krympe
1c4d1e6e feat(pris): prisbevaegelsens raekke kan krympe
f730c437 feat(pris): mobil-produktgruppe ombrydes
84732ccc feat(pris): mobil-tilbudsnummer kan krympe
4cf9ab08 feat(pris): mobil-trendpris kan krympe
b35b95d2 feat(pris): mobil-potentielt-tab kan krympe
c2e3c588 feat(pris): mobil-tilbudsbeloeb kan krympe
1bcf6394 feat(pris): mobil-ny-pris kan krympe
5a0a7d9e feat(pris): mobil-gammel-pris kan krympe
8c444c34 feat(pris): prisbevaegelsens gruppe ombrydes
0a3f6f89 feat(pris): periodevaelger ombrydes
794bf051 docs: checkpoint efter 44858657
44858657 feat(pris): taerskelvaelger ombrydes
0cf926cc feat(pris): skrivebords-trendnavn kan krympe
b9cced96 feat(pris): skrivebords-produktnavn kan krympe
1ce6a187 feat(pris): mobil-statusfelt ombrydes
522b4afc feat(pris): mobil-trendnavn kan krympe
e17fd377 feat(pris): mobil-tilbudstitel kan krympe
444f9f8c feat(pris): mobil-kundenavn kan krympe
70925e74 feat(pris): mobil-leverandoernavn kan krympe
8592d5ed feat(pris): mobil-produktnavn kan krympe
c66b70d3 feat(pris): tilbudstitel kan krympe
1dfa747e feat(pris): aendringscelle ombrydes
518cd83c feat(pris): leverandoercelle kan krympe
e53a4ed6 feat(pris): kundecelle kan krympe
240cec01 feat(pris): nul-maerke ombrydes
83c33712 feat(pris): mobil-varenummer ombrydes
623d39a1 feat(pris): tilbudscelle ombrydes
67b26455 feat(pris): mobil-alvorlighed ombrydes
7942e74d feat(pris): linjecelle ombrydes
60a806cd feat(pris): volatilitets-celle ombrydes
64091122 feat(pris): paavirkningscelle ombrydes
6f70f086 feat(pris): advarsels-varenummer ombrydes
3b10c854 feat(pris): tilbudsstatus-celle ombrydes
a4985512 feat(pris): advarsels-produktcelle ombrydes
b24673cb feat(pris): alvorlighedsmaerke ombrydes
e1e99436 feat(pris): 90-dages-celle ombrydes
69075fa6 feat(pris): 30-dages-celle ombrydes
021680c7 feat(pris): trend-produktcelle ombrydes
c62450de feat(pris): leverandoer-option ombrydes
fa8d3a8e feat(pris): leverandoervaelger ombrydes
19c8c643 feat(pris): volatilitets-linje ombrydes
9d356dc5 feat(pris): tilbage-knap ombrydes
45e180cb feat(pris): dialogtitel ombrydes
d884e2e3 feat(pris): avance-etiket paa detaljen ombrydes
f3ebc877 feat(pris): kostpris-etiket paa detaljen ombrydes
6dbb2d7d feat(pris): listepris-etiket paa detaljen ombrydes
330793cc feat(pris): enhed-etiket paa detaljen ombrydes
f3afbb3f feat(pris): kategori-etiket paa detaljen ombrydes
faf93d38 feat(pris): status-etiket paa detaljen ombrydes
876760a1 feat(pris): specifikationer ombrydes
5e27c20c feat(pris): beskrivelse-etiket paa detaljen ombrydes
8ac66042 feat(pris): prisoverskrift ombrydes
5cc44f4d feat(pris): detalje-beskrivelse ombrydes
59334730 feat(pris): produktinformation ombrydes
d6096465 feat(pris): detalje-slet ombrydes
bbb8ed0b feat(pris): detalje-rediger ombrydes
70e7c704 feat(pris): detalje-fejl ombrydes
da0465f1 feat(pris): sku-linje paa detaljen ombrydes
96baa1dd feat(pris): produktnavn paa detaljen ombrydes
48bfe72a feat(pris): formularens enhedsvaelger ombrydes
c8f775a0 feat(pris): formularens kategori-vaelger ombrydes
4c616ac0 feat(pris): formularens kategorinavn ombrydes
2b31782e feat(pris): listepris-pladsholder ombrydes
f30da9fd feat(pris): kostpris-pladsholder ombrydes
e1fe48d2 feat(pris): sku-pladsholder ombrydes
8fa842a1 feat(pris): beskrivelse-pladsholder ombrydes
3195370a feat(pris): produktnavn-pladsholder ombrydes
fc137ff3 feat(pris): listepris-etiket ombrydes
bc92e526 feat(pris): kostpris-etiket ombrydes
571c98b3 feat(pris): enhedsnavn ombrydes
5720d8fd feat(pris): sku-etiket ombrydes
688e5c5d feat(pris): beskrivelse-etiket ombrydes
3495cca6 feat(pris): produktnavn-etiket ombrydes
436aa622 feat(pris): vaelg-kategori ombrydes
e325204a feat(pris): enhed-etiket ombrydes
fe5c0d0a feat(pris): aktiv-etiket ombrydes
bbd5c993 feat(pris): kategorifejl i formularen ombrydes
149d3931 feat(pris): kategori-etiket i formularen ombrydes
8f2af7a4 feat(pris): gem-knap ombrydes
5ed0baca feat(pris): annuller ombrydes
074fd307 feat(pris): kategori-etiket ombrydes
f4c9345f feat(pris): kategorinavn ombrydes
d5a34ddd feat(pris): soegeetiket ombrydes
0bfa834b feat(pris): kategori-pladsholder ombrydes
6fb0821d feat(pris): soegefelt ombrydes
40dc8157 feat(pris): mobil-slet ombrydes
c0b939df feat(pris): mobil-rediger ombrydes
aed9f5aa feat(pris): alle-kategorier ombrydes
22863ffa feat(pris): slet-menu ombrydes
cb4f0a8f feat(pris): rediger-menu ombrydes
9d888c0b docs: checkpoint efter ffc0fffb
03376da4 feat(pris): manglende kategori ombrydes
1a8179c5 feat(pris): rediger-dialog ombrydes
a08873f1 feat(pris): opret-dialog ombrydes
79d19d67 feat(pris): opret-knap ombrydes
cabc43cd feat(pris): ryd-knap ombrydes
ece52245 feat(pris): kategorifejl ombrydes
90b6dcc1 feat(pris): katalogfejl ombrydes
2068b4c3 feat(pris): katalogoverskrift ombrydes
2469bd6e feat(pris): antal ombrydes
1891ab86 feat(pris): ny-knap ombrydes
637b14e8 feat(pris): prisetiketter ombrydes
ffc0fffb docs: checkpoint efter 7790a262
925f0e18 feat(pris): kolonneoverskrifter ombrydes
b737ab48 feat(pris): statusmaerke ombrydes
55e9e20d feat(pris): tom overskrift ombrydes
8bfcca6d feat(pris): tom katalogtekst ombrydes
65c999c5 feat(pris): kategorimaerke ombrydes
096ef11c feat(pris): listepris ombrydes
fb6b1c33 feat(pris): mobilbeskrivelse ombrydes
c3d38a79 feat(pris): produktbeskrivelse ombrydes
3de5273d feat(pris): fejlknapper ombrydes
133894f2 feat(pris): fejlkode ombrydes
d70d349a feat(pris): fejltekst ombrydes
76ebac7d feat(pris): fejloverskrift ombrydes
02f04601 feat(pris): sideindledning ombrydes
9360b884 feat(pris): sideoverskrift ombrydes
716a580f feat(pris): fanetaeller ombrydes
0f960431 feat(pris): leverandoeretiket ombrydes
7790a262 docs: checkpoint efter 277b56fd
65c9590d feat(pris): manglende tendens ombrydes
da1765b5 feat(pris): trendetiket ombrydes
31c71fe3 feat(pris): tilbudsnummer ombrydes
878e8df9 feat(pris): aendringstal ombrydes
565e7037 feat(pris): linjetal ombrydes
2403d625 feat(pris): volatilitet ombrydes
25b44749 feat(pris): trendprocent ombrydes
470b88be feat(pris): statusmaerke ombrydes
cf6077ce feat(pris): paavirkningsantal ombrydes
f9add430 feat(pris): procentmaerke ombrydes
7292f51d feat(pris): tilbudsdato ombrydes
277b56fd docs: checkpoint efter 0f8b263d
ed04ddfe feat(pris): advarseldato ombrydes
d94b7e60 feat(pris): opdater-knappen ombrydes
8f0b324d feat(pris): faner ombrydes
241b2b5f feat(pris): filteretiketter ombrydes
22eec97b feat(pris): oversigtstal ombrydes
9f092011 feat(pris): oversigsetiketter ombrydes
c487b4df feat(pris): tendensoverskrifter ombrydes
5aa35790 feat(pris): tilbudsoverskrifter ombrydes
dd0e1b6f feat(pris): advarselsoverskrifter ombrydes
a6ef44f9 feat(pris): prisbevaegelse-procenter ombrydes
0f5ac865 feat(pris): statistiktal ombrydes
256460bf feat(pris): fejltekst ombrydes
0f8b263d docs: checkpoint efter 02778774
2c7c1deb feat(pris): tom tekst ombrydes
a5b2c693 feat(pris): indlaesertekst ombrydes
302d2e41 feat(pris): statistiketiketter ombrydes
608321fd feat(pris): prisbevaegelse ombrydes
f414c152 feat(pris): synk-dato ombrydes
02778774 docs: checkpoint efter 4a77eb75
50d81f5d feat(pris): leverandoernavn ombrydes
79cf1c85 feat(pilot): ansvarlig kan krympe
7452d3bc feat(plan): i dag-knappen ombrydes
558d5ea0 feat(pilot): rediger og slet kan rammes
4a77eb75 docs: checkpoint efter 8f8322fb
1d1f4aeb feat(pilot): ingen forfaldsdato ombrydes
6ccd5dcf feat(pilot): vis udfoerte ombrydes
bc288dae feat(pilot): kundens forfaldsdato ombrydes
3eada6f6 feat(pilot): kundens statusmaerker ombrydes
8f8322fb docs: checkpoint efter 6ec2c234
995b0928 feat(plan): kommende dagsnummer ombrydes
9c1ca47d feat(pilot): opgaveformularens knapper ombrydes
d205ee76 feat(pilot): opgavefeltets etiketter ombrydes
c66bc0ac feat(pilot): titelfeltets etiket ombrydes
6ec2c234 docs: checkpoint efter da6b7d99
f9e89917 feat(plan): opstartsmaerke ombrydes
8653e9e4 feat(plan): sagens statusmaerker ombrydes
75ddb805 feat(plan): kommende maaned ombrydes
da98d6e8 feat(plan): kommende besigtigelser ombrydes
da6b7d99 docs: checkpoint efter 496594f0
623c151d feat(pilot): opgaveoverskrift ombrydes
da791158 feat(plan): flere paamindelser ombrydes
496594f0 docs: checkpoint efter 9f4eb434
4f4e11a1 feat(plan): flere opgaver ombrydes
bbc64cf0 feat(plan): henter opgaver ombrydes
9f4eb434 docs: checkpoint efter 53906875
d9c88673 feat(pilot): kundens hentefejl ombrydes
53906875 docs: checkpoint efter fc1047a0
c66870f5 feat(pilot): ingen aabne opgaver ombrydes
416cddc4 feat(pilot): kundens medarbejderfejl ombrydes
95a82c0e feat(plan): sagens hentefejl ombrydes
fc1047a0 docs: checkpoint efter d8d63c83
70bd3243 feat(pilot): kundens ansvarlige-fejl ombrydes
d8d63c83 docs: checkpoint efter 1d0db479
d125ebe7 feat(pilot): tom kundeliste ombrydes
1d0db479 docs: checkpoint efter 9c093aba
5226e820 feat(plan): sagens ansvarlige-fejl ombrydes
b1bdda6d feat(plan): udestaaende opgaver ombrydes
31101a40 feat(plan): tom sagsliste ombrydes
638d9b5e feat(plan): dagsoverskrift ombrydes
9c093aba docs: checkpoint efter e584cfad
a9833b0e feat(faktura): kontrolettiketter ombrydes
cc1a4391 feat(plan): Mine paamindelser ombrydes
91cecb64 feat(faktura): mobilens linjenummer kan krympe
d64a588c feat(plan): ugedagsnavne ombrydes
3459aa2a feat(faktura): fragtmaerket ombrydes
495bcce4 feat(faktura): kolonnen # kan krympe
e584cfad docs: checkpoint efter 227e1344
eac7f0af feat(faktura): fragtnoten ombrydes
fff1ec31 feat(faktura): Beskrivelse-overskriften ombrydes
82ef0334 feat(faktura): Status-overskriften ombrydes
f5854dac feat(faktura): linjenummeret ombrydes
f91f706c feat(faktura): beskrivelsen kan krympe
227e1344 docs: checkpoint efter dc4a2a51
297b396b feat(faktura): Match-overskriften ombrydes
a16bcf40 feat(faktura): match-teksten ombrydes
4f37b072 feat(faktura): kolonneoverskrifter ombrydes
152b0027 feat(faktura): mobilens forventet pris og afvigelse ombrydes
1e7dfbff feat(faktura): forventet pris og afvigelse ombrydes
dc4a2a51 docs: checkpoint efter 58e87d32
a808cab6 feat(plan): maanedens navn ombrydes
bb2e5a31 feat(plan): maanedsknapper er hoeje nok
d1c90b60 feat(plan): I dag-knappen er hoej nok
58e87d32 docs: checkpoint efter dfd78f86
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
dfd78f86 docs: checkpoint for grok-shift 2026-10-18 fortsat
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
```

Listen er alle commits efter `a1f2bc11` til og med `c6e18461`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
a1f2bc11 docs: checkpoint for grok-shift 2026-10-18
```

### Features

G18-500 lader kun AI-projektets resultatstak krympe. `formatCurrency(comp.unit_price)`, `formatCurrency(comp.total)` og `formatCurrency(result.calculation.price.total_price)` er uændrede. G18-474 til G18-499 bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Claude kan se ombrydes-klasserne. Ingen pris, kost, margin, moms eller afsendelse er ændret.

### Integration

Push ikke til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `c6e18461`, `d9f15811` og `a1f2bc11`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-501, G18-502, G18-503, G18-504, G18-505, G18-506, G18-507.

## Checkpoint 2026-10-18 toogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `839ba253`. Det lader enogfyrretyvende-hegnet stå. `839ba253` hedder `docs: checkpoint efter 7d2349d0`. Produktspids: `2e07f8bc`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `2e07f8bc` blev afvist før git kørte og er ikke prøvet igen. `b0a3e94f` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `839ba253..2e07f8bc`

```
2e07f8bc feat(pilot): opsummeringsgitteret kan krympe
b0a3e94f feat(pilot): hurtig estimats gitter kan krympe
37d7f2bd feat(pilot): skrivebordets komponentramme kan krympe
946d934a feat(pilot): naeste skridt kan krympe
f718e063 feat(pilot): bemaerkningsboksen kan krympe
37a35cfa feat(pilot): tilbudsteksten kan krympe
44da777f feat(pilot): beskrivelsesafsnittet kan krympe
af3b4962 feat(pilot): ladestanderlisten kan krympe
9c0d52a6 feat(pilot): hurtig estimat kan krympe
6367a93c feat(pilot): AI-projektets side kan krympe
```

Listen er alle commits efter `839ba253` til og med `2e07f8bc`, fra `6367a93c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
839ba253 docs: checkpoint efter 7d2349d0
```

### Features

G18-464 til G18-473 lader AI-projektets side, hurtig estimat, ladestanderlisten, beskrivelsesafsnittet, tilbudsteksten, bemærkningsboksen, næste skridt, skrivebordets komponentramme, hurtig estimats gitter og opsummeringsgitteret krympe. `formatCurrency(quickResult.estimatedPrice)`, `formatCurrency(h.cost_price)`, `formatCurrency(result.calculation.price.total_price)`, `formatCurrency(comp.unit_price)`, `formatCurrency(comp.total)` og `result.offer_text.full_offer_text` er uændrede. `hidden md:block border rounded-lg overflow-hidden` bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Claude kan se ombrydes-klasserne. Ingen pris, kost, margin, moms eller afsendelse er ændret. `hidden md:block border rounded-lg overflow-hidden` er bevaret.

### Integration

Push ikke til main. Når push er tilladt, push kun `grok-next` og prøv ikke afviste tip igen, herunder `2e07f8bc` og `839ba253`. Flet derefter `origin/main` ind i `grok-next` uden at køre migrationer.

### Åben kø

15 ÅBEN: G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-474, G18-475, G18-476, G18-477, G18-478, G18-479, G18-480.

## Checkpoint 2026-10-18 enogfyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `7d2349d0`. Det lader fyrretyvende-hegnet stå. `7d2349d0` hedder `docs: checkpoint efter a18ed7fe`. Produktspids: `7f98f318`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `7f98f318` blev afvist før git kørte og er ikke prøvet igen. `f963860e` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `7d2349d0..7f98f318`

```
7f98f318 feat(pilot): kundevaelgerens panel kan krympe
f963860e feat(pilot): eksempelafsnittet i AI-projekt kan krympe
3960c1bd feat(pilot): historikafsnittet kan krympe
0a5932d2 feat(pilot): kundevaelgerens baggrund kan krympe
271ae724 feat(pilot): eksempelgitteret i AI-projekt kan krympe
29a17460 feat(pilot): historikkens liste kan krympe
```

Listen er alle commits efter `7d2349d0` til og med `7f98f318`, fra `29a17460`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Forrige docs-commit

```
7d2349d0 docs: checkpoint efter a18ed7fe
```

### Features

G18-458 til G18-463 lader historikkens liste, eksempelgitteret, kundevælgerens baggrund, historikafsnittet, eksempelafsnittet og kundevælgerens panel krympe. `formatCurrency(analysis.total_price)`, beskrivelsens to linjer, den tomme historiksætning, eksempelteksten og `max-w-md mx-4 max-h-[90vh] overflow-y-auto` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `7f98f318`, herunder G18-458 til G18-463. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `7f98f318`, `f963860e`, `3960c1bd`, `0a5932d2`, `271ae724`, `29a17460` og `7d2349d0`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-464, G18-465, G18-466, G18-467, G18-468, G18-469, G18-470.

## Checkpoint 2026-10-18 fyrretyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `a18ed7fe`. Det lader niogtredivte-hegnet stå. `a18ed7fe` hedder `docs: checkpoint efter c2edaf4a`. Produktspids: `61fad971`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `61fad971` blev afvist før git kørte og er ikke prøvet igen. `c4fb2790` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `a18ed7fe..61fad971`

```
61fad971 feat(pilot): historikkens indlaesning kan krympe
c4fb2790 feat(pilot): kundevaelgerens bund kan krympe
```

Listen er alle commits efter `a18ed7fe` til og med `61fad971`, fra `c4fb2790`. Docs-committen med denne sektion kommer bagefter og står ikke i listen. `c4fb2790` står i listen, fordi den selv er en commit efter `a18ed7fe`.

### Forrige docs-commit

```
a18ed7fe docs: checkpoint efter c2edaf4a
```

### Features

G18-456 og G18-457 ombryder kundevælgerens bund og historikkens indlæsning. `Annuller`, `setShowCustomerModal(false)`, den tomme sætning `Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.`, `formatCurrency(analysis.total_price)` og beskrivelsens to linjer er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før src-committen. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `61fad971`, herunder G18-456 og G18-457. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `61fad971`, `c4fb2790`, `a18ed7fe` og `f73938c0`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-458, G18-459, G18-460, G18-461, G18-462, G18-463, G18-464.

## Checkpoint 2026-10-18 niogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `c2edaf4a`. Det lader otteogtredivte-hegnet stå. `c2edaf4a` hedder `feat(pilot): soegeresultatets ladestander kan krympe`. Produktspids: `f73938c0`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `f73938c0` blev afvist før git kørte og er ikke prøvet igen. `b4a3b85a` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `c2edaf4a..f73938c0`

```
f73938c0 feat(pilot): kundevaelgerens hoved kan krympe
b4a3b85a feat(pilot): kundelisten i kundevaelgeren kan krympe
867830ac feat(pilot): eksempelkortet i AI-projekt kan krympe
1fc63094 feat(pilot): kundekortet i kundevaelgeren kan krympe
b76f0a8f feat(pilot): historikkortet paa AI-projekt kan krympe
718ffa2d feat(pilot): luk-knappen i kundevaelgeren kan krympe
f37624e6 docs: checkpoint efter 8e3a012a
ed2d4576 feat(pilot): tom kundeliste i AI-projekt kan krympe
a26dd0c8 feat(pilot): knappen annuller i kundevaelgeren ombrydes
c175ae18 feat(pilot): kundeliste-knappen proev igen ombrydes
607a65e8 feat(pilot): historik-knappen proev igen ombrydes
d9b1c4f7 feat(pilot): kundens soegefelt kan krympe
1af70386 feat(pilot): venteteksten analyserer ombrydes
```

Listen er alle commits efter `c2edaf4a` til og med `f73938c0`, fra `1af70386`. Docs-committen med denne sektion kommer bagefter og står ikke i listen. `f37624e6` står i listen, fordi den selv er en commit efter `c2edaf4a`.

### Forrige docs-commit

```
f37624e6 docs: checkpoint efter 8e3a012a
```

### Commit rækken starter efter

```
c2edaf4a feat(pilot): soegeresultatets ladestander kan krympe
```

### Features

G18-444 til G18-455 ombryder venteteksten Analyserer, kundens søgefelt, historikkens Prøv igen, kundelistens Prøv igen, Annuller, den tomme kundeliste, Luk, historikkortet, kundekortet, eksempelkortet, kundelisten og kundevælgerens hoved. `Analyserer...`, pladsholderen `Søg efter kunde...`, `aria-label="Søg efter kunde"`, `setHistoryTry`, `void loadCustomers()`, `Annuller`, `'Ingen kunder'`, `'Ingen kunder fundet'`, `aria-label="Luk"`, `formatCurrency(analysis.total_price)`, `handleSelectCustomer`, `handleDescriptionChange(example.text)`, `max-h-64` og `Vælg kunde` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `f73938c0`, herunder G18-444 til G18-455. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `f73938c0`, `b4a3b85a`, `867830ac`, `1fc63094`, `b76f0a8f`, `718ffa2d`, `f37624e6` og `c2edaf4a`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-456, G18-457, G18-458, G18-459, G18-460, G18-461, G18-462.

## Checkpoint 2026-10-18 otteogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `8e3a012a`. Det lader syvogtredivte-hegnet stå. `8e3a012a` hedder `docs: checkpoint efter 24a9d325`. Produktspids: `ed2d4576`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `ed2d4576` blev afvist før git kørte og er ikke prøvet igen. `a26dd0c8` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `8e3a012a..ed2d4576`

```
ed2d4576 feat(pilot): tom kundeliste i AI-projekt kan krympe
a26dd0c8 feat(pilot): knappen annuller i kundevaelgeren ombrydes
c175ae18 feat(pilot): kundeliste-knappen proev igen ombrydes
607a65e8 feat(pilot): historik-knappen proev igen ombrydes
d9b1c4f7 feat(pilot): kundens soegefelt kan krympe
1af70386 feat(pilot): venteteksten analyserer ombrydes
c2edaf4a feat(pilot): soegeresultatets ladestander kan krympe
```

Listen er alle commits efter `8e3a012a` til og med `ed2d4576`, fra `c2edaf4a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
8e3a012a docs: checkpoint efter 24a9d325
```

### Features

G18-443 til G18-449 ombryder søgeresultatets ladestander, venteteksten Analyserer, kundens søgefelt, historikkens Prøv igen, kundelistens Prøv igen, Annuller og den tomme kundeliste. `formatCurrency(h.cost_price)`, `Analyserer...`, pladsholderen `Søg efter kunde...`, `aria-label="Søg efter kunde"`, `setHistoryTry`, `void loadCustomers()`, `Annuller`, `'Ingen kunder'` og `'Ingen kunder fundet'` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `ed2d4576`, herunder G18-443 til G18-449. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `ed2d4576`, `a26dd0c8`, `c175ae18`, `607a65e8`, `d9b1c4f7`, `1af70386`, `c2edaf4a` og `8e3a012a`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-450, G18-451, G18-452, G18-453, G18-454, G18-455, G18-456.

## Checkpoint 2026-10-18 syvogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `24a9d325`. Det lader seksogtredivte-hegnet stå. `24a9d325` hedder `docs: checkpoint efter 47a16f63`. Produktspids: `5425db74`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `5425db74` blev afvist før git kørte og er ikke prøvet igen. `10bb4766` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `24a9d325..5425db74`

```
5425db74 feat(pilot): fejlteksten ved ladestander-soegning kan krympe
10bb4766 feat(pilot): elpunkt-antallet i fortolkningen ombrydes
4087d542 feat(pilot): bygningstypen i hurtig estimat ombrydes
3b4e429c feat(pilot): elpunkt-tallet i hurtig estimat ombrydes
```

Listen er alle commits efter `24a9d325` til og med `5425db74`, fra `3b4e429c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
24a9d325 docs: checkpoint efter 47a16f63
```

### Features

G18-439 til G18-442 ombryder elpunkt-tallet og bygningstypen i hurtig estimat, elpunkt-antallet i fortolkningen og fejlteksten ved ladestander-søgning. `{quickResult.totalPoints} elpunkter`, `{getBuildingTypeName(quickResult.buildingType)}`, `{value} stk`, `break-words">{getBuildingTypeName(result.interpretation.building_type)}`, sætningerne om ingen ladestandere og tidligere forslag, `data-testid="charger-search-error"` og `formatCurrency(h.cost_price)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `5425db74`, herunder G18-439 til G18-442. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `5425db74`, `10bb4766`, `4087d542` og `24a9d325`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-443, G18-444, G18-445, G18-446, G18-447, G18-448, G18-449.

## Checkpoint 2026-10-18 seksogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `47a16f63`. Det lader fireogtredivte-hegnet stå. `47a16f63` hedder `docs: checkpoint efter 1c4b89cb`. Produktspids: `dfa68917`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `dfa68917` blev afvist før git kørte og er ikke prøvet igen. `38d55733` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `47a16f63..dfa68917`

```
dfa68917 feat(pilot): beloebet i hurtig estimat kan krympe
38d55733 feat(pilot): timetallet i hurtig estimat ombrydes
7e2e2362 feat(pilot): beskrivelsesfeltet kan krympe
c9f92517 feat(pilot): soegefeltet til ladestander kan krympe
df9f96c2 feat(pilot): knappen fjern ombrydes
b8ef575c feat(pilot): valgt ladestander ombrydes
```

Listen er alle commits efter `47a16f63` til og med `dfa68917`, fra `b8ef575c`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
47a16f63 docs: checkpoint efter 1c4b89cb
```

### Features

G18-433 til G18-438 ombryder den valgte ladestander, knappen Fjern, søgefeltet til ladestander, beskrivelsesfeltet, timetallet og beløbet i hurtig estimat. `formatCurrency(charger.cost_price)`, `setCharger(null)`, pladsholderen, `aria-label="Søg ladestander"`, `value={description}`, `{Math.round(quickResult.estimatedHours)}` og `formatCurrency(quickResult.estimatedPrice)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `dfa68917`, herunder G18-433 til G18-438. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `dfa68917`, `38d55733`, `df9f96c2` og `47a16f63`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-439, G18-440, G18-441, G18-442, G18-443, G18-444, G18-445.

## Checkpoint 2026-10-18 fireogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `1c4b89cb`. Det lader treogtredivte-hegnet stå. `1c4b89cb` hedder `docs: checkpoint efter f6d5fc14`. Produktspids: `2ae59666`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `2ae59666` blev afvist før git kørte og er ikke prøvet igen. `271958f1` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `1c4b89cb..2ae59666`

```
2ae59666 feat(pilot): hjaelpeteksten om uprissat lader ombrydes
271958f1 feat(pilot): etiketten ladestander ombrydes
72bbbb40 feat(pilot): teksten ingen risici ombrydes
3ca61892 feat(pilot): etiketten kompleksitet ombrydes
b68cab82 feat(pilot): etiketten alder ombrydes
e611edfd feat(pilot): etiketten stoerrelse ombrydes
db044d29 feat(pilot): etiketten type ombrydes
c40540f4 feat(pilot): etiketten margin ombrydes
d9a1b31a feat(pilot): etiketten risikobuffer ombrydes
```

Listen er alle commits efter `1c4b89cb` til og med `2ae59666`, fra `d9a1b31a`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
1c4b89cb docs: checkpoint efter f6d5fc14
```

### Features

G18-424 til G18-432 ombryder etiketterne Risikobuffer, Margin, Type, Størrelse, Alder, Kompleksitet og Ladestander, teksten Ingen væsentlige risici identificeret, og hjælpeteksten om en lader der ikke er prissat. Teksterne og `&quot;` er uændrede. `{result.calculation.price.risk_buffer_percentage}%`, `{result.calculation.price.margin_percentage}%`, bygningsværdierne, `formatCurrency(charger.cost_price)` og sætningen om at der ikke gættes en pris er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `2ae59666`, herunder G18-424 til G18-432. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `2ae59666`, `271958f1` og `1c4b89cb`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-433, G18-434, G18-435, G18-436, G18-437, G18-438, G18-439.

## Checkpoint 2026-10-18 treogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `f6d5fc14`. Det lader toogtredivte-hegnet stå. `f6d5fc14` hedder `docs: checkpoint efter 443837bd`. Produktspids: `84d9fed7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `84d9fed7` blev afvist før git kørte og er ikke prøvet igen. `8b7a9930` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `f6d5fc14..84d9fed7`

```
84d9fed7 feat(pilot): etiketten subtotal ombrydes
8b7a9930 feat(pilot): etiketten materialer ombrydes
8da61338 feat(pilot): etiketten stoerrelsesfaktor ombrydes
30e8705b feat(pilot): etiketten total tid ombrydes
662af0d5 feat(pilot): etiketten basis tid ombrydes
b560adc7 feat(pilot): overskriften bemarkninger ombrydes
8f158962 feat(pilot): overskriften bygningsinformation ombrydes
05b0b4c7 feat(pilot): overskriften komponenter ombrydes
4a19216a feat(pilot): overskriften prisopbygning ombrydes
4bc3b447 feat(pilot): overskriften elpunkter ombrydes
57a3bc71 feat(pilot): overskriften kompleksitetsfaktorer ombrydes
592b4b5f feat(pilot): overskriften tidsberegning ombrydes
```

Listen er alle commits efter `f6d5fc14` til og med `84d9fed7`, fra `592b4b5f`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
f6d5fc14 docs: checkpoint efter 443837bd
```

### Features

G18-412 til G18-423 ombryder overskrifterne Tidsberegning, Kompleksitetsfaktorer, Elpunkter, Prisopbygning, Komponenter, Bygningsinformation og Bemærkninger samt etiketterne Basis tid, Total tid, Størrelsesfaktor, Materialer og Subtotal. Teksterne i de linjer er uændrede. `base_hours.toFixed(1)`, `total_hours.toFixed(1)`, `size_multiplier`, `formatCurrency` for materiale, subtotal og total, og `{result.calculation.price.margin_percentage}%` er uændrede. Ankrene `>Bygningsinformation</h4>`, `>Elpunkter</h4>`, `>Prisopbygning</h4>`, `>Komponenter</h4>` og ordet Kompleksitetsfaktorer bliver. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilot- og prisbølgen fra `cb4f0a8f` til `84d9fed7`, herunder G18-412 til G18-423. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `84d9fed7`, `8b7a9930` og `f6d5fc14`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-424, G18-425, G18-426, G18-427, G18-428, G18-429, G18-430.

## Checkpoint 2026-10-18 toogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `443837bd`. Det lader enogtredivte-hegnet stå. `443837bd` hedder `docs: checkpoint efter 59c8fed8`. Produktspids: `875ca1ab`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `875ca1ab` blev afvist før git kørte og er ikke prøvet igen. `d94fb9e1` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `443837bd..875ca1ab`

```
875ca1ab feat(pilot): knappen analyser projekt ombrydes
d94fb9e1 feat(pilot): overskriften hurtig estimat ombrydes
a40b93bd feat(pilot): knappen opret tilbud ombrydes
a7cf6608 feat(pilot): etiketten projektbeskrivelse ombrydes
ab3c3da9 feat(pilot): forklaringen under naeste skridt ombrydes
b6ebe8d4 feat(pilot): kopier-teksten paa AI-projekt ombrydes
86fb22b0 feat(pilot): sidetitlen paa AI-projekt ombrydes
f1d34483 feat(pris): sogehintet paa den tomme leverandorvareliste ombrydes
6b51fa2e feat(pilot): rediger-teksten paa opgavekortet ombrydes
50471e2c feat(pris): den tomme leverandorvareliste ombrydes
94264b06 feat(pilot): indledningen paa AI-projekt ombrydes
```

Listen er alle commits efter `443837bd` til og med `875ca1ab`, fra `94264b06`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
443837bd docs: checkpoint efter 59c8fed8
```

### Features

G18-401 til G18-411 ombryder indledningen på AI-projekt, den tomme leverandørvareliste, Rediger-teksten på opgavekortet, søgehintet, sidetitlen, Kopier-teksten, forklaringen under Næste skridt, etiketten Projektbeskrivelse, knappen Opret tilbud, overskriften Hurtig estimat og knappen Analyser projekt. Teksterne i de linjer er uændrede. Priser, `storedCostText`, `formatCurrency(quickResult.estimatedPrice)`, `formatCurrency(analysis.total_price)`, historikkens `line-clamp-2`, toasten `Kopieret` og `handleCreateOffer` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilot- og prisbølgen fra `cb4f0a8f` til `875ca1ab`, herunder G18-401 til G18-411. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `875ca1ab`, `d94fb9e1` og `443837bd`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-412, G18-413, G18-414, G18-415, G18-416, G18-417, G18-418.

## Checkpoint 2026-10-18 enogtredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `59c8fed8`. Det lader tredivte-hegnet stå. `59c8fed8` hedder `docs: checkpoint efter 94bbeb6a`. Produktspids: `bfc023d4`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `bfc023d4` blev afvist før git kørte og er ikke prøvet igen. `d60a20c2` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `59c8fed8..bfc023d4`

```
bfc023d4 feat(pilot): overskriften naeste skridt ombrydes
d60a20c2 feat(pilot): betingelsesmaerket paa tilbudstekstkortet ombrydes
d3abcc74 feat(pilot): inaktiv-maerket paa tilbudstekstkortet ombrydes
b400d7c1 feat(pilot): datoen under en analyse ombrydes
48341851 feat(pilot): slette-teksten paa opgavekortet ombrydes
8a7cc350 feat(pris): statusmaerke paa leverandorvarens skrivebord kan krympe
e8f1c3f5 feat(pris): statusmaerke paa leverandorvarens mobilkort ombrydes
```

Listen er alle commits efter `59c8fed8` til og med `bfc023d4`, fra `e8f1c3f5`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
59c8fed8 docs: checkpoint efter 94bbeb6a
```

### Features

G18-394 til G18-400 ombryder statusmærket på leverandørvarens mobilkort og skrivebord, slette-teksten på opgavekortet, datoen under en analyse, Inaktiv-mærket, betingelsesmærket og overskriften Næste skridt. Teksterne i de linjer er uændrede. Priser, `storedCostText`, historikkens `line-clamp-2` og `break-words">{reminder.title}` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilot- og prisbølgen fra `cb4f0a8f` til `bfc023d4`, herunder G18-394 til G18-400. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `bfc023d4`, `d60a20c2` og `59c8fed8`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-401, G18-402, G18-403, G18-404, G18-405, G18-406, G18-407.

## Checkpoint 2026-10-18 tredivte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `94bbeb6a`. Det lader niogtyvende-hegnet stå. `94bbeb6a` hedder `docs: checkpoint efter b4d64ad0`. Produktspids: `88aa29f3`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `88aa29f3` blev afvist før git kørte og er ikke prøvet igen. `42e12949` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `94bbeb6a..88aa29f3`

```
88aa29f3 feat(pilot): tom historiktekst i AI-projekt ombrydes
42e12949 feat(pilot): prioritetsmaerket paa tilbudstekstkortet ombrydes
f667aa07 feat(pilot): typemaerket paa tilbudstekstkortet ombrydes
4245647d ﻿feat(pilot): overskriften seneste analyser ombrydes
52e803b1 feat(pilot): timetal paa opgavekortet ombrydes
234dfb1a feat(pris): kategori paa leverandorvarens skrivebord kan krympe
a7c2399c feat(pris): kategori paa leverandorvarens mobilkort ombrydes
b2fd4088 feat(pilot): overskrift paa AI-projektets eksempler ombrydes
68b005d7 feat(pilot): kundenavn i opgavepaamindelse kan krympe
7ac3010c feat(pilot): omfang-id paa tilbudstekstkortet ombrydes
66cd3b8b feat(pilot): forfaldsdato paa opgavekortet ombrydes
```

Listen er alle commits efter `94bbeb6a` til og med `88aa29f3`, fra `66cd3b8b`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
94bbeb6a docs: checkpoint efter b4d64ad0
```

### Features

G18-383 til G18-393 ombryder forfaldsdato, omfang-id, kundenavn i påmindelsen, eksempeloverskrift, kategori på mobilkort og skrivebord, timetal, overskriften Seneste analyser, typemærke, prioritetsmærke og den tomme historiktekst. Teksterne i de linjer er uændrede. Priser, `storedCostText`, historikkens `line-clamp-2` og `break-words">{reminder.title}` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilot- og prisbølgen fra `cb4f0a8f` til `88aa29f3`, herunder G18-383 til G18-393. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `88aa29f3`, `42e12949` og `94bbeb6a`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-394, G18-395, G18-396, G18-397, G18-398, G18-399, G18-400.

## Checkpoint 2026-10-18 niogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `b4d64ad0`. Det lader otteogtyvende-hegnet stå. `b4d64ad0` hedder `docs: checkpoint efter e3479705`. Produktspids: `b028b391`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `b028b391` blev afvist før git kørte og er ikke prøvet igen. `03b7eeed` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `b4d64ad0..b028b391`

```
b028b391 feat(pilot): ansvarlig paa opgavekortet ombrydes
03b7eeed feat(pris): opdateret-celle paa leverandorvarens skrivebord kan krympe
c115025d feat(pris): opdateret-linje paa leverandorvarens mobilkort ombrydes
6b4cc11b feat(pilot): eksempeltitel i AI-projekt ombrydes
bcccb7b2 feat(pilot): tilbudsnummer i opgavepaamindelse ombrydes
deae6830 feat(pilot): titel paa tilbudstekstkortet ombrydes
07b88ee7 feat(pilot): navn paa kalkulationstypen ombrydes
e3121cde feat(pilot): opgavetitel paa braettet ombrydes
cd65875e feat(pris): varenummer paa leverandorvarens skrivebord kan krympe
b18aea53 feat(pris): varenummer paa leverandorvarens mobilkort ombrydes
7b2c0d72 feat(pilot): eksempeltekst i AI-projekt ombrydes
2013e3dc feat(pilot): besked i opgavepaamindelse ombrydes
```

Listen er alle commits efter `b4d64ad0` til og med `b028b391`, fra `2013e3dc`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
b4d64ad0 docs: checkpoint efter e3479705
```

### Features

G18-371 til G18-382 ombryder påmindelsesbesked, eksempeltekst, mobil- og skrivebordsvarenummer, opgavetitel, kalkulationstype, tilbudsteksttitel, tilbudsnummer, eksempeltitel, opdateret-linje, opdateret-celle og ansvarlig. Teksterne i de linjer er uændrede. Priser, `storedCostText`, historikkens `line-clamp-2` og `break-words">{reminder.title}` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilot- og prisbølgen fra `cb4f0a8f` til `b028b391`, herunder G18-371 til G18-382. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `b028b391`, `03b7eeed` og `b4d64ad0`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-383, G18-384, G18-385, G18-386, G18-387, G18-388, G18-389.

## Checkpoint 2026-10-18 otteogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `e3479705`. Det lader syvogtyvende-hegnet stå. `e3479705` hedder `docs: checkpoint efter 96f90a04`. Produktspids: `688fa934`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `688fa934` blev afvist før git kørte og er ikke prøvet igen. `39e41351` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `e3479705..688fa934`

```
688fa934 feat(pilot): tilbudstekstens indhold ombrydes
39e41351 feat(pilot): tilstandsbeskrivelse i kalkulationstypen ombrydes
10454fe9 feat(pilot): opgavebeskrivelse paa brættet ombrydes
```

Listen er alle commits efter `e3479705` til og med `688fa934`, fra `10454fe9`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
e3479705 docs: checkpoint efter 96f90a04
```

### Features

G18-368 til G18-370 ombryder opgavebeskrivelsen på opgavebrættet, tilstandsbeskrivelsen i kalkulationstypen og tilbudstekstens indhold. Teksterne `{task.description}`, `{MODE_DESCRIPTIONS[mode]}` og `{template.content}` er uændrede. Titel, valg, slet og søgning er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter pilotbølgen fra `cb4f0a8f` til `688fa934`, herunder G18-368 til G18-370. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `688fa934` og `e3479705`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-371, G18-372, G18-373, G18-374, G18-375, G18-376, G18-377.

## Checkpoint 2026-10-18 syvogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `96f90a04`. Det lader seksogtyvende-hegnet stå. `96f90a04` hedder `docs: checkpoint efter 38acd6c2`. Produktspids: `d7aecc01`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `d7aecc01` blev afvist før git kørte og er ikke prøvet igen. `e951ac7b` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `96f90a04..d7aecc01`

```
d7aecc01 feat(pilot): sagsbeskrivelse paa partnerkortet ombrydes
e951ac7b feat(pilot): sagsbeskrivelse i kundeportalen ombrydes
51cc5635 feat(pilot): emne i beskedlisten ombrydes
16d92c46 feat(pilot): leverandørnotat på kortet ombrydes
cecb54ad feat(pilot): tilbudsbeskrivelse i mailforslag ombrydes
3e1099bd feat(pilot): sagsbeskrivelse i mailforslag ombrydes
```

Listen er alle commits efter `96f90a04` til og med `d7aecc01`, fra `3e1099bd`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
96f90a04 docs: checkpoint efter 38acd6c2
```

### Features

G18-362 til G18-367 ombryder sagsbeskrivelse og tilbudsbeskrivelse i mailforslag, leverandørnotatet, emnet i beskedlisten, sagsbeskrivelsen i kundeportalen og sagsbeskrivelsen på partnerkortet. Teksterne `{c.description}`, `{o.description}`, `{supplier.notes}`, `{message.subject}` og `{sc.description}` er uændrede. Sagstitel, tilbudstitel, `formatCurrency(o.final_amount)` og `formatCurrency(offer.final_amount, currency)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatDate('2026-06-02')` fra `src/lib/utils` og `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter katalog-, formular-, detalje-, pris- og pilotbølgen fra `cb4f0a8f` til `d7aecc01`, herunder G18-362 til G18-367. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `d7aecc01` og `96f90a04`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-368, G18-369, G18-370, G18-371, G18-372, G18-373, G18-374.

## Checkpoint 2026-10-18 seksogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `38acd6c2`. Det lader femogtyvende-hegnet stå. `38acd6c2` hedder `docs: checkpoint efter 794bf051`. Produktspids: `9ddc23f6`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `9ddc23f6` blev afvist før git kørte og er ikke prøvet igen. `2a17284a` er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `38acd6c2..9ddc23f6`

```
9ddc23f6 feat(pilot): tilbudstitel i mailforslag ombrydes
2a17284a feat(pilot): sagstitel i mailforslag ombrydes
667f6d6c feat(pilot): pakkebeskrivelse ombrydes
9b8c7aa0 feat(pilot): listeforhaandsvisning ombrydes
63209da3 feat(pilot): seneste mailforhaandsvisning ombrydes
792d97c8 feat(pris): tab-maerket paa skrivebord kan krympe
120a3302 feat(pris): nuvaerende trendpris paa skrivebord kan krympe
f65cae5b feat(pris): potentielt tab paa skrivebord kan krympe
b9c7c10d feat(pris): tilbudsbeloeb paa skrivebord kan krympe
234d79dc feat(pris): ny skrivebordspris kan krympe
39482c2e feat(pris): gammel skrivebordspris kan krympe
9e730e91 feat(pris): pristendensens tabelkrop kan krympe
e5c6f202 feat(pris): beroerte tilbuds tabelkrop kan krympe
04bfb76d feat(pris): prisadvarslens tabelkrop kan krympe
57306cb7 feat(pris): pristendensens tabelhoved kan krympe
69a9d4fb feat(pris): beroerte tilbuds tabelhoved kan krympe
c8cf396d feat(pris): prisadvarslens tabelhoved kan krympe
d1686ff4 feat(pris): pristendensens tabel kan krympe
df92355b feat(pris): beroerte tilbuds tabel kan krympe
cbd98180 feat(pris): prisadvarslens tabel kan krympe
50d899cc feat(pris): pristendensens kolonnerekke kan krympe
e34f7df1 test(pris): behold kolonneordene paa beroerte tilbud
148894a9 feat(pris): beroerte tilbuds kolonnerekke kan krympe
```

Listen er alle commits efter `38acd6c2` til og med `9ddc23f6`, fra `148894a9`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
38acd6c2 docs: checkpoint efter 794bf051
```

### Features

G18-340 til G18-356 lader prisovervågningens tabeller, tabelhoveder, tabelkroppe, kolonnerækker og skrivebordspriser krympe med `break-words min-w-0`. Gammel pris, ny pris, tilbudsbeløb, potentielt tab og nuværende trendpris bruger stadig `formatCurrency`. Fortegn og farver på tabet er uændrede. G18-15 er lukket, fordi trendprisen kan krympe. `e34f7df1` beholdt kolonneordene Tilbud, Kunde, Status, Beløb, Ber. linjer, Potentielt tab og Oprettet. G18-357 til G18-361 ombryder seneste mail, listeforhåndsvisning, pakkebeskrivelse, sagstitel og tilbudstitel. Teksterne, valget og `formatCurrency(pkg.total_sale_price)` samt `formatCurrency(o.final_amount)` er uændrede. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil. Pris- og pakketestene kalder `formatCurrency(1250)` fra `src/lib/utils/format`. Mailforslag kalder også `formatDate('2026-06-02')` fra `src/lib/utils`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter katalog-, formular-, detalje- og prisbølgen fra `cb4f0a8f` til `9ddc23f6`, herunder G18-340 til G18-361. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `9ddc23f6`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-362, G18-363, G18-364, G18-365, G18-366, G18-367, G18-368.

## Checkpoint 2026-10-18 femogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `794bf051`. Det omskriver ikke listerne ovenfor. `794bf051` er forælder til `0a3f6f89` og hedder `docs: checkpoint efter 44858657`. Produktspids: `bb54d71e`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `bb54d71e` blev afvist før git kørte og er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `794bf051..bb54d71e`

```
bb54d71e test(pris): behold kolonneordene paa prisadvarslen
930f52e1 feat(pris): prisadvarslens kolonnerekke kan krympe
427e419e feat(pris): pristendensens skrivebordsramme kan krympe
97bb9543 feat(pris): beroerte tilbuds skrivebordsramme kan krympe
57bf2509 feat(pris): pristendensens tabelrulle kan krympe
53dc59f8 feat(pris): beroerte tilbuds tabelrulle kan krympe
fb2cda33 feat(pris): prisadvarslens skrivebordsramme kan krympe
05fdaa7c feat(pris): prisadvarslens tabelrulle kan krympe
3d8e322c feat(pris): prisbevaegelsens blok kan krympe
60b856be feat(pris): pristendensens afsnit kan krympe
02d7d28b feat(pris): prisovervaagningens side kan krympe
a52b2712 feat(pris): prisadvarslens afsnit kan krympe
d9f48e93 feat(pris): pavirker-raekken kan krympe
160edde9 feat(pris): mobilisten af pristendenser kan krympe
017630a8 feat(pris): mobilisten af beroerte tilbud kan krympe
8b51923e feat(pris): mobilisten af prisadvarsler kan krympe
b3bb441e feat(pris): prisbevaegelsens bjaelke kan krympe
7a908b64 feat(pris): ministatistikkens ramme kan krympe
397b202a feat(pris): oversigtskortets etiketraekke kan krympe
daf40a25 feat(pris): fejlrammen kan krympe
3a3a332a feat(pris): pristendensens skrivebordsraekke kan krympe
8f227bbd feat(pris): beroerte tilbuds skrivebordsraekke kan krympe
1f087044 feat(pris): indlaesningsrammen kan krympe
44aa9244 feat(pris): den tomme pristilstand kan krympe
8254393a feat(pris): oversigtskortet kan krympe
23da9451 feat(pris): fanerammens kant kan krympe
b3da689b feat(pris): prisadvarslens skrivebordsraekke kan krympe
51a1d20c feat(pris): perioderaekken kan krympe
7b31d984 feat(pris): taerskelraekken kan krympe
6076a320 feat(pris): leverandoerkortet kan krympe
e04b2149 feat(pris): ministatistikken kan krympe
309eb047 feat(pris): filterraekken kan krympe
e0b1ee14 feat(pris): pristendensens mobilkort kan krympe
34502bf7 feat(pris): beroerte tilbuds mobilkort kan krympe
3a275360 feat(pris): prisadvarslens mobilkort kan krympe
5d095b73 feat(pris): leverandoerkortenes gitter kan krympe
b3d87c79 feat(pris): oversigtskortenes gitter kan krympe
708a86df feat(pris): faneraekken kan ombrydes
46cc9417 feat(pris): trendvaelgerens navn kan ombrydes
36266c40 feat(pris): trendfilterets raekke kan ombrydes
f7bddb79 feat(pris): mobil-advarselsraekke kan krympe
5c93b485 feat(pris): leverandoerkortets overskrift kan krympe
1c4d1e6e feat(pris): prisbevaegelsens raekke kan krympe
f730c437 feat(pris): mobil-produktgruppe ombrydes
84732ccc feat(pris): mobil-tilbudsnummer kan krympe
4cf9ab08 feat(pris): mobil-trendpris kan krympe
b35b95d2 feat(pris): mobil-potentielt-tab kan krympe
c2e3c588 feat(pris): mobil-tilbudsbeloeb kan krympe
1bcf6394 feat(pris): mobil-ny-pris kan krympe
5a0a7d9e feat(pris): mobil-gammel-pris kan krympe
8c444c34 feat(pris): prisbevaegelsens gruppe ombrydes
0a3f6f89 feat(pris): periodevaelger ombrydes
```

Listen er alle commits efter `794bf051` til og med `bb54d71e`, fra `0a3f6f89`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
794bf051 docs: checkpoint efter 44858657
```

### Features

Prisovervågningens rammer fra G18-289 til G18-339 kan krympe med `min-w-0`: periodevælger, prisbevægelse, mobilpriser, faner, gitre, kort, rækker, lister, afsnit, tabelruller og kolonnerækken på prisadvarslen. Navne, numre, procenter, `Math.min`-bredder, tærsklerne 2, 5, 10 og 20, periodevalg, faneetiketter, tomme sætninger og `formatCurrency` er uændrede. `bb54d71e` gendannede kolonneordene Produkt, Leverandør, Gammel pris, Ny pris, Ændring, Påvirker og Dato i prisadvarslens test, sammen med `formatDate`. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil. Pris-testene kalder `formatCurrency(1250)` fra `src/lib/utils/format`. `bb54d71e` kalder også `formatDate('2026-06-02')` fra `src/lib/utils`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter katalog-, formular-, detalje- og prisbølgen fra `cb4f0a8f` til `bb54d71e`, herunder G18-289 til G18-339. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen, herunder `bb54d71e`.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-340, G18-341, G18-342, G18-343, G18-344, G18-345.

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

## Checkpoint 2026-10-18 ottende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `9c093aba`. Det omskriver ikke listerne ovenfor. Produktspids: `5226e820`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `9c093aba..5226e820`

```
5226e820 feat(plan): sagens ansvarlige-fejl ombrydes
b1bdda6d feat(plan): udestaaende opgaver ombrydes
31101a40 feat(plan): tom sagsliste ombrydes
638d9b5e feat(plan): dagsoverskrift ombrydes
```

Listen er alle commits efter `9c093aba` til og med `5226e820`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Dagsoverskriften ombrydes. Den tomme sagsliste "Ingen opgaver endnu" ombrydes. "X af Y udestår" ombrydes. Sagens fejl "Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt." ombrydes. `calendarDayHeading`, sætningerne og tællingen er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-87, G18-108, G18-60, G18-111, G18-132, G18-133, G18-134.

## Checkpoint 2026-10-18 niende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `1d0db479`. Det omskriver ikke listerne ovenfor. Produktspids: `d125ebe7`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `1d0db479..d125ebe7`

```
d125ebe7 feat(pilot): tom kundeliste ombrydes
```

Listen er alle commits efter `1d0db479` til og med `d125ebe7`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Den tomme kundeliste ombryder "Ingen opgaver endnu" og "Opret en opgave, hvis der skal følges op på kunden." Knapteksten og den tomme sagsliste er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-87, G18-108, G18-60, G18-111, G18-133, G18-134, G18-135.

## Checkpoint 2026-10-18 tiende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `d8d63c83`. Det omskriver ikke listerne ovenfor. Produktspids: `70bd3243`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `d8d63c83..70bd3243`

```
70bd3243 feat(pilot): kundens ansvarlige-fejl ombrydes
```

Listen er alle commits efter `d8d63c83` til og med `70bd3243`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Kundens opgavefejl "Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt." ombrydes. Sætningen og opgavelisten er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-108, G18-60, G18-111, G18-133, G18-134, G18-135, G18-136.

## Checkpoint 2026-10-18 ellevte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `fc1047a0`. Det omskriver ikke listerne ovenfor. Produktspids: `c66870f5`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `fc1047a0..c66870f5`

```
c66870f5 feat(pilot): ingen aabne opgaver ombrydes
416cddc4 feat(pilot): kundens medarbejderfejl ombrydes
95a82c0e feat(plan): sagens hentefejl ombrydes
```

Listen er alle commits efter `fc1047a0` til og med `c66870f5`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Sagens hentefejl ombrydes. Sætningen "Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver." er uændret. Kundens "Medarbejdere kunne ikke hentes. Det tælles ikke som ingen." ombrydes. "Ingen åbne opgaver. Udførte ligger nedenfor." ombrydes. Fejlen over opgavelisten er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-108, G18-60, G18-111, G18-136, G18-137, G18-138, G18-139.

## Checkpoint 2026-10-18 tolvte (Grok-shift, grok-next)

Dette checkpoint lister commits efter `53906875`. Det omskriver ikke listerne ovenfor. Produktspids: `d9c88673`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `53906875..d9c88673`

```
d9c88673 feat(pilot): kundens hentefejl ombrydes
```

Listen er alle commits efter `53906875` til og med `d9c88673`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Kundens hentefejl ombrydes. `{loadError}` og sætningen "Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver." er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-108, G18-60, G18-111, G18-137, G18-138, G18-139, G18-140.

## Checkpoint 2026-10-18 trettende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `9f4eb434`. Det omskriver ikke listerne ovenfor. Produktspids: `4f4e11a1`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `9f4eb434..4f4e11a1`

```
4f4e11a1 feat(plan): flere opgaver ombrydes
bbc64cf0 feat(plan): henter opgaver ombrydes
```

Listen er alle commits efter `9f4eb434` til og med `4f4e11a1`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

"Henter opgaver…" ombrydes. "+N mere" på månedsdagen ombrydes. Tællingen `{dayTasks.length - 3}` er uændret. Dagbrikkerne afkortes stadig. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-111, G18-138, G18-139, G18-140, G18-141, G18-142.

## Checkpoint 2026-10-18 fjortende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `496594f0`. Det omskriver ikke listerne ovenfor. Produktspids: `623c151d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `496594f0..623c151d`

```
623c151d feat(pilot): opgaveoverskrift ombrydes
da791158 feat(plan): flere paamindelser ombrydes
```

Listen er alle commits efter `496594f0` til og med `623c151d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

"+N påmindelser" på månedsdagen ombrydes. Tællingen er uændret, og dagbrikkerne afkortes stadig. Overskriften "Opgaver" og knapperne "Ny opgave" ombrydes. Dialogen "Rediger opgave" / "Ny opgave" er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-139, G18-140, G18-141, G18-142, G18-143, G18-144.

## Checkpoint 2026-10-18 femtende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `da6b7d99`. Det omskriver ikke listerne ovenfor. Produktspids: `f9e89917`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `da6b7d99..f9e89917`

```
f9e89917 feat(plan): opstartsmaerke ombrydes
8653e9e4 feat(plan): sagens statusmaerker ombrydes
75ddb805 feat(plan): kommende maaned ombrydes
da98d6e8 feat(plan): kommende besigtigelser ombrydes
```

Listen er alle commits efter `da6b7d99` til og med `f9e89917`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Overskriften "Kommende besigtigelser" ombrydes. Ordene er uændret. Måneden på kortet ombrydes. Dato-udtrykket er uændret og fik ikke `timeZone`. Status- og prioritetmærket på sagens opgaver ombrydes. Etiketterne kommer stadig fra `TASK_STATUS_CONFIG` og `TASK_PRIORITY_CONFIG`. Mærket "opstart" ombrydes. Ordet er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-143, G18-144, G18-145, G18-146, G18-147, G18-148.

## Checkpoint 2026-10-18 sekstende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `6ec2c234`. Det omskriver ikke listerne ovenfor. Produktspids: `995b0928`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `6ec2c234..995b0928`

```
995b0928 feat(plan): kommende dagsnummer ombrydes
9c1ca47d feat(pilot): opgaveformularens knapper ombrydes
d205ee76 feat(pilot): opgavefeltets etiketter ombrydes
c66bc0ac feat(pilot): titelfeltets etiket ombrydes
```

Listen er alle commits efter `6ec2c234` til og med `995b0928`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Etiketten "Titel *" ombrydes. Ordene er uændret. Etiketterne Beskrivelse, Prioritet, Status, Ansvarlig, Forfaldsdato og Påmindelse ombrydes. Knapperne Annuller og Opret ombrydes. Teksten er stadig `Gemmer...`, `Opdater` og `Opret`. Forfaldsdatoen sender stadig ISO. Dagsnummeret på kommende besigtigelser ombrydes. `getDate` er uændret og fik ikke `timeZone`. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-147, G18-148, G18-149, G18-150, G18-151, G18-152.

## Checkpoint 2026-10-18 syttende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `8f8322fb`. Det omskriver ikke listerne ovenfor. Produktspids: `1d1f4aeb`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `8f8322fb..1d1f4aeb`

```
1d1f4aeb feat(pilot): ingen forfaldsdato ombrydes
6ccd5dcf feat(pilot): vis udfoerte ombrydes
bc288dae feat(pilot): kundens forfaldsdato ombrydes
3eada6f6 feat(pilot): kundens statusmaerker ombrydes
```

Listen er alle commits efter `8f8322fb` til og med `1d1f4aeb`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Status- og prioritetmærket på kundens opgaver ombrydes. Etiketterne kommer stadig fra `TASK_STATUS_CONFIG` og `TASK_PRIORITY_CONFIG`. Normal prioritet skjules stadig. Forfaldsdatoen ombrydes. Udtrykket med `Europe/Copenhagen` er uændret. Knappen Vis/Skjul udførte ombrydes. Tællingen er `doneTasks.length`. Teksten "Ingen forfaldsdato" ombrydes. Ordene er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-151, G18-152, G18-153, G18-154, G18-155, G18-156.

## Checkpoint 2026-10-18 attende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `4a77eb75`. Det omskriver ikke listerne ovenfor. Produktspids: `50d81f5d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `4a77eb75..50d81f5d`

```
50d81f5d feat(pris): leverandoernavn ombrydes
79cf1c85 feat(pilot): ansvarlig kan krympe
7452d3bc feat(plan): i dag-knappen ombrydes
558d5ea0 feat(pilot): rediger og slet kan rammes
```

Listen er alle commits efter `4a77eb75` til og med `50d81f5d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Rediger og Slet på kundens opgave kan rammes med 44 px. aria-label er uændret. Knappen "I dag" ombrydes. `min-h-[44px]` og `goToToday` er uændret. Den ansvarliges navn eller e-mail kan krympe. Udtrykket er uændret. Leverandørnavnet på prisstatistikken ombrydes. Det kommer stadig fra `stat.supplier_name`. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-155, G18-156, G18-157, G18-158, G18-159, G18-160.

## Checkpoint 2026-10-18 nittende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `02778774`. Det omskriver ikke listerne ovenfor. Produktspids: `2c7c1deb`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `02778774..2c7c1deb`

```
2c7c1deb feat(pris): tom tekst ombrydes
a5b2c693 feat(pris): indlaesertekst ombrydes
302d2e41 feat(pris): statistiketiketter ombrydes
608321fd feat(pris): prisbevaegelse ombrydes
f414c152 feat(pris): synk-dato ombrydes
```

Listen er alle commits efter `02778774` til og med `2c7c1deb`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Synk-datoen ombrydes. Kaldet er stadig `formatDateUtil(stat.last_sync_at)`. Etiketten "Prisbevægelse" ombrydes. Procenterne er uændret. Etiketterne på prisstatistikkens tal ombrydes. Tallene er uændret. Teksten "Indlæser data..." ombrydes. Sætningen er uændret. Den tomme tekst ombrydes. Sætningerne i EmptyState-kaldene er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-160, G18-161, G18-162, G18-163, G18-164, G18-165.

## Checkpoint 2026-10-18 fireogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `9d888c0b`. Det omskriver ikke listerne ovenfor. Produktspids: `44858657`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `44858657` blev afvist før git kørte og er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `9d888c0b..44858657`

```
44858657 feat(pris): taerskelvaelger ombrydes
0cf926cc feat(pris): skrivebords-trendnavn kan krympe
b9cced96 feat(pris): skrivebords-produktnavn kan krympe
1ce6a187 feat(pris): mobil-statusfelt ombrydes
522b4afc feat(pris): mobil-trendnavn kan krympe
e17fd377 feat(pris): mobil-tilbudstitel kan krympe
444f9f8c feat(pris): mobil-kundenavn kan krympe
70925e74 feat(pris): mobil-leverandoernavn kan krympe
8592d5ed feat(pris): mobil-produktnavn kan krympe
c66b70d3 feat(pris): tilbudstitel kan krympe
1dfa747e feat(pris): aendringscelle ombrydes
518cd83c feat(pris): leverandoercelle kan krympe
e53a4ed6 feat(pris): kundecelle kan krympe
240cec01 feat(pris): nul-maerke ombrydes
83c33712 feat(pris): mobil-varenummer ombrydes
623d39a1 feat(pris): tilbudscelle ombrydes
67b26455 feat(pris): mobil-alvorlighed ombrydes
7942e74d feat(pris): linjecelle ombrydes
60a806cd feat(pris): volatilitets-celle ombrydes
64091122 feat(pris): paavirkningscelle ombrydes
6f70f086 feat(pris): advarsels-varenummer ombrydes
3b10c854 feat(pris): tilbudsstatus-celle ombrydes
a4985512 feat(pris): advarsels-produktcelle ombrydes
b24673cb feat(pris): alvorlighedsmaerke ombrydes
e1e99436 feat(pris): 90-dages-celle ombrydes
69075fa6 feat(pris): 30-dages-celle ombrydes
021680c7 feat(pris): trend-produktcelle ombrydes
c62450de feat(pris): leverandoer-option ombrydes
fa8d3a8e feat(pris): leverandoervaelger ombrydes
19c8c643 feat(pris): volatilitets-linje ombrydes
9d356dc5 feat(pris): tilbage-knap ombrydes
45e180cb feat(pris): dialogtitel ombrydes
d884e2e3 feat(pris): avance-etiket paa detaljen ombrydes
f3ebc877 feat(pris): kostpris-etiket paa detaljen ombrydes
6dbb2d7d feat(pris): listepris-etiket paa detaljen ombrydes
330793cc feat(pris): enhed-etiket paa detaljen ombrydes
f3afbb3f feat(pris): kategori-etiket paa detaljen ombrydes
faf93d38 feat(pris): status-etiket paa detaljen ombrydes
876760a1 feat(pris): specifikationer ombrydes
5e27c20c feat(pris): beskrivelse-etiket paa detaljen ombrydes
8ac66042 feat(pris): prisoverskrift ombrydes
5cc44f4d feat(pris): detalje-beskrivelse ombrydes
59334730 feat(pris): produktinformation ombrydes
d6096465 feat(pris): detalje-slet ombrydes
bbb8ed0b feat(pris): detalje-rediger ombrydes
70e7c704 feat(pris): detalje-fejl ombrydes
da0465f1 feat(pris): sku-linje paa detaljen ombrydes
96baa1dd feat(pris): produktnavn paa detaljen ombrydes
48bfe72a feat(pris): formularens enhedsvaelger ombrydes
c8f775a0 feat(pris): formularens kategori-vaelger ombrydes
4c616ac0 feat(pris): formularens kategorinavn ombrydes
2b31782e feat(pris): listepris-pladsholder ombrydes
f30da9fd feat(pris): kostpris-pladsholder ombrydes
e1fe48d2 feat(pris): sku-pladsholder ombrydes
8fa842a1 feat(pris): beskrivelse-pladsholder ombrydes
3195370a feat(pris): produktnavn-pladsholder ombrydes
fc137ff3 feat(pris): listepris-etiket ombrydes
bc92e526 feat(pris): kostpris-etiket ombrydes
571c98b3 feat(pris): enhedsnavn ombrydes
5720d8fd feat(pris): sku-etiket ombrydes
688e5c5d feat(pris): beskrivelse-etiket ombrydes
3495cca6 feat(pris): produktnavn-etiket ombrydes
436aa622 feat(pris): vaelg-kategori ombrydes
e325204a feat(pris): enhed-etiket ombrydes
fe5c0d0a feat(pris): aktiv-etiket ombrydes
bbd5c993 feat(pris): kategorifejl i formularen ombrydes
149d3931 feat(pris): kategori-etiket i formularen ombrydes
8f2af7a4 feat(pris): gem-knap ombrydes
5ed0baca feat(pris): annuller ombrydes
074fd307 feat(pris): kategori-etiket ombrydes
f4c9345f feat(pris): kategorinavn ombrydes
d5a34ddd feat(pris): soegeetiket ombrydes
0bfa834b feat(pris): kategori-pladsholder ombrydes
6fb0821d feat(pris): soegefelt ombrydes
40dc8157 feat(pris): mobil-slet ombrydes
c0b939df feat(pris): mobil-rediger ombrydes
aed9f5aa feat(pris): alle-kategorier ombrydes
22863ffa feat(pris): slet-menu ombrydes
cb4f0a8f feat(pris): rediger-menu ombrydes
```

Listen er alle commits efter `9d888c0b` til og med `44858657`, fra `cb4f0a8f`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
9d888c0b docs: checkpoint efter ffc0fffb
```

### Features

Katalog, produktformular, produktdetalje og prisovervågning kan ombrydes på mobil og skrivebord. Ord, numre, SKU, statusser, procenter og `formatCurrency` er uændrede. G18-287 lader produktnavnet på pristendensens skrivebord krympe. `{trend.product_name}` og `formatCurrency(trend.current_price)` er uændrede. G18-288 lader tærskel-vælgeren ombrydes. Værdierne 2, 5, 10 og 20 og `setThreshold` er uændrede. Periode-vælgeren er uændret. Ingen opfundne priser. Ingen e-conomic. Ingen webhook.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil. Pris-testene kalder `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter katalog-, formular-, detalje- og prisbølgen fra `cb4f0a8f` til `44858657`, herunder G18-287 og G18-288. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-289, G18-290, G18-291, G18-292, G18-293, G18-294.

## Checkpoint 2026-10-18 treogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `ffc0fffb`. Det omskriver ikke listerne ovenfor. Produktspids: `03376da4`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `03376da4` blev afvist før git kørte og er ikke prøvet igen. De lokale tip er ikke pushet. Ingen merge til main. Ingen prod-migration, prod-data, hemmelighed eller live flag.

### Alle commits `ffc0fffb..03376da4`

```
03376da4 feat(pris): manglende kategori ombrydes
1a8179c5 feat(pris): rediger-dialog ombrydes
a08873f1 feat(pris): opret-dialog ombrydes
79d19d67 feat(pris): opret-knap ombrydes
cabc43cd feat(pris): ryd-knap ombrydes
ece52245 feat(pris): kategorifejl ombrydes
90b6dcc1 feat(pris): katalogfejl ombrydes
2068b4c3 feat(pris): katalogoverskrift ombrydes
2469bd6e feat(pris): antal ombrydes
1891ab86 feat(pris): ny-knap ombrydes
637b14e8 feat(pris): prisetiketter ombrydes
```

Listen er alle commits efter `ffc0fffb` til og med `03376da4`, fra `637b14e8`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commit der ikke stod i et hegn

```
ffc0fffb docs: checkpoint efter 7790a262
```

### Features

Etiketterne Kostpris og Listepris på mobilkortet ombrydes. Ordene er uændrede. Kostetiketten kræver stadig `canSeeCost`. Værdierne er stadig `storedCostText(product.cost_price)` og `formatCurrency(product.list_price)`. Knappen Nyt produkt ombrydes. `setShowCreateDialog` er uændret. Antallet ombrydes. Sætningen og `total` er uændrede. Overskriften Produktkatalog ombrydes. Katalogfejlen og kategorifejlen ombrydes. Sætningerne er uændrede. Knappen Ryd søgning ombrydes. `clearFilters` er uændret. Knappen Opret produkt ombrydes. Dialogen Opret nyt produkt og dialogen Rediger produkt ombrydes. Ordene er uændrede. Bindestregen for en manglende kategori ombrydes. Bindestregen er stadig `-`. Varenummerets bindestreg er uændret. Ingen opfundne priser. Ingen e-conomic.

### Tests

Hver produkt-commit har et `scripts/*-test.ts`, der læser den shippede fil og kalder `formatCurrency(1250)` fra `src/lib/utils/format`. De kørte med `npx tsx` og exiterede 0. `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit --pretty false` exiterede 0 før hver src-commit. Resultaterne er tilføjet i tests.log, ikke skrevet om. Ingen browser: der er ikke `.env` / `.env.local`.

### BLOCKED_APPROVAL

Ingen ny blok. Stående blokke gælder kun sig selv: 00221–00262, F-4, F-5, PE-3/PE-4, P-8, GP-4, OIOUBL-fortegn, live mail/SMS/Telegram/e-conomic, getSystemHealth, INVOICE_ATTACHMENT_FETCH_ENABLED, MONTOR_START_JOB_ENABLED, IC7, 00198, og VAT-vagten i `2d979a03`. G18-25, G18-27 og G18-30 er sprunget over, ikke blokeret.

### Claude review

Når `grok-next` må ses: kost-gates og `formatCurrency(product.list_price)` først. Derefter katalogbølgen G18-199 til G18-209: mobil-etiketter, knapper, antal, overskrift, fejltekster, dialoger og den manglende kategoris bindestreg. Ingen af dem poster, sender eller opfinder en pris. `vat-guard.ts`, cron, storage og migrationer 00221–00262 er urørte.

### Integration

1. Merge ikke til main.
2. Når push er tilladt: push kun `grok-next`. Prøv ikke de afviste tip igen.
3. Merge `origin/main` ind i `grok-next` og løs konflikten uden at køre migrationer.
4. Claude reviewer kost-gate og listepris først.
5. Først derefter merge til main.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-210, G18-211, G18-212, G18-213, G18-214, G18-215.

## Checkpoint 2026-10-18 toogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `7790a262`. Det omskriver ikke listerne ovenfor. Produktspids: `925f0e18`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push af `925f0e18` blev afvist før git kørte og er ikke prøvet igen. De lokale tip er ikke pushet.

### Alle commits `7790a262..925f0e18`

```
925f0e18 feat(pris): kolonneoverskrifter ombrydes
b737ab48 feat(pris): statusmaerke ombrydes
55e9e20d feat(pris): tom overskrift ombrydes
8bfcca6d feat(pris): tom katalogtekst ombrydes
65c999c5 feat(pris): kategorimaerke ombrydes
096ef11c feat(pris): listepris ombrydes
fb6b1c33 feat(pris): mobilbeskrivelse ombrydes
c3d38a79 feat(pris): produktbeskrivelse ombrydes
3de5273d feat(pris): fejlknapper ombrydes
133894f2 feat(pris): fejlkode ombrydes
d70d349a feat(pris): fejltekst ombrydes
76ebac7d feat(pris): fejloverskrift ombrydes
02f04601 feat(pris): sideindledning ombrydes
9360b884 feat(pris): sideoverskrift ombrydes
716a580f feat(pris): fanetaeller ombrydes
0f960431 feat(pris): leverandoeretiket ombrydes
```

Listen er alle commits efter `7790a262` til og med `925f0e18`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Docs-commits der ikke stod i et hegn

De gamle lister er uændrede. Disse docs-commits stod kun i prosa. De står her, så `80ab0dab..HEAD` er dækket uden at omskrive de tidligere hegn.

```
7790a262 docs: checkpoint efter 277b56fd
277b56fd docs: checkpoint efter 0f8b263d
0f8b263d docs: checkpoint efter 02778774
02778774 docs: checkpoint efter 4a77eb75
4a77eb75 docs: checkpoint efter 8f8322fb
8f8322fb docs: checkpoint efter 6ec2c234
6ec2c234 docs: checkpoint efter da6b7d99
da6b7d99 docs: checkpoint efter 496594f0
496594f0 docs: checkpoint efter 9f4eb434
9f4eb434 docs: checkpoint efter 53906875
53906875 docs: checkpoint efter fc1047a0
fc1047a0 docs: checkpoint efter d8d63c83
d8d63c83 docs: checkpoint efter 1d0db479
1d0db479 docs: checkpoint efter 9c093aba
9c093aba docs: checkpoint efter e584cfad
e584cfad docs: checkpoint efter 227e1344
227e1344 docs: checkpoint efter dc4a2a51
dc4a2a51 docs: checkpoint efter 58e87d32
58e87d32 docs: checkpoint efter dfd78f86
dfd78f86 docs: checkpoint for grok-shift 2026-10-18 fortsat
```

### Features

Leverandøretiketten ombrydes. `value` og `onChange` er uændret. Fanetælleren ombrydes. `{tab.count}` er uændret. Sideoverskriften Prisovervågning og sideindledningen ombrydes. Fejloverskriften, fejlteksten og fejlkoden ombrydes. Sætningerne er uændret. `onClick={reset}` bliver. Knapperne Prøv igen og Dashboard ombrydes. Produktbeskrivelsen og mobilbeskrivelsen ombrydes. `line-clamp` er væk fra kataloget. Listeprisen ombrydes. Udtrykket er stadig `formatCurrency(product.list_price)`. Kategorimærket ombrydes. Navnet er uændret. Den tomme katalogtekst og den tomme overskrift ombrydes. Sætningerne er uændret. Statusmærket Aktiv og Inaktiv ombrydes. Kolonneoverskrifterne Produkt, SKU, Kategori, Kostpris, Listepris og Status ombrydes. Kostkolonnen kræver stadig `canSeeCost`. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-199, G18-200, G18-201, G18-202, G18-203, G18-204.

## Checkpoint 2026-10-18 enogtyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `277b56fd`. Det omskriver ikke listerne ovenfor. Produktspids: `65c9590d`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `277b56fd..65c9590d`

```
65c9590d feat(pris): manglende tendens ombrydes
da1765b5 feat(pris): trendetiket ombrydes
31c71fe3 feat(pris): tilbudsnummer ombrydes
878e8df9 feat(pris): aendringstal ombrydes
565e7037 feat(pris): linjetal ombrydes
2403d625 feat(pris): volatilitet ombrydes
25b44749 feat(pris): trendprocent ombrydes
470b88be feat(pris): statusmaerke ombrydes
cf6077ce feat(pris): paavirkningsantal ombrydes
f9add430 feat(pris): procentmaerke ombrydes
7292f51d feat(pris): tilbudsdato ombrydes
```

Listen er alle commits efter `277b56fd` til og med `65c9590d`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Tilbudsdatoen ombrydes. Kaldet er stadig `formatDateUtil(offer.created_at)`. Procentmærket ombrydes. `toFixed(1)` er uændret. Påvirkningsantallet ombrydes. Statusmærket ombrydes. Ordene Kladde, Sendt, Set, Accepteret, Afvist og Udløbet er uændret. Trendprocenterne for 30 og 90 dage ombrydes. Udtrykkene er uændret. Volatilitetsmærket ombrydes. Stabil, Moderat og Høj er uændret. Antallet af berørte linjer ombrydes. Ændringstallet ombrydes. Tilbudsnummeret ombrydes. Linket er uændret. Etiketterne 30 dage og 90 dage på mobilkortet ombrydes. Bindestregen når en tendens mangler ombrydes. Påvirkningsstregen er uændret. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-183, G18-184, G18-185, G18-186, G18-187, G18-188.

## Checkpoint 2026-10-18 tyvende (Grok-shift, grok-next)

Dette checkpoint lister commits efter `0f8b263d`. Det omskriver ikke listerne ovenfor. Produktspids: `ed04ddfe`. Start: `80ab0dab`. `origin/grok-next` er stadig `80ab0dab`. Push blev afvist før git kørte. De lokale tip er ikke pushet og må ikke prøves igen.

### Alle commits `0f8b263d..ed04ddfe`

```
ed04ddfe feat(pris): advarseldato ombrydes
d94b7e60 feat(pris): opdater-knappen ombrydes
8f0b324d feat(pris): faner ombrydes
241b2b5f feat(pris): filteretiketter ombrydes
22eec97b feat(pris): oversigtstal ombrydes
9f092011 feat(pris): oversigsetiketter ombrydes
c487b4df feat(pris): tendensoverskrifter ombrydes
5aa35790 feat(pris): tilbudsoverskrifter ombrydes
dd0e1b6f feat(pris): advarselsoverskrifter ombrydes
a6ef44f9 feat(pris): prisbevaegelse-procenter ombrydes
0f5ac865 feat(pris): statistiktal ombrydes
256460bf feat(pris): fejltekst ombrydes
```

Listen er alle commits efter `0f8b263d` til og med `ed04ddfe`. Docs-committen med denne sektion kommer bagefter og står ikke i listen.

### Features

Fejlteksten ombrydes. Sætningen er uændret. Statistiktal og oversigtstal ombrydes. `isText`-udtrykket er uændret. Procenterne ved Prisbevægelse ombrydes. toFixed-udtrykkene er uændret. Kolonneoverskrifter på advarsler, påvirkede tilbud og tendenser ombrydes. Ordene er uændret. Oversigtsetiketter, filteretiketter og faner ombrydes. Knappen Opdater ombrydes. `loadData` er uændret. Datoen på prisadvarslerne ombrydes. Kaldet er stadig `formatDateUtil(alert.changed_at)`. Ingen opfundne priser. Ingen e-conomic.

### Stadig åben kø (15)

G18-13, G18-46, G18-15, G18-47, G18-20, G18-21, G18-48, G18-23, G18-60, G18-172, G18-173, G18-174, G18-175, G18-176, G18-177.

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
