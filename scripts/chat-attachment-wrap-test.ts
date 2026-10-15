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

const employee = fs.readFileSync('src/components/modules/customers/employee-chat.tsx', 'utf8')
const portal = fs.readFileSync('src/components/modules/portal/portal-chat.tsx', 'utf8')
eq('afsender ombrydes hos medarbejder', employee.includes('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1') && employee.includes('opacity-75 break-words'), true)
eq('afsender ombrydes i portalen', portal.includes('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1') && portal.includes('opacity-75 break-words'), true)
eq('beskedtekst bliver', employee.includes('whitespace-pre-wrap break-words') && portal.includes('whitespace-pre-wrap break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\nchat-attachment-wrap-test OK')
process.exitCode = fail ? 1 : 0
