/** Portal-chat siger naar beskederne ikke kan hentes. En aekte tom chat bliver. Afsendelse bliver. Koer: npx tsx scripts/portal-chat-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/portal/portal-chat.tsx', 'utf8')
const start = src.indexOf('const loadMessages = useCallback')
const fn = src.slice(start, src.indexOf('// Load messages on mount'))
eq('hentning findes', fn.length > 80, true)
eq('succes gemmer raekker', fn.includes('const rows = result.data || []') && fn.includes('setMessages(rows)'), true)
eq('fejltekst', fn.includes("setMessagesError(result.error || 'Kunne ikke hente beskeder')"), true)
const elsePart = fn.slice(fn.indexOf('} else {'))
eq('fejl rydder ikke listen', elsePart.includes('setMessages('), false)
eq('banner', src.includes('data-testid="portal-chat-load-error"') && src.includes('Det tælles ikke som ingen beskeder.'), true)
eq('aeldre beskeder bliver', src.includes('Beskederne der allerede er hentet bliver.'), true)
eq('tom chat bliver', src.includes('Ingen beskeder endnu.'), true)
eq('tom tekst kraever ingen fejl', src.includes('messagesError && messages.length === 0'), true)
eq('afsendelse bliver', src.includes('sendPortalMessage'), true)
eq('laes-markering kun ved succes', fn.indexOf('markPortalMessagesAsRead') > fn.indexOf('setMessages(rows)'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-chat-load-test OK')
process.exitCode = fail ? 1 : 0
