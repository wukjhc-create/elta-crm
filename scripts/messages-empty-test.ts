/** Tom beskedmappe siger hvilken mappe der er tom. Koer: npx tsx scripts/messages-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/messages/messages-list.tsx', 'utf8')
const empty = src.slice(src.indexOf('if (messages.length === 0)'), src.indexOf('messages.map'))

eq('indbakken siger det', empty.includes('Ingen beskeder i indbakken.') && empty.includes('Nye beskeder vises her.'), true)
eq('sendt siger det', empty.includes('Ingen sendte beskeder.') && empty.includes('Beskeder du sender, vises her.'), true)
eq('arkiv siger det', empty.includes('Ingen arkiverede beskeder.') && empty.includes('Arkiverede beskeder vises her.'), true)
eq('tom soegning siger det', empty.includes('Ingen beskeder matcher søgningen.') && empty.includes('Ryd søgning'), true)

const page = fs.readFileSync('src/components/modules/messages/messages-page-client.tsx', 'utf8')
eq('soegning har et navn', page.includes('aria-label="Søg i beskeder"'), true)
eq('soegning kan ryddes', page.includes('onClearSearch={clearSearch}') && page.includes('searching={search.trim().length > 0}'), true)
eq('overskriften ombrydes', page.includes('flex flex-wrap items-center justify-between gap-2 mb-4'), true)
eq('afsender ombrydes', src.includes('break-words min-w-0') && src.includes("message.from_name"), true)
eq('emnet ombrydes', src.includes('data-testid="message-list-subject"') && src.includes('{message.subject}'), true)
eq('forhaandsvisning er stadig kort', src.includes('message.body.substring(0, 100)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmessages-empty-test OK')
process.exitCode = fail ? 1 : 0
