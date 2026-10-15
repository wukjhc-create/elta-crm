/** Bankafstemning på små skærme. Kør: npx tsx scripts/bank-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/bank/bank-client.tsx', 'utf8')
const card = src.slice(src.indexOf('function BankTxCard'), src.indexOf('function BankTxRow'))

eq('mobil-liste findes', src.includes('data-testid="bank-tx-mobile"'), true)
eq('tabellen er skjult under md', src.includes('hidden md:block border rounded overflow-x-auto'), true)
eq('kortet viser beloeb, reference og afsender', card.includes('row.amount') && card.includes('reference_text') && card.includes('sender_name'), true)
eq('find faktura aabner samme match', card.includes('Find faktura') && card.includes('MatchPanel') && card.includes('useManualMatch'), true)
eq('status er paa dansk', src.includes("unmatched: 'Uden match'") && src.includes("overpayment: 'Overbetaling'"), true)
eq('auto-match teksten er paa dansk', src.includes('Gennemgik ${summary.scanned}'), true)
eq('match kalder stadig manualMatchAction', src.includes('manualMatchAction(rowId, invoiceId)'), true)
eq('tom liste har stadig teksten', src.includes('Ingen umatchede transaktioner.'), true)
eq('tom liste siger naeste skridt', src.includes('Importér en CSV, når banken har sendt nye linjer.'), true)
eq('tom soegning skelnes', src.includes('Ingen fakturaer matcher søgningen. Prøv et andet fakturanummer.') && src.includes('Ingen ubetalte fakturaer at matche.'), true)
eq('reference ombrydes', card.includes('break-words">{row.reference_text'), true)
eq('afsender ombrydes', card.includes('break-words">{row.sender_name'), true)
eq('beloeb bliver', card.includes('fmtAmount(Number(row.amount))'), true)

console.log(fail ? `\n${fail} fejl` : '\nbank-mobile-test OK')
process.exitCode = fail ? 1 : 0
