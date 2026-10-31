/**
 * PILOT-SIM (Henrik 2026-10-31): computerstyret pilot på STAGING — realistiske ELTA-arbejdsdage gennem den rigtige UI.
 * Kaldes fra ui-e2e.ts som U240–U254 (hver "slot" kører PILOT_SIM_PER_SLOT workflows, standard 2 → 30 i alt).
 *
 * Ét workflow = kunde (UI) → tilbud (UI) → sendt (seed: ingen mail) → kunden accepterer i portalen (UI) → sag fra
 * tilbuddet → serviceleder planlægger AO i kalenderen (UI) → montør/elektriker på 375 px: Mine job → Navigér → sag →
 * beskrivelse → foto → timer → materiale → opgave → aflevering/underskrift → ✓ Afslut → serviceleder godkender/afviser
 * timer (UI) → del-faktura fra sagen (UI) → bogholderi ser fakturaen, sælgeren ser faktureringsstatus, fremmed sælger og
 * montør afvises. Efter hvert workflow verificeres databasen (forældreløse timer, forkert AO/sag/kunde, dublet-sag,
 * dobbeltfakturering, afviste timer faktureret, ufuldstændig aflevering).
 *
 * Variant (workflow-nr. mod 10) blander realistiske fejl ind: manglende adresse, dublet-kunde, overlap, manglende sats
 * + genforsøg, afviste timer, fremmed sag/kunde/opgave/dokument, lukket sag, dobbeltklik/genindlæsning/dobbelt accept,
 * dublet-medarbejderrække + faktura uden for scope, netværksfejl midt i en handling (fejl må aldrig vises som succes).
 *
 * Målinger: sideindlæsning (goto→networkidle) og server-action-kald (Next-Action) pr. side, dubletkald, vandret scroll
 * på mobil → %TEMP%/elta-ui-e2e/pilot-sim-<stamp>.jsonl (samles af pilot-sim-report.ts).
 * Alle data mærkes [PILOT-SIM] <tag> og ryddes i finally. Ingen mail/SMS/e-conomic (ui-e2e neutraliserer integrationer).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowserContext, Page, Response } from 'playwright'
import { appendFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

type User = { id: string; email: string; password: string; role: string }
type Check = { id: string; ok: boolean; note: string }
export type PilotSimDeps = {
  admin: SupabaseClient
  base: string
  stamp: number
  shots: string
  startJobFlag: boolean
  login: (u: User) => Promise<{ ctx: BrowserContext; page: Page; ok: boolean }>
  newContext: (opts: { viewport: { width: number; height: number } }) => Promise<BrowserContext>
  mkUser: (role: string) => Promise<User>
  gotoSafe: (page: Page, url: string, opts?: { waitUntil?: 'load' | 'networkidle' | 'domcontentloaded'; timeout?: number }) => Promise<Response | null>
  callServerAction: (page: Page, pageUrl: string, file: string, name: string, args: unknown[]) => Promise<string>
  push: (x: Check) => void
  listCaseIds: string[]
}

type Actors = {
  admin: User; leder: User; salgA: User; salgB: User; bogholderi: User; montor: User; elektriker: User
  empMontor: string; empElektriker: string; foreignCustomer: string; foreignCase: string; foreignTask: string; foreignDocName: string
  hourSlot: Record<string, number>
}
let actorsCache: Actors | null = null

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const todayCph = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
const fmt = (r: Record<string, boolean | undefined>) => Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ')

/** Poll en DB-betingelse (UI-handlinger skriver asynkront) */
async function poll<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 20, ms = 1000): Promise<T> {
  let v = await fn()
  for (let i = 1; i < tries && !ok(v); i++) { await sleep(ms); v = await fn() }
  return v
}

