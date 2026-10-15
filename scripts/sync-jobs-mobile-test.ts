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

console.log(fail ? `\n${fail} fejl` : '\nsync-jobs-mobile-test OK')
process.exitCode = fail ? 1 : 0
