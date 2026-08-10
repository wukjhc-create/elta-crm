/**
 * Read-only prod-health for Ø9.7 DB-level pagination (migration 00151).
 * Bekræfter at de objekter den deployede kode afhænger af er intakte, og at
 * RPC'en kører mod det ÆGTE (uscopede) prod-datasæt. INGEN mutationer.
 */
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
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
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++ }

async function main() {
  console.log('\n=== PROD-HEALTH Ø9.7 (read-only) ===\n')

  // 1) Funktionen findes + er SECURITY INVOKER (prosecdef = false)
  const fn = await q(`SELECT proname, prosecdef FROM pg_proc WHERE proname = 'get_purchase_operations_page'`)
  ok(fn.ok && Array.isArray(fn.body) && fn.body.length === 1, 'get_purchase_operations_page findes (præcis 1)')
  ok(fn.ok && fn.body[0]?.prosecdef === false, 'funktionen er SECURITY INVOKER (prosecdef=false)')

  // 2) EXECUTE grant til authenticated
  const grant = await q(`SELECT has_function_privilege('authenticated', 'get_purchase_operations_page(date,boolean,text,text,text[],text,integer,integer,uuid[])', 'EXECUTE') AS can`)
  ok(grant.ok && grant.body[0]?.can === true, 'authenticated har EXECUTE')

  // 3) Scan-indekset findes
  const idx = await q(`SELECT indexname FROM pg_indexes WHERE indexname = 'idx_incoming_invoices_scan'`)
  ok(idx.ok && idx.body.length === 1, 'idx_incoming_invoices_scan findes')

  // 4) RPC kører uscopet mod ÆGTE datasæt + returnerer velformet payload
  const today = new Date().toISOString().slice(0, 10)
  const call = await q(`SELECT get_purchase_operations_page('${today}'::date, false, 'all', NULL, NULL, 'priority', 5, 0, NULL) AS r`)
  const payload = call.ok ? call.body[0]?.r : null
  ok(call.ok, `RPC eksekverer mod prod (status ${call.status})`)
  ok(payload && Array.isArray(payload.items), 'payload.items er array')
  ok(payload && typeof payload.total_count === 'number', `payload.total_count er number (=${payload?.total_count})`)
  ok(payload && payload.summary && typeof payload.summary.total_cases_with_action === 'number', 'payload.summary velformet')
  ok(payload && Array.isArray(payload.supplier_options), 'payload.supplier_options er array')
  ok(payload && payload.truncated === false, 'truncated = false (cap fjernet)')
  // beløb-gating: p_can_view_amounts=false → ingen beløb
  ok(payload && payload.summary && payload.summary.total_unconverted_amount === null, 'kost=off: summary-beløb = null')
  ok(payload && payload.items.every((it) => it.unconverted_amount === null), 'kost=off: item-beløb = null')

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GRØN — 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