export async function runPilotSim(d: PilotSimDeps, slot: number, perSlot: number): Promise<void> {
  const { admin: db, base } = d
  const metricsFile = join(tmpdir(), 'elta-ui-e2e', `pilot-sim-${d.stamp}.jsonl`)
  const metric = (rec: Record<string, unknown>) => { try { appendFileSync(metricsFile, JSON.stringify({ slot, ...rec }) + '\n') } catch { /* målinger må ikke vælte testen */ } }

  // ---- aktører (én gang pr. proces): 6 roller med effektive rettigheder som konfigureret (elektriker = skabelon)
  if (!actorsCache) {
    const admin = await d.mkUser('admin')
    const leder = await d.mkUser('serviceleder')
    const salgA = await d.mkUser('salg')
    const salgB = await d.mkUser('salg')
    const bogholderi = await d.mkUser('bogholderi')
    const montor = await d.mkUser('montør')
    const elektriker = await d.mkUser('montør')
    await db.from('profiles').update({ permission_template: 'elektriker', full_name: 'PILOT-SIM elektriker' }).eq('id', elektriker.id)
    await db.from('user_permission_overrides').insert([
      { profile_id: elektriker.id, permission: 'customers.create', effect: 'grant', source: 'template', created_by: admin.id },
      { profile_id: elektriker.id, permission: 'cases.create', effect: 'grant', source: 'template', created_by: admin.id },
    ])
    const emps = await db.from('employees').insert([
      { name: `PILOT-SIM Montør ${d.stamp}`, first_name: 'Pilot', last_name: 'Montør', email: montor.email, role: 'montør', active: true, profile_id: montor.id, hourly_rate: 495, cost_rate: 300 },
      { name: `PILOT-SIM Elektriker ${d.stamp}`, first_name: 'Pilot', last_name: 'Elektriker', email: elektriker.email, role: 'elektriker', active: true, profile_id: elektriker.id, hourly_rate: 545, cost_rate: 320 },
    ]).select('id, profile_id')
    const er = (emps.data ?? []) as Array<{ id: string; profile_id: string }>
    // fremmed kunde + sag (oprettet af en anden bruger) med opgave og dokument — ingen af pilot-montørerne har AO her
    const fc = await db.from('customers').insert([{ customer_number: `PSIM-F-${d.stamp}`, company_name: `[PILOT-SIM] fremmed kunde ${d.stamp}`, contact_person: 'F',
      email: `psim-fremmed-${d.stamp}@harness.test`, created_by: salgB.id, custom_fields: { harness: 'pilot-sim' } }]).select('id')
    const foreignCustomer = (fc.data?.[0] as { id: string }).id
    const fs = await db.from('service_cases').insert([{ title: `[PILOT-SIM] fremmed sag ${d.stamp}`, customer_id: foreignCustomer, status: 'in_progress', priority: 'medium',
      source: 'manual', created_by: salgB.id, address: 'Fremmedvej 1', postal_code: '5000', city: 'Odense C' }]).select('id')
    const foreignCase = (fs.data?.[0] as { id: string }).id
    d.listCaseIds.push(foreignCase)
    const ft = await db.from('customer_tasks').insert([{ customer_id: foreignCustomer, service_case_id: foreignCase, title: `[PILOT-SIM] fremmed opgave ${d.stamp}`, status: 'pending',
      assigned_to: salgB.id, created_by: salgB.id }]).select('id')
    const foreignDocName = `psim-fremmed-${d.stamp}.png`
    await db.from('customer_documents').insert([{ customer_id: foreignCustomer, service_case_id: foreignCase, title: `[PILOT-SIM] fremmed dokument ${d.stamp}`,
      file_name: foreignDocName, file_url: 'pilot-sim/none', mime_type: 'image/png', file_size: 68, shared_by: salgB.id, document_type: 'other', visible_to_customer: false, visible_in_portal: false }])
    actorsCache = {
      admin, leder, salgA, salgB, bogholderi, montor, elektriker,
      empMontor: er.find((x) => x.profile_id === montor.id)!.id, empElektriker: er.find((x) => x.profile_id === elektriker.id)!.id,
      foreignCustomer, foreignCase, foreignTask: (ft.data?.[0] as { id: string }).id, foreignDocName, hourSlot: {},
    }
  }
  const A = actorsCache

  // ---- instrumentering pr. side: sideindlæsning, server-actions (varighed + dubletter), vandret scroll (mobil)
  const instrument = (page: Page, role: string, wf: string) => {
    const pending = new Map<object, { id: string; t0: number; path: string; body: string }>()
    const recent: Array<{ id: string; body: string; t: number }> = []
    page.on('request', (req) => {
      const id = req.headers()['next-action']
      if (!id) return
      const path = new URL(req.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').replace(/[0-9a-f]{64}/g, ':token')
      const body = (req.postData() ?? '').slice(0, 400)
      const now = Date.now()
      const dup = recent.some((x) => x.id === id && x.body === body && now - x.t < 1500)
      recent.push({ id, body, t: now }); if (recent.length > 30) recent.shift()
      if (dup) metric({ kind: 'dup_action', role, wf, path, action: id.slice(0, 10) })
      pending.set(req, { id, t0: now, path, body })
    })
    const done = (req: object, failed: boolean) => {
      const p = pending.get(req); if (!p) return
      pending.delete(req)
      metric({ kind: 'action', role, wf, path: p.path, action: p.id.slice(0, 10), ms: Date.now() - p.t0, failed })
    }
    page.on('requestfinished', (req) => done(req, false))
    page.on('requestfailed', (req) => done(req, true))
  }
  const go = async (page: Page, role: string, wf: string, url: string, mobile = false) => {
    const t0 = Date.now()
    const res = await d.gotoSafe(page, url, { waitUntil: 'networkidle', timeout: 180_000 })
    const ms = Date.now() - t0
    const path = new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').replace(/[0-9a-f]{64}/g, ':token') + (new URL(url).searchParams.get('tab') ? `?tab=${new URL(url).searchParams.get('tab')}` : '')
    let overflow: number | null = null
    if (mobile) overflow = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => null)
    metric({ kind: 'page', role, wf, path, ms, status: res?.status() ?? null, ...(mobile ? { scrollWidth: overflow } : {}) })
    return { res, ms, overflow }
  }
  const nextHour = (emp: string) => { const k = (A.hourSlot[emp] = (A.hourSlot[emp] ?? -1) + 1); return 5 + k * 2 } // 05–06, 07–08, … pr. medarbejder

  for (let i = 0; i < perSlot; i++) {
    const n = slot * perSlot + i + 1
    const wf = `PS-${String(n).padStart(2, '0')}`
    const variant = (n - 1) % 10
    const tag = `${wf}-${d.stamp}`
    const label = `[PILOT-SIM] ${tag}`
    const variantName = ['grundflow', 'manglende adresse', 'dublet-kunde+overlap', 'manglende sats+genforsøg', 'afviste timer', 'fremmed sag/kunde/opgave/dokument',
      'lukket sag', 'dobbeltklik+genindlæsning+dobbelt accept', 'dublet-medarbejder+faktura uden scope', 'netværksfejl midt i handling'][variant]
    // elektriker på ulige workflows, montør på lige (begge roller dækkes i hver variant over 30 workflows)
    const worker = n % 2 === 1 ? A.elektriker : A.montor
    const empId = worker.id === A.elektriker.id ? A.empElektriker : A.empMontor
    const workerRole = worker.id === A.elektriker.id ? 'elektriker' : 'montør'
    const created: { customers: string[]; offer?: string; token?: string; caseId?: string; caseNo?: string; wo?: string; task?: string; extraWo?: string; closedCase?: string; dupEmp?: string; invoices: string[]; officeMat?: string } = { customers: [], invoices: [] }
    const ko: Record<string, boolean> = {}
    const mo: Record<string, boolean> = {}
    const eo: Record<string, boolean> = {}
    const notes: string[] = []
    const t0 = Date.now()
    const noAddress = variant === 1
    const email = `psim-${n}-${d.stamp}@harness.test`
    const custName = `${label} kunde`
    try {
      // ================= KONTOR =================
      // 1. salg opretter kunden i UI'et (dialogen "Ny Kunde")
      const sp = await d.login(A.salgA)
      instrument(sp.page, 'salg', wf)
      try {
        await go(sp.page, 'salg', wf, `${base}/dashboard/customers`)
        const createCustomer = async (name: string, accept: boolean) => {
          await sp.page.getByRole('button', { name: /^Ny Kunde$/ }).click({ timeout: 30_000 }).catch(() => {})
          await sp.page.locator('#customer-create-name').fill(name).catch(() => {})
          await sp.page.locator('#customer-create-email').fill(email).catch(() => {})
          await sp.page.locator('#customer-create-phone').fill('20304050').catch(() => {})
          if (!noAddress) {
            await sp.page.locator('#customer-create-address').fill(`Pilotvej ${n}`).catch(() => {})
            // IKKE Escape (lukker hele dialogen) — videre til postnr. lukker forslagslisten
            await sp.page.locator('#customer-create-postal').fill('8000').catch(() => {})
            await sp.page.locator('#customer-create-city').fill('Aarhus C').catch(() => {})
          }
          let dialogMsg = ''
          const onDialog = (dlg: import('playwright').Dialog) => { dialogMsg = dlg.message(); (accept ? dlg.accept() : dlg.dismiss()).catch(() => {}) }
          sp.page.on('dialog', onDialog)
          await sp.page.getByRole('button', { name: /^Opret kunde$/ }).click({ timeout: 30_000 }).catch(() => {})
          await sp.page.waitForTimeout(2500)
          sp.page.off('dialog', onDialog)
          return dialogMsg
        }
        await createCustomer(custName, true)
        const cust = await poll(async () => ((await db.from('customers').select('id, customer_number, billing_address, created_by').eq('company_name', custName)).data ?? []) as Array<{ id: string; customer_number: string; billing_address: string | null; created_by: string }>, (x) => x.length > 0, 15)
        for (const x of cust) created.customers.push(x.id)
        ko.k1_kunde_oprettet_ui = cust.length === 1 && cust[0].created_by === A.salgA.id && (noAddress ? !cust[0].billing_address : cust[0].billing_address === `Pilotvej ${n}`)
        const customerId = cust[0]?.id
        const customerNo = cust[0]?.customer_number
        // dublet-kunde: samme mail igen → advarsel; "Annullér" → ingen ny kunde
        if (variant === 2 && customerId) {
          await sp.page.keyboard.press('Escape').catch(() => {})
          await go(sp.page, 'salg', wf, `${base}/dashboard/customers`)
          const msg = await createCustomer(`${label} kunde DUBLET`, false)
          const dups = ((await db.from('customers').select('id').eq('email', email)).data ?? []) as Array<{ id: string }>
          for (const x of dups) if (!created.customers.includes(x.id)) created.customers.push(x.id)
          ko.k1b_dublet_advaret_ikke_oprettet = /dublet|findes allerede/i.test(msg) && dups.length === 1
        }
        if (!customerId) throw new Error('kunde ikke oprettet — workflow stopper')

        // 2. salg opretter tilbuddet i UI'et + linje
        await go(sp.page, 'salg', wf, `${base}/dashboard/offers`)
        await sp.page.getByRole('button', { name: /Nyt Tilbud/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await sp.page.locator('#title').fill(`${label} tilbud`).catch(() => {})
        await sp.page.locator('#description').fill(`${tag} beskrivelse: ny gruppetavle og 6 stikkontakter`).catch(() => {})
        await sp.page.locator('#customer_id').fill(customerNo).catch(() => {})
        await sp.page.getByTestId('customer-picker-option').first().click({ timeout: 30_000 }).catch(() => {})
        await sp.page.getByRole('button', { name: 'Opret tilbud' }).click().catch(() => {})
        await sp.page.waitForURL(/\/dashboard\/offers\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => {})
        created.offer = (sp.page.url().match(/offers\/([0-9a-f-]{36})/) ?? [])[1]
        if (created.offer) {
          await sp.page.getByRole('button', { name: 'Tilføj linje' }).first().click({ timeout: 60_000 }).catch(() => {})
          const desc = sp.page.locator('input[placeholder="Beskrivelse..."]').last()
          await desc.waitFor({ timeout: 30_000 }).catch(() => {})
          const row = desc.locator('xpath=ancestor::tr[1]')
          await desc.fill(`${tag} stikkontakt montage`).catch(() => {})
          await row.locator('input[type="number"]').first().fill('4').catch(() => {})
          await row.locator('input[type="number"]').last().fill('250').catch(() => {})
          await row.locator('input[type="number"]').last().press('Tab').catch(() => {})
        }
        const off = created.offer ? await poll(async () => ((await db.from('offers').select('total_amount, final_amount, created_by, customer_id').eq('id', created.offer!).maybeSingle()).data as { total_amount: number; final_amount: number; created_by: string; customer_id: string } | null), (x) => Number(x?.total_amount) === 1000) : null
        ko.k2_tilbud_ui = !!off && off.created_by === A.salgA.id && off.customer_id === customerId && Number(off.final_amount) === 1250
      } finally { await sp.ctx.close().catch(() => {}) }
      if (!created.offer) throw new Error('tilbud ikke oprettet — workflow stopper')

      // 3. "sendt" (seed: afsendelse = mail, som ikke må ske) + portal-token
      await db.from('offers').update({ status: 'sent', sent_at: new Date().toISOString(), valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) }).eq('id', created.offer)
      const tok = randomBytes(32).toString('hex')
      const pt = await db.from('portal_access_tokens').insert([{ customer_id: created.customers[0], token: tok, email, created_by: A.salgA.id, is_active: true,
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]).select('id')
      created.token = (pt.data?.[0] as { id?: string } | undefined)?.id

      // 4. kunden accepterer i portalen (ingen login); variant 7: accept-flowet åbnes igen bagefter
      const browserCtx = await d.newContext({ viewport: { width: 390, height: 844 } })
      try {
        const kp = await browserCtx.newPage()
        instrument(kp, 'kunde', wf)
        const acceptOnce = async () => {
          await go(kp, 'kunde', wf, `${base}/portal/${tok}/offers/${created.offer}`, true)
          const btn = kp.getByRole('button', { name: 'Accepter tilbud' }).first()
          if (!(await btn.count())) return false
          await btn.click({ timeout: 30_000 }).catch(() => {})
          const dlg = kp.locator('div.fixed.inset-0').last()
          await dlg.locator('input[type="text"]').first().fill('Pilot Kunde').catch(() => {})
          await dlg.locator('input[type="email"]').first().fill(email).catch(() => {})
          const box = await dlg.locator('canvas').boundingBox().catch(() => null)
          if (box) { await kp.mouse.move(box.x + 20, box.y + 20); await kp.mouse.down(); await kp.mouse.move(box.x + 120, box.y + 60, { steps: 8 }); await kp.mouse.move(box.x + 200, box.y + 30, { steps: 8 }); await kp.mouse.up() }
          await dlg.locator('input[type="checkbox"]').first().check().catch(() => {})
          const submit = dlg.locator('button.bg-green-600')
          if (variant === 7) await submit.dblclick({ timeout: 15_000 }).catch(() => {}) // dobbeltklik på accept
          else await submit.click({ timeout: 15_000 }).catch(() => {})
          await kp.waitForLoadState('networkidle').catch(() => {})
          return true
        }
        await acceptOnce()
        const sag = await poll(async () => ((await db.from('service_cases').select('id, case_number, address, description, created_by').eq('source_offer_id', created.offer!)).data ?? []) as Array<{ id: string; case_number: string; address: string | null; description: string | null; created_by: string }>, (x) => x.length > 0, 20)
        if (variant === 7) {
          const again = await acceptOnce() // genåbn portalen: knappen skal være væk, eller accept må ikke give ny sag
          await kp.reload({ waitUntil: 'networkidle' }).catch(() => {})
          notes.push(`accept-knap efter accept: ${again ? 'vist' : 'skjult'}`)
        }
        const sager = ((await db.from('service_cases').select('id').eq('source_offer_id', created.offer)).data ?? []) as Array<{ id: string }>
        for (const x of sager) d.listCaseIds.push(x.id)
        const offerStatus = String(((await db.from('offers').select('status').eq('id', created.offer).maybeSingle()).data as { status?: string } | null)?.status ?? '')
        ko.k3_portal_accept = offerStatus === 'accepted'
        ko.k4_en_sag_pr_tilbud = sager.length === 1
        created.caseId = sag[0]?.id
        created.caseNo = sag[0]?.case_number
        ko.k5_sag_kopierer_adresse_beskrivelse = !!sag[0] && (noAddress ? !sag[0].address : sag[0].address === `Pilotvej ${n}`) && (sag[0].description ?? '').includes(tag)
      } finally { await browserCtx.close().catch(() => {}) }
      if (!created.caseId) throw new Error('ingen sag fra tilbuddet — workflow stopper')

      // 5. serviceleder planlægger AO i kalenderen (i dag) til montør/elektriker
      const lp = await d.login(A.leder)
      instrument(lp.page, 'serviceleder', wf)
      const woTitle = `${label} job`
      try {
        const day = todayCph()
        await go(lp.page, 'serviceleder', wf, `${base}/dashboard/calendar?date=${day}`)
        await lp.page.getByRole('button', { name: /Planlæg opgave/ }).first().click({ timeout: 60_000 }).catch(() => {})
        await lp.page.getByPlaceholder('Søg på sagsnr, titel eller kunde…').fill(created.caseNo ?? '').catch(() => {})
        await lp.page.getByRole('button', { name: new RegExp(created.caseNo ?? 'x') }).first().click({ timeout: 30_000 }).catch(() => {})
        await lp.page.locator('[aria-labelledby="plan-wo-title"] select').first().selectOption(empId).catch(() => {})
        await lp.page.locator('[aria-labelledby="plan-wo-title"] input[type="date"]').fill(day).catch(() => {})
        await lp.page.getByPlaceholder('F.eks. Montage – stueetage').fill(woTitle).catch(() => {})
        await lp.page.getByRole('button', { name: 'Opret arbejdsordre' }).click({ timeout: 30_000 }).catch(() => {})
        const wos = await poll(async () => ((await db.from('work_orders').select('id, assigned_employee_id, scheduled_date, status').eq('case_id', created.caseId!)).data ?? []) as Array<{ id: string; assigned_employee_id: string; scheduled_date: string; status: string }>, (x) => x.length > 0)
        created.wo = wos[0]?.id
        ko.k6_ao_planlagt_ui = wos.length === 1 && wos[0].assigned_employee_id === empId && wos[0].scheduled_date === day && wos[0].status === 'planned'
      } finally { await lp.ctx.close().catch(() => {}) }
      if (!created.wo) throw new Error('ingen arbejdsordre — workflow stopper')

      // opgave til montøren + kontorets prissatte materiale (seed: kontoret indkøber)
      const tk = await db.from('customer_tasks').insert([{ customer_id: created.customers[0], service_case_id: created.caseId, title: `${label} opgave`, status: 'pending', assigned_to: worker.id, created_by: A.leder.id }]).select('id')
      created.task = (tk.data?.[0] as { id?: string } | undefined)?.id
      const om = await db.from('case_materials').insert([{ case_id: created.caseId, description: `${tag} gruppetavle`, quantity: 1, unit: 'stk', unit_cost: 800, unit_sales_price: 1200, billable: true, source: 'manual', created_by: A.leder.id }]).select('id')
      created.officeMat = (om.data?.[0] as { id?: string } | undefined)?.id
      // variant 6: en lukket sag hos samme kunde med en AO til montøren; variant 8: dublet-medarbejderrække
      if (variant === 6) {
        const cc = await db.from('service_cases').insert([{ title: `${label} lukket sag`, customer_id: created.customers[0], status: 'closed', priority: 'medium', source: 'manual', created_by: A.leder.id }]).select('id')
        created.closedCase = (cc.data?.[0] as { id?: string } | undefined)?.id
        if (created.closedCase) {
          d.listCaseIds.push(created.closedCase)
          const xw = await db.from('work_orders').insert([{ case_id: created.closedCase, customer_id: created.customers[0], title: `${label} lukket-sag-AO`, scheduled_date: todayCph(), assigned_employee_id: empId, status: 'planned' }]).select('id')
          created.extraWo = (xw.data?.[0] as { id?: string } | undefined)?.id
        }
      }
      if (variant === 8) {
        const de = await db.from('employees').insert([{ name: `PILOT-SIM dublet ${tag}`, email: worker.email, role: 'montør', active: true, profile_id: worker.id, hourly_rate: 1, cost_rate: 1 }]).select('id')
        created.dupEmp = (de.data?.[0] as { id?: string } | undefined)?.id
      }
      if (variant === 3) await db.from('employees').update({ hourly_rate: null, cost_rate: null }).eq('id', empId)
      d.push({ id: `U${240 + slot} ${wf} kontor (${variantName})`, ok: Object.values(ko).every(Boolean), note: `${fmt(ko)}${notes.length ? ` · ${notes.join(' · ')}` : ''}` })

      // ================= MONTØR / ELEKTRIKER (375 px) =================
      const mp = await d.login(worker)
      instrument(mp.page, workerRole, wf)
      const pg = mp.page
      const startH = nextHour(empId)
      const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
      const caseUrl = (tab: string) => `${base}/dashboard/orders/${created.caseId}?tab=${tab}`
      const errorVisible = async () => (await pg.locator('[role="alert"], .text-red-600, .text-red-700, .bg-red-50').filter({ hasText: /\S/ }).count()) > 0
      const fillHours = async (from: string, to: string, text: string) => {
        await pg.getByRole('button', { name: /Registrér timer/ }).first().click({ timeout: 30_000 }).catch(() => {})
        await pg.locator('input[type="time"]').first().fill(from).catch(() => {})
        await pg.locator('input[type="time"]').nth(1).fill(to).catch(() => {})
        await pg.getByPlaceholder('Hvad blev der lavet?').fill(text).catch(() => {})
      }
      const tlRows = async () => ((await db.from('time_logs').select('id, hours, employee_id, approval_status, work_order_id, end_time').eq('work_order_id', created.wo!)).data ?? []) as Array<{ id: string; hours: number; employee_id: string; approval_status: string; work_order_id: string; end_time: string | null }>
      try {
        await pg.setViewportSize({ width: 375, height: 812 })
        // Mine job + Navigér
        const mj = await go(pg, workerRole, wf, `${base}/dashboard/tasks`, true)
        const row = pg.locator('li', { hasText: woTitle }).first()
        await row.waitFor({ timeout: 60_000 }).catch(() => {})
        mo.m1_mine_job = (await row.count()) === 1 && /Planlagt/.test(await row.innerText().catch(() => ''))
        const href = (await row.getByTestId('my-job-navigate').getAttribute('href').catch(() => null)) ?? ''
        mo.m2_navigér = noAddress ? !href.includes('undefined') && !href.includes('null') : href.startsWith('https://www.google.com/maps/dir/') && decodeURIComponent(href).includes(`Pilotvej ${n}`)
        if (noAddress) notes.push(`navigér uden adresse: ${href ? 'link vist' : 'intet link'}`)
        mo.m0_mine_job_ingen_vandret_scroll = (mj.overflow ?? 9999) <= 376
        if (variant === 8) {
          // dublet-medarbejderrække: jobbet (tildelt den ældste række) skal stadig vises; en AO på dubletten må ikke vælte siden
          mo.m1b_dublet_medarbejder_job_vist = mo.m1_mine_job && (await pg.getByTestId('my-jobs-card-error').count()) === 0
        }
        // åbn jobbet
        await row.getByTestId('my-job').click({ timeout: 30_000 }).catch(() => {})
        await pg.waitForURL(new RegExp(`/dashboard/orders/${created.caseId}`), { timeout: 60_000 }).catch(() => {})
        mo.m3_job_aabner_sagen = pg.url().includes(`/dashboard/orders/${created.caseId}`)
        await pg.getByRole('button', { name: '✓ Afslut' }).first().waitFor({ timeout: 60_000 }).catch(() => {})
        mo.m4_afslut_uden_start = (await pg.getByRole('button', { name: '✓ Afslut' }).count()) >= 1 && (await pg.getByRole('button', { name: '→ Start' }).count()) === (d.startJobFlag ? 1 : 0)
        mo.m5_sag_ingen_vandret_scroll = (await pg.evaluate(() => document.documentElement.scrollWidth).catch(() => 9999)) <= 376
        // variant 7: genindlæs sagen 3× (ingen dubletter, ingen fejl)
        if (variant === 7) for (let r = 0; r < 3; r++) { await pg.reload({ waitUntil: 'networkidle' }).catch(() => {}) }

        // timer
        if (variant === 3) {
          // manglende sats: afvises med forklaring, intet gemt, forsøget logges som 'rate'; Henrik retter satsen → genforsøg virker
          const since = new Date(Date.now() - 3000).toISOString()
          await fillHours(hh(startH), hh(startH + 1), `${tag} uden sats`)
          await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          await pg.waitForTimeout(2500)
          const shown = await errorVisible()
          const logged = await poll(async () => ((await db.from('system_health_log').select('metadata').eq('service', 'user_action').gte('created_at', since)).data ?? []) as Array<{ metadata: { user_id?: string; reason?: string } }>, (x) => x.some((y) => y.metadata?.user_id === worker.id), 10)
          mo.m6a_uden_sats_afvist_vist_logget = (await tlRows()).length === 0 && shown && logged.some((y) => y.metadata?.user_id === worker.id && y.metadata?.reason === 'rate')
          await db.from('employees').update(worker.id === A.elektriker.id ? { hourly_rate: 545, cost_rate: 320 } : { hourly_rate: 495, cost_rate: 300 }).eq('id', empId)
          await pg.keyboard.press('Escape').catch(() => {})
          await go(pg, workerRole, wf, caseUrl('planlaegning'), true)
        }
        if (variant === 9) {
          // netværksfejl: første "Gem timer"-kald afbrydes → fejl skal vises (ikke succes), intet gemt; genforsøg → én række
          let aborted = false
          await pg.route('**/*', (route) => {
            const r = route.request()
            if (!aborted && r.method() === 'POST' && r.headers()['next-action'] && (r.postData() ?? '').includes(`${tag} netfejl`)) { aborted = true; return route.abort('internetdisconnected') } // kun selve gem-kaldet (ikke baggrunds-polls)
            return route.continue()
          })
          await fillHours(hh(startH), hh(startH + 2), `${tag} netfejl`)
          await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          await pg.waitForTimeout(3000)
          const shownErr = (await pg.getByText(/fejl|kunne ikke|ikke gemt|forbindelse|netværk/i).count()) > 0
          const formStillOpen = (await pg.getByRole('button', { name: 'Gem timer' }).count()) > 0
          await pg.unroute('**/*').catch(() => {})
          mo.m6n_netfejl_ikke_vist_som_succes = aborted && (await tlRows()).length === 0 && (shownErr || formStillOpen)
          notes.push(`netfejl: fejltekst=${shownErr ? 'ja' : 'nej'} formular-åben=${formStillOpen ? 'ja' : 'nej'}`)
          if (formStillOpen) await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          else { await fillHours(hh(startH), hh(startH + 2), `${tag} genforsøg`); await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {}) }
        } else {
          await fillHours(hh(startH), hh(startH + (variant === 4 ? 1 : 2)), `${tag} montage`)
          const save = pg.getByRole('button', { name: 'Gem timer' })
          if (variant === 7) await save.dblclick({ timeout: 30_000 }).catch(() => {}) // dobbeltklik
          else await save.click({ timeout: 30_000 }).catch(() => {})
        }
        const tls = await poll(tlRows, (x) => x.length > 0)
        await pg.waitForTimeout(1500)
        const tlsAfter = await tlRows()
        const expectH = variant === 4 ? 1 : 2
        mo.m6_timer_paa_egen_ao = tls.length > 0 && tlsAfter.length === 1 && tlsAfter[0].employee_id === empId && Number(tlsAfter[0].hours) === expectH && tlsAfter[0].approval_status === 'pending'
        if (tlsAfter.length > 1) notes.push(`DUBLET-TIMER: ${tlsAfter.length} rækker`)
        if (variant === 2) {
          // overlap: samme tidsrum igen → afvist, intet gemt, forsøget spores
          const since = new Date(Date.now() - 3000).toISOString()
          await go(pg, workerRole, wf, caseUrl('planlaegning'), true)
          await fillHours(`${String(startH).padStart(2, '0')}:30`, `${String(startH + 1).padStart(2, '0')}:30`, `${tag} overlap`)
          await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
          const logged = await poll(async () => ((await db.from('system_health_log').select('metadata').eq('service', 'user_action').gte('created_at', since)).data ?? []) as Array<{ metadata: { user_id?: string; reason?: string } }>, (x) => x.some((y) => y.metadata?.user_id === worker.id), 15)
          mo.m6b_overlap_afvist_spores = (await tlRows()).length === 1 && logged.some((y) => y.metadata?.reason === 'overlap') && await errorVisible()
          await pg.keyboard.press('Escape').catch(() => {})
        }
        if (variant === 6 && created.extraWo) {
          // lukket sag: timer på AO'en afvises (UI og direkte kald), intet gemt
          await go(pg, workerRole, wf, `${base}/dashboard/orders/${created.closedCase}?tab=planlaegning`, true)
          const btnCount = await pg.getByRole('button', { name: /Registrér timer/ }).count()
          let uiRefused = btnCount === 0
          if (btnCount > 0) {
            await fillHours(hh(startH + 3), hh(startH + 4), `${tag} lukket`)
            await pg.getByRole('button', { name: 'Gem timer' }).click({ timeout: 30_000 }).catch(() => {})
            await pg.waitForTimeout(2500)
            uiRefused = await errorVisible()
            await pg.keyboard.press('Escape').catch(() => {})
          }
          const raw = await d.callServerAction(pg, caseUrl('planlaegning'), 'src/lib/actions/time-logs.ts', 'createTimeLog', [{ work_order_id: created.extraWo, employee_id: empId, date: todayCph(), start_clock: hh(startH + 5), end_clock: hh(startH + 6), hours: 1, billable: true, description: `${tag} lukket direkte` }])
          const stored = (await db.from('time_logs').select('id', { count: 'exact', head: true }).eq('work_order_id', created.extraWo)).count ?? 0
          mo.m6c_lukket_sag_ingen_timer = uiRefused && stored === 0 && !/"success":true/.test(raw)
          notes.push(`lukket sag: knap=${btnCount ? 'vist' : 'skjult'}`)
        }

        // beskrivelse
        await go(pg, workerRole, wf, caseUrl('overblik'), true)
        await pg.getByText(`${tag} beskrivelse`).first().waitFor({ timeout: 30_000 }).catch(() => {})
        mo.m7_beskrivelse = (await pg.getByText(`${tag} beskrivelse`).count()) > 0
        // foto (variant 5: fremmed sags dokument må ikke vises)
        await go(pg, workerRole, wf, caseUrl('dokumenter'), true)
        await pg.getByTestId('case-upload-input').setInputFiles({ name: `psim-${n}.png`, mimeType: 'image/png', buffer: PNG }).catch(() => {})
        await pg.getByTestId('case-upload-msg').waitFor({ timeout: 60_000 }).catch(() => {})
        const docs = ((await db.from('customer_documents').select('id, customer_id').eq('service_case_id', created.caseId)).data ?? []) as Array<{ id: string; customer_id: string }>
        mo.m8_foto_paa_rigtig_sag_kunde = docs.length === 1 && docs[0].customer_id === created.customers[0] && (await pg.getByTestId('case-documents-error').count()) === 0
        if (variant === 5) mo.m8b_fremmed_dokument_ikke_vist = (await pg.getByText(A.foreignDocName).count()) === 0
        // materiale (dialog uden priser) → på DENNE sag
        await go(pg, workerRole, wf, caseUrl('materialer'), true)
        await pg.getByText(`${tag} gruppetavle`).first().waitFor({ timeout: 30_000 }).catch(() => {})
        const matsText = (await pg.locator('main').innerText().catch(() => '')) ?? ''
        mo.m9_kontor_materiale_uden_pris = matsText.includes(`${tag} gruppetavle`) && !/1\.200,00\s*kr|800,00\s*kr/.test(matsText)
        const ownMat = `${tag} montør-dåse`
        await pg.getByRole('button', { name: /Tilføj materiale/ }).first().click({ timeout: 30_000 }).catch(() => {})
        const dlg = pg.locator('[aria-labelledby="case-material-dialog-title"]')
        await dlg.getByPlaceholder('F.eks. Solpanel 425W LR4-72HPH').fill(ownMat).catch(() => {})
        await dlg.locator('input[inputmode="decimal"]').nth(0).fill('3').catch(() => {})
        const dlgPrices = await dlg.getByText(/Kostpris pr\. enhed|Salgspris pr\. enhed|Sum kost/).count()
        await dlg.getByRole('button', { name: 'Tilføj', exact: true }).click({ timeout: 30_000 }).catch(() => {})
        const own = await poll(async () => ((await db.from('case_materials').select('case_id, quantity, created_by').eq('description', ownMat)).data ?? []) as Array<{ case_id: string; quantity: number; created_by: string }>, (x) => x.length > 0)
        mo.m9b_eget_materiale_rigtig_sag = own.length === 1 && own[0].case_id === created.caseId && Number(own[0].quantity) === 3 && own[0].created_by === worker.id && dlgPrices === 0
        if (variant === 5) {
          // fremmed sag/kunde/opgave: side afvist; materiale og opgave via direkte kald afvises, intet ændret
          await go(pg, workerRole, wf, `${base}/dashboard/orders/${A.foreignCase}`, true)
          await pg.getByText('Siden blev ikke fundet').first().waitFor({ timeout: 45_000 }).catch(() => {})
          mo.m15a_fremmed_sag_afvist = (await pg.getByText('Siden blev ikke fundet').count()) > 0 && (await pg.getByText(`fremmed sag ${d.stamp}`).count()) === 0
          const cr = await go(pg, workerRole, wf, `${base}/dashboard/customers/${A.foreignCustomer}`, true)
          const ctext = (await pg.locator('main').innerText().catch(() => '')) ?? ''
          mo.m15b_fremmed_kunde_afvist = !ctext.includes(`fremmed kunde ${d.stamp}`) && (cr.res?.status() !== 200 || /ikke fundet|ikke adgang/i.test(ctext))
          const before = (await db.from('case_materials').select('id', { count: 'exact', head: true }).eq('case_id', A.foreignCase)).count ?? 0
          const rawM = await d.callServerAction(pg, caseUrl('materialer'), 'src/lib/actions/case-materials.ts', 'createCaseMaterial', [{ case_id: A.foreignCase, description: `${tag} på fremmed sag`, quantity: 1, unit: 'stk' }])
          const after = (await db.from('case_materials').select('id', { count: 'exact', head: true }).eq('case_id', A.foreignCase)).count ?? 0
          mo.m15c_materiale_fremmed_sag_afvist = after === before && !/"success":true/.test(rawM)
          const rawT = await d.callServerAction(pg, caseUrl('opgaver'), 'src/lib/actions/customer-tasks.ts', 'completeCustomerTask', [A.foreignTask])
          const fts = String(((await db.from('customer_tasks').select('status').eq('id', A.foreignTask).maybeSingle()).data as { status?: string } | null)?.status ?? '')
          mo.m15d_fremmed_opgave_afvist = fts === 'pending' && !/"success":true/.test(rawT)
          // materiale på forkert AO: egen sags AO-id, men fremmed sag i input → stadig afvist (ovenfor); tidsregistrering på fremmed AO
          const rawW = await d.callServerAction(pg, caseUrl('planlaegning'), 'src/lib/actions/time-logs.ts', 'createTimeLog', [{ work_order_id: created.wo, employee_id: A.empMontor === empId ? A.empElektriker : A.empMontor, date: todayCph(), start_clock: '22:00', end_clock: '23:00', hours: 1, billable: true, description: `${tag} på kollegas konto` }])
          mo.m15e_timer_paa_kollegas_konto_afvist = (await tlRows()).length === 1 && !/"success":true/.test(rawW)
        }
        // opgave → udført
        await go(pg, workerRole, wf, caseUrl('opgaver'), true)
        await pg.getByText(`${label} opgave`).first().waitFor({ timeout: 30_000 }).catch(() => {})
        await pg.getByTitle('Markér som udført').first().click({ timeout: 30_000 }).catch(() => {})
        const tst = await poll(async () => String(((await db.from('customer_tasks').select('status').eq('id', created.task!).maybeSingle()).data as { status?: string } | null)?.status ?? ''), (x) => x === 'done', 15)
        mo.m10_opgave_udfoert = tst === 'done'
        // aflevering: tjekliste + underskrift
        await go(pg, workerRole, wf, caseUrl('aflevering'), true)
        await pg.getByTestId('handover-start').click({ timeout: 60_000 }).catch(() => {})
        await pg.getByTestId('handover-open-signature').click({ timeout: 30_000 }).catch(() => {})
        await pg.getByPlaceholder('Fulde navn').fill('Pilot Kunde').catch(() => {})
        const canvas = pg.getByTestId('handover-signature').locator('canvas')
        const confirmBtn = pg.getByRole('button', { name: /Bekræft underskrift/ })
        for (let attempt = 0; attempt < 2; attempt++) {
          await canvas.scrollIntoViewIfNeeded().catch(() => {})
          await pg.waitForTimeout(400)
          const sbox = await canvas.boundingBox().catch(() => null)
          if (sbox) { await pg.mouse.move(sbox.x + 15, sbox.y + 20); await pg.mouse.down(); await pg.mouse.move(sbox.x + 120, sbox.y + 45, { steps: 8 }); await pg.mouse.move(sbox.x + 200, sbox.y + 20, { steps: 8 }); await pg.mouse.up() }
          if (await confirmBtn.isEnabled().catch(() => false)) break
        }
        await confirmBtn.click({ timeout: 30_000 }).catch(() => {})
        const signed = await poll(async () => String(((await db.from('service_cases').select('customer_signature_name').eq('id', created.caseId!).maybeSingle()).data as { customer_signature_name?: string } | null)?.customer_signature_name ?? ''), (x) => !!x, 15)
        mo.m11_aflevering_underskrevet = signed === 'Pilot Kunde'
        // ✓ Afslut direkte fra Planlagt
        await go(pg, workerRole, wf, caseUrl('planlaegning'), true)
        pg.once('dialog', (x) => { x.accept().catch(() => {}) })
        await pg.getByRole('button', { name: '✓ Afslut' }).first().click({ timeout: 30_000 }).catch(() => {})
        const st = await poll(async () => String(((await db.from('work_orders').select('status').eq('id', created.wo!).maybeSingle()).data as { status?: string } | null)?.status ?? ''), (x) => x === 'done', 15)
        mo.m12_afsluttet = st === 'done'
        // Mine timer: ingen læsefejl, og registreringen tæller (ikke 0)
        await go(pg, workerRole, wf, `${base}/dashboard/tasks`, true)
        await pg.getByTestId('my-hours-card').waitFor({ timeout: 45_000 }).catch(() => {})
        const hoursText = (await pg.getByTestId('my-hours-card').innerText().catch(() => '')) ?? ''
        mo.m13_mine_timer_ikke_fejl_eller_0 = (await pg.getByTestId('my-hours-card-error').count()) === 0 && !/^\s*0[,.]?0*\s*t\b/m.test(hoursText) && (await pg.getByTestId('my-jobs-card').locator('li', { hasText: woTitle }).filter({ hasText: /Planlagt|I gang/ }).count()) === 0
        // montør: faktura-PDF på egen sag → 404 (faktura er kontorets)
        await pg.screenshot({ caret: 'initial', path: join(d.shots, `pilot-sim-${wf}-mobil.png`), fullPage: true }).catch(() => {})
      } finally { await mp.ctx.close().catch(() => {}) }
      d.push({ id: `U${240 + slot} ${wf} ${workerRole} mobil (${variantName})`, ok: Object.values(mo).every(Boolean), note: `${fmt(mo)}${notes.length ? ` · ${notes.join(' · ')}` : ''}` })

      // ================= ØKONOMI =================
      // 6. serviceleder godkender (variant 4: afviser) timerne i UI'et
      const lp2 = await d.login(A.leder)
      instrument(lp2.page, 'serviceleder', wf)
      try {
        await go(lp2.page, 'serviceleder', wf, `${base}/dashboard/time-approval`)
        const arow = lp2.page.getByTestId('time-approval-row').filter({ hasText: created.caseNo ?? '§' })
        await arow.first().waitFor({ timeout: 60_000 }).catch(() => {})
        if (variant === 4) {
          await arow.first().getByTestId('time-approval-reject').click({ timeout: 30_000 }).catch(() => {})
          await lp2.page.getByTestId('time-approval-reason').fill('Forkert tidsrum').catch(() => {})
          await lp2.page.getByTestId('time-approval-reject-confirm').click({ timeout: 30_000 }).catch(() => {})
        } else {
          await arow.first().getByTestId('time-approval-approve').click({ timeout: 30_000 }).catch(() => {})
        }
        const want = variant === 4 ? 'rejected' : 'approved'
        const tl = await poll(async () => ((await db.from('time_logs').select('approval_status, approved_by').eq('work_order_id', created.wo!)).data ?? []) as Array<{ approval_status: string; approved_by: string | null }>, (x) => x.length > 0 && x.every((y) => y.approval_status === want))
        eo.e1_timer_behandlet_ui = tl.length === 1 && tl[0].approval_status === want
      } finally { await lp2.ctx.close().catch(() => {}) }

      // 7. del-faktura fra sagen (admin på lige, bogholderi på ulige) — klik to gange: ingen dobbeltfakturering
      const invoicer = n % 2 === 0 ? A.admin : A.bogholderi
      const ip = await d.login(invoicer)
      instrument(ip.page, invoicer.role, wf)
      try {
        await go(ip.page, invoicer.role, wf, `${base}/dashboard/orders/${created.caseId}?tab=fakturakladde`)
        const btn = ip.page.getByRole('button', { name: /Opret del-faktura/ }).first()
        await btn.waitFor({ timeout: 90_000 }).catch(() => {})
        await btn.click({ timeout: 30_000 }).catch(() => {})
        const inv = await poll(async () => ((await db.from('invoices').select('id, status, total_amount').eq('case_id', created.caseId!)).data ?? []) as Array<{ id: string; status: string; total_amount: number }>, (x) => x.length > 0 && Number(x[0].total_amount) > 0, 25)
        for (const x of inv) created.invoices.push(x.id)
        // andet klik (genindlæst kladde): intet nyt at fakturere → ingen ny faktura
        await go(ip.page, invoicer.role, wf, `${base}/dashboard/orders/${created.caseId}?tab=fakturakladde`)
        const btn2 = ip.page.getByRole('button', { name: /Opret del-faktura/ }).first()
        if ((await btn2.count()) && (await btn2.isEnabled().catch(() => false))) { await btn2.click({ timeout: 15_000 }).catch(() => {}); await ip.page.waitForTimeout(4000) }
        const invAfter = ((await db.from('invoices').select('id').eq('case_id', created.caseId)).data ?? []) as Array<{ id: string }>
        for (const x of invAfter) if (!created.invoices.includes(x.id)) created.invoices.push(x.id)
        const tlNow = ((await db.from('time_logs').select('id, sale_amount, approval_status, invoice_line_id').eq('work_order_id', created.wo!)).data ?? []) as Array<{ id: string; sale_amount: number | null; approval_status: string; invoice_line_id: string | null }>
        const lines = inv[0] ? ((await db.from('invoice_lines').select('id, total_price, source_case_material_id').eq('invoice_id', inv[0].id)).data ?? []) as Array<{ id: string; total_price: number; source_case_material_id: string | null }> : []
        const hourSale = tlNow.filter((x) => x.approval_status === 'approved').reduce((s, x) => s + Number(x.sale_amount ?? 0), 0)
        const expected = 1200 + hourSale // kontorets materiale (1 × 1.200) + godkendte timer; montørens materiale uden pris faktureres ikke som 0-linje
        eo.e2_kladde_oprettet_ui = inv.length >= 1 && inv[0].status === 'draft'
        eo.e3_ingen_dobbeltfaktura = invAfter.length === 1
        eo.e4_beloeb_korrekt = !!inv[0] && Math.abs(Number(inv[0].total_amount) - expected) < 0.01
        eo.e5_afviste_timer_ikke_faktureret = tlNow.every((x) => x.approval_status === 'approved' ? !!x.invoice_line_id : !x.invoice_line_id)
        eo.e6_materiale_laast_en_gang = lines.filter((l) => l.source_case_material_id === created.officeMat).length === 1
        notes.push(`faktura=${inv[0]?.total_amount ?? '—'} forventet=${expected} linjer=${lines.length}`)
      } finally { await ip.ctx.close().catch(() => {}) }

      // 8. synlighed: bogholderi ser fakturaen; salg A ser faktureringsstatus; salg B og montøren afvises
      const bp = await d.login(A.bogholderi)
      instrument(bp.page, 'bogholderi', wf)
      try {
        await go(bp.page, 'bogholderi', wf, `${base}/dashboard/invoices`)
        const invNo = String(((await db.from('invoices').select('invoice_number').eq('id', created.invoices[0] ?? '').maybeSingle()).data as { invoice_number?: string } | null)?.invoice_number ?? '§§')
        await bp.page.getByText(invNo).first().waitFor({ timeout: 30_000 }).catch(() => {})
        eo.e7_bogholderi_ser_faktura = (await bp.page.getByText(invNo).count()) > 0 && (await bp.page.getByText(/Kunne ikke hente/).count()) === 0
      } finally { await bp.ctx.close().catch(() => {}) }
      const sa = await d.login(A.salgA)
      instrument(sa.page, 'salg', wf)
      try {
        await go(sa.page, 'salg', wf, `${base}/dashboard/orders/${created.caseId}`)
        await sa.page.getByText(/Delvist faktureret|Fuldt faktureret|Klar til fakturering|Faktureret/).first().waitFor({ timeout: 45_000 }).catch(() => {})
        eo.e8_saelger_ser_sag_og_status = (await sa.page.getByText(/Delvist faktureret|Fuldt faktureret|Klar til fakturering|Faktureret/).count()) > 0
      } finally { await sa.ctx.close().catch(() => {}) }
      if (variant === 8 || variant === 5 || variant === 0) {
        const sb = await d.login(A.salgB)
        instrument(sb.page, 'salg', wf)
        try {
          await go(sb.page, 'salg', wf, `${base}/dashboard/orders/${created.caseId}`)
          await sb.page.getByText('Siden blev ikke fundet').first().waitFor({ timeout: 45_000 }).catch(() => {})
          eo.e9_fremmed_saelger_ser_ikke_sag = (await sb.page.getByText('Siden blev ikke fundet').count()) > 0 && (await sb.page.getByText(`${label} tilbud`).count()) === 0
          const pdf = created.invoices[0] ? await sb.page.request.get(`${base}/api/invoices/${created.invoices[0]}/pdf`).catch(() => null) : null
          eo.e10_fremmed_saelger_ingen_faktura_pdf = !!pdf && pdf.status() !== 200
          await go(sb.page, 'salg', wf, `${base}/dashboard/invoices`)
          const invNo = String(((await db.from('invoices').select('invoice_number').eq('id', created.invoices[0] ?? '').maybeSingle()).data as { invoice_number?: string } | null)?.invoice_number ?? '§§')
          eo.e11_fremmed_saelger_ingen_faktura_i_liste = (await sb.page.getByText(invNo).count()) === 0
        } finally { await sb.ctx.close().catch(() => {}) }
        const mp2 = await d.login(worker)
        try {
          const pdf = created.invoices[0] ? await mp2.page.request.get(`${base}/api/invoices/${created.invoices[0]}/pdf`).catch(() => null) : null
          eo.e12_montoer_ingen_faktura_pdf = !!pdf && pdf.status() !== 200
        } finally { await mp2.ctx.close().catch(() => {}) }
      }

      // 8b. grundflow: kan kontoret lukke sagen mens afleveringens tjekliste er åben? (UI'et lover at det kræver alle punkter)
      if (variant === 0) {
        const cp = await d.login(A.admin)
        try {
          const raw = await d.callServerAction(cp.page, `${base}/dashboard/orders/${created.caseId}`, 'src/lib/actions/service-cases.ts', 'markServiceCaseDone', [created.caseId, { acknowledgeUnbilled: true }])
          const sc = ((await db.from('service_cases').select('status, checklist').eq('id', created.caseId).maybeSingle()).data ?? {}) as { status?: string; checklist?: Array<{ completed?: boolean; required?: boolean }> | null }
          const openReq = Array.isArray(sc.checklist) ? sc.checklist.filter((i) => i.required !== false && !i.completed).length : -1
          notes.push(`LUKKE-PRØVE: status=${sc.status} åbne påkrævede punkter=${openReq} svar=${/"success":true/.test(raw) ? 'succes' : 'afvist'}`)
          metric({ kind: 'close_probe', wf, status: sc.status, openRequired: openReq, accepted: /"success":true/.test(raw) })
        } finally { await cp.ctx.close().catch(() => {}) }
      }

      // 9. databaseverifikation efter workflowet
      const v = await verifyWorkflow(db, { caseId: created.caseId, customerId: created.customers[0], offerId: created.offer, wo: created.wo, empId, tag, startIso: new Date(t0).toISOString(), employees: [A.empMontor, A.empElektriker, ...(created.dupEmp ? [created.dupEmp] : [])], foreignCase: A.foreignCase })
      Object.assign(eo, v.checks)
      if (v.notes.length) notes.push(...v.notes)
      d.push({ id: `U${240 + slot} ${wf} økonomi+integritet (${variantName})`, ok: Object.values(eo).every(Boolean), note: `${fmt(eo)}${notes.length ? ` · ${notes.join(' · ')}` : ''}` })
      metric({ kind: 'workflow', wf, variant: variantName, worker: workerRole, seconds: Math.round((Date.now() - t0) / 1000), office: ko, mobile: mo, economy: eo })
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 200)
      d.push({ id: `U${240 + slot} ${wf} AFBRUDT (${variantName})`, ok: false, note: `${msg} · kontor: ${fmt(ko)} · mobil: ${fmt(mo)} · økonomi: ${fmt(eo)}` })
      metric({ kind: 'workflow', wf, variant: variantName, worker: workerRole, seconds: Math.round((Date.now() - t0) / 1000), aborted: msg, office: ko, mobile: mo, economy: eo })
    } finally {
      await cleanupWorkflow(db, created, tag).catch((e) => console.log(`[pilot-sim] oprydning ${wf}: ${String(e).slice(0, 160)}`))
      if (variant === 3) await db.from('employees').update(worker.id === A.elektriker.id ? { hourly_rate: 545, cost_rate: 320 } : { hourly_rate: 495, cost_rate: 300 }).eq('id', empId)
    }
  }
}

