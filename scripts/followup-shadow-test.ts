/**
 * Skygge-tælling for opfølgning (src/lib/followup/shadow.ts). Ingen DB, ingen afsendelse.
 *   npx tsx scripts/followup-shadow-test.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { followupShadowDetail, followupShadowLevel, followupShadowReport, type ShadowOffer } from '../src/lib/followup/shadow'
import type { InvoiceSnap } from '../src/lib/followup/engine'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}

const today = '2026-10-09'
const now = Date.parse('2026-10-09T12:00:00.000Z')
const offer = (over: Partial<ShadowOffer> = {}): ShadowOffer => ({
  id: 'offer-secret-id',
  customer_id: 'cust-secret',
  status: 'sent',
  is_proposal: false,
  sent_at: '2026-09-29T10:00:00.000Z',
  valid_until: '2026-12-01',
  reminder_count: 0,
  last_reminder_sent: null,
  has_open_followup_task: false,
  created_at: '2026-09-01T10:00:00.000Z',
  ...over,
})
const invoice = (): InvoiceSnap => ({
  id: 'inv-secret',
  customer_id: 'cust-secret',
  status: 'sent',
  invoice_type: 'standard',
  final_amount: 1000,
  due_date: '2026-09-20',
  reminder_count: 0,
  last_reminder_at: null,
})

{
  const r = followupShadowReport({ offers: [offer()], invoices: [invoice()], threads: [] }, today, now)
  eq('fakturaen optager dagens ene kundepåmindelse', r.engineOfferReminder, 0)
  eq('tilbudspåmindelsen udskydes', r.deferred, 1)
  eq('sælger-opgave venter mens påmindelser er tilbage', r.engineSellerTask, 0)
  eq('motor vil rykke fakturaen på første niveau', r.engineInvoiceReminder, 1)
  eq('cron og agent rammer samme tilbud', r.sameOfferBoth, 1)
  eq('cron ville sende', r.legacyCronWouldSend, 1)
  eq('agent ville foreslå', r.legacyAgentWouldSuggest, 1)
  eq('dashboard tæller fra oprettelse', r.dashboardFollowup, 1)
  eq('konflikten er gul', followupShadowLevel(r), 'yellow')
  const text = followupShadowDetail(r)
  eq('teksten nævner ikke tilbudsid', text.includes('offer-secret-id'), false)
  eq('teksten nævner ikke kundeid', text.includes('cust-secret'), false)
  eq('teksten nævner ikke fakturaid', text.includes('inv-secret'), false)
  eq('teksten siger at intet sendes', text.includes('intet sendt'), true)
}

{
  const r = followupShadowReport({
    offers: [offer({ reminder_count: 3 })],
    invoices: [],
    threads: [],
  }, today, now)
  eq('brugte påmindelser giver sælger-opgave', r.engineSellerTask, 1)
  eq('cron sender ikke når loftet er nået', r.legacyCronWouldSend, 0)
  eq('agenten ser ikke påmindelsesloftet', r.legacyAgentWouldSuggest, 1)
  eq('ikke samme tilbud i begge udsendelser', r.sameOfferBoth, 0)
  eq('uden fakturarykker og uden dobbelt ramme er den grøn', followupShadowLevel(r), 'green')
}

{
  const prod = readFileSync(join(process.cwd(), 'scripts/prod-followup-shadow.ts'), 'utf8')
  const health = readFileSync(join(process.cwd(), 'src/lib/ops/pilot-health.ts'), 'utf8')
  const start = health.indexOf('async function followupShadowHealthItem')
  const item = health.slice(start, health.indexOf('// ---------- 3. Brugere ----------'))
  eq('prod-scriptet bruger skyggefunktionen', prod.includes('followupShadowReport(') && !prod.includes('evaluateFollowups('), true)
  eq('prod-scriptet skriver ikke', !/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/.test(prod), true)
  eq('sundheden viser kun detaljeteksten', item.includes('followupShadowDetail(report)') && item.includes('followupShadowLevel(report)'), true)
  eq('sundheden henter ikke kundenavn', !item.includes('company_name') && !item.includes('full_name') && !item.includes('email'), true)
}

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle opfølgnings-skygge-tests bestået')
process.exitCode = bad ? 1 : 0
