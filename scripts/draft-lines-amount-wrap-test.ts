/** Kladdefakturaens linjebeloeb ombrydes. fmt() og handlingerne bliver. Koer: npx tsx scripts/draft-lines-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/draft-lines-editor.tsx', 'utf8')
const start = src.indexOf('data-testid="draft-lines-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('total ombrydes', mobile.includes('break-words">{fmt(l.total_price)}'), true)
eq('enhedslinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words'), true)
eq('beskrivelse bliver', mobile.includes('break-words text-gray-900'), true)
eq('antal bliver', mobile.includes("String(l.quantity).replace('.', ',')"), true)
eq('stk-pris bliver', mobile.includes('fmt(l.unit_price)'), true)
eq('ret bliver', mobile.includes('startEdit(l)'), true)
eq('slet bliver', mobile.includes("window.confirm('Slet denne manuelle linje?')"), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)
eq('desktop-raekke bliver', src.slice(end).includes('<tr key={l.id}>'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ndraft-lines-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
