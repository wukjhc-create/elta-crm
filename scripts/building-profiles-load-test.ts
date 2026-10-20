/** Bygningsprofiler siger naar listen ikke kan hentes. Et aegte 0 bliver. Koer: npx tsx scripts/building-profiles-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/profiles/page.tsx', 'utf8')
eq('siden sender fejl', page.includes("profilesResult.success ? null : profilesResult.error || 'Kunne ikke hente bygningsprofiler'"), true)
eq('aegte liste bliver', page.includes('profilesResult.success && profilesResult.data ? profilesResult.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/profiles/building-profiles-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="building-profiles-load-error"') && view.includes('Det tælles ikke som ingen profiler.'), true)
eq('antal er ikke 0', view.includes('Det tælles ikke som 0 profiler.'), true)
eq('aegte antal bliver', view.includes('bygningsprofiler konfigureret'), true)
eq('multiplikator bliver', view.includes('value.toFixed(3)'), true)

console.log(fail ? `\n${fail} fejl` : '\nbuilding-profiles-load-test OK')
process.exitCode = fail ? 1 : 0
