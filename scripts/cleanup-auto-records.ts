/**
 * Cleanup-script: sletter auto-oprettede records (auto-cases, auto-drafts,
 * auto-tasks, auto-notes). Customers beholdes altid.
 *
 * Sikkerhed:
 *   - DRY-RUN er default. Ingen sletning sker.
 *   - Pass --confirm for at slette rigtigt.
 *   - Bruger SERVICE_ROLE_KEY for at omgå RLS.
 *
 * FK-cascade-adfaerd (verificeret i migrations):
 *   - offer_line_items.offer_id  ON DELETE CASCADE  (00005)
 *   - offer_activities.offer_id  ON DELETE CASCADE  (00012)
 *   - portal_messages.offer_id   ON DELETE SET NULL (00009)
 *   - case_notes.case_id         ON DELETE CASCADE  (00073)
 *
 * Defensive: NULL'er incoming_emails.service_case_id foer service_cases
 * slettes (kolonnen er ikke garanteret FK-bundet i alle migrations).
 *
 * Koer:
 *   npx tsx scripts/cleanup-auto-records.ts            # dry-run
 *   npx tsx scripts/cleanup-auto-records.ts --confirm  # slet rigtigt
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
    // ignore
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
const CONFIRM = process.argv.includes('--confirm')
const MODE = CONFIRM ? 'CONFIRM (DELETE)' : 'DRY-RUN'

async function countRows(
  table: string,
  filter: (q: any) => any
): Promise<number> {
  const q = filter(supabase.from(table).select('id', { count: 'exact', head: true }))
  const { count, error } = await q
  if (error) {
    console.error(`  count failed on ${table}:`, error.message)
    return -1
  }
  return count ?? 0
}

async function fetchIds(table: string, filter: (q: any) => any): Promise<string[]> {
  const q = filter(supabase.from(table).select('id'))
  const { data, error } = await q
  if (error) {
    console.error(`  fetchIds failed on ${table}:`, error.message)
    return []
  }
  return (data ?? []).map((r: any) => r.id as string)
}

async function showSample(label: string, table: string, filter: (q: any) => any, limit = 5) {
  const q = filter(supabase.from(table).select('*')).limit(limit)
  const { data, error } = await q
  if (error) {
    console.error(`  sample failed on ${table}:`, error.message)
    return
  }
  console.log(`  Sample ${label} (max ${limit}):`)
  for (const row of data ?? []) {
    const summary = {
      id: row.id,
      ...(row.case_number ? { case_number: row.case_number } : {}),
      ...(row.offer_number ? { offer_number: row.offer_number } : {}),
      ...(row.title ? { title: row.title } : {}),
      ...(row.final_amount !== undefined ? { final_amount: row.final_amount } : {}),
      ...(row.description ? { description: String(row.description).slice(0, 60) } : {}),
      ...(row.kind ? { kind: row.kind } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.status ? { status: row.status } : {}),
      created_at: row.created_at,
    }
    console.log('    ', JSON.stringify(summary))
  }
}

async function main() {
  console.log(`\n=== AUTO-RECORD CLEANUP — ${MODE} ===\n`)

  // ---------- STEP 1: count what we plan to touch ----------
  console.log('Counts BEFORE:')
  const autoCases = await fetchIds('service_cases', (q) =>
    q.or('source.eq.email,source_email_id.not.is.null')
  )
  const autoOffers = await fetchIds('offers', (q) =>
    q.eq('status', 'draft').not('source_email_id', 'is', null)
  )
  const autoTaskCount = await countRows('customer_tasks', (q) =>
    q.ilike('description', 'Auto-genereret fra sag %')
  )
  const aiNoteCount = await countRows('case_notes', (q) => q.eq('kind', 'ai_summary'))

  console.log(`  service_cases (auto):   ${autoCases.length}`)
  console.log(`  offers (auto drafts):   ${autoOffers.length}`)
  console.log(`  customer_tasks (auto):  ${autoTaskCount}`)
  console.log(`  case_notes (ai_summary):${aiNoteCount}  (vil cascade'es ned med service_cases)`)

  if (autoCases.length === 0 && autoOffers.length === 0 && autoTaskCount === 0) {
    console.log('\nIntet at rydde op. Afslutter.')
    return
  }

  // ---------- STEP 2: sample some records ----------
  console.log('\nSamples (verificer at det er det, der skal slettes):')
  await showSample('auto service_cases', 'service_cases', (q) =>
    q.or('source.eq.email,source_email_id.not.is.null').order('created_at', { ascending: false })
  )
  await showSample('auto offers', 'offers', (q) =>
    q.eq('status', 'draft').not('source_email_id', 'is', null).order('created_at', { ascending: false })
  )
  await showSample('auto customer_tasks', 'customer_tasks', (q) =>
    q.ilike('description', 'Auto-genereret fra sag %').order('created_at', { ascending: false })
  )

  // ---------- STEP 3: dry-run or delete ----------
  if (!CONFIRM) {
    console.log('\n--- DRY-RUN ---')
    console.log('Ingen records er blevet slettet.')
    console.log('Koer med --confirm for at slette rigtigt:')
    console.log('  npx tsx scripts/cleanup-auto-records.ts --confirm')
    return
  }

  console.log('\n--- CONFIRM MODE: DELETING ---\n')

  // 3a. NULL incoming_emails.service_case_id paa auto-cases (defensiv —
  //     kolonnen har maaske ikke ON DELETE-action).
  if (autoCases.length > 0) {
    const { error: unlinkErr } = await supabase
      .from('incoming_emails')
      .update({ service_case_id: null })
      .in('service_case_id', autoCases)
    if (unlinkErr) {
      console.error('Step 3a (NULL incoming_emails.service_case_id) FAILED:', unlinkErr.message)
      process.exit(1)
    }
    console.log(`Step 3a: NULL'ed incoming_emails.service_case_id for ${autoCases.length} cases`)
  }

  // 3b. Delete customer_tasks (auto)
  const { error: taskErr, count: taskDeleted } = await supabase
    .from('customer_tasks')
    .delete({ count: 'exact' })
    .ilike('description', 'Auto-genereret fra sag %')
  if (taskErr) {
    console.error('Step 3b (delete customer_tasks) FAILED:', taskErr.message)
    process.exit(1)
  }
  console.log(`Step 3b: deleted ${taskDeleted ?? '?'} customer_tasks`)

  // 3c. Delete offers (cascade: offer_line_items + offer_activities)
  if (autoOffers.length > 0) {
    const { error: offerErr, count: offerDeleted } = await supabase
      .from('offers')
      .delete({ count: 'exact' })
      .in('id', autoOffers)
    if (offerErr) {
      console.error('Step 3c (delete offers) FAILED:', offerErr.message)
      process.exit(1)
    }
    console.log(`Step 3c: deleted ${offerDeleted ?? '?'} offers (line_items + activities cascade'd)`)
  }

  // 3d. Delete service_cases (cascade: case_notes)
  if (autoCases.length > 0) {
    const { error: caseErr, count: caseDeleted } = await supabase
      .from('service_cases')
      .delete({ count: 'exact' })
      .in('id', autoCases)
    if (caseErr) {
      console.error('Step 3d (delete service_cases) FAILED:', caseErr.message)
      process.exit(1)
    }
    console.log(`Step 3d: deleted ${caseDeleted ?? '?'} service_cases (case_notes cascade'd)`)
  }

  // ---------- STEP 4: verify ----------
  console.log('\nCounts AFTER:')
  const afterCases = await countRows('service_cases', (q) =>
    q.or('source.eq.email,source_email_id.not.is.null')
  )
  const afterOffers = await countRows('offers', (q) =>
    q.eq('status', 'draft').not('source_email_id', 'is', null)
  )
  const afterTasks = await countRows('customer_tasks', (q) =>
    q.ilike('description', 'Auto-genereret fra sag %')
  )
  const afterNotes = await countRows('case_notes', (q) => q.eq('kind', 'ai_summary'))
  console.log(`  service_cases (auto):   ${afterCases}`)
  console.log(`  offers (auto drafts):   ${afterOffers}`)
  console.log(`  customer_tasks (auto):  ${afterTasks}`)
  console.log(`  case_notes (ai_summary):${afterNotes}`)

  const allZero = afterCases === 0 && afterOffers === 0 && afterTasks === 0 && afterNotes === 0
  if (allZero) {
    console.log('\n✓ Cleanup komplet. Customers er bevaret.')
  } else {
    console.log('\n! Nogle records er stadig tilbage. Tjek output ovenfor.')
  }
}

main().catch((err) => {
  console.error('UNHANDLED ERROR:', err)
  process.exit(1)
})
