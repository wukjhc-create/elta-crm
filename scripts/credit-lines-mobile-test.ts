/** Kreditnota-dialogen kan vaelge linjer paa mobil. Antal og total bliver. Koer: npx tsx scripts/credit-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/credit-note-dialog.tsx', 'utf8')
const start = src.indexOf('data-testid="credit-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words text-gray-900">{l.description}'), true)
eq('antal bliver', mobile.includes("Number(l.quantity).toLocaleString('da-DK'"), true)
eq('total bliver', mobile.includes('fmtKr(Number(l.total_price))'), true)
eq('afkrydsning bliver', mobile.includes('toggleLine(l.id)'), true)
eq('tom liste bliver', src.includes('Ingen linjer på fakturaen'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('fortegn bliver', src.includes('preview.exVat > 0 ? `−${fmtKr(preview.exVat)}` : fmtKr(0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncredit-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
