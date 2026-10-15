/** Banklisten siger naar hentningen fejler. Tom tekst og match-soegning bliver. Koer: npx tsx scripts/bank-tx-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/bank-payments.ts', 'utf8')
const start = action.indexOf('export async function listUnmatchedBankTransactions')
const end = action.indexOf('export async function importBankCsvAction')
const body = action.slice(start, end)
eq('query siger fejl', body.includes("return { rows: [], error: 'Kunne ikke hente banktransaktioner' }"), true)
eq('succes returnerer raekker', body.includes('return { rows: (data ?? []) as BankTxListRow[], error: null }'), true)
eq('soegning er uroert', action.includes('export async function searchInvoicesForMatchAction'), true)
const search = action.slice(action.indexOf('export async function searchInvoicesForMatchAction'))
eq('soegning ignorerer stadig fejlen', search.includes('const { data } = await req'), true)

const page = fs.readFileSync('src/app/dashboard/bank/page.tsx', 'utf8')
eq('siden giver fejl videre', page.includes('initialError={result.error}'), true)
eq('siden viser ikke fejlraekker', page.includes('result.error ? [] : result.rows'), true)

const view = fs.readFileSync('src/app/dashboard/bank/bank-client.tsx', 'utf8')
eq('listen siger fejl', view.includes('data-testid="bank-tx-load-error"') && view.includes('Det tælles ikke som ingen transaktioner.'), true)
eq('fejl skjuler den tomme tekst', view.includes('!loadError && rows.length === 0'), true)
eq('fejl nulstiller ikke listen', view.includes('setRows(next.rows)') && !view.includes('setRows(next);'), true)
eq('tom tekst bliver', view.includes('Ingen umatchede transaktioner.'), true)
eq('naeste skridt bliver', view.includes('Importér en CSV, når banken har sendt nye linjer.'), true)
eq('tom soegning bliver', view.includes('Ingen ubetalte fakturaer at matche.'), true)

console.log(fail ? `\n${fail} fejl` : '\nbank-tx-load-test OK')
process.exitCode = fail ? 1 : 0
