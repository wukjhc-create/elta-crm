/** Chat-vedhaeftningens filnavn ombrydes. Fjern-knappen bliver. Koer: npx tsx scripts/chat-attachment-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function check(file: string, sizeFn: string) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} ombryder ventende fil`, src.includes('break-all min-w-0">{attachment.name}'), true)
  eq(`${file} ombryder vist fil`, src.includes('text-sm font-medium break-all">{attachment.name}'), true)
  eq(`${file} klipper ikke ved 120`, src.includes('max-w-[120px]'), false)
  eq(`${file} kan stadig fjerne`, src.includes('aria-label="Fjern vedhæftet fil"') && src.includes('removeAttachment(idx)'), true)
  eq(`${file} viser stadig stoerrelse`, src.includes(`${sizeFn}(attachment.size)`), true)
}

check('src/components/modules/customers/employee-chat.tsx', 'formatFileSize')
check('src/components/modules/portal/portal-chat.tsx', 'formatBytes')

console.log(fail ? `\n${fail} fejl` : '\nchat-attachment-wrap-test OK')
process.exitCode = fail ? 1 : 0
