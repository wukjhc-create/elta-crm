/** Opfoelgningsskyggen siger naar indstillingerne ikke kan laeses. Standard bliver. Koer: npx tsx scripts/pilot-health-followup-settings-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse påmindelsesindstillinger. Det tælles ikke som standard.'
const src = fs.readFileSync('src/lib/ops/pilot-health.ts', 'utf8')
const start = src.indexOf('async function followupShadowHealthItem')
const end = src.indexOf('// ---------- 3. Brugere ----------')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('indstillinger siger fejl', fn.includes('if (settings.error)') && fn.includes(msg), true)
eq('fejlen kommer foer standard', fn.indexOf('if (settings.error)') < fn.indexOf('reminder_enabled ?? true'), true)
eq('standard bliver', fn.includes('reminder_enabled ?? true') && fn.includes('reminder_interval_days ?? 3') && fn.includes('reminder_max_count ?? 3'), true)
eq('skyggetekst bliver', fn.includes('followupShadowDetail(report)') && fn.includes('followupShadowLevel(report)'), true)
eq('kundenavn bliver vaek', !fn.includes('company_name') && !fn.includes('full_name'), true)
eq('maaling-fejlen bliver', fn.includes("level: 'unknown', detail: `kunne ikke måles:"), true)

console.log(fail ? `\n${fail} fejl` : '\npilot-health-followup-settings-test OK')
process.exitCode = fail ? 1 : 0
