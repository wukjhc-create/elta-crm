/** Mailens vedhæftede filnavn ombrydes. Download bliver. Kør: npx tsx scripts/mail-attachment-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')

eq('galleri ombryder filnavn', src.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), true)
eq('listen ombryder filnavn', src.includes('break-all min-w-0 flex-1 text-sm text-gray-700'), true)
eq('lightbox ombryder filnavn', src.includes('break-all min-w-0 flex-1">{lightboxName}'), true)
eq('download bliver', src.includes('href={att.url}') && src.includes('aria-label="Download"'), true)
eq('luk har navn', src.includes('aria-label="Luk"') && src.includes('setLightboxUrl(null)'), true)
eq('stoerrelse bliver', src.includes('formatFileSize(att.size)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-attachment-wrap-test OK')
process.exitCode = fail ? 1 : 0
