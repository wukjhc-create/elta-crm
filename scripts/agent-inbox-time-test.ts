/** Agentindbakken viser modtagelse i koebenhavnsk tid. Tilstanden bliver. Koer: npx tsx scripts/agent-inbox-time-test.ts */
import fs from 'fs'
import { safetyModeLabel } from '../src/lib/agents/inbox-presentation'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

eq('forslag', safetyModeLabel('suggest'), 'Forslag')
eq('godkendelse', safetyModeLabel('approve'), 'Kræver godkendelse')
eq('automatisk', safetyModeLabel('auto'), 'Automatisk')
eq('ukendt tilstand bliver', safetyModeLabel('mystery'), 'mystery')

const client = fs.readFileSync('src/app/dashboard/agents/agent-inbox-client.tsx', 'utf8')
const at = client.indexOf('item.mail.received_at')
const slice = client.slice(at, at + 420)
eq('modtagelse bruger koebenhavn', slice.includes("timeZone: 'Europe/Copenhagen'"), true)
eq('emnet ombrydes', client.includes("font-medium text-gray-700 break-words\">{item.mail.subject || '(Intet emne)'}"), true)
eq('forhaandsvisning bliver paa to linjer', client.includes('line-clamp-2 text-gray-500">{item.mail.body_preview}'), true)
eq('tilstanden vises via navnet', client.includes('safetyModeLabel(item.run.safety_mode)'), true)
eq('udfoer kaldes stadig', client.includes('executeAgentActionAction'), true)
eq('live send aktiveres ikke her', client.includes('HARD_BLOCKED'), true)

const lateUtc = new Date('2026-01-15T23:30:00.000Z').toLocaleString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
eq('sen utc-aften er naeste dag i koebenhavn', lateUtc.startsWith('16'), true)

console.log(fail ? `\n${fail} fejl` : '\nagent-inbox-time-test OK')
process.exitCode = fail ? 1 : 0
