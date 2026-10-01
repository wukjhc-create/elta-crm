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
import { mkdirSync, writeFileSync } from 'fs'
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
    MONTOR_START_JOB_ENABLED: 'true' }
  for (const k of NEUTRALIZE) env[k] = ''

  let server: ChildProcess | null = null
  const serverLog: string[] = []
  const shots = join(tmpdir(), 'elta-ui-e2e')
  mkdirSync(shots, { recursive: true })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const pageErrors: string[] = []
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
        pageErrors.push(`${u.email.split('@')[0].replace(/-\d+$/, '')} @ ${new URL(page.url()).pathname}: ${e.message.replace(/\s+/g, ' ').slice(0, 700)}`)
        // Hydration-fejl: fuld besked (inkl. React-diff) til fil, så årsagen kan findes uden gæt
        if (/Hydration/.test(e.message)) writeFileSync(join(shots, `hydration-${Date.now()}.txt`), `${page.url()}\n${e.message}\n${e.stack ?? ''}`)
      })
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools|\[HMR\]|Failed to load resource/.test(m.text())) pageErrors.push(`${u.email.split('@')[0].replace(/-\d+$/, '')} @ ${new URL(page.url()).pathname}: ${m.text().replace(/%c/g, '').replace(/background:[^;]*;|color:[^;]*;|border-radius:[^;]*;|light-dark\([^)]*\)\)?;?/g, '').replace(/\s+/g, ' ').trim().slice(0, 260)}`) })
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
        await page.screenshot({ path: join(shots, `login-fejl-${Date.now()}.png`), fullPage: true }).catch(() => {})
      }
      return { ctx, page, ok }
    }

    // U22 — S2: login-formularen før hydrering. JS slået fra = værste fald; hverken klik eller Enter må give GET med adgangskoden.
    {
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
      await a.page.goto(`${base}/dashboard/agents`, { waitUntil: 'networkidle', timeout: 180_000 })
      await a.page.screenshot({ path: join(shots, 'agent-inbox-admin.png'), fullPage: true })
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

      await a.page.goto(`${base}/dashboard/pilot-health`, { waitUntil: 'networkidle', timeout: 180_000 })
      await a.page.screenshot({ path: join(shots, 'pilot-health-admin.png'), fullPage: true })
      const titles = ['System', 'Crons', 'Brugere', 'Agenter & sikkerhedsflag', 'Incidents', 'Integrationer', 'DB-/sikkerhed (live anon-prober)']
      const seen: string[] = []
      for (const t of titles) if (await a.page.getByRole('heading', { name: t, exact: true }).isVisible()) seen.push(t)
      const failedSections = await a.page.getByText('Kunne ikke hentes').count()
      const liveOff = (await a.page.getByText('OFF (ingen agent-afsendelse mulig)').count()) > 0
      out.push({ id: 'U3 Pilot Health (admin)', ok: seen.length === 7 && failedSections === 0 && liveOff,
        note: `sektioner=${seen.length}/7 · fejlede sektioner=${failedSections} · live-send OFF vist=${liveOff ? 'ja' : 'nej'}` })
      // U7 lønsomhed (Profit Engine): tilbud med timelinje UDEN kost + materiale MED kost -> kortet viser realistisk DB,
      // dom og advarsel om timekost; ingen fejl. Probe-tilbud ryddes i finally.
      {
        const { data: cust } = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-P-${stamp}`, company_name: '[HARNESS] ui-profit', contact_person: 'P', email: `ui-profit-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        profitCustomerId = (cust?.[0] as { id?: string } | undefined)?.id ?? null
        const { data: off } = await c.admin.from('offers').insert([{ offer_number: `UI-E2E-P-${stamp}`, title: '[HARNESS] lønsomhed', created_by: adminUser.id, customer_id: profitCustomerId }]).select('id')
        profitOfferId = (off?.[0] as { id?: string } | undefined)?.id ?? null
        const linesRes = profitOfferId ? await c.admin.from('offer_line_items').insert([
          { offer_id: profitOfferId, position: 1, description: 'Kabel', quantity: 10, unit: 'm', unit_price: 100, total: 1000, cost_price: 60 },
          { offer_id: profitOfferId, position: 2, description: 'Montage', quantity: 8, unit: 'time', unit_price: 600, total: 4800, cost_price: 0 },
        ]) : null
        const seedErr = !profitOfferId ? 'tilbud ikke oprettet' : linesRes?.error ? `linjer: ${linesRes.error.message.slice(0, 80)}` : ''
        await a.page.goto(`${base}/dashboard/offers/${profitOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-profit-card').waitFor({ timeout: 60_000 }).catch(() => {})
        const card = a.page.getByTestId('offer-profit-card')
        const txt = (await card.count()) ? await card.innerText() : ''
        await a.page.screenshot({ path: join(shots, 'u7-loensomhed.png'), fullPage: true }).catch(() => {})
        const profit = { kort: /Lønsomhed/.test(txt), realistisk: /Realistisk DB/.test(txt), dom: /(Sund lønsomhed|Under mål-DB|Under minimum-DB|Usikker)/.test(txt),
          timekost: /timekost/i.test(txt) }
        out.push({ id: 'U7 lønsomhed på tilbud (admin)', ok: !seedErr && Object.values(profit).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(profit).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U8 grossist-sammenligning: samme EAN billigere hos anden leverandør -> kort med besparelse 200 kr
      {
        const ean = `57${String(stamp).slice(-11)}`
        const sAO = await c.admin.from('suppliers').insert([{ name: `HARNESS UI AO ${stamp}`, code: `HUAO${stamp}` }]).select('id')
        const sLM = await c.admin.from('suppliers').insert([{ name: `HARNESS UI LM ${stamp}`, code: `HULM${stamp}` }]).select('id')
        cmpSupplierIds = [sAO.data?.[0]?.id, sLM.data?.[0]?.id].filter(Boolean) as string[]
        const pAO = await c.admin.from('supplier_products').insert([{ supplier_id: cmpSupplierIds[0], supplier_sku: `HU-AO-${stamp}`, supplier_name: 'Stikkontakt', cost_price: 100, ean }]).select('id')
        await c.admin.from('supplier_products').insert([{ supplier_id: cmpSupplierIds[1], supplier_sku: `HU-LM-${stamp}`, supplier_name: 'Stikkontakt', cost_price: 80, ean: `0${ean}` }])
        if (profitOfferId && pAO.data?.[0]?.id) await c.admin.from('offer_line_items').insert([{ offer_id: profitOfferId, position: 3, description: 'Stikkontakt', quantity: 10,
          unit: 'stk', unit_price: 150, total: 1500, cost_price: 100, supplier_product_id: pAO.data[0].id, supplier_cost_price_at_creation: 100 }])
        await a.page.goto(`${base}/dashboard/offers/${profitOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-supplier-savings-card').waitFor({ timeout: 60_000 }).catch(() => {})
        const sc = a.page.getByTestId('offer-supplier-savings-card')
        const stxt = (await sc.count()) ? await sc.innerText() : ''
        await a.page.screenshot({ path: join(shots, 'u8-grossist.png'), fullPage: true }).catch(() => {})
        const cmp = { kort: /Billigere hos anden grossist/.test(stxt), lm: stxt.includes(`HARNESS UI LM ${stamp}`), besparelse: /200,00 kr/.test(stxt) }
        out.push({ id: 'U8 grossist-sammenligning', ok: Object.values(cmp).every(Boolean), note: Object.entries(cmp).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U9 fakturakontrol: faktura fra AO-probe-leverandøren; linje 1 med varenr. HU-AO (katalog 100) faktureret 110 x 10
      // -> Overpris 100 kr; linje 2 uden match -> ikke kontrollerbar. Dom = Prisafvigelse. Faktura ryddes i finally.
      {
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
        await a.page.goto(`${base}/dashboard/incoming-invoices/${ctrlInvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('invoice-control-verdict').waitFor({ timeout: 60_000 }).catch(() => {})
        const pc = a.page.getByTestId('invoice-control-panel')
        const ptxt = (await pc.count()) ? await pc.innerText() : ''
        await a.page.screenshot({ path: join(shots, 'u9-fakturakontrol.png'), fullPage: true }).catch(() => {})
        const ic = { panel: /Fakturakontrol/.test(ptxt), dom: /Prisafvigelse/.test(ptxt), overpris: /100,00 kr/.test(ptxt) && /Overpris\b/.test(ptxt),
          match: ptxt.includes(`HU-AO-${stamp}`), daekning: /1 \/ 2 \(50 %\)/.test(ptxt) }
        out.push({ id: 'U9 fakturakontrol (admin)', ok: !seedErr && Object.values(ic).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(ic).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U10 kundeportal-accept som kunden oplever det: ny browser-kontekst UDEN CRM-login (fanger AUTH_REQUIRED-fejl
      // der er skjult når personalet tester indlogget). Udgående mail/e-conomic er neutraliseret i dev-serveren.
      {
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
        await kp.screenshot({ path: join(shots, 'u10-portal-accept.png'), fullPage: true }).catch(() => {})
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
      {
        const invNo = `UPL${String(stamp).slice(-8)}`
        const pdf = makeTextPdf(['HARNESS Upload-grossist A/S', `Faktura ${invNo}`, `Fakturanummer: ${invNo}`, 'Fakturadato: 01-10-2026',
          'Forfaldsdato: 31-10-2026', 'Beloeb i alt inkl. moms: 1.875,00 DKK', 'Varenr 7654321 Stikkontakt 5 stk'])
        const r: Record<string, boolean> = {}
        await a.page.goto(`${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        await a.page.screenshot({ path: join(shots, 'u12-upload-faktura.png'), fullPage: true }).catch(() => {})

        // Samme fil igen -> dublet: åbner den eksisterende, ingen ny række, ingen ekstra fil
        const before = (await c.admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('invoice_number', invNo)).count ?? 0
        const filesBefore = ((await c.admin.storage.from('attachments').list(filePath ? filePath.split('/').slice(0, -1).join('/') : 'supplier-invoices', { limit: 1000 })).data ?? []).length
        await a.page.goto(`${base}/dashboard/incoming-invoices`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('invoice-upload-input').setInputFiles({ name: `faktura-${invNo}-kopi.pdf`, mimeType: 'application/pdf', buffer: pdf }).catch(() => {})
        await a.page.waitForURL(/dublet=1/, { timeout: 120_000 }).catch(() => {})
        const after = (await c.admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('invoice_number', invNo)).count ?? 0
        const filesAfter = ((await c.admin.storage.from('attachments').list(filePath ? filePath.split('/').slice(0, -1).join('/') : 'supplier-invoices', { limit: 1000 })).data ?? []).length
        r.dublet = a.page.url().includes(`${firstId}?dublet=1`) && before === 1 && after === 1 && filesAfter === filesBefore
        out.push({ id: 'U12 upload af leverandørfaktura (admin)', ok: Object.values(r).every(Boolean),
          note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U15 fakturakladde (N5)
      {
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

        await a.page.goto(`${base}/dashboard/invoices/${draftInvoiceId}`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        await a.page.screenshot({ path: join(shots, 'u15-fakturakladde.png'), fullPage: true }).catch(() => {})
        const audits = draftInvoiceId ? (await c.admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('entity_id', draftInvoiceId)).count ?? 0 : 0
        r.audit = audits >= 3
        out.push({ id: 'U15 fakturakladde (admin)', ok: !seedErr && Object.values(r).every(Boolean), note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
      }

      // U16 e-conomic-opsætning (N12) — kun opsætning, ingen bogføring
      if (cmpSupplierIds[0]) {
        const r: Record<string, boolean> = {}
        const supId = cmpSupplierIds[0]
        const saveNo = async (value: string) => {
          await a.page.goto(`${base}/dashboard/settings/suppliers/${supId}`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        await a.page.goto(`${base}/dashboard/settings/economic`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = a.page.getByTestId('economic-readiness')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.count()) ? await card.innerText() : ''
        r.tjekliste = /Klar til bogføring/.test(txt) && /Omkostningskonto/.test(txt) && /Kassekladde/.test(txt) && /Leverandører koblet/.test(txt) && /Kundefakturaer/.test(txt)
        await a.page.screenshot({ path: join(shots, 'u16-economic.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U16 e-conomic-opsætning (admin)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U17 AO-prisfil-import (ISO-8859-1). Kræver en leverandør med kode 'AO' (AO-konfiguration vælges på koden).
      {
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
            await a.page.goto(`${base}/dashboard/settings/suppliers/${aoSupplierId}/import`, { waitUntil: 'networkidle', timeout: 180_000 })
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
          await a.page.screenshot({ path: join(shots, 'u17-ao-import.png'), fullPage: true }).catch(() => {})
          const p2 = await runImport('13,75', 'ao-pris-2.csv')
          r.pris_opdateret = Number(p2?.cost_price) === 13.75
          const hist = p1?.id ? (await c.admin.from('price_history').select('id', { count: 'exact', head: true }).eq('supplier_product_id', p1.id)).count ?? 0 : 0
          r.prishistorik = hist >= 1
        }
        out.push({ id: 'U17 AO-prisfil-import (ISO-8859-1)', ok: !note && Object.values(r).every(Boolean), note: note || Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U18 stedinfo (N9b)
      if (profitCustomerId) {
        const r: Record<string, boolean> = {}
        const sc = await c.admin.from('service_cases').insert([{ title: '[HARNESS] stedinfo', customer_id: profitCustomerId, status: 'new', priority: 'medium',
          source: 'manual', created_by: adminUser.id, address: 'Odinsvej 10', postal_code: '4100', city: 'Ringsted' }]).select('id')
        siteCaseId = (sc.data?.[0] as { id?: string } | undefined)?.id ?? null
        const openAndSave = async (ksr: string) => {
          await a.page.goto(`${base}/dashboard/orders/${siteCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          await a.page.getByTestId('edit-site-info').click({ timeout: 60_000 }).catch(() => {})
          await a.page.getByTestId('site-ksr').fill(ksr).catch(() => {})
          await a.page.getByTestId('site-ean').fill('5790000000001').catch(() => {})
          await a.page.getByTestId('site-phone').fill('+45 22 33 44 55').catch(() => {})
          await a.page.getByRole('button', { name: 'Gem', exact: true }).click().catch(() => {})
          await a.page.waitForTimeout(2500)
          return ((await c.admin.from('service_cases').select('ksr_number, ean_number, contact_phone').eq('id', siteCaseId).maybeSingle()).data ?? {}) as Record<string, string | null>
        }
        const bad = await openAndSave('12')
        r.ugyldigt_ksr_afvist = bad.ksr_number == null && (await a.page.getByText('KSR-nummer skal være 6-10 cifre').count()) > 0
        const good = await openAndSave('1234 567')
        r.gemt = good.ksr_number === '1234567' && good.ean_number === '5790000000001' && good.contact_phone === '+45 22 33 44 55'
        await a.page.goto(`${base}/dashboard/orders/${siteCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        const nav = a.page.getByTestId('order-navigate')
        r.naviger = (await nav.count()) === 1 && /google\.com\/maps\/dir\/.*destination=/.test((await nav.getAttribute('href')) ?? '')
        out.push({ id: 'U18 stedinfo på ordresiden (admin)', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U19 søgning med komma/parentes (sikre PostgREST-filtre)
      {
        const r: Record<string, boolean> = {}
        const name = `Hansen, Jens (VVS) 3x1,5 ${stamp}`
        const ins = await c.admin.from('customers').insert([{ customer_number: `UI-E2E-S-${stamp}`, company_name: name, contact_person: 'Søg',
          email: `soeg-${stamp}@harness.test`, created_by: adminUser.id, custom_fields: { harness: 'ui-e2e' } }]).select('id')
        searchCustomerId = (ins.data?.[0] as { id?: string } | undefined)?.id ?? null
        for (const [k, q] of [['komma_parentes', `Hansen, Jens (VVS)`], ['kabeldimension', `3x1,5 ${stamp}`]] as const) {
          await a.page.goto(`${base}/dashboard/customers?search=${encodeURIComponent(q)}`, { waitUntil: 'networkidle', timeout: 180_000 })
          r[k] = (await a.page.getByText(name).count()) > 0
        }
        out.push({ id: 'U19 søgning med komma/parentes', ok: !!searchCustomerId && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U20 sagsliste (N9c)
      if (profitCustomerId) {
        const r: Record<string, boolean> = {}
        const tag = `LST${stamp}`
        for (const [type, priority] of [['installation', 'urgent'], ['service', 'medium']] as const) {
          const ins = await c.admin.from('service_cases').insert([{ title: `[HARNESS] ${tag} ${type}`, customer_id: profitCustomerId, status: 'new',
            priority, type, source: 'manual', created_by: adminUser.id }]).select('id')
          const id = (ins.data?.[0] as { id?: string } | undefined)?.id
          if (id) listCaseIds.push(id)
        }
        await a.page.goto(`${base}/dashboard/orders?search=${tag}&type=installation`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.type_filtrerer = (await a.page.getByText(`[HARNESS] ${tag} installation`).count()) > 0 && (await a.page.getByText(`[HARNESS] ${tag} service`).count()) === 0
        r.haster_maerke = (await a.page.getByTestId('order-priority').filter({ hasText: 'Haster' }).count()) > 0
        const opts = await a.page.locator('select').first().locator('option').allInnerTexts()
        r.statustaellere = opts.some((o) => /^Alle \(\d+\)$/.test(o.trim())) && opts.some((o) => /\(\d+\)$/.test(o.trim()) && !o.startsWith('Alle'))
        out.push({ id: 'U20 sagsliste: type, prioritet, tællere', ok: listCaseIds.length === 2 && Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }

      // U6 opkalds-opslag (P3 #15): ukendt nummer giver tom-tilstand, ingen fejl
      await a.page.goto(`${base}/dashboard/cti?number=4500000001`, { waitUntil: 'networkidle', timeout: 180_000 })
      const cti = { heading: await a.page.getByRole('heading', { name: 'Opkald' }).isVisible(), formatted: (await a.page.getByText('+45 00 00 00 01').count()) > 0,
        unknown: (await a.page.getByText('Ukendt nummer').count()) > 0 }
      out.push({ id: 'U6 opkalds-opslag (admin)', ok: cti.heading && cti.formatted && cti.unknown, note: Object.entries(cti).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
    }

    // ---- montoer
    const m = await login(montor)
    if (m.ok) {
      const denied: string[] = []
      for (const path of ['/dashboard/agents', '/dashboard/pilot-health', '/dashboard/mail']) { // mail: G9
        await m.page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 180_000 })
        if ((await m.page.getByText('Du har ikke adgang').count()) > 0) denied.push(path)
      }
      await m.page.screenshot({ path: join(shots, 'pilot-health-montoer.png'), fullPage: true })
      out.push({ id: 'U4 montør: ingen adgang', ok: denied.length === 3, note: `NoAccess på ${denied.length}/3 (${denied.join(', ') || '-'})` })

      // U11 montør-dagen (G4). Seed: medarbejder koblet til montør-login, sag + planlagt arbejdsordre i dag.
      {
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
        await m.page.goto(`${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        for (let i = 0; i < 15 && started !== 'in_progress'; i++) {
          started = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (started !== 'in_progress') await new Promise((res) => setTimeout(res, 1000))
        }
        r.startet = started === 'in_progress'

        // Foto-upload på Dokumenter-fanen
        await m.page.getByRole('button', { name: 'Dokumenter', exact: true }).click().catch(() => {})
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
        await m.page.getByTestId('case-upload-input').setInputFiles({ name: 'foto-harness.png', mimeType: 'image/png', buffer: png }).catch(() => {})
        await m.page.getByTestId('case-upload-msg').waitFor({ timeout: 60_000 }).catch(() => {})
        const upMsg = (await m.page.getByTestId('case-upload-msg').count()) ? await m.page.getByTestId('case-upload-msg').innerText() : ''
        const docs = jobCaseId ? (await c.admin.from('customer_documents').select('id', { count: 'exact', head: true }).eq('service_case_id', jobCaseId)).count ?? 0 : 0
        r.foto_upload = /1 fil uploadet/.test(upMsg) && docs === 1
        await m.page.screenshot({ path: join(shots, 'u11-montoer-dokumenter.png'), fullPage: true }).catch(() => {})

        // N9a Aflevering på ordresiden: tjekliste → foto til første påkrævede punkt → kundens underskrift (montør, egen sag)
        await m.page.goto(`${base}/dashboard/orders/${jobCaseId}?tab=aflevering`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        const sbox = await m.page.getByTestId('handover-signature').locator('canvas').boundingBox().catch(() => null)
        if (sbox) {
          await m.page.mouse.move(sbox.x + 20, sbox.y + 20); await m.page.mouse.down()
          await m.page.mouse.move(sbox.x + 140, sbox.y + 50, { steps: 8 }); await m.page.mouse.move(sbox.x + 240, sbox.y + 25, { steps: 8 }); await m.page.mouse.up()
        }
        await m.page.getByRole('button', { name: /Bekræft underskrift/ }).click({ timeout: 30_000 }).catch(() => {})
        let signedName = ''
        for (let i = 0; i < 15 && !signedName; i++) {
          signedName = String(((await c.admin.from('service_cases').select('customer_signature_name, customer_signature, status').eq('id', jobCaseId).maybeSingle()).data as { customer_signature_name?: string } | null)?.customer_signature_name ?? '')
          if (!signedName) await new Promise((res) => setTimeout(res, 1000))
        }
        const stillOpen = ((await c.admin.from('service_cases').select('status').eq('id', jobCaseId).maybeSingle()).data as { status?: string } | null)?.status !== 'closed'
        r.aflevering_underskrift = signedName === 'Kunde Harness' && stillOpen
        await m.page.screenshot({ path: join(shots, 'u11-montoer-aflevering.png'), fullPage: true }).catch(() => {})

        // Sagens Mails-fane: egen sagsmail synlig (G9) — postkassen er lukket, men sagens mails ses stadig
        await m.page.getByRole('button', { name: /^Mails/ }).first().click().catch(() => {})
        await m.page.getByText(`[HARNESS] egen sagsmail ${stamp}`).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.sagsmail_synlig = (await m.page.getByText(`[HARNESS] egen sagsmail ${stamp}`).count()) > 0
        // Fremmed sag via direkte URL: ingen mails/indhold
        if (otherCaseId) {
          await m.page.goto(`${base}/dashboard/orders/${otherCaseId}?tab=mails`, { waitUntil: 'networkidle', timeout: 180_000 })
          await m.page.waitForTimeout(3000)
          r.fremmed_sagsmail_skjult = (await m.page.getByText(`[HARNESS] fremmed sagsmail ${stamp}`).count()) === 0
        }

        // Afslut jobbet
        await m.page.goto(`${base}/dashboard/orders/${jobCaseId}?tab=planlaegning`, { waitUntil: 'networkidle', timeout: 180_000 }) // tilbage til egen sag
        await m.page.getByRole('button', { name: '✓ Afslut' }).first().click({ timeout: 30_000 }).catch(() => {})
        let woStatus = ''
        for (let i = 0; i < 15 && woStatus !== 'done'; i++) {
          woStatus = String(((await c.admin.from('work_orders').select('status').eq('id', woId).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          if (woStatus !== 'done') await new Promise((res) => setTimeout(res, 1000))
        }
        r.afsluttet = woStatus === 'done'
        if (!r.afsluttet) {
          await m.page.screenshot({ path: join(shots, 'u11-montoer-afslut.png'), fullPage: true }).catch(() => {})
          const errTxt = await m.page.locator('.text-red-700, .text-red-600, .bg-red-50').allInnerTexts().catch(() => [] as string[])
          r[`afslut_fejl(${woStatus}|${errTxt.join(' / ').replace(/\s+/g, ' ').slice(0, 160)})`] = false
        }

        // U21 (N9d): Service-link viderestilles; mobil-bundmenu for montør
        {
          const u21: Record<string, boolean> = {}
          await m.page.goto(`${base}/dashboard/service-cases/${jobCaseId}`, { waitUntil: 'networkidle', timeout: 180_000 })
          u21.service_link_viderestilles = new RegExp(`/dashboard/orders/${jobCaseId}`).test(m.page.url())
          await m.page.setViewportSize({ width: 390, height: 844 })
          await m.page.goto(`${base}/dashboard/tasks`, { waitUntil: 'networkidle', timeout: 180_000 })
          const nav = m.page.locator('nav.md\\:hidden a')
          const labels = (await nav.allInnerTexts()).map((t) => t.trim())
          u21.bundmenu = JSON.stringify(labels) === JSON.stringify(['Opgaver', 'Kalender', 'Sager'])
          await m.page.screenshot({ path: join(shots, 'u21-montoer-mobil.png'), fullPage: false }).catch(() => {})
          await m.page.setViewportSize({ width: 1400, height: 1000 })
          out.push({ id: 'U21 montør mobil + Service-redirect', ok: Object.values(u21).every(Boolean), note: `${Object.entries(u21).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')} · menu=${JSON.stringify(labels)}` })
        }

        // Kalender: eget job, ingen planlæg-knap, ingen tom-tilstand
        await m.page.goto(`${base}/dashboard/calendar?date=${today}`, { waitUntil: 'networkidle', timeout: 180_000 })
        r.kalender = (await m.page.getByText(woTitle).count()) > 0 && (await m.page.getByText('Ingen aktive medarbejdere').count()) === 0
          && (await m.page.getByRole('button', { name: /Planlæg opgave/ }).count()) === 0
        await m.page.screenshot({ path: join(shots, 'u11-montoer-kalender.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U11 montør-dagen (job, foto, afslut, kalender)', ok: !seedErr && Object.values(r).every(Boolean),
          note: `${seedErr ? `SEED: ${seedErr} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
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
        await sp.page.goto(`${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
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
        await sp.page.goto(`${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await sp.page.getByRole('link', { name: 'Åbn sag' }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        r.salg_ingen_fakturer = (await sp.page.getByTestId('offer-invoice-on-case').count()) === 0
        await a.page.goto(`${base}/dashboard/offers/${salgOfferId}`, { waitUntil: 'networkidle', timeout: 180_000 })
        await a.page.getByTestId('offer-invoice-on-case').first().click({ timeout: 60_000 }).catch(() => {})
        await a.page.waitForURL(/tab=fakturakladde/, { timeout: 60_000 }).catch(() => {})
        await a.page.getByText(/Stage-fakturaer på sagen|Fakturakladde|Forskudsfaktura|Slutfaktura/).first().waitFor({ timeout: 90_000 }).catch(() => {})
        r.admin_fakturer_paa_sag = /tab=fakturakladde/.test(a.page.url()) && (await a.page.getByText(/Stage-fakturaer på sagen|Slutfaktura/).count()) > 0
        await sp.page.screenshot({ path: join(shots, 'u13-salg-sag.png'), fullPage: true }).catch(() => {})
      }
      // U14 opfølgning (N1)
      if (sp.ok && profitCustomerId) {
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
        await sp.page.goto(`${base}/dashboard/offers`, { waitUntil: 'networkidle', timeout: 180_000 })
        const card = sp.page.getByTestId('offer-followup-card')
        await card.waitFor({ timeout: 60_000 }).catch(() => {})
        const txt = (await card.count()) ? await card.innerText() : ''
        const row = card.getByTestId('offer-followup-row').filter({ hasText: `følg op set ${stamp}` })
        const rowTxt = (await row.count()) ? await row.first().innerText() : ''
        f.set_ikke_besvaret = /Set — ikke besvaret/.test(rowTxt) && /5 dage/.test(rowTxt)
        f.ring_knap = (await row.getByRole('link', { name: /Ring/ }).count()) === 1
        f.nyt_under_afventer = !txt.includes(`følg op nyt ${stamp}`) && /afventer stadig kunden/.test(txt)
        f.kollega_skjult = !txt.includes(`følg op kollega ${stamp}`)
        await sp.page.screenshot({ path: join(shots, 'u14-opfoelgning.png'), fullPage: true }).catch(() => {})
        out.push({ id: 'U14 salg: tilbudsopfølgning', ok: Object.values(f).every(Boolean), note: Object.entries(f).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') })
      }
      out.push({ id: 'U13 salg: sag fra eget tilbud', ok: sp.ok && !!salgOfferId && Object.keys(r).length === 6 && Object.values(r).every(Boolean),
        note: `${!sp.ok ? `salg-login fejlede (${loginFailures.join(' | ')}) · ` : ''}${!salgOfferId ? `SEED: ${off?.error?.message?.slice(0, 80)} · ` : ''}${Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')}` })
    }

    out.push({ id: 'U5 ingen side-/konsolfejl', ok: pageErrors.length === 0, note: pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : `0 fejl · skærmbilleder: ${shots}` })
  } finally {
    await browser.close().catch(() => {})
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
      await c.admin.from('service_cases').delete().eq('id', jobCaseId)
    }
    if (jobEmployeeId) await c.admin.from('employees').delete().eq('id', jobEmployeeId)
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
    for (const id of listCaseIds) { await c.admin.from('case_notes').delete().eq('case_id', id); await c.admin.from('service_cases').delete().eq('id', id) }
    if (searchCustomerId) await c.admin.from('customers').delete().eq('id', searchCustomerId)
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
