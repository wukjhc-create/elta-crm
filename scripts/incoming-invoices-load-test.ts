/** Leverandoerfaktura-listen siger naar hentningen fejler. Tom tekst og tilladelse bliver. Koer: npx tsx scripts/incoming-invoices-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const listStart = action.indexOf('export async function listIncomingInvoicesAction')
const listEnd = action.indexOf('export interface IncomingInvoiceDetail')
const list = action.slice(listStart, listEnd)
eq('query siger fejl', list.includes("return { rows: [], error: 'Kunne ikke hente fakturaer' }"), true)
eq('manglende tilladelse bliver tom', list.includes("if (!hasPermission('incoming_invoices.view')) return { rows: [], error: null }"), true)
eq('statusfiltre bliver', list.includes("case 'needs_review':") && list.includes("case 'not_invoice':") && list.includes("case 'missing_file':"), true)
eq('succes returnerer raekker', list.includes('return { rows: visible, error: null, senders_failed: !flagged.ok }'), true)

const countsStart = action.indexOf('export async function getApprovalQueueCountsAction')
const countsEnd = action.indexOf('export async function getInitialApprovalQueue')
const counts = action.slice(countsStart, countsEnd)
eq('taelling kaster', counts.includes("throw new Error('Kunne ikke tælle fakturaer')"), true)
eq('taelling uden tilladelse bliver nul', counts.includes('missing_file: 0'), true)
eq('taelling bruger fejlen foer nul', counts.indexOf('if (aw.error || nr.error || ap.error || rj.error || pst.error || mf.error)') < counts.indexOf('awaiting_approval: aw.count ?? 0'), true)

const page = fs.readFileSync('src/app/dashboard/incoming-invoices/page.tsx', 'utf8')
eq('siden giver fejl videre', page.includes('initialListError={listError}') && page.includes('initialCountsError={countsError}'), true)
eq('siden sluger ikke listen', page.includes("listError = 'Kunne ikke hente fakturaer'"), true)
eq('siden sluger ikke taellingen', page.includes("countsError = 'Kunne ikke tælle fakturaer'"), true)
eq('raekkeloggen bliver', page.includes("rows=' + rows.length"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
eq('listen siger fejl', view.includes('data-testid="incoming-invoices-load-error"') && view.includes('Det tælles ikke som ingen fakturaer.'), true)
eq('taellingen siger fejl', view.includes('data-testid="incoming-invoices-counts-error"') && view.includes('Det tælles ikke som 0.'), true)
eq('fejl skjuler den tomme tekst', view.split('!busy && !listError && displayRows.length === 0').length === 3, true)
eq('fejl nulstiller ikke listen', view.includes('setRows(next.rows)') && !view.includes('setRows(next)'), true)
eq('tom kategori bliver', view.includes('Ingen fakturaer i denne kategori.'), true)
eq('tom forfald bliver', view.includes('Ingen godkendte fakturaer med dette forfald.'), true)
eq('fejl skjuler nul-badge', view.includes('if (failed || k === \'all\' || k === \'not_invoice\') return null'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoices-load-test OK')
process.exitCode = fail ? 1 : 0
