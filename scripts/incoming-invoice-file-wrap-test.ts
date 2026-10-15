/** Bilagsknappen ombryder filnavn og hjaelpetekst. Linjebeloeb og aabn bliver. Koer: npx tsx scripts/incoming-invoice-file-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('raekken ombrydes', src.includes('flex flex-wrap items-center gap-3 text-sm'), true)
eq('filnavn ombrydes', src.includes('break-words text-left min-w-0'), true)
eq('hjaelp ombrydes', src.includes('text-[11px] text-gray-400 break-words">Sikkert link genereres ved klik'), true)
eq('aabn bliver', src.includes('onClick={handleOpenFile}'), true)
eq('teksten bliver', src.includes("inv.file_name ?? 'bilag'"), true)
eq('linjebeloeb bliver', src.includes('fmtAmount(l.total_price, inv.currency)'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-file-wrap-test OK')
process.exitCode = fail ? 1 : 0
