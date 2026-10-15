/** Ikke-en-faktura siger naar afsenderopslaget fejler. Reglen og statusfiltrene bliver. Koer: npx tsx scripts/incoming-invoice-sender-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
eq('afsenderfejl stoppes', action.includes('if (error) return { ok: false, mark: () => false }'), true)
eq('kategorien siger fejl', action.includes("if (!flagged.ok && filter.status === 'not_invoice') return { rows: [], error: 'Kunne ikke hente afsendere' }"), true)
eq('fakturafejl bliver', action.includes("return { rows: [], error: 'Kunne ikke hente fakturaer' }"), true)
eq('tilladelse bliver', action.includes("if (!hasPermission('incoming_invoices.view')) return { rows: [], error: null }"), true)
eq('statusfiltre bliver', action.includes("case 'not_invoice':") && action.includes("case 'needs_review':") && action.includes("case 'posted':"), true)
eq('succes bliver', action.includes('return { rows: visible, error: null }'), true)

const rule = fs.readFileSync('src/lib/invoice-control/sender-domain.ts', 'utf8')
eq('reglen bliver', rule.includes('return isFreeMailAddress(i.senderEmail) && !i.supplierId && i.amountInclVat == null'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-sender-test OK')
process.exitCode = fail ? 1 : 0
