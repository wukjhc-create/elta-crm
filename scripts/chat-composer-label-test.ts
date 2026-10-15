/** Chatfelt og send-knap har et navn. Afsendelsen bliver. Koer: npx tsx scripts/chat-composer-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function check(file: string) {
  const src = fs.readFileSync(file, 'utf8')
  const at = src.indexOf('value={newMessage}')
  const slice = src.slice(Math.max(0, at - 80), at + 900)
  eq(`${file} besked har et navn`, slice.includes('aria-label="Besked"'), true)
  eq(`${file} beskedvaerdien bliver`, slice.includes('value={newMessage}'), true)
  eq(`${file} feltet kan krympe`, slice.includes('flex-1 min-w-0 px-4 py-2'), true)
  eq(`${file} send har et navn`, slice.includes('aria-label="Send besked"'), true)
  eq(`${file} send kalder stadig handleSend`, slice.includes('onClick={handleSend}'), true)
  eq(`${file} tom besked kan stadig ikke sendes alene`, slice.includes('!newMessage.trim() && pendingAttachments.length === 0'), true)
  eq(`${file} vedhaeft har stadig et navn`, src.includes('aria-label="Vedhæft fil"'), true)
}

check('src/components/modules/portal/portal-chat.tsx')
check('src/components/modules/customers/employee-chat.tsx')

console.log(fail ? `\n${fail} fejl` : '\nchat-composer-label-test OK')
process.exitCode = fail ? 1 : 0
