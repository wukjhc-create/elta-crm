/**
 * Read-only prod-health for: kundekort opret-tilbud/sag + udvidet tilbudssoegning
 * + fjernet HTML-fane.
 *
 * Bekraefter:
 *  1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx).
 *  2) Den NYE tilbudssoegning kan koere mod prod-skemaet: kolonnerne
 *     customers.company_name, customers.customer_number og offers.customer_id
 *     findes, og selve kunde-forespoergslen (company_name/customer_number ILIKE)
 *     + customer_id.in-filteret eksekverer uden fejl.
 *
 * Aendringen er ren kode/UI og roerer INGEN DB-schema/migrationer. INGEN mutationer.
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
  const text = await r.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}

let fails = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK ' : 'XX '} ${msg}`); if (!cond) fails++ }

async function main() {
  console.log('\n=== PROD-HEALTH kundekort-tilbud/sag + soegning (read-only) ===\n')

  // 1) Prod-deployet er live
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Kolonner som den nye soegning afhaenger af findes
  const cols = await q(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_name = 'customers' AND column_name IN ('company_name','customer_number'))
       OR (table_name = 'offers' AND column_name IN ('customer_id','title','offer_number'))
    ORDER BY table_name, column_name`)
  const found = cols.ok && Array.isArray(cols.body) ? cols.body.map((r) => `${r.table_name}.${r.column_name}`) : []
  for (const c of ['customers.company_name', 'customers.customer_number', 'offers.customer_id', 'offers.offer_number', 'offers.title']) {
    ok(found.includes(c), `kolonne findes: ${c}`)
  }

  // 3) Den nye kunde-forespoergsel eksekverer (samme praedikat som koden bygger)
  const cust = await q(`SELECT id FROM customers WHERE company_name ILIKE '%a%' OR customer_number ILIKE '%a%' LIMIT 5`)
  ok(cust.ok, `kunde-soegning (company_name/customer_number ILIKE) eksekverer uden fejl (status ${cust.status})`)

  // 4) customer_id.in-filteret eksekverer mod offers
  const ids = cust.ok && Array.isArray(cust.body) ? cust.body.map((r) => `'${r.id}'`) : []
  if (ids.length > 0) {
    const off = await q(`SELECT count(*) AS n FROM offers WHERE customer_id IN (${ids.join(',')})`)
    ok(off.ok, `offers customer_id IN (...) eksekverer uden fejl (status ${off.status})`)
  } else {
    console.log('  i  ingen kunder matchede testtermen — springer offers IN-test over (ikke en gate)')
  }

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GROEN - 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
