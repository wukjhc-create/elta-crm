/** Tilbudsoversigtens maaned foelger koebenhavnsk maaned, som tallene goer. Hitrate og beloeb bliver. Koer: npx tsx scripts/offer-month-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/dashboard/monthly-offer-chart.tsx', 'utf8')
const stats = fs.readFileSync('src/lib/actions/dashboard.ts', 'utf8')
eq('overskrift er koebenhavnsk', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', month: 'long', year: 'numeric' })"), true)
eq('uden zone er vaek', src.includes("toLocaleDateString('da-DK', { month: 'long', year: 'numeric' })"), false)
eq('hitrate bliver', src.includes('stats.acceptedCount / (stats.sentCount + stats.acceptedCount)'), true)
eq('henter siger det', src.includes('Henter tilbudsoversigt…'), true)
eq('fejl siger det', src.includes('Kunne ikke hente tilbudsoversigt. Genindlæs siden.'), true)
eq('seneste tal bliver ved fejl', src.includes('Kunne ikke opdatere tilbudsoversigten. Tallene er de seneste.'), true)
eq('beloeb bliver', src.includes("style: 'currency', currency: 'DKK'"), true)
eq('tallene bruger koebenhavnsk maaned', stats.includes('const firstDayOfMonth = copenhagenLocalToIso(`${copenhagenParts(new Date()).date.slice(0, 7)}-01`, \'00:00\')'), true)

const boundary = new Date('2026-10-31T23:30:00.000Z')
const cph = boundary.toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', month: 'long', year: 'numeric' }).toLowerCase()
const utc = boundary.toLocaleDateString('da-DK', { timeZone: 'UTC', month: 'long', year: 'numeric' }).toLowerCase()
eq('graense er november', cph.includes('november'), true)
eq('utc er oktober', utc.includes('oktober'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-month-label-test OK')
process.exitCode = fail ? 1 : 0
