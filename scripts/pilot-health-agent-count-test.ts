/** Pilot-health siger naar agenttaellinger fejler. Et aegte 0 bliver groent. Koer: npx tsx scripts/pilot-health-agent-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke tælles. Det tælles ikke som 0.'
const src = fs.readFileSync('src/lib/ops/pilot-health.ts', 'utf8')
const start = src.indexOf('async function agentItems')
const end = src.indexOf('async function incidentItems')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('afventer siger fejl', fn.includes("awaiting.error ? 'unknown' : 'green'") && fn.includes(msg), true)
eq('fejlede siger fejl', fn.includes("failed.error ? 'unknown'") && fn.includes("(failed.count ?? 0) > 0 ? 'yellow' : 'green'"), true)
eq('verifikation siger fejl', fn.includes("verify.error ? 'unknown'") && fn.includes("(verify.count ?? 0) > 0 ? 'yellow' : 'green'"), true)
eq('haengende siger fejl', fn.includes("stuck.error ? 'unknown'") && fn.includes("(stuck.count ?? 0) > 0 ? 'red' : 'green'"), true)
eq('haengende tekst bliver', fn.includes("action(s) står i 'executing' — kontrollér om effekten skete, før noget gentages"), true)
eq('live-flag bliver', fn.includes('AGENT_LIVE_SEND_ENABLED') && fn.includes("isLiveSendEnabled() ? 'red' : 'green'"), true)
eq('suggest bliver', fn.includes("r.safety_mode !== 'suggest'"), true)
eq('auto-create bliver', fn.includes('AUTO_CREATE_CASES_ENABLED'), true)
eq('fejltekst kommer foer nul', fn.indexOf('awaiting.error ?') < fn.indexOf('awaiting.count ?? 0'), true)

console.log(fail ? `\n${fail} fejl` : '\npilot-health-agent-count-test OK')
process.exitCode = fail ? 1 : 0
