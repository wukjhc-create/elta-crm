/** Mailens vaerktoejslinje ombrydes, og en fejlet diagnose eller reset siges. Sync-kaldene bliver. Koer: npx tsx scripts/mail-toolbar-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
const titleAt = src.indexOf('text-3xl font-bold text-gray-900">Mail')
const head = src.slice(Math.max(0, titleAt - 250), src.indexOf('Synkroniserer...'))
eq('hovedet ombrydes', head.includes('flex flex-wrap items-start justify-between gap-3'), true)
eq('knapperne ombrydes', head.includes('flex flex-wrap items-center gap-2'), true)
eq('sync-knap bliver', src.includes("{isSyncing ? 'Synkroniserer...' : 'Sync nu'}"), true)
eq('diagnose siger fejl', src.split("toast.error('Diagnose fejlede', 'Kunne ikke hente sync-status')").length === 3, true)
eq('diagnose kaldes stadig', src.split('runSyncDiagnostic()').length >= 3, true)
eq('reset siger fejl', src.includes("toast.error('Reset fejlede', 'Delta blev ikke nulstillet')"), true)
eq('reset kaldes stadig', src.includes('runSyncAndDiagnose()'), true)
eq('fast-forward siger stadig fejl', src.includes("toast.error('Fast-forward fejlede'"), true)
eq('diagnostik-klokken bliver', src.includes("toLocaleString('da-DK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })"), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-toolbar-wrap-test OK')
process.exitCode = fail ? 1 : 0
