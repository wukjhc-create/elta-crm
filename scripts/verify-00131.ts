/**
 * Verificer 00131: offers + offer_line_items + offer_signatures lockdown.
 *
 * Indeholder smoke-tests for alle portal-paths via admin-client + en
 * NO-OP simulation af acceptOffer/rejectOffer-UPDATE der IKKE rammer
 * prod-data (bruger en bevidst forkert customer_id).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]; let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const accessToken = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function mgmt(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error(res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  console.log('\n=== VERIFY 00131 — offers + line_items + signatures lockdown ===\n')

  // ---- 1. Anon-policies skal vaere vaek paa alle 3 tabeller ----
  const droppedPolicies = [
    ['offers', 'Anon can view sent/viewed/accepted/rejected offers'],
    ['offers', 'Anon can update sent/viewed offers'],
    ['offer_line_items', 'Anon can view offer line items'],
    ['offer_signatures', 'Anon can view offer signatures'],
    ['offer_signatures', 'Anyone can create signatures'],
  ]

  let allDropped = true
  for (const [tbl, name] of droppedPolicies) {
    const rows = await mgmt(`SELECT 1 FROM pg_policies WHERE tablename = '${tbl}' AND policyname = '${name.replace(/'/g, "''")}';`)
    if (rows && rows.length === 0) {
      console.log(`  ✅ ${tbl} :: "${name}"`)
    } else {
      console.log(`  ❌ ${tbl} :: "${name}" STADIG AKTIV`)
      allDropped = false
    }
  }
  console.log(`1. Alle 5 anon-policies droppet: ${allDropped ? '✅' : '❌'}`)

  // ---- 2. Alle anon-grants skal vaere vaek paa alle 3 tabeller ----
  console.log('\n2. Anon-grants pr. tabel:')
  for (const tbl of ['offers', 'offer_line_items', 'offer_signatures']) {
    const grants = await mgmt(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = '${tbl}' AND grantee = 'anon';`)
    if (grants && grants.length === 0) {
      console.log(`  ✅ ${tbl}: ingen anon-grants`)
    } else {
      console.log(`  ❌ ${tbl}: ${grants?.map((g: any) => g.privilege_type).join(', ')}`)
    }
  }

  // ---- 3. Resterende policies pr. tabel ----
  console.log('\n3. Resterende policies (skal vaere authenticated + service_role):')
  for (const tbl of ['offers', 'offer_line_items', 'offer_signatures']) {
    const pols = await mgmt(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE tablename = '${tbl}' ORDER BY policyname;`)
    console.log(`  ▸ ${tbl}:`)
    for (const p of (pols ?? [])) {
      console.log(`    - ${p.policyname} (cmd=${p.cmd}, roles=${p.roles})`)
    }
  }

  // ---- 4. Smoke-test: hent et eksisterende sent/viewed offer ----
  const { data: testOffer, error: testErr } = await admin
    .from('offers')
    .select('id, customer_id, offer_number, status, final_amount')
    .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
    .limit(1)
    .maybeSingle()

  if (testErr || !testOffer) {
    console.log('\n4. Smoke-test: ingen offers fundet — skipper smoke-tests')
    return
  }

  console.log(`\n4. Smoke-tests mod test-offer: ${testOffer.offer_number} (status=${testOffer.status})`)

  // 4a. SELECT offer via admin med customer_id-scope (mirror af getPortalOffer)
  const { data: offer1 } = await admin
    .from('offers')
    .select('*')
    .eq('id', testOffer.id)
    .eq('customer_id', testOffer.customer_id)
    .maybeSingle()
  console.log(`  ✅ getPortalOffer SELECT: ${offer1 ? 'OK' : 'FEJL'}`)

  // 4b. SELECT line_items
  const { data: items, error: itemsErr } = await admin
    .from('offer_line_items')
    .select('*')
    .eq('offer_id', testOffer.id)
  console.log(`  ${itemsErr ? '❌' : '✅'} offer_line_items SELECT: ${items?.length ?? 0} rows`)

  // 4c. SELECT signatures
  const { data: sigs, error: sigsErr } = await admin
    .from('offer_signatures')
    .select('*')
    .eq('offer_id', testOffer.id)
  console.log(`  ${sigsErr ? '❌' : '✅'} offer_signatures SELECT: ${sigs?.length ?? 0} rows`)

  // 4d. getPortalOffers (multi-fetch pattern)
  const { data: bulk } = await admin
    .from('offers')
    .select('*')
    .eq('customer_id', testOffer.customer_id)
    .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
    .limit(10)
  console.log(`  ✅ getPortalOffers bulk SELECT: ${bulk?.length ?? 0} offers for kunde ${testOffer.customer_id}`)

  // 4e. PDF-route smoke: hent offer + customer + company_settings via samme path
  const { data: pdfOffer, error: pdfErr } = await admin
    .from('offers')
    .select(`
      id, offer_number, total_amount,
      line_items:offer_line_items(id, description),
      customer:customers!offers_customer_id_fkey(id, company_name)
    `)
    .eq('id', testOffer.id)
    .eq('customer_id', testOffer.customer_id)
    .single()
  console.log(`  ${pdfErr ? '❌' : '✅'} PDF-route SELECT (embedded line_items + customer): ${pdfOffer ? 'OK' : 'FEJL'}`)

  // 4f. view-offer redirect: find aktiv token for kunden
  const { data: tok } = await admin
    .from('portal_access_tokens')
    .select('token')
    .eq('customer_id', testOffer.customer_id)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  console.log(`  ${tok?.token ? '✅' : '⚠️'} /view-offer redirect: ${tok?.token ? 'token fundet' : 'ingen aktiv token for kunden (forventet for nogle kunder)'}`)

  // ---- 5. NO-OP simulation af acceptOffer/rejectOffer ----
  // Forkert customer_id sikrer at INGEN row matcher .eq()-filter, saa
  // UPDATE er en no-op. Vi tjekker bare at admin-client kan kalde
  // .update() uden RLS-fejl.
  const fakeCustomerId = '00000000-0000-0000-0000-000000000000'

  const { error: acceptErr } = await admin
    .from('offers')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', testOffer.id)
    .eq('customer_id', fakeCustomerId)
  console.log(`\n5a. acceptOffer NO-OP UPDATE (fake customer_id): ${acceptErr ? '❌ ' + acceptErr.message : '✅ ingen RLS-fejl, ingen rows ramt'}`)

  const { error: rejectErr } = await admin
    .from('offers')
    .update({ status: 'rejected', rejected_at: new Date().toISOString() })
    .eq('id', testOffer.id)
    .eq('customer_id', fakeCustomerId)
  console.log(`5b. rejectOffer NO-OP UPDATE (fake customer_id): ${rejectErr ? '❌ ' + rejectErr.message : '✅ ingen RLS-fejl, ingen rows ramt'}`)

  // Bekraeft test-offer er uaendret
  const { data: stillSame } = await admin
    .from('offers')
    .select('id, status, accepted_at, rejected_at')
    .eq('id', testOffer.id)
    .maybeSingle()
  const unchanged = stillSame?.status === testOffer.status
  console.log(`5c. Test-offer status uaendret: ${unchanged ? '✅' : '❌'} (was ${testOffer.status}, now ${stillSame?.status})`)

  // ---- 6. NO-OP simulation af signature INSERT ----
  // Vi forsoeger IKKE en faktisk INSERT — admin kan altid INSERTE. I stedet
  // bekraefter vi at admin har INSERT-privilegium via grants-query.
  const adminInsertGrant = await mgmt(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = 'offer_signatures' AND grantee = 'service_role' AND privilege_type = 'INSERT';`)
  console.log(`\n6. service_role INSERT-grant paa offer_signatures: ${adminInsertGrant && adminInsertGrant.length > 0 ? '✅' : '❌'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
