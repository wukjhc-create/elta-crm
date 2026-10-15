/** Sagens mail ombryder afsender, emne og filnavn. Download bliver. Kør: npx tsx scripts/case-mail-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-mails-tab.tsx', 'utf8')

eq('afsender ombrydes', src.includes('line-clamp-2 break-all min-w-0'), true)
eq('emne ombrydes', src.includes('line-clamp-2 break-words'), true)
eq('filnavn ombrydes', src.includes('text-sm break-all min-w-0">{att.filename}'), true)
eq('lightbox ombrydes', src.includes('break-all min-w-0 flex-1" title={lightbox.name}'), true)
eq('ingen truncate', src.includes('truncate'), false)
eq('intet emne bliver', src.includes("'(Intet emne)'"), true)
eq('download har navn', src.includes('aria-label="Download"') && src.includes('href={lightbox.url}'), true)
eq('luk har navn', src.includes('aria-label="Luk billede-visning"'), true)
eq('stoerrelse bliver', src.includes('formatSize(att.size)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-mail-wrap-test OK')
process.exitCode = fail ? 1 : 0
