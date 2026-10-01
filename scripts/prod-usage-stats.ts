/**
 * PRODUCTION read-only: brug pr. forretningsflow (antal rækker i alt + oprettet seneste 30 dage).
 * Til GO-LIVE-prioritering. Kun aggregater — ingen rækkedata.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const TABLES = [
  'customers', 'leads', 'offers', 'offer_line_items', 'offer_signatures', 'portal_access_tokens', 'portal_messages',
  'service_cases', 'work_orders', 'time_logs', 'time_entries', 'employees', 'projects', 'project_tasks',
  'incoming_emails', 'email_threads', 'email_messages', 'invoices', 'incoming_invoices', 'incoming_invoice_lines',
  'customer_documents', 'calendar_events', 'case_materials', 'agent_runs', 'messages', 'calculations', 'kalkia_calculations',
]

withProdReadOnly('prod-usage-stats', async (run) => {
  const existing = new Set((await run(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(ARRAY[${TABLES.map((t) => `'${t}'`).join(',')}])`)).map((r) => String(r.table_name)))
  const withCreated = new Set((await run(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at' AND table_name = ANY(ARRAY[${[...existing].map((t) => `'${t}'`).join(',')}])`)).map((r) => String(r.table_name)))
  const parts = [...existing].map((t) => `'${t}', json_build_array((SELECT count(*) FROM public.${t}), ${withCreated.has(t) ? `(SELECT count(*) FROM public.${t} WHERE created_at > now() - interval '30 days')` : 'null'})`)
  const row = (await run(`SELECT json_build_object(${parts.join(', ')}) s`))[0]
  const s = row.s as Record<string, [number, number | null]>
  console.log('tabel                      i alt   30 d')
  for (const t of TABLES) {
    if (!existing.has(t)) { console.log(`${t.padEnd(26)} (findes ikke)`); continue }
    const [n, d] = s[t]
    console.log(`${t.padEnd(26)} ${String(n).padStart(6)} ${String(d ?? '-').padStart(6)}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
