/**
 * PRODUCTION read-only tal til reviewet af Grok batch 3: skema + omfang. Kun SELECT og kun antal, ingen personværdier ud.
 *   npx tsx scripts/prod-grok-features-3-readonly.ts
 */
import { withProdReadOnly } from './prod-readonly'

const OPEN = `is_proposal = false AND status NOT IN ('closed','converted','cancelled')`
const COUNTS: Array<[string, string]> = [
  ['case_materials i alt', `SELECT count(*) n FROM case_materials`],
  ['case_materials med kost 0', `SELECT count(*) n FROM case_materials WHERE unit_cost = 0`],
  ['  heraf fakturerbare', `SELECT count(*) n FROM case_materials WHERE unit_cost = 0 AND billable`],
  ['  heraf med salgspris > 0', `SELECT count(*) n FROM case_materials WHERE unit_cost = 0 AND unit_sales_price > 0`],
  ['  heraf uden faktura (åben økonomi)', `SELECT count(*) n FROM case_materials WHERE unit_cost = 0 AND invoice_line_id IS NULL`],
  ['case_materials med arbejdsordre', `SELECT count(*) n FROM case_materials WHERE work_order_id IS NOT NULL`],
  ['supplier_products i alt', `SELECT count(*) n FROM supplier_products`],
  ['supplier_products uden brugbar kost', `SELECT count(*) n FROM supplier_products WHERE cost_price IS NULL OR cost_price <= 0`],
  ['leverandørfakturaer i alt', `SELECT count(*) n FROM incoming_invoices`],
  ['  uden tekst', `SELECT count(*) n FROM incoming_invoices WHERE raw_text IS NULL OR btrim(raw_text) = ''`],
  ['  mailens brødtekst som tekst', `SELECT count(*) n FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id
     WHERE i.source = 'email' AND btrim(i.raw_text) <> '' AND btrim(i.raw_text) IN (btrim(coalesce(e.body_text,'')), btrim(coalesce(e.body_preview,'')))`],
  ['  API-feed som tekst', `SELECT count(*) n FROM incoming_invoices WHERE source NOT IN ('email','upload') AND btrim(coalesce(raw_text,'')) <> ''`],
  ['  uploadet med tekst', `SELECT count(*) n FROM incoming_invoices WHERE source = 'upload' AND btrim(coalesce(raw_text,'')) <> ''`],
  ['  uden fakturadato', `SELECT count(*) n FROM incoming_invoices WHERE invoice_date IS NULL`],
  ['  uden linjer', `SELECT count(*) n FROM incoming_invoices i WHERE NOT EXISTS (SELECT 1 FROM incoming_invoice_lines l WHERE l.incoming_invoice_id = i.id)`],
  ['fakturaer med linjer med gemt vare', `SELECT count(DISTINCT incoming_invoice_id) n FROM incoming_invoice_lines WHERE supplier_product_id IS NOT NULL`],
  ['fakturaer med samme gemte vare på flere linjer', `SELECT count(DISTINCT incoming_invoice_id) n FROM (
     SELECT incoming_invoice_id FROM incoming_invoice_lines WHERE supplier_product_id IS NOT NULL AND quantity <> 0
     GROUP BY incoming_invoice_id, supplier_product_id, (quantity > 0 AND coalesce(total_price, 0) >= 0) HAVING count(*) > 1) d`],
  ['  heraf helt ens antal og beløb', `SELECT count(DISTINCT incoming_invoice_id) n FROM (
     SELECT incoming_invoice_id FROM incoming_invoice_lines WHERE supplier_product_id IS NOT NULL AND quantity <> 0
     GROUP BY incoming_invoice_id, supplier_product_id, quantity, total_price HAVING count(*) > 1) d`],
  ['åbne sager', `SELECT count(*) n FROM service_cases WHERE ${OPEN}`],
  ['åbne sager uden næste handling', `SELECT count(*) n FROM service_cases s WHERE ${OPEN.replace(/status/g, 's.status').replace('is_proposal', 's.is_proposal')}
     AND NOT EXISTS (SELECT 1 FROM customer_tasks t WHERE t.service_case_id = s.id AND t.status <> 'done')
     AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.status IN ('planned','in_progress'))`],
  ['  heraf med åben kundeopgave uden sag', `SELECT count(*) n FROM service_cases s WHERE ${OPEN.replace(/status/g, 's.status').replace('is_proposal', 's.is_proposal')}
     AND NOT EXISTS (SELECT 1 FROM customer_tasks t WHERE t.service_case_id = s.id AND t.status <> 'done')
     AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.status IN ('planned','in_progress'))
     AND EXISTS (SELECT 1 FROM customer_tasks t WHERE t.customer_id = s.customer_id AND t.service_case_id IS NULL AND t.status <> 'done')`],
  ['åbne sager med flere åbne arbejdsordrer', `SELECT count(*) n FROM (SELECT case_id FROM work_orders WHERE status IN ('planned','in_progress') AND case_id IS NOT NULL GROUP BY case_id HAVING count(*) > 1) d`],
  ['forfaldne opgaver (nu)', `SELECT count(*) n FROM customer_tasks WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < now()`],
  ['forfaldne opgaver (Groks: før i dag)', `SELECT count(*) n FROM customer_tasks WHERE status <> 'done' AND due_date < ((now() AT TIME ZONE 'Europe/Copenhagen')::date::timestamp AT TIME ZONE 'Europe/Copenhagen')`],
]
const VALUES: Array<[string, string]> = [
  ['customer_tasks.status', `SELECT status v, count(*) n FROM customer_tasks GROUP BY 1 ORDER BY 1`],
  ['work_orders.status', `SELECT status v, count(*) n FROM work_orders GROUP BY 1 ORDER BY 1`],
  ['service_cases.status', `SELECT status v, count(*) n FROM service_cases GROUP BY 1 ORDER BY 1`],
  ['incoming_invoices.source', `SELECT source v, count(*) n FROM incoming_invoices GROUP BY 1 ORDER BY 1`],
]
const COLUMNS: Array<[string, string[]]> = [
  ['case_materials', ['case_id', 'work_order_id', 'supplier_product_id', 'unit_cost', 'unit_sales_price', 'total_cost', 'billable', 'invoice_line_id']],
  ['customer_tasks', ['service_case_id', 'customer_id', 'status', 'due_date', 'assigned_to', 'created_by']],
  ['work_orders', ['case_id', 'status', 'scheduled_date']],
  ['service_cases', ['case_number', 'title', 'status', 'is_proposal', 'customer_id']],
  ['incoming_invoices', ['raw_text', 'source', 'source_email_id', 'requires_manual_review', 'invoice_number', 'supplier_name_extracted']],
  ['incoming_emails', ['body_text', 'body_preview']],
  ['suppliers', ['name', 'is_active']],
  ['supplier_products', ['cost_price', 'margin_percentage', 'supplier_sku', 'supplier_name', 'unit']],
]

withProdReadOnly('prod-grok-features-3-readonly', async (run) => {
  for (const [table, want] of COLUMNS) {
    const rows = await run(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}'`)
    const have = new Set(rows.map((r) => r.column_name as string))
    const missing = want.filter((c) => !have.has(c))
    console.log(`${missing.length ? 'FAIL' : 'OK  '} skema ${table}${missing.length ? ` mangler ${missing.join(',')}` : ''}`)
  }
  const col = await run(`SELECT is_nullable, column_default, is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name='case_materials' AND column_name='unit_cost'`)
  console.log(`unit_cost nullable=${col[0]?.is_nullable} default=${col[0]?.column_default}`)
  const gen = await run(`SELECT is_generated, generation_expression FROM information_schema.columns WHERE table_schema='public' AND table_name='case_materials' AND column_name='total_cost'`)
  console.log(`total_cost generated=${gen[0]?.is_generated} expr=${gen[0]?.generation_expression}`)
  for (const [label, sql] of COUNTS) console.log(`${label}: ${(await run(sql))[0]?.n}`)
  for (const [label, sql] of VALUES) console.log(`${label}: ${(await run(sql)).map((r) => `${r.v}=${r.n}`).join(' ')}`)
}).catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
