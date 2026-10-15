/** Maillistens ældre dato er københavnsk. Relativ tid og forhåndsvisning bliver. Kør: npx tsx scripts/mail-list-date-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const label = new Date('2026-10-14T22:30:00Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: 'numeric',
  month: 'short',
})
eq('sen aften er den 15', label.startsWith('15'), true)
eq('sen aften er oktober', label.toLowerCase().includes('okt'), true)
eq('sen aften er ikke utc-dagen', label.startsWith('14'), false)

const src = fs.readFileSync('src/app/dashboard/mail/components/mail-list.tsx', 'utf8')
eq('datoen er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short' })"), true)
eq('lige nu bliver', src.includes("return 'Lige nu'"), true)
eq('minutter bliver', src.includes('Math.floor(diff / 60_000)'), true)
eq('timer bliver', src.includes('Math.floor(diff / 3600_000)'), true)
eq('forhaandsvisning bliver paa en linje', src.includes('text-xs text-gray-400 truncate mt-0.5') && src.includes('email.body_preview'), true)
eq('modtagelse kaldes stadig', src.includes('formatDate(email.received_at)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-list-date-test OK')
process.exitCode = fail ? 1 : 0
