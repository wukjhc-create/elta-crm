/** Fakturakladdens linjer kan laeses paa mobil. Antal, pris og handlinger bliver. Koer: npx tsx scripts/draft-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/draft-lines-editor.tsx', 'utf8')
const start = src.indexOf('data-testid="draft-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
const desktop = src.slice(src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words text-gray-900'), true)
eq('stk-pris bliver', mobile.includes('fmt(l.unit_price)'), true)
eq('total bliver', mobile.includes('fmt(l.total_price)'), true)
eq('antal bliver', mobile.includes("String(l.quantity).replace('.', ',')"), true)
eq('ret bliver', mobile.includes('startEdit(l)'), true)
eq('gem bliver', mobile.includes('save(l)'), true)
eq('slet bliver', mobile.includes("window.confirm('Slet denne manuelle linje?')"), true)
eq('antal fra sagen bliver', mobile.includes('title="Antal kommer fra sagen"'), true)
eq('mobil har ikke draft-edit', mobile.includes('data-testid="draft-edit"'), false)
eq('desktop beholder draft-edit', desktop.includes('data-testid="draft-edit"'), true)
eq('desktop beholder raekken', desktop.includes('<tr key={l.id}>'), true)
eq('tilfoej bliver', src.includes('data-testid="draft-add-submit"'), true)

console.log(fail ? `\n${fail} fejl` : '\ndraft-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
