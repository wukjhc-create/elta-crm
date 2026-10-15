/** Efterkalkulation siger naar ansvarlige ikke kan hentes. Sager og et aegte tomt filter bliver. Koer: npx tsx scripts/aftercalc-assignees-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Ansvarlige kunne ikke hentes. Det tælles ikke som ingen.'
const action = fs.readFileSync('src/lib/actions/case-aftercalc.ts', 'utf8')
const start = action.indexOf('export async function getAftercalcOverview')
const fn = action.slice(start)
eq('funktion findes', start > 0, true)
eq('sager fejler stadig hele oversigten', fn.includes("error: 'Kunne ikke hente sager'"), true)
eq('navne siger fejl', fn.includes('if (assigneeRes.error)') && fn.includes('assigneesFailed = true'), true)
eq('navne logges', fn.includes("logger.error('getAftercalcOverview: assignees failed'"), true)
eq('flag paa begge svar', fn.split('assignees_failed: assigneesFailed').length === 3, true)
eq('vindue bliver', fn.includes('AFTERCALC_CASE_WINDOW'), true)
eq('navne-graense bliver', fn.includes('.limit(400)'), true)
eq('sag fejler foer navneflag', fn.indexOf("error: 'Kunne ikke hente sager'") < fn.indexOf('assigneesFailed = true'), true)

const view = fs.readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="aftercalc-assignees-error"') && view.includes(msg), true)
eq('fejl rydder ikke navne', view.includes('if (!res.data.assignees_failed) setAssignees(res.data.assignees)'), true)
eq('rydder ikke med tom liste', !view.includes('setAssignees([])'), true)
eq('tom sag bliver', view.includes('Ingen sager i oversigten.'), true)
eq('filtertom bliver', view.includes('Ingen sager matcher filtrene.'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-assignees-load-test OK')
process.exitCode = fail ? 1 : 0
