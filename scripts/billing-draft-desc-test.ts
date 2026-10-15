/** Fakturaudkastets timebeskrivelse ombrydes. Timer og satser er de samme. Kør: npx tsx scripts/billing-draft-desc-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')

eq('timebeskrivelse ombrydes', src.includes('text-[11px] text-gray-500 break-words max-w-[16rem]'), true)
eq('beskrivelsen klippes ikke', src.includes('truncate max-w-[280px]'), false)
eq('timer bliver', src.includes('t.hours.toLocaleString'), true)
eq('manglende sats bliver', src.includes('Mangler timesats'), true)
eq('beskrivelsen er stadig t.description', src.includes('{t.description}'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-draft-desc-test OK')
process.exitCode = fail ? 1 : 0
