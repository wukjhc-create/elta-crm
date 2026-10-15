/** Det operationelle overblik ombryder navne og fejltekst. Koer: npx tsx scripts/dashboard-overview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/operational-overview.tsx', 'utf8')

eq('overskriften ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('emne ombrydes', src.includes("break-words min-w-0\">{r.subject || '(uden emne)'}"), true)
eq('afsender ombrydes', src.includes('text-xs text-gray-500 break-words'), true)
eq('noegletallets tekst ombrydes', src.includes('break-words">{label}'), true)
eq('fejltekst ombrydes', src.includes('text-red-700 break-words" title={s.lastErrorMessage}'), true)
eq('tom mail bliver', src.includes('Ingen e-mails endnu.'), true)
eq('tal felterne er de samme', src.includes('new_emails_last_24h') && src.includes('invoices_overdue'), true)
eq('fakturastatus er dansk', src.includes("status === 'sent' ? 'Sendt'") && src.includes('invoiceStateLabel(r.status, r.payment_status)'), true)
eq('ukendt status bliver raa', src.includes(": status"), true)
eq('fakturanummer ombrydes', src.includes('font-medium break-all">{r.invoice_number}'), true)
eq('tom faktura siger naeste skridt', src.includes('når en faktura er oprettet'), true)
eq('beloebsformat bliver', src.includes("style: 'currency'"), true)

console.log(fail ? `\n${fail} fejl` : '\ndashboard-overview-mobile-test OK')
process.exitCode = fail ? 1 : 0
