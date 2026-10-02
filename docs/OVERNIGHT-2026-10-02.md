# Overnight-run 2026-10-01 → 02 — morgenbrief til Henrik

Detaljer pr. punkt: [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md) · tidslinje: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) · prod-gates: [runbooks/PROD-GATE-BATCH-2026-10.md](runbooks/PROD-GATE-BATCH-2026-10.md)

## Kræver din beslutning (ingen af dem stopper drift i dag)

| # | Spørgsmål | Hvorfor | Status i koden |
|---|---|---|---|
| D24 | Skal de **2 kunder** hvis portal-side indeholdt kostpriser vurderes/informeres? | Tilbudslinjer blev sendt med kostpris i sidedata (kun synligt i sidekilden). 2 tilbud / 2 kunder i prod | Rettet og deployet |
| D26 | Skal **sagsfotos/-dokumenter** som standard være interne eller delt med kunden? | Upload på sagens Dokumenter-fane vises i kundeportalen | UI siger nu "Synligt for kunden". Migration 00184 (intern dokumenttype) forberedt, ikke kørt |
| D18 | Må **montør angive kostbeløb** (kvittering) på øvrige omkostninger? | Montør ser ikke kost (masket), men dialogen tillader indtastning | Visning rettet; dialog urørt |
| D28 | Skal **bogholderi** kunne se kundens mails på kundekortet? | Gate er nu customers.edit (admin/serviceleder/salg) | Bogholderi ser dem ikke i dag |
| D27 | Prisadvarsler (`system_alerts`): byg tabellen (migration) eller fjern koden? | Tabellen findes hverken i prod eller staging | Støj fjernet; ingen funktion |
| N2 | Godkendelse af timer — styrer det fakturering og/eller løn? | (fra før) | Uændret |
| N8a | DB-blokering vs. advarsel ved afsendelse af tilbud | (fra før) | Uændret |

## Drift-opsætning før pilot (prod, read-only 2026-10-02)

Vises også på **/dashboard/go-live → "Opsætning før pilot"** (G13).

- **G11** — 1 af 2 montør-logins er ikke koblet til en medarbejder → ser ingen job / kan ikke registrere tid. *Medarbejdere → Rediger → Login → "Knyt eksisterende bruger".*
- **G12** — bank på kundefakturaer: firmaindstillingerne har ingen reg.nr./konto. Fakturaerne bruger Vercel-env `INVOICE_BANK_REG_NO`/`INVOICE_BANK_ACCOUNT` (kan ikke læses herfra). *Bekræft env — eller udfyld Indstillinger → Firma (bruges nu som fallback).*
- **e-conomic** — 2 kunder med sendte fakturaer er ikke koblet til en e-conomic-debitor → ville blive oprettet som nye debitorer ved første eksport. *Kundekort → Fakturaer → e-conomic-kundenr.*
- Firma (navn, CVR), tilbudsstandarder (30 dages gyldighed, betingelser, 25 % moms): ✓

## Prod-gates (BLOCKED_APPROVAL — uændret, ingen nye i nat ud over 00184)

00175–00179 · 00180 (G10 mail-scope) · 00181 (+ `MONTOR_START_JOB_ENABLED`) · 00182 · 00183 (trigram, uden for 02:00) · **00184 (ny, forberedt — kræver først beslutning D26)** · `INVOICE_ATTACHMENT_FETCH_ENABLED` · aktivering af sovende crons · e-conomic-nøgler.

## Vigtigst fundet i nat (alle rettet + testet)

- **Privatliv/fortrolighed mod kunder**: kostpriser i portalens sidedata (D24), interne sagsbemærkninger i kunde- og partnerportal (D32), interne noter på tilbuds- og faktura-PDF (D33/D34).
- **Penge**: slutfaktura fratrak krediterede forskud igen (D13), slutfaktura brugte ny timesats (D10), "1.250" blev 1,25 kr (D11), sag kunne lukkes med ufaktureret arbejde (D23).
- **e-conomic (inden nøgler)**: forhåndsvisning + afvisning af beløbsafvigelser, leverandørfaktura bogførte kun udlæste linjer/moms som omkostning (D16), betalinger på forkert dato/kreditnota som indbetaling (D17), kobling til eksisterende debitorer.
- **Salg uden settings.view**: ingen tilbuds-PDF (500), ingen gyldighedsdato, "Virksomhed" på print (D22/D30/D31); bogholderis fakturamail uden PDF (D21).
- **CI** var rød (check:rls-matrix) fra en af nattens egne ændringer — rettet (D36).
