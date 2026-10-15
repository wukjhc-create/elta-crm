/** Planlagt afslutning vises i koebenhavnsk tid. Statusskift bliver. Koer: npx tsx scripts/planning-time-zone-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
const dateAt = src.indexOf('const fmtDate')
const dateSlice = src.slice(dateAt, dateAt + 220)
eq('datoen bruger koebenhavn', dateSlice.includes("timeZone: 'Europe/Copenhagen'"), true)
eq('ugedag bliver', dateSlice.includes("weekday: 'short'"), true)

const doneAt = src.indexOf('· afsluttet')
const doneSlice = src.slice(doneAt, doneAt + 280)
eq('afslutning bruger koebenhavn', doneSlice.includes("timeZone: 'Europe/Copenhagen'"), true)
eq('klokkeslaet har time og minut', doneSlice.includes("hour: '2-digit'") && doneSlice.includes("minute: '2-digit'"), true)
eq('beskrivelse ombrydes', src.includes('whitespace-pre-wrap break-words">{wo.description}'), true)
eq('start-knappen bliver', src.includes("t === 'in_progress' && '→ Start'"), true)
eq('afslut-knappen bliver', src.includes("t === 'done' && '✓ Afslut'"), true)

const lateUtc = new Date('2026-01-15T23:30:00.000Z').toLocaleString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
eq('sen utc-aften er naeste dag i koebenhavn', lateUtc.startsWith('16'), true)
eq('minuttet bliver 30', lateUtc.includes('30'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-time-zone-test OK')
process.exitCode = fail ? 1 : 0
