/** Styringscockpittet viser to linjer af emnet. Beløb og links er de samme. Kør: npx tsx scripts/cockpit-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/styrings-cockpit.tsx', 'utf8')

eq('emner viser to linjer', src.includes('line-clamp-2 break-words font-medium'), true)
eq('underlinje viser to linjer', src.includes('line-clamp-2 break-words text-gray-500'), true)
eq('ingen truncate', src.includes('truncate'), false)
eq('henvendelse bevarer testid', src.includes('data-testid="cockpit-web-inquiry-title"') && src.includes("m.unread ? 'font-semibold' : 'font-medium'"), true)
eq('ufaktureret beloeb bliver', src.includes('{kr(c.sale)}') && src.includes('data-testid="cockpit-unbilled"'), true)
eq('aabnet-badge bliver', src.includes('data-testid="cockpit-offer-opened"') && src.includes('data-testid="cockpit-offer-unopened"'), true)
eq('tomme tekster bliver', src.includes('Alle tråde er besvaret.') && src.includes('Ingen overdue opgaver.') && src.includes('Alt registreret arbejde er faktureret.'), true)
eq('overskriften er stadig centreret', src.includes('flex items-center justify-between'), true)

console.log(fail ? `\n${fail} fejl` : '\ncockpit-wrap-test OK')
process.exitCode = fail ? 1 : 0
