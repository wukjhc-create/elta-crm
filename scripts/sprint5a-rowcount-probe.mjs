// One-off: row counts for tables relevant to Sprint 5A analysis.
// Read-only. Uses service role key from .env.local.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env')
  process.exit(1)
}

const TABLES = [
  // Catalog
  'product_catalog', 'product_categories',
  'supplier_products', 'suppliers',
  'materials',
  // Customer / case
  'customers', 'service_cases', 'work_orders', 'projects',
  // Time / cost
  'time_logs', 'time_entries', 'employees',
  'work_order_profit',
  // Outgoing invoices
  'invoices', 'invoice_lines',
  // Incoming
  'incoming_invoices', 'incoming_invoice_lines', 'incoming_invoice_audit_log',
  // Offer side
  'offers', 'offer_line_items',
  // Pricing
  'customer_supplier_prices', 'customer_product_prices',
  'supplier_margin_rules',
  // Attachments / docs
  'service_case_attachments', 'case_notes',
  // Misc that might exist
  'case_materials', 'case_other_costs', 'case_expenses',
]

const out = {}
for (const t of TABLES) {
  try {
    const r = await fetch(`${url}/rest/v1/${t}?select=*`, {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Range-Unit': 'items',
        Range: '0-0',
        Prefer: 'count=exact',
      },
    })
    const cr = r.headers.get('content-range') || ''
    const m = /\/(\d+|\*)$/.exec(cr)
    if (r.status === 404) {
      out[t] = { exists: false }
    } else if (r.status >= 400) {
      out[t] = { error: `HTTP ${r.status}` }
    } else {
      out[t] = { exists: true, count: m ? Number(m[1]) : null }
    }
  } catch (e) {
    out[t] = { error: e.message }
  }
}

const w = (name, val) => {
  const status = val.exists === false
    ? 'MISSING'
    : val.error
    ? `ERR: ${val.error}`
    : `${val.count} rows`
  console.log(`${name.padEnd(34)} ${status}`)
}
for (const t of TABLES) w(t, out[t])
