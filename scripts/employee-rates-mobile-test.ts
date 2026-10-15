/** Overtidssatser og udstyr kan laeses paa mobil. Faktor, kost og salg bliver. Koer: npx tsx scripts/employee-rates-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/employees/employee-profile-sections.tsx', 'utf8')
const ot = src.indexOf('data-testid="employee-overtime-mobile"')
const otMobile = src.slice(ot, src.indexOf('hidden md:block', ot))
eq('overtidskort findes', ot > 0, true)
eq('faktor bliver', otMobile.includes('{r.multiplier}×'), true)
eq('kost bliver', otMobile.includes('{dkk(r.cost_rate)}'), true)
eq('salg bliver', otMobile.includes('{dkk(r.sale_rate)}'), true)
eq('aktiv bliver', otMobile.includes("{r.is_active ? 'Ja' : 'Nej'}"), true)
eq('overtidstabel bliver', src.slice(ot, src.indexOf('employee-equipment-mobile', ot)).includes('hidden md:block overflow-x-auto'), true)

const gear = src.indexOf('data-testid="employee-equipment-mobile"')
const gearMobile = src.slice(gear, src.indexOf('hidden md:block', gear))
eq('udstyrskort findes', gear > 0, true)
eq('udstyr ombrydes', gearMobile.includes('{e.name}'), true)
eq('kategori bliver', gearMobile.includes('{eqCat.get(e.category) ?? e.category}'), true)
eq('serienr bliver', gearMobile.includes("{e.serial_number ?? '—'}"), true)
eq('udleveret bliver', gearMobile.includes('{day(e.issued_date)}'), true)
eq('status bliver', gearMobile.includes('{eqStat.get(e.status) ?? e.status}'), true)
eq('udstyrstabel bliver', src.slice(gear).includes('hidden md:block overflow-x-auto'), true)
eq('tom sats bliver', src.includes('Ingen satser.'), true)
eq('tomt udstyr bliver', src.includes('Intet udstyr registreret.'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-rates-mobile-test OK')
process.exitCode = fail ? 1 : 0
