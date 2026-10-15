/** Linjer paa en leverandoerfaktura, smaa skaerme. Koer: npx tsx scripts/incoming-invoice-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="incoming-invoice-lines-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto', start)
const mobile = src.slice(start, end)

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq('kortet viser antal, pris og total', mobile.includes('l.quantity') && mobile.includes('unit_price') && mobile.includes('total_price'), true)
eq('konvertering staar som tekst', mobile.includes('Materiale') && mobile.includes('Øvrig') && mobile.includes('Ikke konverteret'), true)
eq('kortet er ikke tabellen', mobile.includes('<table'), false)
eq('tom tekst er der stadig', src.includes('Ingen linjer ekstraheret.'), true)
eq('tom linjeliste siger naeste skridt', src.includes('Tjek bilaget nedenfor.'), true)
eq('leverandør ombrydes', src.includes('break-words min-w-0">{detail.supplier?.name'), true)
eq('feltvaerdi ombrydes', src.includes('text-right text-gray-900 min-w-0 break-words'), true)
eq('match-label kan blive smal', src.includes('w-28 sm:w-44 shrink-0 text-gray-500 break-words'), true)
eq('score er den samme', src.includes('score.toFixed(2)') && src.includes('Math.min(100, score * 100)'), true)
eq('beløb incl moms bliver', src.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), true)
eq('bogfør-knappen bliver', src.includes('Bogfør til e-conomic'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
