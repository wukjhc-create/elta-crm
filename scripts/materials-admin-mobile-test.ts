/** Materialeadmin har kort paa mobil, og bind-dialogen fylder skaermen. Kost og knapper bliver. Koer: npx tsx scripts/materials-admin-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/components/modules/materials/materials-admin.tsx', 'utf8')
const start = 'data-testid="materials-admin-mobile-list"'
const a = view.indexOf(start)
const b = view.indexOf('hidden md:block', a + start.length)
const mobile = a >= 0 && b > a ? view.slice(a, b) : ''

eq('kort findes', mobile.length > 40, true)
eq('navn ombrydes', mobile.includes('break-words">{r.name}'), true)
eq('kost bliver', mobile.includes('formatCurrency(r.cost_price)'), true)
eq('bind er den samme', mobile.includes('setBindingFor(r)'), true)
eq('fjern er den samme', mobile.includes('handleUnbind(r)'), true)
eq('tabellen bliver paa desktop', view.includes('hidden md:block overflow-x-auto'), true)
eq('dialogen fylder skaermen', view.includes('w-full max-w-[680px]'), true)
eq('dialogen er ikke fast bred', view.includes('shadow-xl w-[680px]'), false)
eq('tom tekst bliver', view.includes('Ingen materialer matcher filteret.'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-admin-mobile-test OK')
process.exitCode = fail ? 1 : 0
