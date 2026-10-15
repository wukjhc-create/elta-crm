/** Tilbudslinjer i mailen stables paa smal skaerm. Koer: npx tsx scripts/quote-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/quote-line-items-editor.tsx', 'utf8')
const row = src.slice(src.indexOf('{items.map'), src.indexOf('Action buttons'))

eq('header skjules paa mobil', src.includes('hidden sm:grid grid-cols-[1fr_60px_80px_90px_90px_70px_32px]'), true)
eq('raekken stables', row.includes('grid-cols-1 sm:grid-cols-[1fr_60px_80px_90px_90px_70px_32px]'), true)
eq('antal har etiket', row.includes('sm:hidden text-[11px] text-gray-500 mb-0.5">Antal'), true)
eq('enhed har etiket', row.includes('sm:hidden text-[11px] text-gray-500 mb-0.5">Enhed'), true)
eq('vejl pris har etiket', row.includes('sm:hidden text-[11px] text-gray-500 mb-0.5">Vejl. pris'), true)
eq('enhedspris har etiket', row.includes('sm:hidden text-[11px] text-gray-500 mb-0.5">Enhedspris'), true)
eq('total har etiket', row.includes('sm:hidden text-[11px] text-gray-500 mb-0.5">Total'), true)
eq('slet har et navn', row.includes('aria-label="Slet linje"'), true)
eq('linjetotal regnes stadig', src.includes('const lineTotal = item.quantity * item.unitPrice'), true)

console.log(fail ? `\n${fail} fejl` : '\nquote-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
