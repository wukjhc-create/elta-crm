/** Overtidseditoren kan laeses paa mobil. Gem og loftet bliver. Koer: npx tsx scripts/overtime-editor-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/employees/employee-overtime-rates-panel.tsx', 'utf8')
const start = src.indexOf('data-testid="overtime-editor-mobile"')
eq('mobiliste findes', start > 0, true)
eq('kortet bruger samme raekke', src.slice(start, src.indexOf('hidden md:block', start)).includes('layout="card"'), true)
const readCard = src.slice(src.indexOf("if (!canEdit && layout === 'card')"), src.indexOf('if (!canEdit) {', src.indexOf("if (!canEdit && layout === 'card')") + 10))
eq('faktor bliver', readCard.includes('{rate.multiplier}×'), true)
eq('kost bliver', readCard.includes('{fmt(rate.cost_rate)}'), true)
eq('salg bliver', readCard.includes('{fmt(rate.sale_rate)}'), true)
const editCard = src.slice(src.indexOf("if (layout === 'card')"), src.indexOf('<tr className={rate.is_active ? \'\' : \'opacity-60\'}>'))
eq('gem kalder samme funktion', editCard.includes('onClick={saveRow}'), true)
eq('aktiv kalder samme funktion', editCard.includes('setOvertimeRateActive(rate.id, !rate.is_active)'), true)
eq('desktop-tabel bliver', src.includes('hidden md:block overflow-x-auto'), true)
eq('loft bliver', src.includes('m < 0 || m > 10') && src.includes('Multiplikator skal være mellem 0 og 10'), true)
eq('historik bliver', src.includes('Historiske timer ændres ikke automatisk.'), true)
eq('hoeje sats bliver', src.includes('(c ?? 0) > 5000'), true)

console.log(fail ? `\n${fail} fejl` : '\novertime-editor-mobile-test OK')
process.exitCode = fail ? 1 : 0