/** Integritetstjek for ét workflow (som pilot-sessionstjekket, men afgrænset til workflowets egne data) */
async function verifyWorkflow(db: SupabaseClient, x: { caseId: string; customerId: string; offerId: string; wo: string; empId: string; tag: string; startIso: string; employees: string[]; foreignCase: string }) {
  const checks: Record<string, boolean> = {}
  const notes: string[] = []
  const cases = ((await db.from('service_cases').select('id').eq('source_offer_id', x.offerId)).data ?? []) as unknown[]
  checks.i1_ingen_dublet_sag = cases.length === 1
  const wos = ((await db.from('work_orders').select('id, assigned_employee_id, case_id').eq('case_id', x.caseId)).data ?? []) as Array<{ id: string; assigned_employee_id: string | null; case_id: string }>
  const tls = wos.length ? ((await db.from('time_logs').select('id, employee_id, work_order_id, end_time').in('work_order_id', wos.map((w) => w.id))).data ?? []) as Array<{ id: string; employee_id: string; work_order_id: string; end_time: string | null }> : []
  checks.i2_timer_kun_paa_tildelt_ao = tls.every((t) => wos.find((w) => w.id === t.work_order_id)?.assigned_employee_id === t.employee_id)
  checks.i3_ingen_aaben_timer = tls.every((t) => !!t.end_time)
  const orphan = ((await db.from('time_logs').select('id').in('employee_id', x.employees).is('work_order_id', null).gte('created_at', x.startIso)).data ?? []) as unknown[]
  checks.i4_ingen_foraeldreloese_timer = orphan.length === 0
  const mats = ((await db.from('case_materials').select('case_id').ilike('description', `%${x.tag}%`)).data ?? []) as Array<{ case_id: string }>
  checks.i5_materialer_paa_rigtig_sag = mats.length > 0 && mats.every((m) => m.case_id === x.caseId)
  const foreignMats = ((await db.from('case_materials').select('id').eq('case_id', x.foreignCase).ilike('description', `%${x.tag}%`)).data ?? []) as unknown[]
  checks.i6_intet_paa_fremmed_sag = foreignMats.length === 0
  const docs = ((await db.from('customer_documents').select('customer_id, service_case_id').eq('service_case_id', x.caseId)).data ?? []) as Array<{ customer_id: string }>
  checks.i7_dokumenter_rigtig_kunde = docs.every((dd) => dd.customer_id === x.customerId)
  const invs = ((await db.from('invoices').select('id').eq('case_id', x.caseId)).data ?? []) as Array<{ id: string }>
  const lines = invs.length ? ((await db.from('invoice_lines').select('id, source_case_material_id, source_time_log_id').in('invoice_id', invs.map((i) => i.id))).data ?? []) as Array<{ id: string; source_case_material_id: string | null; source_time_log_id: string | null }> : []
  const matIds = lines.map((l) => l.source_case_material_id).filter(Boolean)
  const tlIds = lines.map((l) => l.source_time_log_id).filter(Boolean)
  checks.i8_ingen_dobbelt_postering = new Set(matIds).size === matIds.length && new Set(tlIds).size === tlIds.length
  const tlInvoiced = tls.length ? ((await db.from('time_logs').select('invoice_line_id').in('id', tls.map((t) => t.id)).not('invoice_line_id', 'is', null)).data ?? []) as Array<{ invoice_line_id: string }> : []
  checks.i9_hver_time_hoejst_en_linje = new Set(tlInvoiced.map((t) => t.invoice_line_id)).size === tlInvoiced.length
  // aflevering markeret underskrevet → tjeklisten skal findes (ikke "underskrevet" uden aflevering)
  const sc = ((await db.from('service_cases').select('customer_signature_name, checklist, signed_at').eq('id', x.caseId).maybeSingle()).data ?? {}) as { customer_signature_name?: string | null; checklist?: Array<{ completed?: boolean }> | null; signed_at?: string | null }
  const open = Array.isArray(sc.checklist) ? sc.checklist.filter((i) => !i.completed).length : -1
  checks.i10_aflevering_konsistent = !sc.customer_signature_name || (Array.isArray(sc.checklist) && !!sc.signed_at)
  if (open > 0) notes.push(`aflevering underskrevet med ${open} åbne tjeklistepunkter`)
  // e-conomic: intet sendt for workflowets fakturaer
  const ec = invs.length ? await db.from('invoices').select('external_invoice_id, external_provider, sent_at').in('id', invs.map((i) => i.id)) : null
  checks.i11_intet_sendt_til_economic = !ec || ((ec.data ?? []) as Array<{ external_invoice_id?: unknown; sent_at?: unknown }>).every((r) => !r.external_invoice_id && !r.sent_at)
  return { checks, notes }
}

