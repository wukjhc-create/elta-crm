/** Sync-job og koersler ombrydes. Ikonerne har et navn. Koer: npx tsx scripts/sync-jobs-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/sync-jobs-manager.tsx', 'utf8')
const job = src.slice(src.indexOf('Job Header'), src.indexOf('Expanded: Sync Logs'))
const logs = src.slice(src.indexOf('Expanded: Sync Logs'), src.indexOf('function SyncJobForm'))

eq('jobbet stables paa mobil', job.includes('flex flex-col gap-3 sm:flex-row sm:items-start'), true)
eq('ikonerne har et navn', job.includes('Skjul kørsler') && job.includes('Deaktiver job') && job.includes('Rediger job') && job.includes('Slet job'), true)
eq('koerslen ombrydes', logs.includes('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'), true)
eq('tom koersel er den samme', logs.includes('Ingen kørsler endnu'), true)
eq('tom koersel siger naeste skridt', logs.includes('De vises her, når jobbet har kørt.'), true)
eq('beskrivelse ombrydes', src.includes('text-sm text-gray-500 mt-0.5 break-words">{job.description}'), true)
eq('jobnavn ombrydes', src.includes('font-medium text-gray-900 break-words">{job.name}'), true)
eq('job klipper ikke', src.includes('truncate'), false)

const health = fs.readFileSync('src/components/modules/suppliers/supplier-health-overview.tsx', 'utf8')
eq('fejltekst ombrydes', health.includes('text-xs text-red-700 break-words">{emailSync.lastError}'), true)
eq('fejltekst klippes ikke', health.includes('truncate'), false)
eq('seneste sync bliver', health.includes('Sidst synkroniseret:'), true)

const plans = fs.readFileSync('src/components/modules/suppliers/sync-schedules-manager.tsx', 'utf8')
eq('koer nu har et navn', plans.includes('aria-label="Kør nu"') && plans.includes('handleRunNow(schedule)'), true)
eq('plan-knapper har navne', plans.includes('aria-label="Rediger plan"') && plans.includes('aria-label="Slet plan"'), true)
eq('tom plan siger naeste skridt', plans.includes('Brug Kør nu, eller vent på planen.'), true)
eq('genforsoeg bliver', plans.includes('schedule.max_retries'), true)

console.log(fail ? `\n${fail} fejl` : '\nsync-jobs-mobile-test OK')
process.exitCode = fail ? 1 : 0
