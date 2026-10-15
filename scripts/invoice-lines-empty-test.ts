/** Tom fakturakladde siger hvor linjerne tilfojes. Beløb bliver. Koer: npx tsx scripts/invoice-lines-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')

eq('kladde siger naeste skridt', src.includes('Ingen linjer på fakturaen. Tilføj linjer i kladden ovenfor.'), true)
eq('andre fakturaer beholder teksten', src.includes("'Ingen linjer på fakturaen.'"), true)
eq('kun redigerbar kladde', src.includes('isDraft && canEditDraft'), true)
eq('beskrivelse ombrydes', src.includes('break-words max-w-[16rem]">{l.description}'), true)
eq('linjetotal bliver', src.includes('fmtKr(l.total_price, inv.currency)'), true)
eq('subtotal bliver', src.includes('fmtKr(inv.total_amount, inv.currency)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-lines-empty-test OK')
process.exitCode = fail ? 1 : 0
