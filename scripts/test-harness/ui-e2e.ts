/**
 * P2-rest C — reproducerbar UI-test af Agent Inbox + Pilot Health mod STAGING med syntetiske brugere.
 *
 * Ingen rigtige logins, ingen manuel browser, ingen eksterne credentials:
 *   1. CLI'en har allerede bundet app-env til staging (prod-ref hard-blokeret). Denne fil verificerer det igen.
 *   2. Syntetiske brugere (ui-e2e-<rolle>-<stamp>@harness.test) oprettes med tilfaeldigt password, der KUN lever
 *      i denne proces (printes/gemmes aldrig) — og slettes igen i finally.
 *   3. `next dev` startes som child-proces med staging-env. Eksterne integrationer (Graph/SMTP/OpenAI/SFTP/AO,
 *      cron-secret, krypteringsnoegle, direkte DB-URL) saettes til '' — @next/env overskriver ALDRIG en allerede
 *      sat noegle, saa .env-filernes vaerdier kan ikke snige sig ind. AGENT_LIVE_SEND_ENABLED/AUTO_CREATE = ''.
 *   4. Headless Chromium (Playwright) logger ind og kontrollerer siderne. Kun navigation — der klikkes ALDRIG
 *      paa Godkend/Udfoer/Koer-knapper.
 *
 *   U1  admin: login virker (bruger findes kun paa staging => beviser staging-binding)
 *   U2  admin: Agent Inbox renderer (overskrift, agent-knapper, "agent slået fra"-badge, ingen fejlboundary)
 *   U3  admin: Pilot Health renderer alle 7 sektioner, ingen sektion "Kunne ikke hentes", live-send OFF
 *   U4  montør: Agent Inbox og Pilot Health viser "Du har ikke adgang"
 *   U5  ingen browser-konsolfejl / sidefejl under forløbet
 *   U7  admin: lønsomhedskort på tilbud (Profit Engine) — realistisk DB, dom og timekost-advarsel
 *   U8  admin: grossist-sammenligning på tilbud (samme EAN billigere hos anden leverandør)
 *   U9  admin: fakturakontrol på leverandørfaktura (overpris mod katalog-kostpris via varenr.)
 *   U10 kunde (UDEN CRM-session): åbn tilbud fra portal-link (første klik), underskriv og acceptér -> succes,
 *       tilbud accepteret, sag oprettet med sælgeren som ansvarlig, aktivitet på tidslinjen (G1/G2)
 *   U11 montør-dagen (G4): "Mine job" på landingssiden -> åbn job -> kun Afslut (ingen Start/Slet) -> upload foto
 *       -> afslut -> status done i DB; kalenderen viser eget job uden "Planlæg opgave"/tom-tilstand
 *   U15 admin: fakturakladde — modtager = faktura-kontakt når kunden ingen mail har; ret stk-pris, tilføj og slet
 *       manuel linje -> totaler + 25 % moms genberegnet i DB (N5)
 *   U16 admin: e-conomic-opsætning — leverandørnr. sættes på leverandøren (ugyldigt afvises), tjeklisten "Klar til
 *       bogføring?" vises med alle punkter; intet bogføres (N12)
 *   U17 admin: AO-prisfil (ISO-8859-1) via import-guiden → varer oprettet med korrekte æøå og kostpris; 2. fil med ny pris
 *       → pris opdateret + prishistorik (grossist/prisdata)
 *   U18 admin: sagens stedinfo på ordresiden — ugyldigt KSR afvises, gyldigt KSR/EAN/telefon gemmes; Naviger-link (N9b)
 *   U19 admin: kundesøgning med komma/parentes ("Hansen, Jens (VVS)", "3x1,5") finder kunden — før: PostgREST-parsefejl
 *   U20 admin: sagslisten — type-filter filtrerer (før: ignoreret), "Haster"-mærke, statustællere i filteret (N9c)
 *   U21 montør (mobil): bundmenu = Opgaver/Kalender/Sager (ingen Indbakke); gamle Service-links viderestilles til
 *       ordresiden (N9d)
 *   U22 login uden JavaScript (= før hydrering): adgangskoden ender aldrig i URL'en (S2-fund: native GET-submit)
 *   U23 portal-chat: kunde UDEN login skriver + vedhæfter PDF → sælger ser den på kundekortet og svarer → kunden ser
 *       svaret (kundeportal, GO-LIVE)
 *   U24 nyt tilbud fra bunden: formular (titel + kunde) → tilbudssiden → "Tilføj linje" (4 × 250) → linjen gemt og
 *       tilbuddets totaler opdateret (1.000 ekskl. / 1.250 inkl. moms)
 *   U25 mail → sag: kundemail i indbakken → "Opret sag" → lander på den nye sags Mails-fane med mailen; mail koblet i DB
 *   U26 fakturering fra sagen: materiale på sagen → Fakturakladde → "Opret del-faktura" → kladde med linjen (120 kr),
 *       materialet låst til fakturalinjen (ingen dobbeltfakturering)
 *   U27 lead → kunde: "Opret som kunde" → kundesiden; leadet viser "Gå til kunde"; 2. lead med samme mail kobles til
 *       SAMME kunde (ingen dublet)
 *   U28 leverandørfaktura → sag (PR-1): bogholderi godkender (ingen auto-konvertering), serviceleder fordeler linjer til sagsmaterialer (kobling
 *       begge veje), INGEN e-conomic-bogføring
 *   U29 betaling: sendt faktura → "Markér som betalt" (m. reference) → status betalt + audit-række (D1 i praksis)
 *   U30 planlægning: kalender → "Planlæg opgave" (sag, montør, dato, titel) → arbejdsordre i DB og synlig i kalenderen
 *   U31 timer → faktura: montørens afsluttede timer på sagens arbejdsordre → "Opret del-faktura" → timelinje
 *       (beløb = frosset salgssnapshot) + timen låst; åben timer advarer/blokerer, ikke-fakturerbar time vises ikke i kladden og faktureres ikke
 *   U32 slutfaktura: forskud 300 + montørtimer (sats hævet EFTER arbejdet) → "Opret slutfaktura" → timelinje = frosset
 *       snapshot (ikke ny sats), fradrag −300, total 700, timen låst
 *   U33 kreditnota: sendt faktura 2.000 → "Delvis — beløb" skrevet dansk "1.000" → −1.000 (før: −1 kr); 1.500 over resten
 *       blokeret; fuld kreditnota af resten → i alt −2.000
 *   U34 sagsmateriale via dialogen: antal 2, kost "1.000", salg "1.250,50" → gemt som 1000 / 1250,5 (D11; før 1 / ugyldig)
 *   U35 slutfaktura efter kreditnota: forskud 300 krediteret fuldt + rate 500 krediteret 200 + materiale 1.000 → kun −300
 *       fradrag (rate netto), total 700 (før: −300 −500 → 200; kunden fik krediteringen to gange)
 *   U36 rate 100 % krediteret fuldt → ny a conto-rate 50 % kan oprettes (5.000 af 10.000; før: blokeret af 100 %-loftet)
 *   U37 e-conomic-forhåndsvisning: faktura med linje 0,33 × 525,10 ≠ 173,25 → "Vis hvad der sendes" viser e-conomic-netto
 *       1.173,28 mod fakturaens 1.173,25 + afvigelsen; intet sendes (ingen sync-log)
 *   U38 leverandørfaktura 1.000 ekskl. moms, kun én linje (600) udlæst → forhåndsvisning før godkendelse: omkostning 1.000
 *       (differencelinje 400; før: 600 bogført), leverandør nr. 12; intet sendes, status uændret
 *   U39 kunde → eksisterende e-conomic-debitor: ugyldigt nr. afvist, gyldigt gemt + audit, samme nr. på anden kunde afvist,
 *       kobling fjernet igen (undgår dublet-debitorer ved første eksport)
 *   U40 montør på egen sag: ingen Fakturakladde/Handlinger/Økonomi-faner, ingen kostkolonne; D18: øvrig omkostning uden
 *       prisfelter (gemt med 0, kontoret ser "Afventer pris"); registrerer 3 stk materiale
 *       uden prisfelter → gemt med 0-priser (kontoret prissætter); admin ser stadig priser + Handlinger (kræver U11)
 *   U41 kundeportal (kunde uden login): sendt faktura vises + PDF downloades (%PDF); kladde skjult og PDF 404; anden
 *       kundes faktura-PDF 404
 *   U42 kopiér tilbud: sendt tilbud m. 2 linjer → "Kopiér" → ny kladde (nyt nr., "(kopi)", ny gyldighed, ikke sendt), linjer inkl.
 *       kostpris kopieret, samme total; kilden uændret
 *   U43 omplanlægning: kalender → klik job → ny dato (+2 dage) og anden montør → "Gem ændringer" → arbejdsordre flyttet,
 *       stadig planlagt, vist på ny dag
 *   U44 montør: "Mine timer" på landingssiden viser ugens egne timer (= DB-sum for U11's registrering) + sagen (kræver U11)
 *   U45 salg: "Kun mine" på leadlisten viser kun leads tildelt sælgeren (kollegas lead skjult), filter vist som "Tildelt mig"
 *   U46 faktura-PDF (/api/invoices/[id]/pdf): admin får PDF, montør får 404 (før: kun login-tjek → alle indloggede)
 *   U47 salg: PDF for eget tilbud downloades (før: 500, firmaindstillinger krævede settings.view)
 *   U48 lukke-værn: "Markér afsluttet" på sag med ufaktureret materiale → advarsel med beløb; fortryd = forbliver åben;
 *       bekræft = lukket + audit "lukket trods"
 *   U183 lukke-værn fastpris: sag med billing_model=fixed_price og ufaktureret kontraktsum → advarsel; fortryd = åben
 *   U49 dashboard-API: forfaldne = forfald før i dag (dansk), uden kreditnotaer og annullerede (som fakturalisten)
 *   U50 kundeportal: tilbudsdetalje + oversigt indeholder IKKE linjernes kostpris/leverandørkost/interne noter i sidens data
 *       (før: select('*') sendte dem til kundens browser)
 *   U51 tilbudslinje fra grossistkatalog: "Fra leverandør" → søg varenr. → klik → linje med leverandørspor, kostpris gemt,
 *       salgspris over kost
 *   U52 kundekort: mail koblet til kunden vises i kundens mail-tidslinje (før: PGRST201 tvetydig join → tom)
 *   U53 go-live: "Opsætning før pilot" (firma, bank, montør-logins koblet, e-conomic-kunder) vises for admin; montør-status = DB
 *   U54 salg: lead → "Opret tilbud" → tilbud koblet til leadet med firmaets standard-gyldighed og -betingelser
 *       (før: salg fik ingen gyldighedsdato — firmaindstillinger krævede settings.view)
 *   U55 salg: "Print" på eget tilbud viser firmaets navn og CVR (før: "Virksomhed" uden oplysninger)
 *   U56 kundeportal: sagens "Bemærkninger (interne)" (status_note) findes IKKE i kundens side (før: vist i portalen)
 *   U57 tilbud sat til Accepteret → lead (lead_id) og lead konverteret til kunden markeres vundet + aktivitet; tabt lead uændret
 *   U58 sendt tilbud efter "gyldig til" vises som "Udløbet" (detalje + liste); gyldigt tilbud ikke
 *   U60 N8a: kladde med lav DB → advarsel (ikke blokering); send-dialog kræver bekræftelse; manuel "Sendt" kræver
 *       bekræftelse (afvist → stadig kladde) og audit-logges
 *   U61 D28: bogholderi ser kundens koblede mails på kundekortet (kun læsning, ingen Ny Mail) men ikke ukoblede
 *       adresse-match-mails; kontoret ser begge
 *   U62 N2: montørens timer afventer godkendelse; admin afviser med begrundelse (montør ser "Afvist") og godkender;
 *       montør har ikke adgang til godkendelsessiden; audit
 *   U64 webhenvendelser: kontaktformular-mail (også en tidligere fejl-ignoreret) vises under "Webhenvendelser"; andre
 *       ignorerede mails gør ikke
 *   U65 N24a: ukoblet mail fra kundens adresse → "Kobl tidligere mails" på kundekortet kobler den (linked_by retro)
 *   U63 N23: sag new → I gang når montøren starter job/registrerer tid (audit); "Klar til lukning" når alle job er udført
 *       og intet er ufaktureret → Luk sagen; ufaktureret sag viser intet banner
 *   U66 N26b: Rapporter → Sagsrentabilitet viser montørsagen (bygger på sager/timer, ikke gamle projekter)
 *   U67 N27: styringscockpittet viser antal sager klar til lukning
 *   U68 N35: webhenvendelse → "Opret lead" med kontaktdata fra formularen (ikke FormSubmit-afsenderen), kilde website
 *   U69 N31/D40: kunden booker besigtigelse i portalen → CRM-opgave (ingen kundemail uden flag); interne kundeopgaver
 *       hverken vises eller ligger i portalens sidedata
 *   U70 N36: dashboardets "Aktive Sager" = antal aktive sager; ingen links til /customers|/offers|/projects (404)
 *   U71 N30: montør uploader kvittering på øvrig omkostning → privat storage-sti (ikke kundedokument); kontoret får
 *       signeret bilag-link
 *   U73 privacy: medarbejderløn/-satser kun i fanen "Økonomi & løn" (løn-roller, hentes ved åbning, maskeret, væk
 *       ved fanebytte); serviceleder ingen fane/lønhistorik (D41); montør ingen kost/sats i sagens tidsdata (D42)
 *   U74 privacy/RBAC: salg får ingen kost/avance i tilbuddets data (D43); montør/salg ingen sagsbudget/lav-DB (D46);
 *       kontoret ser fortsat kost
 *   U75 D47: produktkatalog uden kostpris for salg (kolonne + data); kontoret ser den
 *   U76 D49: pris-/systemadvarsler på dashboardet og prisovervågningen kun for kostpris-roller (salg: ingen)
 *   U77 D44/D47/D48/D51: salg ser ingen netto/kost i leverandørsøgning, produktdetalje, kalkulationer (ingen adgang) eller
 *       solcelle-beregnerens interne kost/avance; kontoret ser dem
 *   U78 PV9: leverandørens IBAN maskeret for serviceleder (ingen fuld værdi i data); admin kan vise den
 *   U79 PV8: kost/DB foldet sammen som standard på Materialer/Øvrige/Planlægning for kontoret ("Vis kost/DB"); montør uden knap
 *   U80 D50: serviceleder ser kun aggregeret timekost (ingen kost/kostsats pr. registrering i UI/data); admin ser pr. række
 *   U81 N26c: Økonomi → tilbudt vs. faktisk pr. linje (foldet/ikke hentet til åbning; over/ikke brugt/ikke tilbudt; afvigelse)
 *   U82 D48/D51: solcelle-beregner — salg får ingen kostpriser/lønsats (server-beregning, standardavance); admin ser intern kost
 *   U83 privacy-rollematrix (5 roller): kost/DB sammenfoldet på sag/tilbud; ingen kostværdier i data uden kostadgang; leverandør-login kun admin
 *   U85 shoulder-surfing (lille, målrettet): admin-tilbud foldet som standard + fold ud; serviceleder uden login-fane
 *   U86 privacy-rollematrix del 2 (serviceleder/bogholderi) — U83 er nu admin/salg/montør
 *   U87 N25: banner for tilbudslinjer uden kostpris (kontor) + "Udfyld kost" sætter leverandørkost; salg ser intet banner
 *   U101/U102 rute-crawl (admin): 64 statiske dashboard-sider uden fejlgrænse/404/NoAccess (delt i to)
 *   U100 N52/N53: cockpit gamle kladder (> 14 d) + Rapporter salgstragt (6 mdr., indeværende måned tæller accepteret)
 *   U99 N51: cockpit "Klar til fakturering" (fakturerbart arbejde uden faktura, salgsværdi) → fakturakladden; montør uden kort
 *   U98 N50: ulæste portal-kundebeskeder i cockpittet → #chat åbner chatten → markeret læst i DB (RLS-fejl rettet)
 *   U97 N49: montørens "Mine job" har Navigér-link til jobbets adresse
 *   U96 N48: kalender "Mangler planlægning" (sag uden arbejdsordre / arbejdsordre uden dato) → Planlægning-fane; montør uden panel
 *   U95 N47: kladde-tilbud markerer linjer med ændret leverandørpris; "Opdater pris" sætter kost i begge felter + ny salgspris; salg ser intet
 *   U94 N46: e-conomic-forhåndsvisning af kundebetalingens kassekladde-postering (beløb, dato, ikke-eksporteret forklaret; intet sendt)
 *   U93 N44: cockpit "Nye kunder uden tilbud" (30 d, ingen tilbud/sag) + genvej åbner tilbudsformularen; montør uden kort
 *   U92 vedhæft PDF på mail-faktura uden bilag → privat fil, PDF-tekst, genlæst (nr./beløb), audit; knap væk med fil
 *   U91 realiseret DB pr. sag: netto faktureret ekskl. moms (udstedt − kredit; kladde/annulleret udelukket) mod faktisk kost
 *   U90 D50b: medarbejderøkonomi — kost/DB pr. medarbejder kun med løn-adgang; totaler sammenfoldet
 *   U89 PV16: Rediger medarbejder — løn/satser foldet og ikke hentet ved åbning; fold ud henter
 *   U88 N26d: Rapporter → Sagsrentabilitet med tilbudt/faktisk kost + afvigelse, sammenfoldet som standard
 *   U84 D48-audit: salg uden kost/avance i getOffer, tilføjet leverandørlinje, pakke-vælger, kundepriser, AI-indsigter; ingen Optimer
 *   U72 N28: styringscockpittet viser antal timeregistreringer der afventer godkendelse (link til Godkend timer)
 *   U12 admin: upload leverandørfaktura (PDF) -> fakturaen åbnes, læst (nr. + beløb), fil gemt privat; samme fil igen
 *       -> dublet (ingen ny række, ingen efterladt fil) (G8)
 *   U13 salg: "Opret sag fra tilbud" på eget tilbud -> lander på sagen og kan se den; "Sager / Ordrer" i menuen (G6)
 *   U14 salg: Opfølgning på tilbudssiden — eget tilbud set for 5 dage siden vises som "Set — ikke besvaret" med Ring;
 *       nyt tilbud ligger under "afventer"; kollegas tilbud vises ikke (N1)
 *   U6  admin: opkalds-opslag /dashboard/cti (P3 #15) renderer tom-tilstand for ukendt nummer
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { spawn, execSync, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { makeTextPdf } from './pdf-fixture'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface UiE2eCheck { id: string; ok: boolean; note: string }

const PROD_REFS = ['guhsjwewajyonehivffc']
const NEUTRALIZE = [
  'AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID',
  'GRAPH_MAILBOX', 'GRAPH_MAILBOXES', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PORT', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME',
  'OPENAI_API_KEY', 'OPENWEATHER_API_KEY', 'SFTP_PROXY_URL', 'AO_INVOICE_API_BASE_URL', 'AO_INVOICE_ENDPOINT_PATH', 'LM_INVOICE_DIR',
  'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'CRON_SECRET', 'ENCRYPTION_KEY', 'ADMIN_ALERT_EMAIL', 'CONTACT_FORM_API_KEY',
  'AGENT_LIVE_SEND_ENABLED', 'AUTO_CREATE_CASES_ENABLED', 'ECONOMIC_PUSH_ENABLED',
]

/** Navigation der ikke vælter hele suiten ved en kold kompilering: ét nyt forsøg med 'load' ved timeout.
 *  En side der reelt fejler, fejler stadig i testens egne tjek. */
/** Telemetri pr. test (nulstilles ved hvert resultat): goto-timeouts og -genforsøg. */
const tele = { gotoTimeouts: 0, gotoRetries: 0 }

/**
 * Testgrupper (Henrik 2026-10-02: smoke ≤10 min, målrettet ≤20 min, fuld regression kun natligt/milestone).
 *   UI_E2E_GROUP=smoke|sales|montor|economy|portal-mail   (kan kombineres med komma; UI_E2E_ONLY vinder hvis sat)
 * U1–U4/U6/U13/U5 (login, adgang, konsolfejl) kører altid.
 */
export const UI_E2E_GROUPS: Record<string, string[]> = {
  crawl: ['U101', 'U102', 'U103', 'U104', 'U105', 'U106', 'U107', 'U108', 'U109', 'U110'],
  smoke: ['U114', 'U10', 'U11', 'U15', 'U20', 'U37', 'U52', 'U70'],
  sales: ['U223', 'U222', 'U220', 'U219', 'U218', 'U217', 'U216', 'U214', 'U213', 'U210', 'U209', 'U208', 'U207', 'U206', 'U205', 'U202', 'U192', 'U147', 'U146', 'U131', 'U128', 'U126', 'U125', 'U118', 'U74', 'U75', 'U76', 'U77', 'U82', 'U83', 'U84', 'U85', 'U86', 'U87', 'U93', 'U95', 'U100', 'U111', 'U115', 'U7', 'U8', 'U9', 'U14', 'U24', 'U27', 'U42', 'U45', 'U47', 'U51', 'U54', 'U55', 'U57', 'U58', 'U60', 'U167', 'U168', 'U169', 'U170', 'U171', 'U172', 'U173', 'U174', 'U175', 'U176', 'U177', 'U178', 'U179', 'U182', 'U185', 'U186', 'U187'],
  montor: ['U225', 'U224', 'U221', 'U197', 'U196', 'U189', 'U188', 'U119', 'U117', 'U11', 'U21', 'U30', 'U34', 'U40', 'U79', 'U80', 'U43', 'U44', 'U48', 'U183', 'U63', 'U66', 'U67', 'U71', 'U73', 'U62', 'U72', 'U90', 'U96', 'U97', 'U112'],
  economy: ['U191', 'U145', 'U127', 'U123', 'U120', 'U116', 'U99', 'U94', 'U92', 'U91', 'U89', 'U88', 'U81', 'U78', 'U12', 'U15', 'U16', 'U17', 'U18', 'U19', 'U26', 'U28', 'U29', 'U31', 'U32', 'U33', 'U35', 'U36', 'U37', 'U38', 'U39', 'U46', 'U49'],
  'portal-mail': ['U215', 'U211', 'U203', 'U201', 'U200', 'U199', 'U198', 'U195', 'U194', 'U193', 'U190', 'U181', 'U180', 'U144', 'U143', 'U142', 'U141', 'U140', 'U139', 'U138', 'U184', 'U137', 'U136', 'U135', 'U134', 'U133', 'U132', 'U130', 'U129', 'U124', 'U122', 'U121', 'U113', 'U98', 'U10', 'U22', 'U23', 'U25', 'U41', 'U50', 'U52', 'U53', 'U56', 'U61', 'U64', 'U65', 'U68', 'U69'],
}

/**
 * Kald en server-action DIREKTE som den indloggede bruger (som en angriber ville, uden om UI'et) — id fra byggets
 * server-reference-manifest. Returnerer svarets rå RSC-tekst (søg efter "success"/fejltekst i den).
 */
async function callServerAction(page: import('playwright').Page, pageUrl: string, file: string, name: string, args: unknown[]): Promise<string> {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), '.next', 'server', 'server-reference-manifest.json'), 'utf8')) as { node: Record<string, { filename: string; exportedName: string }> }
  const id = Object.entries(manifest.node).find(([, v]) => v.filename === file && v.exportedName === name)?.[0]
  if (!id) return `NO_ACTION_ID ${name}`
  return page.evaluate(async ({ id, args, pageUrl }) => {
    const res = await fetch(pageUrl, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(args) })
    return `HTTP ${res.status} ${await res.text()}`
  }, { id, args, pageUrl })
}

async function gotoSafe(page: import('playwright').Page, url: string, opts: { waitUntil?: 'load' | 'networkidle' | 'domcontentloaded'; timeout?: number } = {}) {
  try {
    return await page.goto(url, opts)
  } catch (e) {
    const msg = String(e)
    // `next dev` genstarter sig selv ved hukommelsespres ("approaching the used memory threshold, restarting")
    // — vent til serveren svarer igen og prøv én gang til.
    tele.gotoRetries++
    if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(msg)) {
      console.warn(`[ui-e2e] dev-server utilgængelig (genstart?) — venter: ${url.replace(/[0-9a-f]{64}/, '<token>')}`)
      await waitForHttp(`${new URL(url).origin}/login`, 240_000)
      return await page.goto(url, opts).catch(() => null)
    }
    // En klient-navigation fra forrige trin (router.push/refresh) kan afbryde goto — vent til siden falder til ro, prøv igen
    if (/ERR_ABORTED/.test(msg)) {
      console.warn(`[ui-e2e] navigation afbrudt, prøver igen: ${url.replace(/[0-9a-f]{64}/, '<token>')}`)
      await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {})
      return await page.goto(url, opts).catch(() => null)
    }
    if (!/Timeout/i.test(msg)) throw e
    tele.gotoTimeouts++
    console.warn(`[ui-e2e] goto-timeout, prøver igen (load): ${url.replace(/[0-9a-f]{64}/, '<token>')}`)
    return await page.goto(url, { ...opts, waitUntil: 'load' }).catch(() => null)
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status < 500) return true
    } catch { /* ikke oppe endnu */ }
    await new Promise((res) => setTimeout(res, 2000))
  }
  return false
}

function killTree(child: ChildProcess) {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  } catch { /* allerede stoppet */ }
}

export async function runUiE2e(c: { admin: SupabaseClient; stagingRef: string; port?: number }): Promise<UiE2eCheck[]> {
  const out: UiE2eCheck[] = []
  // Stream hvert resultat med tidsstempel, så en langsom/hængende kørsel kan følges og stoppes uden at miste
  // de allerede kørte tests (før: alt blev først udskrevet til sidst).
  // Telemetri (Henrik 2026-10-02): pr. test start, varighed, ok, goto-timeouts/-genforsøg → JSONL (overlever afbrudt kørsel)
  const runStart = Date.now()
  let mark = runStart
  const teleFile = join(tmpdir(), 'elta-ui-e2e', `telemetry-${new Date(runStart).toISOString().replace(/[:.]/g, '-')}.jsonl`)
  try { mkdirSync(join(tmpdir(), 'elta-ui-e2e'), { recursive: true }) } catch { /* findes */ }
  const pushOut = out.push.bind(out)
  out.push = (...items: UiE2eCheck[]) => {
    for (const x of items) {
      const now = Date.now()
      const rec = { test: x.id.split(' ')[0], name: x.id, start: new Date(mark).toISOString(), duration_s: Math.round((now - mark) / 1000),
        ok: x.ok, goto_timeouts: tele.gotoTimeouts, goto_retries: tele.gotoRetries }
      try { appendFileSync(teleFile, JSON.stringify(rec) + '\n') } catch { /* telemetri må ikke vælte testen */ }
      console.log(`[ui-e2e ${new Date(now).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen' })}] ${x.ok ? '✓' : '❌'} ${x.id} (${rec.duration_s}s${rec.goto_timeouts ? `, ${rec.goto_timeouts} timeout` : ''}${rec.goto_retries ? `, ${rec.goto_retries} retry` : ''}) — ${x.note.slice(0, 200)}`)
      mark = now
      tele.gotoTimeouts = 0
      tele.gotoRetries = 0
    }
    return pushOut(...items)
  }
  const port = c.port ?? 3217
  const base = `http://localhost:${port}`
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url.includes(c.stagingRef) || PROD_REFS.some((r) => url.includes(r))) {
    return [{ id: 'staging-binding', ok: false, note: 'AFBRUDT: app-env er ikke bundet til staging' }]
  }

  const stamp = Date.now()
  const users: Array<{ id: string; email: string; password: string; role: string }> = []
  const mkUserSeq: Record<string, number> = {}
  const mkUser = async (role: string) => {
    // unik pr. kald (flere tests i samme kørsel kan oprette samme rolle)
    const seq = (mkUserSeq[role] = (mkUserSeq[role] ?? 0) + 1)
    const email = `ui-e2e-${role === 'montør' ? 'montoer' : role}-${stamp}${seq > 1 ? `-${seq}` : ''}@harness.test`
    const password = `Ui!${randomBytes(15).toString('base64url')}`
    // Forbigående netværksfejl mod staging ("fetch failed") må ikke vælte en hel batch → op til 3 forsøg med backoff
    let data: Awaited<ReturnType<typeof c.admin.auth.admin.createUser>>['data'] = { user: null }
    let error: Awaited<ReturnType<typeof c.admin.auth.admin.createUser>>['error'] = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        ({ data, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `UI E2E ${role}` } }))
        if (!error || !/fetch failed|network|ECONN|ETIMEDOUT/i.test(error.message)) break
      } catch (e) {
        if (attempt === 3) throw e
      }
      console.log(`[ui-e2e] createUser ${role}: netværksfejl — forsøg ${attempt}/3, venter ${attempt * 3}s`)
      await new Promise((res) => setTimeout(res, attempt * 3000))
    }
    if (error || !data.user) throw new Error(`createUser ${role}: ${error?.message}`)
    users.push({ id: data.user.id, email, password, role })
    const { error: pErr } = await c.admin.from('profiles').update({ role, is_active: true, full_name: `UI E2E ${role}` }).eq('id', data.user.id)
    if (pErr) throw new Error(`profil ${role}: ${pErr.message}`)
    return users[users.length - 1]
  }

  const env: Record<string, string> = { ...(process.env as Record<string, string>), NEXT_PUBLIC_APP_URL: base, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port),
    // N11: staging har RLS 00181 -> montør må starte eget job (prod: flaget er OFF indtil 00181 er godkendt)
    MONTOR_START_JOB_ENABLED: 'true',
    // 00203 (staging only): tilbudsrevisioner
    // UI_OFFER_REVISIONS_ENABLED=false → kør som prod (flag OFF) for regression
    OFFER_REVISIONS_ENABLED: process.env.UI_OFFER_REVISIONS_ENABLED ?? 'true',
    // `next dev` genstarter ved 80 % af heap-grænsen, og efter en genstart fejler resten af kørslen (O1).
    // Mere heap KUN til testserveren (ændrer ikke next.config for andre).
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=3584`.trim() }
  for (const k of NEUTRALIZE) env[k] = ''
  // ADDR-1 (Henrik 2026-10-19): adresseopslag kun i staging-test-tilstand (UI_ADDRESS_LOOKUP=1) — token tilfældigt pr. kørsel
  // (KDS har endnu ingen brugerregistrering); ellers eksplicit slået fra som i prod
  if (process.env.UI_ADDRESS_LOOKUP === '1') {
    env.ADDRESS_LOOKUP_ENABLED = 'true'
    env.ADDRESS_LOOKUP_PROVIDER = 'adressevaelger'
    env.ADDRESS_LOOKUP_TOKEN = `elta-crm-staging-${(await import('crypto')).randomBytes(16).toString('hex')}`
  } else {
    env.ADDRESS_LOOKUP_ENABLED = 'false'
    env.ADDRESS_LOOKUP_TOKEN = ''
  }
  // Lokal, tilfældig CRON_SECRET pr. kørsel (aldrig den rigtige): de interne PDF-ruter (besigtigelse/fuldmagt) kræver den
  // fail-closed — uden den kunne besigtigelse/fuldmagt-PDF aldrig dannes i testen (U189). Ingen cron kører lokalt.
  env.CRON_SECRET = `harness-local-${(await import('crypto')).randomBytes(24).toString('hex')}`

  let server: ChildProcess | null = null
  const serverLog: string[] = []
  const shots = join(tmpdir(), 'elta-ui-e2e')
  mkdirSync(shots, { recursive: true })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const pageErrors: string[] = []
  // Målrettet kørsel: UI_E2E_ONLY=U24,U26 (afhængigheder: U9/U16 kræver U8; U8 kræver U7). Tom = alle.
  const groups = (process.env.UI_E2E_GROUP ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  for (const g of groups) if (!UI_E2E_GROUPS[g]) throw new Error(`ukendt UI_E2E_GROUP '${g}' (${Object.keys(UI_E2E_GROUPS).join('|')})`)
  const onlyEnv = (process.env.UI_E2E_ONLY ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const only = onlyEnv.length ? onlyEnv : [...new Set(groups.flatMap((g) => UI_E2E_GROUPS[g]))]
  // Første gang en valgt test går i gang, logges det — watchdog'en (ui-batches) kan så navngive den test der faktisk
  // hænger (før gættede den på listens rækkefølge, som ikke er kodens rækkefølge)
  const started = new Set<string>()
  const want = (id: string) => {
    const yes = only.length === 0 || only.includes(id)
    if (yes && only.length > 0 && !started.has(id)) { started.add(id); console.log(`[ui-e2e start] ${id}`) }
    return yes
  }
  const loginFailures: string[] = []
  let profitOfferId: string | null = null
  let profitCustomerId: string | null = null
  let cmpSupplierIds: string[] = []
  let ctrlInvoiceId: string | null = null
  let portalOfferId: string | null = null
  let portalTokenId: string | null = null
  let jobEmployeeId: string | null = null
  let jobCaseId: string | null = null
  const uploadedInvoiceIds: string[] = []
  let draftInvoiceId: string | null = null
  let draftCustomerId: string | null = null
  let aoSupplierId: string | null = null
  let siteCaseId: string | null = null
  let searchCustomerId: string | null = null
  let chatTokenId: string | null = null
  let newOfferId: string | null = null
  let u25EmailId: string | null = null
  let billCaseId: string | null = null
  const u27LeadIds: string[] = []
  let u27CustomerId: string | null = null
  let u28: { supplierId?: string; caseId?: string; invoiceId?: string } = {}
  let u29InvoiceId: string | null = null
  let u30: { employeeId?: string; caseId?: string } = {}
  let u31: { employeeId?: string; caseId?: string; woId?: string } = {}
  let u32: { employeeId?: string; caseId?: string; woId?: string } = {}
  let u33InvoiceId: string | null = null
  let u34CaseId: string | null = null
  let u35CaseId: string | null = null
  let u36CaseId: string | null = null
  let u37InvoiceId: string | null = null
  let u37CleanId: string | null = null
  let u38: { supplierId?: string; invoiceId?: string } = {}
  const u39Ids: string[] = []
  let u41: { tokenId?: string; otherCustomerId?: string; invoiceIds?: string[]; companySettingsId?: string; restoreBank?: { id: string; reg: string | null; acc: string | null } } = {}
  let u42: { sourceId?: string; copyId?: string } = {}
  let u43: { employeeIds?: string[]; caseId?: string; woId?: string } = {}
  let u46: { invoiceId?: string; companySettingsId?: string; offerId?: string } = {}
  let u48CaseId: string | null = null
  const u49Ids: string[] = []
  let u50: { tokenId?: string; offerId?: string } = {}
  let u51: { supplierId?: string; offerId?: string } = {}
  let u54OfferId: string | null = null
  let u56TokenId: string | null = null
  let u57OfferId: string | null = null
  const u58Ids: string[] = []
  let u60OfferId: string | null = null
  let u60Since: string | null = null
  let u69TokenId: string | null = null
  const u69TaskIds: string[] = []
  let u74OfferId: string | null = null
  let u77OfferId: string | null = null
  let u78InvoiceId: string | null = null
  let u81OfferId: string | null = null
  let u82SolarIds: string[] = []
  let u83OfferId: string | null = null
  let u83SupplierId: string | null = null
  let u84OfferId: string | null = null
  let u84SupplierId: string | null = null
  let u84PackageId: string | null = null
  let u87OfferId: string | null = null
  let u87SupplierId: string | null = null
  let u88OfferId: string | null = null
  let u89EmployeeId: string | null = null
  let u91InvoiceIds: string[] = []
  let u116InvoiceId: string | null = null
  let u117WorkOrderId: string | null = null
  let u119WorkOrderId: string | null = null
  let u91SeedErr = ''
  let u92InvoiceId: string | null = null
  let u149InvoiceId: string | null = null
  const u120InvoiceIds: string[] = []
  const u120EmailIds: string[] = []
  let u120SupplierId: string | null = null
  const u120SupplierIds: string[] = []
  let u93CustomerId: string | null = null
  let u93OfferId: string | null = null
  let u93EmailId: string | null = null
  let u94InvoiceId: string | null = null
  let u95OfferId: string | null = null
  let u95SupplierId: string | null = null
  let u98CustomerId: string | null = null
  let u98SeedErr = ''
  let u100OfferIds: string[] = []
  let u109OfferId: string | null = null
  let u109TokenId: string | null = null
  let u134OfferId: string | null = null
  let u134TokenId: string | null = null
  let u134DraftId: string | null = null
  let u109InvoiceId: string | null = null
  let u110OfferId: string | null = null
  let u111OfferId: string | null = null
  let u111SupplierId: string | null = null
  let u113EmailIds: string[] = []
  let u122LeadId: string | null = null
  const u128LeadIds: string[] = []
  let u114MessageId: string | null = null
  let u115CustomerIds: string[] = []
  let u77ProductId: string | null = null
  let u77SupplierId: string | null = null
  let u73Diag = ''
  let u74Diag = ''
  let u75ProductId: string | null = null
  const listCaseIds: string[] = []
  const seededEmailIds: string[] = []
  let otherCaseId: string | null = null
  let salgOfferId: string | null = null
  const followupOfferIds: string[] = []

  try {
    const adminUser = await mkUser('admin')
    const montor = await mkUser('montør')
    const salg = await mkUser('salg')

    // Henrik 2026-10-02 (test-politik): `next dev` kompilerer hver side ved første besøg (tilbudssiden >180 s) og
    // brugte op til 3,5 GB heap på en 6 GB-maskine → genstarter/OOM og timer-lange kørsler. Standard er nu et
    // produktionsbuild (`next build` + `next start`): ingen on-demand kompilering, lavt hukommelsesforbrug.
    // UI_E2E_SERVER=dev = gammel adfærd. UI_E2E_REUSE_BUILD=1 = genbrug seneste build (kun når koden er uændret).
    const mode = process.env.UI_E2E_SERVER === 'dev' ? 'dev' : 'start'
    if (mode === 'start' && process.env.UI_E2E_REUSE_BUILD !== '1') {
      const t0 = Date.now()
      console.log('[ui-e2e] next build (staging-env) …')
      // Build-output gemmes (før: stdio ignore → en fejlet build var usynlig, og næste batch fandt intet build).
      // Én genkørsel ved fejl (fx forbigående hukommelsespres); derefter tydelig fejl med de sidste linjer.
      const buildLog = join(tmpdir(), 'elta-ui-e2e', 'next-build.log')
      const runBuild = () => execSync(`${process.platform === 'win32' ? 'npx.cmd' : 'npx'} next build`, {
        cwd: process.cwd(), env: { ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=3072`.trim() },
        stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
      try {
        writeFileSync(buildLog, runBuild())
      } catch (e1) {
        const out1 = String((e1 as { stdout?: Buffer }).stdout ?? '') + String((e1 as { stderr?: Buffer }).stderr ?? '')
        writeFileSync(buildLog, out1)
        console.warn(`[ui-e2e] next build fejlede — prøver igen. Sidste linjer:\n${out1.split('\n').slice(-15).join('\n')}`)
        try {
          writeFileSync(buildLog, runBuild())
        } catch (e2) {
          const out2 = String((e2 as { stdout?: Buffer }).stdout ?? '') + String((e2 as { stderr?: Buffer }).stderr ?? '')
          writeFileSync(buildLog, out2)
          throw new Error(`next build fejlede 2× (log: ${buildLog}):\n${out2.split('\n').slice(-25).join('\n')}`)
        }
      }
      console.log(`[ui-e2e] build færdig på ${Math.round((Date.now() - t0) / 1000)} s`)
    }
    const serverEnv = mode === 'start' ? { ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=1536`.trim() } : env
    server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', mode, '-p', String(port)], { cwd: process.cwd(), env: serverEnv, shell: process.platform === 'win32' })
    server.stdout?.on('data', (d) => serverLog.push(String(d)))
    server.stderr?.on('data', (d) => serverLog.push(String(d)))
    if (!(await waitForHttp(`${base}/login`, 240_000))) {
      return [{ id: 'dev-server', ok: false, note: `startede ikke: ${serverLog.join('').slice(-300)}` }]
    }
    mark = Date.now() // telemetri: første tests tid tæller fra serveren svarer (ikke build/serverstart)

    const login = async (u: { email: string; password: string }) => {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => {
        pageErrors.push(`${new Date().toISOString().slice(11, 19)} ${u.email.split('@')[0].replace(/-\d+$/, '')} @ ${new URL(page.url()).pathname}: ${e.message.replace(/\s+/g, ' ').slice(0, 700)}`)
        // Hydration-fejl: fuld besked (inkl. React-diff) til fil, så årsagen kan findes uden gæt
        if (/hydrat/i.test(e.message)) writeFileSync(join(shots, `hydration-${Date.now()}.txt`), `${page.url()}\n${e.message}\n${e.stack ?? ''}`)
      })
      page.on('console', (m) => { if (m.type() === 'error' && /hydrat/i.test(m.text())) writeFileSync(join(shots, `hydration-console-${Date.now()}.txt`), `${page.url()}
${m.text()}`) })
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools|\[HMR\]|Failed to load resource/.test(m.text())) pageErrors.push(`${new Date().toISOString().slice(11, 19)} ${u.email.split('@')[0].replace(/-\d+$/, '')} @ ${new URL(page.url()).pathname}: ${m.text().replace(/%c/g, '').replace(/background:[^;]*;|color:[^;]*;|border-radius:[^;]*;|light-dark\([^)]*\)\)?;?/g, '').replace(/\s+/g, ' ').trim().slice(0, 260)}`) })
      await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 180_000 })
      // Udfyld EFTER hydrering: React nulstiller kontrollerede felter der blev udfyldt før hydrering (set som tomme
      // felter på login-fejl-skærmbilledet). Verificér værdierne og udfyld igen hvis de er nulstillet.
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.locator('input[type="email"]').fill(u.email)
        await page.locator('input[type="password"]').fill(u.password)
        await page.waitForTimeout(300)
        if ((await page.locator('input[type="email"]').inputValue()) === u.email && (await page.locator('input[type="password"]').inputValue()) === u.password) break
        await page.waitForTimeout(1000)
      }
      await page.locator('button[type="submit"]').click()
      const ok = await page.waitForURL(/\/dashboard/, { timeout: 120_000 }).then(() => true).catch(() => false)
      if (!ok) {
        // Årsag i stedet for gæt: loginsidens fejltekst + skærmbillede
        const why = (await page.locator('[role="alert"], .text-red-600, .text-destructive').allInnerTexts().catch(() => [] as string[])).join(' / ').slice(0, 200)
        loginFailures.push(`${u.email.split('@')[0].replace(/-\d+$/, '')}: url=${new URL(page.url()).pathname} ${why || '(ingen fejltekst)'}`)
        await page.screenshot({ caret: 'initial', path: join(shots, `login-fejl-${Date.now()}.png`), fullPage: true }).catch(() => {})
      }
      return { ctx, page, ok }
    }

    // U156 pilot-review R-5/R-6: logget ud → åbner et sagslink → login → lander på sagslinket (inkl. ?tab=); login-siden
    // viser ALDRIG fritekst fra ?error= (kun kendte koder)
    if (want('U156')) {
      const r: Record<string, boolean> = {}
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
      const page = await ctx.newPage()
      try {
        await page.goto(`${base}/login?error=${encodeURIComponent('Kontoen er spærret, ring 12345678')}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.fritekst_vises_ikke = (await page.getByText('ring 12345678').count()) === 0
        await page.goto(`${base}/login?error=link_expired`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.kendt_kode_vises = (await page.getByText('Linket er ugyldigt eller udløbet').count()) > 0
        await page.goto(`${base}/dashboard/orders?status=open`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sendt_til_login = /\/login/.test(page.url()) && decodeURIComponent(page.url()).includes('redirect=/dashboard/orders?status=open')
        for (let attempt = 0; attempt < 5; attempt++) {
          await page.locator('input[type="email"]').fill(adminUser.email)
          await page.locator('input[type="password"]').fill(adminUser.password)
          await page.waitForTimeout(300)
          if ((await page.locator('input[type="email"]').inputValue()) === adminUser.email) break
          await page.waitForTimeout(1000)
        }
        await page.locator('button[type="submit"]').click()
        await page.waitForURL(/\/dashboard\/orders/, { timeout: 120_000 }).catch(() => {})
        const u = new URL(page.url())
        r.landet_paa_sagslisten = u.pathname === '/dashboard/orders' && u.searchParams.get('status') === 'open'
      } finally { await ctx.close().catch(() => {}) }
      out.push({ id: 'U156 login: deep link + ingen fritekst (R-5/R-6)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // U157 Henrik 2026-10-15: Team viser invitationsstatus — en invitation sendt for >24 t siden står som "Udløbet —
    // gensend", en frisk som "Sendt". Seedes med generateLink (ingen mail); der klikkes IKKE på Gensend (ingen mail).
    if (want('U157')) {
      const r: Record<string, boolean> = {}
      const seeded: string[] = []
      const mk = async (tag: string, sentAt: string) => {
        const email = `ui-e2e-inv-${tag}-${stamp}@example.com`
        const { data } = await c.admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { role: 'montør' } } })
        const id = data?.user?.id
        if (id) {
          seeded.push(id)
          await c.admin.auth.admin.updateUserById(id, { user_metadata: { role: 'montør', invite_sent_at: sentAt, invite_send_count: 2, invite_channel: 'graph' } })
        }
        return email
      }
      const oldMail = await mk('old', new Date(Date.now() - 30 * 3_600_000).toISOString())
      const newMail = await mk('new', new Date(Date.now() - 3_600_000).toISOString())
      const s = await login(adminUser)
      try {
        await s.page.goto(`${base}/dashboard/settings/team`, { waitUntil: 'networkidle', timeout: 180_000 })
        const oldRow = s.page.locator('div.p-4', { hasText: oldMail }).last()
        const newRow = s.page.locator('div.p-4', { hasText: newMail }).last()
        r.gammel_vises = (await oldRow.count()) > 0
        r.gammel_udloebet = (await oldRow.getByTestId('invite-expired').count()) === 1
        r.ny_aktiv = (await newRow.count()) > 0 && (await newRow.getByTestId('invite-expired').count()) === 0
        r.gensendt_tekst = (await newRow.getByText(/Gensendt/).count()) > 0
        r.gensend_knap = (await oldRow.getByRole('button', { name: 'Gensend invitation' }).count()) === 1
      } finally {
        await s.ctx.close().catch(() => {})
        for (const id of seeded) await c.admin.auth.admin.deleteUser(id).catch(() => {})
      }
      out.push({ id: 'U157 team: invitationsstatus (udløbet/gensendt)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // U160 E-9 (fokus E 2026-10-15): kalenderens ugevisning på mobil (375 px) = dag-for-dag-agenda uden vandret sidescroll
    if (want('U160')) {
      const r: Record<string, boolean> = {}
      const s = await login(adminUser)
      try {
        await s.page.setViewportSize({ width: 375, height: 812 })
        await gotoSafe(s.page, `${base}/dashboard/calendar?view=week`, { waitUntil: 'networkidle', timeout: 180_000 })
        await s.page.getByTestId('week-agenda').waitFor({ timeout: 60_000 }).catch(() => {})
        r.agenda_synlig = await s.page.getByTestId('week-agenda').isVisible().catch(() => false)
        r.syv_dage = (await s.page.getByTestId('week-agenda').locator(':scope > div').count()) === 7
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)
        r.ingen_vandret_scroll = overflow <= 2
        await s.page.setViewportSize({ width: 1400, height: 1000 })
        await s.page.waitForTimeout(300)
        r.desktop_tabel = !(await s.page.getByTestId('week-agenda').isVisible().catch(() => true))
        // danske helligdage i ugehovedet (juleugen 2026)
        await gotoSafe(s.page, `${base}/dashboard/calendar?view=week&date=2026-12-25`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.helligdag_vist = (await s.page.getByTestId('calendar-holiday').filter({ hasText: 'Juledag' }).count()) >= 1
        // W-4: sagslisten på mobil = kort uden vandret scroll
        await s.page.setViewportSize({ width: 375, height: 812 })
        await gotoSafe(s.page, `${base}/dashboard/orders`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sager_mobil_kort = await s.page.getByTestId('orders-mobile-list').isVisible().catch(() => false)
        r.sager_mobil_ingen_scroll = (await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)) <= 2
      } finally { await s.ctx.close().catch(() => {}) }
      out.push({ id: 'U160 kalender-uge på mobil = agenda', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // U182 T-5 (review 2026-10-16): "Ny kunde" med en mail der allerede findes (andre bogstaver) → dublet-spørgsmål;
    // Annuller opretter intet, "Opret alligevel" opretter præcis én ny (serveren håndhæver, UI'et spørger)
    if (want('U182')) {
      const r: Record<string, boolean> = {}
      const mail = `u182-${stamp}@harness.test`
      const ex = await c.admin.from('customers').insert([{ customer_number: `U182-${stamp}`, company_name: `[HARNESS] U182 eksisterende ${stamp}`,
        contact_person: 'Eksisterende', email: mail, created_by: adminUser.id }]).select('id')
      const seedErr = ex.data?.[0] ? '' : `SEED: ${ex.error?.message ?? '?'} · `
      const count = async () => ((await c.admin.from('customers').select('id').ilike('email', mail)).data ?? []).length
      const s3 = await login(adminUser)
      const dialogs: string[] = []
      let accept = false
      s3.page.on('dialog', (d) => { dialogs.push(d.message()); void (accept ? d.accept() : d.dismiss()) })
      const fillAndSave = async () => {
        await gotoSafe(s3.page, `${base}/dashboard/customers`, { waitUntil: 'networkidle', timeout: 180_000 })
        await s3.page.getByRole('button', { name: /Ny Kunde/ }).first().click({ timeout: 60_000 })
        await s3.page.getByPlaceholder('Fx Peter Hansen').fill(`[HARNESS] U182 ny ${stamp}`)
        await s3.page.getByPlaceholder('navn@example.dk').fill(`  U182-${stamp}@Harness.TEST `)
        await s3.page.getByRole('button', { name: 'Opret kunde' }).click({ timeout: 30_000 })
        await s3.page.waitForTimeout(2500)
      }
      try {
        await fillAndSave()
        r.spurgt_om_dublet = dialogs.some((m) => /dublet|findes allerede/i.test(m))
        r.annuller_opretter_intet = (await count()) === 1
        accept = true
        await fillAndSave()
        for (let i = 0; i < 10 && (await count()) < 2; i++) await s3.page.waitForTimeout(500)
        r.opret_alligevel_opretter_en = (await count()) === 2
        const { data: rows } = await c.admin.from('customers').select('email').ilike('email', mail)
        r.mail_normaliseret = (rows ?? []).every((x) => (x as { email: string }).email === mail)
      } finally {
        await s3.ctx.close().catch(() => {})
        await c.admin.from('customers').delete().ilike('email', mail)
      }
      out.push({ id: 'U182 kunde-dublet: spørg, annuller, opret alligevel', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
    }

    // U179 T-6/T-7 (review 2026-10-16): leads på telefon (375 px) — listen er en kortliste uden vandret scroll, og tavlen
    // har en statusvælger pr. kort (træk-og-slip virker ikke på touch); flyt Ny → Kontaktet via vælgeren
    if (want('U179')) {
      const r: Record<string, boolean> = {}
      const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] mobil-lead ${stamp}`, contact_person: 'Mobil Kontakt',
        email: `u179-${stamp}@harness.test`, phone: '12345678', status: 'new', source: 'phone', created_by: adminUser.id }]).select('id')
      const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
      const seedErr = leadId ? '' : `SEED: ${ld.error?.message ?? '?'} · `
      const s = await login(adminUser)
      try {
        await s.page.setViewportSize({ width: 375, height: 812 })
        await gotoSafe(s.page, `${base}/dashboard/leads?search=${encodeURIComponent(`mobil-lead ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await s.page.getByTestId('leads-mobile-list').waitFor({ timeout: 60_000 }).catch(() => {})
        r.liste_kort = await s.page.getByTestId('leads-mobile-list').isVisible().catch(() => false)
        r.liste_lead = (await s.page.getByTestId('leads-mobile-list').getByText(`[HARNESS] mobil-lead ${stamp}`).count()) >= 1
        r.liste_ingen_scroll = (await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)) <= 2
        await gotoSafe(s.page, `${base}/dashboard/leads?view=kanban`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.tavle_ingen_scroll = (await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)) <= 2
        const card = s.page.locator('div[draggable="true"]').filter({ hasText: `[HARNESS] mobil-lead ${stamp}` }).first()
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const sel = card.getByTestId('lead-kanban-move')
        r.vaelger_synlig = await sel.isVisible().catch(() => false)
        await sel.selectOption('contacted', { timeout: 30_000 }).catch(() => {})
        let moved = false
        for (let i = 0; i < 20 && !moved; i++) {
          const { data } = await c.admin.from('leads').select('status').eq('id', leadId ?? '').maybeSingle()
          moved = (data as { status?: string } | null)?.status === 'contacted'
          if (!moved) await s.page.waitForTimeout(500)
        }
        r.flyttet_kontaktet = moved
        r.blev_paa_tavlen = !s.page.url().includes(`/dashboard/leads/${leadId}`)
      } finally {
        await s.ctx.close().catch(() => {})
        if (leadId) { await c.admin.from('lead_activities').delete().eq('lead_id', leadId); await c.admin.from('leads').delete().eq('id', leadId) }
      }
      out.push({ id: 'U179 leads på telefon (kortliste + statusvælger)', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
    }

    // U158 fokus C 2026-10-15: prisafvigelser på tværs af leverandørfakturaer — kabel 500 m faktureret 4,45 mod aftalt
    // 4,00 → leverandøren står med 225 kr merbetaling i overblikket (foldet ind; hentes ved åbning)
    if (want('U158')) {
      const r: Record<string, boolean> = {}
      const supName = `HARNESS U158 ${stamp}`
      const sup = await c.admin.from('suppliers').insert([{ name: supName, code: `HU158${stamp}` }]).select('id')
      const supId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
      const sp = supId ? await c.admin.from('supplier_products').insert([{ supplier_id: supId, supplier_sku: `HU158-${stamp}`, supplier_name: 'Kabel', cost_price: 4, unit: 'm' }]).select('id') : null
      const spId = (sp?.data?.[0] as { id?: string } | undefined)?.id ?? null
      const inv = supId ? await c.admin.from('incoming_invoices').insert([{ source: 'manual', supplier_id: supId, invoice_number: `UI-E2E-DEV-${stamp}`,
        invoice_date: new Date().toISOString().slice(0, 10), parse_status: 'parsed', status: 'awaiting_approval', amount_excl_vat: 2225 }]).select('id') : null
      const invId = (inv?.data?.[0] as { id?: string } | undefined)?.id ?? null
      if (invId) await c.admin.from('incoming_invoice_lines').insert([{ incoming_invoice_id: invId, line_number: 1, description: 'Kabel', quantity: 500, unit: 'm', unit_price: 4.45, total_price: 2225, supplier_product_id: spId }])
      const s = await login(adminUser)
      try {
        await gotoSafe(s.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
        const panel = s.page.getByTestId('invoice-deviation-overview')
        r.foldet = (await panel.getByTestId('invoice-deviation-summary').count()) === 0
        await panel.getByTestId('invoice-deviation-toggle').click({ timeout: 60_000 }).catch(() => {})
        await panel.getByTestId('invoice-deviation-summary').waitFor({ timeout: 120_000 }).catch(() => {})
        const supRow = panel.locator('tr', { hasText: supName }).first()
        r.leverandoer_225 = /225,00/.test(((await supRow.innerText().catch(() => '')) ?? ''))
        r.faktura_link = (await panel.getByRole('link', { name: new RegExp(`UI-E2E-DEV-${stamp}`) }).count()) === 1
      } finally {
        await s.ctx.close().catch(() => {})
        if (invId) { await c.admin.from('incoming_invoice_lines').delete().eq('incoming_invoice_id', invId); await c.admin.from('incoming_invoices').delete().eq('id', invId) }
        if (spId) await c.admin.from('supplier_products').delete().eq('id', spId)
        if (supId) await c.admin.from('suppliers').delete().eq('id', supId)
      }
      out.push({ id: 'U158 prisafvigelser på tværs af leverandørfakturaer', ok: !!invId && !!spId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // U22 — S2: login-formularen før hydrering. JS slået fra = værste fald; hverken klik eller Enter må give GET med adgangskoden.
    if (want('U22')) {
      const nojs = await browser.newContext({ viewport: { width: 1400, height: 1000 }, javaScriptEnabled: false })
      const np = await nojs.newPage()
      const secret = `Ikke-i-url-${stamp}`
      await np.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
      await np.locator('input[type="email"]').fill('nojs@harness.test').catch(() => {})
      await np.locator('input[type="password"]').fill(secret).catch(() => {})
      await np.locator('button[type="submit"]').click({ timeout: 5_000, force: true }).catch(() => {})
      await np.waitForTimeout(1500)
      await np.locator('input[type="password"]').press('Enter').catch(() => {})
      await np.waitForTimeout(1500)
      const url = np.url()
      // Produktionsbuild: login-siden prerenderes statisk med Suspense-skelet (useSearchParams) → INGEN formular før
      // hydrering = intet at indsende. Er der en formular (dev), skal den være method=post.
      const forms = await np.locator('form').count().catch(() => 0)
      const method = forms ? ((await np.locator('form').first().getAttribute('method').catch(() => null)) ?? '') : ''
      out.push({ id: 'U22 login før hydrering: adgangskode aldrig i URL', ok: !url.includes(secret) && !/password=/.test(url) && (forms === 0 || method.toLowerCase() === 'post'),
        note: `url=${new URL(url).pathname}${new URL(url).search ? '?…' : ''} · ${forms ? `form method=${method || '(ingen)'}` : 'ingen formular før hydrering (skelet)'}` })
      await nojs.close().catch(() => {})
    }

    // ---- admin
    const a = await login(adminUser)
    out.push({ id: 'U1 admin-login (staging)', ok: a.ok, note: a.ok ? `landede på ${new URL(a.page.url()).pathname}` : `login fejlede (url=${a.page.url()})` })
    if (a.ok) {
      await gotoSafe(a.page, `${base}/dashboard/agents`, { waitUntil: 'networkidle', timeout: 180_000 })
      await a.page.screenshot({ caret: 'initial', path: join(shots, 'agent-inbox-admin.png'), fullPage: true })
      const inbox = {
        heading: await a.page.getByRole('heading', { name: 'Agent Inbox' }).isVisible(),
        planBtn: await a.page.getByRole('button', { name: 'Kør planlægningsagent' }).isVisible(),
        followBtn: await a.page.getByRole('button', { name: 'Kør opfølgningsagent' }).isVisible(),
        disabledBadge: (await a.page.getByText('agent slået fra').count()) > 0,
        errorBoundary: (await a.page.getByText('Der opstod en fejl').count()) > 0,
        noAccess: (await a.page.getByText('Du har ikke adgang').count()) > 0,
      }
      out.push({ id: 'U2 Agent Inbox (admin)', ok: inbox.heading && inbox.planBtn && inbox.followBtn && inbox.disabledBadge && !inbox.errorBoundary && !inbox.noAccess,
        note: Object.entries(inbox).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })

      await gotoSafe(a.page, `${base}/dashboard/pilot-health`, { waitUntil: 'networkidle', timeout: 180_000 })
      await a.page.screenshot({ caret: 'initial', path: join(shots, 'pilot-health-admin.png'), fullPage: true })
      const titles = ['System', 'Crons', 'Brugere', 'Agenter & sikkerhedsflag', 'Incidents', 'Integrationer', 'DB-/sikkerhed (live anon-prober)']
      const seen: string[] = []
      for (const t of titles) if (await a.page.getByRole('heading', { name: t, exact: true }).isVisible()) seen.push(t)
      const failedSections = await a.page.getByText('Kunne ikke hentes').count()
      const liveOff = (await a.page.getByText('OFF (ingen agent-afsendelse mulig)').count()) > 0
      out.push({ id: 'U3 Pilot Health (admin)', ok: seen.length === 7 && failedSections === 0 && liveOff,
        note: `sektioner=${seen.length}/7 · fejlede sektioner=${failedSections} · live-send OFF vist=${liveOff ? 'ja' : 'nej'}` })
      // U7 lønsomhed (Profit Engine): tilbud med timelinje UDEN kost + materiale MED kost -> kortet viser realistisk DB,
      // dom og advarsel om timekost; ingen fejl. Probe-tilbud ryddes i finally.
      // Fælles testkunde for alle blokke (uafhængig af U7, så UI_E2E_ONLY kan køre enkeltblokke)
      const { data: cust } = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-P-${stamp}`, company_name: '[HARNESS] ui-profit', contact_person: 'P', email: `ui-profit-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
      profitCustomerId = (cust?.[0] as { id?: string } | undefined)?.id ?? null
      if (want('U7')) {
        const { data: off } = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-P-${stamp}`, title: '[HARNESS] lønsomhed', created_by: adminUser.id, customer_id: profitCustomerId }]).select('id')
        profitOfferId = (off?.[0] as { id?: string } | undefined)?.id ?? null
        const linesRes = profitOfferId ? await c.admin.from('offer_line_items').insert([
          { offer_id: profitOfferId, position: 1, description: 'Kabel', quantity: 10, unit: 'm', unit_price: 100, total: 1000, cost_price: 60 },
          { offer_id: profitOfferId, position: 2, description: 'Montage', quantity: 8, unit: 'time', unit_price: 600, total: 4800, cost_price: 0 },
        ]) : null
        const seedErr = !profitOfferId ? 'tilbud ikke oprettet' : linesRes?.error ? `linjer: ${linesRes.error.message.slice(0, 80)}` : ''
        await gotoSafe(a.page, `${base}/dashboard/offers/${profitOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 60_000 }).catch(() => {}) // PV8: kost/DB sammenfoldet som standard
        await a.page.getByTestId('offer-profit-card').waitFor({ timeout: 60_000 }).catch(() => {})
        const card = a.page.getByTestId('offer-profit-card')
        const txt = (await card.count()) ? await card.innerText() : ''
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u7-loensomhed.png'), fullPage: true }).catch(() => {})
        const profit = { kort: /Lønsomhed/.test(txt), realistisk: /Realistisk DB/.test(txt), dom: /(Sund lønsomhed|Under mål-DB|Under minimum-DB|Usikker)/.test(txt),
          timekost: /timekost/i.test(txt) }
        out.push({ id: 'U7 lønsomhed på tilbud (admin)', ok: !seedErr && Object.values(profit).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(profit).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U8 grossist-sammenligning: samme EAN billigere hos anden leverandør -> kort med besparelse 200 kr
      if (want('U8')) {
        const ean = `57${String(stamp).slice(-11)}`
        const sAO = await c.admin.from('suppliers').insert([{ name: `HARNESS UI AO ${stamp}`, code: `HUAO${stamp}` }]).select('id')
        const sLM = await c.admin.from('suppliers').insert([{ name: `HARNESS UI LM ${stamp}`, code: `HULM${stamp}` }]).select('id')
        cmpSupplierIds = [sAO.data?.[0]?.id, sLM.data?.[0]?.id].filter(Boolean) as string[]
        const pAO = await c.admin.from('supplier_products').insert([{ supplier_id: cmpSupplierIds[0], supplier_sku: `HU-AO-${stamp}`, supplier_name: 'Stikkontakt', cost_price: 100, ean }]).select('id')
        await c.admin.from('supplier_products').insert([{ supplier_id: cmpSupplierIds[1], supplier_sku: `HU-LM-${stamp}`, supplier_name: 'Stikkontakt', cost_price: 80, ean: `0${ean}` }])
        if (profitOfferId && pAO.data?.[0]?.id) await c.admin.from('offer_line_items').insert([{ offer_id: profitOfferId, position: 3, description: 'Stikkontakt', quantity: 10,
          unit: 'stk', unit_price: 150, total: 1500, cost_price: 100, supplier_product_id: pAO.data[0].id, supplier_cost_price_at_creation: 100 }])
        await gotoSafe(a.page, `${base}/dashboard/offers/${profitOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 60_000 }).catch(() => {}) // PV8: kost/DB sammenfoldet som standard
        await a.page.getByTestId('offer-supplier-savings-card').waitFor({ timeout: 60_000 }).catch(() => {})
        const sc = a.page.getByTestId('offer-supplier-savings-card')
        const stxt = (await sc.count()) ? await sc.innerText() : ''
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u8-grossist.png'), fullPage: true }).catch(() => {})
        const cmp = { kort: /Billigere hos anden grossist/.test(stxt), lm: stxt.includes(`HARNESS UI LM ${stamp}`), besparelse: /200,00 kr/.test(stxt) }
        out.push({ id: 'U8 grossist-sammenligning', ok: Object.values(cmp).every(Boolean), note: Object.entries(cmp).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U9 fakturakontrol: faktura fra AO-probe-leverandøren; linje 1 med varenr. HU-AO (katalog 100) faktureret 110 x 10
      // -> Overpris 100 kr; linje 2 uden match -> ikke kontrollerbar. Dom = Prisafvigelse. Faktura ryddes i finally.
      if (want('U9')) {
        const inv = cmpSupplierIds[0] ? await c.admin.from('incoming_invoices').insert([{ source: 'manual', supplier_id: cmpSupplierIds[0],
          invoice_number: `UI-E2E-IC-${stamp}`, parse_status: 'parsed', status: 'awaiting_approval', amount_excl_vat: 1200 }]).select('id') : null
        ctrlInvoiceId = (inv?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const lr = ctrlInvoiceId ? await c.admin.from('incoming_invoice_lines').insert([
          { incoming_invoice_id: ctrlInvoiceId, line_number: 1, description: 'Stikkontakt', quantity: 10, unit: 'stk', unit_price: 110, total_price: 1100,
            supplier_product_id: null, raw_line: JSON.stringify({ supplier_product_code: `HU-AO-${stamp}` }) },
          { incoming_invoice_id: ctrlInvoiceId, line_number: 2, description: 'Diverse kørsel', quantity: 1, unit: 'stk', unit_price: 100, total_price: 100,
            supplier_product_id: null, raw_line: null },
        ]) : null
        const seedErr = !ctrlInvoiceId ? `faktura ikke oprettet${inv?.error ? `: ${inv.error.message.slice(0, 80)}` : ''}` : lr?.error ? `linjer: ${lr.error.message.slice(0, 80)}` : ''
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${ctrlInvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('invoice-control-verdict').waitFor({ timeout: 60_000 }).catch(() => {})
        const pc = a.page.getByTestId('invoice-control-panel')
        const ptxt = (await pc.count()) ? await pc.innerText() : ''
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u9-fakturakontrol.png'), fullPage: true }).catch(() => {})
        const ic = { panel: /Fakturakontrol/.test(ptxt), dom: /Prisafvigelse/.test(ptxt), overpris: /100,00 kr/.test(ptxt) && /Overpris\b/.test(ptxt),
          match: ptxt.includes(`HU-AO-${stamp}`), daekning: /1 \/ 2 \(50 %\)/.test(ptxt) }
        out.push({ id: 'U9 fakturakontrol (admin)', ok: !seedErr && Object.values(ic).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(ic).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U180 O-4 (review 2026-10-16): portalens tilbudslinjer — sektionsoverskrift vises som overskrift (ikke "0 stk / 0,00 kr"),
      // linjerabat vises, og tilbuddets totaler er uændrede (samme tal som tilbuddet/PDF'en)
      if (want('U180')) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const off = profitCustomerId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-SEC-${stamp}`, title: '[HARNESS] portal-sektion',
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          total_amount: 1500, tax_percentage: 25, tax_amount: 375, final_amount: 1875,
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }]).select('id') : null
        const offId = (off?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const li = offId ? await c.admin.from('offer_line_items').insert([
          { offer_id: offId, position: 1, line_type: 'section', description: `Afsnit el-tavle ${stamp}`, quantity: 0, unit: 'stk', unit_price: 0, discount_percentage: 0, total: 0, cost_price: 0 },
          { offer_id: offId, position: 2, line_type: 'manual', description: 'Stikkontakt', quantity: 2, unit: 'stk', unit_price: 500, discount_percentage: 0, total: 1000, cost_price: 300 },
          { offer_id: offId, position: 3, line_type: 'manual', description: 'Afbryder med rabat', quantity: 1, unit: 'stk', unit_price: 625, discount_percentage: 20, total: 500, cost_price: 200 },
        ]) : null
        const pt = offId ? await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-sec-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id') : null
        const tokId = (pt?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seedErr = !offId ? `tilbud: ${off?.error?.message?.slice(0, 80) ?? '?'} · ` : li?.error ? `linjer: ${li.error.message.slice(0, 80)} · ` : !tokId ? `token: ${pt?.error?.message?.slice(0, 80) ?? '?'} · ` : ''
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        try {
          const kp = await kctx.newPage()
          await gotoSafe(kp, `${base}/portal/${tok}/offers/${offId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const sec = kp.getByTestId('portal-offer-section')
          r.sektion_som_overskrift = (await sec.count()) === 1 && (await sec.innerText().catch(() => '')).includes(`Afsnit el-tavle ${stamp}`)
          const secText = (await sec.innerText().catch(() => '')) || ''
          r.sektion_uden_antal_pris = !/0,00\s*kr|\b0\s*stk/.test(secText)
          r.produktlinjer = (await kp.getByText('Stikkontakt').count()) >= 1 && (await kp.getByText('Afbryder med rabat').count()) >= 1
          r.rabat_vist = (await kp.getByText(/−20 % rabat/).count()) >= 1
          const page = await kp.locator('body').innerText().catch(() => '')
          r.total_uaendret = /1\.875,00/.test(page) && /1\.500,00/.test(page) && /375,00/.test(page)
        } finally {
          await kctx.close().catch(() => {})
          if (offId) { await c.admin.from('offer_line_items').delete().eq('offer_id', offId); await c.admin.from('offers').delete().eq('id', offId) }
          if (tokId) await c.admin.from('portal_access_tokens').delete().eq('id', tokId)
        }
        out.push({ id: 'U180 portal: sektionslinjer som overskrift + linjerabat', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U181 O-1 (review 2026-10-16, Henrik: LIVE BLOCKED): forhåndsvisning af tilbudsrykkere på Indstillinger → Rykkere —
      // viser "slået fra"-besked + opsummering; intet tilbud ændres (reminder_count/last_reminder_sent uændrede)
      if (want('U181')) {
        const r: Record<string, boolean> = {}
        const off = profitCustomerId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-REM-${stamp}`, title: '[HARNESS] rykker-forhåndsvisning',
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10), reminder_count: 0 }]).select('id') : null
        const offId = (off?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seedErr = offId ? '' : `SEED: ${off?.error?.message?.slice(0, 80) ?? '?'} · `
        const s2 = await login(adminUser)
        try {
          await gotoSafe(s2.page, `${base}/dashboard/settings/reminders`, { waitUntil: 'networkidle', timeout: 180_000 })
          await s2.page.getByRole('button', { name: /Vis hvad der ville blive sendt/ }).click({ timeout: 60_000 }).catch(() => {})
          await s2.page.getByTestId('offer-reminder-summary').waitFor({ timeout: 90_000 }).catch(() => {})
          r.opsummering = await s2.page.getByTestId('offer-reminder-summary').isVisible().catch(() => false)
          r.slaaet_fra_vist = await s2.page.getByTestId('offer-reminder-not-live').isVisible().catch(() => false)
          const list = s2.page.getByTestId('offer-reminder-would-send')
          const listed = (await list.count()) ? await list.innerText().catch(() => '') : ''
          const summary = await s2.page.getByTestId('offer-reminder-summary').innerText().catch(() => '')
          // seedet tilbud enten på listen eller over loftet pr. kørsel (staging kan have mange berettigede)
          r.seedet_tilbud_med = listed.includes(`UI-E2E-REM-${stamp}`) || /højst \d+ pr\. kørsel/.test(summary)
          r.ingen_portal_token_i_dom = !/\/portal\/[0-9a-f]{20,}/.test(await s2.page.content().catch(() => ''))
          const { data: after } = offId ? await c.admin.from('offers').select('reminder_count, last_reminder_sent').eq('id', offId).maybeSingle() : { data: null }
          r.tilbud_uaendret = !!after && (after as { reminder_count: number }).reminder_count === 0 && !(after as { last_reminder_sent: string | null }).last_reminder_sent
        } finally {
          await s2.ctx.close().catch(() => {})
          if (offId) await c.admin.from('offers').delete().eq('id', offId)
        }
        out.push({ id: 'U181 forhåndsvisning af tilbudsrykkere (intet sendt)', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U10 kundeportal-accept som kunden oplever det: ny browser-kontekst UDEN CRM-login (fanger AUTH_REQUIRED-fejl
      // der er skjult når personalet tester indlogget). Udgående mail/e-conomic er neutraliseret i dev-serveren.
      if (want('U10')) {
        const tok = randomBytes(32).toString('hex') // portal-tokens er 64-tegns hex (validatePortalToken)
        const off = profitCustomerId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PA-${stamp}`, title: '[HARNESS] portal-accept',
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }]).select('id') : null
        portalOfferId = (off?.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (portalOfferId) await c.admin.from('offer_line_items').insert([{ offer_id: portalOfferId, position: 1, description: 'Stikkontakt', quantity: 2, unit: 'stk', unit_price: 500, total: 1000, cost_price: 300 }])
        const pt = profitCustomerId ? await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id') : null
        portalTokenId = (pt?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seedErr = !portalOfferId ? `tilbud: ${off?.error?.message?.slice(0, 80) ?? 'ikke oprettet'}` : !portalTokenId ? `token: ${pt?.error?.message?.slice(0, 80) ?? 'ikke oprettet'}` : ''

        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        kp.on('pageerror', (e) => pageErrors.push(`kunde: ${e.message.slice(0, 120)}`))
        await kp.goto(`${base}/portal/${tok}/offers/${portalOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const forsteKlik = kp.url().includes(`/offers/${portalOfferId}`)
        const saelgerVist = (await kp.getByText('UI E2E admin').count()) > 0 // N8: ansvarlig sælger i portalen
        const acceptBtn = kp.getByRole('button', { name: 'Accepter tilbud' }).first()
        await acceptBtn.click({ timeout: 30_000 }).catch(() => {})
        const dlg = kp.locator('div.fixed.inset-0').last()
        await dlg.locator('input[type="text"]').first().fill('Harness Kunde').catch(() => {})
        await dlg.locator('input[type="email"]').first().fill(`ui-profit-${stamp}@harness.test`).catch(() => {})
        const box = await dlg.locator('canvas').boundingBox().catch(() => null)
        if (box) {
          await kp.mouse.move(box.x + 20, box.y + 20); await kp.mouse.down()
          await kp.mouse.move(box.x + 120, box.y + 60, { steps: 8 }); await kp.mouse.move(box.x + 220, box.y + 30, { steps: 8 }); await kp.mouse.up()
        }
        await dlg.locator('input[type="checkbox"]').first().check().catch(() => {})
        await dlg.locator('button.bg-green-600').click({ timeout: 15_000 }).catch(() => {})
        await kp.getByText('Der opstod en fejl').waitFor({ timeout: 8_000 }).catch(() => {})
        await kp.waitForLoadState('networkidle').catch(() => {})
        const kundeFejl = (await kp.getByText(/Der opstod en fejl|Kunne ikke acceptere/).count()) > 0
        await kp.screenshot({ caret: 'initial', path: join(shots, 'u10-portal-accept.png'), fullPage: true }).catch(() => {})
        await kctx.close().catch(() => {})

        // Effekter (sag/aktivitet skrives før svaret; tolerér langsom dev-kompilering)
        let offerStatus = '', sag: { id?: string; created_by?: string } | null = null, akt = 0
        for (let i = 0; i < 10; i++) {
          offerStatus = String(((await c.admin.from('offers').select('status').eq('id', portalOfferId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          sag = ((await c.admin.from('service_cases').select('id, created_by').eq('source_offer_id', portalOfferId).maybeSingle()).data as { id?: string; created_by?: string } | null)
          akt = (await c.admin.from('offer_activities').select('id', { count: 'exact', head: true }).eq('offer_id', portalOfferId).eq('activity_type', 'service_case_created')).count ?? 0
          if (offerStatus === 'accepted' && sag && akt) break
          await new Promise((r) => setTimeout(r, 1000))
        }
        // ES-3 (2026-10-17): kontoret ser underskriftsbeviset (navn + billede) på tilbuddet
        let underskriftVist = false
        if (offerStatus === 'accepted') {
          await gotoSafe(a.page, `${base}/dashboard/offers/${portalOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const card = a.page.getByTestId('offer-signature-card')
          await card.waitFor({ timeout: 30_000 }).catch(() => {})
          underskriftVist = (await card.getByText('Harness Kunde').count()) > 0 && (await a.page.getByTestId('offer-signature-image').count()) > 0
        }
        const pa = { forste_klik: forsteKlik, saelger_vist: saelgerVist, ingen_kundefejl: !kundeFejl, accepteret: offerStatus === 'accepted', sag: !!sag?.id,
          saelger_ansvarlig: sag?.created_by === adminUser.id, tidslinje: akt === 1, underskrift_vist: underskriftVist }
        out.push({ id: 'U10 kundeportal-accept (kunde uden login)', ok: !seedErr && Object.values(pa).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(pa).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U12 manuel upload af leverandørfaktura (G8): rigtig PDF via filvælgeren på listen.
      if (want('U12')) {
        const invNo = `UPL${String(stamp).slice(-8)}`
        const pdf = makeTextPdf(['HARNESS Upload-grossist A/S', `Faktura ${invNo}`, `Fakturanummer: ${invNo}`, 'Fakturadato: 01-10-2026',
          'Forfaldsdato: 31-10-2026', 'Beloeb i alt inkl. moms: 1.875,00 DKK', 'Varenr 7654321 Stikkontakt 5 stk'])
        const r: Record<string, boolean> = {}
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('invoice-upload-input').setInputFiles({ name: `faktura-${invNo}.pdf`, mimeType: 'application/pdf', buffer: pdf }).catch(() => {})
        await a.page.waitForURL(/\/dashboard\/incoming-invoices\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => {})
        const firstId = (a.page.url().match(/incoming-invoices\/([0-9a-f-]{36})/) ?? [])[1] ?? null
        if (firstId) uploadedInvoiceIds.push(firstId)
        r.aabnet = !!firstId
        const row = firstId ? ((await c.admin.from('incoming_invoices').select('source, invoice_number, amount_incl_vat, file_url, uploaded_by').eq('id', firstId).maybeSingle()).data as Record<string, any> | null) : null
        r.laest = row?.invoice_number === invNo && Number(row?.amount_incl_vat) === 1875
        r.kilde_upload = row?.source === 'upload' && row?.uploaded_by === adminUser.id
        const filePath = typeof row?.file_url === 'string' && row.file_url.startsWith('attachments/') ? row.file_url.slice('attachments/'.length) : null
        const dl = filePath ? await c.admin.storage.from('attachments').download(filePath) : null
        r.fil_gemt = !!dl?.data && (dl.data.size ?? 0) > 100
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u12-upload-faktura.png'), fullPage: true }).catch(() => {})

        // Samme fil igen -> dublet: åbner den eksisterende, ingen ny række, ingen ekstra fil
        const before = (await c.admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('invoice_number', invNo)).count ?? 0
        const filesBefore = ((await c.admin.storage.from('attachments').list(filePath ? filePath.split('/').slice(0, -1).join('/') : 'supplier-invoices', { limit: 1000 })).data ?? []).length
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('invoice-upload-input').setInputFiles({ name: `faktura-${invNo}-kopi.pdf`, mimeType: 'application/pdf', buffer: pdf }).catch(() => {})
        await a.page.waitForURL(/dublet=1/, { timeout: 120_000 }).catch(() => {})
        const after = (await c.admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('invoice_number', invNo)).count ?? 0
        const filesAfter = ((await c.admin.storage.from('attachments').list(filePath ? filePath.split('/').slice(0, -1).join('/') : 'supplier-invoices', { limit: 1000 })).data ?? []).length
        r.dublet = a.page.url().includes(`${firstId}?dublet=1`) && before === 1 && after === 1 && filesAfter === filesBefore
        out.push({ id: 'U12 upload af leverandørfaktura (admin)', ok: Object.values(r).every(Boolean),
          note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U15 fakturakladde (N5)
      if (want('U15')) {
        const r: Record<string, boolean> = {}
        const dc = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-D-${stamp}`, company_name: '[HARNESS] kladdekunde', contact_person: 'D',
          email: '' /* NOT NULL: "ingen mail" = tom streng */, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        draftCustomerId = (dc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (draftCustomerId) await c.admin.from('customer_contacts').insert([{ customer_id: draftCustomerId, name: 'Bogholder', email: `bogholder-${stamp}@harness.test`, role: 'billing' }])
        const di = draftCustomerId ? await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-K-${stamp}`, customer_id: draftCustomerId, status: 'draft',
          total_amount: 1000, tax_amount: 250, final_amount: 1250 }]).select('id') : null
        draftInvoiceId = (di?.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (draftInvoiceId) await c.admin.from('invoice_lines').insert([{ invoice_id: draftInvoiceId, position: 1, description: 'Montage', quantity: 2, unit: 'stk', unit_price: 500, total_price: 1000 }])
        const seedErr = !draftInvoiceId ? `faktura: ${di?.error?.message ?? dc.error?.message ?? '?'}` : ''

        await gotoSafe(a.page, `${base}/dashboard/invoices/${draftInvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const sendBtn = a.page.getByRole('button', { name: /Send faktura på mail/ }).first()
        await a.page.waitForFunction(() => !!document.querySelector('[title*="faktura-kontakt"]'), null, { timeout: 60_000 }).catch(() => {})
        r.modtager_fakturakontakt = (await sendBtn.count()) > 0 && (await sendBtn.isEnabled()) && /faktura-kontakt/.test((await sendBtn.getAttribute('title')) ?? '')

        const ed = a.page.getByTestId('draft-lines-editor')
        await ed.getByTestId('draft-edit').first().click({ timeout: 30_000 }).catch(() => {})
        await ed.getByTestId('draft-edit-price').fill('600').catch(() => {})
        await ed.getByTestId('draft-edit-save').click().catch(() => {})
        const waitTotals = async (want: number) => {
          for (let i = 0; i < 15; i++) {
            const t = ((await c.admin.from('invoices').select('total_amount, tax_amount, final_amount').eq('id', draftInvoiceId).maybeSingle()).data ?? {}) as Record<string, number>
            if (Number(t.total_amount) === want) return t
            await new Promise((res) => setTimeout(res, 1000))
          }
          return ((await c.admin.from('invoices').select('total_amount, tax_amount, final_amount').eq('id', draftInvoiceId).maybeSingle()).data ?? {}) as Record<string, number>
        }
        const t1 = await waitTotals(1200)
        r.pris_rettet = Number(t1.total_amount) === 1200 && Number(t1.tax_amount) === 300 && Number(t1.final_amount) === 1500
        await ed.getByTestId('draft-add-description').fill('Kørsel').catch(() => {})
        await ed.getByTestId('draft-add-quantity').fill('1').catch(() => {})
        await ed.getByTestId('draft-add-price').fill('250').catch(() => {})
        await ed.getByTestId('draft-add-submit').click().catch(() => {})
        const t2 = await waitTotals(1450)
        r.linje_tilfoejet = Number(t2.total_amount) === 1450 && Number(t2.final_amount) === 1812.5
        // Vent på at den nye linje er vist, og slet præcis den (ikke "sidste række" — race mod genindlæsning)
        const koersel = ed.locator('tr', { hasText: 'Kørsel' })
        await koersel.first().waitFor({ timeout: 60_000 }).catch(() => {})
        a.page.once('dialog', (dlg) => dlg.accept().catch(() => {}))
        await koersel.first().getByTestId('draft-delete').click({ timeout: 30_000 }).catch(() => {})
        const t3 = await waitTotals(1200) // den tilføjede kørsel slettes igen
        r.linje_slettet = Number(t3.total_amount) === 1200 && Number(t3.final_amount) === 1500
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u15-fakturakladde.png'), fullPage: true }).catch(() => {})
        // audit-skrivningen efter sidste sletning kan lande et øjeblik efter UI'et — vent op til 10 s (før: race → flaky)
        let audits = 0
        for (let i = 0; i < 10 && audits < 3; i++) {
          audits = draftInvoiceId ? (await c.admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('entity_id', draftInvoiceId)).count ?? 0 : 0
          if (audits < 3) await a.page.waitForTimeout(1000)
        }
        r.audit = audits >= 3
        out.push({ id: 'U15 fakturakladde (admin)', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U16 e-conomic-opsætning (N12) — kun opsætning, ingen bogføring
      const u16Diag: string[] = []
      if (want('U16') && (cmpSupplierIds[0])) {
        const r: Record<string, boolean> = {}
        const supId = cmpSupplierIds[0]
        const saveNo = async (value: string) => {
          await gotoSafe(a.page, `${base}/dashboard/settings/suppliers/${supId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: 'Rediger' }).first().click({ timeout: 60_000 }).catch(() => {})
          await a.page.locator('#economic_supplier_number').fill(value).catch(() => {})
          const editCount = await a.page.getByRole('button', { name: 'Rediger' }).count()
          const fieldCount = await a.page.locator('#economic_supplier_number').count()
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click().catch(() => {})
          await a.page.waitForTimeout(2500)
          const dlg = ((await a.page.locator('[role="dialog"]').first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160)
          u16Diag.push(`${value}: rediger=${editCount} felt=${fieldCount} dialog="${dlg}"`)
          await a.page.screenshot({ path: join(shots, `u16-${value}.png`), fullPage: false }).catch(() => {})
          return ((await c.admin.from('suppliers').select('external_supplier_id, external_provider').eq('id', supId).maybeSingle()).data ?? {}) as Record<string, string | null>
        }
        // unikt nr. pr. kørsel (uq_suppliers_external: nr. må kun bruges af én leverandør)
        const ecoNo = `7${String(stamp).slice(-6)}`
        const ok1 = await saveNo(ecoNo)
        r.leverandoernr_gemt = ok1.external_supplier_id === ecoNo && ok1.external_provider === 'economic'
        const bad = await saveNo('abc')
        r.ugyldigt_afvist = bad.external_supplier_id === ecoNo
        // dublet: nummeret er allerede brugt af en anden leverandør → præcis besked (før: "kode eksisterer allerede")
        if (cmpSupplierIds[1]) {
          const otherNo = `8${String(stamp).slice(-6)}`
          await c.admin.from('suppliers').update({ external_supplier_id: otherNo, external_provider: 'economic' }).eq('id', cmpSupplierIds[1])
          await saveNo(otherNo)
          r.dublet_besked = (await a.page.getByText('e-conomic-leverandørnummeret bruges allerede af en anden leverandør').count()) > 0
        }
        await gotoSafe(a.page, `${base}/dashboard/settings/economic`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = a.page.getByTestId('economic-readiness')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.count()) ? await card.innerText() : ''
        r.tjekliste = /Klar til bogføring/.test(txt) && /Omkostningskonto/.test(txt) && /Kassekladde/.test(txt) && /Leverandører koblet/.test(txt) && /Kundefakturaer/.test(txt)
        // PR-2: kill-switch fra (standard; NEUTRALIZE fjerner også variablen) → tydelig pause-besked
        r.pause_vist = (await a.page.getByTestId('economic-push-paused').count()) === 1
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u16-economic.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U16 e-conomic-opsætning (admin)', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${u16Diag.join(' | ')}` })
      }

      // U17 AO-prisfil-import (ISO-8859-1). Kræver en leverandør med kode 'AO' (AO-konfiguration vælges på koden).
      if (want('U17')) {
        const r: Record<string, boolean> = {}
        let existingAo = (await c.admin.from('suppliers').select('id, name, created_at').ilike('code', 'AO').maybeSingle()).data as { id?: string; name?: string | null; created_at?: string | null } | null
        let note = ''
        // Test-pålidelighed (2026-10-20): en AO-leverandør fra en AFBRUDT harness-kørsel (oprydningen i den globale finally
        // nåede aldrig at køre) blokerede U17 for altid. Kun en [HARNESS]-rest ældre end 1 time ryddes; en rigtig
        // AO-leverandør røres stadig aldrig.
        if (existingAo?.id && String(existingAo.name ?? '').startsWith('[HARNESS]') && existingAo.created_at && Date.now() - Date.parse(existingAo.created_at) > 3600_000) {
          const staleId = existingAo.id
          const { data: ps } = await c.admin.from('supplier_products').select('id').eq('supplier_id', staleId)
          const pids = ((ps ?? []) as Array<{ id: string }>).map((x) => x.id)
          if (pids.length) await c.admin.from('price_history').delete().in('supplier_product_id', pids)
          await c.admin.from('supplier_products').delete().eq('supplier_id', staleId)
          await c.admin.from('import_batches').delete().eq('supplier_id', staleId)
          await c.admin.from('supplier_settings').delete().eq('supplier_id', staleId)
          const del = await c.admin.from('suppliers').delete().eq('id', staleId)
          if (!del.error) existingAo = null
          else note = `gammel harness-AO kunne ikke ryddes: ${del.error.message.slice(0, 80)}`
        }
        if (existingAo?.id && !note) note = 'staging har allerede en AO-leverandør — springer over for ikke at røre dens data'
        if (!existingAo?.id && !note) {
          const ins = await c.admin.from('suppliers').insert([{ name: `[HARNESS] AO ${stamp}`, code: 'AO' }]).select('id')
          aoSupplierId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
          const sku = `HAO${String(stamp).slice(-7)}`
          const csv = (price: string) => Buffer.from(['Varenummer;Beskrivelse;Indkøbspris;Vejl. udsalgspris;Enhed;Varegruppe;EAN;Leverandør',
            `${sku};Kabel 3x1,5 mørkegrå Ærø;${price};19,95;M;Kabler;5790000${String(stamp).slice(-6)};Nexans`].join('\r\n') + '\r\n', 'latin1')
          const runImport = async (price: string, name: string) => {
            await gotoSafe(a.page, `${base}/dashboard/settings/suppliers/${aoSupplierId}/import`, { waitUntil: 'networkidle', timeout: 180_000 })
            await a.page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'text/csv', buffer: csv(price) }).catch(() => {})
            await a.page.getByRole('button', { name: 'Kør import' }).waitFor({ timeout: 90_000 }).catch(() => {})
            await a.page.getByRole('button', { name: 'Kør import' }).click().catch(() => {})
            for (let i = 0; i < 30; i++) {
              const p0 = (await c.admin.from('supplier_products').select('id, supplier_name, cost_price').eq('supplier_id', aoSupplierId).eq('supplier_sku', sku).maybeSingle()).data as { id?: string; supplier_name?: string; cost_price?: number } | null
              if (p0 && Number(p0.cost_price) === Number(price.replace(',', '.'))) return p0
              await new Promise((res) => setTimeout(res, 1000))
            }
            return (await c.admin.from('supplier_products').select('id, supplier_name, cost_price').eq('supplier_id', aoSupplierId).eq('supplier_sku', sku).maybeSingle()).data as { id?: string; supplier_name?: string; cost_price?: number } | null
          }
          const p1 = await runImport('12,50', 'ao-pris-1.csv')
          r.oprettet = !!p1?.id && Number(p1.cost_price) === 12.5
          r.aeoeaa_korrekt = p1?.supplier_name === 'Kabel 3x1,5 mørkegrå Ærø'
          await a.page.screenshot({ caret: 'initial', path: join(shots, 'u17-ao-import.png'), fullPage: true }).catch(() => {})
          const p2 = await runImport('13,75', 'ao-pris-2.csv')
          r.pris_opdateret = Number(p2?.cost_price) === 13.75
          const hist = p1?.id ? (await c.admin.from('price_history').select('id', { count: 'exact', head: true }).eq('supplier_product_id', p1.id)).count ?? 0 : 0
          r.prishistorik = hist >= 1
        }
        out.push({ id: 'U17 AO-prisfil-import (ISO-8859-1)', ok: !note && Object.values(r).every(Boolean), note: note || Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U18 stedinfo (N9b)
      if (want('U18') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: '[HARNESS] stedinfo', customer_id: profitCustomerId, status: 'new', priority: 'medium',
          source: 'manual', created_by: adminUser.id, address: 'Odinsvej 10', postal_code: '4100', city: 'Ringsted' }]).select('id')
        siteCaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const openAndSave = async (ksr: string) => {
          await gotoSafe(a.page, `${base}/dashboard/orders/${siteCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('edit-site-info').click({ timeout: 60_000 }).catch(() => {})
          await a.page.getByTestId('site-ksr').fill(ksr).catch(() => {})
          await a.page.getByTestId('site-ean').fill('5790000000001').catch(() => {})
          await a.page.getByTestId('site-phone').fill('+45 22 33 44 55').catch(() => {})
          await a.page.getByRole('button', { name: 'Gem', exact: true }).click().catch(() => {})
          await a.page.waitForTimeout(2500)
          return ((await c.admin.from('service_cases').select('ksr_number, ean_number, contact_phone').eq('id', siteCaseId).maybeSingle()).data ?? {}) as Record<string, string | null>
        }
        const bad = await openAndSave('12')
        await a.page.getByText('KSR-nummer skal være 6-10 cifre').waitFor({ timeout: 20_000 }).catch(() => {})
        r.ugyldigt_ksr_afvist = bad.ksr_number == null && (await a.page.getByText('KSR-nummer skal være 6-10 cifre').count()) > 0
        const good = await openAndSave('1234 567')
        r.gemt = good.ksr_number === '1234567' && good.ean_number === '5790000000001' && good.contact_phone === '+45 22 33 44 55'
        await gotoSafe(a.page, `${base}/dashboard/orders/${siteCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const nav = a.page.getByTestId('order-navigate')
        r.naviger = (await nav.count()) === 1 && /google\.com\/maps\/dir\/.*destination=/.test((await nav.getAttribute('href')) ?? '')
        out.push({ id: 'U18 stedinfo på ordresiden (admin)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U19 søgning med komma/parentes (sikre PostgREST-filtre)
      if (want('U19')) {
        const r: Record<string, boolean> = {}
        const name = `Hansen, Jens (VVS) 3x1,5 ${stamp}`
        const ins = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-S-${stamp}`, company_name: name, contact_person: 'Søg',
          email: `soeg-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        searchCustomerId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        for (const [k, q] of [['komma_parentes', `Hansen, Jens (VVS)`], ['kabeldimension', `3x1,5 ${stamp}`]] as const) {
          await gotoSafe(a.page, `${base}/dashboard/customers?search=${encodeURIComponent(q)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r[k] = (await a.page.getByText(name).count()) > 0
        }
        out.push({ id: 'U19 søgning med komma/parentes', ok: !!searchCustomerId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U20 sagsliste (N9c)
      if (want('U20') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const tag = `LST${stamp}`
        for (const [type, priority] of [['installation', 'urgent'], ['service', 'medium']] as const) {
          const ins = await c.admin.from('service_cases').insert([{ title: `[HARNESS] ${tag} ${type}`, customer_id: profitCustomerId, status: 'new',
            priority, type, source: 'manual', created_by: adminUser.id }]).select('id')
          const id = (ins.data?.[0] as { id?: string } | undefined)?.id
          if (id) listCaseIds.push(id)
        }
        await gotoSafe(a.page, `${base}/dashboard/orders?search=${tag}&type=installation`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.type_filtrerer = (await a.page.getByText(`[HARNESS] ${tag} installation`).count()) > 0 && (await a.page.getByText(`[HARNESS] ${tag} service`).count()) === 0
        r.haster_maerke = (await a.page.getByTestId('order-priority').filter({ hasText: 'Haster' }).count()) > 0
        const opts = await a.page.locator('select').first().locator('option').allInnerTexts()
        r.statustaellere = opts.some((o) => /^Alle \(\d+\)$/.test(o.trim())) && opts.some((o) => /\(\d+\)$/.test(o.trim()) && !o.startsWith('Alle'))
        out.push({ id: 'U20 sagsliste: type, prioritet, tællere', ok: listCaseIds.length === 2 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U149 L-7 (leverandørfaktura-review 2026-10-14): ret fakturahovedet — Momsgrundlag-fejlen (ekskl./moms byttet)
      // rettes, gemmes og auditeres; inkonsistente beløb afvises med besked; knappen findes ikke på godkendte fakturaer
      if (want('U149')) {
        const r: Record<string, boolean> = {}
        const ii = await c.admin.from('incoming_invoices').insert([{ source: 'upload', status: 'received', parse_status: 'parsed',
          file_name: `u149-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'HARNESS U149', file_hash: `u149-${stamp}`,
          supplier_name_extracted: `[HARNESS] U149 ${stamp}`, invoice_number: `HV149-${stamp}`, currency: 'DKK',
          amount_excl_vat: 250, vat_amount: 1000, amount_incl_vat: 1250, requires_manual_review: true }]).select('id')
        u149InvoiceId = (ii.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u149InvoiceId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('header-edit-open').click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('header-amount-excl').fill('800,00').catch(() => {})
        await a.page.getByTestId('header-edit-save').click({ timeout: 15_000 }).catch(() => {})
        await a.page.getByTestId('header-edit-error').waitFor({ timeout: 30_000 }).catch(() => {})
        r.inkonsistent_afvist = (await a.page.getByTestId('header-edit-error').count()) > 0
        await a.page.getByTestId('header-amount-excl').fill('1.000,00').catch(() => {})
        await a.page.getByTestId('header-vat').fill('250,00').catch(() => {})
        await a.page.getByTestId('header-edit-save').click({ timeout: 15_000 }).catch(() => {})
        await a.page.getByTestId('invoice-header-edit').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
        type HR = { amount_excl_vat: number | null; vat_amount: number | null; amount_incl_vat: number | null }
        const row = (await c.admin.from('incoming_invoices').select('amount_excl_vat, vat_amount, amount_incl_vat').eq('id', u149InvoiceId ?? '').maybeSingle()).data as HR | null
        r.gemt = Number(row?.amount_excl_vat) === 1000 && Number(row?.vat_amount) === 250 && Number(row?.amount_incl_vat) === 1250
        const aud = ((await c.admin.from('incoming_invoice_audit_log').select('action, previous_value').eq('incoming_invoice_id', u149InvoiceId ?? '')).data ?? []) as Array<{ action: string; previous_value: Record<string, unknown> | null }>
        r.audit = aud.some((x) => x.action === 'header_edited' && Number(x.previous_value?.amount_excl_vat) === 250)
        await c.admin.from('incoming_invoices').update({ status: 'approved' }).eq('id', u149InvoiceId ?? '')
        await a.page.reload({ waitUntil: 'networkidle' }).catch(() => {})
        await a.page.getByText('Parsede felter').first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.laast_efter_godkendelse = (await a.page.getByTestId('header-edit-open').count()) === 0
        out.push({ id: 'U149 ret leverandørfakturahoved (L-7)', ok: !!u149InvoiceId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${row?.amount_excl_vat ?? '-'}/${row?.vat_amount ?? '-'}/${row?.amount_incl_vat ?? '-'}` })
      }

      // U148 (00220, Henrik 2026-10-10): notifikationsindstillinger — standard fra; push + daglig opsummering "ikke
      // tilgængelig"; valget gemmes og huskes (det er det, afsenderne læser)
      if (want('U148')) {
        const r: Record<string, boolean> = {}
        await c.admin.from('profiles').update({ notification_preferences: {} }).eq('id', adminUser.id)
        await gotoSafe(a.page, `${base}/dashboard/settings/notifications`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.push_ikke_tilgaengelig = (await a.page.getByTestId('notify-new_lead-push-na').count()) > 0
        r.daglig_ikke_tilgaengelig = (await a.page.getByTestId('notify-daily_summary-email-na').count()) > 0
        r.standard_fra = ((await a.page.getByTestId('notify-offer_signed-email').getAttribute('aria-label').catch(() => '')) ?? '').endsWith(' fra')
        await a.page.getByTestId('notify-offer_signed-email').click({ timeout: 15_000 }).catch(() => {})
        await a.page.getByRole('button', { name: /Gem indstillinger/ }).click({ timeout: 15_000 }).catch(() => {})
        await a.page.waitForTimeout(2000)
        const { data: prof } = await c.admin.from('profiles').select('notification_preferences').eq('id', adminUser.id).single()
        const prefs = (prof as { notification_preferences: Record<string, { email?: boolean; push?: boolean }> } | null)?.notification_preferences ?? {}
        r.gemt_i_db = prefs.offer_signed?.email === true && prefs.new_lead?.email !== true && prefs.daily_summary?.email !== true && prefs.new_lead?.push !== true
        await gotoSafe(a.page, `${base}/dashboard/settings/notifications`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.husket_efter_genindlaesning = ((await a.page.getByTestId('notify-offer_signed-email').getAttribute('aria-label').catch(() => '')) ?? '').endsWith(' til')
        await c.admin.from('profiles').update({ notification_preferences: {} }).eq('id', adminUser.id)
        out.push({ id: 'U148 notifikationsindstillinger (00220)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U23 portal-chat begge veje (kunde uden login ↔ sælger)
      if (want('U23') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        chatTokenId = (pt.data?.[0] as { id?: string } | undefined)?.id ?? null
        const kundeTekst = `Hej fra kunden ${stamp}`
        const saelgerTekst = `Svar fra sælger ${stamp}`
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        kp.on('pageerror', (e) => pageErrors.push(`kunde-chat: ${e.message.slice(0, 120)}`))
        await kp.goto(`${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await kp.getByText('Beskeder', { exact: true }).first().click({ timeout: 60_000 }).catch(() => {})
        const pdf = makeTextPdf(['Billede af tavlen', 'Harness'])
        await kp.locator('input[type="file"]').last().setInputFiles({ name: 'tavle.pdf', mimeType: 'application/pdf', buffer: pdf }).catch(() => {})
        await kp.getByText('tavle.pdf').first().waitFor({ timeout: 60_000 }).catch(() => {}) // upload færdig (send er blokeret imens)
        await kp.getByPlaceholder('Skriv en besked...').fill(kundeTekst).catch(() => {})
        await kp.getByPlaceholder('Skriv en besked...').press('Enter').catch(() => {})
        let msgRow: { id?: string; attachments?: unknown } | null = null
        for (let i = 0; i < 20 && !msgRow; i++) {
          msgRow = ((await c.admin.from('portal_messages').select('id, attachments').eq('customer_id', profitCustomerId).ilike('message', `%${kundeTekst}%`).maybeSingle()).data as { id?: string; attachments?: unknown } | null)
          if (!msgRow) await new Promise((res) => setTimeout(res, 1000))
        }
        r.kunde_sendt = !!msgRow?.id
        r.kunde_bilag = Array.isArray(msgRow?.attachments) && (msgRow!.attachments as unknown[]).length === 1

        // Sælger på kundekortet
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: 'Åbn chat' }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByText(kundeTekst).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.saelger_ser_besked = (await a.page.getByText(kundeTekst).count()) > 0
        r.saelger_ser_bilag = (await a.page.getByText('tavle.pdf').count()) > 0
        await a.page.getByPlaceholder('Skriv en besked...').last().fill(saelgerTekst).catch(() => {})
        await a.page.getByPlaceholder('Skriv en besked...').last().press('Enter').catch(() => {})
        let svar = false
        for (let i = 0; i < 20 && !svar; i++) {
          svar = ((await c.admin.from('portal_messages').select('id', { count: 'exact', head: true }).eq('customer_id', profitCustomerId).ilike('message', `%${saelgerTekst}%`)).count ?? 0) === 1
          if (!svar) await new Promise((res) => setTimeout(res, 1000))
        }
        r.saelger_svaret = svar

        // Kunden ser svaret
        await kp.goto(`${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await kp.getByText('Beskeder', { exact: true }).first().click({ timeout: 60_000 }).catch(() => {})
        await kp.getByText(saelgerTekst).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.kunde_ser_svar = (await kp.getByText(saelgerTekst).count()) > 0
        await kp.screenshot({ caret: 'initial', path: join(shots, 'u23-portal-chat.png'), fullPage: true }).catch(() => {})
        await kctx.close().catch(() => {})
        out.push({ id: 'U23 portal-chat kunde ↔ sælger', ok: !!chatTokenId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U24 nyt tilbud fra bunden (salgets kerneflow)
      if (want('U24') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] nyt tilbud ${stamp}`
        await gotoSafe(a.page, `${base}/dashboard/offers`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Nyt Tilbud/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.locator('#title').fill(title).catch(() => {})
        // N14: søgbar kundevælger — søg på kundenummer og vælg træffet
        await a.page.locator('#customer_id').fill(`UI-E2E-P-${stamp}`).catch(() => {})
        await a.page.getByTestId('customer-picker-option').first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByRole('button', { name: 'Opret tilbud' }).click().catch(() => {})
        await a.page.waitForURL(/\/dashboard\/offers\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => {})
        newOfferId = (a.page.url().match(/offers\/([0-9a-f-]{36})/) ?? [])[1] ?? null
        r.oprettet = !!newOfferId
        await a.page.getByRole('button', { name: 'Tilføj linje' }).first().click({ timeout: 60_000 }).catch(() => {})
        const desc = a.page.locator('input[placeholder="Beskrivelse..."]').last()
        await desc.waitFor({ timeout: 30_000 }).catch(() => {})
        const row = desc.locator('xpath=ancestor::tr[1]')
        await desc.fill('Stikkontakt montage').catch(() => {})
        await row.locator('input[type="number"]').first().fill('4').catch(() => {})
        await row.locator('input[type="number"]').last().fill('250').catch(() => {})
        await row.locator('input[type="number"]').last().press('Tab').catch(() => {})
        let line: Record<string, number | string> | null = null
        let off: Record<string, number> | null = null
        for (let i = 0; i < 20; i++) {
          line = ((await c.admin.from('offer_line_items').select('description, quantity, unit_price, total').eq('offer_id', newOfferId).maybeSingle()).data as Record<string, number | string> | null)
          off = ((await c.admin.from('offers').select('total_amount, final_amount').eq('id', newOfferId).maybeSingle()).data as Record<string, number> | null)
          if (line && Number(line.total) === 1000 && Number(off?.total_amount) === 1000) break
          await new Promise((res) => setTimeout(res, 1000))
        }
        r.linje_gemt = line?.description === 'Stikkontakt montage' && Number(line?.quantity) === 4 && Number(line?.unit_price) === 250 && Number(line?.total) === 1000
        r.totaler = Number(off?.total_amount) === 1000 && Number(off?.final_amount) === 1250
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u24-nyt-tilbud.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U24 nyt tilbud fra bunden', ok: Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · total=${off?.total_amount}/${off?.final_amount}` })
      }

      // U25 mail → sag (mail/indbakke, GO-LIVE)
      if (want('U25') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const subject = `[HARNESS] Fejl på inverter ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: `ui-profit-${stamp}@harness.test`, sender_name: 'Harness Kunde', subject,
          body_text: 'Inverteren viser fejl 41. Kan I komme forbi?', customer_id: profitCustomerId, link_status: 'linked', received_at: new Date().toISOString(),
          is_archived: false }]).select('id')
        u25EmailId = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/mail?emailId=${u25EmailId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: 'Opret sag', exact: true }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?tab=mails/, { timeout: 120_000 }).catch(() => {})
        const caseId = (a.page.url().match(/orders\/([0-9a-f-]{36})/) ?? [])[1] ?? null
        r.lander_paa_sag = !!caseId
        await a.page.getByText(subject).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.mail_vist_paa_sag = (await a.page.getByText(subject).count()) > 0
        const linked = u25EmailId ? ((await c.admin.from('incoming_emails').select('service_case_id').eq('id', u25EmailId).maybeSingle()).data as { service_case_id?: string } | null) : null
        r.mail_koblet = !!caseId && linked?.service_case_id === caseId
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u25-mail-til-sag.png'), fullPage: true }).catch(() => {})
        if (caseId) listCaseIds.push(caseId) // ryddes sammen med U20's sager
        out.push({ id: 'U25 mail → sag', ok: !!u25EmailId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U26 fakturering fra sagen (faktura, GO-LIVE)
      if (want('U26') && (profitCustomerId)) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] fakturering ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId }]).select('id')
        billCaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const mat = billCaseId ? await c.admin.from('case_materials').insert([{ case_id: billCaseId, description: `Kabel 3x1,5 ${stamp}`, quantity: 10, unit: 'm',
          unit_cost: 5, unit_sales_price: 12, billable: true /* totaler er genererede kolonner */, source: 'manual', created_by: adminUser.id }]).select('id') : null
        const matId = (mat?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seedErr = !billCaseId ? `sag: ${sc.error?.message}` : !matId ? `materiale: ${mat?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${billCaseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        const btn = a.page.getByRole('button', { name: /Opret del-faktura/ }).first()
        await btn.waitFor({ timeout: 90_000 }).catch(() => {})
        await btn.click({ timeout: 30_000 }).catch(() => {})
        let inv: { id?: string; status?: string; total_amount?: number } | null = null
        for (let i = 0; i < 20 && !inv; i++) {
          inv = ((await c.admin.from('invoices').select('id, status, total_amount').eq('case_id', billCaseId).maybeSingle()).data as { id?: string; status?: string; total_amount?: number } | null)
          if (!inv) await new Promise((res) => setTimeout(res, 1000))
        }
        for (let i = 0; i < 15 && inv?.id && !(Number(inv.total_amount) > 0); i++) {
          await new Promise((res) => setTimeout(res, 1000))
          inv = ((await c.admin.from('invoices').select('id, status, total_amount').eq('id', inv.id).maybeSingle()).data as typeof inv)
        }
        r.kladde_oprettet = inv?.status === 'draft'
        r.beloeb = Number(inv?.total_amount) === 120
        const lines = inv?.id ? ((await c.admin.from('invoice_lines').select('id, source_case_material_id, total_price').eq('invoice_id', inv.id)).data ?? []) as Array<{ id: string; source_case_material_id: string | null; total_price: number }> : []
        r.linje_fra_materiale = lines.length === 1 && lines[0].source_case_material_id === matId && Number(lines[0].total_price) === 120
        const locked = matId ? ((await c.admin.from('case_materials').select('invoice_line_id').eq('id', matId).maybeSingle()).data as { invoice_line_id?: string } | null) : null
        r.materiale_laast = !!lines[0] && locked?.invoice_line_id === lines[0].id
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u26-fakturering.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U26 fakturering fra sagen', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U27 lead → kunde
      if (want('U27')) {
        const r: Record<string, boolean> = {}
        const mail = `lead-${stamp}@harness.test`
        for (const n of [1, 2]) {
          const ins = await c.admin.from('leads').insert([{ company_name: `[HARNESS] Lead ${n} ${stamp}`, contact_person: `Kontakt ${n}`, email: mail,
            status: 'qualified', source: 'website', created_by: adminUser.id }]).select('id')
          const id = (ins.data?.[0] as { id?: string } | undefined)?.id
          if (id) u27LeadIds.push(id)
        }
        // W-2: et tilbud på lead 1 uden kunde → får kunden ved konvertering; før: tilbudssiden siger at kunden mangler
        const lo = u27LeadIds[0] ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-LO-${stamp}`, title: `[HARNESS] leadtilbud ${stamp}`, lead_id: u27LeadIds[0], status: 'draft', created_by: adminUser.id }]).select('id') : null
        const leadOfferId = (lo?.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (leadOfferId) {
          await gotoSafe(a.page, `${base}/dashboard/offers/${leadOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.mangler_kunde_vist = (await a.page.getByTestId('offer-missing-customer').count()) === 1
        }
        const convert = async (leadId: string) => {
          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('lead-convert').click({ timeout: 60_000 }).catch(() => {})
          await a.page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => {})
          return (a.page.url().match(/customers\/([0-9a-f-]{36})/) ?? [])[1] ?? null
        }
        const c1 = u27LeadIds[0] ? await convert(u27LeadIds[0]) : null
        u27CustomerId = c1
        const cust = c1 ? ((await c.admin.from('customers').select('email, company_name, customer_number').eq('id', c1).maybeSingle()).data as Record<string, string> | null) : null
        r.kunde_oprettet = !!cust && cust.email === mail && !!cust.customer_number
        const l1 = ((await c.admin.from('leads').select('custom_fields').eq('id', u27LeadIds[0]).maybeSingle()).data as { custom_fields?: Record<string, unknown> } | null)
        r.lead_koblet = l1?.custom_fields?.customer_id === c1
        // W-10: lead 2 er 'qualified' → kun Tilbud/Tabt klikbare; Vundet (ugyldigt spring) deaktiveret
        if (u27LeadIds[1]) {
          await gotoSafe(a.page, `${base}/dashboard/leads/${u27LeadIds[1]}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.status_won_deaktiveret = await a.page.getByTestId('lead-status-won').isDisabled().catch(() => false)
          r.status_proposal_aktiv = !(await a.page.getByTestId('lead-status-proposal').isDisabled().catch(() => true))
        }
        if (leadOfferId) {
          const lof = (await c.admin.from('offers').select('customer_id, payer_customer_id').eq('id', leadOfferId).maybeSingle()).data as { customer_id?: string | null; payer_customer_id?: string | null } | null
          r.tilbud_koblet = !!c1 && lof?.customer_id === c1 && lof?.payer_customer_id === c1
          await c.admin.from('offers').delete().eq('id', leadOfferId)
        }
        await gotoSafe(a.page, `${base}/dashboard/leads/${u27LeadIds[0]}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.gaa_til_kunde = (await a.page.getByTestId('lead-go-customer').count()) === 1
        const c2 = u27LeadIds[1] ? await convert(u27LeadIds[1]) : null
        const dupCount = (await c.admin.from('customers').select('id', { count: 'exact', head: true }).ilike('email', mail)).count ?? 0
        r.ingen_dublet = !!c2 && c2 === c1 && dupCount === 1
        out.push({ id: 'U27 lead → kunde', ok: u27LeadIds.length === 2 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U28 leverandørfaktura godkendt med konvertering til sagens materialer (indkøb, GO-LIVE)
      if (want('U28') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U28 grossist ${stamp}`, code: `HU28${stamp}` }]).select('id')
        u28.supplierId = (sup.data?.[0] as { id?: string } | undefined)?.id
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] indkøb ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        u28.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const inv = u28.supplierId && u28.caseId ? await c.admin.from('incoming_invoices').insert([{ source: 'manual', supplier_id: u28.supplierId,
          invoice_number: `UI-E2E-U28-${stamp}`, parse_status: 'parsed', status: 'awaiting_approval', amount_excl_vat: 160, matched_case_id: u28.caseId }]).select('id') : null
        u28.invoiceId = (inv?.data?.[0] as { id?: string } | undefined)?.id
        if (u28.invoiceId) await c.admin.from('incoming_invoice_lines').insert([
          { incoming_invoice_id: u28.invoiceId, line_number: 1, description: 'Kabel 3x1,5', quantity: 10, unit: 'm', unit_price: 12, total_price: 120 },
          { incoming_invoice_id: u28.invoiceId, line_number: 2, description: 'Dåse', quantity: 5, unit: 'stk', unit_price: 8, total_price: 40 },
        ])
        const seedErr = !u28.invoiceId ? `seed: ${inv?.error?.message ?? sc.error?.message ?? sup.error?.message ?? '?'}` : ''
        // PR-1 (Henrik 2026-10-15): godkendelse (bogholderi/admin) og fordeling til sag (admin/serviceleder) er separate;
        // godkendelse konverterer ALDRIG linjer automatisk. Negativ: serviceleder kan ikke godkende; montør/salg ingen adgang
        const sl = await login(await mkUser('serviceleder'))
        try {
          await gotoSafe(sl.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await sl.page.getByText(`UI-E2E-U28-${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.serviceleder_kan_ikke_godkende = (await sl.page.getByTestId('invoice-approve').count()) === 0
        } finally { await sl.ctx.close().catch(() => {}) }
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.admin_ser_godkend = (await a.page.getByTestId('invoice-approve').count()) === 1
        const bog = await login(await mkUser('bogholderi'))
        try {
          await gotoSafe(bog.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          // LF-10: godkendelse bekræftes (window.confirm) — accepter
          bog.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await bog.page.getByTestId('invoice-approve').click({ timeout: 60_000 }).catch(() => {})
          // markeret til manuel gennemgang → bekræftelse
          const yes = bog.page.getByRole('button', { name: 'Ja, godkend' })
          if (await yes.isVisible().catch(() => false)) await yes.click().catch(() => {})
          let st = ''
          for (let i = 0; i < 20 && st !== 'approved'; i++) {
            st = String(((await c.admin.from('incoming_invoices').select('status').eq('id', u28.invoiceId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
            if (st !== 'approved') await new Promise((res) => setTimeout(res, 1000))
          }
          r.bogholderi_godkendt = st === 'approved'
          r.ingen_auto_konvertering = (((await c.admin.from('case_materials').select('id').eq('case_id', u28.caseId)).data ?? []).length) === 0
          await gotoSafe(bog.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.bogholderi_kan_ikke_fordele = (await bog.page.getByTestId('invoice-allocate').count()) === 0
          // LF-1 (indkøbs-review 2026-10-16): godkendt, ingen linjer fordelt → sagen kan stadig sættes/skiftes
          r.sag_kan_skiftes_efter_godkendelse = (await bog.page.getByRole('button', { name: /^(Skift sag|Match til sag)$/ }).count()) > 0
        } finally { await bog.ctx.close().catch(() => {}) }
        const aud = ((await c.admin.from('incoming_invoice_audit_log').select('action').eq('incoming_invoice_id', u28.invoiceId)).data ?? []) as Array<{ action: string }>
        r.audit_godkendt = aud.some((x) => x.action === 'approved')
        // fordeling til sag som separat handling (serviceleder)
        const sl2 = await login(await mkUser('serviceleder'))
        try {
          await gotoSafe(sl2.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await sl2.page.getByTestId('invoice-allocate').click({ timeout: 60_000 }).catch(() => {})
          await sl2.page.getByRole('button', { name: /^Konvertér linjer$/ }).last().click({ timeout: 60_000 }).catch(() => {})
          for (let i = 0; i < 20 && (((await c.admin.from('case_materials').select('id').eq('case_id', u28.caseId)).data ?? []).length) < 2; i++) await new Promise((res) => setTimeout(res, 1000))
        } finally { await sl2.ctx.close().catch(() => {}) }
        const mats = ((await c.admin.from('case_materials').select('id, source, source_incoming_invoice_line_id, quantity, unit_cost').eq('case_id', u28.caseId)).data ?? []) as Array<{ id: string; source: string; source_incoming_invoice_line_id: string | null; quantity: number; unit_cost: number }>
        r.serviceleder_fordelte = mats.length === 2 && mats.every((m0) => m0.source === 'supplier_invoice' && !!m0.source_incoming_invoice_line_id)
        const lines = ((await c.admin.from('incoming_invoice_lines').select('converted_case_material_id').eq('incoming_invoice_id', u28.invoiceId)).data ?? []) as Array<{ converted_case_material_id: string | null }>
        r.kobling_begge_veje = lines.length === 2 && lines.every((l) => !!l.converted_case_material_id && mats.some((m0) => m0.id === l.converted_case_material_id))
        // LF-1: efter fordeling er sagen låst
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sag_laast_efter_fordeling = (await a.page.getByRole('button', { name: /^(Skift sag|Match til sag)$/ }).count()) === 0
        for (const u of [montor, salg]) {
          const x = await login(u)
          try {
            await gotoSafe(x.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            r[`${u === montor ? 'montoer' : 'salg'}_ingen_adgang`] = (await x.page.getByTestId('invoice-approve').count()) === 0 && (await x.page.getByTestId('invoice-allocate').count()) === 0 && (await x.page.getByText(`UI-E2E-U28-${stamp}`).count()) === 0
          } finally { await x.ctx.close().catch(() => {}) }
        }
        const ext = ((await c.admin.from('incoming_invoices').select('external_invoice_id, posted_at').eq('id', u28.invoiceId).maybeSingle()).data as { external_invoice_id?: string | null; posted_at?: string | null } | null)
        r.ingen_bogfoering = !ext?.external_invoice_id && !ext?.posted_at
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u28-godkend-faktura.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U28 leverandørfaktura → sag', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U191 IV-7 (leverandørfaktura-review 2026-10-18): godkendt kreditnota UDEN linjer (mail/upload) → serviceleder opretter
      // én samlet linje (−400 ekskl. moms) og fordeler den → sagens kost falder med 400. Før kunne den aldrig fordeles.
      if (want('U191') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        let caseId: string | undefined
        let invId: string | undefined
        try {
          const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U191 kredit ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
            priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
          caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
          const inv = caseId ? await c.admin.from('incoming_invoices').insert([{ source: 'manual', invoice_number: `UI-E2E-U191-${stamp}`, parse_status: 'parsed',
            status: 'approved', currency: 'DKK', amount_excl_vat: -400, vat_amount: -100, amount_incl_vat: -500, matched_case_id: caseId }]).select('id') : null
          invId = (inv?.data?.[0] as { id?: string } | undefined)?.id
          r.seed = !!invId
          const sl = await login(await mkUser('serviceleder'))
          try {
            await gotoSafe(sl.page, `${base}/dashboard/incoming-invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            const btn = sl.page.getByTestId('invoice-total-line')
            await btn.waitFor({ timeout: 60_000 }).catch(() => {})
            r.knap_vises = (await btn.count()) === 1
            await btn.click({ timeout: 30_000 }).catch(() => {})
            let n = 0
            for (let i = 0; i < 20 && n === 0; i++) {
              n = ((await c.admin.from('incoming_invoice_lines').select('id').eq('incoming_invoice_id', invId)).data ?? []).length
              if (n === 0) await new Promise((res) => setTimeout(res, 1000))
            }
            r.en_linje = n === 1
            await sl.page.getByTestId('invoice-allocate').click({ timeout: 60_000 }).catch(() => {})
            await sl.page.getByRole('button', { name: /^Konvertér linjer$/ }).last().click({ timeout: 60_000 }).catch(() => {})
            const costSum = async () => {
              const m = ((await c.admin.from('case_materials').select('quantity, unit_cost').eq('case_id', caseId)).data ?? []) as Array<{ quantity: number; unit_cost: number }>
              const o = ((await c.admin.from('case_other_costs').select('quantity, unit_cost').eq('case_id', caseId)).data ?? []) as Array<{ quantity: number; unit_cost: number }>
              return [...m, ...o].reduce((s, x) => s + Number(x.quantity) * Number(x.unit_cost), 0)
            }
            let sum = 0
            for (let i = 0; i < 20 && sum === 0; i++) { sum = await costSum(); if (sum === 0) await new Promise((res) => setTimeout(res, 1000)) }
            r.sagskost_minus_400 = Math.abs(sum + 400) < 0.01
          } finally { await sl.ctx.close().catch(() => {}) }
          // kun én samlet linje (ingen dublet efter klik + fordeling)
          const again = await c.admin.from('incoming_invoice_lines').select('id').eq('incoming_invoice_id', invId)
          r.ingen_dublet = (again.data ?? []).length === 1
          out.push({ id: 'U191 kreditnota uden linjer → samlet linje fordelt', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
        } finally {
          if (invId) {
            await c.admin.from('incoming_invoice_lines').update({ converted_case_material_id: null, converted_case_other_cost_id: null }).eq('incoming_invoice_id', invId)
            if (caseId) { await c.admin.from('case_materials').delete().eq('case_id', caseId); await c.admin.from('case_other_costs').delete().eq('case_id', caseId) }
            for (const t of ['incoming_invoice_lines', 'incoming_invoice_audit_log']) await c.admin.from(t).delete().eq('incoming_invoice_id', invId)
            await c.admin.from('incoming_invoices').delete().eq('id', invId)
          }
          if (caseId) listCaseIds.push(caseId)
        }
      }

      // U162 PR-6 (Henrik 2026-10-15): fastprissag — slutfakturaen viser og opretter RESTBELØBET af kontraktsummen
      // (10.000 − forskud 3.000 = 7.000 ekskl. moms), ikke timer/materialer oveni
      if (want('U162') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        let u162Txt = ''
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] fastpris ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, contract_sum: 10000, billing_model: 'fixed_price' }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const invIds: string[] = []
        if (caseId) {
          listCaseIds.push(caseId)
          const dep = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-FP-${stamp}`, customer_id: profitCustomerId, case_id: caseId,
            invoice_type: 'deposit', status: 'sent', total_amount: 3000, tax_amount: 750, final_amount: 3750 }]).select('id')
          const depId = (dep.data?.[0] as { id?: string } | undefined)?.id
          if (depId) invIds.push(depId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `fp kabel ${stamp}`, quantity: 10, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: adminUser.id }])
        }
        try {
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /Slutfaktura/ }).first().click({ timeout: 90_000 }).catch(() => {})
          const prev = a.page.getByTestId('contract-final-totals')
          await prev.waitFor({ timeout: 60_000 }).catch(() => {})
          const txt = ((await prev.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')
          u162Txt = txt
          r.preview_restbeloeb = /Restbeløb/i.test(txt) && /7\.000/.test(txt) && /10\.000/.test(txt)
          r.forklaring = (await a.page.getByTestId('contract-final-preview').count()) === 1
          await a.page.getByRole('button', { name: /Opret slutfaktura/ }).click({ timeout: 60_000 }).catch(() => {})
          let fin: { id?: string; total_amount?: number } | null = null
          for (let i = 0; i < 20 && !(Number(fin?.total_amount) > 0); i++) {
            fin = ((await c.admin.from('invoices').select('id, total_amount').eq('case_id', caseId ?? '').eq('invoice_type', 'final').maybeSingle()).data as typeof fin)
            if (!(Number(fin?.total_amount) > 0)) await new Promise((res) => setTimeout(res, 1000))
          }
          if (fin?.id) invIds.push(fin.id)
          r.oprettet_7000 = Number(fin?.total_amount) === 7000
          // headeren er synlig før linjer/binding er færdige (RC-1-genlæsningen ligger imellem) — vent på bindingen
          let mat: Array<{ invoice_line_id: string | null }> = []
          for (let i = 0; i < 20; i++) {
            mat = ((await c.admin.from('case_materials').select('invoice_line_id').eq('case_id', caseId ?? '')).data ?? []) as Array<{ invoice_line_id: string | null }>
            if (mat.length === 1 && mat[0].invoice_line_id) break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.materiale_daekket = mat.length === 1 && !!mat[0].invoice_line_id
        } finally {
          if (invIds.length) {
            const lineIds = (((await c.admin.from('invoice_lines').select('id').in('invoice_id', invIds)).data ?? []) as Array<{ id: string }>).map((l) => l.id)
            if (lineIds.length) await c.admin.from('case_materials').update({ invoice_line_id: null }).in('invoice_line_id', lineIds)
            await c.admin.from('invoice_predecessors').delete().in('invoice_id', invIds)
            await c.admin.from('invoice_lines').delete().in('invoice_id', invIds)
            await c.admin.from('invoices').delete().in('id', invIds)
          }
          if (caseId) await c.admin.from('case_materials').delete().eq('case_id', caseId)
        }
        out.push({ id: 'U162 fastprissag: slutfaktura = restbeløb af kontraktsum', ok: !!caseId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · "${u162Txt.slice(0, 160)}"` })
      }

      // U29 betaling registreret på kundefaktura
      if (want('U29') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-B-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 800, tax_amount: 200, final_amount: 1000, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u29InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/invoices/${u29InvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        // B-1: "Annuller" i prompten må IKKE markere betalt
        a.page.once('dialog', (d) => d.dismiss().catch(() => {}))
        await a.page.getByRole('button', { name: /Markér som betalt/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForTimeout(2000)
        r.annuller_ikke_betalt = ((await c.admin.from('invoices').select('status').eq('id', u29InvoiceId ?? '').maybeSingle()).data as { status?: string } | null)?.status === 'sent'
        a.page.once('dialog', (d) => d.accept(`REF-${stamp}`).catch(() => {}))
        await a.page.getByRole('button', { name: /Markér som betalt/ }).first().click({ timeout: 60_000 }).catch(() => {})
        type InvRow = { status?: string; payment_status?: string }
        let row = null as InvRow | null
        for (let i = 0; i < 20; i++) {
          row = ((await c.admin.from('invoices').select('status, payment_status').eq('id', u29InvoiceId).maybeSingle()).data as InvRow | null)
          if (row?.status === 'paid') break
          await new Promise((res) => setTimeout(res, 1000))
        }
        r.betalt = row?.status === 'paid'
        // audit skrives efter statusopdateringen — poll (før: læst straks → sporadisk tom)
        let audits: Array<{ action: string; user_id: string | null }> = []
        for (let i = 0; i < 15 && u29InvoiceId; i++) {
          audits = ((await c.admin.from('audit_logs').select('action, user_id').eq('entity_id', u29InvoiceId)).data ?? []) as Array<{ action: string; user_id: string | null }>
          if (audits.some((x) => x.user_id === adminUser.id)) break
          await new Promise((res) => setTimeout(res, 1000))
        }
        r.audit_med_bruger = audits.some((x) => x.user_id === adminUser.id)
        out.push({ id: 'U29 betaling på faktura', ok: !!u29InvoiceId && Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · audit=${JSON.stringify(audits.map((x) => x.action))}` })
      }

      // U30 planlægning fra kalenderen
      if (want('U30') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `Harness Planlagt ${stamp}`, email: `plan-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300 }]).select('id')
        u30.employeeId = (emp.data?.[0] as { id?: string } | undefined)?.id
        const caseTitle = `[HARNESS] planlægning ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title: caseTitle, customer_id: profitCustomerId, status: 'new', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id, case_number')
        u30.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const caseNo = (sc.data?.[0] as { case_number?: string } | undefined)?.case_number ?? ''
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + 86400_000))
        const woTitle = `Montage ${stamp}`
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${day}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Planlæg opgave/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByPlaceholder('Søg på sagsnr, titel eller kunde…').fill(caseNo || caseTitle).catch(() => {})
        await a.page.getByRole('button', { name: new RegExp(caseNo || 'planlægning') }).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.locator('[aria-labelledby="plan-wo-title"] select').first().selectOption(u30.employeeId ?? '').catch(() => {})
        await a.page.locator('[aria-labelledby="plan-wo-title"] input[type="date"]').fill(day).catch(() => {})
        await a.page.getByPlaceholder('F.eks. Montage – stueetage').fill(woTitle).catch(() => {})
        await a.page.getByRole('button', { name: 'Opret arbejdsordre' }).click({ timeout: 30_000 }).catch(() => {})
        let wo: { assigned_employee_id?: string; scheduled_date?: string; status?: string } | null = null
        for (let i = 0; i < 20 && !wo; i++) {
          wo = ((await c.admin.from('work_orders').select('assigned_employee_id, scheduled_date, status').eq('case_id', u30.caseId).maybeSingle()).data as { assigned_employee_id?: string; scheduled_date?: string; status?: string } | null)
          if (!wo) await new Promise((res) => setTimeout(res, 1000))
        }
        r.arbejdsordre = !!wo && wo.assigned_employee_id === u30.employeeId && wo.scheduled_date === day && wo.status === 'planned'
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${day}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.i_kalenderen = (await a.page.getByText(woTitle).count()) > 0
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u30-planlaegning.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U30 planlægning fra kalenderen', ok: !!u30.caseId && !!u30.employeeId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U31 timer → faktura (faktura, GO-LIVE)
      if (want('U31') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `Harness Timer ${stamp}`, email: `timer-${stamp}@harness.test`, role: 'montør', active: true, cost_rate: 300, hourly_rate: 500 }]).select('id')
        u31.employeeId = (emp.data?.[0] as { id?: string } | undefined)?.id
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] timer ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId }]).select('id')
        u31.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const wo = u31.caseId ? await c.admin.from('work_orders').insert([{ case_id: u31.caseId, title: `Montage ${stamp}`, status: 'done', assigned_employee_id: u31.employeeId }]).select('id') : null
        u31.woId = (wo?.data?.[0] as { id?: string } | undefined)?.id
        const t0 = Date.now() - 3 * 86400_000
        const iso = (ms: number) => new Date(ms).toISOString()
        const tl = u31.woId && u31.employeeId ? await c.admin.from('time_logs').insert([
          { employee_id: u31.employeeId, work_order_id: u31.woId, start_time: iso(t0), end_time: iso(t0 + 2 * 3600_000), billable: true, description: 'fakturerbar' },
          { employee_id: u31.employeeId, work_order_id: u31.woId, start_time: iso(t0 + 3 * 3600_000), end_time: iso(t0 + 4 * 3600_000), billable: false, description: 'intern' },
          { employee_id: u31.employeeId, work_order_id: u31.woId, start_time: iso(Date.now() - 600_000), end_time: null, billable: true, description: 'åben timer' },
          // PR-3 (Henrik 2026-10-15): afventende time — vises, men kommer ikke med på fakturaen
          { employee_id: u31.employeeId, work_order_id: u31.woId, start_time: iso(t0 + 5 * 3600_000), end_time: iso(t0 + 6 * 3600_000), billable: true, description: 'afventer' },
        ]).select('id, description, sale_amount, hours') : null
        const tls = (tl?.data ?? []) as Array<{ id: string; description: string; sale_amount: number | null; hours: number | null }>
        // kun godkendte timer faktureres (PR-3) — den fakturerbare er godkendt af serviceleder
        const fbId = tls.find((x) => x.description === 'fakturerbar')?.id
        if (fbId) await c.admin.from('time_logs').update({ approval_status: 'approved', approved_by: adminUser.id, approved_at: new Date().toISOString() }).eq('id', fbId)
        const billable = tls.find((x) => x.description === 'fakturerbar')
        const expected = billable?.sale_amount != null ? Number(billable.sale_amount) : 1000
        const seedErr = !u31.caseId ? `sag: ${sc.error?.message}` : !u31.woId ? `ordre: ${wo?.error?.message}` : tls.length !== 4 ? `timer: ${tl?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${u31.caseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Opret del-faktura/ }).first().waitFor({ timeout: 90_000 }).catch(() => {})
        r.aaben_timer_advarer = (await a.page.getByText(/åben timer/i).count()) > 0
        r.afventer_vist = (await a.page.getByTestId('billing-pending-hours').count()) > 0 && (await a.page.getByTestId('billing-time-row-pending').count()) === 1
        r.intern_ikke_vist = (await a.page.getByText('intern', { exact: true }).count()) === 0
        // montøren stopper timeren: her fjernes den åbne række (stop ville give en ny fakturerbar række)
        await c.admin.from('time_logs').delete().eq('work_order_id', u31.woId ?? '').is('end_time', null)
        await gotoSafe(a.page, `${base}/dashboard/orders/${u31.caseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        const btn = a.page.getByRole('button', { name: /Opret del-faktura/ }).first()
        await btn.waitFor({ timeout: 90_000 }).catch(() => {})
        await btn.click({ timeout: 30_000 }).catch(() => {})
        let inv: { id?: string; status?: string; total_amount?: number } | null = null
        for (let i = 0; i < 20 && !inv; i++) {
          inv = ((await c.admin.from('invoices').select('id, status, total_amount').eq('case_id', u31.caseId).maybeSingle()).data as { id?: string; status?: string; total_amount?: number } | null)
          if (!inv) await new Promise((res) => setTimeout(res, 1000))
        }
        // headeren indsættes før linjer/totaler — vent til totalen er skrevet (ellers race)
        for (let i = 0; i < 15 && inv?.id && !(Number(inv.total_amount) > 0); i++) {
          await new Promise((res) => setTimeout(res, 1000))
          inv = ((await c.admin.from('invoices').select('id, status, total_amount').eq('id', inv.id).maybeSingle()).data as typeof inv)
        }
        r.kladde_oprettet = inv?.status === 'draft'
        const lines = inv?.id ? ((await c.admin.from('invoice_lines').select('id, description, total_price').eq('invoice_id', inv.id)).data ?? []) as Array<{ id: string; description: string; total_price: number }> : []
        r.en_timelinje = lines.length === 1 && /^Timer \(2,00 t\)/.test(lines[0].description)
        r.beloeb_snapshot = expected > 0 && lines.length === 1 && Number(lines[0].total_price) === expected && Number(inv?.total_amount) === expected
        const after = ((await c.admin.from('time_logs').select('description, invoice_line_id').eq('work_order_id', u31.woId ?? '')).data ?? []) as Array<{ description: string; invoice_line_id: string | null }>
        r.time_laast = after.some((x) => x.description === 'fakturerbar' && !!lines[0] && x.invoice_line_id === lines[0].id)
        r.afventer_ikke_faktureret = after.some((x) => x.description === 'afventer' && x.invoice_line_id === null)
        r.oevrige_ikke_faktureret = after.filter((x) => x.description !== 'fakturerbar').every((x) => !x.invoice_line_id)
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u31-timer-faktura.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U31 timer → faktura', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · forventet=${expected} linjer=${JSON.stringify(lines.map((l) => [l.description, l.total_price]))} total=${inv?.total_amount}` })
      }

      // U32 slutfaktura med forskudsfradrag og frosset timesats (faktura, GO-LIVE)
      if (want('U32') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `Harness Slut ${stamp}`, email: `slut-${stamp}@harness.test`, role: 'montør', active: true, cost_rate: 300, hourly_rate: 500 }]).select('id')
        u32.employeeId = (emp.data?.[0] as { id?: string } | undefined)?.id
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] slutfaktura ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId, billing_model: 'time_and_materials' }]).select('id')
        u32.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const wo = u32.caseId ? await c.admin.from('work_orders').insert([{ case_id: u32.caseId, title: `Slut ${stamp}`, status: 'done', assigned_employee_id: u32.employeeId }]).select('id') : null
        u32.woId = (wo?.data?.[0] as { id?: string } | undefined)?.id
        const t0 = Date.now() - 5 * 86400_000
        const tl = u32.woId && u32.employeeId ? await c.admin.from('time_logs').insert([{ employee_id: u32.employeeId, work_order_id: u32.woId,
          start_time: new Date(t0).toISOString(), end_time: new Date(t0 + 2 * 3600_000).toISOString(), billable: true }]).select('id, sale_amount') : null
        const tlRow = (tl?.data?.[0] as { id?: string; sale_amount?: number | null } | undefined)
        r.snapshot_sat = Number(tlRow?.sale_amount) === 1000
        // PR-3: kun godkendte timer faktureres — timen er godkendt
        if (tlRow?.id) await c.admin.from('time_logs').update({ approval_status: 'approved', approved_by: adminUser.id, approved_at: new Date().toISOString() }).eq('id', tlRow.id)
        // satsen hæves EFTER arbejdet — fakturaen skal bruge den frosne
        if (u32.employeeId) await c.admin.from('employees').update({ hourly_rate: 700 }).eq('id', u32.employeeId)
        const dep = u32.caseId ? await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-F-${stamp}`, customer_id: profitCustomerId, case_id: u32.caseId,
          invoice_type: 'deposit', status: 'sent', total_amount: 300, tax_amount: 75, final_amount: 375 }]).select('id') : null
        const seedErr = !u32.caseId ? `sag: ${sc.error?.message}` : !u32.woId ? `ordre: ${wo?.error?.message}` : !tlRow?.id ? `timer: ${tl?.error?.message}` : !dep?.data?.length ? `forskud: ${dep?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${u32.caseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Slutfaktura/ }).first().click({ timeout: 90_000 }).catch(() => {})
        await a.page.getByRole('button', { name: /Opret slutfaktura/ }).click({ timeout: 60_000 }).catch(() => {})
        let fin: { id?: string; status?: string; total_amount?: number } | null = null
        for (let i = 0; i < 20 && !fin; i++) {
          fin = ((await c.admin.from('invoices').select('id, status, total_amount').eq('case_id', u32.caseId).eq('invoice_type', 'final').maybeSingle()).data as { id?: string; status?: string; total_amount?: number } | null)
          if (!fin) await new Promise((res) => setTimeout(res, 1000))
        }
        for (let i = 0; i < 15 && fin?.id && !(Number(fin.total_amount) > 0); i++) {
          await new Promise((res) => setTimeout(res, 1000))
          fin = ((await c.admin.from('invoices').select('id, status, total_amount').eq('id', fin.id).maybeSingle()).data as typeof fin)
        }
        r.slutfaktura_kladde = fin?.status === 'draft'
        // linjerne kan blive læst før de er skrevet (set 2026-10-15: total=700, linjer=[]) — poll til begge er der
        type FL = { id: string; description: string; total_price: number; source_time_log_id: string | null }
        let lines: FL[] = []
        for (let i = 0; i < 15 && fin?.id && lines.length < 2; i++) {
          if (i) await new Promise((res) => setTimeout(res, 1000))
          lines = ((await c.admin.from('invoice_lines').select('id, description, total_price, source_time_log_id').eq('invoice_id', fin.id)).data ?? []) as FL[]
        }
        const timeLine = lines.find((l) => l.source_time_log_id === tlRow?.id)
        r.timelinje_frosset_sats = Number(timeLine?.total_price) === 1000
        r.fradrag_forskud = lines.some((l) => Number(l.total_price) === -300)
        r.total = Number(fin?.total_amount) === 700
        // låsen skrives som sidste trin efter header + linjer — poll
        let locked: { invoice_line_id?: string } | null = null
        for (let i = 0; i < 15 && tlRow?.id && timeLine && locked?.invoice_line_id !== timeLine.id; i++) {
          if (i) await new Promise((res) => setTimeout(res, 1000))
          locked = ((await c.admin.from('time_logs').select('invoice_line_id').eq('id', tlRow.id).maybeSingle()).data as { invoice_line_id?: string } | null)
        }
        r.time_laast = !!timeLine && locked?.invoice_line_id === timeLine.id
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u32-slutfaktura.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U32 slutfaktura', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · linjer=${JSON.stringify(lines.map((l) => [l.description.slice(0, 30), l.total_price]))} total=${fin?.total_amount}` })
      }

      // U33 kreditnota på sendt faktura (faktura, GO-LIVE)
      if (want('U33') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-KN-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 2000, tax_amount: 500, final_amount: 2500, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u33InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seed33 = u33InvoiceId ? '' : `SEED: ${ins.error?.message ?? '?'} · `
        if (u33InvoiceId) await c.admin.from('invoice_lines').insert([{ invoice_id: u33InvoiceId, position: 1, description: 'Installation', quantity: 1, unit: 'stk', unit_price: 2000, total_price: 2000 }])
        const credits = async () => ((await c.admin.from('invoices').select('id, total_amount, final_amount, status').eq('credit_of_invoice_id', u33InvoiceId ?? '')).data ?? []) as Array<{ id: string; total_amount: number; final_amount: number; status: string }>
        const openDialog = async () => {
          await gotoSafe(a.page, `${base}/dashboard/invoices/${u33InvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /Krediter faktura/ }).click({ timeout: 60_000 }).catch(() => {})
        }
        a.page.on('dialog', (d) => { d.accept().catch(() => {}) })
        // 1) delvis med dansk tusindtal "1.000"
        await openDialog()
        await a.page.getByRole('button', { name: /Delvis — beløb/ }).click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByPlaceholder(/^Maks /).fill('1.000').catch(() => {})
        await a.page.getByPlaceholder('Vises på kreditnota-PDF og i audit-trail').fill(`Harness delkredit ${stamp}`).catch(() => {})
        await a.page.getByRole('button', { name: /^Opret kreditnota$/ }).click({ timeout: 30_000 }).catch(() => {})
        let cr: Awaited<ReturnType<typeof credits>> = []
        for (let i = 0; i < 20 && cr.length === 0; i++) { cr = await credits(); if (!cr.length) await new Promise((res) => setTimeout(res, 1000)) }
        r.delkredit_1000 = cr.length === 1 && Number(cr[0].total_amount) === -1000 && Number(cr[0].final_amount) === -1250
        // 2) over resten (1.500 > 1.000) kan ikke oprettes
        await openDialog()
        await a.page.getByRole('button', { name: /Delvis — beløb/ }).click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByPlaceholder(/^Maks /).fill('1.500').catch(() => {})
        await a.page.getByPlaceholder('Vises på kreditnota-PDF og i audit-trail').fill('over').catch(() => {})
        r.overkredit_blokeret = await a.page.getByRole('button', { name: /^Opret kreditnota$/ }).isDisabled().catch(() => false)
        // 3) fuld kreditnota af resten
        await openDialog()
        await a.page.getByPlaceholder('Vises på kreditnota-PDF og i audit-trail').fill(`Harness rest ${stamp}`).catch(() => {})
        await a.page.getByRole('button', { name: /^Opret kreditnota$/ }).click({ timeout: 30_000 }).catch(() => {})
        for (let i = 0; i < 20 && cr.length < 2; i++) { cr = await credits(); if (cr.length < 2) await new Promise((res) => setTimeout(res, 1000)) }
        r.fuld_rest = cr.length === 2 && cr.reduce((s0, x) => s0 + Number(x.total_amount), 0) === -2000
        r.kladder = cr.every((x) => x.status === 'draft')
        a.page.removeAllListeners('dialog')
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u33-kreditnota.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U33 kreditnota', ok: !!u33InvoiceId && Object.values(r).every(Boolean),
          note: `${seed33}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · kreditnotaer=${JSON.stringify(cr.map((x) => x.total_amount))}` })
      }

      // U34 materiale på sagen via dialogen med danske beløb (sag/økonomi, GO-LIVE)
      if (want('U34') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] materiale ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        u34CaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/orders/${u34CaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Tilføj materiale/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const dlg = a.page.locator('[aria-labelledby="case-material-dialog-title"]')
        await dlg.getByPlaceholder('F.eks. Solpanel 425W LR4-72HPH').fill(`Inverter 10 kW ${stamp}`).catch(() => {})
        const nums = dlg.locator('input[inputmode="decimal"]')
        await nums.nth(0).fill('2').catch(() => {})
        await nums.nth(1).fill('1.000').catch(() => {})
        await nums.nth(2).fill('1.250,50').catch(() => {})
        await dlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
        type MatRow = { quantity?: number; unit_cost?: number; unit_sales_price?: number }
        const readMat = async (): Promise<MatRow | null> => ((await c.admin.from('case_materials').select('quantity, unit_cost, unit_sales_price').eq('case_id', u34CaseId ?? '').maybeSingle()).data as MatRow | null)
        let m0: MatRow | null = await readMat()
        for (let i = 0; i < 20 && !m0; i++) { await new Promise((res) => setTimeout(res, 1000)); m0 = await readMat() }
        r.gemt = !!m0
        r.antal = Number(m0?.quantity) === 2
        r.kostpris_1000 = Number(m0?.unit_cost) === 1000
        r.salgspris_1250_50 = Number(m0?.unit_sales_price) === 1250.5
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u34-materiale.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U34 materiale m. danske beløb', ok: !!u34CaseId && Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · række=${JSON.stringify(m0)}` })
      }

      // U35 slutfaktura når forskud/rate er krediteret (faktura, GO-LIVE)
      if (want('U35') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        // 00232: afregningsform skal være valgt (ellers blokeres slutfakturaen) — regning med fradrag af forskud/rate
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] kreditfradrag ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId, billing_model: 'time_and_materials' }]).select('id')
        u35CaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const mk = async (row: Record<string, unknown>) => ((await c.admin.from('invoices').insert([{ customer_id: profitCustomerId, case_id: u35CaseId, ...row }]).select('id')).data?.[0] as { id?: string } | undefined)?.id ?? null
        const depId = u35CaseId ? await mk({ invoice_number: `UI-E2E-D-${stamp}`, invoice_type: 'deposit', status: 'sent', total_amount: 300, tax_amount: 75, final_amount: 375 }) : null
        const rateId = u35CaseId ? await mk({ invoice_number: `UI-E2E-R-${stamp}`, invoice_type: 'progress', status: 'sent', total_amount: 500, tax_amount: 125, final_amount: 625 }) : null
        // forskuddet er krediteret fuldt, raten delvist (200)
        const cr1 = depId ? await mk({ invoice_number: `UI-E2E-KD-${stamp}`, invoice_type: 'credit', credit_of_invoice_id: depId, status: 'sent', total_amount: -300, tax_amount: -75, final_amount: -375 }) : null
        const cr2 = rateId ? await mk({ invoice_number: `UI-E2E-KR-${stamp}`, invoice_type: 'credit', credit_of_invoice_id: rateId, status: 'sent', total_amount: -200, tax_amount: -50, final_amount: -250 }) : null
        const mat = u35CaseId ? await c.admin.from('case_materials').insert([{ case_id: u35CaseId, description: `Anlæg ${stamp}`, quantity: 1, unit: 'stk',
          unit_cost: 600, unit_sales_price: 1000, billable: true, source: 'manual', created_by: adminUser.id }]).select('id') : null
        const seedErr = !u35CaseId ? `sag: ${sc.error?.message}` : !depId || !rateId ? 'forskud/rate' : !cr1 || !cr2 ? 'kreditnotaer' : !mat?.data?.length ? `materiale: ${mat?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${u35CaseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Slutfaktura/ }).first().click({ timeout: 90_000 }).catch(() => {})
        await a.page.getByRole('button', { name: /Opret slutfaktura/ }).waitFor({ timeout: 60_000 }).catch(() => {})
        r.visning_netto_fradrag = (await a.page.getByText(/krediteret/).count()) > 0
        await a.page.getByRole('button', { name: /Opret slutfaktura/ }).click({ timeout: 60_000 }).catch(() => {})
        type Fin = { id?: string; total_amount?: number }
        const readFin = async (): Promise<Fin | null> => ((await c.admin.from('invoices').select('id, total_amount').eq('case_id', u35CaseId ?? '').eq('invoice_type', 'final').maybeSingle()).data as Fin | null)
        let fin: Fin | null = await readFin()
        for (let i = 0; i < 20 && !fin; i++) { await new Promise((res) => setTimeout(res, 1000)); fin = await readFin() }
        const lines = fin?.id ? ((await c.admin.from('invoice_lines').select('description, total_price').eq('invoice_id', fin.id)).data ?? []) as Array<{ description: string; total_price: number }> : []
        const deductions = lines.filter((l) => Number(l.total_price) < 0)
        r.intet_fradrag_for_krediteret_forskud = !deductions.some((l) => l.description.includes(`UI-E2E-D-${stamp}`))
        r.rate_fradrag_netto_300 = deductions.length === 1 && Number(deductions[0].total_price) === -300
        r.total_700 = Number(fin?.total_amount) === 700
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u35-kreditfradrag.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U35 slutfaktura efter kreditnota', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · linjer=${JSON.stringify(lines.map((l) => [l.description.slice(0, 40), l.total_price]))} total=${fin?.total_amount}` })
      }

      // U36 ny rate efter at en rate er krediteret fuldt (faktura)
      if (want('U36') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] rate efter kredit ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId, contract_sum: 10000 }]).select('id')
        u36CaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const old = u36CaseId ? await c.admin.from('invoices').insert([{ customer_id: profitCustomerId, case_id: u36CaseId, invoice_number: `UI-E2E-RF-${stamp}`, invoice_type: 'progress',
          status: 'sent', billing_percentage: 100, amount_basis: 'contract_sum', amount_basis_value: 10000, total_amount: 10000, tax_amount: 2500, final_amount: 12500 }]).select('id') : null
        const oldId = (old?.data?.[0] as { id?: string } | undefined)?.id
        const cr = oldId ? await c.admin.from('invoices').insert([{ customer_id: profitCustomerId, case_id: u36CaseId, invoice_number: `UI-E2E-RFK-${stamp}`, invoice_type: 'credit',
          credit_of_invoice_id: oldId, status: 'sent', total_amount: -10000, tax_amount: -2500, final_amount: -12500 }]).select('id') : null
        const seedErr = !u36CaseId ? `sag: ${sc.error?.message}` : !oldId ? `rate: ${old?.error?.message}` : !cr?.data?.length ? `kredit: ${cr?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${u36CaseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /A conto \/ rate/ }).first().click({ timeout: 90_000 }).catch(() => {})
        await a.page.locator('input[inputmode="decimal"]').first().fill('50').catch(() => {})
        const btn = a.page.getByRole('button', { name: /Opret a conto-faktura/ })
        await btn.waitFor({ timeout: 30_000 }).catch(() => {})
        r.knap_aktiv = await btn.isEnabled().catch(() => false)
        await btn.click({ timeout: 30_000 }).catch(() => {})
        type Inv = { id: string; billing_percentage: number; total_amount: number }
        const readNew = async (): Promise<Inv | null> => (((await c.admin.from('invoices').select('id, billing_percentage, total_amount').eq('case_id', u36CaseId ?? '').eq('invoice_type', 'progress').neq('id', oldId ?? '')).data ?? []) as Inv[])[0] ?? null
        let nw: Inv | null = await readNew()
        for (let i = 0; i < 20 && !nw; i++) { await new Promise((res) => setTimeout(res, 1000)); nw = await readNew() }
        r.ny_rate_50 = !!nw && Number(nw.billing_percentage) === 50 && Number(nw.total_amount) === 5000
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u36-rate-efter-kredit.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U36 ny rate efter kreditnota', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ny=${JSON.stringify(nw)}` })
      }

      // U37 e-conomic-forhåndsvisning på faktura (e-conomic foundation, ingen bogføring)
      if (want('U37') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-EC-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 1173.25, tax_amount: 293.31, final_amount: 1466.56, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u37InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u37InvoiceId) await c.admin.from('invoice_lines').insert([
          { invoice_id: u37InvoiceId, position: 1, description: 'Montage', quantity: 2, unit: 't', unit_price: 500, total_price: 1000 },
          { invoice_id: u37InvoiceId, position: 2, description: 'Timer (0,33 t)', quantity: 0.33, unit: 't', unit_price: 525.1, total_price: 173.25 },
        ])
        const seedErr = u37InvoiceId ? '' : `SEED: ${ins.error?.message ?? '?'} · `
        await gotoSafe(a.page, `${base}/dashboard/invoices/${u37InvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText('Kræver rettelse før eksport').waitFor({ timeout: 90_000 }).catch(() => {})
        r.status_kraever_rettelse = (await a.page.getByText('Kræver rettelse før eksport').count()) > 0
        r.blokering_forklaret = (await a.page.getByTestId('economic-blocking').getByText(/fakturaen er på 1\.173,25 kr/).count()) > 0
        await a.page.getByRole('button', { name: /Vis hvad der sendes til e-conomic/ }).click({ timeout: 90_000 }).catch(() => {})
        const pv = a.page.getByTestId('economic-preview')
        await pv.getByTestId('economic-preview-net').waitFor({ timeout: 60_000 }).catch(() => {})
        r.vist = await pv.isVisible().catch(() => false)
        r.econ_netto_1173_28 = ((await pv.getByTestId('economic-preview-net').textContent().catch(() => '')) ?? '').includes('1.173,28')
        r.afvigelse_markeret = (await pv.getByText(/e-conomic beregner 0,33 × 525,10 = 173,28/).count()) > 0
        r.intet_sendes = (await pv.getByText(/intet sendes til e-conomic herfra/).count()) > 0
        const logs = ((await c.admin.from('accounting_sync_log').select('id').eq('entity_id', u37InvoiceId ?? '')).data ?? []) as unknown[]
        r.ingen_sync_forsoeg = logs.length === 0
        // ren faktura (antal × pris = total) forbliver "Klar til eksport"
        const ok2 = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-EC2-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 1000, tax_amount: 250, final_amount: 1250, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u37CleanId = (ok2.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u37CleanId) await c.admin.from('invoice_lines').insert([{ invoice_id: u37CleanId, position: 1, description: 'Montage', quantity: 2, unit: 't', unit_price: 500, total_price: 1000 }])
        await gotoSafe(a.page, `${base}/dashboard/invoices/${u37CleanId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText('Klar til eksport').waitFor({ timeout: 90_000 }).catch(() => {})
        r.ren_faktura_klar = (await a.page.getByText('Klar til eksport').count()) > 0 && (await a.page.getByText('Kræver rettelse før eksport').count()) === 0
        await a.page.screenshot({ path: join(shots, 'u37-economic-preview.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U37 e-conomic-forhåndsvisning', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U38 e-conomic-forhåndsvisning på leverandørfaktura før godkendelse (e-conomic foundation)
      if (want('U38')) {
        const r: Record<string, boolean> = {}
        // e-conomic-nr. 12 er unikt (uq_suppliers_external): frigiv det fra efterladte [HARNESS]-leverandører fra afbrudte kørsler
        await c.admin.from('suppliers').update({ external_supplier_id: null, external_provider: null })
          .eq('external_provider', 'economic').eq('external_supplier_id', '12').like('name', '[HARNESS]%')
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U38 grossist ${stamp}`, code: `HU38${stamp}`, external_supplier_id: '12', external_provider: 'economic' }]).select('id')
        u38.supplierId = (sup.data?.[0] as { id?: string } | undefined)?.id
        const inv = u38.supplierId ? await c.admin.from('incoming_invoices').insert([{ source: 'manual', supplier_id: u38.supplierId, invoice_number: `UI-E2E-U38-${stamp}`,
          invoice_date: '2026-09-30', parse_status: 'parsed', status: 'awaiting_approval', amount_excl_vat: 1000, vat_amount: 250, amount_incl_vat: 1250 }]).select('id') : null
        u38.invoiceId = (inv?.data?.[0] as { id?: string } | undefined)?.id
        if (u38.invoiceId) await c.admin.from('incoming_invoice_lines').insert([{ incoming_invoice_id: u38.invoiceId, line_number: 1, description: 'Kabel', quantity: 10, unit: 'm', unit_price: 60, total_price: 600 }])
        const seedErr = u38.invoiceId ? '' : `SEED: ${inv?.error?.message ?? sup.error?.message ?? '?'} · `
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u38.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Vis hvad der bogføres i e-conomic/ }).click({ timeout: 90_000 }).catch(() => {})
        const pv = a.page.getByTestId('supplier-economic-preview')
        await pv.getByTestId('supplier-economic-net').waitFor({ timeout: 60_000 }).catch(() => {})
        r.omkostning_1000 = ((await pv.getByTestId('supplier-economic-net').textContent().catch(() => '')) ?? '').includes('1.000,00')
        r.differencelinje_400 = (await pv.getByText(/differencelinje 400,00 kr/).count()) > 0
        r.leverandoer_12 = (await pv.getByText(/leverandør nr\. 12/).count()) > 0
        r.intet_sendes = (await pv.getByText(/intet sendes til e-conomic herfra/).count()) > 0
        const st = ((await c.admin.from('incoming_invoices').select('status, external_invoice_id').eq('id', u38.invoiceId ?? '').maybeSingle()).data as { status?: string; external_invoice_id?: string | null } | null)
        r.uaendret = st?.status === 'awaiting_approval' && !st?.external_invoice_id
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u38-supplier-economic.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U38 leverandørfaktura → e-conomic-forhåndsvisning', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U39 kunde → eksisterende e-conomic-debitor (e-conomic foundation, ingen bogføring)
      if (want('U39')) {
        const r: Record<string, boolean> = {}
        const mk = async (n: number) => ((await c.admin.from('customers').insert([{ customer_number: `HU39${n}${String(stamp).slice(-6)}`, company_name: `[HARNESS] U39 kunde ${n} ${stamp}`,
          contact_person: 'Test', email: '', created_by: adminUser.id }]).select('id')).data?.[0] as { id?: string } | undefined)?.id ?? null
        u39Ids.push(...[await mk(1), await mk(2)].filter((x): x is string => !!x))
        const debNo = String(9000000 + (Number(stamp) % 900000))
        const setNo = async (custId: string, v: string) => {
          await gotoSafe(a.page, `${base}/dashboard/customers/${custId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /^Fakturaer/ }).first().click({ timeout: 60_000 }).catch(() => {})
          const box = a.page.getByTestId('customer-economic-link')
          await box.waitFor({ timeout: 60_000 }).catch(() => {})
          await box.getByLabel('e-conomic-kundenr.').fill(v).catch(() => {})
          await box.getByRole('button', { name: 'Gem' }).click({ timeout: 30_000 }).catch(() => {})
          await new Promise((res) => setTimeout(res, 1500))
          return ((await box.locator('.ring-red-200, .ring-emerald-200').last().textContent().catch(() => '')) ?? '')
        }
        const linkOf = async (id: string) => ((await c.admin.from('customers').select('external_customer_id, external_provider').eq('id', id).maybeSingle()).data as { external_customer_id?: string | null; external_provider?: string | null } | null)
        if (u39Ids.length === 2) {
          const bad = await setNo(u39Ids[0], '10x42')
          r.ugyldigt_afvist = /Ugyldigt e-conomic-kundenr/.test(bad) && !(await linkOf(u39Ids[0]))?.external_customer_id
          const good = await setNo(u39Ids[0], debNo)
          const l1 = await linkOf(u39Ids[0])
          r.koblet = /Koblet til/.test(good) && l1?.external_customer_id === debNo && l1?.external_provider === 'economic'
          const audit = ((await c.admin.from('audit_logs').select('action, user_id').eq('entity_id', u39Ids[0])).data ?? []) as Array<{ action: string; user_id: string | null }>
          r.audit = audit.some((x) => x.action === 'economic_customer_linked' && x.user_id === adminUser.id)
          const dup = await setNo(u39Ids[1], debNo)
          r.dublet_afvist = /allerede koblet/.test(dup) && !(await linkOf(u39Ids[1]))?.external_customer_id
          await setNo(u39Ids[0], '')
          const l3 = await linkOf(u39Ids[0])
          r.kobling_fjernet = !l3?.external_customer_id && !l3?.external_provider
        }
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u39-economic-kunde.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U39 kunde → e-conomic-debitor', ok: u39Ids.length === 2 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U41 kundeportal: fakturaer (kundekommunikation, GO-LIVE)
      if (want('U41') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u41.tokenId = (pt.data?.[0] as { id?: string } | undefined)?.id
        const mkInv = async (row: Record<string, unknown>) => ((await c.admin.from('invoices').insert([{ due_date: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10), ...row }]).select('id')).data?.[0] as { id?: string } | undefined)?.id
        const sentNo = `UI-E2E-PS-${stamp}`, draftNo = `UI-E2E-PD-${stamp}`
        const sentId = await mkInv({ invoice_number: sentNo, customer_id: profitCustomerId, status: 'sent', total_amount: 800, tax_amount: 200, final_amount: 1000 })
        const draftId = await mkInv({ invoice_number: draftNo, customer_id: profitCustomerId, status: 'draft', total_amount: 100, tax_amount: 25, final_amount: 125 })
        const oc = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-PO-${stamp}`, company_name: '[HARNESS] anden kunde', contact_person: 'X', email: '', created_by: adminUser.id }]).select('id')
        u41.otherCustomerId = (oc.data?.[0] as { id?: string } | undefined)?.id
        const otherId = u41.otherCustomerId ? await mkInv({ invoice_number: `UI-E2E-PX-${stamp}`, customer_id: u41.otherCustomerId, status: 'sent', total_amount: 80, tax_amount: 20, final_amount: 100 }) : undefined
        u41.invoiceIds = [sentId, draftId, otherId].filter((x): x is string => !!x)
        if (sentId) await c.admin.from('invoice_lines').insert([{ invoice_id: sentId, position: 1, description: 'Installation', quantity: 1, unit: 'stk', unit_price: 800, total_price: 800 }])
        const seedErr = u41.tokenId && sentId && draftId && otherId ? '' : `SEED: ${pt.error?.message ?? 'faktura/kunde'} · `
        // G12: uden bankoplysninger advarer fakturasiden (staging har ingen firmarække)
        const csRows = ((await c.admin.from('company_settings').select('id, bank_reg_no, bank_account')).data ?? []) as Array<{ id: string; bank_reg_no: string | null; bank_account: string | null }>
        const hasBank = csRows.some((x) => !!x.bank_reg_no?.trim() && !!x.bank_account?.trim())
        if (!hasBank) {
          await gotoSafe(a.page, `${base}/dashboard/invoices/${sentId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('bank-missing').waitFor({ timeout: 60_000 }).catch(() => {})
          r.advarsel_uden_bank = (await a.page.getByTestId('bank-missing').count()) > 0
          if (csRows.length === 0) {
            const ins = await c.admin.from('company_settings').insert([{ company_name: '[HARNESS] Elta Solar', bank_reg_no: '1234', bank_account: '0001234567' }]).select('id')
            u41.companySettingsId = (ins.data?.[0] as { id?: string } | undefined)?.id
          } else {
            u41.restoreBank = { id: csRows[0].id, reg: csRows[0].bank_reg_no, acc: csRows[0].bank_account }
            await c.admin.from('company_settings').update({ bank_reg_no: '1234', bank_account: '0001234567' }).eq('id', csRows[0].id)
          }
        }
        await gotoSafe(a.page, `${base}/dashboard/invoices/${sentId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(sentNo).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.ingen_advarsel_med_bank = (await a.page.getByTestId('bank-missing').count()) === 0
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        kp.on('pageerror', (e) => pageErrors.push(`kunde-faktura: ${e.message.slice(0, 120)}`))
        await kp.goto(`${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const body = await kp.locator('body').innerText().catch(() => '')
        r.sendt_faktura_vist = body.includes(sentNo)
        r.kladde_skjult = !body.includes(draftNo)
        const pdf = await kctx.request.get(`${base}/api/portal/invoices/pdf?token=${tok}&invoiceId=${sentId}`, { timeout: 180_000 }).catch(() => null)
        const buf = pdf ? await pdf.body().catch(() => Buffer.from('')) : Buffer.from('')
        r.pdf_download = !!pdf && pdf.status() === 200 && (pdf.headers()['content-type'] ?? '').includes('pdf') && buf.subarray(0, 4).toString() === '%PDF'
        const draftPdf = await kctx.request.get(`${base}/api/portal/invoices/pdf?token=${tok}&invoiceId=${draftId}`, { timeout: 120_000 }).catch(() => null)
        r.kladde_pdf_404 = draftPdf?.status() === 404
        const otherPdf = await kctx.request.get(`${base}/api/portal/invoices/pdf?token=${tok}&invoiceId=${otherId}`, { timeout: 120_000 }).catch(() => null)
        r.anden_kundes_pdf_404 = otherPdf?.status() === 404
        await kp.screenshot({ caret: 'initial', path: join(shots, 'u41-portal-fakturaer.png'), fullPage: true }).catch(() => {})
        await kctx.close().catch(() => {})
        out.push({ id: 'U41 kundeportal: fakturaer', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · pdf=${pdf?.status()} ${(pdf?.headers()['content-type'] ?? '').slice(0, 30)} ${r.pdf_download ? '' : buf.subarray(0, 120).toString()}` })
      }

      // U42 kopiér tilbud (tilbud/salg)
      // U187 PM-3 (2026-10-17): tilbudsmailens forhåndsvisning genbruger kundens gyldige portal-link og forlænger det, når
      // det udløber inden for 30 dage (før /view-offer-fallback → "ugyldigt link"). Intet sendes.
      if (want('U187')) {
        const r: Record<string, boolean> = {}
        const { randomBytes } = await import('crypto')
        const tok = randomBytes(32).toString('hex')
        const cust = await c.admin.from('customers').insert({ customer_number: `U187-${stamp}`, company_name: `[HARNESS] U187 ${stamp}`, contact_person: 'Portal Kunde',
          email: `u187-${stamp}@harness.test`, created_by: adminUser.id }).select('id').single()
        const custId = (cust.data as { id?: string } | null)?.id ?? null
        let offerId: string | null = null
        try {
          await c.admin.from('portal_access_tokens').insert({ customer_id: custId, token: tok, email: `u187-${stamp}@harness.test`, is_active: true,
            created_by: adminUser.id, expires_at: new Date(Date.now() + 10 * 86400_000).toISOString() })
          const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PL-${stamp}`, title: `[HARNESS] U187 ${stamp}`, customer_id: custId, status: 'draft',
            created_by: adminUser.id, valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) }]).select('id')
          offerId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
          await c.admin.from('offer_line_items').insert([{ offer_id: offerId, position: 1, line_type: 'product', description: 'Linje', quantity: 1, unit: 'stk', unit_price: 1000, discount_percentage: 0 }])
          await gotoSafe(a.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: 'Send Tilbud' }).first().click({ timeout: 60_000 }).catch(() => {})
          let srcdoc = ''
          for (let i = 0; i < 30 && !srcdoc.includes('/portal/'); i++) {
            srcdoc = (await a.page.locator('iframe').first().getAttribute('srcdoc').catch(() => '')) ?? ''
            if (!srcdoc.includes('/portal/')) await a.page.waitForTimeout(1000)
          }
          r.link_med_kundens_token = srcdoc.includes(`/portal/${tok}/offers/${offerId}`)
          r.ingen_view_offer = !srcdoc.includes('/view-offer/')
          const exp = ((await c.admin.from('portal_access_tokens').select('expires_at').eq('token', tok).maybeSingle()).data as { expires_at?: string } | null)?.expires_at
          // PT-2 (2026-10-17): forhåndsvisningen forlænger IKKE linket (kun en faktisk afsendelse gør — testes ikke: ville sende mail)
          r.forhaandsvisning_forlaenger_ikke = !!exp && Date.parse(exp) < Date.now() + 30 * 86400_000
          await a.page.keyboard.press('Escape').catch(() => {})
        } finally {
          if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
          if (custId) { await c.admin.from('portal_access_tokens').delete().eq('customer_id', custId); await c.admin.from('customers').delete().eq('id', custId) }
        }
        out.push({ id: 'U187 tilbudsmail: gyldigt portal-link genbruges (forhåndsvisning forlænger ikke)', ok: !!custId && !!offerId && Object.values(r).every(Boolean), note: `${cust.error?.message ?? ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U186 OF-1 (2026-10-17): inline-redigering af en linje med linjerabat bevarer rabatten (før nulstillet → total steg)
      if (want('U186') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-LR-${stamp}`, title: `[HARNESS] U186 linjerabat ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id, valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) }]).select('id')
        const offerId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        let lineId: string | null = null
        try {
          const li = await c.admin.from('offer_line_items').insert([{ offer_id: offerId, position: 1, line_type: 'product', description: `Kabel U186 ${stamp}`, quantity: 10, unit: 'stk', unit_price: 100, discount_percentage: 10 }]).select('id, total')
          lineId = (li.data?.[0] as { id?: string } | undefined)?.id ?? null
          r.seed_total_900 = Number((li.data?.[0] as { total?: number } | undefined)?.total) === 900
          await gotoSafe(a.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const desc = a.page.getByPlaceholder('Beskrivelse...').first()
          await desc.waitFor({ timeout: 60_000 }).catch(() => {})
          r.felt_fundet = (await desc.inputValue().catch(() => '')) === `Kabel U186 ${stamp}`
          await desc.fill(`Kabel U186 rettet ${stamp}`).catch(() => {})
          await desc.press('Tab').catch(() => {})
          type L = { description?: string; discount_percentage?: number; total?: number }
          let row: L | null = null
          for (let i = 0; i < 20 && row?.description !== `Kabel U186 rettet ${stamp}`; i++) {
            await new Promise((res) => setTimeout(res, 1000))
            row = ((await c.admin.from('offer_line_items').select('description, discount_percentage, total').eq('id', lineId ?? '').maybeSingle()).data as L | null)
          }
          r.beskrivelse_gemt = row?.description === `Kabel U186 rettet ${stamp}`
          r.rabat_bevaret = Number(row?.discount_percentage) === 10
          r.total_uaendret = Number(row?.total) === 900
        } finally {
          if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
        }
        out.push({ id: 'U186 inline-redigering bevarer linjerabat', ok: !!offerId && !!lineId && Object.values(r).every(Boolean), note: `${ins.error?.message ?? ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U185 DF-10 (2026-10-17): afregningsform vælges på tilbuddet og gemmes (sagen arver den ved accept)
      if (want('U185') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-BM-${stamp}`, title: `[HARNESS] U185 afregning ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id, valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) }]).select('id')
        const offerId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          await gotoSafe(a.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: 'Rediger' }).first().click({ timeout: 60_000 }).catch(() => {})
          const sel = a.page.getByTestId('offer-billing-model')
          r.felt_vises = await sel.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          await sel.selectOption('fixed_price').catch(() => {})
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click({ timeout: 30_000 }).catch(() => {})
          let bm: string | null = null
          for (let i = 0; i < 20 && bm !== 'fixed_price'; i++) {
            bm = ((await c.admin.from('offers').select('billing_model').eq('id', offerId ?? '').maybeSingle()).data as { billing_model?: string | null } | null)?.billing_model ?? null
            if (bm !== 'fixed_price') await new Promise((res) => setTimeout(res, 1000))
          }
          r.gemt_fast_pris = bm === 'fixed_price'
        } finally {
          if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
        }
        out.push({ id: 'U185 afregningsform på tilbud gemmes', ok: !!offerId && Object.values(r).every(Boolean), note: `${ins.error?.message ?? ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      if (want('U42') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const src = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OK-${stamp}`, title: `[HARNESS] kopikilde ${stamp}`, customer_id: profitCustomerId,
          status: 'sent', sent_at: new Date().toISOString(), created_by: adminUser.id, valid_until: '2026-01-01', tax_percentage: 25 }]).select('id')
        u42.sourceId = (src.data?.[0] as { id?: string } | undefined)?.id
        if (u42.sourceId) await c.admin.from('offer_line_items').insert([
          { offer_id: u42.sourceId, position: 1, description: 'Inverter', quantity: 1, unit: 'stk', unit_price: 9000, total: 9000, cost_price: 6000 },
          { offer_id: u42.sourceId, position: 2, description: 'Montage', quantity: 8, unit: 't', unit_price: 550, total: 4400, cost_price: 400 },
        ])
        type O = { id: string; offer_number: string; title: string; status: string; valid_until: string | null; customer_id: string | null; final_amount: number; sent_at: string | null }
        const readO = async (id: string) => ((await c.admin.from('offers').select('id, offer_number, title, status, valid_until, customer_id, final_amount, sent_at').eq('id', id).maybeSingle()).data as O | null)
        const before = u42.sourceId ? await readO(u42.sourceId) : null
        await gotoSafe(a.page, `${base}/dashboard/offers/${u42.sourceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /^Kopiér$/ }).click({ timeout: 90_000 }).catch(() => {})
        await a.page.waitForURL((u) => /\/dashboard\/offers\/[0-9a-f-]{36}/.test(u.pathname) && !u.pathname.includes(u42.sourceId ?? 'x'), { timeout: 120_000 }).catch(() => {})
        u42.copyId = (a.page.url().match(/offers\/([0-9a-f-]{36})/) ?? [])[1]
        const copy = u42.copyId && u42.copyId !== u42.sourceId ? await readO(u42.copyId) : null
        r.kopi_oprettet = !!copy && copy.offer_number !== before?.offer_number
        r.kladde_uden_sendt = copy?.status === 'draft' && !copy?.sent_at
        r.titel_kopi = !!copy?.title?.endsWith('(kopi)') && copy?.customer_id === profitCustomerId
        r.ny_gyldighed = !!copy?.valid_until && copy.valid_until > new Date().toISOString().slice(0, 10)
        const lines = copy ? ((await c.admin.from('offer_line_items').select('description, quantity, unit_price, cost_price').eq('offer_id', copy.id).order('position')).data ?? []) as Array<{ description: string; quantity: number; unit_price: number; cost_price: number }> : []
        r.linjer_kopieret = lines.length === 2 && lines[0].description === 'Inverter' && Number(lines[0].cost_price) === 6000 && Number(lines[1].quantity) === 8 && Number(lines[1].unit_price) === 550
        r.samme_total = !!copy && Number(copy.final_amount) === Number(before?.final_amount) && Number(before?.final_amount) > 0
        const after = u42.sourceId ? await readO(u42.sourceId) : null
        r.kilde_uaendret = after?.status === 'sent' && after?.title === before?.title
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u42-kopier-tilbud.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U42 kopiér tilbud', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · total=${copy?.final_amount}/${before?.final_amount}` })
      }

      // U43 omplanlægning fra kalenderen (montør/planlægning)
      if (want('U43') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        let dndDiag = ''
        const mkEmp = async (n: string) => ((await c.admin.from('employees').insert([{ name: `Harness ${n} ${stamp}`, email: `${n.toLowerCase()}-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300 }]).select('id')).data?.[0] as { id?: string } | undefined)?.id
        const empA = await mkEmp('Anders'), empB = await mkEmp('Bente')
        u43.employeeIds = [empA, empB].filter((x): x is string => !!x)
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] omplan ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        u43.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const dayKey = (offset: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + offset * 86400_000))
        const d1 = dayKey(1), d3 = dayKey(3)
        const woTitle = `Omplan ${stamp}`
        const wo = u43.caseId && empA ? await c.admin.from('work_orders').insert([{ case_id: u43.caseId, title: woTitle, status: 'planned', scheduled_date: d1, assigned_employee_id: empA }]).select('id') : null
        u43.woId = (wo?.data?.[0] as { id?: string } | undefined)?.id
        // fokus E 2026-10-15: Bente har allerede et job på d3 → dobbeltbooking-varsel i dialogen + "2 job samme dag" i ugevisning
        const busyTitle = `Optaget ${stamp}`
        if (u43.caseId && empB) await c.admin.from('work_orders').insert([{ case_id: u43.caseId, title: busyTitle, status: 'planned', scheduled_date: d3, assigned_employee_id: empB, start_time: '08:00', estimated_hours: 4 }])
        const seedErr = u43.woId && empB ? '' : `SEED: ${wo?.error?.message ?? sc.error?.message ?? 'medarbejder'} · `
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${d1}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(woTitle).first().click({ timeout: 90_000 }).catch(() => {})
        const dlg = a.page.locator('[aria-labelledby="edit-wo-title"]')
        await dlg.waitFor({ timeout: 30_000 }).catch(() => {})
        await dlg.locator('input[type="date"]').fill(d3).catch(() => {})
        await dlg.locator('select').first().selectOption(empB ?? '').catch(() => {})
        await dlg.getByTestId('employee-day-load').waitFor({ timeout: 30_000 }).catch(() => {})
        r.dobbeltbooking_varsel = ((await dlg.getByTestId('employee-day-load').textContent().catch(() => '')) ?? '').includes(busyTitle)
        // 00227: tidspunkt + varighed → ægte overlap-varsel (Bente 08–12, nyt 10–12)
        await dlg.getByTestId('edit-start-time').fill('10:00').catch(() => {})
        await dlg.getByTestId('edit-est-hours').fill('2').catch(() => {})
        await dlg.getByTestId('employee-day-overlap').waitFor({ timeout: 30_000 }).catch(() => {})
        r.overlap_varsel = ((await dlg.getByTestId('employee-day-overlap').textContent().catch(() => '')) ?? '').includes(busyTitle)
        await dlg.getByRole('button', { name: /Gem ændringer/ }).click({ timeout: 30_000 }).catch(() => {})
        type W = { scheduled_date?: string; assigned_employee_id?: string; status?: string }
        const readW = async (): Promise<W | null> => ((await c.admin.from('work_orders').select('scheduled_date, assigned_employee_id, status').eq('id', u43.woId ?? '').maybeSingle()).data as W | null)
        let w: W | null = await readW()
        for (let i = 0; i < 20 && w?.scheduled_date !== d3; i++) { await new Promise((res) => setTimeout(res, 1000)); w = await readW() }
        r.ny_dato = w?.scheduled_date === d3
        r.ny_montoer = w?.assigned_employee_id === empB
        const tw = ((await c.admin.from('work_orders').select('start_time, estimated_hours').eq('id', u43.woId ?? '').maybeSingle()).data as { start_time?: string | null; estimated_hours?: number | null } | null)
        r.tid_gemt = String(tw?.start_time ?? '').startsWith('10:00') && Number(tw?.estimated_hours) === 2
        r.stadig_planlagt = w?.status === 'planned'
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${d3}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.vist_paa_ny_dag = (await a.page.getByText(woTitle).count()) > 0
        r.tid_paa_chip = (await a.page.getByTestId('wo-chip-time').filter({ hasText: '10:00–12:00' }).count()) > 0
        // 00229: Bente norm 5 t (planlagt 4 + 2 = 6 → over), Anders uden norm
        if (empB) await c.admin.from('employees').update({ weekly_hours: 5 }).eq('id', empB)
        await gotoSafe(a.page, `${base}/dashboard/calendar?view=week&date=${d3}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const bRow = a.page.locator('tr', { hasText: `Harness Bente ${stamp}` }).first()
        r.kapacitet_norm = /Planlagt 6 t af norm 5 t/.test(((await bRow.getByTestId('week-employee-capacity').textContent().catch(() => '')) ?? ''))
        r.kapacitet_ikke_sat = /Norm ikke sat/.test(((await a.page.locator('tr', { hasText: `Harness Anders ${stamp}` }).first().getByTestId('week-employee-capacity').textContent().catch(() => '')) ?? ''))
        r.uge_belastning = (await bRow.getByTestId('week-day-overload').count()) === 1 && /2 aktive job denne uge/.test(((await bRow.getByTestId('week-employee-load').textContent().catch(() => '')) ?? ''))
        // E-7: træk jobbet fra Bente til Anders samme dag (træk-og-slip i ugevisningen)
        {
          const chip = a.page.locator(`[data-testid="wo-chip"][data-wo-id="${u43.woId}"]`).first()
          const target = a.page.locator(`[data-testid="week-cell"][data-employee-id="${empA}"][data-date="${d3}"]`).first()
          // HTML5-træk: fælles DataTransfer (Playwrights musebaserede dragTo udløser ikke altid drop)
          const dt = await a.page.evaluateHandle(() => new DataTransfer())
          await chip.dispatchEvent('dragstart', { dataTransfer: dt }).catch(() => {})
          await target.dispatchEvent('dragover', { dataTransfer: dt }).catch(() => {})
          await target.dispatchEvent('drop', { dataTransfer: dt }).catch(() => {})
          let moved = ''
          for (let i = 0; i < 15 && moved !== empA; i++) {
            moved = String(((await c.admin.from('work_orders').select('assigned_employee_id').eq('id', u43.woId ?? '').maybeSingle()).data as { assigned_employee_id?: string } | null)?.assigned_employee_id ?? '')
            if (moved !== empA) await new Promise((res) => setTimeout(res, 1000))
          }
          r.traek_og_slip = moved === empA
          if (!r.traek_og_slip) dndDiag = `msg="${((await a.page.getByTestId('calendar-drop-msg').textContent().catch(() => '')) ?? '').slice(0, 120)}" chips=${await chip.count()} celler=${await target.count()} draggable=${await chip.getAttribute('draggable').catch(() => '?')}`
          // tilbage til Bente (så resten af testen er uændret)
          if (u43.woId && empB) await c.admin.from('work_orders').update({ assigned_employee_id: empB }).eq('id', u43.woId)
          await gotoSafe(a.page, `${base}/dashboard/calendar?view=week&date=${d3}`, { waitUntil: 'networkidle', timeout: 180_000 })
        }
        // E-7: klik på Anders' tomme celle på d3 → planlæg-dialog med Anders + d3 udfyldt
        const aRow = a.page.locator('tr', { hasText: `Harness Anders ${stamp}` }).first()
        await aRow.getByRole('button', { name: new RegExp(`Planlæg .* ${d3}`) }).click({ timeout: 30_000 }).catch(() => {})
        const pdlg = a.page.locator('[aria-labelledby="plan-wo-title"]')
        await pdlg.waitFor({ timeout: 30_000 }).catch(() => {})
        r.celle_planlaeg = (await pdlg.locator('input[type="date"]').inputValue().catch(() => '')) === d3
          && (await pdlg.locator('select').first().inputValue().catch(() => '')) === (empA ?? '-')
        await a.page.keyboard.press('Escape').catch(() => {})
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u43-omplanlaegning.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U43 omplanlægning fra kalenderen', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${dndDiag ? ` · ${dndDiag}` : ''}` })
      }

      // U165 W-1: sagssøgning finder sagen via kundenavn og adresse (ikke kun titel/nr.)
      if (want('U165')) {
        const r: Record<string, boolean> = {}
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-SRCH-${stamp}`, company_name: `Søgekunde ${stamp}`, contact_person: 'X', email: `srch-${stamp}@harness.test`, created_by: adminUser.id }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        const title = `[HARNESS] søg ${stamp}`
        const sc = custId ? await c.admin.from('service_cases').insert([{ title, customer_id: custId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id, address: `Søgevej ${stamp}` }]).select('id') : null
        const caseId = (sc?.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        try {
          for (const [k, term] of [['kundenavn', `Søgekunde ${stamp}`], ['adresse', `Søgevej ${stamp}`]] as const) {
            await gotoSafe(a.page, `${base}/dashboard/orders?search=${encodeURIComponent(term)}`, { waitUntil: 'networkidle', timeout: 180_000 })
            r[k] = (await a.page.getByText(title).count()) > 0
          }
        } finally {
          if (custId && !caseId) await c.admin.from('customers').delete().eq('id', custId)
        }
        out.push({ id: 'U165 sagssøgning: kundenavn + adresse', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U166 W-13: fanen står i URL'en og overlever genindlæsning (sag + kunde)
      if (want('U166') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] faner ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Planlægning \/ Timer/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(500)
        r.sag_url = a.page.url().includes('tab=planlaegning')
        // W-15: advarselsnote vises øverst på Overblik
        if (caseId) await c.admin.from('case_notes').insert([{ case_id: caseId, content: `Hund på adressen ${stamp}`, kind: 'warning', created_by: adminUser.id }])
        await a.page.reload({ waitUntil: 'networkidle' }).catch(() => {})
        r.sag_efter_reload = (await a.page.getByRole('button', { name: /Planlæg medarbejder/ }).count()) > 0
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('case-warning-notes').waitFor({ timeout: 30_000 }).catch(() => {})
        r.advarsel_paa_overblik = ((await a.page.getByTestId('case-warning-notes').textContent().catch(() => '')) ?? '').includes(`Hund på adressen ${stamp}`)
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /^Sager/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(500)
        r.kunde_url = a.page.url().includes('tab=sager')
        out.push({ id: 'U166 faner i URL (sag + kunde)', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U173 B-3: kundekortets fakturaoverblik viser åbent beløb (delbetalt faktura 1.000 − 600 = 400)
      if (want('U173')) {
        let u173Diag = ''
        const r: Record<string, boolean> = {}
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-OPEN-${stamp}`, company_name: `Delbetaler ${stamp}`, contact_person: 'X', email: `open-${stamp}@harness.test`, created_by: adminUser.id }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        const { copenhagenDatePlusDays } = await import('../../src/lib/utils/copenhagen-time')
        const inv = custId ? await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-OPEN-${stamp}`, customer_id: custId, status: 'sent',
          total_amount: 800, tax_amount: 200, final_amount: 1000, amount_paid: 600, due_date: copenhagenDatePlusDays(-3) }]).select('id') : null
        const invId = (inv?.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          await gotoSafe(a.page, `${base}/dashboard/customers/${custId}?tab=fakturaer`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText('Udestående i alt').first().waitFor({ timeout: 60_000 }).catch(() => {})
          // kortet = forælderen til label-div'en (label + beløb)
          const card = a.page.getByText('Udestående i alt', { exact: true }).first().locator('xpath=../..')
          const txt = ((await card.textContent().catch(() => '')) ?? '')
          r.aabent_400 = /400/.test(txt) && !/1\.000/.test(txt)
          u173Diag = txt.replace(/\s+/g, ' ').slice(0, 80)
        } finally {
          if (invId) await c.admin.from('invoices').delete().eq('id', invId)
          if (custId) await c.admin.from('customers').delete().eq('id', custId)
        }
        out.push({ id: 'U173 kundekort: åbent beløb', ok: !!invId && Object.values(r).every(Boolean), note: `${inv?.error ? `SEED: ${inv.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${u173Diag}` })
      }

      // U175 X-13: opgavemenu for salg + bogholderi — kun egne opgaver (oprettet/tildelt), ikke andres; ingen admin-handlinger
      if (want('U175') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const bogUser = await mkUser('bogholderi')
        const ins = await c.admin.from('customer_tasks').insert([
          { customer_id: profitCustomerId, title: `[HARNESS] salg-egen ${stamp}`, priority: 'normal', created_by: salg.id, assigned_to: salg.id },
          { customer_id: profitCustomerId, title: `[HARNESS] bog-egen ${stamp}`, priority: 'normal', created_by: bogUser.id, assigned_to: bogUser.id },
          { customer_id: profitCustomerId, title: `[HARNESS] admin-andres ${stamp}`, priority: 'normal', created_by: adminUser.id, assigned_to: adminUser.id },
        ]).select('id')
        const ids = ((ins.data ?? []) as { id: string }[]).map((x) => x.id)
        try {
          for (const [k, u, own, other] of [['salg', salg, `salg-egen ${stamp}`, `bog-egen ${stamp}`], ['bogholderi', bogUser, `bog-egen ${stamp}`, `salg-egen ${stamp}`]] as const) {
            const s = await login(u)
            await gotoSafe(s.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
            r[`${k}_menu`] = (await s.page.locator('a[href="/dashboard/tasks"]').count()) > 0
            await gotoSafe(s.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
            await s.page.getByText(own).first().waitFor({ timeout: 60_000 }).catch(() => {})
            r[`${k}_ser_egen`] = (await s.page.getByText(own).count()) > 0
            r[`${k}_ser_ikke_andres`] = (await s.page.getByText(other).count()) === 0 && (await s.page.getByText(`admin-andres ${stamp}`).count()) === 0
            // PM2-5 (Henrik 2026-10-19): salg og bogholderi MÅ oprette generelle opgaver (tasks.create) — knappen vises
            r[`${k}_kan_oprette`] = (await s.page.getByRole('button', { name: /Ny opgave|Opret opgave/ }).count()) > 0
            await s.ctx.close().catch(() => {})
          }
        } finally {
          if (ids.length) await c.admin.from('customer_tasks').delete().in('id', ids)
        }
        out.push({ id: 'U175 opgavemenu salg/bogholderi (kun egne)', ok: ids.length === 3 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U176 X-14: afregningsform vælges ved oprettelse af sag (gemmes eksplicit; tom = ikke valgt)
      if (want('U176') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        await gotoSafe(a.page, `${base}/dashboard/orders/new`, { waitUntil: 'networkidle', timeout: 180_000 })
        const sel = a.page.getByTestId('new-case-billing-model')
        await sel.waitFor({ timeout: 60_000 }).catch(() => {})
        r.felt_vist = (await sel.count()) === 1
        r.standard_tom = ((await sel.inputValue().catch(() => 'x')) ?? 'x') === ''
        out.push({ id: 'U176 afregningsform ved oprettelse', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U202 IV2-4: sagsoprettelse valideres på serveren — salg opretter en sag via formularen (virker stadig), og
      // statusvalget tilbyder ikke "lukket" (serveren afviser en ny sag som lukket)
      if (want('U202')) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] U202 ny sag ${stamp}`
        const sp = await login(await mkUser('salg'))
        try {
          await gotoSafe(sp.page, `${base}/dashboard/orders/new`, { waitUntil: 'networkidle', timeout: 180_000 })
          const statusSel = sp.page.locator('select[name="status"]')
          await statusSel.waitFor({ timeout: 60_000 }).catch(() => {})
          r.status_felt = (await statusSel.count()) === 1
          r.ingen_lukket_valg = (await statusSel.locator('option[value="closed"]').count()) === 0
          await sp.page.locator('input[name="title"]').fill(title)
          await sp.page.getByRole('button', { name: /^Opret sag$/ }).click()
          await sp.page.waitForURL(/\/dashboard\/orders\/(?!new)[^/?]+/, { timeout: 90_000 }).catch(() => {})
          const row = ((await c.admin.from('service_cases').select('id, status').eq('title', title).maybeSingle()).data) as { id?: string; status?: string } | null
          if (row?.id) listCaseIds.push(row.id)
          r.sag_oprettet = !!row?.id && row.status !== 'closed'
        } finally { await sp.ctx.close().catch(() => {}) }
        out.push({ id: 'U202 IV2-4 sagsoprettelse (salg) med serverskema', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U178 P-4/P-2: indstillingskort efter rettighed (bogholderi ser e-conomic, serviceleder ikke Team); salg ser egen sag
      // på kundens Sager-fane (før tom liste uden cases.view.all)
      if (want('U178') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const bog = await login(await mkUser('bogholderi'))
        await gotoSafe(bog.page, `${base}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.bog_ser_economic = (await bog.page.locator('a[href="/dashboard/settings/economic"]').count()) > 0
        r.bog_ser_ikke_team = (await bog.page.locator('a[href="/dashboard/settings/team"]').count()) === 0
        await bog.ctx.close().catch(() => {})
        const sl = await login(await mkUser('serviceleder'))
        await gotoSafe(sl.page, `${base}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sl_ser_ikke_team = (await sl.page.locator('a[href="/dashboard/settings/team"]').count()) === 0
        r.sl_ser_firma = (await sl.page.locator('a[href="/dashboard/settings/company"]').count()) > 0
        await sl.ctx.close().catch(() => {})
        const title = `[HARNESS] salgs-sag ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: salg.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        const sp = await login(salg)
        await gotoSafe(sp.page, `${base}/dashboard/customers/${profitCustomerId}?tab=sager`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByText(title).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.salg_ser_egen_sag = (await sp.page.getByText(title).count()) > 0
        await sp.ctx.close().catch(() => {})
        out.push({ id: 'U178 indstillingskort pr. rettighed + salgs sager på kunden', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U177 P-3/P-5: global søgning finder sager (sagsnr./titel); serviceleder ser ikke "Opret medarbejder" og får NoAccess på /new
      if (want('U177') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] søgsag ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByPlaceholder('Søg leads, kunder, tilbud, projekter...').first().fill(`søgsag ${stamp}`).catch(() => {})
        await a.page.getByText(title).first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.sag_fundet = (await a.page.getByText(title).count()) > 0
        // P-3: kundelistens søgning finder telefonnummer
        const phone = `88${String(stamp).slice(-6)}`
        const pc = await c.admin.from('customers').insert([{ customer_number: `UI-TLF-${stamp}`, company_name: `Telefonkunde ${stamp}`, contact_person: 'X', email: `tlf-${stamp}@harness.test`, phone, created_by: adminUser.id }]).select('id')
        const pcId = (pc.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/customers?search=${phone}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.telefon_fundet = (await a.page.getByText(`Telefonkunde ${stamp}`).count()) > 0
        if (pcId) await c.admin.from('customers').delete().eq('id', pcId)
        const sl = await login(await mkUser('serviceleder'))
        await gotoSafe(sl.page, `${base}/dashboard/employees`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sl_ingen_opret = (await sl.page.getByRole('link', { name: /Opret medarbejder/ }).count()) === 0
        await gotoSafe(sl.page, `${base}/dashboard/employees/new`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.sl_noaccess_new = (await sl.page.getByText(/ikke adgang|Ingen adgang/i).count()) > 0
        await sl.ctx.close().catch(() => {})
        out.push({ id: 'U177 global søgning sager + medarbejder-oprettelse gated', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U172 B-6/B-7: forfaldne leverandørfakturaer — filteret i listen finder dem (DB-filter), widgetten tæller
      // anden valuta separat
      if (want('U172')) {
        const r: Record<string, boolean> = {}
        const { copenhagenDatePlusDays } = await import('../../src/lib/utils/copenhagen-time')
        const yday = copenhagenDatePlusDays(-1)
        const ins = await c.admin.from('incoming_invoices').insert([
          { source: 'manual', invoice_number: `UI-E2E-DUE-${stamp}`, parse_status: 'parsed', status: 'approved', amount_incl_vat: 1234, currency: 'DKK', due_date: yday },
          { source: 'manual', invoice_number: `UI-E2E-EUR-${stamp}`, parse_status: 'parsed', status: 'approved', amount_incl_vat: 99, currency: 'EUR', due_date: yday },
        ]).select('id')
        const ids = ((ins.data ?? []) as { id: string }[]).map((x) => x.id)
        try {
          await gotoSafe(a.page, `${base}/dashboard/incoming-invoices?due=overdue`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(`UI-E2E-DUE-${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.filter_finder_forfalden = (await a.page.getByText(`UI-E2E-DUE-${stamp}`).count()) > 0
          // B-8: fanen skrives i URL'en
          await gotoSafe(a.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /^Godkendt/ }).first().click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForURL(/tab=approved/, { timeout: 15_000 }).catch(() => {})
          r.fane_i_url = a.page.url().includes('tab=approved')
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('due-other-currency').waitFor({ timeout: 60_000 }).catch(() => {})
          r.anden_valuta_vist = (await a.page.getByTestId('due-other-currency').count()) > 0
        } finally {
          if (ids.length) await c.admin.from('incoming_invoices').delete().in('id', ids)
        }
        out.push({ id: 'U172 forfaldne leverandørfakturaer', ok: ids.length === 2 && Object.values(r).every(Boolean), note: `${ins.error ? `SEED: ${ins.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U171 S-7: manuel kobling af en mail til en kunde kobler også trådens øvrige mails uden kunde
      if (want('U171')) {
        let u171Diag = ''
        const r: Record<string, boolean> = {}
        const cname = `Trådkunde ${stamp}`
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-TRD-${stamp}`, company_name: cname, contact_person: 'X', email: `trd-${stamp}@harness.test`, created_by: adminUser.id }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        const conv = `harness-conv-${stamp}`
        const s1 = `[HARNESS] tråd A ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([
          { sender_email: `afs-${stamp}@harness.test`, subject: s1, body_text: 'a', conversation_id: conv, received_at: new Date().toISOString(), is_archived: false, link_status: 'unidentified' },
          { sender_email: `afs-${stamp}@harness.test`, subject: `[HARNESS] tråd B ${stamp}`, body_text: 'b', conversation_id: conv, received_at: new Date(Date.now() - 60_000).toISOString(), is_archived: false, link_status: 'unidentified' },
        ]).select('id')
        const ids = ((em.data ?? []) as { id: string }[]).map((x) => x.id)
        seededEmailIds.push(...ids)
        try {
          await gotoSafe(a.page, `${base}/dashboard/mail?search=${encodeURIComponent(s1)}`, { waitUntil: 'networkidle', timeout: 120_000 })
          const step: string[] = []
          // exact: ellers rammes filter-chippen "Søgning: …" i stedet for mailen i listen
          await a.page.getByText(s1, { exact: true }).first().click({ timeout: 60_000 }).then(() => step.push('mail')).catch(() => {})
          await a.page.getByRole('button', { name: /Kobl til eksisterende/ }).first().click({ timeout: 60_000 }).then(() => step.push('kobl')).catch(() => {})
          await a.page.getByPlaceholder('Søg firmanavn, kundenr, email, kontakt...').fill(cname).then(() => step.push('søg')).catch(() => {})
          await a.page.getByRole('button', { name: new RegExp(cname) }).first().click({ timeout: 60_000 }).then(() => step.push('valgt')).catch(() => {})
          u171Diag = step.join('>')
          await a.page.screenshot({ caret: 'initial', path: join(shots, 'u171-mailkobling.png'), fullPage: false }).catch(() => {})
          let rows: { customer_id: string | null }[] = []
          for (let i = 0; i < 20; i++) {
            rows = ((await c.admin.from('incoming_emails').select('customer_id').in('id', ids)).data ?? []) as { customer_id: string | null }[]
            if (rows.length === 2 && rows.every((x) => x.customer_id === custId)) break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.begge_i_traaden_koblet = rows.length === 2 && rows.every((x) => x.customer_id === custId)
          u171Diag += ` · koblet=${rows.filter((x) => x.customer_id === custId).length}/2`
        } finally {
          if (ids.length) await c.admin.from('incoming_emails').update({ customer_id: null }).in('id', ids)
          if (custId) await c.admin.from('customers').delete().eq('id', custId)
        }
        out.push({ id: 'U171 manuel mailkobling kobler tråden', ok: !!custId && ids.length === 2 && Object.values(r).every(Boolean), note: `${em.error ? `SEED: ${em.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${u171Diag}` })
      }

      // U170 S-5/S-1: tilbud markeret afvist (bekræftet) → auto "Følg op: … intet svar"-opgaven lukkes
      if (want('U170') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-FU-${stamp}`, title: `[HARNESS] opfølgning ${stamp}`, customer_id: profitCustomerId,
          status: 'sent', created_by: adminUser.id }]).select('id')
        const offId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const tk = offId ? await c.admin.from('customer_tasks').insert([{ customer_id: profitCustomerId, offer_id: offId, title: `Følg op: UI-E2E-FU-${stamp} — intet svar modtaget`,
          priority: 'normal', created_by: adminUser.id, assigned_to: adminUser.id, due_date: new Date().toISOString() }]).select('id') : null
        const taskId = (tk?.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          await gotoSafe(a.page, `${base}/dashboard/offers/${offId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.ingen_set_knap = (await a.page.getByRole('button', { name: 'Set', exact: true }).count()) === 0
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await a.page.getByRole('button', { name: 'Afvist', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
          let st: string | undefined
          for (let i = 0; i < 20; i++) {
            st = ((await c.admin.from('customer_tasks').select('status').eq('id', taskId ?? '').maybeSingle()).data as { status?: string } | null)?.status
            if (st === 'done') break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.opgave_lukket = st === 'done'
        } finally {
          if (taskId) await c.admin.from('customer_tasks').delete().eq('id', taskId)
          if (offId) await c.admin.from('offers').delete().eq('id', offId)
        }
        out.push({ id: 'U170 afvist tilbud lukker opfølgning', ok: !!taskId && Object.values(r).every(Boolean), note: `${off.error ? `SEED: ${off.error.message} · ` : tk?.error ? `SEED: ${tk.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U169 B-5/B-4: et bogføringskrav ('pending-…') vises som "i gang", ikke som bogført; fakturaoverblikket indlæses
      if (want('U169')) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('incoming_invoices').insert([{ source: 'manual', invoice_number: `UI-E2E-PEND-${stamp}`, parse_status: 'parsed',
          status: 'approved', amount_excl_vat: 100, external_invoice_id: `pending-${Date.now()}`, external_provider: 'economic' }]).select('id')
        const invId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('posting-pending').waitFor({ timeout: 60_000 }).catch(() => {})
          r.vist_som_i_gang = (await a.page.getByTestId('posting-pending').count()) > 0
          r.ikke_allerede_bogfoert = (await a.page.getByText('e-conomic ID').count()) === 0
          await gotoSafe(a.page, `${base}/dashboard/invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.overblik_indlaest = (await a.page.getByText('Betalt denne måned').count()) > 0
          // B-2: nøgletal fra serveren over alle fakturaer — aldrig fallback-teksten "kunne ikke beregnes"
          r.server_noegletal = (await a.page.getByText(/nøgletallene kunne ikke beregnes/).count()) === 0
          const capTxt = (await a.page.getByTestId('invoices-overview-capped').textContent().catch(() => '')) ?? ''
          r.loft_tekst_ok = !capTxt || /dækker alle fakturaer/.test(capTxt)
        } finally {
          if (invId) await c.admin.from('incoming_invoices').delete().eq('id', invId)
        }
        out.push({ id: 'U169 bogføringskrav i gang + fakturaoverblik', ok: !!invId && Object.values(r).every(Boolean), note: `${ins.error ? `SEED: ${ins.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U168 W-18: "Kun mine" på tilbudslisten (egne vs. andres) + ukendt ?sortBy= giver ikke fejlside
      if (want('U168')) {
        const r: Record<string, boolean> = {}
        const t = `[HARNESS] kunmine ${stamp}`
        const ins = await c.admin.from('offers').insert([
          { offer_number: `UI-E2E-KM1-${stamp}`, title: `${t} egen`, status: 'draft', created_by: adminUser.id },
          { offer_number: `UI-E2E-KM2-${stamp}`, title: `${t} anden`, status: 'draft', created_by: salg.id },
        ]).select('id')
        const ids = ((ins.data ?? []) as { id: string }[]).map((x) => x.id)
        try {
          await gotoSafe(a.page, `${base}/dashboard/offers?search=${encodeURIComponent(t)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.begge_uden_filter = (await a.page.getByText(`${t} egen`).count()) > 0 && (await a.page.getByText(`${t} anden`).count()) > 0
          await a.page.getByTestId('offers-only-mine').check({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForURL(/mine=1/, { timeout: 30_000 }).catch(() => {})
          await a.page.waitForLoadState('networkidle').catch(() => {})
          r.kun_egen = (await a.page.getByText(`${t} egen`).count()) > 0 && (await a.page.getByText(`${t} anden`).count()) === 0
          await gotoSafe(a.page, `${base}/dashboard/offers?sortBy=bogus_column`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.ukendt_sort_ok = (await a.page.getByText('Kunne ikke hente tilbud').count()) === 0
        } finally {
          if (ids.length) await c.admin.from('offers').delete().in('id', ids)
        }
        out.push({ id: 'U168 tilbud: Kun mine + sikker sortering', ok: ids.length === 2 && Object.values(r).every(Boolean), note: `${ins.error ? `SEED: ${ins.error.message} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U167 W-3/W-11/W-9: materiale på sag fra leverandørkatalog (søgning med ord i omvendt rækkefølge → valg udfylder og
      // kobler varen), og "Påmind mig" på et lead giver en kalenderfil med alarm
      if (want('U167') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U167 grossist ${stamp}`, code: `HU167${stamp}` }]).select('id')
        const supId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = supId ? await c.admin.from('supplier_products').insert([{ supplier_id: supId, supplier_sku: `H167-${stamp}`, supplier_name: `Kabel PVIK 3G1,5 U167 ${stamp}`,
          cost_price: 10, unit: 'm', is_available: true }]).select('id') : null
        const spId = (sp?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] katalogmateriale ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] påmind ${stamp}`, contact_person: 'Påmind Kontakt', email: `u167-${stamp}@harness.test`,
          phone: '12345678', created_by: adminUser.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        const seedErr = spId && caseId && leadId ? '' : `SEED: ${sp?.error?.message ?? sc.error?.message ?? ld.error?.message ?? sup.error?.message ?? '?'} · `
        try {
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /Tilføj materiale/ }).first().click({ timeout: 60_000 }).catch(() => {})
          const dlg = a.page.locator('[aria-labelledby="case-material-dialog-title"]')
          await dlg.getByTestId('case-material-product-search').fill(`${stamp} pvik kabel`).catch(() => {})
          const hit = dlg.getByTestId('case-material-product-hits').getByText(`Kabel PVIK 3G1,5 U167 ${stamp}`)
          await hit.waitFor({ timeout: 60_000 }).catch(() => {})
          r.fundet_ord_i_vilkaarlig_orden = (await hit.count()) > 0
          await hit.first().click({ timeout: 30_000 }).catch(() => {})
          r.koblet = (await dlg.getByTestId('case-material-linked').count()) > 0
          await dlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
          type MatRow = { supplier_product_id?: string | null; sku_snapshot?: string | null; unit?: string; unit_cost?: number; unit_sales_price?: number }
          const readMat = async (): Promise<MatRow | null> => ((await c.admin.from('case_materials').select('supplier_product_id, sku_snapshot, unit, unit_cost, unit_sales_price').eq('case_id', caseId ?? '').maybeSingle()).data as MatRow | null)
          let m0 = await readMat()
          for (let i = 0; i < 20 && !m0; i++) { await new Promise((res) => setTimeout(res, 1000)); m0 = await readMat() }
          r.gemt_med_vare = !!m0 && m0.supplier_product_id === spId && m0.sku_snapshot === `H167-${stamp}` && m0.unit === 'm'
          r.kost_10_salg_over = Number(m0?.unit_cost) === 10 && Number(m0?.unit_sales_price) > 10
          await a.page.screenshot({ caret: 'initial', path: join(shots, 'u167-katalogmateriale.png'), fullPage: false }).catch(() => {})

          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('lead-follow-up').click({ timeout: 60_000 }).catch(() => {})
          const dl = a.page.waitForEvent('download', { timeout: 30_000 }).catch(() => null)
          await a.page.getByTestId('lead-follow-up-download').click({ timeout: 30_000 }).catch(() => {})
          const d = await dl
          const p = d ? await d.path().catch(() => null) : null
          const ics = p ? (await import('node:fs')).readFileSync(p, 'utf8') : ''
          r.ics_alarm = /BEGIN:VALARM/.test(ics) && /DTSTART;TZID=Europe\/Copenhagen:\d{8}T090000/.test(ics)
          r.ics_lead = ics.includes(`Opfølgning: [HARNESS] påmind ${stamp}`) && ics.includes('Tlf: 12345678')
        } finally {
          if (caseId) await c.admin.from('case_materials').delete().eq('case_id', caseId)
          if (supId) { await c.admin.from('supplier_products').delete().eq('supplier_id', supId); await c.admin.from('suppliers').delete().eq('id', supId) }
          if (leadId) await c.admin.from('leads').delete().eq('id', leadId)
        }
        out.push({ id: 'U167 katalogmateriale på sag + påmind lead', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U192 LD-5 (leads-review 2026-10-18): redigering af lead gemmes; en formular åbnet FØR leadet blev vundet må ikke
      // sætte det tilbage (compare-and-set på status/updated_at) og viser "ændret imens"
      if (want('U192')) {
        const r: Record<string, boolean> = {}
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] U192 ${stamp}`, contact_person: 'L', email: `u192-${stamp}@harness.test`,
          status: 'negotiation', source: 'website', created_by: adminUser.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        const readLead = async () => (await c.admin.from('leads').select('status, phone').eq('id', leadId ?? '').maybeSingle()).data as { status?: string; phone?: string | null } | null
        try {
          r.seed = !!leadId
          // 1) almindelig redigering
          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /^Rediger$/ }).first().click({ timeout: 60_000 }).catch(() => {})
          await a.page.locator('#phone').fill('11223344').catch(() => {})
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click({ timeout: 30_000 }).catch(() => {})
          let row = await readLead()
          for (let i = 0; i < 15 && row?.phone !== '11223344'; i++) { await new Promise((res) => setTimeout(res, 1000)); row = await readLead() }
          r.redigering_gemt = row?.phone === '11223344' && row?.status === 'negotiation'
          // LD-4: "Oprettet af" viser navnet (før altid "Ukendt" — profilerne blev aldrig slået op)
          const adminName = ((await c.admin.from('profiles').select('full_name').eq('id', adminUser.id).maybeSingle()).data as { full_name?: string | null } | null)?.full_name ?? ''
          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const bodyTxt = (await a.page.locator('body').textContent().catch(() => '')) ?? ''
          r.oprettet_af_navn = !!adminName && bodyTxt.includes(adminName)
          // LD-4: salg kan vælge en ansvarlig (før kun "Ikke tildelt" — listen krævede users.view)
          const sx = await login(await mkUser('salg'))
          try {
            await gotoSafe(sx.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await sx.page.getByRole('button', { name: /^Rediger$/ }).first().click({ timeout: 60_000 }).catch(() => {})
            const sel = sx.page.locator('#assigned_to')
            await sel.waitFor({ timeout: 30_000 }).catch(() => {})
            let n = 0
            for (let i = 0; i < 10 && n <= 1; i++) { n = await sel.locator('option').count().catch(() => 0); if (n <= 1) await sx.page.waitForTimeout(500) }
            r.salg_kan_tildele = n > 1
          } finally { await sx.ctx.close().catch(() => {}) }
          // 2) forældet formular: åbn, leadet vindes imens, gem
          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /^Rediger$/ }).first().click({ timeout: 60_000 }).catch(() => {})
          await a.page.locator('#phone').fill('99887766').catch(() => {})
          await c.admin.from('leads').update({ status: 'won' }).eq('id', leadId ?? '')
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click({ timeout: 30_000 }).catch(() => {})
          await a.page.getByText(/ændret imens/).first().waitFor({ timeout: 30_000 }).catch(() => {})
          r.besked_vist = (await a.page.getByText(/ændret imens/).count()) > 0
          row = await readLead()
          r.vundet_bevaret = row?.status === 'won' && row?.phone === '11223344'
        } finally {
          if (leadId) { await c.admin.from('lead_activities').delete().eq('lead_id', leadId); await c.admin.from('leads').delete().eq('id', leadId) }
        }
        out.push({ id: 'U192 lead-redigering: gemmes, forældet formular overskriver ikke', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U164 00231 (Henrik 2026-10-15): momsmode på kunden — admin vælger "Omvendt betalingspligt" i kundeformularen → gemt
      // + mærkat på kundesiden; nyt tilbud arver mode og viser at fakturering er blokeret
      if (want('U164')) {
        const r: Record<string, boolean> = {}
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-VAT-${stamp}`, company_name: `[HARNESS] moms ${stamp}`, contact_person: 'X', email: `vat-${stamp}@harness.test`, created_by: adminUser.id }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        let offerId: string | null = null
        try {
          await gotoSafe(a.page, `${base}/dashboard/customers/${custId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /Rediger/ }).first().click({ timeout: 30_000 }).catch(() => {})
          await a.page.getByTestId('customer-vat-mode').selectOption('reverse_charge').catch(() => {})
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click({ timeout: 30_000 }).catch(() => {})
          let mode = ''
          for (let i = 0; i < 15 && mode !== 'reverse_charge'; i++) {
            mode = String(((await c.admin.from('customers').select('vat_mode').eq('id', custId ?? '').maybeSingle()).data as { vat_mode?: string } | null)?.vat_mode ?? '')
            if (mode !== 'reverse_charge') await new Promise((res) => setTimeout(res, 1000))
          }
          r.gemt = mode === 'reverse_charge'
          await gotoSafe(a.page, `${base}/dashboard/customers/${custId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.maerkat = /Omvendt betalingspligt/i.test(((await a.page.getByTestId('customer-vat-mode').first().textContent().catch(() => '')) ?? ''))
          const { insertOfferWithNumber } = await import('../../src/lib/services/offer-number')
          const ni = await insertOfferWithNumber(c.admin, { title: `[HARNESS] moms ${stamp}`, customer_id: custId, status: 'draft', created_by: adminUser.id, tax_percentage: 25 })
          offerId = (ni.data as { id?: string } | null)?.id ?? null
          await gotoSafe(a.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('offer-vat-mode-warning').waitFor({ timeout: 60_000 }).catch(() => {})
          r.tilbud_advarsel = (await a.page.getByTestId('offer-vat-mode-warning').count()) === 1
        } finally {
          if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
          if (custId) await c.admin.from('customers').delete().eq('id', custId)
        }
        out.push({ id: 'U164 momsmode på kunde → tilbud', ok: !!custId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U163 00228 (Henrik 2026-10-15): fravær — admin registrerer; vises i kalenderen; planlægning på fraværsdag kræver
      // eksplicit bekræftelse (afvist → intet oprettet; bekræftet → oprettet + audit); bogholderi læser uden at kunne
      // skrive; montør har ingen adgang til siden
      if (want('U163') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const dayKey = (offset: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + offset * 86400_000))
        const d = dayKey(4)
        const empName = `Harness Fravær ${stamp}`
        const emp = await c.admin.from('employees').insert([{ name: empName, email: `fravaer-${stamp}@harness.test`, role: 'montør', active: true, cost_rate: 300, hourly_rate: 495 }]).select('id')
        const empId = (emp.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] fravær ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        try {
          await gotoSafe(a.page, `${base}/dashboard/absences`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('absence-employee').selectOption(empId ?? '').catch(() => {})
          await a.page.getByTestId('absence-kind').selectOption('ferie').catch(() => {})
          await a.page.getByTestId('absence-from').fill(d).catch(() => {})
          await a.page.getByTestId('absence-to').fill(d).catch(() => {})
          await a.page.getByTestId('absence-add').click({ timeout: 30_000 }).catch(() => {})
          let abs: Array<{ id: string }> = []
          for (let i = 0; i < 15 && !abs.length; i++) {
            abs = ((await c.admin.from('employee_absences').select('id').eq('employee_id', empId ?? '')).data ?? []) as Array<{ id: string }>
            if (!abs.length) await new Promise((res) => setTimeout(res, 1000))
          }
          r.registreret = abs.length === 1
          await gotoSafe(a.page, `${base}/dashboard/calendar?view=week&date=${d}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const row = a.page.locator('tr', { hasText: empName }).first()
          r.vist_i_kalender = (await row.getByTestId('calendar-absence').count()) >= 1
          // planlæg på fraværsdagen fra sagen — først afvis, så bekræft
          const planOnce = async (accept: boolean) => {
            await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
            await a.page.getByRole('button', { name: /Planlæg medarbejder/ }).first().click({ timeout: 30_000 }).catch(() => {})
            await a.page.locator('input[type="date"]').first().fill(d).catch(() => {})
            await a.page.locator('select').filter({ has: a.page.locator(`option[value="${empId}"]`) }).first().selectOption(empId ?? '').catch(() => {})
            const titleInput = a.page.getByPlaceholder(/El-installation/).first()
            if (await titleInput.count()) await titleInput.fill(`Fraværsjob ${stamp}`).catch(() => {})
            let msg = ''
            a.page.once('dialog', (dl) => { msg = dl.message(); (accept ? dl.accept() : dl.dismiss()).catch(() => {}) })
            await a.page.getByRole('button', { name: 'Opret arbejdsordre' }).click({ timeout: 30_000 }).catch(() => {})
            await a.page.waitForTimeout(2500)
            return msg
          }
          const m1 = await planOnce(false)
          const n1 = ((await c.admin.from('work_orders').select('id').eq('case_id', caseId ?? '')).data ?? []).length
          r.advarsel_vist = /har ferie/.test(m1)
          r.afvist_intet_oprettet = n1 === 0
          await planOnce(true)
          let wos: Array<{ id: string }> = []
          for (let i = 0; i < 10 && !wos.length; i++) {
            wos = ((await c.admin.from('work_orders').select('id').eq('case_id', caseId ?? '')).data ?? []) as Array<{ id: string }>
            if (!wos.length) await new Promise((res) => setTimeout(res, 1000))
          }
          r.bekraeftet_oprettet = wos.length === 1
          const aud = wos[0] ? ((await c.admin.from('audit_logs').select('action').eq('entity_id', wos[0].id).eq('action', 'planning_absence_override')).data ?? []) : []
          r.override_audit = aud.length === 1
          // FIN3-11 (2026-10-20): timer på fraværsdagen markeres i godkendelseslisten (advarsel, ikke blokering)
          if (wos[0] && empId) {
            const tl = await c.admin.from('time_logs').insert([{ work_order_id: wos[0].id, employee_id: empId, start_time: `${d}T10:00:00Z`, end_time: `${d}T11:00:00Z`, description: `Fraværstime ${stamp}`, billable: true }]).select('id')
            r.fravaerstime_gemt = !tl.error && (tl.data ?? []).length === 1
            await gotoSafe(a.page, `${base}/dashboard/time-approval`, { waitUntil: 'networkidle', timeout: 180_000 })
            const apRow = a.page.getByTestId('time-approval-row').filter({ hasText: `Fraværstime ${stamp}` }).first()
            await apRow.waitFor({ timeout: 30_000 }).catch(() => {})
            r.godkendelse_viser_fravaer = /Ferie/i.test(String(await apRow.getByTestId('time-approval-absence').textContent({ timeout: 10_000 }).catch(() => '')))
          }
          // bogholderi læser, kan ikke skrive; montør ingen adgang
          const bog = await login(await mkUser('bogholderi'))
          try {
            await gotoSafe(bog.page, `${base}/dashboard/absences`, { waitUntil: 'networkidle', timeout: 180_000 })
            await bog.page.getByTestId('absence-list').waitFor({ timeout: 30_000 }).catch(() => {})
            r.bogholderi_laeser = (await bog.page.getByTestId('absence-row').filter({ hasText: empName }).count()) === 1
            r.bogholderi_ingen_form = (await bog.page.getByTestId('absence-form').count()) === 0
          } finally { await bog.ctx.close().catch(() => {}) }
          const mo = await login(montor)
          try {
            await gotoSafe(mo.page, `${base}/dashboard/absences`, { waitUntil: 'networkidle', timeout: 180_000 })
            r.montoer_ingen_adgang = (await mo.page.getByTestId('absences-page').count()) === 0
          } finally { await mo.ctx.close().catch(() => {}) }
        } finally {
          if (caseId) { const w = ((await c.admin.from('work_orders').select('id').eq('case_id', caseId)).data ?? []) as Array<{ id: string }>; if (w.length) { await c.admin.from('time_logs').delete().in('work_order_id', w.map((x) => x.id)); await c.admin.from('work_orders').delete().in('id', w.map((x) => x.id)) } }
          if (empId) { await c.admin.from('employee_absences').delete().eq('employee_id', empId); await c.admin.from('employees').delete().eq('id', empId) }
        }
        out.push({ id: 'U163 fravær: kalender, advarsel + override + audit, roller', ok: !!empId && !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U48 lukke-værn: sag med ufaktureret materiale lukkes ikke stille
      if (want('U48') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] lukkeværn ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        u48CaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u48CaseId) await c.admin.from('case_materials').insert([{ case_id: u48CaseId, description: `Kabel ${stamp}`, quantity: 2, unit: 'stk',
          unit_cost: 100, unit_sales_price: 150, billable: true, source: 'manual', created_by: adminUser.id }])
        const statusOf = async () => String(((await c.admin.from('service_cases').select('status').eq('id', u48CaseId ?? '').maybeSingle()).data as { status?: string } | null)?.status ?? '')
        let dialogText = ''
        // 1) brugeren fortryder → sagen forbliver åben
        a.page.once('dialog', (d) => { dialogText = d.message(); d.dismiss().catch(() => {}) })
        await gotoSafe(a.page, `${base}/dashboard/orders/${u48CaseId}?tab=handlinger`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: 'Markér afsluttet' }).click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForTimeout(3000)
        r.advaret = /1 materiale for i alt 300,00 kr ekskl\. moms er ikke faktureret/.test(dialogText)
        r.forbliver_aaben = (await statusOf()) === 'in_progress'
        // 2) brugeren bekræfter → lukket + audit
        a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
        await a.page.getByRole('button', { name: 'Markér afsluttet' }).click({ timeout: 60_000 }).catch(() => {})
        let st = ''
        for (let i = 0; i < 20 && st !== 'closed'; i++) { st = await statusOf(); if (st !== 'closed') await new Promise((res) => setTimeout(res, 1000)) }
        r.lukket_efter_bekraeftelse = st === 'closed'
        // audit skrives efter status-opdateringen → poll (ellers race)
        let aud: Array<{ action_description: string | null }> = []
        for (let i = 0; i < 15 && !aud.some((x) => (x.action_description ?? '').includes('lukket trods')); i++) {
          if (i) await new Promise((res) => setTimeout(res, 1000))
          aud = ((await c.admin.from('audit_logs').select('action_description').eq('entity_id', u48CaseId ?? '')).data ?? []) as Array<{ action_description: string | null }>
        }
        r.audit_noterer = aud.some((x) => (x.action_description ?? '').includes('lukket trods'))
        out.push({ id: 'U48 lukke-værn (ufaktureret)', ok: !!u48CaseId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · dialog="${dialogText.slice(0, 90)}"` })
      }

      // U183 DF-6 (dataflow-review 2026-10-17): fastprissag med ufaktureret kontraktsum lukkes ikke stille
      if (want('U183') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U183 fastpris ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, billing_model: 'fixed_price', contract_sum: 10000 }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        let dialogText = ''
        try {
          a.page.once('dialog', (d) => { dialogText = d.message(); d.dismiss().catch(() => {}) })
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=handlinger`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: 'Markér afsluttet' }).click({ timeout: 60_000 }).catch(() => {})
          for (let i = 0; i < 10 && !dialogText; i++) await a.page.waitForTimeout(1000)
          r.advaret = /Fastpris: 10\.000,00 kr\. ekskl\. moms af kontraktsummen er ikke faktureret/.test(dialogText)
          r.forbliver_aaben = String(((await c.admin.from('service_cases').select('status').eq('id', caseId ?? '').maybeSingle()).data as { status?: string } | null)?.status ?? '') === 'in_progress'
        } finally {
          if (caseId) await c.admin.from('service_cases').delete().eq('id', caseId)
        }
        out.push({ id: 'U183 lukke-værn fastpris (rest af kontraktsum)', ok: !!caseId && Object.values(r).every(Boolean), note: `${sc.error?.message ?? ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · dialog="${dialogText.slice(0, 110)}"` })
      }

      // U49 dashboard: forfaldne fakturaer = samme regel som fakturalisten (dansk dato, ingen kreditnota/annulleret)
      if (want('U49') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
        // alle rækker samme nøgler (PostgREST-bulk-insert sætter manglende nøgler til NULL, ikke default)
        const base0 = { customer_id: profitCustomerId, status: 'sent', total_amount: 80, tax_amount: 20, final_amount: 100, invoice_type: 'standard', voided_at: null as string | null }
        const rows = [
          { ...base0, invoice_number: `UI-E2E-DO-${stamp}`, due_date: '2000-01-01' },
          { ...base0, invoice_number: `UI-E2E-DK-${stamp}`, due_date: '2000-01-01', invoice_type: 'credit', total_amount: -80, tax_amount: -20, final_amount: -100 },
          { ...base0, invoice_number: `UI-E2E-DV-${stamp}`, due_date: '2000-01-01', voided_at: new Date().toISOString() },
          { ...base0, invoice_number: `UI-E2E-DT-${stamp}`, due_date: today },
        ]
        const ins = await c.admin.from('invoices').insert(rows).select('id')
        u49Ids.push(...((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id))
        const resp = await gotoSafe(a.page, `${base}/api/dashboard/stats`, { waitUntil: 'load', timeout: 180_000 })
        let json: { overdue_invoices?: Array<{ invoice_number: string; days_overdue: number }> } = {}
        try { json = (await resp?.json()) ?? {} } catch { json = {} }
        const nums = (json.overdue_invoices ?? []).map((x) => x.invoice_number)
        r.forfalden_med = nums.includes(`UI-E2E-DO-${stamp}`)
        r.kreditnota_udeladt = !nums.includes(`UI-E2E-DK-${stamp}`)
        r.annulleret_udeladt = !nums.includes(`UI-E2E-DV-${stamp}`)
        r.forfald_i_dag_ikke_forfalden = !nums.includes(`UI-E2E-DT-${stamp}`)
        out.push({ id: 'U49 dashboard: forfaldne', ok: u49Ids.length === 4 && Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · seed=${u49Ids.length} ${ins.error?.message ?? ''}` })
      }

      // U193 PM2-1 (Henrik 2026-10-19): postkasse-afledt data kræver inbox.view — salg/bogholderi får hverken emne,
      // afsender eller antal fra stats-API'et, og cockpittets mailkort vises ikke; admin får dem stadig
      if (want('U193')) {
        const r: Record<string, boolean> = {}
        const subj = `[HARNESS] PM2-1 hemmeligt emne ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: `pm21-${stamp}@harness.test`, sender_name: 'PM2 Afsender', subject: subj,
          body_text: 'x', received_at: new Date().toISOString(), is_archived: false, link_status: 'unidentified' }]).select('id')
        const emId = (em.data?.[0] as { id?: string } | undefined)?.id
        if (emId) seededEmailIds.push(emId)
        type S = { access?: { inbox?: boolean }; counts?: { new_emails_last_24h?: number }; latest_emails?: Array<{ subject: string | null }> }
        const readStats = async (pg: typeof a.page): Promise<{ json: S; raw: string }> => {
          const resp = await gotoSafe(pg, `${base}/api/dashboard/stats`, { waitUntil: 'load', timeout: 180_000 })
          const raw = (await resp?.text().catch(() => '')) ?? ''
          let json: S = {}
          try { json = JSON.parse(raw) } catch { json = {} }
          return { json, raw }
        }
        const adminStats = await readStats(a.page)
        r.admin_ser_mail = adminStats.json.access?.inbox === true && (adminStats.json.counts?.new_emails_last_24h ?? 0) > 0
        for (const role of ['salg', 'bogholderi'] as const) {
          const x = await login(await mkUser(role))
          try {
            const st = await readStats(x.page)
            r[`${role}_intet_emne_i_api`] = !st.raw.includes(subj) && (st.json.latest_emails ?? []).length === 0
            r[`${role}_intet_antal`] = (st.json.counts?.new_emails_last_24h ?? 0) === 0 && st.json.access?.inbox === false
            await gotoSafe(x.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
            const body = (await x.page.locator('body').textContent().catch(() => '')) ?? ''
            r[`${role}_intet_mailkort`] = !body.includes('Mails kræver svar') && !body.includes(subj) && !body.includes('Seneste e-mails')
            // PM2-4: tilbudskort kun med offers.view (salg har det, bogholderi ikke)
            const offerCards = body.includes('Afventende tilbud') || body.includes('Seneste afviste tilbud')
            r[`${role}_tilbudskort_${role === 'salg' ? 'vist' : 'skjult'}`] = role === 'salg' ? offerCards : !offerCards
            // PM3-3/PM3-4: afvisningskort kun med offers.view; mailautomatik-kortet kun med inbox.view
            const rejCard = body.includes('Tabt omsætning')
            r[`${role}_afvisningskort_${role === 'salg' ? 'vist' : 'skjult'}`] = role === 'salg' ? rejCard : !rejCard
            r[`${role}_intet_mailautomatik`] = !body.includes('E-mail intelligens (i dag)')
          } finally { await x.ctx.close().catch(() => {}) }
        }
        out.push({ id: 'U193 PM2-1/PM2-4 postkasse og tilbud kun med ret', ok: !!emId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U194 PM2-2 (Henrik 2026-10-19): montør mister leads helt — listen og et lead via direkte URL giver "ingen adgang"
      // (søgning/Ctrl+K/eksport bruger samme leads.view-gate); salg har stadig adgang
      if (want('U194')) {
        const r: Record<string, boolean> = {}
        const lname = `[HARNESS] PM2-2 lead ${stamp}`
        const ld = await c.admin.from('leads').insert([{ company_name: lname, contact_person: 'PM2', email: `pm22-${stamp}@harness.test`, phone: '12121212',
          status: 'new', source: 'website', created_by: adminUser.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          r.seed = !!leadId
          const m = await login(montor)
          try {
            await gotoSafe(m.page, `${base}/dashboard/leads`, { waitUntil: 'networkidle', timeout: 180_000 })
            const listTxt = (await m.page.locator('body').textContent().catch(() => '')) ?? ''
            r.montoer_liste_ingen_adgang = /ikke adgang/i.test(listTxt) && !listTxt.includes(lname)
            await gotoSafe(m.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            const detTxt = (await m.page.locator('body').textContent().catch(() => '')) ?? ''
            r.montoer_url_ingen_adgang = /ikke adgang/i.test(detTxt) && !detTxt.includes('pm22-')
          } finally { await m.ctx.close().catch(() => {}) }
          const s = await login(await mkUser('salg'))
          try {
            await gotoSafe(s.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await s.page.getByText(lname).first().waitFor({ timeout: 30_000 }).catch(() => {})
            r.salg_ser_lead = (await s.page.getByText(lname).count()) > 0
          } finally { await s.ctx.close().catch(() => {}) }
        } finally {
          if (leadId) { await c.admin.from('lead_activities').delete().eq('lead_id', leadId); await c.admin.from('leads').delete().eq('id', leadId) }
        }
        out.push({ id: 'U194 PM2-2 montør uden leads', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U195 PM2-3 (Henrik 2026-10-19): eksport af hele kunderegistret kun admin + bogholderi — knappen vises ikke for
      // serviceleder/salg/montør (serveren afviser dem også: exportCustomers kræver reports.export)
      if (want('U195')) {
        const r: Record<string, boolean> = {}
        const btnCount = async (pg: typeof a.page) => {
          await gotoSafe(pg, `${base}/dashboard/customers`, { waitUntil: 'networkidle', timeout: 180_000 })
          await pg.waitForTimeout(1500)
          return pg.getByRole('button', { name: 'Eksportér kunder' }).count()
        }
        r.admin_har_eksport = (await btnCount(a.page)) === 1
        for (const role of ['bogholderi', 'serviceleder', 'salg', 'montør'] as const) {
          const x = await login(role === 'montør' ? montor : await mkUser(role))
          try {
            const n = await btnCount(x.page)
            r[`${role}_${role === 'bogholderi' ? 'har' : 'ingen'}_eksport`] = role === 'bogholderi' ? n === 1 : n === 0
          } finally { await x.ctx.close().catch(() => {}) }
        }
        out.push({ id: 'U195 PM2-3 fuld kundeeksport kun admin/bogholderi', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U198 PM2-8/PM2-9 (Henrik 2026-10-19: ingen redigerbar formular serveren afviser): salg ser ikke "Nyt produkt";
      // serviceleder ser virksomhedsindstillingerne låst; admin kan begge
      if (want('U198')) {
        const r: Record<string, boolean> = {}
        const lockNotice = /Kun administratorer kan ændre/
        await gotoSafe(a.page, `${base}/dashboard/products`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.admin_nyt_produkt = (await a.page.getByRole('button', { name: /Nyt produkt/ }).count()) === 1
        await gotoSafe(a.page, `${base}/dashboard/settings/company`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.admin_ikke_laast = !lockNotice.test(((await a.page.locator('body').textContent().catch(() => '')) ?? ''))
        const s = await login(await mkUser('salg'))
        try {
          await gotoSafe(s.page, `${base}/dashboard/products`, { waitUntil: 'networkidle', timeout: 180_000 })
          await s.page.waitForTimeout(1500)
          r.salg_intet_nyt_produkt = (await s.page.getByRole('button', { name: /Nyt produkt/ }).count()) === 0
        } finally { await s.ctx.close().catch(() => {}) }
        const sl = await login(await mkUser('serviceleder'))
        try {
          await gotoSafe(sl.page, `${base}/dashboard/settings/company`, { waitUntil: 'networkidle', timeout: 180_000 })
          await sl.page.waitForTimeout(1500)
          r.serviceleder_laast = lockNotice.test(((await sl.page.locator('body').textContent().catch(() => '')) ?? ''))
          const firstInput = sl.page.locator('fieldset[disabled] input').first() // ikke headerens søgefelt
          r.serviceleder_felter_deaktiveret = (await firstInput.count()) > 0 && (await firstInput.isDisabled().catch(() => false))
        } finally { await sl.ctx.close().catch(() => {}) }
        out.push({ id: 'U198 PM2-8/9 ingen redigerbar formular uden ret', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U199 PM2-10/PM2-13: montør ser ikke "Tilføj kontakt"/"Ny Kunde"; serviceleder får "ingen adgang" på Team (ikke en
      // rød fejl) og besked om at Audit kun viser egne hændelser; salg kan oprette kunder
      if (want('U199') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const m = await login(montor)
        try {
          await gotoSafe(m.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.getByText('Kontaktpersoner').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.montoer_ingen_tilfoej_kontakt = (await m.page.getByRole('button', { name: /Tilføj kontakt/ }).count()) === 0
          await gotoSafe(m.page, `${base}/dashboard/customers`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForTimeout(1500)
          r.montoer_ingen_ny_kunde = (await m.page.getByRole('button', { name: /^Ny Kunde$/ }).count()) === 0
        } finally { await m.ctx.close().catch(() => {}) }
        const s = await login(await mkUser('salg'))
        try {
          await gotoSafe(s.page, `${base}/dashboard/customers`, { waitUntil: 'networkidle', timeout: 180_000 })
          await s.page.getByRole('button', { name: /^Ny Kunde$/ }).first().waitFor({ timeout: 30_000 }).catch(() => {})
          r.salg_ny_kunde = (await s.page.getByRole('button', { name: /^Ny Kunde$/ }).count()) === 1
        } finally { await s.ctx.close().catch(() => {}) }
        const sl = await login(await mkUser('serviceleder'))
        try {
          await gotoSafe(sl.page, `${base}/dashboard/settings/team`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.serviceleder_team_ingen_adgang = /ikke adgang/i.test(((await sl.page.locator('body').textContent().catch(() => '')) ?? ''))
          await gotoSafe(sl.page, `${base}/dashboard/settings/audit`, { waitUntil: 'networkidle', timeout: 180_000 })
          r.serviceleder_audit_besked = /kun dine egne hændelser/i.test(((await sl.page.locator('body').textContent().catch(() => '')) ?? ''))
        } finally { await sl.ctx.close().catch(() => {}) }
        out.push({ id: 'U199 PM2-10/13 knapper og sider efter rolle', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U200 PM3-7: mailens brødtekst hentes kun for en mail der hører til kunden — regression: salg åbner en koblet mail
      // på kundekortet og ser stadig indholdet (body-kaldet tager nu kunde-id og afviser mails koblet til andre kunder)
      if (want('U200') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const subj = `[HARNESS] U200 kundemail ${stamp}`
        const bodyStamp = `U200-indhold-${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: `ui-profit-${stamp}@harness.test`, subject: subj, customer_id: profitCustomerId,
          body_text: bodyStamp, received_at: new Date().toISOString(), is_archived: false, link_status: 'linked' }]).select('id')
        const emId = (em.data?.[0] as { id?: string } | undefined)?.id
        if (emId) seededEmailIds.push(emId)
        const s = await login(await mkUser('salg'))
        try {
          await gotoSafe(s.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await s.page.getByText(subj).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.mail_vist = (await s.page.getByText(subj).count()) > 0
          if (r.mail_vist) await s.page.getByText(subj).first().click().catch(() => {})
          await s.page.getByText(bodyStamp).first().waitFor({ timeout: 30_000 }).catch(() => {})
          r.indhold_vist = (await s.page.getByText(bodyStamp).count()) > 0
        } finally { await s.ctx.close().catch(() => {}) }
        out.push({ id: 'U200 PM3-7 salg ser koblet mails indhold', ok: !!emId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${emId ? '' : ` · SEED: ${em.error?.message}`}` })
      }

      // U201 PM3-8: mailknappen på opgavesiden kun med tasks.edit (sendTaskEmail afviser ellers) — salg ser sin egen opgave
      // uden mailknap; montør (tasks.edit) ser mailknappen på sin tildelte opgave
      if (want('U201') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const salg = await mkUser('salg')
        const ins = await c.admin.from('customer_tasks').insert([
          { customer_id: profitCustomerId, title: `[HARNESS] U201 salg ${stamp}`, priority: 'normal', created_by: salg.id, assigned_to: salg.id },
          { customer_id: profitCustomerId, title: `[HARNESS] U201 montør ${stamp}`, priority: 'normal', created_by: adminUser.id, assigned_to: montor.id },
        ]).select('id')
        const ids = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = ids.length === 2
        const mailBtns = async (pg: typeof a.page, title: string) => {
          await gotoSafe(pg, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
          await pg.getByText(title).first().waitFor({ timeout: 60_000 }).catch(() => {})
          const seen = (await pg.getByText(title).count()) > 0
          return { seen, mail: await pg.getByRole('button', { name: /^Send mail til / }).count() }
        }
        try {
          const s = await login(salg)
          try { const x = await mailBtns(s.page, `[HARNESS] U201 salg ${stamp}`); r.salg_ser_opgave = x.seen; r.salg_ingen_mailknap = x.seen && x.mail === 0 }
          finally { await s.ctx.close().catch(() => {}) }
          const m = await login(montor)
          try {
            const x = await mailBtns(m.page, `[HARNESS] U201 montør ${stamp}`); r.montoer_ser_opgave = x.seen; r.montoer_mailknap = x.mail > 0
            // PM3-8 (Henrik 2026-10-19): montørens dialog — modtager kun fra listen (skrivebeskyttet), ingen Cc. Intet sendes.
            if (x.mail > 0) {
              await m.page.getByRole('button', { name: /^Send mail til / }).first().click({ timeout: 30_000 }).catch(() => {})
              const inp = m.page.getByTestId('recipient-picker-input').first()
              await inp.waitFor({ timeout: 30_000 }).catch(() => {})
              r.montoer_modtager_skrivebeskyttet = (await inp.getAttribute('readonly').catch(() => null)) !== null
              r.montoer_ingen_cc = (await m.page.getByRole('button', { name: /Tilføj Cc/ }).count()) === 0
            }
          } finally { await m.ctx.close().catch(() => {}) }
        } finally { if (ids.length) await c.admin.from('customer_tasks').delete().in('id', ids) }
        out.push({ id: 'U201 PM3-8 opgavemail kun med tasks.edit', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${ins.error ? ` · SEED: ${ins.error.message}` : ''}` })
      }

      // U215 DB-15f/g: cockpittets mail-kort linker med samme tidsvindue som tallet (?days=14 / ?days=90), og mail-listen
      // filtrerer på det (chip + "Vis alle"); en 120 dage gammel webhenvendelse er med uden vindue, ikke med 90 dage
      if (want('U215')) {
        const r: Record<string, boolean> = {}
        const subj = `Ny henvendelse fra eltasolar.dk [HARNESS] U215 ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit', subject: subj,
          body_text: 'Navn: U215', link_status: 'unidentified', received_at: new Date(Date.now() - 120 * 86_400_000).toISOString(), is_archived: false, is_read: true }]).select('id')
        const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (id) u113EmailIds.push(id)
        r.seed = !!id
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.waitForTimeout(1500)
        r.link_kraever_svar_14 = (await a.page.locator('a[href="/dashboard/mail?filter=requires_response&days=14"]').count()) > 0
        r.link_web_90 = (await a.page.locator('a[href="/dashboard/mail?filter=webform&days=90"]').count()) > 0
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform&days=90&search=${encodeURIComponent(`U215 ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('mail-days-chip').first().waitFor({ timeout: 45_000 }).catch(() => {})
        r.chip = (await a.page.getByTestId('mail-days-chip').count()) > 0
        await a.page.waitForTimeout(1500)
        r.gammel_skjult_i_90 = (await a.page.getByText(subj).count()) === 0
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform&search=${encodeURIComponent(`U215 ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(subj).first().waitFor({ timeout: 45_000 }).catch(() => {})
        r.gammel_vist_uden_vindue = (await a.page.getByText(subj).count()) > 0
        out.push({ id: 'U215 DB-15f/g mail-kort med tidsvindue', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U211 ADDR-1 (Henrik 2026-10-19): adresseopslag er slået fra (DAWA 410 Gone, ingen udbyder konfigureret) — feltet er
      // fritekst med en note, og der kaldes ikke DAWA fra browseren
      if (want('U211') && profitCustomerId && process.env.UI_ADDRESS_LOOKUP !== '1') {
        const r: Record<string, boolean> = {}
        const dawaCalls: string[] = []
        a.page.on('request', (req) => { if (/dataforsyningen\.dk/.test(req.url())) dawaCalls.push(req.url()) })
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Rediger/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const f = a.page.locator('#billing_address')
        await f.waitFor({ timeout: 30_000 }).catch(() => {})
        await f.fill('').catch(() => {})
        await f.type('Testvej 12', { delay: 30 }).catch(() => {})
        await a.page.getByTestId('address-lookup-off').first().waitFor({ timeout: 20_000 }).catch(() => {})
        r.note_vist = (await a.page.getByTestId('address-lookup-off').count()) > 0
        r.fritekst_bevaret = ((await f.inputValue().catch(() => '')) ?? '') === 'Testvej 12'
        r.ingen_dawa_fra_browser = dawaCalls.length === 0
        // ADDR-1: byen kan skrives manuelt (før skrivebeskyttet → uden opslag kunne den slet ikke udfyldes)
        await a.page.locator('#billing_city').fill('Testby').catch(() => {})
        r.by_kan_skrives = ((await a.page.locator('#billing_city').inputValue().catch(() => '')) ?? '') === 'Testby'
        await a.page.keyboard.press('Escape').catch(() => {})
        out.push({ id: 'U211 ADDR-1 adresseopslag slået fra, manuel indtastning virker', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U212 ADDR-1 (staging-test, UI_ADDRESS_LOOKUP=1): Adressevælger-forslag → valg → opslag udfylder vej/postnr./by;
      // postnummer → by fra DAR-datasættet; ukendt postnummer udfylder intet; manuel tekst er stadig mulig
      if (want('U212') && profitCustomerId && process.env.UI_ADDRESS_LOOKUP === '1') {
        const r: Record<string, boolean> = {}
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Rediger/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const f = a.page.locator('#billing_address')
        await f.waitFor({ timeout: 30_000 }).catch(() => {})
        await f.fill('').catch(() => {})
        await f.type('Ålekistevej 12, 2720', { delay: 40 }).catch(() => {})
        const opt = a.page.getByRole('button', { name: /Ålekistevej 12, 2720 Vanløse/ }).first()
        await opt.waitFor({ timeout: 20_000 }).catch(() => {})
        r.forslag_vist = (await opt.count()) > 0
        r.ingen_slaaet_fra_note = (await a.page.getByTestId('address-lookup-off').count()) === 0
        await opt.click({ timeout: 10_000 }).catch(() => {})
        await a.page.waitForTimeout(2500)
        r.vej_udfyldt = /Ålekistevej 12/.test((await f.inputValue().catch(() => '')) ?? '')
        r.postnr_udfyldt = ((await a.page.locator('#billing_postal_code').inputValue().catch(() => '')) ?? '') === '2720'
        r.by_udfyldt = ((await a.page.locator('#billing_city').inputValue().catch(() => '')) ?? '') === 'Vanløse'
        const pc = a.page.locator('#billing_postal_code')
        const city = a.page.locator('#billing_city')
        await city.fill('').catch(() => {})
        await pc.fill('4583').catch(() => {})
        await a.page.waitForTimeout(2000)
        r.postnr_til_by = ((await city.inputValue().catch(() => '')) ?? '') === 'Sjællands Odde'
        await city.fill('Min by').catch(() => {})
        await pc.fill('0000').catch(() => {})
        await a.page.waitForTimeout(2000)
        const cityAfterUnknown = (await city.inputValue().catch(() => '')) ?? ''
        r.ukendt_postnr_ingen_autofyld = cityAfterUnknown === 'Min by'
        await f.fill('Fritekstvej 1').catch(() => {})
        r.manuel_tekst_mulig = ((await f.inputValue().catch(() => '')) ?? '') === 'Fritekstvej 1'
        await a.page.keyboard.press('Escape').catch(() => {})
        out.push({ id: 'U212 ADDR-1 Adressevælger + DAR-postnumre (staging)', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · by efter 0000="${cityAfterUnknown}"` })
      }

      // U203 LG-10: kunderedigering logger kun ÆNDREDE felter, og personfelter uden værdier (før: alle felter som
      // {old:'previous', new:<værdi>} → falsk diff + kontaktdata kopieret ind i audit_logs)
      if (want('U203') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const newPhone = `+45 9${String(Date.now()).slice(-7)}`
        const since = new Date(Date.now() - 5_000).toISOString()
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Rediger/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const phone = a.page.locator('#phone')
        await phone.waitFor({ timeout: 30_000 }).catch(() => {})
        await phone.fill(newPhone).catch(() => {})
        await a.page.getByRole('button', { name: /^Gem ændringer$/ }).click({ timeout: 30_000 }).catch(() => {})
        let row: { changes?: Record<string, { old: unknown; new: unknown }> | null } | null = null
        for (let i = 0; i < 20 && !row; i++) {
          await a.page.waitForTimeout(1000)
          row = ((await c.admin.from('audit_logs').select('changes').eq('entity_id', profitCustomerId).eq('action', 'update')
            .gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle()).data) as typeof row
        }
        const ch = row?.changes ?? {}
        const json = JSON.stringify(ch)
        r.logget = !!row
        r.telefon_som_aendret = ch.phone?.old === '[ændret]' && ch.phone?.new === '[ændret]'
        r.ingen_telefonvaerdi = !json.includes(newPhone.replace(/\s/g, '').slice(-7))
        r.ingen_uaendrede_felter = !('email' in ch) && !('company_name' in ch)
        r.ingen_falsk_previous = !json.includes('"previous"')
        out.push({ id: 'U203 LG-10 ægte audit-diff uden personværdier', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · felter=${Object.keys(ch).join(',')}` })
      }

      // U210 NEXT-52 dead ends: salg ser ikke sagsfaner serveren afviser (Planlægning, Materialer, Øvrige, Fakturakladde);
      // montør ser ikke Fakturaer-fanen, upload/del, portal-oprettelse, partnerportal eller chat på kundekortet
      if (want('U210') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sx = await mkUser('salg')
        const cs = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U210 ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: sx.id, assigned_to: sx.id }]).select('id')
        const caseId = (cs.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        r.seed = !!caseId
        const sp = await login(sx)
        try {
          await gotoSafe(sp.page, `${base}/dashboard/orders/${caseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await sp.page.getByRole('button', { name: /^Overblik$/ }).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.salg_ser_sag = (await sp.page.getByRole('button', { name: /^Overblik$/ }).count()) > 0
          for (const [k, re] of [['planlaegning', /^Planlægning/], ['materialer', /^Materialer$/], ['oevrige', /^Øvrige omkostninger$/], ['fakturakladde', /^Fakturakladde$/], ['aktivitet', /^Aktivitet$/]] as const) {
            r[`salg_ingen_${k}`] = (await sp.page.getByRole('button', { name: re }).count()) === 0
          }
          // DE2-1..3 (2026-10-20): Overblik har ingen links/knapper til faktura-sider salg ikke kan åbne
          await sp.page.waitForTimeout(2000)
          r.salg_ingen_fakturalink = (await sp.page.locator('a[href^="/dashboard/invoices"]').count()) === 0
          r.salg_ingen_aabn_kladde = (await sp.page.getByRole('button', { name: /Åbn fakturakladde/ }).count()) === 0
          await gotoSafe(sp.page, `${base}/dashboard/orders/${caseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          await sp.page.waitForTimeout(1500)
          r.salg_deeplink_ingen_evig_hentning = (await sp.page.getByText('Henter planlagte arbejdsordrer').count()) === 0
        } finally { await sp.ctx.close().catch(() => {}) }
        // PR4-1 positiv kontrol: admin har stadig Aktivitet-fanen
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /^Overblik$/ }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.admin_har_aktivitet = (await a.page.getByRole('button', { name: /^Aktivitet$/ }).count()) > 0
        const m = await login(montor)
        try {
          await gotoSafe(m.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.getByText('Kontaktpersoner').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.montoer_ingen_fakturaer_fane = (await m.page.getByRole('button', { name: /^Fakturaer$/ }).count()) === 0
          r.montoer_ingen_portal_opret = (await m.page.getByRole('button', { name: /Opret adgang/ }).count()) === 0
          r.montoer_ingen_chat = (await m.page.getByRole('button', { name: /^Start chat$/ }).count()) === 0
          await m.page.getByRole('button', { name: /^Dokumenter$/ }).first().click({ timeout: 30_000 }).catch(() => {})
          await m.page.waitForTimeout(2000)
          r.montoer_ingen_upload = (await m.page.getByRole('button', { name: /Upload (fil|din første fil)/ }).count()) === 0
        } finally { await m.ctx.close().catch(() => {}) }
        const b = await login(await mkUser('bogholderi'))
        try {
          await gotoSafe(b.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await b.page.getByText('Kontaktpersoner').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.bog_ser_fakturaer_fane = (await b.page.getByRole('button', { name: /^Fakturaer$/ }).count()) > 0
          r.bog_ingen_partnerportal = (await b.page.getByText('Partner-portal', { exact: true }).count()) === 0
        } finally { await b.ctx.close().catch(() => {}) }
        out.push({ id: 'U210 NEXT-52 ingen faner/knapper serveren afviser', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U208 API-4 (Henrik 2026-10-19): lead med samme e-mail som en eksisterende kunde viser "Mulig eksisterende kunde";
      // koblingen sker først når brugeren bekræfter
      if (want('U208')) {
        const r: Record<string, boolean> = {}
        const em = `u208-${stamp}@harness.test`
        const cu = await c.admin.from('customers').insert([{ customer_number: `U208-${stamp}`, company_name: `[HARNESS] U208 kunde ${stamp}`, contact_person: 'K',
          email: em, created_by: adminUser.id }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] U208 lead ${stamp}`, contact_person: 'Web Kunde', email: em, status: 'new',
          source: 'website', created_by: adminUser.id, custom_fields: { inquiry_type: 'Solceller' } }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!custId && !!leadId
        try {
          await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('lead-possible-existing').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.banner_mulig_kunde = (await a.page.getByTestId('lead-possible-existing').count()) > 0
          const before = ((await c.admin.from('leads').select('custom_fields').eq('id', leadId ?? '').maybeSingle()).data as { custom_fields?: Record<string, unknown> } | null)?.custom_fields ?? {}
          r.ikke_koblet_foer = !before.customer_id
          await a.page.getByTestId('lead-link-candidate').first().click({ timeout: 30_000 }).catch(() => {})
          let after: Record<string, unknown> = {}
          for (let i = 0; i < 20; i++) {
            await a.page.waitForTimeout(1000)
            after = ((await c.admin.from('leads').select('custom_fields').eq('id', leadId ?? '').maybeSingle()).data as { custom_fields?: Record<string, unknown> } | null)?.custom_fields ?? {}
            if (after.customer_id) break
          }
          r.koblet_efter_bekraeftelse = after.customer_id === custId
        } finally {
          if (leadId) { await c.admin.from('lead_activities').delete().eq('lead_id', leadId); await c.admin.from('leads').delete().eq('id', leadId) }
          if (custId) await c.admin.from('customers').delete().eq('id', custId)
        }
        out.push({ id: 'U208 API-4 mulig eksisterende kunde bekræftes', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U222 SEC-B2/B3 (scope-review 2026-10-22): sagens redigeringsformular — lukning med arbejdsordre i gang afvises (SC-2),
      // revideret sum på en faktureret sag kræver bekræftelse + audit (IV2-4), et direkte kald kan ikke sætte fakturamodel/
      // flag, og en tilladt lukning auditeres som statusskift.
      if (want('U222') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const cs = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U222 sag ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, contract_sum: 10000, revised_sum: 10000 }]).select('id, billing_model, low_profit')
        const caseRow = (cs.data?.[0] as { id?: string; billing_model?: string | null; low_profit?: boolean | null } | undefined) ?? null
        const caseId = caseRow?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        const wo = caseId ? await c.admin.from('work_orders').insert([{ case_id: caseId, title: `U222 job ${stamp}`, status: 'in_progress' }]).select('id') : null
        const woId = (wo?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const inv = caseId ? await c.admin.from('invoices').insert([{ invoice_number: `U222-${stamp}`, customer_id: profitCustomerId, case_id: caseId, status: 'sent',
          sent_at: new Date().toISOString(), total_amount: 800, tax_amount: 200, final_amount: 1000, due_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) }]).select('id') : null
        const invId = (inv?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!caseId && !!woId && !!invId
        const row = async () => ((await c.admin.from('service_cases').select('status, revised_sum, billing_model, low_profit, title').eq('id', caseId ?? '').maybeSingle()).data ?? {}) as { status?: string; revised_sum?: number; billing_model?: string | null; low_profit?: boolean | null; title?: string }
        const save = async (fill: () => Promise<void>, accept: boolean) => {
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}/edit`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.locator('select[name="status"]').waitFor({ timeout: 60_000 }).catch(() => {})
          await fill()
          const seen: string[] = []
          const onDialog = (d: import('playwright').Dialog) => { seen.push(d.message()); void (accept ? d.accept() : d.dismiss()) }
          a.page.on('dialog', onDialog)
          await a.page.getByRole('button', { name: /^Gem ændringer$/ }).click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForTimeout(5000)
          a.page.off('dialog', onDialog)
          return { seen, body: (await a.page.locator('body').textContent().catch(() => '')) ?? '' }
        }
        try {
          // 1) lukning med job i gang → afvist, sagen åben
          const s1 = await save(async () => { await a.page.locator('select[name="status"]').selectOption('closed').catch(() => {}) }, true)
          r.lukning_med_job_afvist = (await row()).status === 'in_progress' && /arbejdsordre[^]*i gang/i.test(s1.body)
          // 2) revideret sum: spørges, annuller → uændret; bekræft → gemt + audit
          const s2 = await save(async () => { await a.page.locator('input[name="revised_sum"]').fill('8000').catch(() => {}) }, false)
          r.revideret_spoerges = s2.seen.some((m) => /Revideret sum/.test(m) && /faktura/i.test(m))
          r.revideret_annuller_uaendret = Number((await row()).revised_sum) === 10000
          await save(async () => { await a.page.locator('input[name="revised_sum"]').fill('8000').catch(() => {}) }, true)
          let rv = 0
          for (let i = 0; i < 10 && rv !== 8000; i++) { rv = Number((await row()).revised_sum); if (rv !== 8000) await a.page.waitForTimeout(1000) }
          r.revideret_gemt = rv === 8000
          const aud = ((await c.admin.from('audit_logs').select('action, changes').eq('entity_id', caseId ?? '')).data ?? []) as Array<{ action: string; changes: Record<string, { old: unknown; new: unknown }> | null }>
          r.revideret_auditeret = aud.some((x) => Number(x.changes?.revised_sum?.old) === 10000 && Number(x.changes?.revised_sum?.new) === 8000)
          // 3) direkte kald: fakturamodel/flag ignoreres, almindeligt felt gemmes
          const before = await row()
          const raw = await callServerAction(a.page, `${base}/dashboard/orders/${caseId}/edit`, 'src/lib/actions/service-cases.ts', 'updateServiceCase',
            [caseId, { title: `[HARNESS] U222 omdøbt ${stamp}`, billing_model: before.billing_model === 'fixed_price' ? 'time_and_materials' : 'fixed_price', low_profit: !before.low_profit, customer_signature: 'data:x' }])
          const after = await row()
          r.direkte_kald_svarer = raw.includes('"success":true')
          r.felt_gemt = after.title === `[HARNESS] U222 omdøbt ${stamp}`
          r.fakturamodel_uaendret = (after.billing_model ?? null) === (before.billing_model ?? null)
          r.flag_uaendret = !!after.low_profit === !!before.low_profit
          // 4) job afsluttet → lukning via formularen virker og auditeres som statusskift
          await c.admin.from('work_orders').update({ status: 'done' }).eq('id', woId ?? '')
          await save(async () => { await a.page.locator('select[name="status"]').selectOption('closed').catch(() => {}) }, true)
          let st = ''
          for (let i = 0; i < 10 && st !== 'closed'; i++) { st = (await row()).status ?? ''; if (st !== 'closed') await a.page.waitForTimeout(1000) }
          r.lukket_efter_job = st === 'closed'
          const aud2 = ((await c.admin.from('audit_logs').select('action, changes').eq('entity_id', caseId ?? '').eq('action', 'status_change')).data ?? []) as Array<{ changes: Record<string, { old: unknown; new: unknown }> | null }>
          r.lukning_auditeret = aud2.some((x) => x.changes?.status?.new === 'closed')
        } finally {
          if (invId) await c.admin.from('invoices').delete().eq('id', invId)
          if (woId) await c.admin.from('work_orders').delete().eq('id', woId)
        }
        out.push({ id: 'U222 SEC-B2/B3 sagsformular: lukke-værn, revideret sum, ingen massetildeling, status-audit', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U209 IV2-4 (Henrik 2026-10-19): kontraktsum på en sag fra et accepteret tilbud ændres kun efter bekræftelse og
      // auditeres; annulleres bekræftelsen, gemmes intet
      if (want('U209') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const of = await c.admin.from('offers').insert([{ offer_number: `U209-${stamp}`, title: `[HARNESS] U209 ${stamp}`, created_by: adminUser.id,
          customer_id: profitCustomerId, status: 'accepted', accepted_at: new Date().toISOString() }]).select('id')
        const offId = (of.data?.[0] as { id?: string } | undefined)?.id ?? null
        const cs = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U209 sag ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, source_offer_id: offId, contract_sum: 10000 }]).select('id')
        const caseId = (cs.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        r.seed = !!offId && !!caseId
        const sum = async () => Number(((await c.admin.from('service_cases').select('contract_sum').eq('id', caseId ?? '').maybeSingle()).data as { contract_sum?: number } | null)?.contract_sum)
        const edit = async (value: string, accept: boolean) => {
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}/edit`, { waitUntil: 'networkidle', timeout: 180_000 })
          const f = a.page.locator('input[name="contract_sum"]')
          await f.waitFor({ timeout: 60_000 }).catch(() => {})
          await f.fill(value).catch(() => {})
          let seen = ''
          a.page.once('dialog', (d) => { seen = d.message(); void (accept ? d.accept() : d.dismiss()) })
          await a.page.getByRole('button', { name: /^Gem ændringer$/ }).click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForTimeout(4000)
          return seen
        }
        try {
          const m1 = await edit('12000', false)
          r.spoerges = /accepterede tilbud/i.test(m1)
          r.annuller_gemmer_intet = (await sum()) === 10000
          const m2 = await edit('12000', true)
          r.spoerges_igen = /accepterede tilbud/i.test(m2)
          let v = 0
          for (let i = 0; i < 15 && v !== 12000; i++) { v = await sum(); if (v !== 12000) await a.page.waitForTimeout(1000) }
          r.gemt_efter_bekraeftelse = v === 12000
          const aud = ((await c.admin.from('audit_logs').select('changes').eq('entity_id', caseId ?? '').eq('action', 'update')).data ?? []) as Array<{ changes: Record<string, { old: unknown; new: unknown }> | null }>
          r.auditeret = aud.some((x) => Number(x.changes?.contract_sum?.old) === 10000 && Number(x.changes?.contract_sum?.new) === 12000)
        } finally { if (offId) await c.admin.from('offers').delete().eq('id', offId).then(() => {}, () => {}) }
        out.push({ id: 'U209 IV2-4 kontraktsum kræver bekræftelse + audit', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U207 API-2 (Henrik 2026-10-19): salg ser kun egne tilbud (oprettet / på en sag i eget sags-scope) — liste, PDF og
      // eksport; admin ser alle. Før kunne enhver sælger læse alle tilbud inkl. underskrift.
      if (want('U207') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U207-${stamp}`
        const sA = await mkUser('salg')
        const sB = await mkUser('salg')
        const cs = await c.admin.from('service_cases').insert([{ title: `[HARNESS] ${tag} sag`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, assigned_to: sB.id }]).select('id')
        const caseId = (cs.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        const of = await c.admin.from('offers').insert([
          { offer_number: `${tag}-A`, title: `[HARNESS] ${tag} andens`, created_by: sA.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString() },
          { offer_number: `${tag}-C`, title: `[HARNESS] ${tag} egen sag`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(), converted_case_id: caseId },
        ]).select('id, offer_number')
        const offs = (of.data ?? []) as Array<{ id: string; offer_number: string }>
        const foreign = offs.find((o) => o.offer_number.endsWith('-A'))?.id
        const viaCase = offs.find((o) => o.offer_number.endsWith('-C'))?.id
        r.seed = !!foreign && !!viaCase && !!caseId
        try {
          const b = await login(sB)
          try {
            await gotoSafe(b.page, `${base}/dashboard/offers?search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await b.page.getByText(`[HARNESS] ${tag} egen sag`).first().waitFor({ timeout: 60_000 }).catch(() => {})
            r.b_ser_sagstilbud = (await b.page.getByText(`[HARNESS] ${tag} egen sag`).count()) > 0
            r.b_ser_ikke_andens = (await b.page.getByText(`[HARNESS] ${tag} andens`).count()) === 0
            const dl = b.page.waitForEvent('download', { timeout: 60_000 }).catch(() => null)
            await b.page.getByRole('button', { name: 'Eksportér tilbud' }).first().click({ timeout: 60_000 }).catch(() => {})
            const d = await dl
            const fp = d ? await d.path().catch(() => null) : null
            const csv = fp ? readFileSync(fp, 'utf8') : ''
            r.b_eksport_kun_egne = csv.includes(`${tag}-C`) && !csv.includes(`${tag}-A`)
            const pa = foreign ? await gotoSafe(b.page, `${base}/api/offers/${foreign}/pdf`, { waitUntil: 'load', timeout: 120_000 }).catch(() => null) : null
            r.b_pdf_andens_404 = pa?.status() === 404
            // SC-5 (scope-review 2026-10-20): tilbudsvælgeren på "Ny sag" viser kun tilbud i B's scope
            await gotoSafe(b.page, `${base}/dashboard/orders/new`, { waitUntil: 'networkidle', timeout: 180_000 })
            await b.page.locator('select[name="customer_id"]').first().selectOption(profitCustomerId, { timeout: 30_000 }).catch(() => {})
            const offerSel = b.page.locator('select[name="source_offer_id"]')
            await offerSel.waitFor({ timeout: 45_000 }).catch(() => {})
            const optText = ((await offerSel.locator('option').allTextContents().catch(() => [])) as string[]).join(' | ')
            r.b_tilbudsvaelger_kun_scope = optText.includes(`${tag}-C`) && !optText.includes(`${tag}-A`)
            if (!r.b_tilbudsvaelger_kun_scope) console.log(`[U207] tilbudsvælger: ${optText.slice(0, 300)}`)
          } finally { await b.ctx.close().catch(() => {}) }
          await gotoSafe(a.page, `${base}/dashboard/offers?search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(`[HARNESS] ${tag} andens`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.admin_ser_begge = (await a.page.getByText(`[HARNESS] ${tag} andens`).count()) > 0 && (await a.page.getByText(`[HARNESS] ${tag} egen sag`).count()) > 0
        } finally { if (offs.length) await c.admin.from('offers').delete().in('id', offs.map((o) => o.id)) }
        out.push({ id: 'U207 API-2 salg kun egne tilbud', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${of.error ? ` · SEED: ${of.error.message}` : ''}` })
      }

      // U206 API-1: faktura-PDF følger fakturalistens regel (RLS can_view_case_finance: salg kun sager de har OPRETTET) —
      // før kunne en sælger der blot var TILDELT en andens sag hente sagens faktura-PDF
      if (want('U206') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sx = await mkUser('salg')
        const cs = await c.admin.from('service_cases').insert([
          { title: `[HARNESS] U206 tildelt ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id, assigned_to: sx.id },
          { title: `[HARNESS] U206 egen ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: sx.id, assigned_to: sx.id },
        ]).select('id, title')
        const caseRows = (cs.data ?? []) as Array<{ id: string; title: string }>
        for (const x of caseRows) listCaseIds.push(x.id)
        const assignedCase = caseRows.find((x) => x.title.includes('tildelt'))?.id
        const ownCase = caseRows.find((x) => x.title.includes('egen'))?.id
        const inv = assignedCase && ownCase ? await c.admin.from('invoices').insert([
          { invoice_number: `U206-A-${stamp}`, customer_id: profitCustomerId, case_id: assignedCase, status: 'sent', total_amount: 100, tax_amount: 25, final_amount: 125, due_date: new Date().toISOString().slice(0, 10) },
          { invoice_number: `U206-B-${stamp}`, customer_id: profitCustomerId, case_id: ownCase, status: 'sent', total_amount: 100, tax_amount: 25, final_amount: 125, due_date: new Date().toISOString().slice(0, 10) },
        ]).select('id, invoice_number') : null
        const invRows = (inv?.data ?? []) as Array<{ id: string; invoice_number: string }>
        const invAssigned = invRows.find((x) => x.invoice_number.startsWith('U206-A'))?.id
        const invOwn = invRows.find((x) => x.invoice_number.startsWith('U206-B'))?.id
        r.seed = !!invAssigned && !!invOwn
        const sp = await login(sx)
        try {
          const ra = invAssigned ? await gotoSafe(sp.page, `${base}/api/invoices/${invAssigned}/pdf`, { waitUntil: 'load', timeout: 120_000 }).catch(() => null) : null
          r.tildelt_andens_sag_404 = ra?.status() === 404
          const ro = invOwn ? await sp.page.context().request.get(`${base}/api/invoices/${invOwn}/pdf`, { timeout: 180_000 }).catch(() => null) : null
          r.egen_sag_200 = ro?.status() === 200
        } finally {
          await sp.ctx.close().catch(() => {})
          if (invRows.length) await c.admin.from('invoices').delete().in('id', invRows.map((x) => x.id))
        }
        out.push({ id: 'U206 API-1 faktura-PDF = fakturalistens regel', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${inv?.error ? ` · SEED: ${inv.error.message}` : ''}${cs.error ? ` · SEED-sag: ${cs.error.message}` : ''}` })
      }

      // U213 DB-15 (2026-10-20): kortenes links viser præcis det tallet tæller — gamle kladder (?staleDays=14), afviste
      // seneste 90 dage (?rejectedDays=90), aktive sager (?status=active), leads uden opfølgning (?staleDays=7)
      if (want('U213') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U213-${stamp}`
        const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
        const of = await c.admin.from('offers').insert([
          { offer_number: `${tag}-D1`, title: `[HARNESS] ${tag} gammel kladde`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'draft', created_at: daysAgo(20) },
          { offer_number: `${tag}-D2`, title: `[HARNESS] ${tag} ny kladde`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'draft' },
          { offer_number: `${tag}-R1`, title: `[HARNESS] ${tag} afvist nylig`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'rejected', rejected_at: daysAgo(10) },
          { offer_number: `${tag}-R2`, title: `[HARNESS] ${tag} afvist gammel`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'rejected', rejected_at: daysAgo(120) },
        ]).select('id')
        const offIds = ((of.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        const cs = await c.admin.from('service_cases').insert([
          { title: `[HARNESS] ${tag} aktiv`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id },
          { title: `[HARNESS] ${tag} lukket`, customer_id: profitCustomerId, status: 'closed', priority: 'medium', source: 'manual', created_by: adminUser.id },
        ]).select('id')
        for (const x of ((cs.data ?? []) as Array<{ id: string }>)) listCaseIds.push(x.id)
        const ld = await c.admin.from('leads').insert([
          { company_name: `[HARNESS] ${tag} stille lead`, contact_person: 'S', email: `u213s-${stamp}@harness.test`, status: 'new', source: 'website', created_by: adminUser.id, updated_at: daysAgo(10), created_at: daysAgo(10) },
          { company_name: `[HARNESS] ${tag} frisk lead`, contact_person: 'F', email: `u213f-${stamp}@harness.test`, status: 'new', source: 'website', created_by: adminUser.id },
        ]).select('id')
        const leadIds = ((ld.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = offIds.length === 4 && (cs.data ?? []).length === 2 && leadIds.length === 2
        const seen = async (url: string, yes: string, no: string) => {
          await gotoSafe(a.page, `${base}${url}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(yes).first().waitFor({ timeout: 45_000 }).catch(() => {})
          return (await a.page.getByText(yes).count()) > 0 && (await a.page.getByText(no).count()) === 0
        }
        try {
          r.gamle_kladder = await seen(`/dashboard/offers?staleDays=14&search=${encodeURIComponent(tag)}`, `[HARNESS] ${tag} gammel kladde`, `[HARNESS] ${tag} ny kladde`)
          r.kladde_chip = (await a.page.getByTestId('offers-stale-chip').count()) > 0
          r.afviste_90 = await seen(`/dashboard/offers?status=rejected&rejectedDays=90&search=${encodeURIComponent(tag)}`, `[HARNESS] ${tag} afvist nylig`, `[HARNESS] ${tag} afvist gammel`)
          r.aktive_sager = await seen(`/dashboard/orders?status=active&search=${encodeURIComponent(tag)}`, `[HARNESS] ${tag} aktiv`, `[HARNESS] ${tag} lukket`)
          r.stille_leads = await seen(`/dashboard/leads?staleDays=7&view=table&search=${encodeURIComponent(tag)}`, `[HARNESS] ${tag} stille lead`, `[HARNESS] ${tag} frisk lead`)
          r.leads_note = (await a.page.getByTestId('leads-filter-note').count()) > 0
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.waitForTimeout(1500)
          r.cockpit_links = (await a.page.locator('a[href="/dashboard/orders?status=active"]').count()) > 0
        } finally {
          if (offIds.length) await c.admin.from('offers').delete().in('id', offIds)
          if (leadIds.length) { await c.admin.from('lead_activities').delete().in('lead_id', leadIds); await c.admin.from('leads').delete().in('id', leadIds) }
        }
        out.push({ id: 'U213 DB-15 kortlinks = korttal', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U216 FIN3-5: fastprissager i "Klar til fakturering" — med kontraktens restbeløb; en fuldt faktureret fastprissag
      // med ufaktureret materiale er IKKE klar til fakturering (linjerne dækkes af kontrakten)
      if (want('U216') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U216-${stamp}`
        const cs = await c.admin.from('service_cases').insert([
          { title: `[HARNESS] ${tag} fastpris åben`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id, billing_model: 'fixed_price', contract_sum: 10000 },
          { title: `[HARNESS] ${tag} fastpris faktureret`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id, billing_model: 'fixed_price', contract_sum: 10000 },
        ]).select('id, title')
        const rows = (cs.data ?? []) as Array<{ id: string; title: string }>
        for (const x of rows) listCaseIds.push(x.id)
        const open = rows.find((x) => x.title.includes('åben'))?.id
        const done = rows.find((x) => x.title.includes('faktureret'))?.id
        const mats = rows.length === 2 ? await c.admin.from('case_materials').insert(rows.map((x) => ({ case_id: x.id, description: `U216 kabel ${stamp}`, quantity: 5, unit: 'm',
          unit_cost: 5, unit_sales_price: 12, billable: true, source: 'manual', created_by: adminUser.id }))).select('id') : null
        const matIds = ((mats?.data ?? []) as Array<{ id: string }>).map((m) => m.id)
        const inv = done ? await c.admin.from('invoices').insert([{ invoice_number: `U216-${stamp}`, customer_id: profitCustomerId, case_id: done, status: 'sent',
          invoice_type: 'standard', total_amount: 10000, tax_amount: 2500, final_amount: 12500, due_date: new Date().toISOString().slice(0, 10) }]).select('id') : null
        const invId = (inv?.data?.[0] as { id?: string } | undefined)?.id ?? null
        // som i det rigtige flow: slutfakturaen binder sagens linjer (her materialet på den fakturerede sag)
        const doneMat = done ? matIds.find((_, i) => rows[i]?.id === done) ?? null : null
        const invLine = invId ? await c.admin.from('invoice_lines').insert([{ invoice_id: invId, position: 1, description: 'Kontrakt', quantity: 1, unit: 'stk', unit_price: 10000, total_price: 10000 }]).select('id') : null
        const invLineId = (invLine?.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (doneMat && invLineId) await c.admin.from('case_materials').update({ invoice_line_id: invLineId }).eq('id', doneMat)
        r.seed = rows.length === 2 && matIds.length === 2 && !!invId && !!invLineId
        try {
          const visit = async () => {
            await gotoSafe(a.page, `${base}/dashboard/orders?unbilled=1&search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await a.page.getByText(`[HARNESS] ${tag} fastpris åben`).first().waitFor({ timeout: 45_000 }).catch(() => {})
          }
          await visit()
          r.aaben_fastpris_vist = (await a.page.getByText(`[HARNESS] ${tag} fastpris åben`).count()) > 0
          r.faktureret_fastpris_skjult = (await a.page.getByText(`[HARNESS] ${tag} fastpris faktureret`).count()) === 0
          // R3-2: ekstraarbejde registreret EFTER slutfakturaen (ubundet linje) → sagen står igen som klar til fakturering
          const extra = done ? await c.admin.from('case_materials').insert([{ case_id: done, description: `U216 ekstra ${stamp}`, quantity: 1, unit: 'stk',
            unit_cost: 50, unit_sales_price: 100, billable: true, source: 'manual', created_by: adminUser.id }]).select('id') : null
          const extraId = (extra?.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (extraId) matIds.push(extraId)
          await visit()
          r.ekstraarbejde_vist = (await a.page.getByText(`[HARNESS] ${tag} fastpris faktureret`).count()) > 0
        } finally {
          if (doneMat) await c.admin.from('case_materials').update({ invoice_line_id: null }).eq('id', doneMat)
          if (invLineId) await c.admin.from('invoice_lines').delete().eq('id', invLineId)
          if (matIds.length) await c.admin.from('case_materials').delete().in('id', matIds)
          if (invId) await c.admin.from('invoices').delete().eq('id', invId)
        }
        out.push({ id: 'U216 FIN3-5/R3-2 fastpris i klar til fakturering (rest, ekstraarbejde)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U217 DB-15e (2026-10-20): cockpittets "Kundebeskeder (portal)" linker til kundelisten med kun kunder med ulæste
      // portalbeskeder (?portalUnread=1); filteret vises og kan fjernes; en kunde uden ulæste står ikke på listen
      if (want('U217')) {
        const r: Record<string, boolean> = {}
        const tag = `U217-${stamp}`
        const nc = await c.admin.from('customers').insert([
          { customer_number: `UI-E2E-PU-${stamp}`, company_name: `[HARNESS] ${tag} ulæst`, contact_person: 'P', email: `pu-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
          { customer_number: `UI-E2E-PL-${stamp}`, company_name: `[HARNESS] ${tag} læst`, contact_person: 'P', email: `pl-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
        ]).select('id, company_name')
        const custs = (nc.data ?? []) as Array<{ id: string; company_name: string }>
        const unreadId = custs.find((x) => x.company_name.endsWith('ulæst'))?.id ?? null
        const readId = custs.find((x) => x.company_name.endsWith(' læst'))?.id ?? null
        const pm = unreadId && readId ? await c.admin.from('portal_messages').insert([
          { customer_id: unreadId, sender_type: 'customer', sender_name: 'Kunde', message: `Ulæst ${stamp}`, created_at: '2019-01-01T09:00:00Z' },
          { customer_id: readId, sender_type: 'customer', sender_name: 'Kunde', message: `Læst ${stamp}`, created_at: '2019-01-01T09:00:00Z', read_at: new Date().toISOString() },
        ]).select('id') : null
        const pmIds = ((pm?.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = custs.length === 2 && pmIds.length === 2
        try {
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          const cardLink = a.page.locator('a[href="/dashboard/customers?portalUnread=1"]')
          r.kort_linker_filtreret = (await cardLink.count()) > 0
          await gotoSafe(a.page, `${base}/dashboard/customers?portalUnread=1&search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(`[HARNESS] ${tag} ulæst`).first().waitFor({ timeout: 45_000 }).catch(() => {})
          r.ulaest_kunde_vist = (await a.page.getByText(`[HARNESS] ${tag} ulæst`).count()) > 0
          r.laest_kunde_skjult = (await a.page.getByText(`[HARNESS] ${tag} læst`).count()) === 0
          r.filter_chip_vist = (await a.page.getByTestId('customers-filter-portal-unread').count()) === 1
          await a.page.getByTestId('customers-filter-portal-unread').click({ timeout: 15_000 }).catch(() => {})
          await a.page.waitForURL((u) => !u.searchParams.has('portalUnread'), { timeout: 30_000 }).catch(() => {})
          await a.page.getByText(`[HARNESS] ${tag} læst`).first().waitFor({ timeout: 45_000 }).catch(() => {})
          r.filter_fjernet_viser_begge = (await a.page.getByText(`[HARNESS] ${tag} læst`).count()) > 0
        } finally {
          if (pmIds.length) await c.admin.from('portal_messages').delete().in('id', pmIds)
          if (custs.length) await c.admin.from('customers').delete().in('id', custs.map((x) => x.id))
        }
        out.push({ id: 'U217 DB-15e kundeliste: kun ulæste portalbeskeder', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U219 DE2-9 (Henrik 2026-10-20 GODKENDT): manuel konvertering tilbud → sag giver tilbuddets SÆLGER ansvaret —
      // også når en anden (admin) konverterer; auditeret; sælgeren kan åbne sagen. Egen konvertering: sælgeren selv.
      // U223 A-4b (Henrik 2026-10-22): leverandørfaktura med uvist bogføringsudfald — dansk tilstand (ingen rå fejl), kun
      // settings.economic (admin/bogholderi) kan frigive efter bekræftelse; frigivelsen rydder kravet, bogfører intet og
      // auditeres (audit_logs + fakturaens historik). Serviceleder ser fakturaen, men får ingen frigiv-knap.
      if (want('U223')) {
        const r: Record<string, boolean> = {}
        const claim = `pending-${Date.now() - 60 * 60_000}`
        const ins = await c.admin.from('incoming_invoices').insert([{ source: 'manual', status: 'approved', invoice_number: `U223-${stamp}`, currency: 'DKK', external_invoice_id: claim }]).select('id')
        const invId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        const lg = invId ? await c.admin.from('accounting_sync_log').insert([{ provider: 'economic', entity_type: 'invoice', entity_id: invId, action: 'create', status: 'failed',
          error_message: 'UNCERTAIN: fetch failed', request_meta: { http_status: 0, uncertain: true, claim, kind: 'supplier_invoice' } }]) : null
        r.seed = !!invId && !lg?.error
        try {
          const sv = await login(await mkUser('serviceleder'))
          try {
            await gotoSafe(sv.page, `${base}/dashboard/incoming-invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await sv.page.getByTestId('posting-uncertain').first().waitFor({ timeout: 60_000 }).catch(() => {})
            r.serviceleder_ser_tilstand = (await sv.page.getByTestId('posting-uncertain').count()) === 1
            r.serviceleder_ingen_frigiv = (await sv.page.getByTestId('posting-release').count()) === 0
            const raw = await callServerAction(sv.page, `${base}/dashboard/incoming-invoices/${invId}`, 'src/lib/actions/incoming-invoices.ts', 'releaseUncertainIncomingInvoicePostingAction', [invId, true])
            r.serviceleder_direkte_kald_afvist = raw.includes('Manglende tilladelse: settings.economic')
          } finally { await sv.ctx.close().catch(() => {}) }
          await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('posting-release').first().waitFor({ timeout: 60_000 }).catch(() => {})
          const body = (await a.page.locator('body').textContent().catch(() => '')) ?? ''
          r.dansk_tilstand = body.includes('Uvist om leverandørfakturaen blev bogført i e-conomic')
          r.ingen_raa_fejl = !/fetch failed|UNCERTAIN:/i.test(body)
          r.ingen_bogfoer_knap = (await a.page.getByRole('button', { name: /^Bogfør til e-conomic$/ }).count()) === 0
          r.tidspunkt_vist = (await a.page.getByTestId('posting-uncertain-since').count()) === 1
          const claimNow = async () => ((await c.admin.from('incoming_invoices').select('external_invoice_id, status').eq('id', invId ?? '').maybeSingle()).data ?? null) as { external_invoice_id: string | null; status: string } | null
          // bekræftelse kræves også på serveren
          const noConfirm = await callServerAction(a.page, `${base}/dashboard/incoming-invoices/${invId}`, 'src/lib/actions/incoming-invoices.ts', 'releaseUncertainIncomingInvoicePostingAction', [invId, false])
          r.server_kraever_bekraeftelse = noConfirm.includes('Bekræft at du har kontrolleret e-conomic') && (await claimNow())?.external_invoice_id === claim
          a.page.once('dialog', (d) => { d.dismiss().catch(() => {}) })
          await a.page.getByTestId('posting-release').first().click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForTimeout(2000)
          r.afvist_bekraeftelse_intet_sker = (await claimNow())?.external_invoice_id === claim
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await a.page.getByTestId('posting-release').first().click({ timeout: 30_000 }).catch(() => {})
          let after: string | null | undefined = claim
          for (let i = 0; i < 15 && after; i++) { after = (await claimNow())?.external_invoice_id; if (after) await new Promise((res) => setTimeout(res, 1000)) }
          const st = await claimNow()
          r.frigivet = after === null && st?.status === 'approved'
          const aud = ((await c.admin.from('audit_logs').select('changes').eq('entity_id', invId ?? '').eq('action', 'economic_posting_released')).data ?? []) as Array<{ changes: Record<string, unknown> | null }>
          r.auditeret = aud.length === 1 && aud[0].changes?.claim === claim && aud[0].changes?.confirmed_checked === true
          const hist = ((await c.admin.from('incoming_invoice_audit_log').select('id').eq('incoming_invoice_id', invId ?? '').eq('action', 'posting_released')).data ?? []).length
          r.historik = hist === 1
          const posts = ((await c.admin.from('accounting_sync_log').select('id').eq('entity_id', invId ?? '').eq('status', 'success')).data ?? []).length
          r.intet_bogfoert = posts === 0
        } finally {
          if (invId) {
            await c.admin.from('accounting_sync_log').delete().eq('entity_type', 'invoice').eq('entity_id', invId)
            await c.admin.from('audit_logs').delete().eq('entity_id', invId)
            await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', invId)
            await c.admin.from('incoming_invoices').delete().eq('id', invId)
          }
        }
        out.push({ id: 'U223 A-4b leverandørfaktura uvist udfald: dansk tilstand, frigivelse kun med ret + bekræftelse, audit, intet bogført', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U220 A-4 (Henrik 2026-10-21): e-conomic-eksport med uvist udfald — fakturaen viser dansk tilstand (ingen rå fejl),
      // eksport-knappen er væk, kun settings.economic (admin/bogholderi) kan frigive efter bekræftelse; frigivelsen
      // rydder kravet og auditeres. Serviceleder (ser fakturaer, men ikke settings.economic) får ingen frigiv-knap.
      if (want('U220') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const claim = `pending-${Date.now() - 60 * 60_000}`
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `U220-${stamp}`, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          total_amount: 800, tax_amount: 200, final_amount: 1000, due_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), external_invoice_id: claim }]).select('id')
        const invId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        const lg = invId ? await c.admin.from('accounting_sync_log').insert([{ provider: 'economic', entity_type: 'invoice', entity_id: invId, action: 'create', status: 'failed',
          error_message: 'UNCERTAIN: fetch failed', request_meta: { http_status: 0, uncertain: true, claim } }]) : null
        r.seed = !!invId && !lg?.error
        try {
          const sv = await login(await mkUser('serviceleder'))
          try {
            await gotoSafe(sv.page, `${base}/dashboard/invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await sv.page.getByText('Regnskab (e-conomic)').first().waitFor({ timeout: 60_000 }).catch(() => {})
            await sv.page.waitForTimeout(1500)
            r.serviceleder_ingen_frigiv = (await sv.page.getByTestId('invoice-economic-release').count()) === 0
          } finally { await sv.ctx.close().catch(() => {}) }
          await gotoSafe(a.page, `${base}/dashboard/invoices/${invId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('invoice-economic-release').first().waitFor({ timeout: 60_000 }).catch(() => {})
          const body = (await a.page.locator('body').textContent().catch(() => '')) ?? ''
          r.dansk_tilstand = body.includes('Uvist om fakturaen blev oprettet i e-conomic')
          r.ingen_raa_fejl = !/fetch failed|UNCERTAIN:/i.test(body)
          r.ingen_eksport_knap = (await a.page.getByRole('button', { name: /Prøv eksport igen|Eksportér til e-conomic/ }).count()) === 0
          r.tidspunkt_vist = (await a.page.getByTestId('invoice-economic-uncertain-since').count()) === 1
          // afvis bekræftelsen → intet sker
          a.page.once('dialog', (d) => { d.dismiss().catch(() => {}) })
          await a.page.getByTestId('invoice-economic-release').first().click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForTimeout(2000)
          const stillClaimed = ((await c.admin.from('invoices').select('external_invoice_id').eq('id', invId ?? '').maybeSingle()).data as { external_invoice_id: string | null } | null)?.external_invoice_id
          r.afvist_bekraeftelse_intet_sker = stillClaimed === claim
          // bekræft → frigivet + audit
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await a.page.getByTestId('invoice-economic-release').first().click({ timeout: 30_000 }).catch(() => {})
          let after: string | null | undefined = claim
          for (let i = 0; i < 15 && after; i++) {
            after = ((await c.admin.from('invoices').select('external_invoice_id').eq('id', invId ?? '').maybeSingle()).data as { external_invoice_id: string | null } | null)?.external_invoice_id
            if (after) await new Promise((res) => setTimeout(res, 1000))
          }
          r.frigivet = after === null
          const aud = ((await c.admin.from('audit_logs').select('action, changes').eq('entity_id', invId ?? '').eq('action', 'economic_export_released')).data ?? []) as Array<{ changes: Record<string, unknown> | null }>
          r.auditeret = aud.length === 1 && aud[0].changes?.claim === claim && aud[0].changes?.confirmed_checked === true
          await a.page.waitForTimeout(1500)
          r.kan_eksporteres_igen = (await a.page.getByTestId('invoice-economic-release').count()) === 0
        } finally {
          if (invId) {
            await c.admin.from('accounting_sync_log').delete().eq('entity_type', 'invoice').eq('entity_id', invId)
            await c.admin.from('audit_logs').delete().eq('entity_id', invId)
            await c.admin.from('invoices').delete().eq('id', invId)
          }
        }
        out.push({ id: 'U220 A-4 uvist e-conomic-udfald: dansk tilstand, frigivelse kun med ret + bekræftelse, audit', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      if (want('U219') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U219-${stamp}`
        const sA = await mkUser('salg')
        const sB = await mkUser('salg')
        const of = await c.admin.from('offers').insert([
          { offer_number: `${tag}-A`, title: `[HARNESS] ${tag} sælger A`, created_by: sA.id, customer_id: profitCustomerId, status: 'accepted', sent_at: new Date().toISOString(), accepted_at: new Date().toISOString(), final_amount: 12500, tax_amount: 2500 },
          { offer_number: `${tag}-B`, title: `[HARNESS] ${tag} sælger B`, created_by: sB.id, customer_id: profitCustomerId, status: 'accepted', sent_at: new Date().toISOString(), accepted_at: new Date().toISOString(), final_amount: 6250, tax_amount: 1250 },
        ]).select('id, offer_number')
        const offs = (of.data ?? []) as Array<{ id: string; offer_number: string }>
        const oA = offs.find((o) => o.offer_number.endsWith('-A'))?.id ?? null
        const oB = offs.find((o) => o.offer_number.endsWith('-B'))?.id ?? null
        r.seed = !!oA && !!oB
        const caseFor = async (offerId: string | null) => {
          for (let i = 0; i < 60; i++) {
            const row = ((await c.admin.from('service_cases').select('id, case_number, assigned_to, created_by').eq('source_offer_id', offerId ?? '').maybeSingle()).data) as { id: string; case_number: string; assigned_to: string | null; created_by: string | null } | null
            if (row) return row
            await new Promise((res) => setTimeout(res, 1000))
          }
          return null
        }
        try {
          // 1) admin konverterer sælger A's tilbud
          await gotoSafe(a.page, `${base}/dashboard/offers/${oA}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: /Opret sag fra tilbud/ }).first().click({ timeout: 60_000 }).catch(() => {})
          // konverteringen afsluttes med router.push til sagen — vent på den, før sagen/audit læses
          await a.page.waitForURL(/\/dashboard\/orders\//, { timeout: 90_000 }).catch(() => {})
          const cA = await caseFor(oA)
          if (cA) listCaseIds.push(cA.id)
          r.admin_konv_ansvarlig_saelger = cA?.assigned_to === sA.id
          r.admin_konv_oprettet_af_admin = cA?.created_by === adminUser.id
          let aud: Array<{ changes: Record<string, unknown> | null }> = []
          for (let i = 0; i < 15 && cA && !aud.length; i++) {
            aud = ((await c.admin.from('audit_logs').select('action, changes').eq('entity_id', cA.id).eq('action', 'case_assigned_from_offer')).data ?? []) as typeof aud
            if (!aud.length) await new Promise((res) => setTimeout(res, 1000))
          }
          r.tildeling_auditeret = aud.length === 1 && aud[0].changes?.assigned_to === sA.id && aud[0].changes?.converted_by === adminUser.id
          const pa = await login(sA)
          try {
            const resp = cA ? await gotoSafe(pa.page, `${base}/dashboard/orders/${cA.case_number}`, { waitUntil: 'networkidle', timeout: 180_000 }).catch(() => null) : null
            await pa.page.getByRole('button', { name: /^Overblik$/ }).first().waitFor({ timeout: 60_000 }).catch(() => {})
            r.saelger_kan_aabne_sag = resp?.status() !== 404 && (await pa.page.getByRole('button', { name: /^Overblik$/ }).count()) > 0
          } finally { await pa.ctx.close().catch(() => {}) }
          // 2) sælger B konverterer sit eget tilbud
          const pb = await login(sB)
          try {
            await gotoSafe(pb.page, `${base}/dashboard/offers/${oB}`, { waitUntil: 'networkidle', timeout: 180_000 })
            await pb.page.getByRole('button', { name: /Opret sag fra tilbud/ }).first().click({ timeout: 60_000 }).catch(() => {})
            // ikke luk browseren før konverteringen er færdig (før: sagen blev oprettet EFTER testen havde givet op)
            await pb.page.waitForURL(/\/dashboard\/orders\//, { timeout: 90_000 }).catch(() => {})
          } finally { await pb.ctx.close().catch(() => {}) }
          const cB = await caseFor(oB)
          if (cB) listCaseIds.push(cB.id)
          r.egen_konv_ansvarlig_selv = cB?.assigned_to === sB.id && cB?.created_by === sB.id
          if (!r.egen_konv_ansvarlig_selv) console.log(`[U219] egen konvertering: sag=${cB ? 'ja' : 'nej'} ansvarlig=B:${cB?.assigned_to === sB.id} oprettet=B:${cB?.created_by === sB.id}`)
        } finally {
          if (offs.length) {
            const cs = ((await c.admin.from('service_cases').select('id').in('source_offer_id', offs.map((o) => o.id))).data ?? []) as Array<{ id: string }>
            for (const x of cs) if (!listCaseIds.includes(x.id)) listCaseIds.push(x.id)
          }
        }
        out.push({ id: 'U219 DE2-9 konvertering: sælgeren bliver ansvarlig + audit', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${of.error ? ` · SEED: ${of.error.message}` : ''}` })
      }

      // U218 DB-15o (2026-10-20): dashboardets "Afventende Tilbud" linker til ?awaiting=1 (kun sendt + set, med fjernbart
      // filter) og "Ulæste Kundemails" til mail-listen med ulæste koblede mails (?filter=linked&read=unread)
      if (want('U218') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U218-${stamp}`
        const ins = await c.admin.from('offers').insert([
          { offer_number: `UI-E2E-AW1-${stamp}`, title: `[HARNESS] ${tag} sendt`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString() },
          { offer_number: `UI-E2E-AW2-${stamp}`, title: `[HARNESS] ${tag} kladde`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'draft' },
        ]).select('id')
        const offIds = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = offIds.length === 2
        try {
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.afventende_link = (await a.page.locator('a[href="/dashboard/offers?awaiting=1"]').count()) > 0
          r.ulaeste_mails_link = (await a.page.locator('a[href="/dashboard/mail?filter=linked&read=unread"]').count()) > 0
          await gotoSafe(a.page, `${base}/dashboard/offers?awaiting=1&search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(`[HARNESS] ${tag} sendt`).first().waitFor({ timeout: 45_000 }).catch(() => {})
          r.sendt_vist = (await a.page.getByText(`[HARNESS] ${tag} sendt`).count()) > 0
          r.kladde_skjult = (await a.page.getByText(`[HARNESS] ${tag} kladde`).count()) === 0
          r.chip_vist = (await a.page.getByTestId('offers-awaiting-chip').count()) === 1
        } finally {
          if (offIds.length) await c.admin.from('offers').delete().in('id', offIds)
        }
        out.push({ id: 'U218 DB-15o afventende tilbud + ulæste kundemails-links', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U214 DB-15k: "Klar til fakturering" linker til sagslisten med kun sager med ufaktureret arbejde (?unbilled=1)
      if (want('U214') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U214-${stamp}`
        const cs = await c.admin.from('service_cases').insert([
          { title: `[HARNESS] ${tag} ufaktureret`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id },
          { title: `[HARNESS] ${tag} intet at fakturere`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id },
        ]).select('id, title')
        const rows = (cs.data ?? []) as Array<{ id: string; title: string }>
        for (const x of rows) listCaseIds.push(x.id)
        const withWork = rows.find((x) => x.title.includes('ufaktureret'))?.id
        const mat = withWork ? await c.admin.from('case_materials').insert([{ case_id: withWork, description: `U214 kabel ${stamp}`, quantity: 5, unit: 'm',
          unit_cost: 5, unit_sales_price: 12, billable: true, source: 'manual', created_by: adminUser.id }]).select('id') : null
        const matId = (mat?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = rows.length === 2 && !!matId
        try {
          await gotoSafe(a.page, `${base}/dashboard/orders?unbilled=1&search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText(`[HARNESS] ${tag} ufaktureret`).first().waitFor({ timeout: 45_000 }).catch(() => {})
          r.sag_med_arbejde_vist = (await a.page.getByText(`[HARNESS] ${tag} ufaktureret`).count()) > 0
          r.sag_uden_arbejde_skjult = (await a.page.getByText(`[HARNESS] ${tag} intet at fakturere`).count()) === 0
          r.chip = (await a.page.getByTestId('orders-unbilled-chip').count()) > 0
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.waitForTimeout(1500)
          r.cockpit_link = (await a.page.locator('a[href="/dashboard/orders?unbilled=1"]').count()) > 0
        } finally { if (matId) await c.admin.from('case_materials').delete().eq('id', matId) }
        out.push({ id: 'U214 DB-15k klar til fakturering → sagsliste', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U205 DB-3: cockpittets "Tilbud — opfølgning" linker til ?followup=1, og listen viser præcis det tallet tæller
      // (sendt/set, afsendt > 7 dage) — før linkede kortet til alle sendte uanset alder og uden "set"
      if (want('U205') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `U205-${stamp}`
        const old = new Date(Date.now() - 10 * 86_400_000).toISOString()
        const ins = await c.admin.from('offers').insert([
          { offer_number: `${tag}-A`, title: `[HARNESS] ${tag} gammel set`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'viewed', sent_at: old },
          { offer_number: `${tag}-B`, title: `[HARNESS] ${tag} ny sendt`, created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString() },
        ]).select('id')
        const ids = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = ids.length === 2
        try {
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.waitForTimeout(1500)
          r.cockpit_link = (await a.page.locator('a[href="/dashboard/offers?followup=1"]').count()) > 0
          await gotoSafe(a.page, `${base}/dashboard/offers?followup=1&search=${encodeURIComponent(tag)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('offers-followup-chip').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.chip = (await a.page.getByTestId('offers-followup-chip').count()) > 0
          r.gammel_set_vist = (await a.page.getByText(`[HARNESS] ${tag} gammel set`).count()) > 0
          r.ny_sendt_skjult = (await a.page.getByText(`[HARNESS] ${tag} ny sendt`).count()) === 0
        } finally { if (ids.length) await c.admin.from('offers').delete().in('id', ids) }
        out.push({ id: 'U205 DB-3 opfølgningslink = opfølgningstal', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${ins.error ? ` · SEED: ${ins.error.message}` : ''}` })
      }

      // U50 kundeportal: tilbudslinjer sendes uden kostpris/margin/interne noter til kundens browser
      if (want('U50') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u50.tokenId = (pt.data?.[0] as { id?: string } | undefined)?.id
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PL-${stamp}`, title: `[HARNESS] portal-linjer ${stamp}`, customer_id: profitCustomerId,
          status: 'sent', sent_at: new Date().toISOString(), created_by: adminUser.id, valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }]).select('id')
        u50.offerId = (off.data?.[0] as { id?: string } | undefined)?.id
        const note = `INTERNNOTE${stamp}`
        if (u50.offerId) await c.admin.from('offer_line_items').insert([{ offer_id: u50.offerId, position: 1, description: `Solpanel ${stamp}`, quantity: 1, unit: 'stk',
          unit_price: 1000, total: 1000, cost_price: 777777.77, supplier_cost_price_at_creation: 666666.66, notes: note }])
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        kp.on('pageerror', (e) => pageErrors.push(`kunde-linjer: ${e.message.slice(0, 120)}`))
        for (const path of [`/portal/${tok}/offers/${u50.offerId}`, `/portal/${tok}`]) {
          await gotoSafe(kp, `${base}${path}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const html = await kp.content().catch(() => '')
          const key = path.includes('/offers/') ? 'detalje' : 'oversigt'
          r[`${key}_viser_linje`] = key === 'oversigt' ? true : html.includes(`Solpanel ${stamp}`)
          r[`${key}_ingen_kostpris`] = !html.includes('777777') && !html.includes('666666')
          r[`${key}_ingen_intern_note`] = !html.includes(note)
        }
        await kctx.close().catch(() => {})
        out.push({ id: 'U50 portal: ingen kost/noter til kunden', ok: !!u50.offerId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U51 tilbudslinje fra grossistkatalog (søg varenr. → tilføj)
      if (want('U51') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U51 grossist ${stamp}`, code: `HU51${stamp}` }]).select('id')
        u51.supplierId = (sup.data?.[0] as { id?: string } | undefined)?.id
        const sku = `H51-${stamp}`
        const sp = u51.supplierId ? await c.admin.from('supplier_products').insert([{ supplier_id: u51.supplierId, supplier_sku: sku, supplier_name: `Harness stikkontakt ${stamp}`,
          cost_price: 40, unit: 'stk', is_available: true }]).select('id') : null
        const spId = (sp?.data?.[0] as { id?: string } | undefined)?.id
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-GL-${stamp}`, title: `[HARNESS] grossistlinje ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id }]).select('id')
        u51.offerId = (off.data?.[0] as { id?: string } | undefined)?.id
        const seedErr = spId && u51.offerId ? '' : `SEED: ${sp?.error?.message ?? off.error?.message ?? sup.error?.message ?? '?'} · `
        await gotoSafe(a.page, `${base}/dashboard/offers/${u51.offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Fra leverandør/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('supplier-add-qty').fill('3').catch(() => {}) // W-12: antal ved tilføj (før låst til 1)
        await a.page.getByPlaceholder(/Indtast varenummer eller produktnavn/).fill(sku).catch(() => {})
        const hit = a.page.getByText(`Harness stikkontakt ${stamp}`).first()
        await hit.waitFor({ timeout: 60_000 }).catch(() => {})
        r.fundet = (await hit.count()) > 0
        // resultatets "+ Tilføj" (exact — ikke "Tilføj linje" nederst, der laver en tom linje)
        await a.page.getByRole('button', { name: 'Tilføj', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
        type L = { supplier_product_id: string | null; supplier_cost_price_at_creation: number | null; unit_price: number; quantity: number }
        const readL = async (): Promise<L[]> => ((await c.admin.from('offer_line_items').select('supplier_product_id, supplier_cost_price_at_creation, unit_price, quantity').eq('offer_id', u51.offerId ?? '')).data ?? []) as L[]
        let lines = await readL()
        for (let i = 0; i < 20 && lines.length === 0; i++) { await new Promise((res) => setTimeout(res, 1000)); lines = await readL() }
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u51-grossistlinje.png'), fullPage: false }).catch(() => {})
        r.linje_tilfoejet = lines.length === 1 && lines[0].supplier_product_id === spId
        r.kost_gemt = Number(lines[0]?.supplier_cost_price_at_creation) === 40
        r.salgspris_over_kost = Number(lines[0]?.unit_price) > 40
        r.antal_3 = Number(lines[0]?.quantity) === 3
        // S-2: inline-redigering (antal) må ikke overskrive leverandørens oprindelige kost med linjens kost (efter rabat)
        if (lines.length === 1) {
          await c.admin.from('offer_line_items').update({ cost_price: 35 }).eq('offer_id', u51.offerId ?? '')
          await gotoSafe(a.page, `${base}/dashboard/offers/${u51.offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          const d51 = a.page.locator('input[placeholder="Beskrivelse..."]').first()
          await d51.waitFor({ timeout: 30_000 }).catch(() => {})
          const row51 = d51.locator('xpath=ancestor::tr[1]')
          await row51.locator('input[type="number"]').first().fill('5').catch(() => {})
          await row51.locator('input[type="number"]').first().press('Tab').catch(() => {})
          let l2: L | null = null
          for (let i = 0; i < 20; i++) {
            l2 = (await readL())[0] ?? null
            if (l2 && Number(l2.quantity) === 5) break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.redigeret_antal_5 = Number(l2?.quantity) === 5
          r.oprindelig_kost_bevaret = Number(l2?.supplier_cost_price_at_creation) === 40
        }
        out.push({ id: 'U51 tilbudslinje fra grossist', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · stk-pris=${lines[0]?.unit_price}` })
      }

      // U52 kundekort: kundens mails vises (før: PGRST201 — tvetydig join incoming_emails↔service_cases)
      if (want('U52') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const subj = `[HARNESS] kundemail ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: `ui-profit-${stamp}@harness.test`, subject: subj, customer_id: profitCustomerId,
          received_at: new Date().toISOString(), is_archived: false, link_status: 'linked' }]).select('id')
        const emId = (em.data?.[0] as { id?: string } | undefined)?.id
        if (emId) seededEmailIds.push(emId)
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(subj).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.mail_vist = (await a.page.getByText(subj).count()) > 0
        out.push({ id: 'U52 kundekort: kundens mails', ok: !!emId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${emId ? '' : ` · SEED: ${em.error?.message}`}` })
      }

      // U53 go-live: "Opsætning før pilot" (kun admin) stemmer med databasen
      if (want('U53')) {
        const r: Record<string, boolean> = {}
        const profs = ((await c.admin.from('profiles').select('id').eq('role', 'montør')).data ?? []) as Array<{ id: string }>
        const emps = ((await c.admin.from('employees').select('profile_id').not('profile_id', 'is', null)).data ?? []) as Array<{ profile_id: string }>
        const linked = new Set(emps.map((e) => e.profile_id))
        const expectMontorsOk = profs.every((p) => linked.has(p.id))
        await gotoSafe(a.page, `${base}/dashboard/go-live`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = a.page.getByTestId('pilot-setup')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        r.kort_vist = (await card.count()) > 0
        // de fire opsætningspunkter (driftspunkterne fra U114 kommer oveni)
        r.fire_punkter = (await Promise.all(['company', 'bank', 'montors', 'economic_customers'].map(async (k) => (await card.getByTestId(`pilot-setup-${k}`).count()) === 1))).every(Boolean)
        r.montoer_status_korrekt = (await a.page.getByTestId('pilot-setup-montors').getAttribute('data-ok').catch(() => null)) === (expectMontorsOk ? 'ja' : 'nej')
        // R-7: mail-afsendelse og app-adresse vises (kun ja/nej — testserveren har ingen Graph-nøgler, så værdien tjekkes ikke)
        r.mail_og_appurl_punkter = (await card.getByTestId('pilot-setup-graph_mail').count()) === 1 && (await card.getByTestId('pilot-setup-app_url').count()) === 1
        out.push({ id: 'U53 go-live: opsætning før pilot', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · montører=${profs.length} koblede=${profs.filter((p) => linked.has(p.id)).length}` })
      }

      // U56 kundeportal: sagens interne bemærkning (status_note, "Bemærkninger (interne)") vises/sendes IKKE til kunden
      if (want('U56') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const note = `INTERNBEMAERKNING${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] portal-sag ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, status_note: note }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        if (caseId) listCaseIds.push(caseId)
        const tok = randomBytes(32).toString('hex')
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u56TokenId = (pt.data?.[0] as { id?: string } | undefined)?.id ?? null
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        kp.on('pageerror', (e) => pageErrors.push(`kunde-sag: ${e.message.slice(0, 120)}`))
        await gotoSafe(kp, `${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const html = await kp.content().catch(() => '')
        r.sag_vist = html.includes(`[HARNESS] portal-sag ${stamp}`)
        r.intern_bemaerkning_skjult = !html.includes(note)
        await kctx.close().catch(() => {})
        out.push({ id: 'U56 portal: intern sagsbemærkning skjult', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U57 accepteret tilbud → tilknyttede leads vundet (salgspipeline)
      if (want('U57') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mkLead = async (n: string, status: string, custom: Record<string, unknown> | null) => ((await c.admin.from('leads').insert([{ company_name: `[HARNESS] pipeline ${n} ${stamp}`,
          contact_person: n, email: `pipe-${n}-${stamp}@harness.test`, status, source: 'website', created_by: adminUser.id, custom_fields: custom ?? {} }]).select('id')).data?.[0] as { id?: string } | undefined)?.id
        const leadA = await mkLead('A', 'proposal', null)
        const leadB = await mkLead('B', 'negotiation', { customer_id: profitCustomerId })
        const leadC = await mkLead('C', 'lost', { customer_id: profitCustomerId })
        for (const id of [leadA, leadB, leadC]) if (id) u27LeadIds.push(id)
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PW-${stamp}`, title: `[HARNESS] pipeline-tilbud ${stamp}`, customer_id: profitCustomerId,
          lead_id: leadA, status: 'sent', sent_at: new Date().toISOString(), created_by: adminUser.id }]).select('id')
        u57OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        a.page.on('dialog', (d) => { d.accept().catch(() => {}) })
        await gotoSafe(a.page, `${base}/dashboard/offers/${u57OfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /^Accepteret$/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const confirmBtn = a.page.getByRole('button', { name: /^(Bekræft|Ja|Acceptér|Skift status)$/ })
        if (await confirmBtn.first().isVisible().catch(() => false)) await confirmBtn.first().click().catch(() => {})
        type Ld = { id: string; status: string }
        const readLeads = async () => ((await c.admin.from('leads').select('id, status').in('id', [leadA, leadB, leadC].filter(Boolean) as string[])).data ?? []) as Ld[]
        let leads = await readLeads()
        for (let i = 0; i < 20 && !leads.some((l) => l.id === leadA && l.status === 'won'); i++) { await new Promise((res) => setTimeout(res, 1000)); leads = await readLeads() }
        a.page.removeAllListeners('dialog')
        const st = (id?: string) => leads.find((l) => l.id === id)?.status
        const offStatus = String(((await c.admin.from('offers').select('status').eq('id', u57OfferId ?? '').maybeSingle()).data as { status?: string } | null)?.status ?? '')
        r.tilbud_accepteret = offStatus === 'accepted'
        r.lead_via_lead_id_vundet = st(leadA) === 'won'
        // Leads-review 2026-10-08 (#1): kun tilbuddets EGET lead vindes — kundens andet åbne lead (fx en anden forespørgsel) røres ikke
        r.andet_lead_uaendret = st(leadB) === 'negotiation'
        r.tabt_lead_uaendret = st(leadC) === 'lost'
        const acts = ((await c.admin.from('lead_activities').select('lead_id, description').in('lead_id', [leadA, leadB].filter(Boolean) as string[])).data ?? []) as Array<{ lead_id: string; description: string }>
        r.aktivitet_logget = acts.filter((x) => x.description.includes('Vundet')).length === 1
        out.push({ id: 'U57 accepteret tilbud → lead vundet', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · leads=${JSON.stringify(leads.map((l) => l.status))}` })
      }

      // U58 udløbet tilbud markeres (kunden kan ikke acceptere i portalen)
      if (want('U58') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const dk = (o: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + o * 86400_000))
        const mk = async (n: string, validUntil: string) => ((await c.admin.from('offers').insert([{ offer_number: `UI-E2E-X${n}-${stamp}`, title: `[HARNESS] udløb ${n} ${stamp}`,
          customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(), created_by: adminUser.id, valid_until: validUntil }]).select('id')).data?.[0] as { id?: string } | undefined)?.id
        const expired = await mk('U', dk(-1)), valid = await mk('G', dk(1))
        u58Ids.push(...([expired, valid].filter(Boolean) as string[]))
        await gotoSafe(a.page, `${base}/dashboard/offers/${expired}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-expired').first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.udloebet_markeret = (await a.page.getByTestId('offer-expired').count()) > 0
        await gotoSafe(a.page, `${base}/dashboard/offers/${valid}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.waitForTimeout(1500)
        r.gyldigt_ikke_markeret = (await a.page.getByTestId('offer-expired').count()) === 0
        await gotoSafe(a.page, `${base}/dashboard/offers?search=${encodeURIComponent(`UI-E2E-XU-${stamp}`)}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-expired').first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.listen_markerer = (await a.page.getByTestId('offer-expired').count()) > 0
        out.push({ id: 'U58 udløbet tilbud markeret', ok: u58Ids.length === 2 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U60 N8a: lav DB er en ADVARSEL — afsendelse/“sendt” kræver aktiv bekræftelse (ingen mail sendes i testen)
      if (want('U60') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        u60Since = new Date().toISOString()
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-LD-${stamp}`, title: `[HARNESS] lav DB ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id, tax_percentage: 25 }]).select('id')
        u60OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u60OfferId) await c.admin.from('offer_line_items').insert([{ offer_id: u60OfferId, position: 1, description: 'Inverter', quantity: 1, unit: 'stk', unit_price: 1000, total: 1000, cost_price: 990 }])
        await gotoSafe(a.page, `${base}/dashboard/offers/${u60OfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-lowdb-banner').waitFor({ timeout: 90_000 }).catch(() => {})
        r.advarsel_vist = (await a.page.getByTestId('offer-lowdb-banner').count()) === 1
        const sendBtn = a.page.getByRole('button', { name: 'Send Tilbud' }).first()
        r.send_ikke_blokeret = await sendBtn.isEnabled().catch(() => false)
        await sendBtn.click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('send-lowdb-warning').waitFor({ timeout: 60_000 }).catch(() => {})
        const mailBtn = a.page.getByTestId('send-email-submit')
        await mailBtn.waitFor({ timeout: 30_000 }).catch(() => {})
        r.dialog_advarsel = (await a.page.getByTestId('send-lowdb-warning').count()) === 1
        // Vent til forhåndsvisningen er hentet (ellers er knappen deaktiveret af den grund) — afkrydsningen er så eneste blokering
        for (let i = 0; i < 30 && !(await a.page.getByRole('dialog').getByText(/Til:|Emne/).count().catch(() => 0)); i++) await new Promise((res) => setTimeout(res, 1000))
        r.send_kraever_bekraeftelse = await mailBtn.isDisabled({ timeout: 10_000 }).catch(() => false)
        await a.page.getByTestId('send-lowdb-ack').check({ timeout: 30_000 }).catch(() => {})
        // Når forhåndsvisningen er klar, er knappen aktiv efter bekræftelse (vi trykker IKKE — ingen mail)
        for (let i = 0; i < 30 && !(await mailBtn.isEnabled().catch(() => false)); i++) await new Promise((res) => setTimeout(res, 1000))
        r.bekraeftet_kan_sende = await mailBtn.isEnabled().catch(() => false)
        await a.page.getByRole('button', { name: 'Annuller' }).first().click({ timeout: 30_000 }).catch(() => {})
        // Manuel status "Sendt": afvist bekræftelse → stadig kladde; accepteret → sendt + audit
        const readStatus = async () => ((await c.admin.from('offers').select('status').eq('id', u60OfferId ?? '').maybeSingle()).data as { status?: string } | null)?.status
        a.page.once('dialog', (d) => { d.dismiss().catch(() => {}) })
        await a.page.getByRole('button', { name: 'Sendt', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
        await new Promise((res) => setTimeout(res, 4000))
        r.annulleret_forbliver_kladde = (await readStatus()) === 'draft'
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        // S-1: "Sendt" bekræftes først ("uden at sende"), derefter lav-DB-bekræftelsen — begge accepteres
        const acceptAll = (d: { accept: () => Promise<void> }) => { d.accept().catch(() => {}) }
        a.page.on('dialog', acceptAll)
        await a.page.getByRole('button', { name: 'Sendt', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
        let st: string | undefined
        for (let i = 0; i < 20; i++) { st = await readStatus(); if (st === 'sent') break; await new Promise((res) => setTimeout(res, 1000)) }
        a.page.off('dialog', acceptAll)
        r.bekraeftet_markeret_sendt = st === 'sent'
        // audit skrives efter statusopdateringen — poll
        let audOk = false
        for (let i = 0; i < 20 && !audOk; i++) {
          const aud = ((await c.admin.from('audit_logs').select('metadata').eq('entity_id', u60OfferId ?? '').eq('entity_type', 'offer')).data ?? []) as Array<{ metadata: Record<string, unknown> | null }>
          audOk = aud.some((x) => x.metadata?.low_db_acknowledged === true)
          if (!audOk) await new Promise((res) => setTimeout(res, 1000))
        }
        r.bekraeftelse_auditlogget = audOk
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u60-lav-db.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U60 N8a lav DB = advarsel med bekræftelse', ok: !!u60OfferId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U61 D28: bogholderi ser kundens KOBLEDE mails (kun læsning) — ikke adresse-match/hele postkassen
      if (want('U61') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const bog = await mkUser('bogholderi')
        const linkedSubj = `[HARNESS] faktura-spørgsmål ${stamp}`, looseSubj = `[HARNESS] løs mail ${stamp}`
        const custEmail = ((await c.admin.from('customers').select('email').eq('id', profitCustomerId).maybeSingle()).data as { email?: string | null } | null)?.email ?? `ui-profit-${stamp}@harness.test`
        const em = await c.admin.from('incoming_emails').insert([
          { sender_email: custEmail, subject: linkedSubj, body_text: `Linket brødtekst ${stamp}`, customer_id: profitCustomerId, received_at: new Date().toISOString(), is_archived: false, link_status: 'linked' },
          // samme nøgler i begge rækker: supabase-js bulk-insert sætter manglende kolonner til NULL (link_status er NOT NULL)
          { sender_email: custEmail, subject: looseSubj, body_text: 'Løs', customer_id: null, received_at: new Date().toISOString(), is_archived: false, link_status: 'unidentified' },
        ]).select('id')
        for (const x of (em.data ?? []) as Array<{ id: string }>) seededEmailIds.push(x.id)
        const b = await login(bog)
        r.bogholderi_login = b.ok
        await gotoSafe(b.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await b.page.getByText(linkedSubj).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.ser_koblet_mail = (await b.page.getByText(linkedSubj).count()) > 0
        r.ser_ikke_loes_mail = (await b.page.getByText(looseSubj).count()) === 0
        r.kun_laesning = (await b.page.getByTestId('customer-mails-readonly').count()) === 1 && (await b.page.getByRole('button', { name: /Ny Mail/ }).count()) === 0
        await b.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await b.ctx.close().catch(() => {})
        // Kontoret (customers.edit) ser fortsat begge (adresse-match) og kan skrive
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(looseSubj).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.kontor_ser_begge = (await a.page.getByText(linkedSubj).count()) > 0 && (await a.page.getByText(looseSubj).count()) > 0 && (await a.page.getByRole('button', { name: /Ny Mail/ }).count()) > 0
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        out.push({ id: 'U61 D28 bogholderi: kundens koblede mails (læsning)', ok: !em.error && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${em.error ? ` · SEED: ${em.error.message}` : ''}` })
      }

      // U64 webhenvendelser: kontaktformular-mails (også tidligere fejl-ignorerede) vises under "Webhenvendelser";
      // FormSubmits systemmails gør ikke
      if (want('U64')) {
        const r: Record<string, boolean> = {}
        const inq = `Ny henvendelse fra eltasolar.dk [HARNESS ${stamp}]`, sys = `Action Required: Activate FormSubmit henvendelse [HARNESS ${stamp}]`
        const em = await c.admin.from('incoming_emails').insert([
          { sender_email: 'submissions@formsubmit.co', subject: inq, body_text: "Here's what they had to say:\nname\nTest Testesen\nemail\ntest@example.dk", received_at: new Date().toISOString(), is_archived: false, link_status: 'ignored' },
          { sender_email: 'noreply@example.dk', subject: sys, body_text: 'x', received_at: new Date().toISOString(), is_archived: false, link_status: 'ignored' },
        ]).select('id')
        for (const x of (em.data ?? []) as Array<{ id: string }>) seededEmailIds.push(x.id)
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(inq).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.fane_vist = (await a.page.getByRole('button', { name: /Webhenvendelser/ }).count()) > 0
        r.fejl_ignoreret_henvendelse_vist = (await a.page.getByText(inq).count()) > 0
        r.andre_mails_ikke_vist = (await a.page.getByText(sys).count()) === 0
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        out.push({ id: 'U64 webhenvendelser i indbakken', ok: !em.error && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${em.error ? ` · SEED: ${em.error.message}` : ''}` })
      }

      // U65 N24a: ukoblet mail fra kundens adresse (modtaget før kobling) → "Kobl tidligere mails" på kundekortet
      if (want('U65') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const custEmail = ((await c.admin.from('customers').select('email').eq('id', profitCustomerId).maybeSingle()).data as { email?: string | null } | null)?.email
        const subj = `[HARNESS] gammel kundemail ${stamp}`
        const em = custEmail ? await c.admin.from('incoming_emails').insert([{ sender_email: custEmail.toUpperCase(), subject: subj, customer_id: null,
          received_at: new Date(Date.now() - 30 * 86400_000).toISOString(), is_archived: false, link_status: 'unidentified' }]).select('id') : null
        const emId = (em?.data?.[0] as { id?: string } | undefined)?.id
        if (emId) seededEmailIds.push(emId)
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const btn = a.page.getByTestId('customer-mails-link-old')
        await btn.waitFor({ timeout: 60_000 }).catch(() => {})
        r.knap_vist = (await btn.count()) === 1
        await btn.click({ timeout: 30_000 }).catch(() => {})
        type LinkRow = { customer_id?: string | null; linked_by?: string | null }
        let linked: LinkRow | null = null
        for (let i = 0; i < 20; i++) {
          linked = (await c.admin.from('incoming_emails').select('customer_id, linked_by').eq('id', emId ?? '').maybeSingle()).data as LinkRow | null
          if (linked?.customer_id) break
          await new Promise((res) => setTimeout(res, 1000))
        }
        r.mail_koblet = linked?.customer_id === profitCustomerId && linked?.linked_by === 'retro'
        await a.page.getByText(subj).first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.vist_paa_kundekort = (await a.page.getByText(subj).count()) > 0
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        out.push({ id: 'U65 N24a tidligere kundemails kobles', ok: !!emId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U67 N27: styringscockpittet tæller sager klar til lukning (alle job udført, intet ufaktureret)
      if (want('U67') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] cockpit-klar ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const cid = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (cid) {
          listCaseIds.push(cid)
          await c.admin.from('work_orders').insert([{ case_id: cid, title: `[HARNESS] udført ${stamp}`, status: 'done', completed_at: new Date().toISOString() }])
        }
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('cockpit-ready-to-close').waitFor({ timeout: 60_000 }).catch(() => {})
        r.cockpit_viser_klar = (await a.page.getByTestId('cockpit-ready-to-close').count()) === 1
        if (cid) {
          const { data: rw } = await c.admin.from('work_orders').select('id').eq('case_id', cid)
          for (const w of (rw ?? []) as Array<{ id: string }>) { await c.admin.from('work_order_profit').delete().eq('work_order_id', w.id); await c.admin.from('work_orders').delete().eq('id', w.id) }
        }
        out.push({ id: 'U67 N27 cockpit: sager klar til lukning', ok: !!cid && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U68 N35: webhenvendelse → "Opret lead" (kontaktdata fra formularen, kilde website, koblet til mailen)
      if (want('U68')) {
        const r: Record<string, boolean> = {}
        const subj = `Ny henvendelse fra eltasolar.dk [LEAD ${stamp}]`
        const leadMail = `webform-${stamp}@harness.test`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', reply_to: leadMail, subject: subj,
          body_text: `Here's what they had to say:\nName\nValue\nname\nWeb Testesen\nphone\n+45 22 33 44 55\nemail\n${leadMail}\ninquiry_type\nSolceller\nmessage\nTilbud tak`,
          received_at: new Date().toISOString(), is_archived: false, link_status: 'unidentified' }]).select('id')
        const emId = (em.data?.[0] as { id?: string } | undefined)?.id
        if (emId) seededEmailIds.push(emId)
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(subj).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('mail-create-lead').click({ timeout: 60_000 }).catch(() => {})
        type L = { id: string; email: string; phone: string | null; source: string; company_name: string }
        let lead: L | null = null
        for (let i = 0; i < 20 && !lead; i++) {
          lead = (await c.admin.from('leads').select('id, email, phone, source, company_name').eq('custom_fields->>source_email_id', emId ?? '').maybeSingle()).data as L | null
          if (!lead) await new Promise((res) => setTimeout(res, 1000))
        }
        if (lead) u27LeadIds.push(lead.id)
        r.lead_oprettet = !!lead
        r.kundens_mail_ikke_formsubmit = lead?.email === leadMail
        r.navn_og_telefon = !!lead?.company_name.includes('Web Testesen') && (lead?.phone ?? '').replace(/\D/g, '').endsWith('22334455')
        r.kilde_website = lead?.source === 'website'
        // knappen skifter først efter refresh — vent på den (flaky ved øjeblikkelig optælling)
        await a.page.getByTestId('mail-lead-open').first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.knap_bliver_aabn_lead = (await a.page.getByTestId('mail-lead-open').count()) === 1
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        // LD-7: samme person indsender igen → ingen dublet-lead; mailen kobles på det åbne lead
        const subj2 = `Ny henvendelse fra eltasolar.dk [LEAD2 ${stamp}]`
        const em2 = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', reply_to: leadMail, subject: subj2,
          body_text: `Here's what they had to say:\nName\nValue\nname\nWeb Testesen\nphone\n+45 22 33 44 55\nemail\n${leadMail}\ninquiry_type\nSolceller\nmessage\nHar I set min besked?`,
          received_at: new Date().toISOString(), is_archived: false, link_status: 'unidentified' }]).select('id')
        const em2Id = (em2.data?.[0] as { id?: string } | undefined)?.id
        if (em2Id) seededEmailIds.push(em2Id)
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(subj2).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('mail-create-lead').click({ timeout: 60_000 }).catch(() => {})
        let extra: string[] = []
        for (let i = 0; i < 20 && !extra.includes(em2Id ?? '-'); i++) {
          const row = (await c.admin.from('leads').select('custom_fields').eq('id', lead?.id ?? '').maybeSingle()).data as { custom_fields?: { extra_source_email_ids?: string[] } | null } | null
          extra = row?.custom_fields?.extra_source_email_ids ?? []
          if (!extra.includes(em2Id ?? '-')) await new Promise((res) => setTimeout(res, 1000))
        }
        const same = ((await c.admin.from('leads').select('id').eq('email', leadMail)).data ?? []) as Array<{ id: string }>
        for (const x of same) if (!u27LeadIds.includes(x.id)) u27LeadIds.push(x.id)
        r.gentaget_ingen_dublet = same.length === 1
        r.gentaget_koblet_paa_lead = !!em2Id && extra.includes(em2Id)
        out.push({ id: 'U68 N35 webhenvendelse → lead', ok: !!emId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U69 N31 + D40: kunden booker besigtigelse i portalen (CRM-opgave, ingen kundemail uden flag); interne
      // kundeopgaver vises/sendes IKKE til portalen
      if (want('U69') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u69TokenId = (pt.data?.[0] as { id?: string } | undefined)?.id ?? null
        const secret = `[HARNESS] INTERN dårlig betaler ${stamp}`
        const it = await c.admin.from('customer_tasks').insert([{ customer_id: profitCustomerId, title: secret, description: `Intern note ${stamp}`,
          status: 'pending', priority: 'normal', due_date: new Date(Date.now() + 3 * 86400_000).toISOString(), created_by: adminUser.id }]).select('id')
        const internalId = (it.data?.[0] as { id?: string } | undefined)?.id
        if (internalId) u69TaskIds.push(internalId)
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        const kp = await kctx.newPage()
        await gotoSafe(kp, `${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await kp.getByTestId('portal-book-open').first().click({ timeout: 60_000 }).catch(() => {})
        const d = new Date(Date.now() + 7 * 86400_000)
        const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(d)
        await kp.getByTestId('portal-book-date').fill(dateKey).catch(() => {})
        await kp.getByTestId('portal-book-slot').selectOption({ index: 1 }).catch(() => {})
        await kp.getByTestId('portal-book-submit').click({ timeout: 30_000 }).catch(() => {})
        await kp.getByTestId('portal-booking-done').waitFor({ timeout: 30_000 }).catch(() => {})
        r.bekraeftet_i_portal = (await kp.getByTestId('portal-booking-done').count()) === 1
        type T = { id: string; created_by: string | null; due_date: string | null; description: string | null }
        let task: T | null = null
        for (let i = 0; i < 15 && !task; i++) {
          task = (await c.admin.from('customer_tasks').select('id, created_by, due_date, description').eq('customer_id', profitCustomerId).ilike('title', 'PORTAL: Besigtigelse%').gte('created_at', new Date(Date.now() - 600_000).toISOString()).limit(1).maybeSingle()).data as T | null
          if (!task) await new Promise((res) => setTimeout(res, 1000))
        }
        if (task) u69TaskIds.push(task.id)
        r.crm_opgave_oprettet = !!task && task.created_by === null && (task.due_date ?? '').startsWith(dateKey) && (task.description ?? '').includes('10:00–12:00')
        // TZ-3: opgavens tidspunkt er tidsrummets start i dansk tid (før UTC-midnat = 02:00)
        { const { copenhagenParts } = await import('../../src/lib/utils/copenhagen-time'); r.tidspunkt_10_dansk = !!task?.due_date && copenhagenParts(task.due_date).clock === '10:00' }
        // D40: den interne opgave må hverken vises eller ligge i sidens data
        await gotoSafe(kp, `${base}/portal/${tok}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const html = await kp.content().catch(() => '')
        r.intern_opgave_ikke_eksponeret = !html.includes(secret) && !html.includes(`Intern note ${stamp}`)
        r.booking_vist = (await kp.getByText(/10:00–12:00/).count()) > 0
        await kctx.close().catch(() => {})
        out.push({ id: 'U69 N31/D40 portal-booking + ingen interne opgaver', ok: !!u69TokenId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U70 N36: dashboardets "Aktive Sager" bygger på sager (før: gammel projektmodel → 0); aktivitetslisten linker
      // kun ind i /dashboard (før: /customers/…, /offers/…, /projects/… → 404)
      if (want('U70')) {
        const r: Record<string, boolean> = {}
        const { count } = await c.admin.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).not('status', 'in', '("closed","converted")')
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const label = a.page.locator('p', { hasText: /^Aktive Sager$/ }).first()
        await label.waitFor({ timeout: 60_000 }).catch(() => {})
        const shown = (await label.locator('xpath=following-sibling::p[1]').innerText().catch(() => '')).trim()
        r.aktive_sager_fra_sager = shown === String(count ?? -1)
        const hrefs = await a.page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
        const bad = hrefs.filter((h) => /^\/(customers|offers|projects)\//.test(h) || h.startsWith('/dashboard/projects/'))
        r.ingen_doede_links = bad.length === 0
        out.push({ id: 'U70 N36 dashboard på sager', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · vist=${shown} forventet=${count}${bad.length ? ` · døde: ${bad.slice(0, 3).join(',')}` : ''}` })
      }

      // U74 privacy/RBAC: salg får ingen kost/leverandørkost/avance i tilbuddets data (D43) eller leverandørsøgning (D44);
      // montør/salg får ikke sagens interne budget/lav-DB (D46); kontoret ser fortsat kost
      if (want('U74') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PV-${stamp}`, title: `[HARNESS] privacy ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        const oid = (off.data?.[0] as { id?: string } | undefined)?.id
        if (oid) u74OfferId = oid
        if (oid) await c.admin.from('offer_line_items').insert([{ offer_id: oid, position: 1, description: 'Inverter', quantity: 1, unit: 'stk', unit_price: 9000, total: 9000,
          cost_price: 4321.09, supplier_cost_price_at_creation: 4321.09, supplier_margin_applied: 37.5 }])
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] budget ${stamp}`, customer_id: profitCustomerId, status: 'new', priority: 'medium',
          source: 'manual', created_by: salg.id, budget: 76543.21, low_profit: true }]).select('id')
        const cid = (sc.data?.[0] as { id?: string } | undefined)?.id
        if (cid) listCaseIds.push(cid)
        const sp = await login(salg)
        const net: string[] = []
        sp.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } }) // kun data/HTML — JS-bundles indeholder UI-tekster som "Lav DB"
        await gotoSafe(sp.page, `${base}/dashboard/offers/${oid}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1500)
        const offerAll = (await sp.page.content().catch(() => '')) + net.join('\n')
        r.salg_tilbud_uden_kost = !offerAll.includes('4321.09') && !offerAll.includes('4.321,09') && !/"supplier_margin_applied":\s*37/.test(offerAll)
        // D43 data-værn: salg redigerer linjen (autosave ved blur) → de skjulte kost-/avancefelter må IKKE nulstilles
        const desc = sp.page.locator('input[placeholder="Beskrivelse..."]').first()
        await desc.fill(`Inverter redigeret ${stamp}`).catch(() => {})
        await desc.press('Tab').catch(() => {})
        type LI = { description: string; cost_price: number | null; supplier_cost_price_at_creation: number | null; supplier_margin_applied: number | null }
        let li: LI | null = null
        for (let i = 0; i < 20; i++) {
          li = (await c.admin.from('offer_line_items').select('description, cost_price, supplier_cost_price_at_creation, supplier_margin_applied').eq('offer_id', oid ?? '').maybeSingle()).data as LI | null
          if (li?.description === `Inverter redigeret ${stamp}`) break
          await new Promise((res) => setTimeout(res, 1000))
        }
        r.salg_redigering_gemt = li?.description === `Inverter redigeret ${stamp}`
        r.skjult_kost_bevaret = Number(li?.cost_price) === 4321.09 && Number(li?.supplier_cost_price_at_creation) === 4321.09 && Number(li?.supplier_margin_applied) === 37.5
        net.length = 0
        await gotoSafe(sp.page, `${base}/dashboard/orders/${cid}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1500)
        const caseAll = (await sp.page.content().catch(() => '')) + net.join('\n')
        const caseDiag = [caseAll.includes('76543') ? 'budget-tal' : '', caseAll.includes('76.543') ? 'budget-dk' : '', /"low_profit":\s*true/.test(caseAll) ? 'low_profit' : '', caseAll.includes('Lav DB') ? 'tekst-Lav-DB' : ''].filter(Boolean)
        u74Diag = caseDiag.join(',')
        if (caseDiag.length) { const i = caseAll.indexOf(caseDiag.includes('tekst-Lav-DB') ? 'Lav DB' : caseDiag.includes('low_profit') ? 'low_profit' : '76543'); u74Diag += ` ved: ${caseAll.slice(Math.max(0, i - 120), i + 40).replace(/\s+/g, ' ')}` }
        r.salg_sag_uden_budget = caseDiag.length === 0
        net.length = 0
        await gotoSafe(sp.page, `${base}/dashboard/orders`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1000)
        const listAll = (await sp.page.content().catch(() => '')) + net.join('\n')
        r.sagsliste_uden_lav_db = !/"low_profit":\s*true/.test(listAll) && !listAll.includes('Lav DB') && !listAll.includes('76543')
        await sp.ctx.close().catch(() => {})
        // kontoret ser fortsat kost på tilbuddet
        await gotoSafe(a.page, `${base}/dashboard/offers/${oid}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 60_000 }).catch(() => {}) // PV8: kost/DB sammenfoldet som standard
        await a.page.waitForTimeout(1000)
        r.kontor_ser_kost = (await a.page.content().catch(() => '')).includes('4.321,09')
        await a.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        out.push({ id: 'U74 privacy: tilbud/sag uden kost for salg', ok: !!oid && !!cid && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${u74Diag ? ` · ${u74Diag.slice(0, 260)}` : ''}` })
      }

      // U75 D47: produktkataloget — salg ser ingen kostpris-kolonne/-værdier; kontoret gør
      if (want('U75')) {
        const r: Record<string, boolean> = {}
        // mindst ét produkt (tom katalog → ingen tabel/kolonne at teste)
        const pr = await c.admin.from('product_catalog').insert([{ name: `[HARNESS] produkt ${stamp}`, list_price: 199, cost_price: 123.45 }]).select('id')
        u75ProductId = (pr.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = await login(salg)
        const net: string[] = []
        sp.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } }) // kun data/HTML — JS-bundles indeholder UI-tekster som "Lav DB"
        await gotoSafe(sp.page, `${base}/dashboard/products`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1000)
        const all = (await sp.page.content().catch(() => '')) + net.join('\n')
        r.salg_ingen_kostkolonne = (await sp.page.getByRole('columnheader', { name: 'Kostpris' }).count()) === 0
        r.salg_ingen_kostvaerdier = !/"cost_price":\s*[1-9]/.test(all)
        await sp.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/products`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.kontor_ser_kostkolonne = (await a.page.getByRole('columnheader', { name: 'Kostpris' }).count()) > 0
        out.push({ id: 'U75 D47 produkter uden kostpris for salg', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U76 D49: pris-/systemadvarsler (leverandørkost, lav margin) kun for kostpris-roller; prisovervågning ingen adgang for salg
      if (want('U76')) {
        const r: Record<string, boolean> = {}
        const sp = await login(salg)
        await gotoSafe(sp.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1000)
        r.salg_ingen_prisovervaagning_paa_dashboard = (await sp.page.getByRole('heading', { name: 'Prisovervågning' }).count()) === 0 && (await sp.page.getByRole('heading', { name: 'Systemadvarsler' }).count()) === 0
        await gotoSafe(sp.page, `${base}/dashboard/pricing`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.salg_ingen_adgang_til_prisovervaagning = (await sp.page.getByText(/ikke adgang/i).count()) > 0
        await sp.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.kontor_ser_prisovervaagning = (await a.page.getByRole('heading', { name: 'Prisovervågning' }).count()) > 0
        await a.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        out.push({ id: 'U76 D49 prisadvarsler kun for kostpris-roller', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U77 D44/D47/D48/D51: salg — leverandørsøgning uden netto-/kostpris, produktdetalje uden kost/avance,
      // ingen kalkulationer (modul + "Fra kalkulation"), solcelle-beregner uden komponentkost/avance; kontoret ser dem
      if (want('U77') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-SR-${stamp}`, title: `[HARNESS] søg ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        u77OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const pr = await c.admin.from('product_catalog').insert([{ name: `[HARNESS] detalje ${stamp}`, list_price: 299, cost_price: 111.11 }]).select('id')
        u77ProductId = (pr.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = await login(salg)
        const net: string[] = []
        sp.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } })
        // D44 leverandørsøgning
        await gotoSafe(sp.page, `${base}/dashboard/offers/${u77OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        // egen leverandørvare med kendt kostpris (ellers beviser "ingen netto" intet)
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U77 grossist ${stamp}`, code: `HU77${stamp}`, is_active: true }]).select('id')
        u77SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sku = `H77-${stamp}`
        if (u77SupplierId) await c.admin.from('supplier_products').insert([{ supplier_id: u77SupplierId, supplier_sku: sku, supplier_name: `Harness U77 vare ${stamp}`, cost_price: 43.21, unit: 'stk', is_available: true }])
        await sp.page.getByRole('button', { name: /Fra leverandør/ }).first().click({ timeout: 30_000 }).catch(() => {})
        net.length = 0
        await sp.page.getByPlaceholder(/Indtast varenummer eller produktnavn/).fill(sku).catch(() => {})
        const hit = sp.page.getByText(`Harness U77 vare ${stamp}`).first()
        await hit.waitFor({ timeout: 60_000 }).catch(() => {})
        await sp.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        const searchAll = net.join('\n') + (await sp.page.content().catch(() => ''))
        r.soegning_gav_resultater = (await hit.count()) > 0
        r.soegning_uden_kost = !searchAll.includes('43.21') && !searchAll.includes('43,21') && (await sp.page.getByText('Netto', { exact: true }).count()) === 0
        r.ingen_fra_kalkulation = (await sp.page.getByRole('button', { name: 'Fra kalkulation' }).count()) === 0
        // D47 produktdetalje
        net.length = 0
        await gotoSafe(sp.page, `${base}/dashboard/products/${u77ProductId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const prodAll = (await sp.page.content().catch(() => '')) + net.join('\n')
        r.produktdetalje_uden_kost = !prodAll.includes('111.11') && !prodAll.includes('111,11') && (await sp.page.getByText('Avance', { exact: true }).count()) === 0
        // D48 kalkulationer
        await gotoSafe(sp.page, `${base}/dashboard/calculations`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.ingen_kalkulationer = (await sp.page.getByText(/ikke adgang/i).count()) > 0
        // D51 solcelle-beregner
        await gotoSafe(sp.page, `${base}/dashboard/calc`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sp.page.waitForTimeout(1500)
        const calcText = await sp.page.locator('body').innerText().catch(() => '')
        r.beregner_uden_intern_kost = !/Arbejdsløn|Avance|Subtotal/.test(calcText) && /Før moms|Total/i.test(calcText)
        await sp.ctx.close().catch(() => {})
        // kontoret
        await gotoSafe(a.page, `${base}/dashboard/calc`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1500)
        r.kontor_ser_intern_kost = /Avance|Arbejdsløn/.test(await a.page.locator('body').innerText().catch(() => ''))
        await gotoSafe(a.page, `${base}/dashboard/calculations`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.kontor_har_kalkulationer = (await a.page.getByText(/ikke adgang/i).count()) === 0
        out.push({ id: 'U77 privacy: salg uden kost i søgning/produkt/kalkulation/beregner', ok: !!u77OfferId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U78 PV9: leverandørens IBAN maskeres (sidste 4); fuld visning kun via "Vis" for bank.view (admin, bogholderi)
      if (want('U78')) {
        const r: Record<string, boolean> = {}
        const FULL = 'DK5000400440116243'
        const ii = await c.admin.from('incoming_invoices').insert([{ source: 'manual', iban: FULL, supplier_name_extracted: `[HARNESS] IBAN ${stamp}` }]).select('id')
        u78InvoiceId = (ii.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sl = await mkUser('serviceleder')
        const s = await login(sl)
        const net: string[] = []
        s.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } })
        await gotoSafe(s.page, `${base}/dashboard/incoming-invoices/${u78InvoiceId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.getByTestId('iban-value').waitFor({ timeout: 60_000 }).catch(() => {})
        const slAll = (await s.page.content().catch(() => '')) + net.join('\n')
        r.serviceleder_maskeret = (await s.page.getByTestId('iban-value').innerText().catch(() => '')).includes('6243') && !slAll.includes(FULL)
        r.serviceleder_ingen_vis = (await s.page.getByTestId('iban-reveal').count()) === 0
        await s.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u78InvoiceId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('iban-reveal').click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(1500)
        r.admin_kan_vise_fuld = (await a.page.getByTestId('iban-value').innerText().catch(() => '')) === FULL
        out.push({ id: 'U78 PV9 IBAN maskeret', ok: !!u78InvoiceId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U6 opkalds-opslag (P3 #15): ukendt nummer giver tom-tilstand, ingen fejl
      await gotoSafe(a.page, `${base}/dashboard/cti?number=4500000001`, { waitUntil: 'networkidle', timeout: 180_000 })
      const cti = { heading: await a.page.getByRole('heading', { name: 'Opkald' }).isVisible(), formatted: (await a.page.getByText('+45 00 00 00 01').count()) > 0,
        unknown: (await a.page.getByText('Ukendt nummer').count()) > 0 }
      out.push({ id: 'U6 opkalds-opslag (admin)', ok: cti.heading && cti.formatted && cti.unknown, note: Object.entries(cti).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // ---- montoer
    const m = await login(montor)
    if (m.ok) {
      const denied: string[] = []
      for (const path of ['/dashboard/agents', '/dashboard/pilot-health', '/dashboard/mail']) { // mail: G9
        await gotoSafe(m.page, `${base}${path}`, { waitUntil: 'networkidle', timeout: 180_000 })
        // vent på teksten (server-komponenten kan streame efter networkidle — count() alene var flaky: 2/3 én gang)
        if (await m.page.getByText('Du har ikke adgang').first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) denied.push(path)
      }
      await m.page.screenshot({ caret: 'initial', path: join(shots, 'pilot-health-montoer.png'), fullPage: true })
      out.push({ id: 'U4 montør: ingen adgang', ok: denied.length === 3, note: `NoAccess på ${denied.length}/3 (${denied.join(', ') || '-'})` })

      // U11 montør-dagen (G4). Seed: medarbejder koblet til montør-login, sag + planlagt arbejdsordre i dag.
      if (want('U11')) {
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
        const woTitle = `[HARNESS] montørjob ${stamp}`
        const emp = await c.admin.from('employees').insert([{ name: 'Harness Montør', first_name: 'Harness', last_name: 'Montør',
          email: montor.email, role: 'montør', active: true, profile_id: montor.id }]).select('id')
        jobEmployeeId = (emp.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sc = profitCustomerId ? await c.admin.from('service_cases').insert([{ title: '[HARNESS] montørsag', customer_id: profitCustomerId,
          status: 'new', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id') : null
        jobCaseId = (sc?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const wo = jobCaseId && jobEmployeeId ? await c.admin.from('work_orders').insert([{ case_id: jobCaseId, title: woTitle,
          scheduled_date: today, assigned_employee_id: jobEmployeeId, status: 'planned' }]).select('id') : null
        const woId = (wo?.data?.[0] as { id?: string } | undefined)?.id ?? null
        // G9: én mail på montørens sag, én på en anden sag (må ikke kunne ses)
        const oc = profitCustomerId ? await c.admin.from('service_cases').insert([{ title: '[HARNESS] fremmed sag', customer_id: profitCustomerId,
          status: 'new', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id') : null
        otherCaseId = (oc?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const mails = jobCaseId && otherCaseId ? await c.admin.from('incoming_emails').insert([
          { sender_email: `kunde-${stamp}@harness.test`, subject: `[HARNESS] egen sagsmail ${stamp}`, service_case_id: jobCaseId, received_at: new Date().toISOString(), is_archived: false },
          { sender_email: `fremmed-${stamp}@harness.test`, subject: `[HARNESS] fremmed sagsmail ${stamp}`, service_case_id: otherCaseId, received_at: new Date().toISOString(), is_archived: false },
        ]).select('id') : null
        for (const m0 of (mails?.data ?? []) as Array<{ id: string }>) seededEmailIds.push(m0.id)
        const seedErr = !jobEmployeeId ? `medarbejder: ${emp.error?.message?.slice(0, 80)}` : !jobCaseId ? `sag: ${sc?.error?.message?.slice(0, 80)}`
          : !woId ? `arbejdsordre: ${wo?.error?.message?.slice(0, 80)}` : ''

        const r: Record<string, boolean> = {}
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = m.page.getByTestId('my-jobs-card')
        r.mine_job = (await card.count()) > 0 && (await card.innerText()).includes(woTitle)
        await m.page.getByTestId('my-job').filter({ hasText: woTitle }).first().click({ timeout: 30_000 }).catch(() => {})
        await m.page.waitForURL(/tab=planlaegning/, { timeout: 60_000 }).catch(() => {})
        await m.page.getByRole('button', { name: '✓ Afslut' }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.afslut_knap = (await m.page.getByRole('button', { name: '✓ Afslut' }).count()) === 1
        // N11: montør kan starte eget job; aldrig annullere/slette
        r.start_ikke_slet = (await m.page.getByRole('button', { name: '→ Start' }).count()) === 1
          && (await m.page.getByRole('button', { name: 'Slet', exact: true }).count()) === 0 && (await m.page.getByRole('button', { name: /Annullér/ }).count()) === 0

        // Start jobbet (N11) -> in_progress i DB
        await m.page.getByRole('button', { name: '→ Start' }).first().click({ timeout: 30_000 }).catch(() => {})
        let started = ''
        for (let i = 0; i < 30 && started !== 'in_progress'; i++) { // 30 s: start kan tage >15 s på en presset dev-maskine
          started = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (started !== 'in_progress') await new Promise((res) => setTimeout(res, 1000))
        }
        r.startet = started === 'in_progress'

        // Tidsregistrering (medarbejdere/tid): 07:30–11:45 i dag, dansk tid → præcis UTC i DB og 4,25 t (G0-sommertidsfix)
        {
          const { copenhagenLocalToIso } = await import('../../src/lib/utils/copenhagen-time')
          await m.page.getByRole('button', { name: /Registrér timer/ }).first().click({ timeout: 30_000 }).catch(() => {})
          await m.page.locator('input[type="time"]').first().fill('07:30').catch(() => {})
          await m.page.locator('input[type="time"]').nth(1).fill('11:45').catch(() => {})
          await m.page.getByPlaceholder('Hvad blev der lavet?').fill('Montage af stikkontakter').catch(() => {})
          // PR-4b (Henrik 2026-10-15): montøren har ingen timepris endnu → blokeret med dansk besked, ingen skjult 495
          await m.page.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          await m.page.getByText(/mangler en timepris/).first().waitFor({ timeout: 20_000 }).catch(() => {})
          r.uden_timepris_blokeret = (await m.page.getByText(/mangler en timepris/).count()) > 0
            && (((await c.admin.from('time_logs').select('id').eq('work_order_id', woId)).data ?? []).length === 0)
          // 00230: medarbejderen er markeret i medarbejder-UI'et (admin) før satsen sættes
          await gotoSafe(a.page, `${base}/dashboard/employees/${jobEmployeeId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.mangler_sats_vist = /Mangler timepris/.test(((await a.page.getByTestId('employee-rate-gap-banner').textContent().catch(() => '')) ?? ''))
          // præcis DENNE medarbejders række (staging har mange "Harness Montør" fra tidligere kørsler; listen viser højst 500)
          await gotoSafe(a.page, `${base}/dashboard/employees?q=${encodeURIComponent('Harness Montør')}`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.mangler_sats_liste = (await a.page.locator('tr', { has: a.page.locator(`a[href="/dashboard/employees/${jobEmployeeId}"]`) }).first().getByTestId('employee-rate-gap').count()) === 1
          // admin/serviceleder sætter satsen → montøren kan registrere
          if (jobEmployeeId) await c.admin.from('employees').update({ hourly_rate: 495, cost_rate: 300 }).eq('id', jobEmployeeId)
          await m.page.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          type TL = { start_time?: string; end_time?: string; hours?: number; employee_id?: string }
          let tl = null as TL | null
          for (let i = 0; i < 20 && !tl; i++) {
            tl = ((await c.admin.from('time_logs').select('start_time, end_time, hours, employee_id').eq('work_order_id', woId).maybeSingle()).data as TL | null)
            if (!tl) await new Promise((res) => setTimeout(res, 1000))
          }
          const expStart = new Date(copenhagenLocalToIso(today, '07:30')).getTime()
          const expEnd = new Date(copenhagenLocalToIso(today, '11:45')).getTime()
          r.timer_registreret = !!tl && tl.employee_id === jobEmployeeId && Number(tl.hours) === 4.25
          r.timer_dansk_tid = !!tl && new Date(tl.start_time!).getTime() === expStart && new Date(tl.end_time!).getTime() === expEnd
          // M-4: ny registrering samme dag foreslår start efter seneste sluttid (før altid 08:00 → overlap)
          await m.page.waitForLoadState('networkidle').catch(() => {})
          await m.page.getByRole('button', { name: /Registrér timer/ }).first().click({ timeout: 30_000 }).catch(() => {})
          let sugg = ''
          for (let i = 0; i < 10 && sugg !== '11:45'; i++) { sugg = await m.page.locator('input[type="time"]').first().inputValue().catch(() => ''); if (sugg !== '11:45') await new Promise((res) => setTimeout(res, 500)) }
          r.foreslaaet_start_efter_seneste = sugg === '11:45'
          await m.page.getByRole('button', { name: 'Annuller' }).first().click({ timeout: 10_000 }).catch(() => {})
        }

        // Foto-upload på Dokumenter-fanen
        await m.page.getByRole('button', { name: 'Dokumenter', exact: true }).click().catch(() => {})
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
        await m.page.getByTestId('case-upload-input').setInputFiles({ name: 'foto-harness.png', mimeType: 'image/png', buffer: png }).catch(() => {})
        await m.page.getByTestId('case-upload-msg').waitFor({ timeout: 60_000 }).catch(() => {})
        const upMsg = (await m.page.getByTestId('case-upload-msg').count()) ? await m.page.getByTestId('case-upload-msg').innerText() : ''
        const docs = jobCaseId ? (await c.admin.from('customer_documents').select('id', { count: 'exact', head: true }).eq('service_case_id', jobCaseId)).count ?? 0 : 0
        r.foto_upload = /1 fil uploadet/.test(upMsg) && docs === 1
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u11-montoer-dokumenter.png'), fullPage: true }).catch(() => {})

        // FW-1 (2026-10-17): montøren ser timer, ikke penge — intet "Tilbudt beløb"/"Revideret" på sagen (kontoret gør)
        if (jobCaseId) {
          await c.admin.from('service_cases').update({ contract_sum: 12345 }).eq('id', jobCaseId)
          await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForTimeout(1000)
          r.montoer_ingen_kontraktsum = (await m.page.getByText('Tilbudt beløb').count()) === 0 && (await m.page.getByText(/12[.\s]?345/).count()) === 0
          await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByText('Tilbudt beløb').first().waitFor({ timeout: 30_000 }).catch(() => {})
          r.kontor_ser_kontraktsum = (await a.page.getByText('Tilbudt beløb').count()) > 0
        }

        // N9a Aflevering på ordresiden: tjekliste → foto til første påkrævede punkt → kundens underskrift (montør, egen sag)
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=aflevering`, { waitUntil: 'networkidle', timeout: 180_000 })
        await m.page.getByTestId('handover-start').click({ timeout: 60_000 }).catch(() => {})
        const hov = m.page.getByTestId('order-handover-tab')
        await hov.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 60_000 }).catch(() => {})
        await hov.locator('input[type="file"]').first().setInputFiles({ name: 'inverter.png', mimeType: 'image/png', buffer: png }).catch(() => {})
        let photoOk = false
        for (let i = 0; i < 20 && !photoOk; i++) {
          const sc = (await c.admin.from('service_cases').select('checklist').eq('id', jobCaseId).maybeSingle()).data as { checklist?: Array<{ key: string; completed: boolean }> } | null
          const att = (await c.admin.from('service_case_attachments').select('id', { count: 'exact', head: true }).eq('service_case_id', jobCaseId).eq('category', 'inverter_photo')).count ?? 0
          photoOk = att === 1 && !!sc?.checklist?.find((x) => x.key === 'inverter_photo')?.completed
          if (!photoOk) await new Promise((res) => setTimeout(res, 1000))
        }
        r.aflevering_foto = photoOk
        // M-1: tryk på slet + "Annuller" må ikke slette fotoet (før: ét tryk på fotoet slettede uden bekræftelse)
        if (photoOk) {
          await m.page.waitForLoadState('networkidle').catch(() => {})
          m.page.once('dialog', (d) => { d.dismiss().catch(() => {}) })
          await hov.getByTestId('checklist-photo-delete').first().click({ timeout: 30_000 }).catch(() => {})
          await new Promise((res) => setTimeout(res, 2000))
          const att2 = (await c.admin.from('service_case_attachments').select('id', { count: 'exact', head: true }).eq('service_case_id', jobCaseId).eq('category', 'inverter_photo')).count ?? 0
          r.foto_slet_kraever_bekraeftelse = att2 === 1
        }
        await m.page.getByTestId('handover-open-signature').click({ timeout: 30_000 }).catch(() => {})
        await m.page.getByPlaceholder('Fulde navn').fill('Kunde Harness').catch(() => {})
        // Tegn på lærredet: rul det i visning og læs positionen lige før (under last flyttede layoutet sig,
        // så musen ramte navnefeltet); ét nyt forsøg hvis "Bekræft" stadig er deaktiveret.
        const canvas = m.page.getByTestId('handover-signature').locator('canvas')
        const confirmBtn = m.page.getByRole('button', { name: /Bekræft underskrift/ })
        for (let attempt = 0; attempt < 2; attempt++) {
          await canvas.scrollIntoViewIfNeeded().catch(() => {})
          await m.page.waitForTimeout(400)
          const sbox = await canvas.boundingBox().catch(() => null)
          if (sbox) {
            await m.page.mouse.move(sbox.x + 20, sbox.y + 20); await m.page.mouse.down()
            await m.page.mouse.move(sbox.x + 140, sbox.y + 50, { steps: 8 }); await m.page.mouse.move(sbox.x + 240, sbox.y + 25, { steps: 8 }); await m.page.mouse.up()
          }
          if (await confirmBtn.isEnabled().catch(() => false)) break
        }
        await confirmBtn.click({ timeout: 30_000 }).catch(() => {})
        let signedName = ''
        for (let i = 0; i < 15 && !signedName; i++) {
          signedName = String(((await c.admin.from('service_cases').select('customer_signature_name, customer_signature, status').eq('id', jobCaseId).maybeSingle()).data as { customer_signature_name?: string } | null)?.customer_signature_name ?? '')
          if (!signedName) await new Promise((res) => setTimeout(res, 1000))
        }
        const stillOpen = ((await c.admin.from('service_cases').select('status').eq('id', jobCaseId).maybeSingle()).data as { status?: string } | null)?.status !== 'closed'
        r.aflevering_underskrift = signedName === 'Kunde Harness' && stillOpen
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u11-montoer-aflevering.png'), fullPage: true }).catch(() => {})

        // Sagens Mails-fane: egen sagsmail synlig (G9) — postkassen er lukket, men sagens mails ses stadig
        await m.page.getByRole('button', { name: /^Mails/ }).first().click().catch(() => {})
        await m.page.getByText(`[HARNESS] egen sagsmail ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.sagsmail_synlig = (await m.page.getByText(`[HARNESS] egen sagsmail ${stamp}`).count()) > 0
        // Fremmed sag via direkte URL: ingen mails/indhold
        if (otherCaseId) {
          await gotoSafe(m.page, `${base}/dashboard/orders/${otherCaseId}?tab=mails`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForTimeout(3000)
          r.fremmed_sagsmail_skjult = (await m.page.getByText(`[HARNESS] fremmed sagsmail ${stamp}`).count()) === 0
        }

        // Afslut jobbet
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 }) // tilbage til egen sag
        // U-8/U-9: "Afslut" er endelig og kræver bekræftelse — testen accepterer, og tjekker at dialogen kom
        let afslutBekraeftet = false
        m.page.once('dialog', (d) => { afslutBekraeftet = /Afslut arbejdsordren/.test(d.message()); d.accept().catch(() => {}) })
        await m.page.getByRole('button', { name: '✓ Afslut' }).first().click({ timeout: 30_000 }).catch(() => {})
        let woStatus = ''
        for (let i = 0; i < 15 && woStatus !== 'done'; i++) {
          woStatus = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (woStatus !== 'done') await new Promise((res) => setTimeout(res, 1000))
        }
        r.afsluttet = woStatus === 'done' && afslutBekraeftet
        // FW-4 (2026-10-17): montøren kan ikke genåbne; kontoret kan (↺ Genåbn → igangværende)
        if (woStatus === 'done') {
          await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForTimeout(1000)
          r.montoer_kan_ikke_genaabne = (await m.page.getByRole('button', { name: '↺ Genåbn' }).count()) === 0
          await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          const reopenBtn = a.page.getByRole('button', { name: '↺ Genåbn' }).first()
          await reopenBtn.waitFor({ timeout: 30_000 }).catch(() => {})
          await reopenBtn.click({ timeout: 30_000 }).catch(() => {})
          let st = ''
          for (let i = 0; i < 15 && st !== 'in_progress'; i++) {
            st = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
            if (st !== 'in_progress') await new Promise((res) => setTimeout(res, 1000))
          }
          r.kontor_genaabner = st === 'in_progress'
          if (st === 'in_progress') await c.admin.from('work_orders').update({ status: 'done' }).eq('id', woId) // tilbage som afsluttet for de næste trin
        }
        if (!r.afsluttet) {
          await m.page.screenshot({ caret: 'initial', path: join(shots, 'u11-montoer-afslut.png'), fullPage: true }).catch(() => {})
          const errTxt = await m.page.locator('.text-red-700, .text-red-600, .bg-red-50').allInnerTexts().catch(() => [] as string[])
          r[`afslut_fejl(${woStatus}|${errTxt.join(' / ').replace(/\s+/g, ' ').slice(0, 160)})`] = false
        }

        // U21 (N9d): Service-link viderestilles; mobil-bundmenu for montør
        if (want('U21')) {
          const u21: Record<string, boolean> = {}
          await gotoSafe(m.page, `${base}/dashboard/service-cases/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForURL(new RegExp(`/dashboard/orders/${jobCaseId}`), { timeout: 30_000 }).catch(() => {})
          u21.service_link_viderestilles = new RegExp(`/dashboard/orders/${jobCaseId}`).test(m.page.url())
          await m.page.setViewportSize({ width: 390, height: 844 })
          await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
          const nav = m.page.locator('nav.md\\:hidden a')
          const labels = (await nav.allInnerTexts()).map((t) => t.trim())
          u21.bundmenu = JSON.stringify(labels) === JSON.stringify(['Opgaver', 'Kalender', 'Sager'])
          await m.page.screenshot({ caret: 'initial', path: join(shots, 'u21-montoer-mobil.png'), fullPage: false }).catch(() => {})
          await m.page.setViewportSize({ width: 1400, height: 1000 })
          out.push({ id: 'U21 montør mobil + Service-redirect', ok: Object.values(u21).every(Boolean), note: `${Object.entries(u21).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · menu=${JSON.stringify(labels)}` })
        }

        // Kalender: eget job, ingen planlæg-knap, ingen tom-tilstand
        await gotoSafe(m.page, `${base}/dashboard/calendar?date=${today}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.kalender = (await m.page.getByText(woTitle).count()) > 0 && (await m.page.getByText('Ingen aktive medarbejdere').count()) === 0
          && (await m.page.getByRole('button', { name: /Planlæg opgave/ }).count()) === 0
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u11-montoer-kalender.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U11 montør-dagen (job, foto, afslut, kalender)', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U174 X-12: slet dokument på sag — admin sletter uploadet fil (række + storage + audit), beskyttet dokument har ingen
      // slet-knap; montør (negativ rolle) ser ingen slet-knap på sin egen sag
      if (want('U174') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] dokslet ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) listCaseIds.push(caseId)
        const prot = caseId ? await c.admin.from('customer_documents').insert([{ customer_id: profitCustomerId, service_case_id: caseId, title: `Faktura ${stamp}`,
          document_type: 'invoice', file_url: '', file_name: `faktura-${stamp}.pdf`, mime_type: 'application/pdf' }]).select('id') : null
        const protId = (prot?.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=dokumenter`, { waitUntil: 'networkidle', timeout: 180_000 })
          const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
          await a.page.getByTestId('case-upload-input').setInputFiles({ name: `slet-${stamp}.png`, mimeType: 'image/png', buffer: png }).catch(() => {})
          await a.page.getByTestId('case-upload-msg').waitFor({ timeout: 60_000 }).catch(() => {})
          type Doc = { id: string; storage_path: string | null; document_type: string }
          const docs = async () => ((await c.admin.from('customer_documents').select('id, storage_path, document_type').eq('service_case_id', caseId ?? '')).data ?? []) as Doc[]
          let up: Doc | undefined
          for (let i = 0; i < 20 && !up; i++) { up = (await docs()).find((d) => d.document_type === 'other'); if (!up) await new Promise((res) => setTimeout(res, 1000)) }
          r.upload_oprettet = !!up?.storage_path
          await a.page.waitForLoadState('networkidle').catch(() => {})
          r.kun_en_slet_knap = (await a.page.getByTestId('case-document-delete').count()) === 1
          // Annuller først → intet slettes
          a.page.once('dialog', (d) => { d.dismiss().catch(() => {}) })
          await a.page.getByTestId('case-document-delete').first().click({ timeout: 30_000 }).catch(() => {})
          await new Promise((res) => setTimeout(res, 1500))
          r.annuller_beholder = (await docs()).some((d) => d.id === up?.id)
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await a.page.getByTestId('case-document-delete').first().click({ timeout: 30_000 }).catch(() => {})
          let left: Doc[] = []
          for (let i = 0; i < 20; i++) { left = await docs(); if (!left.some((d) => d.id === up?.id)) break; await new Promise((res) => setTimeout(res, 1000)) }
          r.raekke_slettet = !!up && !left.some((d) => d.id === up.id)
          r.beskyttet_bevaret = left.some((d) => d.id === protId)
          const dl = up?.storage_path ? await c.admin.storage.from('attachments').download(up.storage_path) : null
          r.fil_fjernet = !!dl && !!dl.error
          // audit skrives efter sletningen — poll (samme race som U29)
          let audOk = false
          for (let i = 0; i < 20 && !audOk; i++) {
            const aud = ((await c.admin.from('audit_logs').select('action, user_id').eq('entity_id', up?.id ?? '')).data ?? []) as Array<{ action: string; user_id: string | null }>
            audOk = aud.some((x) => x.action === 'document_deleted' && x.user_id === adminUser.id)
            if (!audOk) await new Promise((res) => setTimeout(res, 500))
          }
          r.audit = audOk
          // negativ rolle: montør på sin egen sag (U11) ser ingen slet-knap
          if (jobCaseId) {
            const ins = await c.admin.from('customer_documents').insert([{ customer_id: profitCustomerId, service_case_id: jobCaseId, title: `Montørfil ${stamp}`,
              document_type: 'other', file_url: '', file_name: `montoer-${stamp}.pdf`, mime_type: 'application/pdf' }]).select('id')
            const mId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
            await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=dokumenter`, { waitUntil: 'networkidle', timeout: 180_000 })
            await m.page.getByText(`montoer-${stamp}.pdf`).first().waitFor({ timeout: 60_000 }).catch(() => {})
            r.montoer_ser_dokumentet = (await m.page.getByText(`montoer-${stamp}.pdf`).count()) > 0
            r.montoer_ingen_slet = (await m.page.getByTestId('case-document-delete').count()) === 0
            if (mId) await c.admin.from('customer_documents').delete().eq('id', mId)
            // ST-1 (storage-review 2026-10-16): montøren ser hverken interne mail-vedhæftninger (kostpriser) eller fuldmagter
            // (CPR + underskrift) på sagens Dokumenter — admin ser dem stadig
            const em = await c.admin.from('incoming_emails').insert([{ sender_email: `st1-${stamp}@harness.test`, sender_name: 'Leverandør', subject: `ST1 ${stamp}`,
              body_text: 'ordrebekræftelse', customer_id: profitCustomerId, link_status: 'linked', received_at: new Date().toISOString(), is_archived: false }]).select('id')
            const emId = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
            const hidden = await c.admin.from('customer_documents').insert([
              { customer_id: profitCustomerId, service_case_id: jobCaseId, title: `Ordrebekræftelse ${stamp}`, document_type: 'other', file_url: '',
                file_name: `st1-mail-${stamp}.pdf`, mime_type: 'application/pdf', source_email_id: emId, description: null },
              { customer_id: profitCustomerId, service_case_id: jobCaseId, title: `Fuldmagt ${stamp}`, document_type: 'contract', file_url: '',
                file_name: `st1-fuldmagt-${stamp}.pdf`, mime_type: 'application/pdf', source_email_id: null, description: JSON.stringify({ type: 'fuldmagt', status: 'signed' }) },
            ]).select('id')
            const hiddenIds = ((hidden.data ?? []) as Array<{ id: string }>).map((x) => x.id)
            r.st1_seed = !!emId && hiddenIds.length === 2
            await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=dokumenter`, { waitUntil: 'networkidle', timeout: 180_000 })
            await m.page.waitForTimeout(1500)
            r.montoer_ingen_mailvedhaeftning = (await m.page.getByText(`st1-mail-${stamp}.pdf`).count()) === 0
            r.montoer_ingen_fuldmagt = (await m.page.getByText(`st1-fuldmagt-${stamp}.pdf`).count()) === 0
            await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=dokumenter`, { waitUntil: 'networkidle', timeout: 180_000 })
            await a.page.getByText(`st1-mail-${stamp}.pdf`).first().waitFor({ timeout: 60_000 }).catch(() => {})
            r.admin_ser_mailvedhaeftning = (await a.page.getByText(`st1-mail-${stamp}.pdf`).count()) > 0
            if (hiddenIds.length) await c.admin.from('customer_documents').delete().in('id', hiddenIds)
            if (emId) await c.admin.from('incoming_emails').delete().eq('id', emId)
          }
        } finally {
          if (caseId) await c.admin.from('customer_documents').delete().eq('service_case_id', caseId)
        }
        out.push({ id: 'U174 slet dokument på sag (rolle, beskyttelse, storage, audit)', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U190 PT-1 (portal-review 2026-10-17): admin opretter partner-adgang fra kundekortet (før rullede indsættelsen altid
      // tilbage: select() bad om den skjulte token-kolonne, 00175). Ingen mail.
      if (want('U190')) {
        const r: Record<string, boolean> = {}
        const pc = await c.admin.from('customers').insert([{ customer_number: `U190-${stamp}`, company_name: `[HARNESS] U190 partner ${stamp}`,
          contact_person: 'Partner', email: `u190-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const pCust = (pc.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          if (pCust) {
            await gotoSafe(a.page, `${base}/dashboard/customers/${pCust}`, { waitUntil: 'networkidle', timeout: 180_000 })
            // partner-sektionens knap (kundeportalen har sin egen "Opret"-knap — tag den sidste "Opret adgang")
            const btns = a.page.getByRole('button', { name: 'Opret adgang' })
            await btns.first().waitFor({ timeout: 60_000 }).catch(() => {})
            await btns.last().click({ timeout: 30_000 }).catch(() => {})
            let n = 0
            for (let i = 0; i < 20 && n === 0; i++) {
              n = (await c.admin.from('partner_access_tokens').select('id', { count: 'exact', head: true }).eq('partner_customer_id', pCust).eq('is_active', true)).count ?? 0
              if (!n) await new Promise((res) => setTimeout(res, 1000))
            }
            r.partner_adgang_oprettet = n === 1
            r.ingen_fejltoast = (await a.page.getByText('Kunne ikke oprette partner-adgang').count()) === 0
          }
        } finally {
          if (pCust) { await c.admin.from('partner_access_tokens').delete().eq('partner_customer_id', pCust); await c.admin.from('customers').delete().eq('id', pCust) }
        }
        out.push({ id: 'U190 partner-adgang kan oprettes (PT-1)', ok: !!pCust && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U189 FW-6 (montør-review 2026-10-17): besigtigelse gemt, men svaret mistes (netværk) → nyt "Gem" opdaterer SAMME
      // rapport (klient-genereret id), ingen dublet. Ingen mail (kun "Gem").
      if (want('U189')) {
        const r: Record<string, boolean> = {}
        const bc = await c.admin.from('customers').insert([{ customer_number: `U189-${stamp}`, company_name: `[HARNESS] U189 ${stamp}`,
          contact_person: 'Besigtiget', email: `u189-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const bCust = (bc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const bs = bCust ? await c.admin.from('service_cases').insert([{ title: `[HARNESS] U189 sag ${stamp}`, customer_id: bCust, status: 'new',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id') : null
        const bCase = (bs?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!bCust && !!bCase
        const docs = async () => ((await c.admin.from('customer_documents').select('id, storage_path').eq('customer_id', bCust ?? '').eq('document_type', 'besigtigelse')).data ?? []) as Array<{ id: string; storage_path: string | null }>
        try {
          if (bCust && bCase) {
            await gotoSafe(a.page, `${base}/dashboard/customers/${bCust}?tab=besigtigelse`, { waitUntil: 'networkidle', timeout: 180_000 })
            const saveBtn = a.page.getByRole('button', { name: 'Gem', exact: true }).first()
            await saveBtn.waitFor({ timeout: 60_000 }).catch(() => {})
            // første gemning: serveren behandler den, men svaret "mistes" (afbrydes efter hentning)
            let aborted = false
            await a.page.route('**/*', async (route) => {
              const req = route.request()
              // kun selve gemningen (bærer sags-id og formdata) — ikke baggrunds-server-actions
              if (!aborted && req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes(bCase) && (req.postData() ?? '').includes('serviceCaseId')) {
                aborted = true
                await route.fetch().catch(() => null)
                // test-pålidelighed 2026-10-22: "Route is already handled" (kapløb) må ikke vælte hele batch-processen
                return route.abort().catch(() => {})
              }
              return route.continue().catch(() => {})
            })
            await saveBtn.click({ timeout: 30_000 }).catch(() => {})
            let first: Array<{ id: string }> = []
            for (let i = 0; i < 30 && first.length === 0; i++) { first = await docs(); if (!first.length) await new Promise((res) => setTimeout(res, 1000)) }
            r.foerste_gemt_trods_mistet_svar = aborted && first.length === 1
            if (!r.foerste_gemt_trods_mistet_svar) r[`diag_aborted=${aborted}_docs=${first.length}`] = false
            await a.page.unroute('**/*').catch(() => {})
            await a.page.waitForTimeout(1500)
            await saveBtn.click({ timeout: 30_000 }).catch(() => {})
            await a.page.waitForTimeout(8000)
            const after = await docs()
            r.ingen_dublet = after.length === 1 && after[0].id === first[0]?.id
          }
        } finally {
          const left = await docs()
          const paths = left.map((d) => d.storage_path).filter((p): p is string => !!p)
          if (paths.length) await c.admin.storage.from('attachments').remove(paths).catch(() => {})
          if (bCust) await c.admin.from('customer_documents').delete().eq('customer_id', bCust)
          if (bCase) await c.admin.from('service_cases').delete().eq('id', bCase)
          if (bCust) await c.admin.from('customers').delete().eq('id', bCust)
        }
        out.push({ id: 'U189 besigtigelse: mistet svar giver ingen dublet (FW-6)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U188 CU-1 (kunde-review 2026-10-17): sagsløse kundedokumenter — montør ser dem kun for kunder med en sag i sit
      // scope (U11-sagens kunde), ikke for fremmede kunder; salg (customers.edit) ser dem for alle kunder
      // U225 SEC-B7/00235 (2026-10-24): tagtegningens normale app-flow efter skrive-lockdown — montør opretter, gemmer og
      // sletter en tegning på EGEN sag; salg (customers.edit) på kunden uden sag; montør afvises på kunden uden sag.
      if (want('U225') && profitCustomerId && jobCaseId) {
        const r: Record<string, boolean> = {}
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        const F = 'src/lib/actions/roof-drawings.ts'
        const data = { referenceLine: null, mmPerPx: null, panelWidthMm: 1134, panelHeightMm: 1722, panelGapMm: 20, panels: [] }
        const created: string[] = []
        const idOf = (raw: string) => /"id":"([0-9a-f-]{36})"/.exec(raw)?.[1] ?? null
        try {
          const pageUrl = `${base}/dashboard/orders/${jobCaseId}`
          await gotoSafe(m.page, pageUrl, { waitUntil: 'networkidle', timeout: 180_000 })
          const c1 = await callServerAction(m.page, pageUrl, F, 'createRoofDrawing', [{ customerId: profitCustomerId, serviceCaseId: jobCaseId, title: `U225 ${stamp}`,
            imageBase64: png, imageWidth: 1, imageHeight: 1, panelProductCode: null, panelWidthMm: 1134, panelHeightMm: 1722 }])
          const d1 = idOf(c1)
          if (d1) created.push(d1)
          r.montoer_opretter_paa_egen_sag = c1.includes('"success":true') && !!d1
          const s1 = d1 ? await callServerAction(m.page, pageUrl, F, 'saveRoofDrawing', [{ id: d1, panelCount: 0, drawingData: data, title: `U225 gemt ${stamp}` }]) : ''
          r.montoer_gemmer = s1.includes('"success":true')
          const row = d1 ? ((await c.admin.from('roof_drawings').select('title, created_by, service_case_id').eq('id', d1).maybeSingle()).data as { title: string; created_by: string; service_case_id: string } | null) : null
          r.gemt_i_db = row?.title === `U225 gemt ${stamp}` && row?.service_case_id === jobCaseId
          const x1 = d1 ? await callServerAction(m.page, pageUrl, F, 'deleteRoofDrawing', [d1]) : ''
          r.montoer_sletter = x1.includes('"success":true') && !((await c.admin.from('roof_drawings').select('id').eq('id', d1 ?? '').maybeSingle()).data)
          const c2 = await callServerAction(m.page, pageUrl, F, 'createRoofDrawing', [{ customerId: profitCustomerId, serviceCaseId: null, title: `U225 nej ${stamp}`,
            imageBase64: png, imageWidth: 1, imageHeight: 1, panelProductCode: null, panelWidthMm: 1134, panelHeightMm: 1722 }])
          const d2 = idOf(c2)
          if (d2) created.push(d2)
          r.montoer_afvist_uden_sag = !c2.includes('"success":true')
          const sp = await login(await mkUser('salg'))
          try {
            const custUrl = `${base}/dashboard/customers/${profitCustomerId}`
            await gotoSafe(sp.page, custUrl, { waitUntil: 'networkidle', timeout: 180_000 })
            const c3 = await callServerAction(sp.page, custUrl, F, 'createRoofDrawing', [{ customerId: profitCustomerId, serviceCaseId: null, title: `U225 salg ${stamp}`,
              imageBase64: png, imageWidth: 1, imageHeight: 1, panelProductCode: null, panelWidthMm: 1134, panelHeightMm: 1722 }])
            const d3 = idOf(c3)
            if (d3) created.push(d3)
            r.salg_opretter_uden_sag = c3.includes('"success":true') && !!d3
            const s3 = d3 ? await callServerAction(sp.page, custUrl, F, 'saveRoofDrawing', [{ id: d3, panelCount: 0, drawingData: data }]) : ''
            r.salg_gemmer = s3.includes('"success":true')
            const x3 = d3 ? await callServerAction(sp.page, custUrl, F, 'deleteRoofDrawing', [d3]) : ''
            r.salg_sletter = x3.includes('"success":true')
            if (!r.salg_opretter_uden_sag || !r.salg_gemmer || !r.salg_sletter) console.log('[U225 salg]', c3.slice(0, 300), '|', s3.slice(0, 200), '|', x3.slice(0, 200))
            // MP-00236 app-forudsætning: lukket sag = ingen ny tagtegning, heller ikke for kontoret (genåbn først)
            const cl = await c.admin.from('service_cases').insert([{ title: `[HARNESS] U225 lukket ${stamp}`, customer_id: profitCustomerId, status: 'closed', closed_at: new Date().toISOString(),
              priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
            const closedId = (cl.data?.[0] as { id?: string } | undefined)?.id ?? null
            if (closedId) listCaseIds.push(closedId)
            const c4 = closedId ? await callServerAction(sp.page, custUrl, F, 'createRoofDrawing', [{ customerId: profitCustomerId, serviceCaseId: closedId, title: `U225 lukket ${stamp}`,
              imageBase64: png, imageWidth: 1, imageHeight: 1, panelProductCode: null, panelWidthMm: 1134, panelHeightMm: 1722 }]) : ''
            const d4 = idOf(c4)
            if (d4) created.push(d4)
            r.lukket_sag_afvist = !!closedId && c4.includes('Sagen er lukket') && !d4
          } finally { await sp.ctx.close().catch(() => {}) }
          if (!r.montoer_opretter_paa_egen_sag || !r.montoer_gemmer || !r.montoer_sletter) console.log('[U225 montør]', c1.slice(0, 300), '|', s1.slice(0, 200), '|', x1.slice(0, 200))
        } finally {
          if (created.length) {
            const { data: left } = await c.admin.from('roof_drawings').select('id, image_storage_path').in('id', created)
            const paths = ((left ?? []) as Array<{ image_storage_path: string | null }>).map((x) => x.image_storage_path).filter((x): x is string => !!x)
            if (paths.length) await c.admin.storage.from('service-case-files').remove(paths).catch(() => {})
            await c.admin.from('roof_drawings').delete().in('id', created)
          }
        }
        out.push({ id: 'U225 tagtegning app-flow efter 00235 (montør egen sag, salg uden sag, lukket sag afvist)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U224 SEC-B7-forudsætning (2026-10-22): montøren gemmer en besigtigelsesrapport på sin egen sag — den bookede
      // besigtigelsesopgave (oprettet af kontoret, tildelt en anden) lukkes stadig (systemlukning via admin-klienten bag
      // gaten), så funktionen ikke afhænger af montørens bredde skriveret på customer_tasks. Ingen mail (sendToCustomer=false).
      if (want('U224') && profitCustomerId && jobCaseId) {
        const r: Record<string, boolean> = {}
        const tk = await c.admin.from('customer_tasks').insert([{ customer_id: profitCustomerId, service_case_id: jobCaseId, title: `Besigtigelse hos U224 ${stamp}`,
          status: 'pending', priority: 'normal', assigned_to: adminUser.id, created_by: adminUser.id }]).select('id')
        const taskId = (tk.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!taskId
        let docId: string | null = null
        try {
          const pageUrl = `${base}/dashboard/orders/${jobCaseId}`
          await gotoSafe(m.page, pageUrl, { waitUntil: 'networkidle', timeout: 180_000 })
          const blank = { tagType: '', tagHaeldning: '', tagAreal: '', tagRetning: '', tagStand: '', skyggeforhold: '', eltavleStatus: '', eltavlePlads: '', inverterPlacering: '',
            kabelvej: '', acKabelvej: '', dcKabelvej: '', internetSignal: '', netvaerkSSID: '', netvaerkPassword: '', malerNr: '', sikringsstoerrelse: '', jordingStatus: '',
            saerligeAftaler: `U224 ${stamp}`, signatureData: null, signerName: '' }
          const raw = await callServerAction(m.page, pageUrl, 'src/lib/actions/besigtigelse.ts', 'saveBesigtigelsesnotat',
            [{ customerId: profitCustomerId, serviceCaseId: jobCaseId, formData: blank, images: [], sendToCustomer: false }])
          r.gemt = raw.includes('"success":true')
          docId = /"id":"([0-9a-f-]{36})"/.exec(raw)?.[1] ?? null
          if (!r.gemt) console.log('[U224]', raw.slice(0, 400))
          let st = ''
          for (let i = 0; i < 10 && st !== 'done'; i++) {
            st = (((await c.admin.from('customer_tasks').select('status').eq('id', taskId ?? '').maybeSingle()).data ?? {}) as { status?: string }).status ?? ''
            if (st !== 'done') await new Promise((res) => setTimeout(res, 1000))
          }
          r.booket_opgave_lukket = st === 'done'
        } finally {
          if (taskId) await c.admin.from('customer_tasks').delete().eq('id', taskId)
          if (docId) await c.admin.from('customer_documents').delete().eq('id', docId)
        }
        out.push({ id: 'U224 montør gemmer besigtigelse → kontorets bookede opgave lukkes (systemlukning)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U221 SEC-B1 (scope-review 2026-10-22): en sagsløs besigtigelsesrapport hos en FREMMED kunde — montøren kalder
      // modtager- og send-actionen direkte (uden om UI'et) og afvises; samme rapport hos montørens egen kunde er tilladt.
      // Ingen mail: afvisningen sker før opslag/afsendelse, og modtageren er en .test-adresse.
      if (want('U221') && profitCustomerId && jobCaseId) {
        const r: Record<string, boolean> = {}
        const fc = await c.admin.from('customers').insert([{ customer_number: `U221-${stamp}`, company_name: `[HARNESS] U221 fremmed ${stamp}`,
          contact_person: 'Fremmed', email: `u221-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const foreignId = (fc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const docIns = foreignId ? await c.admin.from('customer_documents').insert([
          { customer_id: foreignId, service_case_id: null, title: `Besigtigelsesrapport U221 fremmed ${stamp}`, document_type: 'besigtigelse', file_url: '', file_name: `u221-f-${stamp}.pdf`, mime_type: 'application/pdf', storage_path: `customer-documents/${foreignId}/u221-${stamp}.pdf` },
          { customer_id: profitCustomerId, service_case_id: null, title: `Besigtigelsesrapport U221 egen ${stamp}`, document_type: 'besigtigelse', file_url: '', file_name: `u221-e-${stamp}.pdf`, mime_type: 'application/pdf', storage_path: `customer-documents/${profitCustomerId}/u221-${stamp}.pdf` },
        ]).select('id, customer_id') : null
        const rows = (docIns?.data ?? []) as Array<{ id: string; customer_id: string }>
        const foreignDoc = rows.find((x) => x.customer_id === foreignId)?.id ?? null
        const ownDoc = rows.find((x) => x.customer_id === profitCustomerId)?.id ?? null
        r.seed = !!foreignDoc && !!ownDoc
        try {
          const pageUrl = `${base}/dashboard/orders/${jobCaseId}`
          await gotoSafe(m.page, pageUrl, { waitUntil: 'networkidle', timeout: 180_000 })
          const F = 'src/lib/actions/besigtigelse.ts'
          const denied = 'Du har ikke adgang til dette dokument'
          const optsForeign = await callServerAction(m.page, pageUrl, F, 'getBesigtigelseRecipientOptions', [foreignDoc])
          r.modtagere_fremmed_afvist = optsForeign.includes(denied) && !optsForeign.includes(`u221-${stamp}@harness.test`)
          const sendForeign = await callServerAction(m.page, pageUrl, F, 'sendExistingBesigtigelsesreport', [{ documentId: foreignDoc, recipients: [{ type: 'manual', email: `u221-ekstern-${stamp}@harness.test` }] }])
          r.send_fremmed_afvist = sendForeign.includes(denied)
          const optsOwn = await callServerAction(m.page, pageUrl, F, 'getBesigtigelseRecipientOptions', [ownDoc])
          r.egen_kunde_tilladt = optsOwn.includes('"success":true')
          if (!r.modtagere_fremmed_afvist || !r.send_fremmed_afvist || !r.egen_kunde_tilladt) console.log('[U221]', optsForeign.slice(0, 300), '|', sendForeign.slice(0, 300), '|', optsOwn.slice(0, 300))
        } finally {
          if (rows.length) await c.admin.from('customer_documents').delete().in('id', rows.map((x) => x.id))
          if (foreignId) await c.admin.from('customers').delete().eq('id', foreignId)
        }
        out.push({ id: 'U221 SEC-B1 sagsløs besigtigelsesrapport: montør afvist hos fremmed kunde (direkte action-kald)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      if (want('U188') && profitCustomerId && jobCaseId) {
        const r: Record<string, boolean> = {}
        const fc = await c.admin.from('customers').insert([{ customer_number: `U188-${stamp}`, company_name: `[HARNESS] U188 fremmed ${stamp}`,
          contact_person: 'Fremmed', email: `u188-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const foreignId = (fc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const docIns = foreignId ? await c.admin.from('customer_documents').insert([
          // fanen viser kun "øvrige" dokumenter med file_url (kun et link — hentes ikke)
          { customer_id: foreignId, service_case_id: null, title: `CU1 fremmed ${stamp}`, document_type: 'other', file_url: 'https://example.invalid/cu1.pdf', file_name: `cu1-fremmed-${stamp}.pdf`, mime_type: 'application/pdf' },
          { customer_id: profitCustomerId, service_case_id: null, title: `CU1 egen ${stamp}`, document_type: 'other', file_url: 'https://example.invalid/cu1.pdf', file_name: `cu1-egen-${stamp}.pdf`, mime_type: 'application/pdf' },
        ]).select('id') : null
        const docIds = ((docIns?.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = !!foreignId && docIds.length === 2
        try {
          const sees = async (pg: import('playwright').Page, custId: string, title: string) => {
            await gotoSafe(pg, `${base}/dashboard/customers/${custId}?tab=dokumenter`, { waitUntil: 'networkidle', timeout: 180_000 })
            const fileName = title.replace('CU1 ', 'cu1-') + '.pdf'
            const hit = pg.getByText(title).or(pg.getByText(fileName))
            await hit.first().waitFor({ timeout: 20_000 }).catch(() => {})
            return (await hit.count()) > 0
          }
          if (foreignId) {
            r.montoer_ser_ikke_fremmed = !(await sees(m.page, foreignId, `CU1 fremmed ${stamp}`))
            r.montoer_ser_egen_kunde = await sees(m.page, profitCustomerId, `CU1 egen ${stamp}`)
            const sp = await login(salg)
            r.salg_ser_fremmed = await sees(sp.page, foreignId, `CU1 fremmed ${stamp}`)
            await sp.ctx.close().catch(() => {})
          }
        } finally {
          if (docIds.length) await c.admin.from('customer_documents').delete().in('id', docIds)
          if (foreignId) await c.admin.from('customers').delete().eq('id', foreignId)
        }
        out.push({ id: 'U188 sagsløse kundedokumenter efter rolle/scope (CU-1)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U40 montør på egen sag: kun relevante faner, materialer uden priser (kontoret prissætter)
      if (want('U40') && jobCaseId) {
        const r: Record<string, boolean> = {}
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        await m.page.getByRole('button', { name: /Tilføj (første )?materiale/ }).first().waitFor({ timeout: 90_000 }).catch(() => {})
        const tabNames = (await m.page.locator('button').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim())
        r.ingen_kontorfaner = !tabNames.some((t) => /^(Fakturakladde|Handlinger|Økonomi)/.test(t))
        r.ingen_kostkolonne = (await m.page.getByRole('columnheader', { name: 'Kostpris' }).count()) === 0
        // W-5: ingen statusskift/Rediger for montøren (fik "Manglende tilladelse"/ingen adgang før)
        r.ingen_rediger = (await m.page.getByRole('link', { name: /^Rediger$/ }).count()) === 0 && (await m.page.getByTestId('case-status-static').count()) === 1
        await m.page.getByRole('button', { name: /Tilføj (første )?materiale/ }).first().click({ timeout: 30_000 }).catch(() => {})
        const dlg = m.page.locator('[aria-labelledby="case-material-dialog-title"]')
        await dlg.getByPlaceholder('F.eks. Solpanel 425W LR4-72HPH').fill(`Kabel brugt ${stamp}`).catch(() => {})
        r.ingen_prisfelter = (await dlg.locator('input[inputmode="decimal"]').count()) === 1 && (await dlg.getByTestId('material-price-note').count()) === 1
        await dlg.locator('input[inputmode="decimal"]').first().fill('3').catch(() => {})
        await dlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
        type MRow = { quantity?: number; unit_cost?: number; unit_sales_price?: number; created_by?: string }
        const readM = async (): Promise<MRow | null> => ((await c.admin.from('case_materials').select('quantity, unit_cost, unit_sales_price, created_by').eq('case_id', jobCaseId ?? '').ilike('description', `Kabel brugt ${stamp}`).maybeSingle()).data as MRow | null)
        let mr: MRow | null = await readM()
        for (let i = 0; i < 20 && !mr; i++) { await new Promise((res) => setTimeout(res, 1000)); mr = await readM() }
        r.registreret = Number(mr?.quantity) === 3 && mr?.created_by === montor.id
        r.uden_priser = Number(mr?.unit_cost) === 0 && Number(mr?.unit_sales_price) === 0
        // lad montør-siden falde til ro (router.refresh efter gem) før næste navigation — ellers afbrudte fetch/WebSocket i U5
        await m.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        // Øvrige omkostninger: heller ingen kost-kolonner/DB for montør (serveren sender 0)
        if (jobCaseId) await c.admin.from('case_other_costs').insert([{ case_id: jobCaseId, category: 'koersel', description: `Kørsel ${stamp}`, quantity: 1, unit_cost: 50, unit_sales_price: 80, created_by: adminUser.id }])
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=oevrige`, { waitUntil: 'networkidle', timeout: 180_000 })
        await m.page.getByRole('columnheader', { name: 'Salgspris' }).first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.oevrige_uden_kost = (await m.page.getByText(`Kørsel ${stamp}`).count()) > 0 && (await m.page.getByRole('columnheader', { name: 'Kostpris' }).count()) === 0 && (await m.page.getByText('Foreløbig DB').count()) === 0
        // D18: montør registrerer selve udgiften — ingen kost-/salgsfelter; serveren gemmer 0; kontoret ser "Afventer pris"
        await m.page.getByRole('button', { name: 'Tilføj omkostning' }).first().click({ timeout: 30_000 }).catch(() => {})
        const odlg = m.page.locator('[aria-labelledby="case-other-cost-dialog-title"]')
        await odlg.getByPlaceholder('F.eks. Kørsel til Aalborg, 2 ture').fill(`Parkering ${stamp}`).catch(() => {})
        r.oevrige_dialog_uden_priser = (await odlg.getByTestId('other-cost-price-by-office').count()) === 1 && (await odlg.getByText('Kostpris pr. enhed (DKK)').count()) === 0 && (await odlg.getByText('Salgspris pr. enhed (DKK)').count()) === 0
        await odlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
        type ORow = { unit_cost?: number; unit_sales_price?: number; created_by?: string }
        const readO = async (): Promise<ORow | null> => ((await c.admin.from('case_other_costs').select('unit_cost, unit_sales_price, created_by').eq('case_id', jobCaseId ?? '').eq('description', `Parkering ${stamp}`).maybeSingle()).data as ORow | null)
        let orow: ORow | null = await readO()
        for (let i = 0; i < 20 && !orow; i++) { await new Promise((res) => setTimeout(res, 1000)); orow = await readO() }
        r.oevrige_registreret_uden_pris = orow?.created_by === montor.id && Number(orow?.unit_cost) === 0 && Number(orow?.unit_sales_price) === 0
        await m.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=oevrige`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(`Parkering ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.kontor_ser_afventer_pris = (await a.page.getByTestId('other-cost-awaiting-price').count()) > 0
        // kontoret ser stadig priser og kan prissætte
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        // PV8: kost/DB er foldet sammen som standard — kontoret folder ud
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByRole('columnheader', { name: 'Kostpris' }).waitFor({ timeout: 60_000 }).catch(() => {})
        r.kontor_ser_priser = (await a.page.getByRole('columnheader', { name: 'Kostpris' }).count()) > 0 && (await a.page.getByRole('button', { name: /^Handlinger/ }).count()) > 0
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u40-montor-materialer.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U40 montør: egen sag uden priser', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U72 N28: styringscockpittet viser antal timeregistreringer der afventer godkendelse (time_logs.approve)
      if (want('U72') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        const { data: wo } = await c.admin.from('work_orders').select('id').eq('case_id', jobCaseId).limit(1).maybeSingle()
        const woId = (wo as { id?: string } | null)?.id
        const t0 = new Date(Date.now() - 5 * 3600_000).toISOString(), t1 = new Date(Date.now() - 4 * 3600_000).toISOString()
        const ins = woId ? await c.admin.from('time_logs').insert([{ employee_id: jobEmployeeId, work_order_id: woId, start_time: t0, end_time: t1 }]).select('id') : null
        const tlId = (ins?.data?.[0] as { id?: string } | undefined)?.id
        const { count } = await c.admin.from('time_logs').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending').not('end_time', 'is', null)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const el = a.page.getByTestId('cockpit-times-pending')
        await el.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await el.innerText().catch(() => '')).trim()
        r.cockpit_viser_antal = !!tlId && txt.startsWith(`${count} `)
        r.linker_til_godkendelse = (await el.getAttribute('href').catch(() => '')) === '/dashboard/time-approval'
        if (tlId) await c.admin.from('time_logs').delete().eq('id', tlId)
        out.push({ id: 'U72 N28 cockpit: timer afventer godkendelse', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · vist="${txt}" forventet=${count}` })
      }

      // U151 PL-8: montørens åbne job uden dato og ældre end 14 dage vises under "Ikke afsluttet" i Mine job
      if (want('U151') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        const t1 = `[HARNESS] udateret job ${stamp}`
        const t2 = `[HARNESS] gammelt job ${stamp}`
        const old = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() - 30 * 86_400_000))
        const ins = await c.admin.from('work_orders').insert([
          { case_id: jobCaseId, title: t1, scheduled_date: null, assigned_employee_id: jobEmployeeId, status: 'planned' },
          { case_id: jobCaseId, title: t2, scheduled_date: old, assigned_employee_id: jobEmployeeId, status: 'planned' },
        ]).select('id')
        const ids = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = ids.length === 2
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = m.page.getByTestId('my-jobs-card')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.innerText().catch(() => '')) ?? ''
        r.udateret_vist = txt.includes(t1)
        r.gammelt_vist = txt.includes(t2)
        // fokus E 2026-10-15: "Til telefonens kalender" — egne job som .ics (dateret åbent job med; udateret kan ikke stå i en kalender)
        r.ics_link = (await card.getByTestId('my-jobs-ics').count()) === 1
        const icsRes = await m.page.request.get(`${base}/api/calendar/my-jobs`).catch(() => null)
        const icsTxt = icsRes ? await icsRes.text().catch(() => '') : ''
        r.ics_fil = !!icsRes && icsRes.status() === 200 && /text\/calendar/.test(icsRes.headers()['content-type'] ?? '') && icsTxt.includes(`UID:wo-${ids[1]}@eltasolar.dk`) && !icsTxt.includes('udateret job')
        if (ids.length) await c.admin.from('work_orders').delete().in('id', ids)
        out.push({ id: 'U151 Mine job: udaterede og gamle åbne job (PL-8)', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${ins.error ? ` · ${ins.error.message.slice(0, 80)}` : ''}` })
      }

      // U155 (Henrik 2026-10-15): montør retter/sletter sin EGEN afviste timeregistrering — rettelse → "afventer" + audit;
      // godkendt række kan ikke rettes (ingen knap); sletning bevarer øjebliksbillede i audit; admin kan slette en afvist
      if (want('U155') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        // PR-4b: rettelse fryser satsen igen → montøren skal have en timepris (sættes også af U11; her uafhængigt)
        await c.admin.from('employees').update({ hourly_rate: 495, cost_rate: 300 }).eq('id', jobEmployeeId)
        const wo = ((await c.admin.from('work_orders').select('id').eq('case_id', jobCaseId).limit(1).maybeSingle()).data as { id?: string } | null)?.id ?? null
        const mk = async (day: string, status: 'rejected' | 'approved') => {
          const ins = await c.admin.from('time_logs').insert([{ work_order_id: wo, employee_id: jobEmployeeId, start_time: `${day}T06:00:00Z`, end_time: `${day}T10:00:00Z`, billable: true, description: `[HARNESS] U155 ${status} ${stamp}` }]).select('id')
          const id = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) await c.admin.from('time_logs').update({ approval_status: status, approved_by: adminUser.id, approved_at: new Date().toISOString(), rejection_reason: status === 'rejected' ? 'Forkert job U155' : null }).eq('id', id)
          return id
        }
        const rej = wo ? await mk('2026-09-02', 'rejected') : null
        const appr = wo ? await mk('2026-09-03', 'approved') : null
        const rej2 = wo ? await mk('2026-09-04', 'rejected') : null
        r.seed = !!rej && !!appr && !!rej2
        type T = { approval_status: string; end_time: string; rejection_reason: string | null } | null
        const read = async (id: string | null) => (await c.admin.from('time_logs').select('approval_status, end_time, rejection_reason').eq('id', id ?? '').maybeSingle()).data as T
        try {
          await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          const rows = m.page.getByTestId('time-log-rejected-row')
          await rows.first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.afviste_vises = (await rows.count()) >= 2
          r.aarsag_vises = (await m.page.getByText('Forkert job U155').count()) > 0
          // godkendt række: ingen Ret/Slet (kun afviste har knapperne)
          r.godkendt_uden_knapper = (await m.page.getByTestId('time-log-fix').count()) === (await rows.count())
          r.godkendt_laast_for_montoer = (await m.page.getByTestId('time-log-approved-locked').count()) >= 1
          // ret den første afviste (sluttid 10:00 → 11:00 dansk tid ⇒ 09:00Z)
          await rows.filter({ hasText: '2. sep' }).getByTestId('time-log-fix').first().click({ timeout: 15_000 }).catch(() => {})
          await m.page.getByTestId('time-log-fix-end').fill('11:00').catch(() => {})
          await m.page.getByTestId('time-log-fix-save').click({ timeout: 15_000 }).catch(() => {})
          let t1: T = null
          for (let i = 0; i < 15; i++) { t1 = await read(rej); if (t1?.approval_status === 'pending') break; await new Promise((res) => setTimeout(res, 1000)) }
          r.rettet_til_afventer = t1?.approval_status === 'pending' && new Date(t1.end_time).toISOString() === '2026-09-02T09:00:00.000Z'
          // auditrækken skrives EFTER opdateringen i server-actionen → vent på den (før læst straks = sporadisk fejl)
          let aud1: Array<{ action: string; metadata: Record<string, unknown> | null }> = []
          for (let i = 0; i < 10; i++) {
            aud1 = ((await c.admin.from('audit_logs').select('action, metadata').eq('entity_id', rej ?? '')).data ?? []) as typeof aud1
            if (aud1.some((x) => x.action === 'time_log_corrected')) break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.audit_rettelse = aud1.some((x) => x.action === 'time_log_corrected' && x.metadata?.previous_rejection_reason === 'Forkert job U155')
          // slet den anden afviste
          m.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await m.page.getByTestId('time-log-delete-rejected').first().click({ timeout: 15_000 }).catch(() => {})
          let gone = false
          for (let i = 0; i < 15; i++) { gone = !(await read(rej2)); if (gone) break; await new Promise((res) => setTimeout(res, 1000)) }
          r.slettet = gone
          const aud2 = ((await c.admin.from('audit_logs').select('action, changes').eq('entity_id', rej2 ?? '')).data ?? []) as Array<{ action: string; changes: Record<string, unknown> | null }>
          r.audit_sletning_med_snapshot = aud2.some((x) => x.action === 'time_log_rejected_deleted' && !!(x.changes as { deleted?: { start_time?: string } } | null)?.deleted?.start_time)
          const ap = await read(appr)
          r.godkendt_uaendret = ap?.approval_status === 'approved'
          // serviceleder: kan ikke slette en ANDENS afviste (server); admin kan
          const rej3 = await mk('2026-09-05', 'rejected')
          const slp = await login(await mkUser('serviceleder'))
          try {
            await gotoSafe(slp.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
            slp.page.once('dialog', (d) => { d.accept().catch(() => {}) })
            await slp.page.getByTestId('time-log-delete-rejected').first().click({ timeout: 30_000 }).catch(() => {})
            await slp.page.getByText(/kun slette dine egne/).first().waitFor({ timeout: 20_000 }).catch(() => {})
            r.serviceleder_afvist = !!(await read(rej3)) && (await slp.page.getByText(/kun slette dine egne/).count()) > 0
          } finally { await slp.ctx.close().catch(() => {}) }
          await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          await a.page.getByTestId('time-log-delete-rejected').first().click({ timeout: 30_000 }).catch(() => {})
          let gone3 = false
          for (let i = 0; i < 15; i++) { gone3 = !(await read(rej3)); if (gone3) break; await new Promise((res) => setTimeout(res, 1000)) }
          r.admin_kan_slette_afvist = gone3
          if (rej3 && !gone3) { await c.admin.from('time_logs').delete().eq('id', rej3) }
          if (rej3) await c.admin.from('audit_logs').delete().eq('entity_id', rej3)
        } finally {
          for (const id of [rej, appr, rej2]) if (id) { await c.admin.from('audit_logs').delete().eq('entity_id', id); await c.admin.from('time_logs').delete().eq('id', id) }
        }
        out.push({ id: 'U155 montør retter/sletter egen afvist time', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U62 N2: timegodkendelse — montør registrerer (U11) → admin afviser med begrundelse → montør ser "Afvist" → godkend
      if (want('U62') && jobCaseId) {
        const r: Record<string, boolean> = {}
        type TL = { id: string; approval_status: string; rejection_reason: string | null; approved_by: string | null }
        const readTl = async (): Promise<TL | null> => ((await c.admin.from('time_logs').select('id, approval_status, rejection_reason, approved_by, work_order:work_orders!inner(case_id)')
          .eq('work_order.case_id', jobCaseId ?? '').not('end_time', 'is', null).limit(1).maybeSingle()).data as TL | null)
        const tl0 = await readTl()
        r.registrering_afventer = tl0?.approval_status === 'pending'
        const caseNo = ((await c.admin.from('service_cases').select('case_number').eq('id', jobCaseId).maybeSingle()).data as { case_number?: string } | null)?.case_number ?? ''
        // montør: "Afventer" i Mine timer; ingen adgang til godkendelsessiden
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.montoer_ser_afventer = (await m.page.getByTestId('my-hours-pending').count()) > 0
        await gotoSafe(m.page, `${base}/dashboard/time-approval`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.montoer_ingen_adgang = (await m.page.getByTestId('time-approval-row').count()) === 0 && (await m.page.getByText(/adgang/i).count()) > 0
        // admin: afvis med begrundelse
        await gotoSafe(a.page, `${base}/dashboard/time-approval`, { waitUntil: 'networkidle', timeout: 180_000 })
        const row = a.page.getByTestId('time-approval-row').filter({ hasText: caseNo })
        await row.first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.admin_ser_raekken = caseNo !== '' && (await row.count()) > 0
        await row.first().getByTestId('time-approval-reject').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('time-approval-reason').fill('Forkert sag — ret venligst').catch(() => {})
        await a.page.getByTestId('time-approval-reject-confirm').click({ timeout: 30_000 }).catch(() => {})
        let tl1: TL | null = null
        for (let i = 0; i < 20; i++) { tl1 = await readTl(); if (tl1?.approval_status === 'rejected') break; await new Promise((res) => setTimeout(res, 1000)) }
        r.afvist_med_begrundelse = tl1?.approval_status === 'rejected' && tl1?.rejection_reason === 'Forkert sag — ret venligst'
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.montoer_ser_afvist = (await m.page.getByTestId('my-hours-rejected').count()) > 0
        // PL-5: begrundelsen står synligt (ikke kun hover) — læsbar på mobil
        r.montoer_ser_begrundelse = ((await m.page.getByTestId('my-hours-rejection-reason').first().textContent().catch(() => '')) ?? '').includes('Forkert sag')
        // MB2-6: den afviste række linker til sagens Planlægning (sagsnr.)
        r.mine_timer_link_til_sag = ((await m.page.getByTestId('my-hours-entry').first().getAttribute('href').catch(() => '')) ?? '').includes(encodeURIComponent(caseNo))
        // MB2-3: på telefonbredde kan montøren åbne rettelsen med store felter/knapper (gemmer ikke — resten af testen godkender)
        try {
          await m.page.setViewportSize({ width: 375, height: 812 })
          await gotoSafe(m.page, `${base}/dashboard/orders/${encodeURIComponent(caseNo)}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
          const fixBtn = m.page.getByTestId('time-log-fix-mobile').first()
          await fixBtn.waitFor({ timeout: 45_000 }).catch(() => {})
          await fixBtn.click({ timeout: 30_000 }).catch(() => {})
          const save = m.page.getByTestId('time-log-fix-save').first()
          await save.waitFor({ timeout: 30_000 }).catch(() => {})
          const box = await save.boundingBox().catch(() => null)
          r.mobil_rettelse_stor_knap = !!box && box.height >= 40
          const startBox = await m.page.getByTestId('time-log-fix-start').first().boundingBox().catch(() => null)
          r.mobil_rettelse_felt_hoejde = !!startBox && startBox.height >= 34
        } finally {
          await m.page.setViewportSize({ width: 1280, height: 800 }).catch(() => {})
        }
        await m.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        // admin: godkend fra fanen Afvist
        await gotoSafe(a.page, `${base}/dashboard/time-approval`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('time-approval-tab-rejected').click({ timeout: 30_000 }).catch(() => {})
        const row2 = a.page.getByTestId('time-approval-row').filter({ hasText: caseNo })
        await row2.first().waitFor({ timeout: 60_000 }).catch(() => {})
        await row2.first().getByTestId('time-approval-approve').click({ timeout: 30_000 }).catch(() => {})
        let tl2: TL | null = null
        for (let i = 0; i < 20; i++) { tl2 = await readTl(); if (tl2?.approval_status === 'approved') break; await new Promise((res) => setTimeout(res, 1000)) }
        r.godkendt_af_admin = tl2?.approval_status === 'approved' && tl2?.approved_by === adminUser.id && tl2?.rejection_reason === null
        const aud = ((await c.admin.from('audit_logs').select('action').eq('entity_id', tl2?.id ?? '')).data ?? []) as Array<{ action: string }>
        r.auditlogget = aud.some((x) => x.action === 'time_log_rejected') && aud.some((x) => x.action === 'time_log_approved')
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u62-godkend-timer.png'), fullPage: true }).catch(() => {})
        if (tl2?.id) await c.admin.from('audit_logs').delete().eq('entity_id', tl2.id)
        out.push({ id: 'U62 N2 timegodkendelse', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U79 PV8 shoulder-surfing: kost/DB foldet sammen som standard for kontoret på Materialer, Øvrige og Planlægning;
      // "Vis kost/DB" folder ud; montør har ingen fold-ud-knap
      if (want('U79') && jobCaseId) {
        const r: Record<string, boolean> = {}
        await c.admin.from('case_materials').insert([{ case_id: jobCaseId, description: `PV8 kabel ${stamp}`, quantity: 1, unit: 'stk', unit_cost: 77.77, unit_sales_price: 99, created_by: adminUser.id }])
        await c.admin.from('case_other_costs').insert([{ case_id: jobCaseId, category: 'koersel', description: `PV8 kørsel ${stamp}`, quantity: 1, unit_cost: 66.66, unit_sales_price: 80, created_by: adminUser.id }])
        const kostHeader = () => a.page.getByRole('columnheader', { name: 'Kostpris' })
        // Materialer
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(`PV8 kabel ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.materialer_foldet = (await kostHeader().count()) === 0 && (await a.page.getByText('77,77').count()) === 0 && (await a.page.getByText('Foreløbig DB').count()) === 0
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        r.materialer_fold_ud = (await kostHeader().count()) > 0 && (await a.page.getByText('Foreløbig DB').count()) > 0
        // Øvrige
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=oevrige`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(`PV8 kørsel ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.oevrige_foldet = (await kostHeader().count()) === 0 && (await a.page.getByText('66,66').count()) === 0 && (await a.page.getByText('Foreløbig DB').count()) === 0
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        r.oevrige_fold_ud = (await kostHeader().count()) > 0
        // Planlægning (U11's sag har timeregistreringer)
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText('Sagstotal:').first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.planlaegning_foldet = (await a.page.getByText(/Intern kost/).count()) === 0
        r.planlaegning_har_toggle = (await a.page.getByTestId('cost-reveal-toggle').count()) > 0
        // montør: ingen fold-ud
        const m2 = await login(montor)
        await gotoSafe(m2.page, `${base}/dashboard/orders/${jobCaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        await m2.page.getByText(`PV8 kabel ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.montor_ingen_toggle = (await m2.page.getByTestId('cost-reveal-toggle').count()) === 0
        await m2.ctx.close().catch(() => {})
        out.push({ id: 'U79 PV8 kost/DB foldet sammen som standard', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U80 D50: kostsats pr. medarbejder — serviceleder (kostpris, ikke løn) ser kun sagens aggregerede interne kost;
      // ingen kost/kostsats pr. timeregistrering i UI eller data. Admin (løn-adgang) ser kost pr. række.
      if (want('U80') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const sl = await mkUser('serviceleder')
        const s = await login(sl)
        const bodies: string[] = []
        s.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; bodies.push(await resp.text()) } catch { /* lukket */ } })
        await gotoSafe(s.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
        await s.page.getByText('Sagstotal:').first().waitFor({ timeout: 60_000 }).catch(() => {})
        await s.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        await s.page.waitForTimeout(800)
        r.sl_ser_aggregeret_kost = (await s.page.getByText(/Intern kost:/).count()) > 0
        r.sl_ingen_kost_pr_raekke = (await s.page.getByRole('columnheader', { name: 'Intern kost' }).count()) === 0
        const all = bodies.join('\n')
        r.sl_ingen_kostsats_i_data = !/"cost_rate_snapshot":\s*[1-9]/.test(all) && !/"cost_amount":\s*[1-9]/.test(all)
        await s.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText('Sagstotal:').first().waitFor({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByRole('columnheader', { name: 'Intern kost' }).first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.admin_ser_kost_pr_raekke = (await a.page.getByRole('columnheader', { name: 'Intern kost' }).count()) > 0
        out.push({ id: 'U80 D50 kostsats pr. medarbejder kun med løn-adgang', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U81 N26c: Økonomi → "Tilbudt vs. faktisk pr. linje" — sammenfoldet (intet hentet) til den åbnes; linjer matches
      // (eksplicit/leverandørprodukt/beskrivelse), ubrugte og ikke-tilbudte linjer vises, afvigelse i alt
      if (want('U81') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-EK-${stamp}`, title: `[HARNESS] efterkalk ${stamp}`, customer_id: profitCustomerId,
          status: 'accepted', created_by: adminUser.id, tax_percentage: 25 }]).select('id')
        u81OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const L = (position: number, description: string, quantity: number, unit: string, cost: number) =>
          ({ offer_id: u81OfferId, position, description, quantity, unit, unit_price: cost * 1.5, total: quantity * cost * 1.5, cost_price: cost, margin_percentage: 33, sale_price: cost * 1.5 })
        const li = u81OfferId ? await c.admin.from('offer_line_items').insert([L(1, 'Montage', 10, 'timer', 400), L(2, `EK kabel ${stamp}`, 50, 'm', 10), L(3, `EK tavle ${stamp}`, 1, 'stk', 500)]).select('id, position') : null
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] efterkalk ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, source_offer_id: u81OfferId }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([
            { case_id: caseId, description: `ek kabel ${stamp}`, quantity: 60, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: adminUser.id },
            { case_id: caseId, description: `EK ekstra ${stamp}`, quantity: 2, unit: 'stk', unit_cost: 30, unit_sales_price: 45, billable: true, source: 'manual', created_by: adminUser.id },
          ])
        }
        const net: string[] = []
        const onResp = async (resp: { request(): { resourceType(): string }; text(): Promise<string> }) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } }
        a.page.on('response', onResp)
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=oekonomi`, { waitUntil: 'networkidle', timeout: 180_000 })
        // PV18: økonomien skjult til "Vis økonomi" — intet tilbud/forbrug i data før
        r.oekonomi_skjult = (await a.page.getByTestId('economy-hidden').count()) === 1
        await a.page.getByTestId('economy-reveal').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('offer-vs-actual-toggle').waitFor({ timeout: 60_000 }).catch(() => {})
        r.foldet_intet_hentet = (await a.page.getByTestId('offer-vs-actual-row').count()) === 0 && !net.join('\n').includes(`EK tavle ${stamp}`)
        await a.page.getByTestId('offer-vs-actual-toggle').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('offer-vs-actual-row').first().waitFor({ timeout: 60_000 }).catch(() => {})
        const statuses = await a.page.getByTestId('offer-vs-actual-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
        r.fire_raekker = statuses.length === 4 // arbejdstimer, kabel, tavle, ekstra
        r.kabel_over = statuses.includes('over')
        r.tavle_ikke_brugt = statuses.includes('not_used')
        r.ekstra_ikke_tilbudt = statuses.includes('not_offered')
        // tilbudt 4000 + 500 + 500 = 5000; faktisk 0 (ingen timer) + 600 + 60 = 660 → −4.340
        r.afvigelse = ((await a.page.getByTestId('offer-vs-actual-deviation').textContent().catch(() => '')) ?? '').includes('4.340')
        a.page.off('response', onResp)
        out.push({ id: 'U81 N26c tilbudt vs. faktisk pr. linje', ok: !!li?.data?.length && !!caseId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · status=${statuses.join(',')}` })
      }

      // U82 D48/D51: solcelle-beregneren — salg får ingen kostpriser/lønsats i data (beregnes server-side med
      // standardavance) men kan stadig beregne; admin ser intern kost. Seeder et komplet katalog (staging har 0).
      if (want('U82')) {
        const r: Record<string, boolean> = {}
        const sp = (type: string, code: string, price: number, specifications: Record<string, unknown>) =>
          ({ product_type: type, code: `${code}-${stamp}`, name: `[HARNESS] ${code}`, price, is_active: true, sort_order: -100, specifications })
        const ins = await c.admin.from('solar_products').insert([
          sp('panel', 'HU82-PANEL', 1111.11, { wattage: 400, efficiency: 0.21 }),
          sp('inverter', 'HU82-INV', 2222.22, { capacity: 5, efficiency: 0.97, inverter_type: 'string' }),
          sp('mounting', 'HU82-MOUNT', 0, { price_per_panel: 333.33, labor_hours_per_panel: 1 }),
          sp('battery', 'HU82-BAT', 0, { capacity: 0 }),
        ]).select('id')
        u82SolarIds = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        const s = await login(salg)
        const net: string[] = []
        s.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } })
        await gotoSafe(s.page, `${base}/dashboard/calc`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.waitForTimeout(1500)
        const secret = (t: string) => ['1111.11', '1.111,11', '2222.22', '2.222,22', '333.33', '333,33'].some((x) => t.includes(x)) || /"laborCostPerHour":\s*[1-9]/.test(t) || /"panelsCost":\s*[1-9]/.test(t) || /"subtotal":\s*[1-9]/.test(t)
        const before = await s.page.locator('body').innerText().catch(() => '')
        r.salg_v2_med_resultat = /Total|Før moms/i.test(before) && (await s.page.content().catch(() => '')).includes(`HU82-PANEL-${stamp}`)
        // ændr antal paneler → ny pris fra serveren
        await s.page.locator('#panelCount').fill('20').catch(() => {}) // range-skyder
        await s.page.waitForTimeout(2500)
        await s.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        const after = await s.page.locator('body').innerText().catch(() => '')
        r.salg_server_beregning = after !== before
        r.salg_ingen_kost_i_data = !secret((await s.page.content().catch(() => '')) + net.join('\n'))
        r.salg_ingen_avance = !/Avance|Subtotal|Arbejdsløn/.test(after)
        await s.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/calc`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1500)
        r.admin_ser_intern_kost = /Avance/.test(await a.page.locator('body').innerText().catch(() => '')) && (await a.page.content().catch(() => '')).includes('1111.11')
        out.push({ id: 'U82 D48 solcelle-beregner: salg uden kostgrundlag (server-beregning)', ok: u82SolarIds.length === 4 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U83/U86 privacy-rollematrix — delt i to (ingen enkelt test nær 5 min): U83 admin/salg/montør, U86 serviceleder/
      // bogholderi. Kost/DB sammenfoldet som standard på sag og tilbud; roller uden kostadgang får ingen kostværdier i
      // data; leverandør-login kun admin. U85: lille målrettet shoulder-surfing-test (admin tilbud + serviceleder login-fane).
      if ((want('U83') || want('U85') || want('U86')) && profitCustomerId) {
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] matrix ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `Matrix kabel ${stamp}`, quantity: 1, unit: 'stk', unit_cost: 87.65, unit_sales_price: 99, billable: true, source: 'manual', created_by: adminUser.id }])
        }
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-MX-${stamp}`, title: `[HARNESS] matrix ${stamp}`, customer_id: profitCustomerId, status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        u83OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u83OfferId) await c.admin.from('offer_line_items').insert([{ offer_id: u83OfferId, position: 1, description: `Matrix linje ${stamp}`, quantity: 1, unit: 'stk', unit_price: 9876.5, total: 9876.5, cost_price: 5432.1, margin_percentage: 45, sale_price: 9876.5 }])
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U83 grossist ${stamp}`, code: `HU83${stamp}` }]).select('id')
        u83SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const costVals = ['87.65', '87,65', '5432.1', '5.432,10']
        if (want('U85')) {
          const r: Record<string, boolean> = {}
          await gotoSafe(a.page, `${base}/dashboard/offers/${u83OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await a.page.getByText(`Matrix linje ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          const vis = await a.page.locator('body').innerText().catch(() => '')
          r.admin_tilbud_foldet = !vis.includes('5.432,10') && (await a.page.getByTestId('offer-profit-card').count()) === 0
          await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
          await a.page.waitForTimeout(800)
          r.admin_fold_ud = (await a.page.locator('body').innerText().catch(() => '')).includes('5.432,10')
          const sl = await login(await mkUser('serviceleder'))
          await gotoSafe(sl.page, `${base}/dashboard/settings/suppliers/${u83SupplierId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await sl.page.getByText(`[HARNESS] U83 grossist ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.serviceleder_ingen_loginfane = (await sl.page.getByText(`[HARNESS] U83 grossist ${stamp}`).count()) > 0 && (await sl.page.getByRole('tab', { name: /API Login|FTP Login/ }).count()) === 0 // tekst — testid fandtes ikke i gammel kode (negativ kontrol)
          await sl.ctx.close().catch(() => {})
          out.push({ id: 'U85 shoulder-surfing: tilbud foldet + login-fane skjult', ok: !!u83OfferId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
        }
        type Role = 'admin' | 'serviceleder' | 'salg' | 'montør' | 'bogholderi'
        const seesCost: Record<Role, boolean> = { admin: true, serviceleder: true, salg: false, 'montør': false, bogholderi: true }
        const seesOffers: Record<Role, boolean> = { admin: true, serviceleder: true, salg: true, 'montør': false, bogholderi: false }
        for (const [tid, roles] of [['U83', ['admin', 'salg', 'montør']], ['U86', ['serviceleder', 'bogholderi']]] as Array<[string, Role[]]>) {
        if (!want(tid)) continue
        const r: Record<string, boolean> = {}
        const notes: string[] = []
        for (const role of roles) {
          const u = role === 'admin' ? adminUser : role === 'salg' ? salg : role === 'montør' ? montor : await mkUser(role)
          const s = await login(u)
          const net: string[] = []
          s.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } })
          const visible = async () => s.page.locator('body').innerText().catch(() => '')
          // sag → Materialer
          await gotoSafe(s.page, `${base}/dashboard/orders/${caseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 120_000 })
          await s.page.waitForTimeout(1200)
          const caseVis = await visible()
          const caseOk = !costVals.some((v) => caseVis.includes(v))
          // tilbud
          let offerOk = true
          if (seesOffers[role]) {
            await gotoSafe(s.page, `${base}/dashboard/offers/${u83OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
            await s.page.getByText(`Matrix linje ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
            const offVis = await visible()
            offerOk = !costVals.some((v) => offVis.includes(v)) && (await s.page.getByTestId('offer-profit-card').count()) === 0
            if (seesCost[role]) {
              await s.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
              await s.page.waitForTimeout(800)
              offerOk = offerOk && (await visible()).includes('5.432,10')
            }
          }
          // data: roller uden kostadgang må aldrig modtage kostværdierne
          const allData = net.join('\n') + (await s.page.content().catch(() => ''))
          const dataOk = seesCost[role] || !costVals.some((v) => allData.includes(v))
          // leverandør-login-fane
          await gotoSafe(s.page, `${base}/dashboard/settings/suppliers/${u83SupplierId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await s.page.waitForTimeout(800)
          const credTab = (await s.page.getByRole('tab', { name: /API Login|FTP Login/ }).count()) > 0
          const credOk = role === 'admin' ? credTab : !credTab
          r[`${role}`] = caseOk && offerOk && dataOk && credOk
          notes.push(`${role}:sag=${caseOk ? 'ok' : 'SYNLIG'},tilbud=${offerOk ? 'ok' : 'FEJL'},data=${dataOk ? 'ok' : 'LÆK'},login-fane=${credTab ? 'ja' : 'nej'}`)
          await s.ctx.close().catch(() => {})
        }
        out.push({ id: `${tid} privacy-rollematrix (${roles.join('/')})`, ok: !!caseId && !!u83OfferId && Object.values(r).every(Boolean), note: notes.join(' · ') })
        }
      }

      // U84 D48-audit (S1): salg får ingen kost/avance fra (1) getOffer (margin_percentage), (2) tilføj linje fra leverandør
      // (returneret række), (3) pakke-vælgeren, (4) kundesidens leverandørpriser, (5) AI-indsigter; ingen "Optimer priser"
      if (want('U84') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-AU-${stamp}`, title: `[HARNESS] audit ${stamp}`, customer_id: profitCustomerId, status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        u84OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u84OfferId) await c.admin.from('offer_line_items').insert([{ offer_id: u84OfferId, position: 1, description: `Audit linje ${stamp}`, quantity: 1, unit: 'stk', unit_price: 1000, total: 1000, cost_price: 612.34, margin_percentage: 63.37, sale_price: 1000 }])
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U84 grossist ${stamp}`, code: `HU84${stamp}`, is_active: true }]).select('id')
        u84SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sku = `H84-${stamp}`
        if (u84SupplierId) await c.admin.from('supplier_products').insert([{ supplier_id: u84SupplierId, supplier_sku: sku, supplier_name: `Harness U84 vare ${stamp}`, cost_price: 56.78, unit: 'stk', is_available: true }])
        const pk = await c.admin.from('packages').insert([{ name: `[HARNESS] U84 pakke ${stamp}`, code: `HU84P${stamp}`, total_cost_price: 6543.21, total_sale_price: 9999, db_amount: 3455.79, db_percentage: 34.56, is_active: true, created_by: adminUser.id }]).select('id')
        u84PackageId = (pk.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u84SupplierId) await c.admin.from('customer_supplier_prices').insert([{ customer_id: profitCustomerId, supplier_id: u84SupplierId, discount_percentage: 17.25, custom_margin_percentage: 29.75, is_active: true }])
        const secrets = ['612.34', '612,34', '63.37', '56.78', '56,78', '6543.21', '6.543,21', '3455.79', '34.56', '17.25', '29.75']
        const s = await login(salg)
        const net: string[] = []
        s.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } })
        await gotoSafe(s.page, `${base}/dashboard/offers/${u84OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.getByText(`Audit linje ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.ingen_optimer = (await s.page.getByRole('button', { name: /Optimer priser/ }).count()) === 0
        // tilføj linje fra leverandør → den returnerede række
        await s.page.getByRole('button', { name: /Fra leverandør/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await s.page.getByPlaceholder(/Indtast varenummer eller produktnavn/).fill(sku).catch(() => {})
        await s.page.getByText(`Harness U84 vare ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        await s.page.getByRole('button', { name: 'Tilføj', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
        const lineAdded = async () => ((await c.admin.from('offer_line_items').select('id').eq('offer_id', u84OfferId ?? '')).data ?? []).length >= 2
        let added = await lineAdded()
        for (let i = 0; i < 20 && !added; i++) { await new Promise((res) => setTimeout(res, 1000)); added = await lineAdded() }
        r.linje_tilfoejet = added
        await s.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        // pakke-vælger
        await s.page.keyboard.press('Escape').catch(() => {})
        await s.page.getByRole('button', { name: /Fra pakke/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await s.page.getByText(`[HARNESS] U84 pakke ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.pakke_vist = (await s.page.getByText(`[HARNESS] U84 pakke ${stamp}`).count()) > 0
        await s.page.keyboard.press('Escape').catch(() => {})
        // kundeside
        await gotoSafe(s.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.waitForTimeout(1200)
        r.ingen_kundepriser = (await s.page.getByText('Leverandørpriser', { exact: true }).count()) === 0
        // AI-indsigter (dashboard-widget)
        const ai = await s.page.request.get(`${base}/api/dashboard/ai-insights`).then((x) => x.json()).catch(() => null) as { insights?: unknown[] } | null
        r.ai_indsigter_tomme = !!ai && Array.isArray(ai.insights) && ai.insights.length === 0
        const all = net.join('\n') + (await s.page.content().catch(() => ''))
        const leaked = secrets.filter((v) => all.includes(v))
        r.ingen_kost_i_data = leaked.length === 0
        await s.ctx.close().catch(() => {})
        // kontoret: kundepriser og optimering findes
        await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText('Leverandørpriser', { exact: true }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.admin_kundepriser = (await a.page.getByText('Leverandørpriser', { exact: true }).count()) > 0
        out.push({ id: 'U84 D48-audit: salg uden kost i linjer/pakker/kundepriser/AI', ok: !!u84OfferId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${leaked.length ? ` · LÆK: ${leaked.join(',')}` : ''}` })
      }

      // U87 N25: tilbudslinjer uden kostpris — banner (antal, ingen beløb) for kontoret; "Udfyld kost" sætter
      // leverandørens kostpris på leverandørlinjen (salgspris uændret); salg ser intet banner
      if (want('U87') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U87 grossist ${stamp}`, code: `HU87${stamp}`, is_active: true }]).select('id')
        u87SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = u87SupplierId ? await c.admin.from('supplier_products').insert([{ supplier_id: u87SupplierId, supplier_sku: `H87-${stamp}`, supplier_name: `Harness U87 vare ${stamp}`, cost_price: 41.5, unit: 'stk', is_available: true }]).select('id') : null
        const spId = (sp?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-NC-${stamp}`, title: `[HARNESS] mangler kost ${stamp}`, customer_id: profitCustomerId, status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        u87OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const L = (position: number, description: string, unit: string, extra: Record<string, unknown>) =>
          ({ offer_id: u87OfferId, position, description, quantity: 2, unit, unit_price: 100, total: 200, cost_price: 0, margin_percentage: 0, sale_price: 100, ...extra })
        if (u87OfferId) await c.admin.from('offer_line_items').insert([
          L(1, `NC vare ${stamp}`, 'stk', { supplier_product_id: spId }),
          L(2, `NC manuel ${stamp}`, 'stk', {}),
          L(3, `NC med kost ${stamp}`, 'stk', { cost_price: 50 }),
        ])
        await gotoSafe(a.page, `${base}/dashboard/offers/${u87OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const banner = a.page.getByTestId('offer-missing-cost-banner')
        await banner.waitFor({ timeout: 60_000 }).catch(() => {})
        r.banner_2_linjer = ((await banner.textContent().catch(() => '')) ?? '').includes('2 linjer uden kostpris')
        await a.page.getByTestId('offer-fill-cost').click({ timeout: 30_000 }).catch(() => {})
        type NL = { description: string; cost_price: number | null; unit_price: number }
        const readL = async () => ((await c.admin.from('offer_line_items').select('description, cost_price, unit_price').eq('offer_id', u87OfferId ?? '')).data ?? []) as NL[]
        let lines = await readL()
        for (let i = 0; i < 20 && Number(lines.find((l) => l.description.startsWith('NC vare'))?.cost_price ?? 0) === 0; i++) { await new Promise((res) => setTimeout(res, 1000)); lines = await readL() }
        const vare = lines.find((l) => l.description.startsWith('NC vare'))
        r.leverandoerkost_udfyldt = Number(vare?.cost_price) === 41.5 && Number(vare?.unit_price) === 100
        r.manuel_uaendret = Number(lines.find((l) => l.description.startsWith('NC manuel'))?.cost_price ?? 0) === 0
        await a.page.waitForTimeout(1500)
        r.banner_1_linje = ((await banner.textContent().catch(() => '')) ?? '').includes('1 linje uden kostpris')
        const s = await login(salg)
        await gotoSafe(s.page, `${base}/dashboard/offers/${u87OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.getByText(`NC manuel ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.salg_intet_banner = (await s.page.getByTestId('offer-missing-cost-banner').count()) === 0
        await s.ctx.close().catch(() => {})
        out.push({ id: 'U87 N25 manglende kostpris på tilbudslinjer', ok: !!u87OfferId && !!spId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U88 N26d/PV8: Rapporter → Sagsrentabilitet — budget/tilbudt/faktisk kost sammenfoldet som standard; fold ud viser
      // tilbudt vs. faktisk kost og afvigelse pr. sag (tilbudt 5.000, faktisk 660 → −4.340)
      if (want('U88') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-RP-${stamp}`, title: `[HARNESS] rapport ${stamp}`, customer_id: profitCustomerId,
          status: 'accepted', created_by: adminUser.id, tax_percentage: 25, final_amount: 9375, tax_amount: 1875 }]).select('id')
        u88OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const L = (position: number, description: string, quantity: number, unit: string, cost: number) =>
          ({ offer_id: u88OfferId, position, description, quantity, unit, unit_price: cost * 1.5, total: quantity * cost * 1.5, cost_price: cost, margin_percentage: 33, sale_price: cost * 1.5 })
        if (u88OfferId) await c.admin.from('offer_line_items').insert([L(1, 'Montage', 10, 'timer', 400), L(2, `RP kabel ${stamp}`, 50, 'm', 10), L(3, `RP tavle ${stamp}`, 1, 'stk', 500)])
        const caseTitle = `[HARNESS] rapport ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title: caseTitle, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, source_offer_id: u88OfferId }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([
            { case_id: caseId, description: `rp kabel ${stamp}`, quantity: 60, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: adminUser.id },
            { case_id: caseId, description: `RP ekstra ${stamp}`, quantity: 2, unit: 'stk', unit_cost: 30, unit_sales_price: 45, billable: true, source: 'manual', created_by: adminUser.id },
          ])
        }
        await gotoSafe(a.page, `${base}/dashboard/reports`, { waitUntil: 'networkidle', timeout: 120_000 })
        const card = a.page.getByTestId('report-case-profitability')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        await card.getByText(caseTitle).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.sag_i_rapport = (await card.getByText(caseTitle).count()) > 0
        // kolonneoverskrifterne (ikke fritekst — en efterladt '[HARNESS] budget …'-sag matchede getByText('Budget'))
        r.foldet = (await card.getByRole('columnheader', { name: 'Tilbudt kost', exact: true }).count()) === 0 && (await card.getByRole('columnheader', { name: 'Budget', exact: true }).count()) === 0
        await card.getByTestId('cost-reveal-toggle').click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(800)
        const row = card.locator('tr', { hasText: caseTitle }).first()
        r.afvigelse = ((await row.getByTestId('report-case-deviation').textContent().catch(() => '')) ?? '').includes('4.340')
        r.sortering_vises = (await card.getByTestId('report-sort-deviation').count()) === 1
        // Efterkalkulation 2026-10-15: tilbudt DB = 7.500 − 5.000 = 2.500 (33,3 %), opsummering, "Kun afvigelser"
        r.tilbudt_db = /2\.500.*33,3 %/.test(((await row.getByTestId('report-case-offered-db').textContent().catch(() => '')) ?? '').replace(/\s/g, ' '))
        r.opsummering = (await card.getByTestId('report-aftercalc-summary').count()) === 1
        await card.getByTestId('report-only-issues').check({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(500)
        r.kun_afvigelser_skjuler = (await card.locator('tr', { hasText: caseTitle }).count()) === 0
        out.push({ id: 'U88 N26d rapport: tilbudt vs. faktisk kost pr. sag (foldet)', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U159 fokus D 2026-10-15: dashboard-widget "Sager over estimat" — åben sag med faktisk kost over tilbudt (tilbudt 100,
      // faktisk 600) vises for admin med flag; montør ser ikke widgetten (economy.view)
      if (want('U159') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OB-${stamp}`, title: `[HARNESS] over ${stamp}`, customer_id: profitCustomerId,
          status: 'accepted', created_by: adminUser.id, tax_percentage: 25 }]).select('id')
        const offId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (offId) await c.admin.from('offer_line_items').insert([{ offer_id: offId, position: 1, description: `OB kabel ${stamp}`, quantity: 10, unit: 'm', unit_price: 15, total: 150, cost_price: 10, margin_percentage: 33, sale_price: 15 }])
        const caseTitle = `[HARNESS] over estimat ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title: caseTitle, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, source_offer_id: offId }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `ob kabel ${stamp}`, quantity: 60, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: adminUser.id }])
        }
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const w = a.page.getByTestId('over-budget-widget')
        await w.getByText(caseTitle).first().waitFor({ timeout: 90_000 }).catch(() => {})
        const item = w.locator('li', { hasText: caseTitle }).first()
        r.vist_for_admin = (await item.count()) === 1
        r.flag_kost = (await item.getByText('over tilbudt kost').count()) === 1
        r.ingen_beloeb = !/kr\./.test(((await w.innerText().catch(() => '')) ?? ''))
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_ser_ikke = (await m.page.getByTestId('over-budget-widget').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U159 dashboard: sager over estimat (economy.view)', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U89 PV16: Rediger medarbejder — løn/satser sammenfoldet og IKKE hentet ved åbning (intet lønbeløb i HTML/data);
      // "Løn og satser" foldes ud → hentes og vises
      if (want('U89')) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `[HARNESS] U89 ${stamp}`, email: `u89-${stamp}@harness.test`, role: 'montør', active: true }]).select('id')
        u89EmployeeId = (emp.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u89EmployeeId) await c.admin.from('employee_compensation').upsert([{ employee_id: u89EmployeeId, hourly_wage: 271.83, internal_cost_rate: 314.15, sales_rate: 627.18 }], { onConflict: 'employee_id' })
        const secrets = ['271.83', '271,83', '314.15', '314,15']
        const net: string[] = []
        const onResp = async (resp: { request(): { resourceType(): string }; text(): Promise<string> }) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; net.push(await resp.text()) } catch { /* lukket */ } }
        a.page.on('response', onResp)
        await gotoSafe(a.page, `${base}/dashboard/employees/${u89EmployeeId}/edit`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('payroll-fold').waitFor({ timeout: 60_000 }).catch(() => {})
        const before = net.join('\n') + (await a.page.content().catch(() => ''))
        r.foldet_ikke_hentet = !secrets.some((v) => before.includes(v)) && (await a.page.getByText('Satser og økonomi (DKK / %)').count()) === 0
        await a.page.getByTestId('payroll-fold').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByText('Satser og økonomi (DKK / %)').first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.fold_ud_henter = (await a.page.getByText('Satser og økonomi (DKK / %)').count()) > 0
          && await a.page.locator('input').evaluateAll((els) => els.some((e) => ['314.15', '314,15'].includes((e as HTMLInputElement).value)))
        a.page.off('response', onResp)
        out.push({ id: 'U89 PV16 løn på Rediger medarbejder foldet + hentes ved åbning', ok: !!u89EmployeeId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U147 (00203, staging): "Ny revision" på et sendt tilbud → kladde R2 (redigerbar), historik viser R1 → R2.
      if (want('U147') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const { data: o } = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-REV-${stamp}`, title: '[HARNESS] revision UI', created_by: adminUser.id,
          customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString() }]).select('id')
        const r1 = (o?.[0] as { id?: string } | undefined)?.id ?? null
        if (r1) await c.admin.from('offer_line_items').insert([{ offer_id: r1, position: 1, description: 'Linje', quantity: 1, unit: 'stk', unit_price: 500, sale_price: 500, total: 500 }])
        await gotoSafe(a.page, `${base}/dashboard/offers/${r1}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const btn = a.page.getByTestId('offer-new-revision')
        await btn.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
        r.panel_og_knap = (await btn.count()) === 1
        await a.page.waitForTimeout(1500)
        await btn.click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL((u) => !u.pathname.endsWith(String(r1)), { timeout: 60_000 }).catch(() => {})
        const r2 = a.page.url().split('/').pop() ?? ''
        r.navigeret_til_revision = !!r2 && r2 !== r1
        await a.page.getByRole('button', { name: 'Rediger', exact: true }).waitFor({ timeout: 60_000 }).catch(() => {})
        r.revision_er_redigerbar_kladde = (await a.page.getByRole('button', { name: 'Rediger', exact: true }).count()) === 1
        await a.page.getByTestId('offer-revisions').getByText('Rev. 2').waitFor({ timeout: 30_000 }).catch(() => {})
        r.historik_r1_r2 = (await a.page.getByTestId('offer-revisions').getByText('Rev. 1').count()) > 0 && (await a.page.getByTestId('offer-revisions').getByText('Rev. 2').count()) > 0
        for (const id of [r2, r1].filter(Boolean) as string[]) {
          await c.admin.from('offer_activities').delete().eq('offer_id', id)
          await c.admin.from('offer_snapshots').delete().eq('offer_id', id)
          await c.admin.from('offer_line_items').delete().eq('offer_id', id)
          await c.admin.from('offers').update({ revision_of: null, superseded_by: null }).eq('id', id)
        }
        for (const id of [r2, r1].filter(Boolean) as string[]) await c.admin.from('offers').delete().eq('id', id)
        out.push({ id: 'U147 tilbudsrevision: ny revision fra sendt tilbud + historik', ok: !!r1 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U146 (Henrik 2026-10-07): sendte/accepterede tilbud er låst — "Låst" i stedet for "Rediger"; accepteret kan ikke
      // sættes tilbage til kladde. Serveren afviser også (lib/offers/edit-lock.ts).
      if (want('U146') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (status: string) => {
          const { data } = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-LOCK-${status}-${stamp}`, title: `[HARNESS] lås ${status}`, created_by: adminUser.id,
            customer_id: profitCustomerId, status, sent_at: new Date().toISOString(), ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {}) }]).select('id')
          return (data?.[0] as { id?: string } | undefined)?.id ?? null
        }
        const sentId = await mk('sent'), accId = await mk('accepted')
        for (const [tag, id] of [['sendt', sentId], ['accepteret', accId]] as Array<[string, string | null]>) {
          await gotoSafe(a.page, `${base}/dashboard/offers/${id}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await a.page.getByTestId('offer-edit-locked').waitFor({ timeout: 60_000 }).catch(() => {})
          r[`${tag}_laast`] = (await a.page.getByTestId('offer-edit-locked').count()) === 1
          r[`${tag}_ingen_rediger`] = (await a.page.getByRole('button', { name: 'Rediger', exact: true }).count()) === 0
        }
        if (sentId) await c.admin.from('offers').delete().eq('id', sentId)
        if (accId) await c.admin.from('offers').delete().eq('id', accId)
        out.push({ id: 'U146 sendte/accepterede tilbud er låst for redigering', ok: !!sentId && !!accId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U145 (Henrik 2026-10-07): deaktiveres en medarbejder (Rediger → "Aktiv" fra), deaktiveres login'et også — efter
      // bekræftelse; intet slettes; admin kan genaktivere login'et i login-panelet. Audit i employee_events + audit_logs.
      if (want('U145')) {
        const r: Record<string, boolean> = {}
        const u = await mkUser('montør')
        const emp = await c.admin.from('employees').insert([{ name: `U145 Harness ${stamp}`, first_name: 'U145', last_name: `Harness ${stamp}`, email: `u145-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: u.id }]).select('id')
        const empId = (emp.data?.[0] as { id?: string } | undefined)?.id ?? null
        let dialogText = ''
        const onDialog = async (d: { message(): string; accept(): Promise<void> }) => { dialogText = d.message(); await d.accept() }
        a.page.on('dialog', onDialog)
        await gotoSafe(a.page, `${base}/dashboard/employees/${empId}/edit`, { waitUntil: 'networkidle', timeout: 120_000 })
        const aktiv = a.page.getByRole('checkbox', { name: 'Aktiv', exact: true }).first()
        await aktiv.waitFor({ timeout: 60_000 }).catch(() => {})
        // 00229: normtimer gemmes med stamdata (dansk decimal)
        await a.page.getByTestId('employee-weekly-hours').fill('37,5').catch(() => {})
        await aktiv.uncheck({ timeout: 30_000 }).catch(() => {})
        await a.page.getByRole('button', { name: 'Gem stamdata' }).click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(4000)
        a.page.off('dialog', onDialog)
        r.bekraeftelse_vist = /LOGIN deaktiveres/.test(dialogText)
        const e1 = (await c.admin.from('employees').select('active, termination_date, weekly_hours').eq('id', empId).maybeSingle()).data as { active: boolean; termination_date: string | null; weekly_hours: number | null } | null
        r.normtimer_gemt = Number(e1?.weekly_hours) === 37.5
        const p1 = (await c.admin.from('profiles').select('is_active').eq('id', u.id).maybeSingle()).data as { is_active: boolean } | null
        r.medarbejder_deaktiveret = e1?.active === false
        r.login_deaktiveret = p1?.is_active === false
        const ev = (await c.admin.from('employee_events').select('event_type').eq('employee_id', empId)).data as Array<{ event_type: string }> | null
        r.audit_medarbejder = !!ev?.some((x) => x.event_type === 'login_deactivated')
        const al = await c.admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('entity_id', u.id)
        r.audit_logs = (al.count ?? 0) > 0
        // genaktivér login via login-panelet (på Rediger-siden)
        await gotoSafe(a.page, `${base}/dashboard/employees/${empId}/edit`, { waitUntil: 'networkidle', timeout: 120_000 })
        const btn = a.page.getByRole('button', { name: /Aktivér login/ }).first()
        await btn.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
        await a.page.waitForTimeout(1500) // hydrering (klik før hydrering gik tabt — samme mønster som U142)
        r.knap_fundet = (await a.page.getByRole('button', { name: /Aktivér login/ }).count()) > 0
        if (!r.knap_fundet) {
          const txt = (await a.page.locator('body').innerText().catch(() => '')) ?? ''
          const lines = txt.split(/\r?\n/).filter((l) => /login|adgang|fejl|indlæs/i.test(l)).slice(0, 12)
          console.log('[U145 debug] ' + lines.join(' | '))
        }
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u145-login-panel.png'), fullPage: true }).catch(() => {})
        await btn.click({ timeout: 30_000 }).catch(() => {})
        let reactivated = false
        for (let i = 0; i < 10 && !reactivated; i++) {
          await a.page.waitForTimeout(1000)
          reactivated = ((await c.admin.from('profiles').select('is_active').eq('id', u.id).maybeSingle()).data as { is_active: boolean } | null)?.is_active === true
        }
        r.admin_kan_genaktivere = reactivated
        if (empId) { await c.admin.from('employee_events').delete().eq('employee_id', empId); await c.admin.from('employees').delete().eq('id', empId) }
        out.push({ id: 'U145 deaktivering af medarbejder deaktiverer login (bekræftelse, audit, genaktivering)', ok: !!empId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U90 D50b: Medarbejderøkonomi — serviceleder (kostpris, ikke løn) får ingen kost/DB pr. medarbejder i data/UI,
      // kun samlede totaler (sammenfoldet); admin (løn) ser kost pr. medarbejder efter "Vis kost/DB"
      if (want('U90') && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        const sl = await login(await mkUser('serviceleder'))
        const bodies: string[] = []
        sl.page.on('response', async (resp) => { try { if (['script', 'stylesheet', 'image', 'font', 'media'].includes(resp.request().resourceType())) return; bodies.push(await resp.text()) } catch { /* lukket */ } })
        await gotoSafe(sl.page, `${base}/dashboard/economy/employees`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sl.page.getByTestId('employee-economy-totals').waitFor({ timeout: 60_000 }).catch(() => {})
        const slData = bodies.join('\n') + (await sl.page.content().catch(() => ''))
        // pr. række (efter employee_name) — totals.labor_cost er et bevidst aggregat og må gerne findes
        // RSC-data i HTML kan være escapet (\") — tolerér begge former
        const rowCost = /\\?"employee_name\\?":\\?"[^"\\]*\\?",\\?"hours\\?":[-\d.]+,\\?"labor_sale\\?":[-\d.]+,\\?"labor_cost\\?":-?[1-9]/.test(slData)
        const rowNull = /\\?"employee_name\\?":\\?"[^"\\]*\\?",\\?"hours\\?":[-\d.]+,\\?"labor_sale\\?":[-\d.]+,\\?"labor_cost\\?":null/.test(slData)
        r.sl_ingen_kost_pr_medarbejder = !rowCost && rowNull
        if (!r.sl_ingen_kost_pr_medarbejder) {
          const at = slData.indexOf('employee_name')
          console.log(`[U90 debug] rowCost=${rowCost} rowNull=${rowNull} · ${at >= 0 ? slData.slice(Math.max(0, at - 20), at + 260).replace(/\s+/g, ' ') : 'INGEN employee_name i data'}`)
        }
        r.sl_totaler_foldet = ((await sl.page.getByTestId('employee-economy-totals').innerText().catch(() => '')) ?? '').includes('••••')
        await sl.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        await sl.page.waitForTimeout(600)
        r.sl_ingen_kostkolonne = (await sl.page.getByRole('columnheader', { name: 'Kost', exact: true }).count()) === 0
        await sl.ctx.close().catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/economy/employees`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('employee-economy-totals').waitFor({ timeout: 60_000 }).catch(() => {})
        r.admin_foldet = (await a.page.getByRole('columnheader', { name: 'Kost', exact: true }).count()) === 0
        await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(600)
        r.admin_kost_pr_medarbejder = (await a.page.getByRole('columnheader', { name: 'Kost', exact: true }).count()) > 0
        out.push({ id: 'U90 D50b medarbejderøkonomi: kost pr. medarbejder kun med løn-adgang', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U150 PE-6: kontraktsag — foreløbig DB regnes mod kontraktsummen (2.000 ekskl. moms), ikke registreret salg (1.000):
      // kost 600 → DB 1.400 (70 %) "af kontraktsum"
      if (want('U150') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] kontrakt-DB ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, contract_sum: 2000 }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `KDB kabel ${stamp}`, quantity: 1, unit: 'stk', unit_cost: 600, unit_sales_price: 1000, billable: true, source: 'manual', created_by: adminUser.id }])
        }
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=oekonomi`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('economy-reveal').click({ timeout: 30_000 }).catch(() => {})
        const basis = a.page.getByTestId('case-db-basis')
        await basis.waitFor({ timeout: 60_000 }).catch(() => {})
        const btxt = (await basis.textContent().catch(() => '')) ?? ''
        r.af_kontraktsum = /kontraktsum/.test(btxt) && /2\.000/.test(btxt)
        const body = (await a.page.locator('main').innerText().catch(() => '')) ?? ''
        r.db_1400 = /1\.400\s?kr/.test(body)
        r.pct_70 = /70,0\s?%/.test(body)
        r.registreret_salg_vist = /Registreret salg\s+1\.000/.test(body)
        out.push({ id: 'U150 kontraktsag: DB mod kontraktsum (PE-6)', ok: !!caseId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${btxt.slice(0, 60)}` })
      }

      // U152 GP-5: "Optimer priser" skifter kun til samme EAN med SAMME enhed (ikke en billigere meter-variant) og bruger
      // samme prisberegning som oprettelse (kost = effektiv kost, rå leverandørkost i supplier_cost_price_at_creation)
      if (want('U152') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ean = `57${String(stamp).slice(-11)}`
        const sups = await c.admin.from('suppliers').insert([{ name: `HARNESS OPT A ${stamp}`, code: `HOA${stamp}` }, { name: `HARNESS OPT B ${stamp}`, code: `HOB${stamp}` }, { name: `HARNESS OPT C ${stamp}`, code: `HOC${stamp}` }]).select('id')
        const sIds = ((sups.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        const prods = sIds.length === 3 ? await c.admin.from('supplier_products').insert([
          { supplier_id: sIds[0], supplier_sku: `OPT-A-${stamp}`, supplier_name: 'Harness stikkontakt', cost_price: 100, unit: 'stk', ean, is_available: true },
          { supplier_id: sIds[1], supplier_sku: `OPT-B-${stamp}`, supplier_name: 'Harness stikkontakt', cost_price: 80, unit: 'stk', ean, is_available: true },
          { supplier_id: sIds[2], supplier_sku: `OPT-C-${stamp}`, supplier_name: 'Harness stikkontakt', cost_price: 50, unit: 'm', ean, is_available: true },
        ]).select('id, supplier_sku') : null
        const pId = (sku: string) => ((prods?.data ?? []) as Array<{ id: string; supplier_sku: string }>).find((x) => x.supplier_sku.startsWith(sku))?.id ?? null
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OPT-${stamp}`, title: '[HARNESS] optimer', created_by: adminUser.id, customer_id: profitCustomerId }]).select('id')
        const offerId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const li = offerId ? await c.admin.from('offer_line_items').insert([{ offer_id: offerId, position: 1, description: 'Stikkontakt', quantity: 10, unit: 'stk',
          unit_price: 125, total: 1250, cost_price: 100, supplier_product_id: pId('OPT-A'), supplier_cost_price_at_creation: 100 }]).select('id') : null
        const lineId = (li?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!lineId && !!pId('OPT-B') && !!pId('OPT-C')
        try {
          await gotoSafe(a.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('cost-reveal-toggle').first().click({ timeout: 60_000 }).catch(() => {})
          await a.page.getByRole('button', { name: /Optimer priser/ }).click({ timeout: 60_000 }).catch(() => {})
          type L = { supplier_product_id: string | null; cost_price: number | null; supplier_cost_price_at_creation: number | null; unit_price: number | null }
          let row: L | null = null
          for (let i = 0; i < 20; i++) {
            row = (await c.admin.from('offer_line_items').select('supplier_product_id, cost_price, supplier_cost_price_at_creation, unit_price').eq('id', lineId ?? '').maybeSingle()).data as L | null
            if (row?.supplier_product_id !== pId('OPT-A')) break
            await new Promise((res) => setTimeout(res, 1000))
          }
          r.skiftet_til_samme_enhed = row?.supplier_product_id === pId('OPT-B')
          r.ikke_meter_varianten = row?.supplier_product_id !== pId('OPT-C')
          r.kost_80 = Number(row?.cost_price) === 80 && Number(row?.supplier_cost_price_at_creation) === 80
          r.salgspris_sat = Number(row?.unit_price) > 80
          out.push({ id: 'U152 Optimer priser: EAN + samme enhed, samme prismodel (GP-5)', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · kost=${row?.cost_price ?? '-'} pris=${row?.unit_price ?? '-'}` })
        } finally {
          if (offerId) { await c.admin.from('offer_line_items').delete().eq('offer_id', offerId); await c.admin.from('offers').delete().eq('id', offerId) }
          if (sIds.length) { await c.admin.from('supplier_products').delete().in('supplier_id', sIds); await c.admin.from('suppliers').delete().in('id', sIds) }
        }
      }

      // U153 NEXT-11 mobil (375 px): salg ser tilbud uden vandret scroll og uden admin-slet; kundekortet uden Slet;
      // bogholderi ser ikke Ny Lead/Nyt Tilbud på dashboardet og ingen "+ Ny sag"; mail viser liste ELLER detalje
      if (want('U153') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-MOB-${stamp}`, title: `[HARNESS] mobil ${stamp}`, created_by: salg.id, customer_id: profitCustomerId }]).select('id')
        const offerId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = await login(salg)
        try {
          await sp.page.setViewportSize({ width: 375, height: 812 })
          await gotoSafe(sp.page, `${base}/dashboard/offers/${offerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await sp.page.getByText(`[HARNESS] mobil ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
          const overflow = await sp.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)
          r.tilbud_uden_vandret_scroll = overflow <= 2
          r.salg_ingen_slet_paa_tilbud = (await sp.page.getByRole('button', { name: /^Slet$/ }).count()) === 0
          r.salg_ingen_eksporter = (await sp.page.getByRole('button', { name: /Eksporter/ }).count()) === 0
          // M-20: avataren viser initialer fra profilen (før altid "U")
          const prof = (await c.admin.from('profiles').select('full_name, email').eq('id', salg.id).maybeSingle()).data as { full_name: string | null; email: string | null } | null
          const want = ((prof?.full_name ?? '').trim().split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('') || (prof?.email ?? '?')[0]).toUpperCase()
          const avatar = ((await sp.page.getByTestId('user-avatar').first().textContent().catch(() => '')) ?? '').trim()
          r.avatar_initialer = avatar === want
          await gotoSafe(sp.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await sp.page.getByRole('button', { name: /Nyt tilbud/ }).first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.salg_kundekort_nyt_tilbud = (await sp.page.getByRole('button', { name: /Nyt tilbud/ }).count()) > 0
          r.salg_kundekort_ingen_slet = (await sp.page.getByTestId('customer-delete').count()) === 0
        } finally { await sp.ctx.close().catch(() => {}) }
        const bog = await mkUser('bogholderi')
        const bp = await login(bog)
        try {
          await gotoSafe(bp.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          await bp.page.waitForTimeout(1000)
          r.bog_ingen_ny_lead = (await bp.page.getByRole('button', { name: /Ny Lead/ }).count()) === 0
          r.bog_ingen_nyt_tilbud = (await bp.page.getByRole('button', { name: /Nyt Tilbud/ }).count()) === 0
          await gotoSafe(bp.page, `${base}/dashboard/orders`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.bog_ingen_ny_sag = (await bp.page.getByRole('link', { name: /\+ Ny sag/ }).count()) === 0
          // negativ kontrol: admin ser stadig slet-knappen
          await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          await a.page.getByTestId('customer-delete').first().waitFor({ timeout: 60_000 }).catch(() => {})
          r.admin_ser_slet = (await a.page.getByTestId('customer-delete').count()) > 0
        } finally { await bp.ctx.close().catch(() => {}) }
        await a.page.setViewportSize({ width: 375, height: 812 })
        await gotoSafe(a.page, `${base}/dashboard/mail`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1500)
        const mailOverflow = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 999)
        r.mail_uden_vandret_scroll = mailOverflow <= 2
        await a.page.setViewportSize({ width: 1400, height: 1000 })
        if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
        out.push({ id: 'U153 mobil + rettigheder (NEXT-11)', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U154 M-8 (NEXT-11): rækkemenuer klippes ikke ved 375 px — menuen på SIDSTE række ligger helt inden for skærmen, er
      // øverst i stablen (ikke skjult af tabel-overflow/bundnavigation) og "Se detaljer" kan klikkes
      if (want('U154') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const offs = await c.admin.from('offers').insert([1, 2].map((n) => ({ offer_number: `UI-E2E-M8-${n}-${stamp}`, title: `[HARNESS] menu ${n} ${stamp}`, created_by: adminUser.id, customer_id: profitCustomerId }))).select('id')
        const ids = ((offs.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        try {
          await a.page.setViewportSize({ width: 375, height: 812 })
          await gotoSafe(a.page, `${base}/dashboard/offers?search=${encodeURIComponent(`[HARNESS] menu`)}`, { waitUntil: 'networkidle', timeout: 120_000 })
          const triggers = a.page.getByRole('button', { name: 'Flere handlinger' })
          await triggers.first().waitFor({ timeout: 60_000 }).catch(() => {})
          const n = await triggers.count()
          r.raekker = n >= 1
          await triggers.nth(Math.max(0, n - 1)).scrollIntoViewIfNeeded().catch(() => {})
          await triggers.nth(Math.max(0, n - 1)).click({ timeout: 15_000 }).catch(() => {})
          const menu = a.page.getByTestId('row-menu')
          await menu.waitFor({ timeout: 15_000 }).catch(() => {})
          const box = await menu.boundingBox().catch(() => null)
          const vp = a.page.viewportSize() ?? { width: 375, height: 812 }
          r.inden_for_skaermen = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5
          const item = menu.getByText('Se detaljer')
          const ib = await item.boundingBox().catch(() => null)
          r.oeverst_i_stablen = !!ib && await a.page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-floating-menu]'), { x: ib.x + ib.width / 2, y: ib.y + ib.height / 2 }).catch(() => false)
          await a.page.keyboard.press('Escape').catch(() => {})
          r.esc_lukker = (await a.page.getByTestId('row-menu').count()) === 0
        } finally {
          await a.page.setViewportSize({ width: 1400, height: 1000 })
          if (ids.length) await c.admin.from('offers').delete().in('id', ids)
        }
        out.push({ id: 'U154 rækkemenu ved 375 px (M-8)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U91 realiseret DB: netto faktureret ekskl. moms (udstedt − kreditnota; kladde/annulleret tæller ikke) mod faktisk
      // kost — materialer 600, faktura 1.000 + kreditnota 200 + kladde 5.000 → netto 800, realiseret DB 200 (25 %)
      if (want('U91') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] realiseret ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `RDB kabel ${stamp}`, quantity: 1, unit: 'stk', unit_cost: 600, unit_sales_price: 1000, billable: true, source: 'manual', created_by: adminUser.id }])
          const ins = await c.admin.from('invoices').insert([
            { invoice_number: `UI-E2E-RD1-${stamp}`, customer_id: profitCustomerId, case_id: caseId, status: 'sent', total_amount: 1000, tax_amount: 250, final_amount: 1250 },
            { invoice_number: `UI-E2E-RD3-${stamp}`, customer_id: profitCustomerId, case_id: caseId, status: 'draft', total_amount: 5000, tax_amount: 1250, final_amount: 6250 },
          ]).select('id, invoice_number')
          const std = ((ins.data ?? []) as Array<{ id: string; invoice_number: string }>)
          const origId = std.find((x) => x.invoice_number.startsWith('UI-E2E-RD1'))?.id ?? null
          const cr = origId ? await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-RD2-${stamp}`, customer_id: profitCustomerId, case_id: caseId, status: 'sent',
            invoice_type: 'credit', credit_of_invoice_id: origId, total_amount: 200, tax_amount: 50, final_amount: 250 }]).select('id') : null
          // kreditnota først i oprydningen (credit_of_invoice_id er ON DELETE RESTRICT)
          u91InvoiceIds = [...((cr?.data ?? []) as Array<{ id: string }>).map((x) => x.id), ...std.map((x) => x.id)]
          r.seed = u91InvoiceIds.length === 3
          if (!r.seed) u91SeedErr = `${ins.error?.message ?? ''} ${cr?.error?.message ?? ''}`.trim().slice(0, 160)
        }
        await gotoSafe(a.page, `${base}/dashboard/orders/${caseId}?tab=oekonomi`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('economy-reveal').click({ timeout: 30_000 }).catch(() => {})
        const card = a.page.getByTestId('realized-db-card')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.innerText().catch(() => '')) ?? ''
        r.netto_800 = /800\skr/.test(txt) // Intl-beløb bruger hårdt mellemrum ( ) && /kreditnota/.test(txt)
        r.db_200 = ((await card.getByTestId('realized-db-value').textContent().catch(() => '')) ?? '').includes('200')
        r.pct_25 = /25,0\s?%/.test(txt)
        // N42: samme sag i Rapporter → Sagsrentabilitet (sammenfoldet → fold ud)
        await gotoSafe(a.page, `${base}/dashboard/reports`, { waitUntil: 'networkidle', timeout: 120_000 })
        const rep = a.page.getByTestId('report-case-profitability')
        await rep.getByText(`[HARNESS] realiseret ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        await rep.getByTestId('cost-reveal-toggle').click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(600)
        const repRow = rep.locator('tr', { hasText: `[HARNESS] realiseret ${stamp}` }).first()
        r.rapport_realiseret = ((await repRow.getByTestId('report-case-realized').textContent().catch(() => '')) ?? '').includes('200')
        // fokus D: DB pr. kunde/måned vises når beløb er foldet ud
        r.db_pr_kunde = (await rep.getByTestId('report-db-by-customer').count()) === 1 && (await rep.getByTestId('report-db-by-month').count()) === 1
        // B-9: faktureret serie (netto ekskl. moms) ved siden af ordreindgang
        r.faktureret_serie = (await a.page.getByTestId('report-invoiced-bar').count()) > 0
        // B-8: filtre i URL'en
        await rep.getByTestId('report-status').selectOption('open').catch(() => {})
        await a.page.waitForTimeout(500)
        r.filter_i_url = /status=open/.test(a.page.url())
        out.push({ id: 'U91 realiseret DB pr. sag', ok: !!caseId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${u91SeedErr ? ` · SEED: ${u91SeedErr}` : ''} · "${txt.replace(/\s+/g, ' ').slice(0, 200)}"` })
      }

      // U92 Vedhæft PDF på mail-faktura uden fil: bilag gemmes privat, PDF-teksten erstatter mailteksten, fakturaen læses
      // igen (nr. + beløb), audit 'file_attached'; knappen findes ikke når der allerede er et bilag
      if (want('U92')) {
        const r: Record<string, boolean> = {}
        const invNo = `HV92-${stamp}`
        const ii = await c.admin.from('incoming_invoices').insert([{ source: 'email', status: 'received', parse_status: 'needs_review',
          file_name: `mail-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'Hej, se vedhæftede faktura. Mvh grossisten', file_hash: `u92-${stamp}`,
          supplier_name_extracted: `[HARNESS] U92 ${stamp}` }]).select('id')
        u92InvoiceId = (ii.data?.[0] as { id?: string } | undefined)?.id ?? null
        // N43: listefilteret "Mangler bilag" viser fakturaen
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByRole('button', { name: /^Mangler bilag/ }).click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByText(`[HARNESS] U92 ${stamp}`).first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.filter_mangler_bilag = (await a.page.getByText(`[HARNESS] U92 ${stamp}`).count()) > 0
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u92InvoiceId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('invoice-attach-file').waitFor({ timeout: 60_000 }).catch(() => {})
        r.knap_vist = (await a.page.getByTestId('invoice-attach-file').count()) === 1
        const pdf = makeTextPdf(['HARNESS Vedhaeft-grossist A/S', `Faktura ${invNo}`, `Fakturanummer: ${invNo}`, 'Fakturadato: 02-10-2026',
          'Forfaldsdato: 01-11-2026', 'Beloeb i alt inkl. moms: 2.500,00 DKK'])
        await a.page.getByTestId('invoice-attach-input').setInputFiles({ name: `faktura-${invNo}.pdf`, mimeType: 'application/pdf', buffer: pdf }).catch(() => {})
        await a.page.getByTestId('invoice-attach-result').waitFor({ timeout: 90_000 }).catch(() => {})
        type IR = { file_url: string | null; raw_text: string | null; invoice_number: string | null; amount_incl_vat: number | null }
        const row = (await c.admin.from('incoming_invoices').select('file_url, raw_text, invoice_number, amount_incl_vat').eq('id', u92InvoiceId ?? '').maybeSingle()).data as IR | null
        r.fil_privat = !!row?.file_url && row.file_url.startsWith('attachments/supplier-invoices/')
        r.tekst_fra_pdf = (row?.raw_text ?? '').includes(invNo)
        r.laest_igen = row?.invoice_number === invNo && Number(row?.amount_incl_vat) === 2500
        const aud = ((await c.admin.from('incoming_invoice_audit_log').select('action').eq('incoming_invoice_id', u92InvoiceId ?? '')).data ?? []) as Array<{ action: string }>
        r.audit = aud.some((x) => x.action === 'file_attached')
        await a.page.reload({ waitUntil: 'networkidle' }).catch(() => {})
        r.knap_vaek_med_fil = (await a.page.getByTestId('invoice-attach-file').count()) === 0
        out.push({ id: 'U92 vedhæft PDF på mail-faktura uden bilag', ok: !!u92InvoiceId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · nr=${row?.invoice_number ?? '-'} beløb=${row?.amount_incl_vat ?? '-'}` })
      }

      // U120 N66: leverandør på mail-faktura — "Opret ny" opretter leverandøren med afsenderdomænet som website og kobler
      // fakturaen (audit); næste faktura fra samme domæne kobles automatisk ved "Kør parse + match igen" (sender_domain_match)
      if (want('U120')) {
        const r: Record<string, boolean> = {}
        const dom = `u120-${stamp}.dk`
        const supName = `[HARNESS] U120 grossist ${stamp}`
        const mkMail = async (n: number) => (await c.admin.from('incoming_emails').insert([{ sender_email: `faktura@${dom}`, sender_name: 'Grossist', subject: `Faktura ${n} ${stamp}`,
          body_text: 'Se vedhæftede faktura', link_status: 'ignored', received_at: new Date().toISOString(), is_archived: true }]).select('id')).data?.[0] as { id?: string } | undefined
        const mkInv = async (n: number) => {
          const em = await mkMail(n)
          if (em?.id) u120EmailIds.push(em.id)
          const ii = em?.id ? await c.admin.from('incoming_invoices').insert([{ source: 'email', source_email_id: em.id, status: 'received', parse_status: 'needs_review',
            file_name: `mail-${n}-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'Hej, se vedhæftede faktura.', file_hash: `u120-${n}-${stamp}` }]).select('id') : null
          const id = (ii?.data?.[0] as { id?: string } | undefined)?.id
          if (id) u120InvoiceIds.push(id)
        }
        await mkInv(1); await mkInv(2)
        r.seed = u120InvoiceIds.length === 2
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u120InvoiceIds[0]}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('invoice-supplier-new').click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('invoice-supplier-name').fill(supName).catch(() => {})
        r.domaene_vist = (await a.page.getByText(dom, { exact: true }).count()) > 0
        // N66b: "Kobl også 1 anden åben faktura fra <domæne>" er valgt som standard
        r.samme_domaene_tilbudt = /Kobl også 1 anden åben faktura/.test((await a.page.getByTestId('invoice-supplier-same-domain').textContent().catch(() => '')) ?? '')
        await a.page.getByTestId('invoice-supplier-create').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('invoice-supplier-msg').waitFor({ timeout: 60_000 }).catch(() => {})
        const sup = (await c.admin.from('suppliers').select('id, website').eq('name', supName).maybeSingle()).data as { id: string; website: string | null } | null
        u120SupplierId = sup?.id ?? null
        r.leverandoer_oprettet = !!sup && sup.website === dom
        const inv1 = (await c.admin.from('incoming_invoices').select('supplier_id').eq('id', u120InvoiceIds[0] ?? '').maybeSingle()).data as { supplier_id: string | null } | null
        r.faktura_koblet = !!sup && inv1?.supplier_id === sup.id
        const aud = ((await c.admin.from('incoming_invoice_audit_log').select('message').eq('incoming_invoice_id', u120InvoiceIds[0] ?? '')).data ?? []) as Array<{ message: string | null }>
        r.audit = aud.some((x) => (x.message ?? '').startsWith('manual supplier'))
        const inv2 = (await c.admin.from('incoming_invoices').select('supplier_id').eq('id', u120InvoiceIds[1] ?? '').maybeSingle()).data as { supplier_id: string | null } | null
        r.samme_domaene_koblet = !!sup && inv2?.supplier_id === sup.id
        // en NY faktura fra domænet kobles af matcheren (sender_domain_match) ved "Kør parse + match igen"
        await mkInv(3)
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u120InvoiceIds[2]}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByRole('button', { name: 'Kør parse + match igen' }).click({ timeout: 60_000 }).catch(() => {})
        let inv3: { supplier_id: string | null } | null = null
        for (let i = 0; i < 20 && !(inv3?.supplier_id); i++) {
          await a.page.waitForTimeout(1500)
          inv3 = (await c.admin.from('incoming_invoices').select('supplier_id').eq('id', u120InvoiceIds[2] ?? '').maybeSingle()).data as { supplier_id: string | null } | null
        }
        r.naeste_auto_koblet = !!sup && inv3?.supplier_id === sup.id
        out.push({ id: 'U120 N66 leverandør fra mail-faktura + domæne-match', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U123 N68: mail-faktura fra privat afsender (gmail) uden leverandør/beløb markeres "Ikke en faktura?" og findes under
      // filteret; en tilsvarende fra et firmadomæne markeres ikke
      if (want('U123')) {
        const r: Record<string, boolean> = {}
        const mk = async (tag: string, sender: string) => {
          const em = (await c.admin.from('incoming_emails').insert([{ sender_email: sender, sender_name: 'Afsender', subject: `Re: solceller ${tag} ${stamp}`,
            body_text: 'Hej', link_status: 'ignored', received_at: new Date().toISOString(), is_archived: true }]).select('id')).data?.[0] as { id?: string } | undefined
          if (em?.id) u120EmailIds.push(em.id)
          const ii = em?.id ? await c.admin.from('incoming_invoices').insert([{ source: 'email', source_email_id: em.id, status: 'received', parse_status: 'needs_review',
            file_name: `mail-${tag}-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'Hej', file_hash: `u123-${tag}-${stamp}`, supplier_name_extracted: `[HARNESS] U123 ${tag} ${stamp}` }]).select('id') : null
          const id = (ii?.data?.[0] as { id?: string } | undefined)?.id
          if (id) u120InvoiceIds.push(id)
          return id
        }
        r.seed = !!(await mk('privat', `harness-${stamp}@gmail.com`)) && !!(await mk('firma', `faktura@u123-${stamp}.dk`))
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByRole('button', { name: /^Ikke en faktura\?/ }).click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByText(`[HARNESS] U123 privat ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const priv = a.page.locator('tr', { hasText: `[HARNESS] U123 privat ${stamp}` }).first()
        r.privat_markeret = (await priv.getByTestId('invoice-not-invoice-badge').count()) === 1
        r.firma_ikke_i_filter = (await a.page.getByText(`[HARNESS] U123 firma ${stamp}`).count()) === 0
        out.push({ id: 'U123 N68 "Ikke en faktura?" for privat afsender', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U127 N79: "Ikke en faktura" på leverandørfakturaen udfylder begrundelsen; bekræftelse afviser fakturaen med den
      if (want('U127')) {
        const r: Record<string, boolean> = {}
        const ii = await c.admin.from('incoming_invoices').insert([{ source: 'manual', status: 'received', parse_status: 'needs_review',
          file_name: `u127-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'Hej, hvornår kan I komme?', file_hash: `u127-${stamp}`, supplier_name_extracted: `[HARNESS] U127 ${stamp}` }]).select('id')
        const id = (ii.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (id) u120InvoiceIds.push(id)
        r.seed = !!id
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${id}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('invoice-reject-not-invoice').click({ timeout: 60_000 }).catch(() => {})
        r.begrundelse_udfyldt = /Ikke en leverandørfaktura/.test((await a.page.locator('textarea').first().inputValue().catch(() => '')) ?? '')
        await a.page.getByRole('button', { name: 'Bekræft afvisning' }).click({ timeout: 30_000 }).catch(() => {})
        type U127Row = { status: string; rejected_reason: string | null }
        let row = null as U127Row | null
        for (let i = 0; i < 15 && row?.status !== 'rejected'; i++) {
          await a.page.waitForTimeout(1000)
          row = (await c.admin.from('incoming_invoices').select('status, rejected_reason').eq('id', id ?? '').maybeSingle()).data as U127Row | null
        }
        r.afvist = row?.status === 'rejected' && (row.rejected_reason ?? '').startsWith('Ikke en leverandørfaktura')
        out.push({ id: 'U127 N79 "Ikke en faktura" afviser med begrundelse', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U93 N44: styrings-cockpittet viser nye kunder (30 d) uden tilbud/sag; "Opret tilbud" åbner kundens tilbudsformular;
      // en kunde med tilbud vises ikke; montør ser ikke kortet
      if (want('U93')) {
        const r: Record<string, boolean> = {}
        const name = `[HARNESS] Ny henvendelse ${stamp}`
        const nc = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-N-${stamp}`, company_name: name, contact_person: 'N', email: `ny-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        u93CustomerId = (nc.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const list = a.page.getByTestId('cockpit-new-customers')
        await list.getByText(name).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.kort_viser_kunde = (await list.getByText(name).count()) > 0
        await list.locator('li', { hasText: name }).getByTestId('cockpit-new-customer-offer').click({ timeout: 30_000 }).catch(() => {})
        await a.page.locator('#offer-form-title').waitFor({ timeout: 60_000 }).catch(() => {})
        r.tilbudsformular_aaben = a.page.url().includes(`/dashboard/customers/${u93CustomerId}`) && (await a.page.locator('#offer-form-title').count()) > 0
        // med et tilbud forsvinder kunden fra kortet
        if (u93CustomerId) {
          const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-NO-${stamp}`, title: `[HARNESS] ny ${stamp}`, customer_id: u93CustomerId, status: 'draft', created_by: adminUser.id }]).select('id')
          u93OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        }
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1000)
        r.vaek_med_tilbud = (await a.page.getByTestId('cockpit-new-customers').getByText(name).count()) === 0
        // N45: "Opret tilbud" direkte fra en koblet mail åbner samme kundes tilbudsformular
        const em = u93CustomerId ? await c.admin.from('incoming_emails').insert([{ sender_email: `ny-${stamp}@harness.test`, sender_name: 'Ny henvendelse', subject: `[HARNESS] Tilbud på solceller ${stamp}`,
          body_text: 'Hej, kan I give et tilbud?', customer_id: u93CustomerId, link_status: 'linked', received_at: new Date().toISOString(), is_archived: false }]).select('id') : null
        u93EmailId = (em?.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/mail?emailId=${u93EmailId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('mail-create-offer').click({ timeout: 60_000 }).catch(() => {})
        await a.page.locator('#offer-form-title').waitFor({ timeout: 60_000 }).catch(() => {})
        r.mail_opret_tilbud = a.page.url().includes(`/dashboard/customers/${u93CustomerId}`) && (await a.page.locator('#offer-form-title').count()) > 0
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_kort = (await m.page.getByText('Nye kunder uden tilbud').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U93 N44 nye kunder uden tilbud i cockpittet', ok: !!u93CustomerId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U94 N46: e-conomic-forhåndsvisning af kundebetalingen (kassekladde) — beløb og dato som live-registreringen; ikke-
      // eksporteret faktura forklares; intet sendes
      if (want('U94') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-PP-${stamp}`, customer_id: profitCustomerId, status: 'paid',
          payment_status: 'paid', total_amount: 1000, tax_amount: 250, final_amount: 1250, amount_paid: 1250, paid_at: '2026-10-02T10:00:00Z' }]).select('id')
        u94InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/invoices/${u94InvoiceId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('economic-payment-preview-toggle').click({ timeout: 60_000 }).catch(() => {})
        const pv = a.page.getByTestId('economic-payment-preview')
        await pv.getByTestId('economic-payment-amount').waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await pv.innerText().catch(() => '')) ?? ''
        r.beloeb = ((await pv.getByTestId('economic-payment-amount').textContent().catch(() => '')) ?? '').includes('1.250,00')
        r.dato_dansk = txt.includes('2026-10-02')
        r.ikke_eksporteret_forklaret = /ikke eksporteret til e-conomic/i.test(txt)
        r.intet_sendt = ((await c.admin.from('accounting_sync_log').select('id').eq('entity_id', u94InvoiceId ?? '')).data ?? []).length === 0
        out.push({ id: 'U94 N46 e-conomic betalingspostering (forhåndsvisning)', ok: !!u94InvoiceId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · "${txt.replace(/\s+/g, ' ').slice(0, 220)}"` })
      }

      // U95 N47: kladde-tilbud viser linjer hvor leverandørprisen er ændret (+25 %); "Opdater pris" sætter ny kost BÅDE i
      // cost_price og supplier_cost_price_at_creation og ny salgspris; salg ser ikke kortet
      if (want('U95') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U95 grossist ${stamp}`, code: `HU95${stamp}`, is_active: true }]).select('id')
        u95SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        const sp = u95SupplierId ? await c.admin.from('supplier_products').insert([{ supplier_id: u95SupplierId, supplier_sku: `H95-${stamp}`, supplier_name: `Harness U95 vare ${stamp}`, cost_price: 100, unit: 'stk', is_available: true }]).select('id') : null
        const spId = (sp?.data?.[0] as { id?: string } | undefined)?.id ?? null
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PC-${stamp}`, title: `[HARNESS] prisændring ${stamp}`, customer_id: profitCustomerId, status: 'draft', created_by: salg.id, tax_percentage: 25 }]).select('id')
        u95OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u95OfferId) await c.admin.from('offer_line_items').insert([{ offer_id: u95OfferId, position: 1, description: `PC vare ${stamp}`, quantity: 2, unit: 'stk',
          unit_price: 100, total: 200, cost_price: 80, supplier_cost_price_at_creation: 80, supplier_margin_applied: 25, supplier_product_id: spId, margin_percentage: 25, sale_price: 100 }])
        await gotoSafe(a.page, `${base}/dashboard/offers/${u95OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const card = a.page.getByTestId('offer-supplier-price-changes')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        r.kort_25pct = ((await card.getByTestId('supplier-price-delta').first().textContent().catch(() => '')) ?? '').includes('25')
        await card.getByTestId('supplier-price-refresh').first().click({ timeout: 30_000 }).catch(() => {})
        type PL = { cost_price: number; supplier_cost_price_at_creation: number; unit_price: number }
        const readL = async () => ((await c.admin.from('offer_line_items').select('cost_price, supplier_cost_price_at_creation, unit_price').eq('offer_id', u95OfferId ?? '').maybeSingle()).data as PL | null)
        let l = await readL()
        for (let i = 0; i < 20 && Number(l?.cost_price) !== 100; i++) { await new Promise((res) => setTimeout(res, 1000)); l = await readL() }
        r.kost_begge_felter = Number(l?.cost_price) === 100 && Number(l?.supplier_cost_price_at_creation) === 100
        r.ny_salgspris = Number(l?.unit_price) > 100
        await a.page.waitForTimeout(1500)
        r.kort_vaek = (await a.page.getByTestId('offer-supplier-price-changes').count()) === 0
        const s = await login(salg)
        await gotoSafe(s.page, `${base}/dashboard/offers/${u95OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.getByText(`PC vare ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.salg_intet_kort = (await s.page.getByTestId('offer-supplier-price-changes').count()) === 0
        await s.ctx.close().catch(() => {})
        out.push({ id: 'U95 N47 leverandørprisændring på kladde-tilbud', ok: !!u95OfferId && !!spId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · linje=${JSON.stringify(l)}` })
      }

      // U96 N48: kalenderen viser "Mangler planlægning" — aktiv sag uden arbejdsordre og sag med arbejdsordre uden dato;
      // link til sagens Planlægning-fane; montør ser ikke panelet. (Seedet som gamle sager → øverst i ældste-først-listen.)
      if (want('U96') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (title: string) => {
          const sc = await c.admin.from('service_cases').insert([{ title, customer_id: profitCustomerId, status: 'new', priority: 'medium', source: 'manual',
            created_by: adminUser.id, created_at: '2020-01-01T08:00:00Z' }]).select('id')
          const id = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) listCaseIds.push(id)
          return id
        }
        const noWo = await mk(`[HARNESS] uplanlagt ${stamp}`)
        const noDate = await mk(`[HARNESS] uden dato ${stamp}`)
        if (noDate) await c.admin.from('work_orders').insert([{ case_id: noDate, title: `[HARNESS] job uden dato ${stamp}`, status: 'planned' }])
        await gotoSafe(a.page, `${base}/dashboard/calendar`, { waitUntil: 'networkidle', timeout: 120_000 })
        const panel = a.page.getByTestId('planning-backlog')
        await panel.waitFor({ timeout: 60_000 }).catch(() => {})
        if ((await panel.getAttribute('open').catch(() => null)) === null) await panel.locator('summary').click().catch(() => {})
        const txt = (await panel.innerText().catch(() => '')) ?? ''
        r.uden_arbejdsordre = txt.includes(`[HARNESS] uplanlagt ${stamp}`) && /Ingen arbejdsordre/.test(txt)
        r.uden_dato = txt.includes(`[HARNESS] uden dato ${stamp}`) && /Arbejdsordre uden dato/.test(txt)
        await panel.getByText(`[HARNESS] uplanlagt ${stamp}`).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}\?tab=planlaegning/, { timeout: 60_000 }).catch(() => {})
        r.link_til_planlaegning = a.page.url().includes(`/dashboard/orders/${noWo}`) && a.page.url().includes('tab=planlaegning')
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard/calendar`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_panel = (await m.page.getByTestId('planning-backlog').count()) === 0
        await m.ctx.close().catch(() => {})
        if (noDate) await c.admin.from('work_orders').delete().eq('case_id', noDate)
        out.push({ id: 'U96 N48 kalender: mangler planlægning', ok: !!noWo && !!noDate && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U97 N49: montørens "Mine job" har "Navigér" direkte til jobbets adresse (Google Maps-rute)
      if (want('U97') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        await c.admin.from('service_cases').update({ address: `Harnessvej ${String(stamp).slice(-3)}`, postal_code: '8000', city: 'Aarhus C' }).eq('id', jobCaseId)
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
        const wo = await c.admin.from('work_orders').insert([{ case_id: jobCaseId, title: `[HARNESS] nav-job ${stamp}`, status: 'planned', scheduled_date: today, assigned_employee_id: jobEmployeeId }]).select('id')
        const woId = (wo.data?.[0] as { id?: string } | undefined)?.id ?? null
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 120_000 })
        const row = m.page.locator('li', { hasText: `[HARNESS] nav-job ${stamp}` }).first()
        await row.waitFor({ timeout: 60_000 }).catch(() => {})
        const href = (await row.getByTestId('my-job-navigate').getAttribute('href').catch(() => '')) ?? ''
        r.navigér_link = href.startsWith('https://www.google.com/maps/dir/') && decodeURIComponent(href).includes(`Harnessvej ${String(stamp).slice(-3)}, 8000, Aarhus C`)
        r.job_link_bevaret = (await row.getByTestId('my-job').count()) === 1
        await m.ctx.close().catch(() => {})
        if (woId) await c.admin.from('work_orders').delete().eq('id', woId)
        out.push({ id: 'U97 N49 Mine job: Navigér til adresse', ok: !!woId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · href=${href.slice(0, 120)}` })
      }

      // U98 N50: ulæste kundebeskeder fra portalen i cockpittet → link åbner kundens chat (#chat) → beskederne markeres
      // FAKTISK som læst i DB (før: RLS lod medarbejderen kun rette egne beskeder → 0 rækker, ulæst for altid)
      if (want('U98')) {
        const r: Record<string, boolean> = {}
        const name = `[HARNESS] Portalkunde ${stamp}`
        const nc = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-PM-${stamp}`, company_name: name, contact_person: 'P', email: `pm-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        u98CustomerId = (nc.data?.[0] as { id?: string } | undefined)?.id ?? null
        // ældste-først i cockpittet (top 5) → seed som meget gamle beskeder, så kunden står øverst trods staging-rester
        const pm = u98CustomerId ? await c.admin.from('portal_messages').insert([
          { customer_id: u98CustomerId, sender_type: 'customer', sender_name: 'Kunde', message: `Hvornår kommer I? ${stamp}`, created_at: '2019-01-01T09:00:00Z' },
          { customer_id: u98CustomerId, sender_type: 'customer', sender_name: 'Kunde', message: `Hallo? ${stamp}`, created_at: '2019-01-02T09:00:00Z' },
        ]).select('id') : null
        r.seed = (pm?.data ?? []).length === 2
        if (!r.seed) u98SeedErr = (pm?.error?.message ?? 'ingen kunde').slice(0, 160)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const list = a.page.getByTestId('cockpit-portal-unread')
        await list.getByText(name).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.cockpit_viser_kunde = (await list.getByText(name).count()) > 0
        await list.getByText(name).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByText(`Hallo? ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.chat_aaben = (await a.page.getByText(`Hallo? ${stamp}`).count()) > 0
        const readUnread = async () => ((await c.admin.from('portal_messages').select('id').eq('customer_id', u98CustomerId ?? '').is('read_at', null)).data ?? []).length
        let unread = await readUnread()
        for (let i = 0; i < 15 && unread > 0; i++) { await new Promise((res) => setTimeout(res, 1000)); unread = await readUnread() }
        r.markeret_laest_i_db = unread === 0
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.vaek_fra_cockpit = (await a.page.getByTestId('cockpit-portal-unread').getByText(name).count()) === 0
        out.push({ id: 'U98 N50 portalbeskeder: cockpit → chat → markeret læst', ok: !!u98CustomerId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ulæste=${unread}${u98SeedErr ? ` · SEED: ${u98SeedErr}` : ''}` })
      }

      // U99 N51: cockpit "Klar til fakturering" — sag med fakturerbart materiale uden faktura vises med salgsværdi og
      // linker til fakturakladden; montør ser ikke kortet
      if (want('U99') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] klar til fakturering ${stamp}`
        const sc = await c.admin.from('service_cases').insert([{ title, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `KF anlæg ${stamp}`, quantity: 1, unit: 'stk', unit_cost: 500000, unit_sales_price: 987654, billable: true, source: 'manual', created_by: adminUser.id }])
        }
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const list = a.page.getByTestId('cockpit-unbilled')
        await list.getByText(title).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const row = list.locator('li', { hasText: title }).first()
        r.kort_viser_sag = (await row.count()) > 0 && ((await row.innerText().catch(() => '')) ?? '').includes('987.654')
        await row.click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL(/tab=fakturakladde/, { timeout: 60_000 }).catch(() => {})
        r.link_fakturakladde = a.page.url().includes(`/dashboard/orders/${caseId}`) && a.page.url().includes('tab=fakturakladde')
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_kort = (await m.page.getByText('Klar til fakturering').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U99 N51 klar til fakturering i cockpittet', ok: !!caseId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U100 N52/N53: cockpit viser gamle kladder (> 14 d) med link; Rapporter viser salgstragt med indeværende måned,
      // hvor et nyoprettet+sendt+accepteret tilbud tæller med
      if (want('U100') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const old = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OD-${stamp}`, title: `[HARNESS] gammel kladde ${stamp}`, customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id, created_at: '2020-01-01T09:00:00Z' }]).select('id')
        const nowIso = new Date().toISOString()
        const won = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OW-${stamp}`, title: `[HARNESS] vundet ${stamp}`, customer_id: profitCustomerId,
          status: 'accepted', created_by: adminUser.id, sent_at: nowIso, accepted_at: nowIso, final_amount: 4242 }]).select('id')
        u100OfferIds = [...((old.data ?? []) as Array<{ id: string }>), ...((won.data ?? []) as Array<{ id: string }>)].map((x) => x.id)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const stale = a.page.getByTestId('cockpit-stale-drafts')
        await stale.waitFor({ timeout: 60_000 }).catch(() => {})
        r.gamle_kladder = /ældre end 14 dage/.test((await stale.textContent().catch(() => '')) ?? '')
        await gotoSafe(a.page, `${base}/dashboard/reports`, { waitUntil: 'networkidle', timeout: 120_000 })
        const funnel = a.page.getByTestId('report-sales-funnel')
        await funnel.waitFor({ timeout: 60_000 }).catch(() => {})
        const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' }).slice(0, 7)
        const row = funnel.locator(`[data-month="${month}"]`)
        const cells = await row.locator('td').allInnerTexts().catch(() => [] as string[])
        r.tragt_vises = (await funnel.locator('[data-testid="funnel-row"]').count()) === 6
        r.maaned_accepteret = cells.length === 7 && Number(cells[4]) >= 1 && Number(cells[3]) >= 1
        out.push({ id: 'U100 N52/N53 gamle kladder + salgstragt', ok: u100OfferIds.length === 2 && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${month}=${cells.join('|')}` })
      }

      // U101/U102 rute-crawl (admin): alle statiske dashboard-sider indlæses uden fejlgrænse ("Der opstod en fejl"), uden
      // 404 og uden "Du har ikke adgang" (admin har alle rettigheder) — delt i to så ingen test nærmer sig 5 min
      const CRAWL_ROUTES = ['/dashboard', '/dashboard/agents', '/dashboard/ai-project', '/dashboard/bank', '/dashboard/calc', '/dashboard/calculations',
        '/dashboard/calculations/kalkia', '/dashboard/calculations/profit-simulator', '/dashboard/calculations/quick', '/dashboard/calculations/room-calculator',
        '/dashboard/calendar', '/dashboard/cti', '/dashboard/customers', '/dashboard/economy/employees', '/dashboard/employees', '/dashboard/employees/new',
        '/dashboard/go-live', '/dashboard/inbox', '/dashboard/incoming-invoices', '/dashboard/invoices', '/dashboard/kalkia/intelligence', '/dashboard/leads',
        '/dashboard/mail', '/dashboard/mail/proposals', '/dashboard/offers', '/dashboard/orders', '/dashboard/orders/new', '/dashboard/packages',
        '/dashboard/pilot-health', '/dashboard/pricing', '/dashboard/products', '/dashboard/projects',
        '/dashboard/purchase-operations', '/dashboard/reports', '/dashboard/service-cases', '/dashboard/settings', '/dashboard/settings/audit',
        '/dashboard/settings/calculation', '/dashboard/settings/company', '/dashboard/settings/components', '/dashboard/settings/economic',
        '/dashboard/settings/economic/log', '/dashboard/settings/email', '/dashboard/settings/integrations', '/dashboard/settings/invoice-email',
        '/dashboard/settings/kalkia', '/dashboard/settings/kalkia/factors', '/dashboard/settings/kalkia/materials', '/dashboard/settings/kalkia/nodes',
        '/dashboard/settings/kalkia/profiles', '/dashboard/settings/kalkia/rooms', '/dashboard/settings/kalkia/texts', '/dashboard/settings/learning',
        '/dashboard/settings/materials', '/dashboard/settings/notifications', '/dashboard/settings/packages', '/dashboard/settings/profile',
        '/dashboard/settings/reminders', '/dashboard/settings/security', '/dashboard/settings/solar', '/dashboard/settings/suppliers', '/dashboard/settings/team',
        '/dashboard/tasks', '/dashboard/time-approval']
      for (const [tid, part] of [['U101', CRAWL_ROUTES.slice(0, 32)], ['U102', CRAWL_ROUTES.slice(32)]] as Array<[string, string[]]>) {
        if (!want(tid)) continue
        const bad: string[] = []
        for (const route of part) {
          const resp = await gotoSafe(a.page, `${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await a.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const status = resp?.status() ?? 0
          const body = (await a.page.locator('body').innerText().catch(() => '')) ?? ''
          const problem = status >= 400 ? `HTTP ${status}`
            : /Der opstod en fejl/.test(body) ? 'fejlgrænse'
            : /^\s*404\s*$/m.test(body) ? '404'
            : /Du har ikke adgang/.test(body) ? 'NoAccess'
            : ''
          if (problem) bad.push(`${route}: ${problem}`)
        }
        out.push({ id: `${tid} rute-crawl admin (${part.length} sider)`, ok: bad.length === 0, note: bad.length ? bad.join(' · ') : `${part.length} sider OK` })
      }

      // U103–U106 rute-crawl for begrænsede roller (salg, montør): ingen side må crashe (fejlgrænse/404/HTTP ≥ 500);
      // "Du har ikke adgang" er korrekt adfærd og tælles kun
      for (const [tid, who, part] of [
        ['U103', 'salg', CRAWL_ROUTES.slice(0, 32)], ['U104', 'salg', CRAWL_ROUTES.slice(32)],
        ['U105', 'montør', CRAWL_ROUTES.slice(0, 32)], ['U106', 'montør', CRAWL_ROUTES.slice(32)],
      ] as Array<[string, 'salg' | 'montør', string[]]>) {
        if (!want(tid)) continue
        const s = await login(who === 'salg' ? salg : montor)
        const bad: string[] = []
        let noAccess = 0
        for (const route of part) {
          const resp = await gotoSafe(s.page, `${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await s.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const status = resp?.status() ?? 0
          const body = (await s.page.locator('body').innerText().catch(() => '')) ?? ''
          if (status >= 500) bad.push(`${route}: HTTP ${status}`)
          else if (/Der opstod en fejl/.test(body)) bad.push(`${route}: fejlgrænse`)
          else if (/^\s*404\s*$/m.test(body)) bad.push(`${route}: 404`)
          else if (/Du har ikke adgang/.test(body)) noAccess += 1
        }
        await s.ctx.close().catch(() => {})
        out.push({ id: `${tid} rute-crawl ${who} (${part.length} sider)`, ok: bad.length === 0, note: `${bad.length ? bad.join(' · ') : 'ingen crash'} · ingen adgang: ${noAccess}/${part.length}` })
      }

      // U107 fane-crawl (admin): alle 14 faner på en sag med data (materiale, øvrig omkostning, arbejdsordre, note) samt
      // tilbud, kunde og faktura — ingen fejlgrænse/404/konsolfejl (U5 fanger konsolfejl)
      if (want('U107') && profitCustomerId) {
        const bad: string[] = []
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] fane-crawl ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, address: 'Crawlvej 1', postal_code: '8000', city: 'Aarhus C' }]).select('id')
        const caseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (caseId) {
          listCaseIds.push(caseId)
          await c.admin.from('case_materials').insert([{ case_id: caseId, description: `FC kabel ${stamp}`, quantity: 2, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: adminUser.id }])
          await c.admin.from('case_other_costs').insert([{ case_id: caseId, category: 'koersel', description: `FC kørsel ${stamp}`, quantity: 1, unit_cost: 50, unit_sales_price: 80, created_by: adminUser.id }])
          await c.admin.from('work_orders').insert([{ case_id: caseId, title: `[HARNESS] FC job ${stamp}`, status: 'planned' }])
          await c.admin.from('case_notes').insert([{ case_id: caseId, content: `FC note ${stamp}`, created_by: adminUser.id }])
        }
        const tabs = ['overblik', 'planlaegning', 'aflevering', 'materialer', 'oevrige', 'mails', 'dokumenter', 'oekonomi', 'opgaver', 'noter', 'aktivitet', 'dokumentation', 'fakturakladde', 'handlinger']
        const visit = async (label: string, url: string) => {
          const resp = await gotoSafe(a.page, url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await a.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const body = (await a.page.locator('body').innerText().catch(() => '')) ?? ''
          const status = resp?.status() ?? 0
          if (status >= 400) bad.push(`${label}: HTTP ${status}`)
          else if (/Der opstod en fejl/.test(body)) bad.push(`${label}: fejlgrænse`)
          else if (/^\s*404\s*$/m.test(body)) bad.push(`${label}: 404`)
        }
        for (const t of tabs) await visit(`sag/${t}`, `${base}/dashboard/orders/${caseId}?tab=${t}`)
        await visit('kunde', `${base}/dashboard/customers/${profitCustomerId}`)
        const anyOffer = ((await c.admin.from('offers').select('id').eq('customer_id', profitCustomerId).limit(1)).data ?? [])[0] as { id?: string } | undefined
        if (anyOffer?.id) await visit('tilbud', `${base}/dashboard/offers/${anyOffer.id}`)
        const anyInv = ((await c.admin.from('invoices').select('id').limit(1)).data ?? [])[0] as { id?: string } | undefined
        if (anyInv?.id) await visit('faktura', `${base}/dashboard/invoices/${anyInv.id}`)
        const anyInc = ((await c.admin.from('incoming_invoices').select('id').limit(1)).data ?? [])[0] as { id?: string } | undefined
        if (anyInc?.id) await visit('leverandørfaktura', `${base}/dashboard/incoming-invoices/${anyInc.id}`)
        out.push({ id: 'U107 fane-crawl admin (sag 14 faner + kunde/tilbud/faktura)', ok: !!caseId && bad.length === 0, note: bad.length ? bad.join(' · ') : 'ingen crash' })
      }

      // U108 mobil (375 px): montørens sider (Mine job, kalender, sagens faner) uden vandret overløb og uden crash —
      // montøren bruger telefonen
      if (want('U108') && jobCaseId) {
        const issues: string[] = []
        const m = await login(montor)
        await m.page.setViewportSize({ width: 375, height: 812 })
        const pages: Array<[string, string]> = [
          ['mine-job', '/dashboard/tasks'], ['kalender', '/dashboard/calendar'],
          ['planlaegning', `/dashboard/orders/${jobCaseId}?tab=planlaegning`], ['materialer', `/dashboard/orders/${jobCaseId}?tab=materialer`],
          ['oevrige', `/dashboard/orders/${jobCaseId}?tab=oevrige`], ['dokumentation', `/dashboard/orders/${jobCaseId}?tab=dokumentation`],
          ['aflevering', `/dashboard/orders/${jobCaseId}?tab=aflevering`], ['overblik', `/dashboard/orders/${jobCaseId}?tab=overblik`],
        ]
        for (const [label, path] of pages) {
          await gotoSafe(m.page, `${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await m.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const body = (await m.page.locator('body').innerText().catch(() => '')) ?? ''
          if (/Der opstod en fejl/.test(body)) { issues.push(`${label}: fejlgrænse`); continue }
          const ov = await m.page.evaluate(() => {
            const w = window.innerWidth
            if (document.documentElement.scrollWidth <= w + 2) return null
            let worst: { tag: string; cls: string; right: number } | null = null
            for (const el of Array.from(document.querySelectorAll('body *'))) {
              const r = (el as HTMLElement).getBoundingClientRect()
              if (r.width === 0 || r.right <= w + 2) continue
              // kun elementer hvis forælder ikke selv er en vandret scroll-container
              const p = (el as HTMLElement).parentElement
              if (p && ['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) continue
              if (!worst || r.right > worst.right) worst = { tag: el.tagName.toLowerCase(), cls: String((el as HTMLElement).className).slice(0, 60), right: Math.round(r.right) }
            }
            return { scrollWidth: document.documentElement.scrollWidth, worst }
          }).catch(() => null)
          if (ov) issues.push(`${label}: overløb ${ov.scrollWidth}px (${ov.worst ? `${ov.worst.tag}.${ov.worst.cls}` : '?'})`)
          await m.page.screenshot({ path: join(shots, `u108-mobil-${label}.png`), fullPage: false }).catch(() => {})
        }
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U108 mobil 375px: montørens sider uden overløb/crash', ok: issues.length === 0, note: issues.length ? issues.join(' · ') : `${pages.length} sider OK` })
      }

      // U109 mobil (375 px): kundeportalen (forside, tilbud, tilbudsdetalje med linjer) uden vandret overløb og uden
      // crash — kunderne åbner portal-linket fra mail på telefonen
      if (want('U109') && profitCustomerId) {
        const issues: string[] = []
        const tok = randomBytes(32).toString('hex')
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-PM-${stamp}`, title: '[HARNESS] portal mobil med en lang titel der kunne bryde layoutet på en smal skærm',
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }]).select('id')
        u109OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u109OfferId) await c.admin.from('offer_line_items').insert([
          { offer_id: u109OfferId, position: 1, description: 'Solcellepanel 440 Wp sort/sort fuld-sort monokrystallinsk med 30 års produktgaranti', quantity: 24, unit: 'stk', unit_price: 1234.5, total: 29628, cost_price: 800 },
          { offer_id: u109OfferId, position: 2, description: 'Montage', quantity: 16, unit: 'timer', unit_price: 650, total: 10400, cost_price: 400 },
        ])
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-profit-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u109TokenId = (pt.data?.[0] as { id?: string } | undefined)?.id ?? null
        const iv = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-PMI-${stamp}`, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          due_date: new Date(Date.now() + 8 * 86400_000).toISOString().slice(0, 10), total_amount: 40028, tax_amount: 10007, final_amount: 50035 }]).select('id')
        u109InvoiceId = (iv.data?.[0] as { id?: string } | undefined)?.id ?? null
        const kctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
        const kp = await kctx.newPage()
        for (const [label, path] of [['forside', `/portal/${tok}`], ['tilbudsdetalje', `/portal/${tok}/offers/${u109OfferId}`]] as Array<[string, string]>) {
          const resp = await gotoSafe(kp, `${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await kp.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const body = (await kp.locator('body').innerText().catch(() => '')) ?? ''
          if ((resp?.status() ?? 0) >= 400) { issues.push(`${label}: HTTP ${resp?.status()}`); continue }
          if (/Der opstod en fejl|Application error/i.test(body)) { issues.push(`${label}: fejl`); continue }
          const ov = await kp.evaluate(() => (document.documentElement.scrollWidth > window.innerWidth + 2 ? document.documentElement.scrollWidth : 0)).catch(() => 0)
          if (ov) issues.push(`${label}: overløb ${ov}px`)
          await kp.screenshot({ path: join(shots, `u109-portal-mobil-${label}.png`), fullPage: true }).catch(() => {})
        }
        await kctx.close().catch(() => {})
        out.push({ id: 'U109 mobil 375px: kundeportal uden overløb/crash', ok: !!u109OfferId && !!u109TokenId && issues.length === 0, note: issues.length ? issues.join(' · ') : '2 sider OK' })
      }

      // U110 mobil (375 px): sælgerens sider (dashboard, tilbud, tilbudsdetalje, kunde, mail, leads) uden overløb/crash
      if (want('U110') && profitCustomerId) {
        const issues: string[] = []
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-SM-${stamp}`, title: '[HARNESS] salg mobil tilbud med en ret lang titel til test af layout',
          created_by: salg.id, customer_id: profitCustomerId, status: 'draft' }]).select('id')
        u110OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u110OfferId) await c.admin.from('offer_line_items').insert([{ offer_id: u110OfferId, position: 1, description: 'Hybrid-inverter 10 kW trefaset med batteritilslutning og app-overvågning', quantity: 1, unit: 'stk', unit_price: 18999, total: 18999, cost_price: 12000 }])
        const s = await login(salg)
        await s.page.setViewportSize({ width: 375, height: 812 })
        for (const [label, path] of [['dashboard', '/dashboard'], ['tilbud', '/dashboard/offers'], ['tilbudsdetalje', `/dashboard/offers/${u110OfferId}`],
          ['kunde', `/dashboard/customers/${profitCustomerId}`], ['mail', '/dashboard/mail'], ['leads', '/dashboard/leads']] as Array<[string, string]>) {
          await gotoSafe(s.page, `${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await s.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
          const body = (await s.page.locator('body').innerText().catch(() => '')) ?? ''
          if (/Der opstod en fejl/.test(body)) { issues.push(`${label}: fejlgrænse`); continue }
          const ov = await s.page.evaluate(() => {
            const w = window.innerWidth
            if (document.documentElement.scrollWidth <= w + 2) return null
            let worst: { tag: string; cls: string; right: number } | null = null
            for (const el of Array.from(document.querySelectorAll('body *'))) {
              const r = (el as HTMLElement).getBoundingClientRect()
              if (r.width === 0 || r.right <= w + 2) continue
              const p = (el as HTMLElement).parentElement
              if (p && ['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX)) continue
              if (!worst || r.right > worst.right) worst = { tag: el.tagName.toLowerCase(), cls: String((el as HTMLElement).className).slice(0, 70), right: Math.round(r.right) }
            }
            return { scrollWidth: document.documentElement.scrollWidth, worst }
          }).catch(() => null)
          if (ov) issues.push(`${label}: overløb ${ov.scrollWidth}px (${ov.worst ? `${ov.worst.tag}.${ov.worst.cls}` : '?'})`)
          await s.page.screenshot({ path: join(shots, `u110-salg-mobil-${label}.png`), fullPage: false }).catch(() => {})
        }
        await s.ctx.close().catch(() => {})
        out.push({ id: 'U110 mobil 375px: sælgerens sider uden overløb/crash', ok: !!u110OfferId && issues.length === 0, note: issues.length ? issues.join(' · ') : '6 sider OK' })
      }

      // U111 N57: leverandørsøgning på tilbud markerer forældede priser (> 60 dage) — frisk pris uden markering
      if (want('U111') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U111 grossist ${stamp}`, code: `HU111${stamp}`, is_active: true }]).select('id')
        u111SupplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (u111SupplierId) {
          await c.admin.from('supplier_products').insert([
            { supplier_id: u111SupplierId, supplier_sku: `H111-${stamp}-G`, supplier_name: `Harness U111 gammel ${stamp}`, cost_price: 50, unit: 'stk', is_available: true, updated_at: '2026-01-15T10:00:00Z' },
            { supplier_id: u111SupplierId, supplier_sku: `H111-${stamp}-F`, supplier_name: `Harness U111 frisk ${stamp}`, cost_price: 60, unit: 'stk', is_available: true },
          ])
        }
        const oldRow = (await c.admin.from('supplier_products').select('updated_at').eq('supplier_sku', `H111-${stamp}-G`).maybeSingle()).data as { updated_at?: string } | null
        r.seed_gammel_dato = (oldRow?.updated_at ?? '').startsWith('2026-01-15')
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-ST-${stamp}`, title: `[HARNESS] forældet pris ${stamp}`, customer_id: profitCustomerId, status: 'draft', created_by: adminUser.id }]).select('id')
        u111OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/offers/${u111OfferId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByRole('button', { name: /Fra leverandør/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByPlaceholder(/Indtast varenummer eller produktnavn/).fill(`H111-${stamp}`).catch(() => {})
        await a.page.getByText(`Harness U111 gammel ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const oldItem = a.page.locator('div', { has: a.page.getByText(`Harness U111 gammel ${stamp}`, { exact: true }) }).last()
        const freshItem = a.page.locator('div', { has: a.page.getByText(`Harness U111 frisk ${stamp}`, { exact: true }) }).last()
        r.gammel_markeret = (await oldItem.getByTestId('supplier-price-stale').count()) > 0
        r.frisk_umarkeret = (await freshItem.getByText(`Harness U111 frisk ${stamp}`).count()) > 0 && (await freshItem.getByTestId('supplier-price-stale').count()) === 0
        out.push({ id: 'U111 N57 forældede leverandørpriser markeres', ok: !!u111OfferId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U112 N58: sag der står som "Ny" med udført job → forslag "Sæt til I gang" → status in_progress; sag uden arbejde
      // får intet forslag
      if (want('U112') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (title: string) => {
          const sc = await c.admin.from('service_cases').insert([{ title, customer_id: profitCustomerId, status: 'new', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
          const id = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) listCaseIds.push(id)
          return id
        }
        const withWork = await mk(`[HARNESS] ny med arbejde ${stamp}`)
        const empty = await mk(`[HARNESS] ny uden arbejde ${stamp}`)
        if (withWork) await c.admin.from('work_orders').insert([{ case_id: withWork, title: `[HARNESS] udført ${stamp}`, status: 'done', completed_at: new Date().toISOString() }])
        await gotoSafe(a.page, `${base}/dashboard/orders/${withWork}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const hint = a.page.getByTestId('case-start-hint')
        await hint.waitFor({ timeout: 60_000 }).catch(() => {})
        r.forslag_vist = /1 job startet\/udført/.test((await hint.textContent().catch(() => '')) ?? '')
        await a.page.getByTestId('case-start-now').click({ timeout: 30_000 }).catch(() => {})
        let st = ''
        for (let i = 0; i < 15 && st !== 'in_progress'; i++) {
          await new Promise((res) => setTimeout(res, 1000))
          st = ((await c.admin.from('service_cases').select('status').eq('id', withWork ?? '').maybeSingle()).data as { status?: string } | null)?.status ?? ''
        }
        r.status_i_gang = st === 'in_progress'
        await gotoSafe(a.page, `${base}/dashboard/orders/${empty}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1500)
        r.intet_forslag_uden_arbejde = (await a.page.getByTestId('case-start-hint').count()) === 0
        out.push({ id: 'U112 N58 Ny-sag med arbejde → Sæt til I gang', ok: !!withWork && !!empty && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U113 N59: "Markér viste som læst" i mailindbakken markerer de viste ulæste mails som læst i DB
      if (want('U113') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const nowIso = new Date().toISOString()
        const em = await c.admin.from('incoming_emails').insert([1, 2].map((n) => ({ sender_email: `ui-profit-${stamp}@harness.test`, sender_name: 'Harness Kunde',
          subject: `[HARNESS] ulæst ${n} ${stamp}`, body_text: 'test', customer_id: profitCustomerId, link_status: 'linked', received_at: nowIso, is_archived: false, is_read: false }))).select('id')
        u113EmailIds = ((em.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        await gotoSafe(a.page, `${base}/dashboard/mail`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(`[HARNESS] ulæst 1 ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.knap_vist = (await a.page.getByTestId('mail-mark-visible-read').count()) === 1
        await a.page.getByTestId('mail-mark-visible-read').click({ timeout: 30_000 }).catch(() => {})
        let unread = u113EmailIds.length
        for (let i = 0; i < 15 && unread > 0; i++) {
          await new Promise((res) => setTimeout(res, 1000))
          unread = ((await c.admin.from('incoming_emails').select('id').in('id', u113EmailIds).eq('is_read', false)).data ?? []).length
        }
        r.markeret_laest = u113EmailIds.length === 2 && unread === 0
        out.push({ id: 'U113 N59 markér viste mails som læst', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ulæste tilbage=${unread}` })
      }

      // U121 N63: uidentificeret mail → "Arkivér viste" (søgning afgrænser til testmailen) → findes under "Arkiveret" →
      // "Gendan til indbakken" sætter is_archived=false igen
      if (want('U121')) {
        const r: Record<string, boolean> = {}
        const subj = `[HARNESS] arkiv ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: `ukendt-${stamp}@harness.test`, sender_name: 'Ukendt', subject: subj, body_text: 'test',
          link_status: 'unidentified', received_at: new Date().toISOString(), is_archived: false, is_read: false }]).select('id')
        const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (id) u113EmailIds.push(id)
        r.seed = !!id
        const archived = async () => ((await c.admin.from('incoming_emails').select('is_archived').eq('id', id ?? '').maybeSingle()).data as { is_archived?: boolean } | null)?.is_archived
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=unidentified&search=${encodeURIComponent(`arkiv ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(subj).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const btn = a.page.getByTestId('mail-archive-visible')
        r.knap_viser_1 = /\(1\)/.test((await btn.textContent().catch(() => '')) ?? '')
        a.page.once('dialog', (d) => d.accept().catch(() => {}))
        await btn.click({ timeout: 30_000 }).catch(() => {})
        let arc = await archived()
        for (let i = 0; i < 15 && !arc; i++) { await a.page.waitForTimeout(1000); arc = await archived() }
        r.arkiveret = arc === true
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=archived&search=${encodeURIComponent(`arkiv ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(subj).first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('mail-unarchive').click({ timeout: 60_000 }).catch(() => {})
        arc = await archived()
        for (let i = 0; i < 15 && arc; i++) { await a.page.waitForTimeout(1000); arc = await archived() }
        r.gendannet = arc === false
        out.push({ id: 'U121 N63 arkivér viste + gendan fra Arkiveret', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U122 N67: cockpit "Henvendelser fra hjemmesiden" — ny webhenvendelse (formsubmit, uden kunde) vises og åbner mailen i
      // fanen Webhenvendelser; når der findes et lead for mailen, forsvinder den; montør ser ikke kortet
      if (want('U122')) {
        const r: Record<string, boolean> = {}
        const subj = `Ny henvendelse fra eltasolar.dk [HARNESS] ${stamp}`
        // N82: cockpittet viser navn · by fra formularen (alle emner er ens) — rækken findes på navnet
        const who = `Harness Webkunde ${stamp}`
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit', subject: subj,
          body_text: [`Navn: Harness Webkunde ${stamp}`, `Email: web-${stamp}@harness.test`, 'Telefon: 12345678', 'Adresse: Solvej 12', 'Postnummer: 4000', 'Besked: Solceller på taget'].join('\n'), link_status: 'unidentified', received_at: new Date().toISOString(), is_archived: false, is_read: false }]).select('id')
        const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (id) u113EmailIds.push(id)
        r.seed = !!id
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const list = a.page.getByTestId('cockpit-web-inquiries')
        await list.getByText(who).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.vises = /Roskilde/.test((await list.locator('li', { hasText: who }).first().textContent().catch(() => '')) ?? '')
        await list.getByText(who).first().click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL(/\/dashboard\/mail\?filter=webform/, { timeout: 60_000 }).catch(() => {})
        r.aabner_webform = a.page.url().includes('filter=webform')
        // N81: kontaktkortet øverst i mailen viser formularens felter (telefon som ring-op-link)
        await a.page.getByTestId('web-inquiry-card').waitFor({ timeout: 60_000 }).catch(() => {})
        r.kontaktkort = /12345678/.test((await a.page.getByTestId('web-inquiry-phone').textContent().catch(() => '')) ?? '')
        // N67b: "Opret lead" direkte fra cockpittet → leadet åbnes (kontaktdata fra formularen, kilde website)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('cockpit-web-inquiries').locator('li', { hasText: who }).getByTestId('cockpit-create-lead').click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForURL(/\/dashboard\/leads\/[0-9a-f-]{36}/, { timeout: 60_000 }).catch(() => {})
        const ldRow = (await c.admin.from('leads').select('id, email, source').eq('custom_fields->>source_email_id', id ?? '').maybeSingle()).data as { id: string; email: string; source: string } | null
        u122LeadId = ldRow?.id ?? null
        r.lead_oprettet = !!ldRow && ldRow.email === `web-${stamp}@harness.test` && ldRow.source === 'website' && a.page.url().includes(`/dashboard/leads/${ldRow.id}`)
        // N76: leadet viser "Oprettet fra webhenvendelse" med link direkte til mailen
        await a.page.getByTestId('lead-source-mail').waitFor({ timeout: 60_000 }).catch(() => {})
        r.lead_banner = /webhenvendelse/.test((await a.page.getByTestId('lead-source-mail').textContent().catch(() => '')) ?? '')
          && ((await a.page.getByTestId('lead-source-mail-link').getAttribute('href').catch(() => '')) ?? '').includes(`emailId=${id}`)
        // N77: "Opret kunde" fra leadet kobler webhenvendelsen til den nye kunde
        await a.page.getByTestId('lead-convert').click({ timeout: 30_000 }).catch(() => {})
        let mailCust: string | null = null
        for (let i = 0; i < 15 && !mailCust; i++) {
          await a.page.waitForTimeout(1000)
          mailCust = ((await c.admin.from('incoming_emails').select('customer_id').eq('id', id ?? '').maybeSingle()).data as { customer_id: string | null } | null)?.customer_id ?? null
        }
        if (mailCust) u115CustomerIds.push(mailCust)
        const newCust = mailCust ? (await c.admin.from('customers').select('email, billing_address, billing_postal_code, billing_city').eq('id', mailCust).maybeSingle()).data as { email: string; billing_address: string | null; billing_postal_code: string | null; billing_city: string | null } | null : null
        r.mail_koblet_til_kunde = !!newCust && newCust.email === `web-${stamp}@harness.test`
        // N78: formularens adresse følger med lead → kunde. LD-6: formularen har INGEN by → byen (Roskilde) kommer fra det
        // officielle postnummerdatasæt (by fra formularen dækkes af email-parser-city-test)
        r.adresse_paa_kunde = !!newCust && (newCust.billing_address ?? '').includes('Solvej 12') && newCust.billing_postal_code === '4000' && (newCust.billing_city ?? '').includes('Roskilde')
        if (!r.adresse_paa_kunde) console.log(`[U122] kundeadresse: ${JSON.stringify({ a: newCust?.billing_address, p: newCust?.billing_postal_code, b: newCust?.billing_city })}`)
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText('Henvendelser fra hjemmesiden').first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.vaek_med_lead = !!u122LeadId && (await a.page.getByTestId('cockpit-web-inquiries').getByText(who).count()) === 0
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_kort = (await m.page.getByText('Henvendelser fra hjemmesiden').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U122 N67 webhenvendelser i cockpittet', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U124 N73: cockpittets "Mails kræver svar" tæller kun tråde fra de seneste 14 dage — en ny ubesvaret kundetråd vises
      // i listen, en gammel (2020) ikke, men tælles i noten "+ N ældre tråde"
      if (want('U124') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (tag: string, when: string) => {
          const em = await c.admin.from('incoming_emails').insert([{ sender_email: `ui-profit-${stamp}@harness.test`, sender_name: 'Harness Kunde',
            subject: `[HARNESS] svar ${tag} ${stamp}`, body_text: 'Hvornår kommer I?', customer_id: profitCustomerId, link_status: 'linked',
            conversation_id: `harness-u124-${tag}-${stamp}`, received_at: when, is_archived: false, is_read: true }]).select('id')
          const id = (em.data?.[0] as { id?: string } | undefined)?.id
          if (id) u113EmailIds.push(id)
          return id
        }
        r.seed = !!(await mk('ny', new Date().toISOString())) && !!(await mk('gammel', '2020-01-15T09:00:00Z'))
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(`[HARNESS] svar ny ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.ny_vises = (await a.page.getByText(`[HARNESS] svar ny ${stamp}`).count()) > 0
        r.gammel_ikke_i_listen = (await a.page.getByText(`[HARNESS] svar gammel ${stamp}`).count()) === 0
        r.note_aeldre = /ældre tråd/.test((await a.page.getByTestId('cockpit-mails-older').textContent().catch(() => '')) ?? '')
        out.push({ id: 'U124 N73 kræver svar: kun seneste 14 dage', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U129 N84: "Opret som ny kunde" på en webhenvendelse foreslår kunden fra formularen (B), ikke FormSubmit som betaler
      if (want('U129')) {
        const r: Record<string, boolean> = {}
        const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit',
          subject: `Ny henvendelse fra eltasolar.dk [HARNESS] U129 ${stamp}`,
          body_text: [`Navn: Harness Formkunde ${stamp}`, `Email: form-${stamp}@harness.test`, 'Telefon: 87654321', 'Besked: Ladestander'].join('\n'),
          link_status: 'unidentified', received_at: new Date().toISOString(), is_archived: false, is_read: true }]).select('id')
        const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (id) u113EmailIds.push(id)
        r.seed = !!id
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=webform&emailId=${id}`, { waitUntil: 'networkidle', timeout: 120_000 })
        // N85: listen har ingen brødtekst — den hentes ved åbning (her via deeplink) og vises
        await a.page.getByText('Besked: Ladestander').first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.broedtekst_hentet = (await a.page.getByText('Besked: Ladestander').count()) > 0 && (await a.page.getByTestId('mail-body-loading').count()) === 0
        // N96: listen viser navnet fra formularen i stedet for afsenderen "FormSubmit"
        r.liste_viser_navn = (await a.page.getByTestId('mail-row-web-contact').filter({ hasText: `Harness Formkunde ${stamp}` }).count()) > 0
        await a.page.getByRole('button', { name: /Opret som ny kunde/ }).first().click({ timeout: 60_000 }).catch(() => {})
        const bodyOnly = a.page.locator('input[name="create-mode"][value="body_only"]')
        await bodyOnly.waitFor({ timeout: 30_000 }).catch(() => {})
        r.standard_fra_formular = await bodyOnly.isChecked().catch(() => false)
        r.ikke_formsubmit_betaler = !(await a.page.locator('input[name="create-mode"][value="payer_plus_site"]').isChecked().catch(() => true))
        out.push({ id: 'U129 N84 webhenvendelse → kunde fra formularen', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U130 N86: "Opret leads for alle" — henvendelse med e-mail får et lead, en uden læsbar e-mail springes over
      if (want('U130')) {
        const r: Record<string, boolean> = {}
        const mk = async (tag: string, lines: string[], html?: string) => {
          const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit',
            subject: `Ny henvendelse fra eltasolar.dk [HARNESS] U130 ${tag} ${stamp}`, body_text: html ? null : lines.join(String.fromCharCode(10)), body_html: html ?? null,
            link_status: 'unidentified', received_at: new Date().toISOString(), is_archived: false, is_read: false }]).select('id')
          const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) u113EmailIds.push(id)
          return id
        }
        // N92/N93: realistisk FormSubmit-HTML (cellerne havner på samme linje i parserens tekst) med type + besked
        const fsRows = [['name', `Bulk Kunde ${stamp}`], ['phone', '11223344'], ['email', `bulk-${stamp}@harness.test`], ['inquiry_type', 'Solceller'], ['message', 'Ring gerne efter kl 16']]
        const fsHtml = ["<p>Here's what they had to say</p>", '<table>', '<tr><th>Name</th><th>Value</th></tr>',
          ...fsRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`), '</table>'].join(String.fromCharCode(10))
        const withMail = await mk('med', [], fsHtml)
        const noMail = await mk('uden', [`Navn: Uden Mail ${stamp}`, 'Telefon: 55667788'])
        r.seed = !!withMail && !!noMail
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        a.page.once('dialog', (d) => d.accept().catch(() => {}))
        await a.page.getByTestId('cockpit-bulk-leads').click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('cockpit-bulk-leads-result').waitFor({ timeout: 90_000 }).catch(() => {})
        r.resultat_vist = /oprettet/.test((await a.page.getByTestId('cockpit-bulk-leads-result').textContent().catch(() => '')) ?? '')
        const lA = ((await c.admin.from('leads').select('id, email, contact_person, notes').eq('custom_fields->>source_email_id', withMail ?? '')).data ?? []) as Array<{ id: string; email: string; contact_person: string; notes: string | null }>
        const lB = ((await c.admin.from('leads').select('id').eq('custom_fields->>source_email_id', noMail ?? '')).data ?? []) as Array<{ id: string }>
        u128LeadIds.push(...lA.map((x) => x.id), ...lB.map((x) => x.id))
        r.lead_med_mail = lA.length === 1 && lA[0].email === `bulk-${stamp}@harness.test`
        r.navn_fra_html_tabel = lA[0]?.contact_person === `Bulk Kunde ${stamp}`
        r.noter_type_besked = /Type: Solceller/.test(lA[0]?.notes ?? '') && /Besked: Ring gerne efter kl 16/.test(lA[0]?.notes ?? '')
        // N94: leadlisten viser type · besked under kontakten
        await gotoSafe(a.page, `${base}/dashboard/leads?search=${encodeURIComponent(`Bulk Kunde ${stamp}`)}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('lead-row-inquiry').first().waitFor({ timeout: 30_000 }).catch(() => {})
        r.liste_viser_henvendelse = /Type: Solceller · Besked: Ring gerne/.test((await a.page.getByTestId('lead-row-inquiry').first().textContent().catch(() => '')) ?? '')
        r.uden_mail_sprunget_over = lB.length === 0
        out.push({ id: 'U130 N86 opret leads for alle webhenvendelser', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U132 N88: ukoblet privatmail med telefon i signaturen viser "Kontaktdata i mailen"; en kundekoblet mail gør ikke
      if (want('U132') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (tag: string, customerId: string | null) => {
          const em = await c.admin.from('incoming_emails').insert([{ sender_email: `privat-${tag}-${stamp}@gmail.com`, sender_name: 'Privat',
            subject: `[HARNESS] U132 ${tag} ${stamp}`, body_text: ['Hej, kan I sætte solceller op?', '', 'Mvh Hans Hansen', 'Tlf: 12 34 56 78'].join(String.fromCharCode(10)),
            link_status: customerId ? 'linked' : 'unidentified', customer_id: customerId, received_at: new Date().toISOString(), is_archived: false, is_read: true }]).select('id')
          const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) u113EmailIds.push(id)
          return id
        }
        const loose = await mk('ukoblet', null)
        const linked = await mk('koblet', profitCustomerId)
        r.seed = !!loose && !!linked
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=all&emailId=${loose}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('web-inquiry-card').waitFor({ timeout: 30_000 }).catch(() => {})
        const txt = (await a.page.getByTestId('web-inquiry-card').textContent().catch(() => '')) ?? ''
        r.kort_ukoblet = /Kontaktdata i mailen/.test(txt) && /12 34 56 78|12345678/.test(txt)
        await gotoSafe(a.page, `${base}/dashboard/mail?filter=all&emailId=${linked}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByText(`[HARNESS] U132 koblet ${stamp}`).first().waitFor({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForTimeout(1500)
        r.intet_kort_koblet = (await a.page.getByTestId('web-inquiry-card').count()) === 0
        out.push({ id: 'U132 N88 kontaktdata-kort på ukoblede mails', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${txt.slice(0, 80)}` })
      }

      // U133 N95: webhenvendelse fra en eksisterende kunde (samme e-mail) vises "findes som kunde" + "Kobl til kunde" i
      // cockpittet; "Opret leads for alle" kobler en anden sådan henvendelse til kunden i stedet for at oprette et lead
      if (want('U133')) {
        const r: Record<string, boolean> = {}
        const custEmail = `kunde95-${stamp}@harness.test`
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-95-${stamp}`, company_name: `[HARNESS] eksisterende ${stamp}`, contact_person: 'E',
          email: custEmail, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (custId) u115CustomerIds.push(custId)
        const mk = async (tag: string) => {
          const rows = [['name', `Eksisterende ${tag} ${stamp}`], ['phone', '99887766'], ['email', custEmail], ['message', 'Igen']]
          const html = ["<p>Here's what they had to say</p>", '<table>', '<tr><th>Name</th><th>Value</th></tr>', ...rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`), '</table>'].join(String.fromCharCode(10))
          const em = await c.admin.from('incoming_emails').insert([{ sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit',
            subject: `Ny henvendelse fra eltasolar.dk [HARNESS] U133 ${tag} ${stamp}`, body_html: html, link_status: 'unidentified',
            received_at: new Date().toISOString(), is_archived: false, is_read: false }]).select('id')
          const id = (em.data?.[0] as { id?: string } | undefined)?.id ?? null
          if (id) u113EmailIds.push(id)
          return id
        }
        const viaCard = await mk('kort')
        const viaBulk = await mk('bulk')
        // knappen vises kun ved > 1 åben henvendelse — efter kort-koblingen skal der stadig være 2 (før afhang testen af
        // efterladte henvendelser på staging)
        const viaBulk2 = await mk('bulk2')
        r.seed = !!custId && !!viaCard && !!viaBulk && !!viaBulk2
        const mailCustomer = async (id: string | null) => ((await c.admin.from('incoming_emails').select('customer_id').eq('id', id ?? '').maybeSingle()).data as { customer_id: string | null } | null)?.customer_id ?? null
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const row = a.page.getByTestId('cockpit-web-inquiries').locator('li', { hasText: `Eksisterende kort ${stamp}` }).first()
        await row.waitFor({ timeout: 60_000 }).catch(() => {})
        r.vist_som_kunde = (await row.getByTestId('cockpit-web-existing').count()) === 1
        await row.getByTestId('cockpit-link-customer').click({ timeout: 30_000 }).catch(() => {})
        let linked: string | null = null
        for (let i = 0; i < 15 && !linked; i++) { await a.page.waitForTimeout(1000); linked = await mailCustomer(viaCard) }
        r.kort_kobler = linked === custId
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        a.page.once('dialog', (d) => d.accept().catch(() => {}))
        await a.page.getByTestId('cockpit-bulk-leads').click({ timeout: 60_000 }).catch(() => {})
        await a.page.getByTestId('cockpit-bulk-leads-result').waitFor({ timeout: 90_000 }).catch(() => {})
        r.bulk_kobler = (await mailCustomer(viaBulk)) === custId
        const leads = ((await c.admin.from('leads').select('id').eq('custom_fields->>source_email_id', viaBulk ?? '')).data ?? []) as Array<{ id: string }>
        u128LeadIds.push(...leads.map((x) => x.id))
        r.intet_lead_for_kunde = leads.length === 0
        r.resultat_naevner_kobling = /koblet til eksisterende kunde/.test((await a.page.getByTestId('cockpit-bulk-leads-result').textContent().catch(() => '')) ?? '')
        out.push({ id: 'U133 N95 henvendelse fra eksisterende kunde → kobl', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U134 Q10 sikkerhed (S1): kundeportalens sider sendte HELE company_settings-rækken (select '*' via admin) i sidens
      // RSC-data → SMTP-adgangskode/SMS-nøgler synlige for enhver med et portallink. Kun portal-kolonner nu. Plus:
      // /api/admin/setup-db kunne kaldes af alle med headeren x-internal-call (kørte DDL der genskabte en anon-policy).
      if (want('U134') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tok = randomBytes(32).toString('hex')
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-SEC-${stamp}`, title: '[HARNESS] U134 portal-sikkerhed',
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString(),
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }]).select('id')
        u134OfferId = (off.data?.[0] as { id?: string } | undefined)?.id ?? null
        const pt = await c.admin.from('portal_access_tokens').insert([{ customer_id: profitCustomerId, token: tok, email: `ui-sec-${stamp}@harness.test`,
          created_by: adminUser.id, is_active: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
        u134TokenId = (pt.data?.[0] as { id?: string } | undefined)?.id ?? null
        const secretKeys = ['smtp_password', 'sms_gateway_api_key', 'sms_gateway_secret', 'smtp_user', 'time_cost_rate', 'bank_account']
        const leaks: string[] = []
        for (const [label, path] of [['forside', `/portal/${tok}`], ['tilbud', `/portal/${tok}/offers/${u134OfferId}`]] as Array<[string, string]>) {
          const res = await fetch(`${base}${path}`, { redirect: 'manual' })
          const html = await res.text()
          r[`${label}_200`] = res.status === 200
          // positiv kontrol: portal-indstillingerne er stadig med i siden (valuta/momssats bruges af komponenterne)
          r[`${label}_har_portalfelter`] = html.includes('default_currency')
          for (const k of secretKeys) if (html.includes(k)) leaks.push(`${label}:${k}`)
        }
        r.ingen_hemmelige_felter = leaks.length === 0
        const bypass = await fetch(`${base}/api/admin/setup-db`, { method: 'POST', headers: { 'x-internal-call': 'true' } })
        r.setup_db_header_afvist = bypass.status === 401
        r.setup_db_get_kraever_secret = (await fetch(`${base}/api/admin/setup-db`)).status === 401
        // PDF-ruterne var åbne (forfalsket fuldmagt/rapport + <Image src=URL> → SSRF): nu kun interne kald
        const pdfBody = (b: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
        r.fuldmagt_pdf_lukket = (await fetch(`${base}/api/fuldmagt/pdf`, pdfBody({ customer_name: 'X', date: '2026-10-04', signature_data: 'http://127.0.0.1/' }))).status === 401
        r.besigtigelse_pdf_lukket = (await fetch(`${base}/api/besigtigelse/pdf`, pdfBody({ customer: { customer_number: 'X' }, formData: {}, date: '2026-10-04', images: [] }))).status === 401
        // Q10 lave: vejr-proxy kun for indloggede; migrate-roles timing-safe/fail-closed; kladde-tilbud ikke via UUID
        r.vejr_kraever_login = (await fetch(`${base}/api/weather?lat=55.6&lon=12.5`, { redirect: 'manual' })).status !== 200
        r.migrate_roles_lukket = [401, 404].includes((await fetch(`${base}/api/admin/migrate-roles`, { method: 'POST', headers: { Authorization: 'Bearer ' } })).status) // ruten fjernet (auth-review)
        const draft = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-SECD-${stamp}`, title: '[HARNESS] U134 kladde', created_by: adminUser.id,
          customer_id: profitCustomerId, status: 'draft' }]).select('id')
        u134DraftId = (draft.data?.[0] as { id?: string } | undefined)?.id ?? null
        const dRes = await fetch(`${base}/portal/${tok}/offers/${u134DraftId}`, { redirect: 'manual' })
        const dHtml = dRes.status === 200 ? await dRes.text() : ''
        r.kladde_ikke_i_portal = !dHtml.includes(`UI-E2E-SECD-${stamp}`)
        r.kladde_pdf_afvist = (await fetch(`${base}/api/portal/offers/pdf?token=${tok}&offerId=${u134DraftId}`)).status !== 200
        // Q13 (S1): /view-offer/<uuid> (uden login) videresendte med kundens portal-token i URL'en
        const vo = await fetch(`${base}/view-offer/${u134OfferId}`, { redirect: 'manual' })
        r.view_offer_uden_token = !(vo.headers.get('location') ?? '').includes(tok) && !(await vo.text()).includes(tok)
        // positiv kontrol: det sendte tilbud kan stadig hentes som PDF
        r.sendt_pdf_ok = (await fetch(`${base}/api/portal/offers/pdf?token=${tok}&offerId=${u134OfferId}`)).status === 200
        out.push({ id: 'U134 Q10 portal lækker ikke firmahemmeligheder + setup-db lukket', ok: !!u134TokenId && Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${leaks.length ? ` · læk: ${leaks.join(',')}` : ''}` })
      }

      // U135 kunde-review (HØJ): sletning af en kunde med tilbud slettede stille tilbud + underskrifter (ON DELETE
      // CASCADE) og efterlod fakturaer/sager uden kunde → afvises med "deaktivér i stedet"; kunde uden tilknytning slettes
      if (want('U135')) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('customers').insert([
          { customer_number: `UI-E2E-DL-${stamp}`, company_name: `[HARNESS] slet-med-tilbud ${stamp}`, contact_person: 'D', email: `dl-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
          { customer_number: `UI-E2E-DF-${stamp}`, company_name: `[HARNESS] slet-fri ${stamp}`, contact_person: 'F', email: `df-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
        ]).select('id, customer_number')
        const rows = (ins.data ?? []) as Array<{ id: string; customer_number: string }>
        const withOffer = rows.find((x) => x.customer_number.startsWith('UI-E2E-DL'))?.id ?? null
        const free = rows.find((x) => x.customer_number.startsWith('UI-E2E-DF'))?.id ?? null
        u115CustomerIds.push(...rows.map((x) => x.id))
        const off = withOffer ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-DLO-${stamp}`, title: '[HARNESS] U135', created_by: adminUser.id, customer_id: withOffer, status: 'sent' }]).select('id') : null
        const offerId = (off?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!withOffer && !!free && !!offerId
        const tryDelete = async (id: string) => {
          await gotoSafe(a.page, `${base}/dashboard/customers/${id}`, { waitUntil: 'networkidle', timeout: 120_000 })
          // knappen har aria-label "Slet kunde" (NEXT-11) — fast testid i stedet for tekst
          // HT-1 (2026-10-16): vent på knap og dialog (før fast 2,5 s → flaky ved langsom indlæsning)
          await a.page.getByTestId('customer-delete').first().waitFor({ timeout: 60_000 }).catch(() => {})
          await a.page.getByTestId('customer-delete').first().click({ timeout: 60_000 }).catch(() => {})
          const dlg = a.page.getByRole('alertdialog')
          await dlg.waitFor({ timeout: 30_000 }).catch(() => {})
          await dlg.getByRole('button', { name: /^Slet$/ }).click({ timeout: 30_000 }).catch(() => {})
          await dlg.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
          await a.page.waitForLoadState('networkidle').catch(() => {})
        }
        if (withOffer) {
          await tryDelete(withOffer)
          await a.page.getByText(/kan ikke slettes — deaktivér kunden i stedet/).first().waitFor({ timeout: 30_000 }).catch(() => {})
          r.afvist_med_besked = (await a.page.getByText(/kan ikke slettes — deaktivér kunden i stedet/).count()) > 0
          r.kunde_bevaret = !!(await c.admin.from('customers').select('id').eq('id', withOffer).maybeSingle()).data
          r.tilbud_bevaret = !!offerId && !!(await c.admin.from('offers').select('id').eq('id', offerId).maybeSingle()).data
        }
        if (free) {
          await tryDelete(free)
          let gone = false
          for (let i = 0; i < 20 && !gone; i++) {
            gone = !(await c.admin.from('customers').select('id').eq('id', free).maybeSingle()).data
            if (!gone) await a.page.waitForTimeout(500)
          }
          r.fri_kunde_slettet = gone
        }
        if (offerId) await c.admin.from('offers').delete().eq('id', offerId)
        out.push({ id: 'U135 kunde med tilbud kan ikke slettes (cascade)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U136 kunde-review: kunde- og lead-eksport fejlede ALTID (kolonnerne billing_zip og leads.description findes ikke)
      // → CSV med postnr. og leadets noter
      if (want('U136')) {
        const r: Record<string, boolean> = {}
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-EX-${stamp}`, company_name: `[HARNESS] eksport ${stamp}`, contact_person: 'E',
          email: `ex-${stamp}@harness.test`, billing_postal_code: '8999', created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const cuId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (cuId) u115CustomerIds.push(cuId)
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] lead-eksport ${stamp}`, contact_person: 'L', email: `lx-${stamp}@harness.test`,
          status: 'new', source: 'website', notes: `Noter ${stamp}`, created_by: adminUser.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (leadId) u128LeadIds.push(leadId)
        const grab = async (path: string, label: string) => {
          await gotoSafe(a.page, `${base}${path}`, { waitUntil: 'networkidle', timeout: 120_000 })
          const dl = a.page.waitForEvent('download', { timeout: 60_000 }).catch(() => null)
          await a.page.getByRole('button', { name: label }).first().click({ timeout: 60_000 }).catch(() => {})
          const d = await dl
          const fp = d ? await d.path().catch(() => null) : null
          return fp ? readFileSync(fp, 'utf8') : ''
        }
        const csvC = await grab(`/dashboard/customers?search=${stamp}`, 'Eksportér kunder')
        r.kunde_csv = csvC.includes(`[HARNESS] eksport ${stamp}`) && csvC.includes('8999')
        const csvL = await grab(`/dashboard/leads?search=${stamp}`, 'Eksportér leads')
        r.lead_csv = csvL.includes(`[HARNESS] lead-eksport ${stamp}`) && csvL.includes(`Noter ${stamp}`)
        // RX-9: tilbudseksporten angiver moms tydeligt (ekskl./moms/inkl.)
        const of = profitCustomerId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-EXO-${stamp}`, title: `[HARNESS] tilbud-eksport ${stamp}`,
          created_by: adminUser.id, customer_id: profitCustomerId, status: 'sent', total_amount: 1000, discount_amount: 0, tax_amount: 250, final_amount: 1250 }]).select('id') : null
        const ofId = (of?.data?.[0] as { id?: string } | undefined)?.id ?? null
        try {
          const csvO = ofId ? await grab(`/dashboard/offers?search=${stamp}`, 'Eksportér tilbud') : ''
          r.tilbud_csv_moms = csvO.includes(`[HARNESS] tilbud-eksport ${stamp}`) && csvO.includes('Slutbeløb inkl. moms (DKK)') && csvO.includes('Moms (DKK)')
        } finally { if (ofId) await c.admin.from('offers').delete().eq('id', ofId) }
        out.push({ id: 'U136 kunde-/lead-eksport virker (rigtige kolonner)', ok: !!cuId && !!leadId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U137 auth-review (HØJ): en bruger kunne sætte sit eget avatar_storage_path (via updateProfile eller REST) til en
      // vilkårlig fil i attachments — profilsiden signerede den med admin-klienten → læsning af enhver fil. Kun
      // avatars/<eget id>- signeres nu. (Stien sættes her via admin = det et direkte REST-kald kan i dag.)
      if (want('U137')) {
        const r: Record<string, boolean> = {}
        const foreign = `customer-documents/u137-${stamp}/fremmed.txt`
        const up = await c.admin.storage.from('attachments').upload(foreign, new Blob([`[HARNESS] U137 ${stamp}`], { type: 'text/plain' }), { upsert: true })
        r.seed = !up.error
        await c.admin.from('profiles').update({ avatar_storage_path: foreign }).eq('id', montor.id)
        try {
          const m = await login(montor)
          await gotoSafe(m.page, `${base}/dashboard/settings/profile`, { waitUntil: 'networkidle', timeout: 120_000 })
          const html = await m.page.content()
          // det farlige er en SIGNERET URL til filen (rå stiværdi i sidens data giver ingen adgang)
          r.fremmed_fil_ikke_signeret = !html.includes(`/object/sign/attachments/${foreign}`) && !html.includes(`/object/sign/attachments/${encodeURI(foreign)}`)
          r.sti_i_html = html.includes(`u137-${stamp}`) // kun info
          await m.ctx.close().catch(() => {})
        } finally {
          await c.admin.from('profiles').update({ avatar_storage_path: null }).eq('id', montor.id)
          await c.admin.storage.from('attachments').remove([foreign])
        }
        out.push({ id: 'U137 profil signerer ikke fremmede filer (avatar-sti)', ok: r.seed && r.fremmed_fil_ikke_signeret, note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U142 T6: kundens notelog — admin tilføjer en note (customer_notes, tidsstemplet, forfatter), kundens fritekst
      // "Noter" overskrives ikke; montør kan læse men ikke skrive
      if (want('U142') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        let u142Diag = ''
        const text = `U142 note ${stamp}`
        await c.admin.from('customers').update({ notes: `FRITEKST ${stamp}` }).eq('id', profitCustomerId)
        try {
          await gotoSafe(a.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          const box = a.page.getByTestId('customer-notes-timeline')
          r.notelog_vises = await box.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          if (r.notelog_vises) {
            await box.getByLabel('Ny kundenote').fill(text)
            await box.getByRole('button', { name: 'Tilføj note' }).click()
            r.note_vises = await box.locator('li', { hasText: text }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
            if (!r.note_vises) u142Diag += ` ui_fejl=${JSON.stringify(await box.locator('p.text-red-600').allInnerTexts().catch(() => []))}`
          }
          const { data: rows, error: rowsErr } = await c.admin.from('customer_notes').select('source, created_by, content').eq('customer_id', profitCustomerId)
          const row = ((rows ?? []) as Array<{ source: string; created_by: string; content: string }>).find((x) => x.content === text)
          r.gemt_som_manuel_af_admin = row?.source === 'manual' && row?.created_by === adminUser.id
          if (!r.gemt_som_manuel_af_admin) u142Diag = JSON.stringify({ err: rowsErr?.message ?? null, n: (rows ?? []).length, row: row ? { source: row.source, by_admin: row.created_by === adminUser.id } : null })
          const { data: cu } = await c.admin.from('customers').select('notes').eq('id', profitCustomerId).single()
          r.fritekst_uroert = (cu as { notes: string }).notes === `FRITEKST ${stamp}`
          const mo = await login(montor)
          await gotoSafe(mo.page, `${base}/dashboard/customers/${profitCustomerId}`, { waitUntil: 'networkidle', timeout: 120_000 })
          const mbox = mo.page.getByTestId('customer-notes-timeline')
          const seen = await mbox.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
          r.montor_laeser_ikke_skriver = seen && (await mbox.getByText(text).count()) > 0 && (await mbox.getByLabel('Ny kundenote').count()) === 0 && (await mbox.getByLabel('Slet note').count()) === 0
          await mo.ctx.close().catch(() => {})
        } finally {
          await c.admin.from('customer_notes').delete().eq('customer_id', profitCustomerId)
        }
        out.push({ id: 'U142 kundens notelog (tidsstemplet, fritekst urørt, montør kun læse)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') + (u142Diag ? ` diag=${u142Diag}` : '') })
      }

      // U144 Mine påmindelser i CRM-kalenderen (månedsvisning ⏰ + dagspanel); andre brugere ser dem ikke
      if (want('U144')) {
        const r: Record<string, boolean> = {}
        const title = `U144 påmindelse ${stamp}`
        const { copenhagenParts: cph2, copenhagenLocalToIso: toIso2 } = await import('../../src/lib/utils/copenhagen-time')
        const day = cph2(new Date()).date
        const ins = await c.admin.from('personal_reminders').insert({ owner_id: adminUser.id, title, due_at: toIso2(day, '23:00'), reminder_at: toIso2(day, '23:00'), source: 'manual' }).select('id').single()
        r.seed = !ins.error
        try {
          await gotoSafe(a.page, `${base}/dashboard/calendar?view=month`, { waitUntil: 'networkidle', timeout: 120_000 })
          const chip = a.page.locator(`[data-testid="calendar-personal-reminder"][title="Min påmindelse: ${title}"]`).first()
          r.chip_vises = await chip.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          if (r.chip_vises) {
            await chip.click()
            r.dagspanel_viser = await a.page.getByTestId('calendar-day-reminders').getByText(title).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
          }
          const mo = await login(montor)
          await gotoSafe(mo.page, `${base}/dashboard/calendar?view=month`, { waitUntil: 'networkidle', timeout: 120_000 })
          await mo.page.waitForTimeout(1_500)
          r.montor_ser_ikke = (await mo.page.getByText(title).count()) === 0
          await mo.ctx.close().catch(() => {})
        } finally {
          await c.admin.from('personal_reminders').delete().eq('title', title)
        }
        out.push({ id: 'U144 Mine påmindelser i kalenderen (kun ejer)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U143 Mine påmindelser (00197): opret, ret tidspunkt, udsæt, udført — og kun ejeren ser dem
      if (want('U143')) {
        const r: Record<string, boolean> = {}
        const title = `U143 husk ${stamp}`
        try {
          await gotoSafe(a.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 120_000 })
          const card = a.page.getByTestId('personal-reminders')
          r.kort_vises = await card.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          if (r.kort_vises) {
            await card.getByLabel('Påmindelse').fill(title)
            await card.getByLabel('Klokkeslæt').fill('09:00')
            await card.getByRole('button', { name: 'Tilføj' }).click()
            const row = card.getByTestId('personal-reminder-row').filter({ hasText: title })
            r.oprettet = await row.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
            const get = async () => ((await c.admin.from('personal_reminders').select('id, owner_id, due_at, reminder_at, status').eq('title', title).maybeSingle()).data as { id: string; owner_id: string; due_at: string; reminder_at: string; status: string } | null)
            const v1 = await get()
            r.ejer_admin_kl_9_dansk = v1?.owner_id === adminUser.id && new Date(v1.due_at).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }) === '09.00'
            if (r.oprettet) {
              await row.getByRole('button', { name: 'Ret tidspunkt' }).click()
              await row.getByLabel('Nyt klokkeslæt').fill('14:30')
              await row.getByRole('button', { name: 'Gem tidspunkt' }).click()
              await a.page.waitForTimeout(2_000)
              const v2 = await get()
              r.tidspunkt_rettet_og_paamindelse_fulgt = !!v2 && new Date(v2.due_at).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }) === '14.30' && v2.reminder_at === v2.due_at
              const before = Date.now()
              await row.getByRole('button', { name: 'Udsæt' }).click()
              await a.page.waitForTimeout(2_000)
              const v3 = await get()
              r.udsat_en_time = !!v3 && Math.abs(new Date(v3.reminder_at).getTime() - (before + 3_600_000)) < 120_000
              const mo = await login(montor)
              await gotoSafe(mo.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 120_000 })
              await mo.page.waitForTimeout(1_500)
              r.montor_ser_den_ikke = (await mo.page.getByText(title).count()) === 0
              await mo.ctx.close().catch(() => {})
              await row.getByRole('button', { name: 'Udført' }).click()
              await a.page.waitForTimeout(2_000)
              r.udfoert = (await get())?.status === 'done'
            }
          }
        } finally {
          await c.admin.from('personal_reminders').delete().eq('title', title)
        }
        out.push({ id: 'U143 Mine påmindelser (opret/ret/udsæt/udført, kun ejer)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U141 T10: "Forbind Telegram" på profilen — admin får en engangskode (/start <kode>, kun hash gemmes), montør ser
      // ikke kortet (fase 1 kun kontorroller)
      if (want('U141')) {
        const r: Record<string, boolean> = {}
        try {
          await gotoSafe(a.page, `${base}/dashboard/settings/profile`, { waitUntil: 'networkidle', timeout: 120_000 })
          const card = a.page.getByTestId('telegram-link-card')
          r.admin_ser_kort = await card.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          if (r.admin_ser_kort) {
            await card.getByRole('button', { name: 'Forbind Telegram' }).click({ timeout: 30_000 })
            const codeEl = card.locator('span.font-mono').first()
            const txt = await codeEl.waitFor({ timeout: 30_000 }).then(() => codeEl.innerText()).catch(() => '')
            const m = txt.match(/^\/start ([A-Z2-9]{8})$/)
            r.kode_vises = !!m
            const { data: row } = await c.admin.from('assistant_links').select('link_code_hash, telegram_chat_id').eq('profile_id', adminUser.id).maybeSingle()
            const lr = row as { link_code_hash: string | null; telegram_chat_id: number | null } | null
            r.kun_hash_gemt = !!m && !!lr?.link_code_hash && lr.link_code_hash !== m[1] && lr.link_code_hash.length === 64
          }
          const mo = await login(montor)
          await gotoSafe(mo.page, `${base}/dashboard/settings/profile`, { waitUntil: 'networkidle', timeout: 120_000 })
          await mo.page.waitForTimeout(1_500)
          r.montor_ser_ikke_kort = (await mo.page.getByTestId('telegram-link-card').count()) === 0
          await mo.ctx.close().catch(() => {})
        } finally {
          await c.admin.from('assistant_links').delete().eq('profile_id', adminUser.id)
        }
        out.push({ id: 'U141 Forbind Telegram (engangskode, kun hash; montør ser ikke)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U140 T2: opkald oprettet via ELTA Assistant vises i CRM-kalenderens månedsvisning (📞) på den DANSKE dato —
      // kl. 00:30 dansk tid lå før på dagen før (UTC-dato)
      if (want('U140') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const { copenhagenParts: cph, copenhagenLocalToIso } = await import('../../src/lib/utils/copenhagen-time')
        const today = cph(new Date()).date
        const tomorrow = cph(new Date(Date.now() + 86_400_000)).date
        const day = tomorrow.slice(0, 7) === today.slice(0, 7) ? tomorrow : today
        const title = `Ring til U140 ${stamp}`
        const ins = await c.admin.from('customer_tasks').insert({ customer_id: profitCustomerId, title, status: 'pending', priority: 'normal', assigned_to: adminUser.id, created_by: adminUser.id, due_date: copenhagenLocalToIso(day, '00:30'), auto_rule: 'assistant_callback' }).select('id').single()
        const taskId = (ins.data as { id?: string } | null)?.id ?? null
        r.seed = !!taskId
        try {
          await gotoSafe(a.page, `${base}/dashboard/calendar?view=month`, { waitUntil: 'networkidle', timeout: 120_000 })
          const chip = a.page.locator(`div[title="${title}"]`).first()
          r.vises_med_telefon = await chip.waitFor({ timeout: 60_000 }).then(async () => (await chip.innerText()).startsWith('📞')).catch(() => false)
          if (r.vises_med_telefon) {
            await chip.click({ timeout: 30_000 })
            const expected = new Date(`${day}T12:00:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })
            r.rette_danske_dag = await a.page.getByRole('heading', { name: expected }).first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
          }
        } finally {
          if (taskId) await c.admin.from('customer_tasks').delete().eq('id', taskId)
        }
        out.push({ id: 'U140 assistent-opkald i kalenderen (📞, dansk dato)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U139 P1: selvregistrering lukket i appen — /register sender til login, og hverken forside eller login viser
      // "Opret konto" (medarbejdere oprettes kun via invitation)
      if (want('U139')) {
        const r: Record<string, boolean> = {}
        const kctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
        try {
          const p = await kctx.newPage()
          await gotoSafe(p, `${base}/register`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.register_til_login = new URL(p.url()).pathname === '/login'
          r.login_uden_opret_link = (await p.locator('a[href="/register"]').count()) === 0
          await gotoSafe(p, `${base}/`, { waitUntil: 'networkidle', timeout: 120_000 })
          r.forside_uden_opret_link = (await p.locator('a[href="/register"]').count()) === 0
        } finally {
          await kctx.close().catch(() => {})
        }
        out.push({ id: 'U139 selvregistrering lukket i appen (/register → login, ingen opret-links)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U138 00194 system_alerts: portal-hændelse ("Fuldmagt underskrevet") vises i klokken for admin, kan afvises
      // derfra (DB: is_dismissed), og montør ser den ikke
      if (want('U138')) {
        const r: Record<string, boolean> = {}
        const title = `Fuldmagt underskrevet U138 ${stamp}`
        const ins = await c.admin.from('system_alerts').insert({ alert_type: 'fuldmagt_signed', severity: 'info', title, message: 'Harness Kunde har underskrevet fuldmagten.', entity_type: 'customer' }).select('id').single()
        const alertId = (ins.data as { id?: string } | null)?.id ?? null
        r.seed = !!alertId
        try {
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          await a.page.locator('button[aria-label^="Notifikationer"]').first().click({ timeout: 60_000 })
          const item = a.page.getByText(title).first()
          r.admin_ser_i_klokken = await item.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
          if (r.admin_ser_i_klokken) {
            const row = a.page.locator('div', { has: a.page.getByText(title) }).filter({ has: a.page.locator('button[aria-label="Afvis"]') }).last()
            await row.locator('button[aria-label="Afvis"]').first().click({ timeout: 30_000 }).catch(() => {})
            let dismissed = false
            for (let i = 0; i < 20 && !dismissed; i++) {
              dismissed = !!((await c.admin.from('system_alerts').select('is_dismissed').eq('id', alertId).single()).data as { is_dismissed?: boolean } | null)?.is_dismissed
              if (!dismissed) await a.page.waitForTimeout(500)
            }
            r.afvist_i_db = dismissed
          }
          await c.admin.from('system_alerts').update({ is_dismissed: false }).eq('id', alertId)
          const m = await login(montor)
          await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          await m.page.locator('button[aria-label^="Notifikationer"]').first().click({ timeout: 60_000 }).catch(() => {})
          await m.page.waitForTimeout(2_000)
          r.montor_ser_ikke = (await m.page.getByText(title).count()) === 0
          await m.ctx.close().catch(() => {})
        } finally {
          if (alertId) await c.admin.from('system_alerts').delete().eq('id', alertId)
        }
        out.push({ id: 'U138 klokken viser portal-hændelse; afvis virker; montør ser den ikke', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U184 CR-8 (cron-review 2026-10-17): klokkens tæller er det ægte antal ulæste (ikke højst 20), og "Markér alle som
      // læst" rammer også advarsler uden for de 20 viste
      if (want('U184')) {
        const r: Record<string, boolean> = {}
        const rows = Array.from({ length: 23 }, (_, i) => ({ alert_type: 'harness_u184', severity: 'info', title: `U184 ${stamp} #${i}`, message: 'Harness', entity_type: null as string | null }))
        const ins = await c.admin.from('system_alerts').insert(rows).select('id')
        const ids = ((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id)
        r.seed = ids.length === 23
        try {
          await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
          const bell = a.page.locator('button[aria-label^="Notifikationer"]').first()
          let label = ''
          for (let i = 0; i < 20; i++) {
            label = (await bell.getAttribute('aria-label', { timeout: 30_000 }).catch(() => '')) ?? ''
            const n = Number(/\((\d+) ulæste\)/.exec(label)?.[1] ?? 0)
            if (n >= 23) break
            await a.page.waitForTimeout(1500)
          }
          r.taeller_over_20 = Number(/\((\d+) ulæste\)/.exec(label)?.[1] ?? 0) >= 23
          await bell.click({ timeout: 60_000 })
          await a.page.getByRole('button', { name: 'Markér alle som læst' }).click({ timeout: 60_000 }).catch(() => {})
          let left = -1
          for (let i = 0; i < 20 && left !== 0; i++) {
            left = ((await c.admin.from('system_alerts').select('id').in('id', ids).eq('is_read', false)).data ?? []).length
            if (left !== 0) await a.page.waitForTimeout(500)
          }
          r.alle_markeret_laest = left === 0
        } finally {
          if (ids.length) await c.admin.from('system_alerts').delete().in('id', ids)
        }
        out.push({ id: 'U184 klokke: ægte antal ulæste + markér alle (>20)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U114 Go-live-tjekliste: nye driftspunkter (portal-ulæste, mail-fakturaer uden bilag, leverandørpriser, sagsstatus)
      // vises; en ulæst kundebesked gør "portal_unread" rød
      if (want('U114') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const pm = await c.admin.from('portal_messages').insert([{ customer_id: profitCustomerId, sender_type: 'customer', sender_name: 'Kunde', message: `Go-live tjek ${stamp}` }]).select('id')
        u114MessageId = (pm.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/go-live`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('pilot-setup').waitFor({ timeout: 60_000 }).catch(() => {})
        for (const k of ['portal_unread', 'invoice_attachments', 'supplier_prices', 'case_status', 'invoice_suppliers', 'web_inquiries', 'customer_emails']) {
          r[`punkt_${k}`] = (await a.page.getByTestId(`pilot-setup-${k}`).count()) === 1
        }
        r.portal_roed = (await a.page.getByTestId('pilot-setup-portal_unread').getAttribute('data-ok').catch(() => '')) === 'nej'
        out.push({ id: 'U114 Go-live-tjekliste med driftskøer', ok: !!u114MessageId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U115 N60: kundeimport fra CSV — forhåndsvisning (1 ny, 1 findes allerede, 1 ugyldig) → import opretter kun den nye
      // med kilde-mærke og tidligere kundenr.
      if (want('U115') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const newEmail = `import-${stamp}@harness.test`
        const csv = [
          'Kundenr;Firmanavn;Kontaktperson;E-mail;Telefon;Postnr;By',
          `9${String(stamp).slice(-5)};[HARNESS] Importkunde ${stamp};Ida Import;${newEmail};;8000;Aarhus C`,
          `9${String(stamp).slice(-4)}1;[HARNESS] Findes ${stamp};;ui-profit-${stamp}@harness.test;;;`,
          `9${String(stamp).slice(-4)}2;[HARNESS] Uden mail ${stamp};;;;;`,
        ].join('\r\n')
        await gotoSafe(a.page, `${base}/dashboard/customers`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('customer-import-open').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('customer-import-input').setInputFiles({ name: `kunder-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }).catch(() => {})
        await a.page.getByTestId('customer-import-counts').waitFor({ timeout: 60_000 }).catch(() => {})
        const cnt = async (id: string) => ((await a.page.getByTestId(id).textContent().catch(() => '')) ?? '').trim()
        r.forhaandsvisning = (await cnt('import-count-new')) === '1' && (await cnt('import-count-duplicate')) === '1' && (await cnt('import-count-invalid')) === '1'
        await a.page.getByTestId('customer-import-confirm').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('customer-import-result').waitFor({ timeout: 60_000 }).catch(() => {})
        type CR = { id: string; custom_fields: Record<string, unknown> | null; contact_person: string; billing_city: string | null }
        const created = (await c.admin.from('customers').select('id, custom_fields, contact_person, billing_city').eq('email', newEmail)).data as CR[] | null
        u115CustomerIds = (created ?? []).map((x) => x.id)
        r.oprettet_en = (created ?? []).length === 1 && created?.[0]?.contact_person === 'Ida Import' && created?.[0]?.billing_city === 'Aarhus C'
        r.kilde_maerket = created?.[0]?.custom_fields?.source === 'csv-import' && typeof created?.[0]?.custom_fields?.import_customer_number === 'string'
        r.dublet_ikke_oprettet = ((await c.admin.from('customers').select('id').eq('company_name', `[HARNESS] Findes ${stamp}`)).data ?? []).length === 0
        out.push({ id: 'U115 N60 kundeimport fra CSV', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U116 N61: cockpit "Forfaldne fakturaer" — sendt faktura med forfald i 2000 (ældst → altid i top 5) vises med beløb og
      // dage over forfald og linker til fakturaen; montør (ingen invoices.view.all) ser ikke kortet
      if (want('U116') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const no = `UI-E2E-OV-${stamp}`
        const ins = await c.admin.from('invoices').insert([{ invoice_number: no, customer_id: profitCustomerId, status: 'sent',
          total_amount: 61728, tax_amount: 15432, final_amount: 77160, due_date: '2000-01-01' }]).select('id')
        u116InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!u116InvoiceId
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const list = a.page.getByTestId('cockpit-overdue-invoices')
        await list.getByText(no).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const row = list.locator('li', { hasText: no }).first()
        const txt = ((await row.innerText().catch(() => '')) ?? '')
        r.kort_viser_faktura = txt.includes('77.160') && /\d+ dage over forfald/.test(txt)
        // N89: næste rykkertrin efter cronens regler (ingen rykkere endnu, > 20 dage over → rykker 1 ved næste kørsel)
        r.naeste_rykker = /næste: rykker 1 ved næste kørsel/.test(txt)
        await row.click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL(new RegExp(`/dashboard/invoices/${u116InvoiceId}`), { timeout: 60_000 }).catch(() => {})
        r.link_faktura = a.page.url().includes(`/dashboard/invoices/${u116InvoiceId}`)
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_kort = (await m.page.getByText('Forfaldne fakturaer').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U116 N61 forfaldne fakturaer i cockpittet', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${ins.error?.message ?? ''}` })
      }

      // U117 N62: kalenderens "Job uden registreret tid" — afsluttet arbejdsordre for 59 dage siden (ældst i 60-dages-vinduet
      // → altid blandt de viste) uden timer vises med montør og "Afsluttet uden tid" og linker til sagens Planlægning-fane;
      // montør (ingen work_orders.plan) ser ikke panelet. Kræver U11 (montør-medarbejder + sag).
      if (want('U117') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] glemt tid ${stamp}`
        const d59 = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() - 59 * 86_400_000))
        const wo = await c.admin.from('work_orders').insert([{ case_id: jobCaseId, title, status: 'done', scheduled_date: d59, assigned_employee_id: jobEmployeeId }]).select('id')
        u117WorkOrderId = (wo.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!u117WorkOrderId
        await gotoSafe(a.page, `${base}/dashboard/calendar`, { waitUntil: 'networkidle', timeout: 120_000 })
        const panel = a.page.getByTestId('jobs-without-time')
        await panel.waitFor({ timeout: 60_000 }).catch(() => {})
        if ((await panel.getAttribute('open').catch(() => null)) === null) await panel.locator('summary').click().catch(() => {})
        const row = panel.locator('li', { hasText: title }).first()
        const txt = ((await row.innerText().catch(() => '')) ?? '')
        r.job_vises = txt.includes('Harness Montør') && txt.includes('Afsluttet uden tid')
        const u117Diag = r.job_vises ? '' : `panel=${await panel.count()} tekst=${((await panel.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 300)}`
        if (!r.job_vises) await a.page.screenshot({ path: join(shots, 'u117-kalender.png'), fullPage: true }).catch(() => {})
        await row.getByTestId('jobs-without-time-item').click({ timeout: 30_000 }).catch(() => {})
        await a.page.waitForURL(/tab=planlaegning/, { timeout: 60_000 }).catch(() => {})
        r.link_planlaegning = a.page.url().includes(`/dashboard/orders/${jobCaseId}`) && a.page.url().includes('tab=planlaegning')
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard/calendar`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_panel = (await m.page.getByTestId('jobs-without-time').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U117 N62 job uden registreret tid', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${wo.error?.message ?? ''} ${u117Diag}` })
      }

      // U119 N64: montørens "Mine job" påminder om eget afsluttet job (i går) uden timer; forsvinder når tid er registreret.
      // Kræver U11 (montør-medarbejder + sag).
      if (want('U119') && jobCaseId && jobEmployeeId) {
        const r: Record<string, boolean> = {}
        const title = `[HARNESS] afsluttet uden timer ${stamp}`
        const d1 = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() - 86_400_000))
        const wo = await c.admin.from('work_orders').insert([{ case_id: jobCaseId, title, status: 'done', scheduled_date: d1, assigned_employee_id: jobEmployeeId }]).select('id')
        u119WorkOrderId = (wo.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!u119WorkOrderId
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 120_000 })
        const box = m.page.getByTestId('my-jobs-no-time')
        await box.getByText(title).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.paamindelse_vist = (await box.getByText(title).count()) > 0
        const t0 = Date.now() - 26 * 3600_000
        const tl = u119WorkOrderId ? await c.admin.from('time_logs').insert([{ employee_id: jobEmployeeId, work_order_id: u119WorkOrderId,
          start_time: new Date(t0).toISOString(), end_time: new Date(t0 + 3600_000).toISOString(), billable: true, description: 'U119' }]).select('id') : null
        r.tid_seedet = !tl?.error
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 120_000 })
        await m.page.getByTestId('my-jobs-card').waitFor({ timeout: 60_000 }).catch(() => {})
        r.vaek_efter_tid = (await m.page.getByTestId('my-jobs-no-time').getByText(title).count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U119 N64 Mine job: afsluttet uden timer', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${wo.error?.message ?? ''} ${tl?.error?.message ?? ''}` })
      }

      // U118 N65: cockpittets tilbudsopfølgning viser om kunden har åbnet tilbuddet (viewed) eller ej (sent).
      // Seed oprettet 2019 → ældst → altid blandt de viste; ryddes med U100's tilbud.
      if (want('U118') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const mk = async (suffix: string, status: 'sent' | 'viewed') => {
          const o = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-${suffix}-${stamp}`, title: `[HARNESS] opfølgning ${suffix} ${stamp}`, customer_id: profitCustomerId,
            status, created_by: adminUser.id, created_at: '2019-01-01T09:00:00Z', sent_at: '2019-01-02T09:00:00Z', ...(status === 'viewed' ? { viewed_at: '2019-01-03T09:00:00Z' } : {}) }]).select('id')
          const id = (o.data?.[0] as { id?: string } | undefined)?.id
          if (id) u100OfferIds.push(id)
          return id
        }
        r.seed = !!(await mk('FS', 'sent')) && !!(await mk('FV', 'viewed'))
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const opened = a.page.locator('li', { hasText: `UI-E2E-FV-${stamp}` }).first()
        const unopened = a.page.locator('li', { hasText: `UI-E2E-FS-${stamp}` }).first()
        await opened.waitFor({ timeout: 60_000 }).catch(() => {})
        r.aabnet_vist = (await opened.getByTestId('cockpit-offer-opened').count()) === 1
        r.ikke_aabnet_vist = (await unopened.getByTestId('cockpit-offer-unopened').count()) === 1
        out.push({ id: 'U118 N65 tilbud åbnet/ikke åbnet i opfølgningen', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U125 N74: kundelisten — "Oprettet fra mail" filtrerer til automatisk oprettede kunder (tag auto-email / pladsholder-
      // mail @elta-crm.local) med mærket "Fra mail · mangler e-mail"; en manuelt oprettet kunde vises ikke i filteret
      if (want('U125')) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('customers').insert([
          { customer_number: `UI-E2E-A-${stamp}`, company_name: `[HARNESS] auto ${stamp}`, contact_person: 'A', email: `auto+u125-${stamp}@elta-crm.local`, tags: ['auto-email'], created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
          { customer_number: `UI-E2E-M-${stamp}`, company_name: `[HARNESS] manuel ${stamp}`, contact_person: 'M', email: `manuel-${stamp}@harness.test`, tags: [], created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
        ]).select('id')
        u115CustomerIds.push(...((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id))
        r.seed = (ins.data ?? []).length === 2
        await gotoSafe(a.page, `${base}/dashboard/customers?search=${stamp}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('customers-origin-auto').click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForURL(/origin=auto/, { timeout: 60_000 }).catch(() => {})
        await a.page.getByText(`[HARNESS] auto ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.auto_vises = (await a.page.getByText(`[HARNESS] auto ${stamp}`).count()) > 0
        r.manuel_skjult = (await a.page.getByText(`[HARNESS] manuel ${stamp}`).count()) === 0
        r.maerke = /mangler e-mail/.test((await a.page.getByTestId('customer-auto-chip').first().textContent().catch(() => '')) ?? '')
        // N80: kundekortet viser "Mangler e-mail" i stedet for pladsholder-adressen
        const autoId = ((ins.data ?? []) as Array<{ id: string }>)[0]?.id
        await gotoSafe(a.page, `${base}/dashboard/customers/${autoId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.getByTestId('customer-email-missing').waitFor({ timeout: 60_000 }).catch(() => {})
        const placeholderShown = await a.page.getByText('@elta-crm.local').count()
        r.kort_mangler_email = (await a.page.getByTestId('customer-email-missing').count()) === 1 && placeholderShown === 0
        if (!r.kort_mangler_email) console.log(`[U125] mangler-email=${await a.page.getByTestId('customer-email-missing').count()} pladsholder-forekomster=${placeholderShown} html=${await a.page.getByText('@elta-crm.local').first().evaluate((e) => (e.parentElement?.outerHTML ?? e.outerHTML).slice(0, 400)).catch(() => '-')}`)
        out.push({ id: 'U125 N74 kunder oprettet fra mail', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} ${ins.error?.message ?? ''}` })
      }

      // U126 N75: cockpittets "Nye kunder uden tilbud" viser ikke en "kunde" hvis e-maildomæne tilhører en kendt leverandør
      // (website); en almindelig ny kunde vises stadig
      if (want('U126')) {
        const r: Record<string, boolean> = {}
        const dom = `u126-${stamp}.dk`
        const sup = await c.admin.from('suppliers').insert([{ name: `[HARNESS] U126 grossist ${stamp}`, code: `HU126${stamp}`, website: `https://www.${dom}` }]).select('id')
        u120SupplierIds.push(...((sup.data ?? []) as Array<{ id: string }>).map((x) => x.id))
        const ins = await c.admin.from('customers').insert([
          { customer_number: `UI-E2E-S-${stamp}`, company_name: `[HARNESS] lev-kunde ${stamp}`, contact_person: 'S', email: `info@${dom}`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
          { customer_number: `UI-E2E-K-${stamp}`, company_name: `[HARNESS] ægte kunde ${stamp}`, contact_person: 'K', email: `kunde-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } },
        ]).select('id')
        u115CustomerIds.push(...((ins.data ?? []) as Array<{ id: string }>).map((x) => x.id))
        r.seed = (sup.data ?? []).length === 1 && (ins.data ?? []).length === 2
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const card = a.page.getByTestId('cockpit-new-customers')
        await card.getByText(`[HARNESS] ægte kunde ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.aegte_vises = (await card.getByText(`[HARNESS] ægte kunde ${stamp}`).count()) > 0
        r.leverandoer_skjult = (await card.getByText(`[HARNESS] lev-kunde ${stamp}`).count()) === 0
        out.push({ id: 'U126 N75 leverandør-"kunder" ikke i nye kunder', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} ${sup.error?.message ?? ''} ${ins.error?.message ?? ''}` })
      }

      // U128 N83: cockpit "Leads — opfølgning" viser et åbent lead uden ændring i > 7 dage (ældst først); montør ser intet kort
      if (want('U128')) {
        const r: Record<string, boolean> = {}
        const name = `[HARNESS] gammelt lead ${stamp}`
        const ld = await c.admin.from('leads').insert([{ company_name: name, contact_person: 'Gammel', email: `lead-${stamp}@harness.test`, status: 'new', source: 'website',
          created_by: adminUser.id, created_at: '2019-06-01T09:00:00Z', updated_at: '2019-06-01T09:00:00Z' }]).select('id, updated_at')
        const lead = (ld.data?.[0] as { id?: string; updated_at?: string } | undefined)
        if (lead?.id) u128LeadIds.push(lead.id)
        r.seed = !!lead?.id && (lead.updated_at ?? '').startsWith('2019')
        await gotoSafe(a.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        const card = a.page.getByTestId('cockpit-stale-leads')
        await card.getByText(name).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.lead_vises = (await card.getByText(name).count()) > 0
        const m = await login(montor)
        await gotoSafe(m.page, `${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120_000 })
        r.montoer_intet_kort = (await m.page.getByText('Leads — opfølgning').count()) === 0
        await m.ctx.close().catch(() => {})
        out.push({ id: 'U128 N83 leads uden opfølgning i cockpittet', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} ${ld.error?.message ?? ''} upd=${lead?.updated_at ?? '-'}` })
      }

      // U131 N87: lead uden kunde viser "Findes kunden allerede?" med en auto-oprettet kunde med samme telefon (andet
      // format); "Kobl til denne kunde" kobler leadet (ingen ny kunde)
      if (want('U131')) {
        const r: Record<string, boolean> = {}
        const tel = `2${String(stamp).slice(-7)}`
        const cu = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-D-${stamp}`, company_name: `[HARNESS] dublet ${stamp}`, contact_person: 'D',
          email: `auto+d${stamp}@elta-crm.local`, phone: `+45 ${tel.slice(0, 2)} ${tel.slice(2, 4)} ${tel.slice(4, 6)} ${tel.slice(6)}`, tags: ['auto-email'], created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        const custId = (cu.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (custId) u115CustomerIds.push(custId)
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] lead dublet ${stamp}`, contact_person: 'Lead D', email: `leadd-${stamp}@harness.test`,
          phone: tel, status: 'new', source: 'website', created_by: adminUser.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (leadId) u128LeadIds.push(leadId)
        // LD-3: tilbud på leadet uden kunde → får kunden ved "Kobl til denne kunde"
        const u131Off = leadId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-LD3-${stamp}`, title: '[HARNESS] LD-3 tilbud', created_by: adminUser.id, lead_id: leadId }]).select('id') : null
        const u131OfferId = (u131Off?.data?.[0] as { id?: string } | undefined)?.id ?? null
        r.seed = !!custId && !!leadId && !!u131OfferId
        await gotoSafe(a.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        const box = a.page.getByTestId('lead-customer-candidates')
        await box.waitFor({ timeout: 60_000 }).catch(() => {})
        r.forslag_vist = /samme telefon/.test((await box.textContent().catch(() => '')) ?? '') && (await box.getByText(`[HARNESS] dublet ${stamp}`).count()) === 1
        await box.getByTestId('lead-link-candidate').first().click({ timeout: 30_000 }).catch(() => {})
        let linked: string | null = null
        for (let i = 0; i < 15 && !linked; i++) {
          await a.page.waitForTimeout(1000)
          const row = (await c.admin.from('leads').select('custom_fields').eq('id', leadId ?? '').maybeSingle()).data as { custom_fields: { customer_id?: string } | null } | null
          linked = row?.custom_fields?.customer_id ?? null
        }
        r.lead_koblet = linked === custId
        await a.page.getByTestId('lead-go-customer').waitFor({ timeout: 30_000 }).catch(() => {})
        r.gaa_til_kunde = (await a.page.getByTestId('lead-go-customer').count()) === 1
        if (u131OfferId) {
          const off = (await c.admin.from('offers').select('customer_id, payer_customer_id').eq('id', u131OfferId).maybeSingle()).data as { customer_id?: string | null; payer_customer_id?: string | null } | null
          r.tilbud_fik_kunden = off?.customer_id === custId && off?.payer_customer_id === custId
          await c.admin.from('offers').delete().eq('id', u131OfferId)
        }
        out.push({ id: 'U131 N87 lead → eksisterende kunde (samme telefon)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U196 PM2-5 (Henrik 2026-10-19): opret opgave — salg/bogholderi generelt; montør kun på en kunde med egen tildelt
      // arbejdsordre (U11's sag) og ikke på en fremmed kunde
      if (want('U196') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const jobCust = ((await c.admin.from('service_cases').select('customer_id').eq('id', jobCaseId).maybeSingle()).data as { customer_id?: string } | null)?.customer_id ?? null
        const fc = await c.admin.from('customers').insert([{ customer_number: `UI-PM25-${stamp}`, company_name: `[HARNESS] PM2-5 fremmed ${stamp}`, contact_person: 'F',
          email: `pm25-${stamp}@harness.test`, created_by: adminUser.id }]).select('id')
        const foreignCust = (fc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const hasNewTask = async (pg: typeof a.page, custId: string | null) => {
          await gotoSafe(pg, `${base}/dashboard/customers/${custId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await pg.getByRole('heading', { name: 'Opgaver' }).first().waitFor({ timeout: 60_000 }).catch(() => {})
          await pg.waitForTimeout(1500)
          return (await pg.getByRole('button', { name: /Ny opgave/ }).count()) > 0
        }
        try {
          r.seed = !!jobCust && !!foreignCust
          const m = await login(montor)
          try {
            r.montoer_egen_sag_kan_oprette = await hasNewTask(m.page, jobCust)
            r.montoer_fremmed_kunde_kan_ikke = !(await hasNewTask(m.page, foreignCust))
          } finally { await m.ctx.close().catch(() => {}) }
          for (const role of ['salg', 'bogholderi'] as const) {
            const x = await login(await mkUser(role))
            try { r[`${role}_kan_oprette`] = await hasNewTask(x.page, foreignCust) } finally { await x.ctx.close().catch(() => {}) }
          }
        } finally {
          if (foreignCust) { await c.admin.from('customer_tasks').delete().eq('customer_id', foreignCust); await c.admin.from('customers').delete().eq('id', foreignCust) }
        }
        out.push({ id: 'U196 PM2-5 opret opgave pr. rolle', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U197 PM2-6 (Henrik 2026-10-19): salg booker besigtigelse (knap), men ser ikke den tekniske besigtigelse (fanen på
      // kundekortet / Dokumentation på sagen); bogholderi ser ingen af dem; admin ser begge
      if (want('U197') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const jobCust = ((await c.admin.from('service_cases').select('customer_id').eq('id', jobCaseId).maybeSingle()).data as { customer_id?: string } | null)?.customer_id ?? null
        const counts = async (pg: typeof a.page) => {
          await gotoSafe(pg, `${base}/dashboard/customers/${jobCust}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await pg.waitForTimeout(1500)
          const besig = await pg.getByRole('button', { name: /^Besigtigelse$/ }).count()
          await gotoSafe(pg, `${base}/dashboard/orders/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await pg.waitForTimeout(1500)
          const dok = await pg.getByRole('button', { name: /^Dokumentation$/ }).count()
          return { besig, dok }
        }
        const ad = await counts(a.page)
        r.admin_booking_og_teknisk = ad.besig === 2 && ad.dok === 1
        for (const role of ['salg', 'bogholderi'] as const) {
          const x = await login(await mkUser(role))
          try {
            const k = await counts(x.page)
            r[`${role}_ingen_teknisk`] = k.dok === 0 && (role === 'salg' ? k.besig === 1 : k.besig === 0)
          } finally { await x.ctx.close().catch(() => {}) }
        }
        out.push({ id: 'U197 PM2-6 besigtigelse: booking vs. teknisk', ok: !!jobCust && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U63 N23: sagsstatus følger arbejdet — U11's sag (montør startede job/registrerede tid) er "I gang" + audit;
      // en sag med alle job udført og intet ufaktureret viser "Klar til lukning" → Luk sagen
      if (want('U63') && jobCaseId && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const st = ((await c.admin.from('service_cases').select('status').eq('id', jobCaseId).maybeSingle()).data as { status?: string } | null)?.status
        r.sag_i_gang_efter_arbejde = st === 'in_progress'
        const aud = ((await c.admin.from('audit_logs').select('action').eq('entity_id', jobCaseId)).data ?? []) as Array<{ action: string }>
        r.auto_start_auditlogget = aud.some((x) => x.action === 'case_auto_in_progress')
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] klar til lukning ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        const readyCaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        if (readyCaseId) {
          listCaseIds.push(readyCaseId)
          await c.admin.from('work_orders').insert([{ case_id: readyCaseId, title: `[HARNESS] udført job ${stamp}`, status: 'done', completed_at: new Date().toISOString() }])
        }
        await gotoSafe(a.page, `${base}/dashboard/orders/${readyCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('case-ready-to-close').waitFor({ timeout: 60_000 }).catch(() => {})
        r.klar_til_lukning_vist = (await a.page.getByTestId('case-ready-to-close').count()) === 1
        await a.page.getByTestId('case-close-now').click({ timeout: 30_000 }).catch(() => {})
        let closed = ''
        for (let i = 0; i < 20 && closed !== 'closed'; i++) {
          closed = String(((await c.admin.from('service_cases').select('status').eq('id', readyCaseId ?? '').maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (closed !== 'closed') await new Promise((res) => setTimeout(res, 1000))
        }
        r.lukket = closed === 'closed'
        // U11's sag har ufaktureret tid → intet "klar"-banner
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.waitForTimeout(3000)
        r.ufaktureret_ikke_klar = (await a.page.getByTestId('case-ready-to-close').count()) === 0
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        if (readyCaseId) {
          const { data: rw } = await c.admin.from('work_orders').select('id').eq('case_id', readyCaseId)
          for (const w of (rw ?? []) as Array<{ id: string }>) { await c.admin.from('work_order_profit').delete().eq('work_order_id', w.id); await c.admin.from('work_orders').delete().eq('id', w.id) }
          await c.admin.from('audit_logs').delete().eq('entity_id', readyCaseId)
        }
        await c.admin.from('audit_logs').delete().eq('entity_id', jobCaseId).eq('action', 'case_auto_in_progress')
        out.push({ id: 'U63 N23 sagsstatus følger arbejdet', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U66 N26b: rapportens sagsrentabilitet bygger på sager + timer (før: gammel projektmodel → altid tom)
      if (want('U66') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const cn = ((await c.admin.from('service_cases').select('case_number').eq('id', jobCaseId).maybeSingle()).data as { case_number?: string } | null)?.case_number ?? ''
        await gotoSafe(a.page, `${base}/dashboard/reports`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText('Sagsrentabilitet').first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.sektion_vist = (await a.page.getByText('Sagsrentabilitet').count()) > 0
        await a.page.getByText(cn).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.montoersag_med = cn !== '' && (await a.page.getByText(cn).count()) > 0
        await a.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        out.push({ id: 'U66 N26b sagsrentabilitet i rapporter', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U71 N30: montør uploader kvittering på øvrig omkostning (privat storage, ikke kundedokument); kontoret ser bilaget
      if (want('U71') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
        const desc = `Parkering m. bilag ${stamp}`
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=oevrige`, { waitUntil: 'networkidle', timeout: 120_000 })
        await m.page.getByRole('button', { name: 'Tilføj omkostning' }).first().click({ timeout: 30_000 }).catch(() => {})
        const dlg = m.page.locator('[aria-labelledby="case-other-cost-dialog-title"]')
        await dlg.getByPlaceholder('F.eks. Kørsel til Aalborg, 2 ture').fill(desc).catch(() => {})
        await dlg.getByTestId('other-cost-receipt-file').setInputFiles({ name: 'kvittering.png', mimeType: 'image/png', buffer: png }).catch(() => {})
        await dlg.getByTestId('other-cost-receipt-ok').waitFor({ timeout: 30_000 }).catch(() => {})
        r.upload_bekraeftet = (await dlg.getByTestId('other-cost-receipt-ok').count()) === 1
        await dlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
        type O = { receipt_url: string | null; receipt_filename: string | null }
        let row: O | null = null
        for (let i = 0; i < 20 && !row; i++) {
          row = (await c.admin.from('case_other_costs').select('receipt_url, receipt_filename').eq('case_id', jobCaseId).eq('description', desc).maybeSingle()).data as O | null
          if (!row) await new Promise((res) => setTimeout(res, 1000))
        }
        r.privat_sti_gemt = !!row?.receipt_url?.startsWith(`receipts/${jobCaseId}/`) && row?.receipt_filename === 'kvittering.png'
        const docs = ((await c.admin.from('customer_documents').select('id').eq('service_case_id', jobCaseId).ilike('file_name', '%kvittering%')).data ?? []) as unknown[]
        r.ikke_kundedokument = docs.length === 0
        await m.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await gotoSafe(a.page, `${base}/dashboard/orders/${jobCaseId}?tab=oevrige`, { waitUntil: 'networkidle', timeout: 120_000 })
        const link = a.page.locator('a', { hasText: 'Bilag' }).first()
        await link.waitFor({ timeout: 30_000 }).catch(() => {})
        const href = (await link.getAttribute('href').catch(() => '')) ?? ''
        r.kontor_ser_signeret_bilag = /^https?:\/\//.test(href) && href.includes('token=')
        // ST-7 (storage-review 2026-10-16): slet omkostningen i UI'et → rækken OG kvitteringsfilen er væk
        if (row?.receipt_url) {
          a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
          const rowEl = a.page.locator('tr', { hasText: desc }).first()
          await rowEl.getByRole('button', { name: 'Slet omkostning' }).click({ timeout: 30_000 }).catch(() => {})
          let rowGone = false
          for (let i = 0; i < 20 && !rowGone; i++) {
            rowGone = !(await c.admin.from('case_other_costs').select('id').eq('case_id', jobCaseId).eq('description', desc).maybeSingle()).data
            if (!rowGone) await new Promise((res) => setTimeout(res, 500))
          }
          r.slet_fjerner_raekke = rowGone
          // filen fjernes EFTER rækken (serveren tjekker først andre referencer, SC-8) → poll
          let fileGone = false
          for (let i = 0; i < 20 && !fileGone; i++) {
            fileGone = !!(await c.admin.storage.from('attachments').download(row.receipt_url)).error
            if (!fileGone) await new Promise((res) => setTimeout(res, 500))
          }
          r.slet_fjerner_kvittering = fileGone
        }
        if (row?.receipt_url) await c.admin.storage.from('attachments').remove([row.receipt_url])
        out.push({ id: 'U71 N30 kvittering på øvrig omkostning', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U73 privacy (Henrik 2026-10-03): medarbejderens løn/satser står ikke på oversigter; fanen "Økonomi & løn" kun for
      // løn-roller, henter først ved åbning, maskeret indtil "Vis beløb", væk når fanen forlades; serviceleder ser
      // hverken fanen eller lønhistorikkens detaljer (D41); montør får ingen kost/sats i sagens tidsdata (D42)
      if (want('U73') && jobEmployeeId && jobCaseId) {
        const r: Record<string, boolean> = {}
        const WAGE = '987,65', COST = '543,21'
        await c.admin.from('employee_compensation').upsert([{ employee_id: jobEmployeeId, hourly_wage: 987.65, internal_cost_rate: 543.21, sales_rate: 650 }], { onConflict: 'employee_id' })
        await c.admin.from('employees').update({ hourly_rate: 650, cost_rate: 543.21 }).eq('id', jobEmployeeId)
        await c.admin.from('employee_events').insert([{ employee_id: jobEmployeeId, event_type: 'compensation_changed', title: 'Satser/økonomi ændret',
          description: `Lønforhøjelse ${stamp}`, metadata: { real_hourly_cost: 777.77 } }])
        // admin: liste + overblik uden beløb
        await gotoSafe(a.page, `${base}/dashboard/employees`, { waitUntil: 'networkidle', timeout: 120_000 })
        const listHtml = await a.page.content().catch(() => '')
        r.liste_uden_satser = !listHtml.includes('543,21') && !listHtml.includes('543.21') && !listHtml.includes(WAGE)
        // Netværkssvar (inkl. server actions) — følsomme data må ikke HENTES før fanen åbnes
        const netA: string[] = []
        const onRespA = async (resp: import('playwright').Response) => { try { if (resp.request().method() === 'POST' || resp.url().includes('/dashboard/employees')) netA.push(await resp.text()) } catch { /* stream lukket */ } }
        a.page.on('response', onRespA)
        await gotoSafe(a.page, `${base}/dashboard/employees/${jobEmployeeId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await a.page.waitForTimeout(1500)
        const overHtml = (await a.page.content().catch(() => '')) + netA.join('\n')
        r.overblik_henter_ikke_loen = !overHtml.includes('987.65') && !overHtml.includes('543.21') && !overHtml.includes('777.77') && !overHtml.includes(WAGE)
        a.page.off('response', onRespA)
        await a.page.getByTestId('employee-tab-oekonomi').click({ timeout: 30_000 }).catch(() => {})
        await a.page.getByTestId('employee-economy').waitFor({ timeout: 30_000 }).catch(() => {})
        r.oekonomi_maskeret = (await a.page.getByTestId('sensitive-masked').count()) > 0 && !(await a.page.content().catch(() => '')).includes(WAGE)
        await a.page.getByTestId('sensitive-reveal-toggle').first().click({ timeout: 10_000 }).catch(() => {})
        r.vis_beloeb_viser = (await a.page.getByText(new RegExp(WAGE)).count()) > 0
        await a.page.getByTestId('employee-tab-overblik').click({ timeout: 10_000 }).catch(() => {})
        await a.page.getByTestId('employee-economy').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
        r.vaek_naar_fanen_forlades = !(await a.page.content().catch(() => '')).includes(WAGE)
        await a.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        // serviceleder: ingen økonomi-fane, ingen lønhistorik-detaljer
        const sl = await mkUser('serviceleder')
        const s = await login(sl)
        await gotoSafe(s.page, `${base}/dashboard/employees/${jobEmployeeId}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await s.page.getByTestId('employee-tab-overblik').waitFor({ timeout: 60_000 }).catch(() => {})
        const slHtml = await s.page.content().catch(() => '')
        r.serviceleder_ingen_oekonomifane = s.ok && (await s.page.getByTestId('employee-tab-oekonomi').count()) === 0
        r.serviceleder_ingen_loendetaljer = !slHtml.includes(`Lønforhøjelse ${stamp}`) && !slHtml.includes('777.77') && !slHtml.includes(WAGE)
        await s.ctx.close().catch(() => {})
        // montør: sagens tidsdata uden kost/sats
        // D42: sagens tidsdata hentes via server actions → gennemsøg svarene, ikke kun DOM
        const netM: string[] = []
        const onRespM = async (resp: import('playwright').Response) => { try { if (resp.request().method() === 'POST') netM.push((await resp.body()).toString('utf8')) } catch { /* stream lukket */ } }
        m.page.on('response', onRespM)
        // Tidsdata hentes af et klientkald (server action) efter hydrering. Vent på PRÆCIS det svar (waitForResponse
        // læser hele kroppen) — før: polling af en liste, der nogle gange ikke nåede at få svaret (m_timer=0, flaky).
        const awaitTimeLogs = () => m.page.waitForResponse(async (resp) => {
          if (resp.request().method() !== 'POST') return false
          const body = (await resp.body().catch(() => Buffer.from(''))).toString('utf8')
          if (body.includes('"hours"')) { netM.push(body); return true }
          return false
        }, { timeout: 30_000 }).then(() => true).catch(() => false)
        const firstTry = awaitTimeLogs()
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        if (!(await firstTry)) {
          const secondTry = awaitTimeLogs()
          await m.page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {})
          await secondTry
        }
        await m.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        // Henrik 2026-10-10 (U73 deterministisk): tidsdata bevises via DOM'en — sagstotalen vises først når
        // listTimeLogsForCase har svaret med montørens timer. Netværkssnifning af server-action-svar var upålidelig
        // (svaret blev ikke altid opfanget: m_timer=0 trods data). Opfangede svar bruges stadig til læk-tjekket.
        const totals = m.page.getByTestId('case-time-totals')
        const totalsShown = await totals.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false)
        const totalsText = totalsShown ? ((await totals.innerText().catch(() => '')) ?? '') : ''
        m.page.off('response', onRespM)
        try { writeFileSync(join(shots, 'u73-montoer-net.txt'), netM.map((t) => `${t.slice(0, 1500)}\n…\n${t.slice(-2500)}`).join('\n----\n')) } catch { /* diagnose */ }
        const mAll = (await m.page.content().catch(() => '')) + netM.join('\n')
        const sawTimeLogs = totalsShown && totalsText.includes('timeregistrering') && /\d/.test(totalsText)
        r.montoer_tidsdata_hentet = sawTimeLogs
        const leak = /"cost_amount":\s*[1-9]/.test(mAll) || /"cost_rate_snapshot":\s*[1-9]/.test(mAll) || /"hourly_rate":\s*650/.test(mAll) || mAll.includes('543.21')
        r.montoer_ingen_kost_eller_sats = !leak
        u73Diag = `POST-svar=${netM.length} m_timer=${netM.filter((t) => t.includes('"hours"')).length} m_cost_amount=${netM.filter((t) => t.includes('cost_amount')).length} læk=${leak ? 'ja' : 'nej'}`
        await m.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        await c.admin.from('employee_events').delete().eq('employee_id', jobEmployeeId)
        await c.admin.from('employee_compensation').delete().eq('employee_id', jobEmployeeId)
        out.push({ id: 'U73 privacy: medarbejderløn kun i egen fane', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · ${u73Diag}` })
      }

      // U44 montør: "Mine timer" viser ugens egne timer (efter U11's tidsregistrering)
      if (want('U44') && jobCaseId) {
        const r: Record<string, boolean> = {}
        const own = ((await c.admin.from('time_logs').select('hours, end_time, work_order:work_orders!inner(case_id)').eq('work_order.case_id', jobCaseId)).data ?? []) as Array<{ hours: number | null; end_time: string | null }>
        const expected = Math.round(own.filter((x) => x.end_time).reduce((s0, x) => s0 + Number(x.hours ?? 0), 0) * 100) / 100
        await gotoSafe(m.page, `${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = m.page.getByTestId('my-hours-card')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        r.kort_vist = (await card.count()) > 0
        const totalTxt = ((await m.page.getByTestId('my-hours-total').textContent().catch(() => '')) ?? '').replace(/\s*t$/, '').trim()
        r.total_matcher = expected > 0 && Number(totalTxt.replace(/\./g, '').replace(',', '.')) === expected
        r.sag_vist = ((await card.innerText().catch(() => '')) ?? '').includes('montørjob')
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u44-mine-timer.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U44 montør: Mine timer', ok: Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · total=${totalTxt} forventet=${expected}` })
      }

      // U46 faktura-PDF (medarbejder-route): admin må, montør må ikke (før: kun login-tjek)
      if (want('U46') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-PDF-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 400, tax_amount: 100, final_amount: 500, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u46.invoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id
        if (u46.invoiceId) await c.admin.from('invoice_lines').insert([{ invoice_id: u46.invoiceId, position: 1, description: 'Service', quantity: 1, unit: 'stk', unit_price: 400, total_price: 400 }])
        const cs = ((await c.admin.from('company_settings').select('id')).data ?? []) as Array<{ id: string }>
        if (cs.length === 0) {
          const ci = await c.admin.from('company_settings').insert([{ company_name: '[HARNESS] Elta Solar', bank_reg_no: '1234', bank_account: '0001234567' }]).select('id')
          u46.companySettingsId = (ci.data?.[0] as { id?: string } | undefined)?.id
        }
        const url = `${base}/api/invoices/${u46.invoiceId}/pdf`
        const adm = await a.page.context().request.get(url, { timeout: 180_000 }).catch(() => null)
        const ab = adm ? await adm.body().catch(() => Buffer.from('')) : Buffer.from('')
        r.admin_pdf = adm?.status() === 200 && ab.subarray(0, 4).toString() === '%PDF'
        // som brugeren: åbn linket i siden (ikke en parallel context-request mens en anden side er åben)
        const mon = await gotoSafe(m.page, url, { waitUntil: 'load', timeout: 120_000 }).catch(() => null)
        r.montoer_404 = mon?.status() === 404
        // tilbuds-PDF: montør har ikke offers.view
        const off = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-OP-${stamp}`, title: '[HARNESS] pdf-adgang', customer_id: profitCustomerId,
          status: 'draft', created_by: adminUser.id }]).select('id')
        u46.offerId = (off.data?.[0] as { id?: string } | undefined)?.id
        const monOffer = u46.offerId ? await gotoSafe(m.page, `${base}/api/offers/${u46.offerId}/pdf`, { waitUntil: 'load', timeout: 120_000 }).catch(() => null) : null
        r.montoer_tilbud_404 = monOffer?.status() === 404
        out.push({ id: 'U46 faktura-PDF: adgangskontrol', ok: !!u46.invoiceId && Object.values(r).every(Boolean), note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · admin=${adm?.status()} montør=${mon?.status()}` })
      }
    } else out.push({ id: 'U4 montør: ingen adgang', ok: false, note: 'montør-login fejlede' })

    // ---- salg (G6): egen sag fra eget tilbud skal kunne ses
    {
      const r: Record<string, boolean> = {}
      let u13Diag = '' // HT-2: hvorfor admin_fakturer_paa_sag fejler i grund-kørslen
      const title = `[HARNESS] salgstilbud ${stamp}`
      const off = profitCustomerId ? await c.admin.from('offers').insert([{ offer_number: `UI-E2E-S-${stamp}`, title, created_by: salg.id,
        customer_id: profitCustomerId, status: 'sent', sent_at: new Date().toISOString() }]).select('id') : null
      salgOfferId = (off?.data?.[0] as { id?: string } | undefined)?.id ?? null
      const sp = await login(salg)
      if (sp.ok && salgOfferId) {
        r.menu_sager = (await sp.page.getByRole('link', { name: 'Sager / Ordrer' }).count()) > 0
        await gotoSafe(sp.page, `${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByRole('button', { name: 'Opret sag fra tilbud' }).first().click({ timeout: 60_000 }).catch(() => {})
        await sp.page.waitForURL(/\/dashboard\/orders\//, { timeout: 120_000 }).catch(() => {})
        await sp.page.waitForLoadState('networkidle').catch(() => {})
        r.lander_paa_sag = /\/dashboard\/orders\//.test(sp.page.url())
        await sp.page.getByRole('heading', { name: title }).first().waitFor({ timeout: 120_000 }).catch(() => {}) // første dev-kompilering af sagssiden
        r.kan_se_sag = (await sp.page.getByRole('heading', { name: title }).count()) > 0
          && (await sp.page.getByText(/Du har ikke adgang|This page could not be found|Siden blev ikke fundet/).count()) === 0
        const sag = ((await c.admin.from('service_cases').select('created_by').eq('source_offer_id', salgOfferId).maybeSingle()).data as { created_by?: string } | null)
        r.sag_ejet_af_salg = sag?.created_by === salg.id
        // N5: salg (ingen invoices.create) ser ikke "Fakturér på sagen"; admin gør og lander på sagens fakturakladde
        await gotoSafe(sp.page, `${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByRole('link', { name: 'Åbn sag' }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.salg_ingen_fakturer = (await sp.page.getByTestId('offer-invoice-on-case').count()) === 0
        await gotoSafe(a.page, `${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-invoice-on-case').first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForURL(/tab=fakturakladde/, { timeout: 60_000 }).catch(() => {})
        // HT-2 (2026-10-17): waitFor kastede straks under navigationen (fanget) → optælling mens siden stadig hentede.
        // Poll i stedet (skærmbillede viste fanen med "Slutfaktura" kort efter)
        let fakturaTekst = 0
        for (let i = 0; i < 60 && fakturaTekst === 0; i++) {
          fakturaTekst = /tab=fakturakladde/.test(a.page.url()) ? await a.page.getByText(/Stage-fakturaer på sagen|Slutfaktura/).count().catch(() => 0) : 0
          if (fakturaTekst === 0) await a.page.waitForTimeout(1500)
        }
        r.admin_fakturer_paa_sag = /tab=fakturakladde/.test(a.page.url()) && fakturaTekst > 0
        if (!r.admin_fakturer_paa_sag) {
          const btn = await c.admin.from('offers').select('status, converted_case_id').eq('id', salgOfferId).maybeSingle()
          u13Diag = ` · HT-2 url=${a.page.url().replace(base, '')} tilbud=${JSON.stringify(btn.data)} fejltekst=${(await a.page.locator('.bg-red-50').first().innerText({ timeout: 2_000 }).catch(() => '')).slice(0, 80)}`
          await a.page.screenshot({ caret: 'initial', path: join(shots, 'u13-admin-fakturakladde.png'), fullPage: true }).catch(() => {})
        }
        await sp.page.screenshot({ caret: 'initial', path: join(shots, 'u13-salg-sag.png'), fullPage: true }).catch(() => {})
      }
      // U14 opfølgning (N1)
      if (want('U14') && (sp.ok && profitCustomerId)) {
        const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString()
        const validTo = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10)
        const mk = async (num: string, title: string, by: string, sentAt: string, status: string, viewedAt: string | null) => {
          const r0 = await c.admin.from('offers').insert([{ offer_number: num, title, created_by: by, customer_id: profitCustomerId, status, sent_at: sentAt,
            viewed_at: viewedAt, valid_until: validTo }]).select('id')
          const id = (r0.data?.[0] as { id?: string } | undefined)?.id
          if (id) followupOfferIds.push(id)
        }
        await c.admin.from('customers').update({ phone: '+45 12 34 56 78' }).eq('id', profitCustomerId)
        await mk(`UI-E2E-F1-${stamp}`, `[HARNESS] følg op set ${stamp}`, salg.id, daysAgo(5), 'viewed', daysAgo(4))
        await mk(`UI-E2E-F2-${stamp}`, `[HARNESS] følg op nyt ${stamp}`, salg.id, daysAgo(0), 'sent', null)
        await mk(`UI-E2E-F3-${stamp}`, `[HARNESS] følg op kollega ${stamp}`, adminUser.id, daysAgo(6), 'viewed', daysAgo(5))
        const f: Record<string, boolean> = {}
        await gotoSafe(sp.page, `${base}/dashboard/offers`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = sp.page.getByTestId('offer-followup-card')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.count()) ? await card.innerText() : ''
        const row = card.getByTestId('offer-followup-row').filter({ hasText: `følg op set ${stamp}` })
        const rowTxt = (await row.count()) ? await row.first().innerText() : ''
        f.set_ikke_besvaret = /Set — ikke besvaret/.test(rowTxt) && /5 dage/.test(rowTxt)
        f.ring_knap = (await row.getByRole('link', { name: /Ring/ }).count()) === 1
        f.nyt_under_afventer = !txt.includes(`følg op nyt ${stamp}`) && /afventer stadig kunden/.test(txt)
        f.kollega_skjult = !txt.includes(`følg op kollega ${stamp}`)
        await sp.page.screenshot({ caret: 'initial', path: join(shots, 'u14-opfoelgning.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U14 salg: tilbudsopfølgning', ok: Object.values(f).every(Boolean), note: Object.entries(f).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }
      // U45 salg: "Kun mine" på leadlisten (tildelt mig)
      if (want('U45') && sp.ok) {
        const g: Record<string, boolean> = {}
        const mine = `[HARNESS] Mit lead ${stamp}`, other = `[HARNESS] Kollegas lead ${stamp}`
        const ins = await c.admin.from('leads').insert([
          { company_name: mine, contact_person: 'A', email: `mine-${stamp}@harness.test`, status: 'new', source: 'website', created_by: adminUser.id, assigned_to: salg.id },
          { company_name: other, contact_person: 'B', email: `andet-${stamp}@harness.test`, status: 'new', source: 'website', created_by: adminUser.id, assigned_to: adminUser.id },
        ]).select('id')
        for (const x of (ins.data ?? []) as Array<{ id: string }>) u27LeadIds.push(x.id)
        await gotoSafe(sp.page, `${base}/dashboard/leads?search=${encodeURIComponent(String(stamp))}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const body0 = await sp.page.locator('main').innerText().catch(() => '')
        g.alle_vist_foer = body0.includes(mine) && body0.includes(other)
        await sp.page.getByRole('button', { name: 'Kun mine' }).click({ timeout: 60_000 }).catch(() => {})
        await sp.page.waitForURL(/mine=1/, { timeout: 60_000 }).catch(() => {})
        await sp.page.getByText(mine).first().waitFor({ timeout: 60_000 }).catch(() => {})
        const body1 = await sp.page.locator('main').innerText().catch(() => '')
        g.kun_eget_lead = body1.includes(mine) && !body1.includes(other)
        g.filter_vist = body1.includes('Tildelt mig')
        out.push({ id: 'U45 salg: Kun mine (leads)', ok: (ins.data ?? []).length === 2 && Object.values(g).every(Boolean), note: Object.entries(g).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }
      // U47 salg: download af PDF for eget tilbud (før: 500 — firmaindstillinger krævede settings.view)
      if (want('U47') && sp.ok && salgOfferId) {
        const g: Record<string, boolean> = {}
        const cs = ((await c.admin.from('company_settings').select('id')).data ?? []) as Array<{ id: string }>
        let seededCs: string | undefined
        if (cs.length === 0) {
          const ci = await c.admin.from('company_settings').insert([{ company_name: '[HARNESS] Elta Solar', bank_reg_no: '1234', bank_account: '0001234567' }]).select('id')
          seededCs = (ci.data?.[0] as { id?: string } | undefined)?.id
        }
        const res = await sp.page.context().request.get(`${base}/api/offers/${salgOfferId}/pdf`, { timeout: 180_000 }).catch(() => null)
        const b = res ? await res.body().catch(() => Buffer.from('')) : Buffer.from('')
        g.salg_tilbuds_pdf = res?.status() === 200 && b.subarray(0, 4).toString() === '%PDF'
        if (seededCs) await c.admin.from('company_settings').delete().eq('id', seededCs)
        out.push({ id: 'U47 salg: tilbuds-PDF', ok: Object.values(g).every(Boolean), note: `${Object.entries(g).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · status=${res?.status()}` })
      }
      // U54 salg: lead → "Opret tilbud" med firmaets standard-gyldighed og -betingelser (før: salg fik ingen gyldighedsdato)
      if (want('U54') && sp.ok) {
        const g: Record<string, boolean> = {}
        const cs = ((await c.admin.from('company_settings').select('id, default_offer_validity_days, default_terms_and_conditions')).data ?? []) as Array<{ id: string; default_offer_validity_days: number | null; default_terms_and_conditions: string | null }>
        let seededCs: string | undefined
        let restoreCs: { id: string; days: number | null; terms: string | null } | undefined
        const terms = `[HARNESS] betingelser ${stamp}`
        if (cs.length === 0) {
          const ci = await c.admin.from('company_settings').insert([{ company_name: '[HARNESS] Elta Solar', default_offer_validity_days: 21, default_terms_and_conditions: terms }]).select('id')
          seededCs = (ci.data?.[0] as { id?: string } | undefined)?.id
        } else {
          restoreCs = { id: cs[0].id, days: cs[0].default_offer_validity_days, terms: cs[0].default_terms_and_conditions }
          await c.admin.from('company_settings').update({ default_offer_validity_days: 21, default_terms_and_conditions: terms }).eq('id', cs[0].id)
        }
        const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] Tilbudslead ${stamp}`, contact_person: 'L', email: `tilbudslead-${stamp}@harness.test`,
          status: 'qualified', source: 'website', created_by: adminUser.id, assigned_to: salg.id }]).select('id')
        const leadId = (ld.data?.[0] as { id?: string } | undefined)?.id
        if (leadId) u27LeadIds.push(leadId)
        await gotoSafe(sp.page, `${base}/dashboard/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByTestId('lead-create-offer').click({ timeout: 60_000 }).catch(() => {})
        const dlg = sp.page.locator('[aria-labelledby="offer-form-title"]')
        await dlg.waitFor({ timeout: 30_000 }).catch(() => {})
        const expectDate = new Date(); expectDate.setDate(expectDate.getDate() + 21)
        const expectIso = expectDate.toISOString().split('T')[0]
        // vent på at standardværdierne er hentet ind i formularen
        for (let i = 0; i < 60; i++) { if ((await dlg.locator('#valid_until').inputValue().catch(() => '')) === expectIso) break; await new Promise((res) => setTimeout(res, 500)) } // op til 30 s
        await dlg.locator('#title').fill(`[HARNESS] tilbud fra lead ${stamp}`).catch(() => {})
        await dlg.getByRole('button', { name: 'Opret tilbud' }).click({ timeout: 30_000 }).catch(() => {})
        type O = { id: string; lead_id: string | null; valid_until: string | null; terms_and_conditions: string | null; created_by: string }
        const readO = async (): Promise<O | null> => ((await c.admin.from('offers').select('id, lead_id, valid_until, terms_and_conditions, created_by').eq('title', `[HARNESS] tilbud fra lead ${stamp}`).maybeSingle()).data as O | null)
        let o: O | null = await readO()
        for (let i = 0; i < 20 && !o; i++) { await new Promise((res) => setTimeout(res, 1000)); o = await readO() }
        if (o?.id) u54OfferId = o.id
        g.tilbud_oprettet = !!o && o.created_by === salg.id
        g.koblet_til_lead = o?.lead_id === leadId
        g.gyldighed_fra_standard = o?.valid_until === expectIso
        g.betingelser_fra_standard = o?.terms_and_conditions === terms
        if (seededCs) await c.admin.from('company_settings').delete().eq('id', seededCs)
        if (restoreCs) await c.admin.from('company_settings').update({ default_offer_validity_days: restoreCs.days, default_terms_and_conditions: restoreCs.terms }).eq('id', restoreCs.id)
        out.push({ id: 'U54 salg: lead → tilbud m. standarder', ok: !!leadId && Object.values(g).every(Boolean), note: `${Object.entries(g).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · gyldig=${o?.valid_until}/${expectIso}` })
      }
      // U55 salg: tilbuds-print viser firmaets navn/CVR (før: "Virksomhed" uden oplysninger — settings.view krævet)
      if (want('U55') && sp.ok && salgOfferId) {
        const g: Record<string, boolean> = {}
        const cs = ((await c.admin.from('company_settings').select('id, company_name, company_vat_number')).data ?? []) as Array<{ id: string; company_name: string | null; company_vat_number: string | null }>
        let seededCs: string | undefined
        let restoreCs: { id: string; name: string | null; vat: string | null } | undefined
        const name = `[HARNESS] Elta Solar ${stamp}`, vat = '87654321'
        if (cs.length === 0) {
          const ci = await c.admin.from('company_settings').insert([{ company_name: name, company_vat_number: vat }]).select('id')
          seededCs = (ci.data?.[0] as { id?: string } | undefined)?.id
        } else {
          restoreCs = { id: cs[0].id, name: cs[0].company_name, vat: cs[0].company_vat_number }
          await c.admin.from('company_settings').update({ company_name: name, company_vat_number: vat }).eq('id', cs[0].id)
        }
        await gotoSafe(sp.page, `${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByRole('button', { name: /^Print$/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await sp.page.getByText(name).first().waitFor({ timeout: 30_000 }).catch(() => {})
        const body = await sp.page.locator('body').innerText().catch(() => '')
        g.firmanavn_paa_print = body.includes(name)
        g.cvr_paa_print = body.includes(vat)
        if (seededCs) await c.admin.from('company_settings').delete().eq('id', seededCs)
        if (restoreCs) await c.admin.from('company_settings').update({ company_name: restoreCs.name, company_vat_number: restoreCs.vat }).eq('id', restoreCs.id)
        out.push({ id: 'U55 salg: tilbuds-print m. firmaoplysninger', ok: Object.values(g).every(Boolean), note: Object.entries(g).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }
      out.push({ id: 'U13 salg: sag fra eget tilbud', ok: sp.ok && !!salgOfferId && Object.keys(r).length === 6 && Object.values(r).every(Boolean),
        note: `${!sp.ok ? `salg-login fejlede (${loginFailures.join(' | ')}) · ` : ''}${!salgOfferId ? `SEED: ${off?.error?.message?.slice(0, 80)} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}${u13Diag}` })
    }

    // Dev-serveren kan genstarte ved hukommelsespres (maskinen har ~6 GB). Netværksfejl i browseren
    // under en sådan genstart er miljø, ikke app-fejl — de vises i noten, men fejler ikke U5.
    // Alle andre side-/konsolfejl fejler stadig.
    const restarts = (serverLog.join('').match(/memory threshold, restarting/g) ?? []).length
    const envRe = /network error|Failed to fetch|WebSocket is already in CLOSING or CLOSED state|ERR_CONNECTION/
    const envErrors = restarts > 0 ? pageErrors.filter((x) => envRe.test(x)) : []
    // Produktionsbuild: React #419 (Suspense faldt tilbage til klient-rendering) når testen navigerer videre før
    // serverens stream er færdig — serveren logger da "destination stream closed early". Kun i den situation henføres
    // #419 til testens navigation (vises i noten); uden afbrudte streams fejler #419 som før.
    const abortedStreams = (serverLog.join('').match(/destination stream closed early/g) ?? []).length
    const abortErrors = abortedStreams > 0 ? pageErrors.filter((x) => /Minified React error #419/.test(x)) : []
    const realErrors = pageErrors.filter((x) => !envErrors.includes(x) && !abortErrors.includes(x))
    const envNote = (restarts > 0 ? ` · dev-server genstartet ${restarts}× (hukommelse); ${envErrors.length} netværksfejl under genstart henført til miljø${envErrors.length ? `: ${envErrors.slice(0, 2).join(' | ').slice(0, 300)}` : ''}` : '')
      + (abortErrors.length ? ` · ${abortErrors.length}× React #419 ved afbrudt stream (${abortedStreams} afbrudte streams i serverloggen): ${abortErrors[0].slice(0, 120)}` : '')
    out.push({ id: 'U5 ingen side-/konsolfejl', ok: realErrors.length === 0, note: `${realErrors.length ? realErrors.slice(0, 3).join(' | ') : `0 fejl · skærmbilleder: ${shots}`}${envNote}` })
  } finally {
    await browser.close().catch(() => {})
    // Dev-serverens log (hale) til diagnose af side-/netværksfejl — kun i den lokale skærmbillede-mappe
    try { writeFileSync(join(shots, 'dev-server.log'), serverLog.join('').slice(-400_000)) } catch { /* best-effort */ }
    if (server) killTree(server)
    if (profitOfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', profitOfferId); await c.admin.from('offers').delete().eq('id', profitOfferId) }
    if (portalOfferId) {
      const { data: sc } = await c.admin.from('service_cases').select('id').eq('source_offer_id', portalOfferId)
      await c.admin.from('offers').update({ converted_case_id: null }).eq('id', portalOfferId)
      for (const r of (sc ?? []) as Array<{ id: string }>) {
        await c.admin.from('customer_tasks').delete().eq('service_case_id', r.id)
        await c.admin.from('case_notes').delete().eq('case_id', r.id)
        await c.admin.from('service_cases').delete().eq('id', r.id)
      }
      const { data: inv } = await c.admin.from('invoices').select('id').eq('offer_id', portalOfferId)
      for (const r of (inv ?? []) as Array<{ id: string }>) { await c.admin.from('invoice_lines').delete().eq('invoice_id', r.id); await c.admin.from('invoices').delete().eq('id', r.id) }
      for (const t of ['offer_activities', 'offer_signatures', 'offer_line_items']) await c.admin.from(t).delete().eq('offer_id', portalOfferId)
      await c.admin.from('offers').delete().eq('id', portalOfferId)
    }
    if (portalTokenId) await c.admin.from('portal_access_tokens').delete().eq('id', portalTokenId)
    if (chatTokenId) await c.admin.from('portal_access_tokens').delete().eq('id', chatTokenId)
    if (profitCustomerId) {
      const { data: pm } = await c.admin.from('portal_messages').select('id, attachments').eq('customer_id', profitCustomerId)
      const paths: string[] = []
      for (const m0 of (pm ?? []) as Array<{ attachments?: Array<{ path?: string; storage_path?: string }> | null }>) for (const at of m0.attachments ?? []) { const pth = at.storage_path ?? at.path; if (pth) paths.push(pth) }
      if (paths.length) await c.admin.storage.from('portal-attachments').remove(paths)
      await c.admin.from('portal_messages').delete().eq('customer_id', profitCustomerId)
    }
    if (jobCaseId) {
      const { data: hatt } = await c.admin.from('service_case_attachments').select('storage_path').eq('service_case_id', jobCaseId)
      const hp = ((hatt ?? []) as Array<{ storage_path: string | null }>).map((x) => x.storage_path).filter(Boolean) as string[]
      if (hp.length) await c.admin.storage.from('service-case-files').remove(hp)
      await c.admin.from('service_case_attachments').delete().eq('service_case_id', jobCaseId)
    }
    if (jobCaseId) {
      const { data: docs } = await c.admin.from('customer_documents').select('id, storage_path').eq('service_case_id', jobCaseId)
      const paths = ((docs ?? []) as Array<{ storage_path: string | null }>).map((d) => d.storage_path).filter(Boolean) as string[]
      if (paths.length) await c.admin.storage.from('attachments').remove(paths)
      await c.admin.from('customer_documents').delete().eq('service_case_id', jobCaseId)
      const { data: wos } = await c.admin.from('work_orders').select('id').eq('case_id', jobCaseId)
      for (const w of (wos ?? []) as Array<{ id: string }>) { await c.admin.from('work_order_profit').delete().eq('work_order_id', w.id); await c.admin.from('time_logs').delete().eq('work_order_id', w.id) }
      await c.admin.from('work_orders').delete().eq('case_id', jobCaseId)
      await c.admin.from('case_notes').delete().eq('case_id', jobCaseId)
      await c.admin.from('case_materials').delete().eq('case_id', jobCaseId)
      await c.admin.from('case_other_costs').delete().eq('case_id', jobCaseId)
      await c.admin.from('service_cases').delete().eq('id', jobCaseId)
    }
    if (jobEmployeeId) await c.admin.from('employees').delete().eq('id', jobEmployeeId)
    if (newOfferId) { for (const t of ['offer_activities', 'offer_line_items']) await c.admin.from(t).delete().eq('offer_id', newOfferId); await c.admin.from('offers').delete().eq('id', newOfferId) }
    for (const id of followupOfferIds) { await c.admin.from('offer_activities').delete().eq('offer_id', id); await c.admin.from('offers').delete().eq('id', id) }
    if (salgOfferId) {
      await c.admin.from('offers').update({ converted_case_id: null }).eq('id', salgOfferId)
      const { data: scs } = await c.admin.from('service_cases').select('id').eq('source_offer_id', salgOfferId)
      for (const r of (scs ?? []) as Array<{ id: string }>) {
        await c.admin.from('customer_tasks').delete().eq('service_case_id', r.id)
        await c.admin.from('case_notes').delete().eq('case_id', r.id)
        await c.admin.from('service_cases').delete().eq('id', r.id)
      }
      await c.admin.from('offer_activities').delete().eq('offer_id', salgOfferId)
      await c.admin.from('offers').delete().eq('id', salgOfferId)
    }
    if (seededEmailIds.length) await c.admin.from('incoming_emails').delete().in('id', seededEmailIds)
    if (otherCaseId) { await c.admin.from('case_notes').delete().eq('case_id', otherCaseId); await c.admin.from('service_cases').delete().eq('id', otherCaseId) }
    if (u25EmailId) await c.admin.from('incoming_emails').update({ service_case_id: null }).eq('id', u25EmailId)
    if (billCaseId) {
      const { data: invs } = await c.admin.from('invoices').select('id').eq('case_id', billCaseId)
      await c.admin.from('case_materials').update({ invoice_line_id: null }).eq('case_id', billCaseId)
      for (const iv of (invs ?? []) as Array<{ id: string }>) { await c.admin.from('audit_logs').delete().eq('entity_id', iv.id); await c.admin.from('invoice_lines').delete().eq('invoice_id', iv.id); await c.admin.from('invoices').delete().eq('id', iv.id) }
      await c.admin.from('case_materials').delete().eq('case_id', billCaseId)
      listCaseIds.push(billCaseId)
    }
    if (u28.invoiceId) {
      await c.admin.from('incoming_invoice_lines').update({ converted_case_material_id: null }).eq('incoming_invoice_id', u28.invoiceId)
      if (u28.caseId) await c.admin.from('case_materials').delete().eq('case_id', u28.caseId)
      for (const t of ['incoming_invoice_lines', 'incoming_invoice_audit_log']) await c.admin.from(t).delete().eq('incoming_invoice_id', u28.invoiceId)
      await c.admin.from('incoming_invoices').delete().eq('id', u28.invoiceId)
    }
    if (u28.caseId) listCaseIds.push(u28.caseId)
    if (u28.supplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u28.supplierId); await c.admin.from('suppliers').delete().eq('id', u28.supplierId) }
    if (u29InvoiceId) { for (const t of ['invoice_payments']) await c.admin.from(t).delete().eq('invoice_id', u29InvoiceId); await c.admin.from('audit_logs').delete().eq('entity_id', u29InvoiceId); await c.admin.from('invoice_lines').delete().eq('invoice_id', u29InvoiceId); await c.admin.from('invoices').delete().eq('id', u29InvoiceId) }
    if (u30.caseId) { await c.admin.from('work_orders').delete().eq('case_id', u30.caseId); listCaseIds.push(u30.caseId) }
    if (u31.caseId) {
      const invs = ((await c.admin.from('invoices').select('id').eq('case_id', u31.caseId)).data ?? []) as Array<{ id: string }>
      if (u31.woId) await c.admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', u31.woId)
      for (const iv of invs) { await c.admin.from('invoice_lines').delete().eq('invoice_id', iv.id); await c.admin.from('audit_logs').delete().eq('entity_id', iv.id); await c.admin.from('invoices').delete().eq('id', iv.id) }
      if (u31.woId) { await c.admin.from('time_logs').delete().eq('work_order_id', u31.woId); await c.admin.from('work_orders').delete().eq('id', u31.woId) }
      listCaseIds.push(u31.caseId)
    }
    if (u32.caseId) {
      const invs = ((await c.admin.from('invoices').select('id').eq('case_id', u32.caseId)).data ?? []) as Array<{ id: string }>
      if (u32.woId) await c.admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', u32.woId)
      for (const iv of invs) await c.admin.from('invoice_predecessors').delete().eq('invoice_id', iv.id)
      for (const iv of invs) { await c.admin.from('invoice_lines').delete().eq('invoice_id', iv.id); await c.admin.from('audit_logs').delete().eq('entity_id', iv.id) }
      for (const iv of invs) await c.admin.from('invoices').delete().eq('id', iv.id)
      if (u32.woId) { await c.admin.from('time_logs').delete().eq('work_order_id', u32.woId); await c.admin.from('work_orders').delete().eq('id', u32.woId) }
      listCaseIds.push(u32.caseId)
    }
    if (u33InvoiceId) {
      const crs = ((await c.admin.from('invoices').select('id').eq('credit_of_invoice_id', u33InvoiceId)).data ?? []) as Array<{ id: string }>
      for (const iv of [...crs.map((x) => x.id), u33InvoiceId]) { await c.admin.from('invoice_lines').delete().eq('invoice_id', iv); await c.admin.from('audit_logs').delete().eq('entity_id', iv) }
      for (const x of crs) await c.admin.from('invoices').delete().eq('id', x.id)
      await c.admin.from('invoices').delete().eq('id', u33InvoiceId)
    }
    if (u34CaseId) { await c.admin.from('case_materials').delete().eq('case_id', u34CaseId); listCaseIds.push(u34CaseId) }
    if (u35CaseId) {
      await c.admin.from('case_materials').update({ invoice_line_id: null }).eq('case_id', u35CaseId)
      const invs = ((await c.admin.from('invoices').select('id, invoice_type').eq('case_id', u35CaseId)).data ?? []) as Array<{ id: string; invoice_type: string }>
      for (const iv of invs) { await c.admin.from('invoice_predecessors').delete().eq('invoice_id', iv.id); await c.admin.from('invoice_lines').delete().eq('invoice_id', iv.id); await c.admin.from('audit_logs').delete().eq('entity_id', iv.id) }
      for (const t of ['final', 'credit', 'progress', 'deposit']) for (const iv of invs.filter((x) => x.invoice_type === t)) await c.admin.from('invoices').delete().eq('id', iv.id)
      await c.admin.from('case_materials').delete().eq('case_id', u35CaseId)
      listCaseIds.push(u35CaseId)
    }
    if (u36CaseId) {
      const invs = ((await c.admin.from('invoices').select('id, invoice_type').eq('case_id', u36CaseId)).data ?? []) as Array<{ id: string; invoice_type: string }>
      for (const iv of invs) { await c.admin.from('invoice_lines').delete().eq('invoice_id', iv.id); await c.admin.from('audit_logs').delete().eq('entity_id', iv.id) }
      for (const t of ['credit', 'progress', 'deposit']) for (const iv of invs.filter((x) => x.invoice_type === t)) await c.admin.from('invoices').delete().eq('id', iv.id)
      listCaseIds.push(u36CaseId)
    }
    if (u37CleanId) { await c.admin.from('invoice_lines').delete().eq('invoice_id', u37CleanId); await c.admin.from('invoices').delete().eq('id', u37CleanId) }
    if (u37InvoiceId) { await c.admin.from('invoice_lines').delete().eq('invoice_id', u37InvoiceId); await c.admin.from('audit_logs').delete().eq('entity_id', u37InvoiceId); await c.admin.from('invoices').delete().eq('id', u37InvoiceId) }
    if (u38.invoiceId) { for (const t of ['incoming_invoice_lines', 'incoming_invoice_audit_log']) await c.admin.from(t).delete().eq('incoming_invoice_id', u38.invoiceId); await c.admin.from('incoming_invoices').delete().eq('id', u38.invoiceId) }
    if (u38.supplierId) await c.admin.from('suppliers').delete().eq('id', u38.supplierId)
    for (const id of u39Ids) { await c.admin.from('audit_logs').delete().eq('entity_id', id); await c.admin.from('customers').delete().eq('id', id) }
    for (const iv of u41.invoiceIds ?? []) { await c.admin.from('invoice_lines').delete().eq('invoice_id', iv); await c.admin.from('invoices').delete().eq('id', iv) }
    if (u41.otherCustomerId) await c.admin.from('customers').delete().eq('id', u41.otherCustomerId)
    if (u41.tokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u41.tokenId)
    if (u41.companySettingsId) await c.admin.from('company_settings').delete().eq('id', u41.companySettingsId)
    if (u41.restoreBank) await c.admin.from('company_settings').update({ bank_reg_no: u41.restoreBank.reg, bank_account: u41.restoreBank.acc }).eq('id', u41.restoreBank.id)
    for (const oid of [u42.copyId, u42.sourceId]) {
      if (!oid) continue
      for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', oid)
      await c.admin.from('audit_logs').delete().eq('entity_id', oid)
      await c.admin.from('offers').delete().eq('id', oid)
    }
    if (u43.caseId) { await c.admin.from('work_orders').delete().eq('case_id', u43.caseId); listCaseIds.push(u43.caseId) }
    if (u46.invoiceId) { await c.admin.from('invoice_lines').delete().eq('invoice_id', u46.invoiceId); await c.admin.from('invoices').delete().eq('id', u46.invoiceId) }
    if (u46.offerId) { await c.admin.from('offer_activities').delete().eq('offer_id', u46.offerId); await c.admin.from('offers').delete().eq('id', u46.offerId) }
    if (u46.companySettingsId) await c.admin.from('company_settings').delete().eq('id', u46.companySettingsId)
    if (u48CaseId) { await c.admin.from('case_materials').delete().eq('case_id', u48CaseId); await c.admin.from('audit_logs').delete().eq('entity_id', u48CaseId); listCaseIds.push(u48CaseId) }
    for (const id of u49Ids) await c.admin.from('invoices').delete().eq('id', id)
    if (u50.offerId) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u50.offerId); await c.admin.from('offers').delete().eq('id', u50.offerId) }
    if (u50.tokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u50.tokenId)
    if (u51.offerId) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u51.offerId); await c.admin.from('offers').delete().eq('id', u51.offerId) }
    if (u51.supplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u51.supplierId); await c.admin.from('suppliers').delete().eq('id', u51.supplierId) }
    if (u57OfferId) {
      const { data: auto } = await c.admin.from('service_cases').select('id').eq('source_offer_id', u57OfferId)
      for (const x of (auto ?? []) as Array<{ id: string }>) listCaseIds.push(x.id)
      await c.admin.from('offers').update({ converted_case_id: null }).eq('id', u57OfferId)
      for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u57OfferId)
      await c.admin.from('audit_logs').delete().eq('entity_id', u57OfferId)
    }
    for (const oid of u58Ids) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', oid); await c.admin.from('offers').delete().eq('id', oid) }
    if (u54OfferId) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u54OfferId); await c.admin.from('audit_logs').delete().eq('entity_id', u54OfferId); await c.admin.from('offers').delete().eq('id', u54OfferId) }
    if (u56TokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u56TokenId)
    if (u60OfferId) {
      for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u60OfferId)
      await c.admin.from('audit_logs').delete().eq('entity_id', u60OfferId)
      await c.admin.from('offers').delete().eq('id', u60OfferId)
    }
    // send-dialogens forhåndsvisning kan oprette et portal-token til testkunden
    if (u60Since && profitCustomerId) await c.admin.from('portal_access_tokens').delete().eq('customer_id', profitCustomerId).gte('created_at', u60Since)
    for (const id of u69TaskIds) await c.admin.from('customer_tasks').delete().eq('id', id)
    if (u69TokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u69TokenId)
    if (u74OfferId) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u74OfferId); await c.admin.from('offers').delete().eq('id', u74OfferId) }
    if (u75ProductId) await c.admin.from('product_catalog').delete().eq('id', u75ProductId)
    if (u77ProductId) await c.admin.from('product_catalog').delete().eq('id', u77ProductId)
    if (u77SupplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u77SupplierId); await c.admin.from('suppliers').delete().eq('id', u77SupplierId) }
    if (u78InvoiceId) await c.admin.from('incoming_invoices').delete().eq('id', u78InvoiceId)
    if (u82SolarIds.length) await c.admin.from('solar_products').delete().in('id', u82SolarIds)
    if (u83OfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', u83OfferId); await c.admin.from('offers').delete().eq('id', u83OfferId) }
    if (u83SupplierId) await c.admin.from('suppliers').delete().eq('id', u83SupplierId)
    if (u84OfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', u84OfferId); await c.admin.from('offers').delete().eq('id', u84OfferId) }
    if (u84SupplierId) { await c.admin.from('customer_supplier_prices').delete().eq('supplier_id', u84SupplierId); await c.admin.from('supplier_products').delete().eq('supplier_id', u84SupplierId); await c.admin.from('suppliers').delete().eq('id', u84SupplierId) }
    if (u84PackageId) await c.admin.from('packages').delete().eq('id', u84PackageId)
    if (u109TokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u109TokenId)
    if (u134TokenId) await c.admin.from('portal_access_tokens').delete().eq('id', u134TokenId)
    if (u134OfferId) await c.admin.from('offers').delete().eq('id', u134OfferId)
    if (u134DraftId) await c.admin.from('offers').delete().eq('id', u134DraftId)
    for (const id of u115CustomerIds) await c.admin.from('customers').delete().eq('id', id)
    if (u114MessageId) await c.admin.from('portal_messages').delete().eq('id', u114MessageId)
    if (u122LeadId) await c.admin.from('leads').delete().eq('id', u122LeadId)
    for (const id of u128LeadIds) await c.admin.from('leads').delete().eq('id', id)
    if (u113EmailIds.length) await c.admin.from('incoming_emails').delete().in('id', u113EmailIds)
    if (u111OfferId) await c.admin.from('offers').delete().eq('id', u111OfferId)
    if (u111SupplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u111SupplierId); await c.admin.from('suppliers').delete().eq('id', u111SupplierId) }
    if (u110OfferId) { await c.admin.from('offer_activities').delete().eq('offer_id', u110OfferId); await c.admin.from('offer_line_items').delete().eq('offer_id', u110OfferId); await c.admin.from('offers').delete().eq('id', u110OfferId) }
    if (u109InvoiceId) await c.admin.from('invoices').delete().eq('id', u109InvoiceId)
    if (u109OfferId) { await c.admin.from('offer_activities').delete().eq('offer_id', u109OfferId); await c.admin.from('offer_line_items').delete().eq('offer_id', u109OfferId); await c.admin.from('offers').delete().eq('id', u109OfferId) }
    for (const id of u100OfferIds) { await c.admin.from('offer_activities').delete().eq('offer_id', id); await c.admin.from('offers').delete().eq('id', id) }
    if (u98CustomerId) { await c.admin.from('portal_messages').delete().eq('customer_id', u98CustomerId); await c.admin.from('customers').delete().eq('id', u98CustomerId) }
    if (u95OfferId) { await c.admin.from('offer_activities').delete().eq('offer_id', u95OfferId); await c.admin.from('offer_line_items').delete().eq('offer_id', u95OfferId); await c.admin.from('offers').delete().eq('id', u95OfferId) }
    if (u95SupplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u95SupplierId); await c.admin.from('suppliers').delete().eq('id', u95SupplierId) }
    if (u94InvoiceId) await c.admin.from('invoices').delete().eq('id', u94InvoiceId)
    if (u93EmailId) await c.admin.from('incoming_emails').delete().eq('id', u93EmailId)
    if (u93OfferId) await c.admin.from('offers').delete().eq('id', u93OfferId)
    if (u93CustomerId) await c.admin.from('customers').delete().eq('id', u93CustomerId)
    for (const id of u120InvoiceIds) { await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', id); await c.admin.from('incoming_invoices').delete().eq('id', id) }
    if (u120EmailIds.length) await c.admin.from('incoming_emails').delete().in('id', u120EmailIds)
    if (u120SupplierId) await c.admin.from('suppliers').delete().eq('id', u120SupplierId)
    for (const id of u120SupplierIds) await c.admin.from('suppliers').delete().eq('id', id)
    if (u92InvoiceId) { await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', u92InvoiceId); await c.admin.from('incoming_invoices').delete().eq('id', u92InvoiceId) }
    if (u149InvoiceId) { await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', u149InvoiceId); await c.admin.from('incoming_invoices').delete().eq('id', u149InvoiceId) }
    if (u116InvoiceId) await c.admin.from('invoices').delete().eq('id', u116InvoiceId)
    if (u117WorkOrderId) await c.admin.from('work_orders').delete().eq('id', u117WorkOrderId)
    if (u119WorkOrderId) { await c.admin.from('time_logs').delete().eq('work_order_id', u119WorkOrderId); await c.admin.from('work_orders').delete().eq('id', u119WorkOrderId) }
    for (const id of u91InvoiceIds) { await c.admin.from('invoice_lines').delete().eq('invoice_id', id); await c.admin.from('invoices').delete().eq('id', id) }
    if (u89EmployeeId) { await c.admin.from('employee_compensation').delete().eq('employee_id', u89EmployeeId); await c.admin.from('employees').delete().eq('id', u89EmployeeId) }
    if (u88OfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', u88OfferId); await c.admin.from('offers').delete().eq('id', u88OfferId) }
    if (u87OfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', u87OfferId); await c.admin.from('offers').delete().eq('id', u87OfferId) }
    if (u87SupplierId) { await c.admin.from('supplier_products').delete().eq('supplier_id', u87SupplierId); await c.admin.from('suppliers').delete().eq('id', u87SupplierId) }
    if (u81OfferId) { await c.admin.from('offer_line_items').delete().eq('offer_id', u81OfferId); await c.admin.from('offers').delete().eq('id', u81OfferId) }
    if (u77OfferId) { for (const t of ['offer_line_items', 'offer_activities']) await c.admin.from(t).delete().eq('offer_id', u77OfferId); await c.admin.from('offers').delete().eq('id', u77OfferId) }
    for (const id of listCaseIds) { await c.admin.from('case_notes').delete().eq('case_id', id); await c.admin.from('case_materials').delete().eq('case_id', id); await c.admin.from('case_other_costs').delete().eq('case_id', id); { const { data: ws } = await c.admin.from('work_orders').select('id').eq('case_id', id); for (const w of (ws ?? []) as Array<{ id: string }>) await c.admin.from('time_logs').delete().eq('work_order_id', w.id) } await c.admin.from('work_orders').delete().eq('case_id', id); await c.admin.from('service_cases').delete().eq('id', id) }
    if (u57OfferId) await c.admin.from('offers').delete().eq('id', u57OfferId)
    if (searchCustomerId) await c.admin.from('customers').delete().eq('id', searchCustomerId)
    if (u30.employeeId) await c.admin.from('employees').delete().eq('id', u30.employeeId)
    if (u31.employeeId) await c.admin.from('employees').delete().eq('id', u31.employeeId)
    for (const e of u43.employeeIds ?? []) await c.admin.from('employees').delete().eq('id', e)
    if (u32.employeeId) await c.admin.from('employees').delete().eq('id', u32.employeeId)
    for (const id of u27LeadIds) { await c.admin.from('lead_activities').delete().eq('lead_id', id); await c.admin.from('leads').delete().eq('id', id) }
    if (u27CustomerId) await c.admin.from('customers').delete().eq('id', u27CustomerId)
    if (u25EmailId) await c.admin.from('incoming_emails').delete().eq('id', u25EmailId)
    if (siteCaseId) { await c.admin.from('case_notes').delete().eq('case_id', siteCaseId); await c.admin.from('service_cases').delete().eq('id', siteCaseId) }
    if (aoSupplierId) {
      const { data: ps } = await c.admin.from('supplier_products').select('id').eq('supplier_id', aoSupplierId)
      const pids = ((ps ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (pids.length) await c.admin.from('price_history').delete().in('supplier_product_id', pids)
      await c.admin.from('supplier_products').delete().eq('supplier_id', aoSupplierId)
      await c.admin.from('import_batches').delete().eq('supplier_id', aoSupplierId)
      await c.admin.from('supplier_settings').delete().eq('supplier_id', aoSupplierId)
      await c.admin.from('suppliers').delete().eq('id', aoSupplierId)
    }
    if (draftInvoiceId) { await c.admin.from('audit_logs').delete().eq('entity_id', draftInvoiceId); await c.admin.from('invoice_lines').delete().eq('invoice_id', draftInvoiceId); await c.admin.from('invoices').delete().eq('id', draftInvoiceId) }
    if (draftCustomerId) { await c.admin.from('customer_contacts').delete().eq('customer_id', draftCustomerId); await c.admin.from('customers').delete().eq('id', draftCustomerId) }
    for (const id of uploadedInvoiceIds) {
      const { data: row } = await c.admin.from('incoming_invoices').select('file_url').eq('id', id).maybeSingle()
      const fu = (row as { file_url?: string } | null)?.file_url
      if (fu && fu.startsWith('attachments/')) await c.admin.storage.from('attachments').remove([fu.slice('attachments/'.length)])
      for (const t of ['incoming_invoice_lines', 'incoming_invoice_audit_log']) await c.admin.from(t).delete().eq('incoming_invoice_id', id)
      await c.admin.from('incoming_invoices').delete().eq('id', id)
    }
    if (profitCustomerId) await c.admin.from('customers').delete().eq('id', profitCustomerId)
    if (ctrlInvoiceId) { await c.admin.from('incoming_invoice_lines').delete().eq('incoming_invoice_id', ctrlInvoiceId); await c.admin.from('incoming_invoices').delete().eq('id', ctrlInvoiceId) }
    for (const sid of cmpSupplierIds) { await c.admin.from('supplier_products').delete().eq('supplier_id', sid); await c.admin.from('suppliers').delete().eq('id', sid) }
    for (const u of users) {
      await c.admin.from('profiles').delete().eq('id', u.id)
      await c.admin.auth.admin.deleteUser(u.id)
    }
  }
  return out
}

export function formatUiE2e(c: UiE2eCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'UI-E2E (staging, syntetiske brugere, headless):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(28)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} UI-checks som forventet`].join('\n')
}
