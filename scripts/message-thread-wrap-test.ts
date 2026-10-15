/** Beskedtråden ombryder emnet, og ikonknapperne har et navn. Slet og luk bliver. Koer: npx tsx scripts/message-thread-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/messages/message-thread.tsx', 'utf8')

eq('emne ombrydes', src.includes('font-semibold break-words min-w-0 flex-1">{message.subject}'), true)
eq('emne klippes ikke', src.includes('truncate flex-1'), false)
eq('svar har et navn', src.includes('aria-label="Svar"') && src.includes('setShowReplyForm(true)'), true)
eq('laest har et navn', src.includes('aria-label="Markér som læst"') && src.includes('handleMarkAsRead'), true)
eq('ulaest har et navn', src.includes('aria-label="Markér som ulæst"') && src.includes('handleMarkAsUnread'), true)
eq('arkiv har et navn', src.includes('aria-label="Arkivér"') && src.includes('handleArchive'), true)
eq('gendan har et navn', src.includes('aria-label="Gendan"') && src.includes('handleUnarchive'), true)
eq('slet har stadig et navn', src.includes('aria-label="Slet besked"'), true)
eq('luk har stadig et navn', src.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\nmessage-thread-wrap-test OK')
process.exitCode = fail ? 1 : 0
