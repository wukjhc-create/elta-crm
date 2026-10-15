/** Tom linjeliste i efterkalk og tilbud-mod-faktisk siger hvor tallene kommer fra. Koer: npx tsx scripts/economy-lines-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const after = fs.readFileSync('src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx', 'utf8')
const ova = fs.readFileSync('src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx', 'utf8')

eq(
  'efterkalk siger naeste kilde',
  after.includes('Ingen linjer eller forbrug endnu. Linjer kommer fra tilbuddet. Forbrug kommer fra timer, materialer og andre omkostninger.'),
  true,
)
eq('efterkalk matcher stadig kun via vare', after.includes('Ens tekst alene står som ikke matchet.'), true)
eq(
  'tilbud mod faktisk siger materialer og timer',
  ova.includes('Ingen linjer eller forbrug endnu. Linjer kommer fra tilbuddet. Forbrug kommer fra sagens materialer og timer.'),
  true,
)
eq('ukendt total bliver', ova.includes('data-testid="offer-vs-actual-total-unknown"'), true)
eq('synlig status aendrer ikke data-status', ova.includes('data-status bliver ved antal-reglen'), true)

console.log(fail ? `\n${fail} fejl` : '\neconomy-lines-empty-test OK')
process.exitCode = fail ? 1 : 0
