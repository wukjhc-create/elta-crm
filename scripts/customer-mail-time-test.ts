/** Kundens mailtid bruger koebenhavnsk tid. Emnet bliver paa to linjer. Koer: npx tsx scripts/customer-mail-time-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('hjaelperen bruger koebenhavn', src.includes("timeZone: 'Europe/Copenhagen'"), true)
eq('traad bruger hjaelperen', src.includes('fmtMailTime(conv.latestAt)'), true)
eq('liste bruger hjaelperen', src.includes('fmtMailTime(email.received_at)'), true)
eq('besked bruger hjaelperen', src.includes('fmtMailTime(msg.received_at)'), true)
eq('aaben mail bruger lang maaned', src.includes("fmtMailTime(viewingEmail.received_at, 'long')"), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)
eq('emne viser stadig to linjer', src.split('text-sm mt-1 line-clamp-2').length === 3, true)
eq('forhaandsvisning bliver paa en linje', src.split('line-clamp-1">{').length === 3, true)
eq('meta kan ombrydes', src.split('flex flex-wrap items-center gap-2').length >= 3, true)

const lateUtc = new Date('2026-01-15T23:30:00.000Z').toLocaleString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
eq('sen utc-aften er naeste dag i koebenhavn', lateUtc.includes('16'), true)
eq('minuttet bliver 30', lateUtc.includes('30'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-mail-time-test OK')
process.exitCode = fail ? 1 : 0