async function cleanupWorkflow(db: SupabaseClient, c: { customers: string[]; offer?: string; token?: string; caseId?: string; wo?: string; task?: string; extraWo?: string; closedCase?: string; dupEmp?: string; invoices: string[] }, tag: string) {
  const caseIds = [c.caseId, c.closedCase].filter(Boolean) as string[]
  const woIds = caseIds.length ? (((await db.from('work_orders').select('id').in('case_id', caseIds)).data ?? []) as Array<{ id: string }>).map((w) => w.id) : []
  if (woIds.length) await db.from('time_logs').update({ invoice_line_id: null }).in('work_order_id', woIds)
  if (caseIds.length) await db.from('case_materials').update({ invoice_line_id: null }).in('case_id', caseIds)
  const invIds = caseIds.length ? [...new Set([...c.invoices, ...(((await db.from('invoices').select('id').in('case_id', caseIds)).data ?? []) as Array<{ id: string }>).map((i) => i.id)])] : c.invoices
  if (invIds.length) { await db.from('invoice_lines').delete().in('invoice_id', invIds); await db.from('invoices').delete().in('id', invIds) }
  if (woIds.length) { await db.from('time_logs').delete().in('work_order_id', woIds); await db.from('work_orders').delete().in('id', woIds) }
  await db.from('case_materials').delete().ilike('description', `%${tag}%`)
  if (caseIds.length) {
    await db.from('customer_tasks').delete().in('service_case_id', caseIds)
    const docs = ((await db.from('customer_documents').select('id, storage_path').in('service_case_id', caseIds)).data ?? []) as Array<{ id: string; storage_path: string | null }>
    const paths = docs.map((x) => x.storage_path).filter(Boolean) as string[]
    if (paths.length) await db.storage.from('attachments').remove(paths).catch(() => {})
    await db.from('customer_documents').delete().in('service_case_id', caseIds)
    const atts = ((await db.from('service_case_attachments').select('storage_path').in('service_case_id', caseIds)).data ?? []) as Array<{ storage_path: string | null }>
    const ap = atts.map((x) => x.storage_path).filter(Boolean) as string[]
    if (ap.length) await db.storage.from('service-case-files').remove(ap).catch(() => {})
    await db.from('service_case_attachments').delete().in('service_case_id', caseIds)
    await db.from('case_notes').delete().in('case_id', caseIds)
    await db.from('service_cases').delete().in('id', caseIds)
  }
  if (c.offer) {
    await db.from('offer_signatures').delete().eq('offer_id', c.offer)
    await db.from('offer_activities').delete().eq('offer_id', c.offer)
    await db.from('offer_line_items').delete().eq('offer_id', c.offer)
    await db.from('offers').delete().eq('id', c.offer)
  }
  if (c.token) await db.from('portal_access_tokens').delete().eq('id', c.token)
  if (c.dupEmp) await db.from('employees').delete().eq('id', c.dupEmp)
  for (const id of c.customers) {
    await db.from('customer_tasks').delete().eq('customer_id', id)
    await db.from('customers').delete().eq('id', id)
  }
}

/** Fælles aktører ryddes til sidst (brugerne selv slettes af ui-e2e) */
export async function cleanupPilotSimActors(db: SupabaseClient): Promise<void> {
  const A = actorsCache
  if (!A) return
  await db.from('customer_tasks').delete().eq('id', A.foreignTask)
  await db.from('customer_documents').delete().eq('service_case_id', A.foreignCase)
  await db.from('service_cases').delete().eq('id', A.foreignCase)
  await db.from('customers').delete().eq('id', A.foreignCustomer)
  await db.from('user_permission_overrides').delete().eq('profile_id', A.elektriker.id)
  // timer kan referere medarbejderne (allerede slettet pr. workflow); fejl her er ufarlige på staging
  await db.from('employees').delete().in('id', [A.empMontor, A.empElektriker])
  actorsCache = null
}
