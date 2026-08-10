/**
 * Read-only prod-health for: kundeportal-fakturaer (Fase 1-2) + sags-haerdning (Fase 0).
 *
 * Bekraefter:
 *  1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx).
 *  2) Skemaet baerer de kolonner getPortalInvoices + den haerdede
 *     getPortalServiceCases laeser (invoices/ service_cases/ portal_access_tokens).
 *  3) Den NYE rute /api/portal/invoices/pdf er deployet (svarer 400 paa
 *     manglende params = mit kode er live; 404 = gammelt deploy).
 *
 * Ren kode/UI-aendring — INGEN DB-schema/migrationer, INGEN mutationer.
 */
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const appUrl = (env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text(); let body; try { body = JSON.parse(text) } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}

let fails = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK ' : 'XX '} ${msg}`); if (!cond) fails++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('\n=== PROD-HEALTH kundeportal-fakturaer (read-only) ===\n')

  // 1) Prod-deployet live
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Skema-kolonner som portal-koden laeser
  const cols = await q(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name='invoices' AND column_name IN ('customer_id','invoice_number','status','payment_status','invoice_type','total_amount','tax_amount','final_amount','amount_paid','currency','due_date','sent_at','paid_at','created_at','voided_at'))
       OR (table_name='service_cases' AND column_name IN ('customer_id','case_number','title','description','status','priority','status_note','address','postal_code','city','floor_door','start_date','end_date','project_name','type','reference','created_at'))
       OR (table_name='portal_access_tokens' AND column_name IN ('token','customer_id','is_active','expires_at'))
    ORDER BY table_name, column_name`)
  const found = cols.ok && Array.isArray(cols.body) ? cols.body.map((r) => `${r.table_name}.${r.column_name}`) : []
  const required = [
    'invoices.customer_id', 'invoices.invoice_number', 'invoices.status', 'invoices.payment_status', 'invoices.invoice_type',
    'invoices.total_amount', 'invoices.tax_amount', 'invoices.final_amount', 'invoices.amount_paid', 'invoices.currency',
    'invoices.due_date', 'invoices.sent_at', 'invoices.paid_at', 'invoices.created_at', 'invoices.voided_at',
    'service_cases.customer_id', 'service_cases.case_number', 'service_cases.status_note', 'service_cases.project_name',
    'service_cases.floor_door', 'service_cases.start_date', 'service_cases.end_date',
    'portal_access_tokens.token', 'portal_access_tokens.customer_id', 'portal_access_tokens.is_active', 'portal_access_tokens.expires_at',
  ]
  for (const c of required) ok(found.includes(c), `kolonne findes: ${c}`)

  // 3) Ny PDF-rute deployet (poll til 400 paa manglende params; 404 = gammelt deploy)
  const routeUrl = `${appUrl}/api/portal/invoices/pdf`
  let routeStatus = 0
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(routeUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
      routeStatus = res.status
    } catch (e) { console.log(`   (forsoeg ${attempt} fetch-fejl: ${e.message})`) }
    if (routeStatus === 400) break
    console.log(`   forsoeg ${attempt}: rute-status ${routeStatus} (afventer deploy af nyt kode)…`)
    if (attempt < 10) await sleep(15000)
  }
  ok(routeStatus === 400, `/api/portal/invoices/pdf deployet (400 paa manglende params, faktisk ${routeStatus})`)

  console.log(`\n=== ${fails === 0 ? 'ALT GROENT' : fails + ' FEJL'} ===`)
  process.exit(fails === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
