/** Kort for efterkalkulationens linjer og tilbudt vs. faktisk. Kør: npx tsx scripts/economy-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function between(file: string, start: string, end: string): string {
  const text = fs.readFileSync(file, 'utf8')
  const a = text.indexOf(start)
  const b = text.indexOf(end, a + start.length)
  return a >= 0 && b > a ? text.slice(a, b) : ''
}

const afterFile = 'src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx'
const ovaFile = 'src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx'
const after = between(afterFile, 'data-testid="aftercalc-lines-mobile"', 'hidden md:block')
const ova = between(ovaFile, 'data-testid="offer-vs-actual-mobile"', 'hidden md:block')
const ovaText = fs.readFileSync(ovaFile, 'utf8')

eq('efterkalk-kort findes', after.length > 0, true)
eq('efterkalk-kort viser begge kostsider', after.includes('r.offered_cost') && after.includes('r.actual_cost'), true)
eq('efterkalk-kort bruger ikke tabel-test-id', after.includes('data-testid="aftercalc-line"'), false)
eq('efterkalk-tabellen er skjult på mobil', fs.readFileSync(afterFile, 'utf8').includes('data-testid="aftercalc-line"'), true)
eq('efterkalk-kort ombryder beskrivelse', after.includes('text-gray-900 break-words">{r.description}'), true)
eq('hoejdepunkt ombryder beskrivelse', fs.readFileSync(afterFile, 'utf8').includes('text-gray-800 break-words min-w-0">{r.description}'), true)
eq('hoejdepunkt klipper ikke', fs.readFileSync(afterFile, 'utf8').includes('truncate'), false)
eq('ens tekst staar stadig som ikke matchet', fs.readFileSync(afterFile, 'utf8').includes('Ens tekst alene står som ikke matchet.'), true)
eq('tomt merkost bliver', fs.readFileSync(afterFile, 'utf8').includes('Ingen linje er dyrere end tilbudt.'), true)

eq('linje-kort findes', ova.length > 0, true)
eq('linje-kort viser totalen uden at fordoble U81-test-id', ova.includes('figures.offered_cost') && !ova.includes('offer-vs-actual-deviation'), true)
eq('linje-kort fordobler ikke række-test-id', ova.includes('offer-vs-actual-row'), false)
eq('linje-kort siger kost ukendt via samme funktion', ova.includes('visibleStatus(r)'), true)
eq('skrivebordet beholder U81-rækker og afvigelse', ovaText.includes('data-testid="offer-vs-actual-row"') && ovaText.includes('data-testid="offer-vs-actual-deviation"'), true)

console.log(fail ? `\n${fail} fejl` : '\neconomy-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
