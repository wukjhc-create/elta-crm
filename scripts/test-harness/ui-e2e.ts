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
 *   U28 leverandørfaktura → sag: "Forhåndsvis & godkend" → godkendt, linjer konverteret til sagsmaterialer (kobling
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
import { mkdirSync, writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface UiE2eCheck { id: string; ok: boolean; note: string }

const PROD_REFS = ['guhsjwewajyonehivffc']
const NEUTRALIZE = [
  'AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID',
  'GRAPH_MAILBOX', 'GRAPH_MAILBOXES', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PORT', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME',
  'OPENAI_API_KEY', 'OPENWEATHER_API_KEY', 'SFTP_PROXY_URL', 'AO_INVOICE_API_BASE_URL', 'AO_INVOICE_ENDPOINT_PATH', 'LM_INVOICE_DIR',
  'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'CRON_SECRET', 'ENCRYPTION_KEY', 'ADMIN_ALERT_EMAIL', 'CONTACT_FORM_API_KEY',
  'AGENT_LIVE_SEND_ENABLED', 'AUTO_CREATE_CASES_ENABLED',
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
  smoke: ['U10', 'U11', 'U15', 'U20', 'U37', 'U52'],
  sales: ['U7', 'U8', 'U9', 'U14', 'U24', 'U27', 'U42', 'U45', 'U47', 'U51', 'U54', 'U55', 'U57', 'U58', 'U60'],
  montor: ['U11', 'U21', 'U30', 'U34', 'U40', 'U43', 'U44', 'U48'],
  economy: ['U12', 'U15', 'U16', 'U17', 'U18', 'U19', 'U26', 'U28', 'U29', 'U31', 'U32', 'U33', 'U35', 'U36', 'U37', 'U38', 'U39', 'U46', 'U49'],
  'portal-mail': ['U10', 'U22', 'U23', 'U25', 'U41', 'U50', 'U52', 'U53', 'U56', 'U61'],
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
  const mkUser = async (role: string) => {
    const email = `ui-e2e-${role === 'montør' ? 'montoer' : role}-${stamp}@harness.test`
    const password = `Ui!${randomBytes(15).toString('base64url')}`
    const { data, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `UI E2E ${role}` } })
    if (error || !data.user) throw new Error(`createUser ${role}: ${error?.message}`)
    users.push({ id: data.user.id, email, password, role })
    const { error: pErr } = await c.admin.from('profiles').update({ role, is_active: true, full_name: `UI E2E ${role}` }).eq('id', data.user.id)
    if (pErr) throw new Error(`profil ${role}: ${pErr.message}`)
    return users[users.length - 1]
  }

  const env: Record<string, string> = { ...(process.env as Record<string, string>), NEXT_PUBLIC_APP_URL: base, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port),
    // N11: staging har RLS 00181 -> montør må starte eget job (prod: flaget er OFF indtil 00181 er godkendt)
    MONTOR_START_JOB_ENABLED: 'true',
    // `next dev` genstarter ved 80 % af heap-grænsen, og efter en genstart fejler resten af kørslen (O1).
    // Mere heap KUN til testserveren (ændrer ikke next.config for andre).
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=3584`.trim() }
  for (const k of NEUTRALIZE) env[k] = ''

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
  const want = (id: string) => only.length === 0 || only.includes(id)
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
  const listCaseIds: string[] = []
  const seededEmailIds: string[] = []
  let otherCaseId: string | null = null
  let salgOfferId: string | null = null
  const followupOfferIds: string[] = []

  try {
    const adminUser = await mkUser('admin')
    const montor = await mkUser('montør')
    const salg = await mkUser('salg')

    server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', String(port)], { cwd: process.cwd(), env, shell: process.platform === 'win32' })
    server.stdout?.on('data', (d) => serverLog.push(String(d)))
    server.stderr?.on('data', (d) => serverLog.push(String(d)))
    if (!(await waitForHttp(`${base}/login`, 240_000))) {
      return [{ id: 'dev-server', ok: false, note: `startede ikke: ${serverLog.join('').slice(-300)}` }]
    }

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
      const method = (await np.locator('form').first().getAttribute('method').catch(() => null)) ?? ''
      out.push({ id: 'U22 login før hydrering: adgangskode aldrig i URL', ok: !url.includes(secret) && !/password=/.test(url) && method.toLowerCase() === 'post',
        note: `url=${new URL(url).pathname}${new URL(url).search ? '?…' : ''} · form method=${method || '(ingen)'}` })
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
        const pa = { forste_klik: forsteKlik, saelger_vist: saelgerVist, ingen_kundefejl: !kundeFejl, accepteret: offerStatus === 'accepted', sag: !!sag?.id,
          saelger_ansvarlig: sag?.created_by === adminUser.id, tidslinje: akt === 1 }
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
        const audits = draftInvoiceId ? (await c.admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('entity_id', draftInvoiceId)).count ?? 0 : 0
        r.audit = audits >= 3
        out.push({ id: 'U15 fakturakladde (admin)', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U16 e-conomic-opsætning (N12) — kun opsætning, ingen bogføring
      if (want('U16') && (cmpSupplierIds[0])) {
        const r: Record<string, boolean> = {}
        const supId = cmpSupplierIds[0]
        const saveNo = async (value: string) => {
          await gotoSafe(a.page, `${base}/dashboard/settings/suppliers/${supId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByRole('button', { name: 'Rediger' }).first().click({ timeout: 60_000 }).catch(() => {})
          await a.page.locator('#economic_supplier_number').fill(value).catch(() => {})
          await a.page.getByRole('button', { name: 'Gem ændringer' }).click().catch(() => {})
          await a.page.waitForTimeout(2500)
          return ((await c.admin.from('suppliers').select('external_supplier_id, external_provider').eq('id', supId).maybeSingle()).data ?? {}) as Record<string, string | null>
        }
        const ok1 = await saveNo('1001')
        r.leverandoernr_gemt = ok1.external_supplier_id === '1001' && ok1.external_provider === 'economic'
        const bad = await saveNo('abc')
        r.ugyldigt_afvist = bad.external_supplier_id === '1001'
        await gotoSafe(a.page, `${base}/dashboard/settings/economic`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = a.page.getByTestId('economic-readiness')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.count()) ? await card.innerText() : ''
        r.tjekliste = /Klar til bogføring/.test(txt) && /Omkostningskonto/.test(txt) && /Kassekladde/.test(txt) && /Leverandører koblet/.test(txt) && /Kundefakturaer/.test(txt)
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u16-economic.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U16 e-conomic-opsætning (admin)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U17 AO-prisfil-import (ISO-8859-1). Kræver en leverandør med kode 'AO' (AO-konfiguration vælges på koden).
      if (want('U17')) {
        const r: Record<string, boolean> = {}
        const existingAo = (await c.admin.from('suppliers').select('id').ilike('code', 'AO').maybeSingle()).data as { id?: string } | null
        let note = ''
        if (existingAo?.id) note = 'staging har allerede en AO-leverandør — springer over for ikke at røre dens data'
        else {
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
        await gotoSafe(a.page, `${base}/dashboard/incoming-invoices/${u28.invoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Forhåndsvis & godkend/ }).click({ timeout: 60_000 }).catch(() => {})
        const ack = a.page.locator('input[type="checkbox"]').last()
        if (await ack.isVisible().catch(() => false)) await ack.check().catch(() => {})
        await a.page.getByRole('button', { name: /^(Godkend|Konvertér linjer)$/ }).last().click({ timeout: 60_000 }).catch(() => {})
        let st = ''
        for (let i = 0; i < 20 && st !== 'approved'; i++) {
          st = String(((await c.admin.from('incoming_invoices').select('status').eq('id', u28.invoiceId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (st !== 'approved') await new Promise((res) => setTimeout(res, 1000))
        }
        r.godkendt = st === 'approved'
        const mats = ((await c.admin.from('case_materials').select('id, source, source_incoming_invoice_line_id, quantity, unit_cost').eq('case_id', u28.caseId)).data ?? []) as Array<{ id: string; source: string; source_incoming_invoice_line_id: string | null; quantity: number; unit_cost: number }>
        r.materialer = mats.length === 2 && mats.every((m0) => m0.source === 'supplier_invoice' && !!m0.source_incoming_invoice_line_id)
        const lines = ((await c.admin.from('incoming_invoice_lines').select('converted_case_material_id').eq('incoming_invoice_id', u28.invoiceId)).data ?? []) as Array<{ converted_case_material_id: string | null }>
        r.kobling_begge_veje = lines.length === 2 && lines.every((l) => !!l.converted_case_material_id && mats.some((m0) => m0.id === l.converted_case_material_id))
        const ext = ((await c.admin.from('incoming_invoices').select('external_invoice_id, posted_at').eq('id', u28.invoiceId).maybeSingle()).data as { external_invoice_id?: string | null; posted_at?: string | null } | null)
        r.ingen_bogfoering = !ext?.external_invoice_id && !ext?.posted_at
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u28-godkend-faktura.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U28 leverandørfaktura → sag', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U29 betaling registreret på kundefaktura
      if (want('U29') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const ins = await c.admin.from('invoices').insert([{ invoice_number: `UI-E2E-B-${stamp}`, customer_id: profitCustomerId, status: 'sent',
          total_amount: 800, tax_amount: 200, final_amount: 1000, due_date: new Date().toISOString().slice(0, 10) }]).select('id')
        u29InvoiceId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        await gotoSafe(a.page, `${base}/dashboard/invoices/${u29InvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        const audits = u29InvoiceId ? ((await c.admin.from('audit_logs').select('action, user_id').eq('entity_id', u29InvoiceId)).data ?? []) as Array<{ action: string; user_id: string | null }> : []
        r.audit_med_bruger = audits.some((x) => x.user_id === adminUser.id)
        out.push({ id: 'U29 betaling på faktura', ok: !!u29InvoiceId && Object.values(r).every(Boolean),
          note: `${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · audit=${JSON.stringify(audits.map((x) => x.action))}` })
      }

      // U30 planlægning fra kalenderen
      if (want('U30') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `Harness Planlagt ${stamp}`, email: `plan-${stamp}@harness.test`, role: 'montør', active: true }]).select('id')
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
        const emp = await c.admin.from('employees').insert([{ name: `Harness Timer ${stamp}`, email: `timer-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500 }]).select('id')
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
        ]).select('id, description, sale_amount, hours') : null
        const tls = (tl?.data ?? []) as Array<{ id: string; description: string; sale_amount: number | null; hours: number | null }>
        const billable = tls.find((x) => x.description === 'fakturerbar')
        const expected = billable?.sale_amount != null ? Number(billable.sale_amount) : 1000
        const seedErr = !u31.caseId ? `sag: ${sc.error?.message}` : !u31.woId ? `ordre: ${wo?.error?.message}` : tls.length !== 3 ? `timer: ${tl?.error?.message}` : ''
        await gotoSafe(a.page, `${base}/dashboard/orders/${u31.caseId}?tab=fakturakladde`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByRole('button', { name: /Opret del-faktura/ }).first().waitFor({ timeout: 90_000 }).catch(() => {})
        r.aaben_timer_advarer = (await a.page.getByText(/åben timer/i).count()) > 0
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
        r.oevrige_ikke_faktureret = after.filter((x) => x.description !== 'fakturerbar').every((x) => !x.invoice_line_id)
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u31-timer-faktura.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U31 timer → faktura', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · forventet=${expected} linjer=${JSON.stringify(lines.map((l) => [l.description, l.total_price]))} total=${inv?.total_amount}` })
      }

      // U32 slutfaktura med forskudsfradrag og frosset timesats (faktura, GO-LIVE)
      if (want('U32') && profitCustomerId) {
        const r: Record<string, boolean> = {}
        const emp = await c.admin.from('employees').insert([{ name: `Harness Slut ${stamp}`, email: `slut-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500 }]).select('id')
        u32.employeeId = (emp.data?.[0] as { id?: string } | undefined)?.id
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] slutfaktura ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId }]).select('id')
        u32.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const wo = u32.caseId ? await c.admin.from('work_orders').insert([{ case_id: u32.caseId, title: `Slut ${stamp}`, status: 'done', assigned_employee_id: u32.employeeId }]).select('id') : null
        u32.woId = (wo?.data?.[0] as { id?: string } | undefined)?.id
        const t0 = Date.now() - 5 * 86400_000
        const tl = u32.woId && u32.employeeId ? await c.admin.from('time_logs').insert([{ employee_id: u32.employeeId, work_order_id: u32.woId,
          start_time: new Date(t0).toISOString(), end_time: new Date(t0 + 2 * 3600_000).toISOString(), billable: true }]).select('id, sale_amount') : null
        const tlRow = (tl?.data?.[0] as { id?: string; sale_amount?: number | null } | undefined)
        r.snapshot_sat = Number(tlRow?.sale_amount) === 1000
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
        const lines = fin?.id ? ((await c.admin.from('invoice_lines').select('id, description, total_price, source_time_log_id').eq('invoice_id', fin.id)).data ?? []) as Array<{ id: string; description: string; total_price: number; source_time_log_id: string | null }> : []
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
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] kreditfradrag ${stamp}`, customer_id: profitCustomerId, status: 'in_progress',
          priority: 'medium', source: 'manual', created_by: adminUser.id, payer_customer_id: profitCustomerId }]).select('id')
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
        const mkEmp = async (n: string) => ((await c.admin.from('employees').insert([{ name: `Harness ${n} ${stamp}`, email: `${n.toLowerCase()}-${stamp}@harness.test`, role: 'montør', active: true }]).select('id')).data?.[0] as { id?: string } | undefined)?.id
        const empA = await mkEmp('Anders'), empB = await mkEmp('Bente')
        u43.employeeIds = [empA, empB].filter((x): x is string => !!x)
        const sc = await c.admin.from('service_cases').insert([{ title: `[HARNESS] omplan ${stamp}`, customer_id: profitCustomerId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: adminUser.id }]).select('id')
        u43.caseId = (sc.data?.[0] as { id?: string } | undefined)?.id
        const dayKey = (offset: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + offset * 86400_000))
        const d1 = dayKey(1), d3 = dayKey(3)
        const woTitle = `Omplan ${stamp}`
        const wo = u43.caseId && empA ? await c.admin.from('work_orders').insert([{ case_id: u43.caseId, title: woTitle, status: 'planned', scheduled_date: d1, assigned_employee_id: empA }]).select('id') : null
        u43.woId = (wo?.data?.[0] as { id?: string } | undefined)?.id
        const seedErr = u43.woId && empB ? '' : `SEED: ${wo?.error?.message ?? sc.error?.message ?? 'medarbejder'} · `
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${d1}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByText(woTitle).first().click({ timeout: 90_000 }).catch(() => {})
        const dlg = a.page.locator('[aria-labelledby="edit-wo-title"]')
        await dlg.waitFor({ timeout: 30_000 }).catch(() => {})
        await dlg.locator('input[type="date"]').fill(d3).catch(() => {})
        await dlg.locator('select').first().selectOption(empB ?? '').catch(() => {})
        await dlg.getByRole('button', { name: /Gem ændringer/ }).click({ timeout: 30_000 }).catch(() => {})
        type W = { scheduled_date?: string; assigned_employee_id?: string; status?: string }
        const readW = async (): Promise<W | null> => ((await c.admin.from('work_orders').select('scheduled_date, assigned_employee_id, status').eq('id', u43.woId ?? '').maybeSingle()).data as W | null)
        let w: W | null = await readW()
        for (let i = 0; i < 20 && w?.scheduled_date !== d3; i++) { await new Promise((res) => setTimeout(res, 1000)); w = await readW() }
        r.ny_dato = w?.scheduled_date === d3
        r.ny_montoer = w?.assigned_employee_id === empB
        r.stadig_planlagt = w?.status === 'planned'
        await gotoSafe(a.page, `${base}/dashboard/calendar?date=${d3}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.vist_paa_ny_dag = (await a.page.getByText(woTitle).count()) > 0
        await a.page.screenshot({ caret: 'initial', path: join(shots, 'u43-omplanlaegning.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U43 omplanlægning fra kalenderen', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
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
        r.fire_punkter = (await card.locator('li').count()) === 4
        r.montoer_status_korrekt = (await a.page.getByTestId('pilot-setup-montors').getAttribute('data-ok').catch(() => null)) === (expectMontorsOk ? 'ja' : 'nej')
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
        r.konverteret_lead_vundet = st(leadB) === 'won'
        r.tabt_lead_uaendret = st(leadC) === 'lost'
        const acts = ((await c.admin.from('lead_activities').select('lead_id, description').in('lead_id', [leadA, leadB].filter(Boolean) as string[])).data ?? []) as Array<{ lead_id: string; description: string }>
        r.aktivitet_logget = acts.filter((x) => x.description.includes('Vundet')).length === 2
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
        a.page.once('dialog', (d) => { d.accept().catch(() => {}) })
        await a.page.getByRole('button', { name: 'Sendt', exact: true }).first().click({ timeout: 30_000 }).catch(() => {})
        let st: string | undefined
        for (let i = 0; i < 20; i++) { st = await readStatus(); if (st === 'sent') break; await new Promise((res) => setTimeout(res, 1000)) }
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
        if ((await m.page.getByText('Du har ikke adgang').count()) > 0) denied.push(path)
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
        await m.page.getByRole('button', { name: '✓ Afslut' }).first().click({ timeout: 30_000 }).catch(() => {})
        let woStatus = ''
        for (let i = 0; i < 15 && woStatus !== 'done'; i++) {
          woStatus = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (woStatus !== 'done') await new Promise((res) => setTimeout(res, 1000))
        }
        r.afsluttet = woStatus === 'done'
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

      // U40 montør på egen sag: kun relevante faner, materialer uden priser (kontoret prissætter)
      if (want('U40') && jobCaseId) {
        const r: Record<string, boolean> = {}
        await gotoSafe(m.page, `${base}/dashboard/orders/${jobCaseId}?tab=materialer`, { waitUntil: 'networkidle', timeout: 180_000 })
        await m.page.getByRole('button', { name: /Tilføj (første )?materiale/ }).first().waitFor({ timeout: 90_000 }).catch(() => {})
        const tabNames = (await m.page.locator('button').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim())
        r.ingen_kontorfaner = !tabNames.some((t) => /^(Fakturakladde|Handlinger|Økonomi)/.test(t))
        r.ingen_kostkolonne = (await m.page.getByRole('columnheader', { name: 'Kostpris' }).count()) === 0
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
        await a.page.getByRole('columnheader', { name: 'Kostpris' }).waitFor({ timeout: 60_000 }).catch(() => {})
        r.kontor_ser_priser = (await a.page.getByRole('columnheader', { name: 'Kostpris' }).count()) > 0 && (await a.page.getByRole('button', { name: /^Handlinger/ }).count()) > 0
        await m.page.screenshot({ caret: 'initial', path: join(shots, 'u40-montor-materialer.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U40 montør: egen sag uden priser', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
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
        await a.page.getByText(/Stage-fakturaer på sagen|Fakturakladde|Forskudsfaktura|Slutfaktura/).first().waitFor({ timeout: 90_000 }).catch(() => {})
        r.admin_fakturer_paa_sag = /tab=fakturakladde/.test(a.page.url()) && (await a.page.getByText(/Stage-fakturaer på sagen|Slutfaktura/).count()) > 0
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
        for (let i = 0; i < 20; i++) { if ((await dlg.locator('#valid_until').inputValue().catch(() => '')) === expectIso) break; await new Promise((res) => setTimeout(res, 500)) }
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
        note: `${!sp.ok ? `salg-login fejlede (${loginFailures.join(' | ')}) · ` : ''}${!salgOfferId ? `SEED: ${off?.error?.message?.slice(0, 80)} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
    }

    // Dev-serveren kan genstarte ved hukommelsespres (maskinen har ~6 GB). Netværksfejl i browseren
    // under en sådan genstart er miljø, ikke app-fejl — de vises i noten, men fejler ikke U5.
    // Alle andre side-/konsolfejl fejler stadig.
    const restarts = (serverLog.join('').match(/memory threshold, restarting/g) ?? []).length
    const envRe = /network error|Failed to fetch|WebSocket is already in CLOSING or CLOSED state|ERR_CONNECTION/
    const envErrors = restarts > 0 ? pageErrors.filter((x) => envRe.test(x)) : []
    const realErrors = pageErrors.filter((x) => !envErrors.includes(x))
    const envNote = restarts > 0 ? ` · dev-server genstartet ${restarts}× (hukommelse); ${envErrors.length} netværksfejl under genstart henført til miljø${envErrors.length ? `: ${envErrors.slice(0, 2).join(' | ').slice(0, 300)}` : ''}` : ''
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
    for (const id of listCaseIds) { await c.admin.from('case_notes').delete().eq('case_id', id); await c.admin.from('service_cases').delete().eq('id', id) }
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
