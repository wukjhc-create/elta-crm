/** Revisionsloggen viser handlingen paa dansk. Koden i databasen bliver. Koer: npx tsx scripts/incoming-invoice-audit-label-test.ts */
import fs from 'fs'
import { incomingInvoiceAuditActionLabel } from '../src/lib/invoices/incoming-invoice-status'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

eq('indlaest', incomingInvoiceAuditActionLabel('ingested'), 'Indlæst')
eq('matchet', incomingInvoiceAuditActionLabel('matched'), 'Matchet')
eq('hoved', incomingInvoiceAuditActionLabel('header_edited'), 'Hoved rettet')
eq('bogfoert', incomingInvoiceAuditActionLabel('posted'), 'Bogført')
eq('fejl', incomingInvoiceAuditActionLabel('error'), 'Fejl')
eq('opgraderet', incomingInvoiceAuditActionLabel('upgraded_from_attachment'), 'Opgraderet fra bilag')
eq('fil', incomingInvoiceAuditActionLabel('file_attached'), 'Fil vedhæftet')
eq('dublet', incomingInvoiceAuditActionLabel('duplicate_detected'), 'Dublet fundet')
eq('laest', incomingInvoiceAuditActionLabel('parsed'), 'Læst')
eq('godkendt', incomingInvoiceAuditActionLabel('approved'), 'Godkendt')
eq('afvist', incomingInvoiceAuditActionLabel('rejected'), 'Afvist')
eq('ukendt kode bliver', incomingInvoiceAuditActionLabel('mystery_action'), 'mystery_action')

const detail = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const at = detail.indexOf('detail.audit.length === 0')
const slice = detail.slice(Math.max(0, at - 120), at + 1400)
eq('tom log siger naeste skridt', slice.includes('Ingen log-poster endnu. De vises her, når fakturaen ændres.'), true)
eq('panelet hedder revisionslog', slice.includes('Revisionslog (${detail.audit.length})'), true)
eq('visningen bruger koden', slice.includes('incomingInvoiceAuditActionLabel(a.action)'), true)
eq('tidspunktet bliver', slice.includes('a.created_at.slice(11, 19)'), true)
eq('beskeden ombrydes', slice.includes('text-gray-700 break-words">{a.message}'), true)
eq('raa handling vises ikke direkte', slice.includes('{a.action}'), false)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-audit-label-test OK')
process.exitCode = fail ? 1 : 0
