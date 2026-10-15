/** Kundelisten siger naar mail-oprettede ikke kan taelles. Filteret bliver. Koer: npx tsx scripts/customer-origin-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customers.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function countAutoCreatedCustomersAction'), action.indexOf('export async function getCustomers'))
eq('fejl er null', fn.includes('if (error) return null'), true)
eq('aekte nul', fn.includes('return count ?? 0'), true)
eq('fejl foer nul', fn.indexOf('if (error) return null') < fn.indexOf('return count ?? 0'), true)
eq('uden tilladelse er 0', fn.includes("if (!hasPermission('customers.view')) return 0"), true)
eq('filter bliver', fn.includes('tags.cs.{auto-email},email.ilike.%@elta-crm.local') || action.includes('tags.cs.{auto-email},email.ilike.%@elta-crm.local'), true)

const view = fs.readFileSync('src/components/modules/customers/customers-page-client.tsx', 'utf8')
eq('fejltekst', view.includes('Oprettet fra mail kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('tal bliver', view.includes('Oprettet fra mail (${autoCreatedCount})'), true)
eq('knap bliver', view.includes('data-testid="customers-origin-auto"'), true)
eq('filterskift bliver', view.includes("origin: filters.origin === 'auto' ? undefined : 'auto'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-origin-count-test OK')
process.exitCode = fail ? 1 : 0
