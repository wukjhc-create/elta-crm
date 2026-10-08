/** PRODUCTION read-only: R0 post-check — de 4 sagers kontraktsum efter 00193. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const EXPECTED: Record<string, number> = { 'SVC-01002': 0, 'SVC-01003': 105.07, 'SVC-01019': 1771.2, 'SVC-01228': 5000 }
withProdReadOnly('prod-r0-postcheck', async (run) => {
  const rows = await run(`SELECT case_number, contract_sum::float AS k, updated_at::date::text AS opd FROM service_cases WHERE case_number = ANY(ARRAY['SVC-01002','SVC-01003','SVC-01019','SVC-01228']) ORDER BY case_number`)
  let bad = 0
  for (const r of rows) {
    const ok = Math.abs(Number(r.k) - EXPECTED[r.case_number]) < 0.005
    if (!ok) bad++
    console.log(`${ok ? 'OK ' : 'AFV'} ${r.case_number}: kontraktsum ${r.k} (forventet ${EXPECTED[r.case_number]}) · opdateret ${r.opd}`)
  }
  const [s] = await run(`SELECT count(*)::int n FROM service_cases s JOIN offers o ON o.converted_case_id = s.id WHERE s.contract_sum = o.final_amount AND coalesce(o.tax_amount, 0) > 0`)
  console.log(`sager der stadig har kontraktsum = tilbud inkl. moms: ${s.n}`)
  console.log(bad || rows.length !== 4 || s.n !== 0 ? '❌ afvigelse' : '✅ R0 som forventet')
  process.exitCode = bad || rows.length !== 4 || s.n !== 0 ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
