/** Listen siger naar afsenderopslaget fejler. Raekkerne bliver. Koer: npx tsx scripts/invoice-list-senders-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Afsendere kunne ikke hentes. Det tælles ikke som rigtige fakturaer.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function listIncomingInvoicesAction')
const end = action.indexOf('export interface IncomingInvoiceDetail')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('kategorien siger stadig fejl', fn.includes("if (!flagged.ok && filter.status === 'not_invoice') return { rows: [], error: 'Kunne ikke hente afsendere' }"), true)
eq('andre filtre beholder raekker', fn.includes('return { rows: visible, error: null, senders_failed: !flagged.ok }'), true)
eq('kategori-fejlen kommer foer succes', fn.indexOf("error: 'Kunne ikke hente afsendere'") < fn.indexOf('senders_failed: !flagged.ok'), true)
eq('fakturafejl bliver', fn.includes("return { rows: [], error: 'Kunne ikke hente fakturaer' }"), true)
eq('tilladelse bliver tom', fn.includes("if (!hasPermission('incoming_invoices.view')) return { rows: [], error: null }"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="incoming-invoices-senders-error"') && view.includes(msg), true)
eq('banner kun uden listefejl', view.includes('!listError && sendersFailed'), true)
eq('listen bliver', view.includes('setRows(next.rows)') && !view.includes('setRows([])'), true)
eq('listefejl bliver', view.includes('data-testid="incoming-invoices-load-error"'), true)
eq('tom kategori bliver', view.includes('Ingen fakturaer i denne kategori.'), true)

const page = fs.readFileSync('src/app/dashboard/incoming-invoices/page.tsx', 'utf8')
eq('siden giver flaget videre', page.includes('initialSendersFailed={sendersFailed}'), true)
eq('siden bevarer raekkerne', page.includes('rows = result.rows') && page.includes('sendersFailed = !!result.senders_failed'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-list-senders-test OK')
process.exitCode = fail ? 1 : 0
