/** PRODUCTION read-only: forhåndstjek/efterkontrol for 00221 (L-10).  npx tsx scripts/prod-check-00221.ts */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00221', async (run) => {
  const idx = (await run(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_incoming_invoices_supplier_number'`)) as Array<{ indexdef: string }>
  console.log(`indeks: ${idx[0]?.indexdef.includes('rejected') ? 'NY (udelader rejected/cancelled)' : idx[0] ? 'GAMMEL (00094)' : 'MANGLER'}`)
  const st = (await run(`SELECT status, count(*)::int n FROM incoming_invoices GROUP BY status ORDER BY status`)) as Array<{ status: string; n: number }>
  console.log(`fakturaer pr. status: ${st.map((r) => `${r.status}=${r.n}`).join(' ')}`)
  const pairs = (await run(`SELECT count(*)::int n FROM incoming_invoices a JOIN incoming_invoices b ON a.supplier_id = b.supplier_id AND a.invoice_number = b.invoice_number AND a.id <> b.id WHERE a.status = 'rejected'`)) as Array<{ n: number }>
  console.log(`(leverandør, nr.)-par delt af en afvist og en anden række: ${pairs[0]?.n ?? 0}`)
  const dupOfRejected = (await run(`SELECT count(*)::int n FROM incoming_invoices d JOIN incoming_invoices o ON o.id = d.duplicate_of_id WHERE d.status = 'cancelled' AND o.status = 'rejected'`)) as Array<{ n: number }>
  console.log(`annullerede "dubletter" af en afvist faktura (L-10-tilfælde): ${dupOfRejected[0]?.n ?? 0}`)
  const ck = (await run(`SELECT count(*)::int n, md5(string_agg(id::text || '|' || status || '|' || coalesce(invoice_number,'') || '|' || coalesce(supplier_id::text,'') || '|' || coalesce(amount_incl_vat::text,''), ',' ORDER BY id)) h FROM incoming_invoices`)) as Array<{ n: number; h: string }>
  console.log(`checksum incoming_invoices: n=${ck[0]?.n} md5=${ck[0]?.h}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
