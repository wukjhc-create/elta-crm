/**
 * Read-only audit af auto-oprettede records.
 * Ingen ændringer i databasen. Bruger SERVICE_ROLE_KEY for at omgå RLS.
 *
 * Kør: npx tsx scripts/audit-auto-records.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Minimal .env.local loader — undgår dotenv-afhængighed
function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // ignore — fall through to process.env
  }
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

async function countWhere(
  table: string,
  filter: (q: ReturnType<typeof supabase.from>) => unknown
): Promise<number | string> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  q = filter(q) as typeof q
  const { count, error } = await q
  if (error) return `ERROR: ${error.message}`
  return count ?? 0
}

async function main() {
  const out: Record<string, unknown> = {}

  // 1. service_cases auto/email
  out.cases_with_source_email_id = await countWhere('service_cases', (q: any) =>
    q.not('source_email_id', 'is', null)
  )
  out.cases_source_email = await countWhere('service_cases', (q: any) =>
    q.eq('source', 'email')
  )
  out.cases_email_last_7d = await countWhere('service_cases', (q: any) =>
    q.eq('source', 'email').gte('created_at', SEVEN_DAYS_AGO)
  )

  // 2. offers auto
  out.offers_with_source_email_id = await countWhere('offers', (q: any) =>
    q.not('source_email_id', 'is', null)
  )
  out.offers_auto_draft = await countWhere('offers', (q: any) =>
    q.eq('status', 'draft').not('source_email_id', 'is', null)
  )
  out.offers_auto_last_7d = await countWhere('offers', (q: any) =>
    q.not('source_email_id', 'is', null).gte('created_at', SEVEN_DAYS_AGO)
  )

  // 3. drafts with 0 kr
  out.offers_draft_zero_final = await countWhere('offers', (q: any) =>
    q.eq('status', 'draft').eq('final_amount', 0).not('source_email_id', 'is', null)
  )
  out.offers_draft_zero_total = await countWhere('offers', (q: any) =>
    q.eq('status', 'draft').eq('total_amount', 0).not('source_email_id', 'is', null)
  )

  // 4. recurring amount values among auto drafts
  const { data: amounts, error: amtErr } = await supabase
    .from('offers')
    .select('final_amount, total_amount')
    .not('source_email_id', 'is', null)
    .limit(5000)
  let topAmounts: Array<[string, number]> = []
  let amt783 = 0
  if (!amtErr && amounts) {
    const buckets = new Map<string, number>()
    for (const row of amounts) {
      const v = Number(row.final_amount ?? 0)
      const key = v.toFixed(2)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
      if (Math.abs(v - 783) < 0.01) amt783++
    }
    topAmounts = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }
  out.offers_amount_top10 = topAmounts
  out.offers_final_amount_783 = amt783

  // 5. customer_tasks auto-genereret
  out.tasks_auto_from_case = await countWhere('customer_tasks', (q: any) =>
    q.ilike('description', 'Auto-genereret fra sag %')
  )
  out.tasks_auto_last_7d = await countWhere('customer_tasks', (q: any) =>
    q.ilike('description', 'Auto-genereret fra sag %').gte('created_at', SEVEN_DAYS_AGO)
  )

  // 6. case_notes ai_summary
  out.notes_ai_summary = await countWhere('case_notes', (q: any) =>
    q.eq('kind', 'ai_summary')
  )

  // 7. orphan check — auto-records pointing at customer_id null or missing
  out.cases_with_null_customer = await countWhere('service_cases', (q: any) =>
    q.is('customer_id', null)
  )
  out.offers_with_null_customer = await countWhere('offers', (q: any) =>
    q.eq('status', 'draft').is('customer_id', null)
  )

  // 8. dubletter: same source_email_id giving multiple cases (should be 0 — UNIQUE idx)
  const { data: dupCases } = await supabase
    .from('service_cases')
    .select('source_email_id')
    .not('source_email_id', 'is', null)
    .limit(10000)
  const counts = new Map<string, number>()
  for (const r of dupCases ?? []) {
    const k = r.source_email_id as string
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  out.duplicate_source_email_id_in_cases = [...counts.entries()].filter(([, c]) => c > 1).length

  // 9. how many auto-cases lack tasks / notes (indicates partial creation)
  const { data: caseIds } = await supabase
    .from('service_cases')
    .select('id, customer_id, created_at, title, status')
    .eq('source', 'email')
    .order('created_at', { ascending: false })
    .limit(20)
  out.recent_auto_cases_sample = caseIds

  // Recent offers sample with amounts
  const { data: offerSample } = await supabase
    .from('offers')
    .select('id, offer_number, title, status, final_amount, total_amount, customer_id, created_at')
    .not('source_email_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)
  out.recent_auto_offers_sample = offerSample

  console.log(JSON.stringify(out, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
