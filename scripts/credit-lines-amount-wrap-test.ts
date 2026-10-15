/** Kreditnotaens linjebeloeb ombrydes. fmtKr og fortegnet bliver. Koer: npx tsx scripts/credit-lines-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/credit-note-dialog.tsx', 'utf8')
const start = src.indexOf('data-testid="credit-lines-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('total ombrydes', mobile.includes('break-words">{fmtKr(Number(l.total_price))}'), true)
eq('beskrivelse bliver', mobile.includes('break-words text-gray-900">{l.description}'), true)
eq('antal bliver', mobile.includes("Number(l.quantity).toLocaleString('da-DK'"), true)
eq('afkrydsning bliver', mobile.includes('toggleLine(l.id)'), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)
eq('fortegn bliver', src.includes('preview.exVat > 0 ? `−${fmtKr(preview.exVat)}` : fmtKr(0)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncredit-lines-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
