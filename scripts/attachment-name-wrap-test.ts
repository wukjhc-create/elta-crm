/** Udgående mail ombryder vedhæftet filnavn. Fjern og størrelse bliver. Koer: npx tsx scripts/attachment-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/mail/attachment-picker.tsx', 'utf8')

eq('filnavn ombrydes', src.includes('font-medium text-gray-800 break-all flex-1 min-w-0" title={a.file_name}'), true)
eq('filnavn klippes ikke', src.includes('truncate flex-1'), false)
eq('fjern har et navn', src.includes('aria-label={`Fjern ${a.file_name}`}'), true)
eq('stoerrelse bliver', src.includes('formatBytes(a.size)'), true)
eq('fjern bliver', src.includes('handleRemove(a.document_id)'), true)

console.log(fail ? `\n${fail} fejl` : '\nattachment-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
