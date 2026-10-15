/** Kundelistens betalingstal siger naar en taelling fejler. Listen og et aekte 0 bliver. Koer: npx tsx scripts/customer-payment-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customers.ts', 'utf8')
const fn = action.slice(
  action.indexOf('export async function getCustomersWithPaymentState'),
  action.indexOf('export async function getCustomer(')
)
const counted = fn.slice(fn.indexOf('const counted'), fn.indexOf('const counts: PaymentCounts'))
eq('hjaelper findes', counted.length > 40, true)
eq('fejl er null', counted.includes('if (res.error)'), true)
eq('fejl returnerer null', counted.includes('return null'), true)
eq('aekte nul', counted.includes('return res.count ?? 0'), true)
eq('fejl foer nul', counted.indexOf('if (res.error)') < counted.indexOf('return res.count ?? 0'), true)
eq('ingen count eller 0', counted.includes('.count || 0'), false)
eq('listen fejler stadig', fn.includes("throw new Error('DATABASE_ERROR')"), true)
eq('listefejl foer tal', fn.indexOf('if (dataRes.error)') < fn.indexOf('const counted'), true)
eq('badges bliver', fn.includes('outstanding_total ?? 0'), true)
eq('tomt filter bliver', fn.includes("if (payment === 'overdue') out = out.gt('overdue_count', 0)"), true)

const types = fs.readFileSync('src/app/dashboard/customers/customer-payment-filter.ts', 'utf8')
eq('null i typen', types.includes('number | null'), true)
eq('tom tekst bliver', types.includes('Der er ingen kunder med forfaldne fakturaer.'), true)

const view = fs.readFileSync('src/components/modules/customers/customers-page-client.tsx', 'utf8')
eq('fejltekst', view.includes('Et betalingstal kunne ikke hentes. Det tælles ikke som 0.'), true)
eq('testid', view.includes('data-testid="customer-payment-counts-error"'), true)
eq('streg i stedet for nul', view.includes("c == null ? '—' : c"), true)
eq('filter bliver', view.includes('handlePaymentFilter(f.key)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-payment-count-test OK')
process.exitCode = fail ? 1 : 0
