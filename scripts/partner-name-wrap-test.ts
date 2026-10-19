/** Partnerportalen ombryder sagstitel og dokumentnavn. Download og sagsnummer bliver. Koer: npx tsx scripts/partner-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/partner/partner-dashboard.tsx', 'utf8')

eq('sagstitel ombrydes', src.includes('font-medium text-gray-900 break-words min-w-0') && src.includes('{c.title}'), true)
eq('dokument ombrydes', src.includes('text-sm font-medium text-gray-900 break-words') && src.includes('{doc.title || doc.file_name}'), true)
eq('intet truncate', src.includes('truncate'), false)
eq('beskrivelse ombrydes', src.includes('data-testid="partner-case-description"') && src.includes('{c.description}') && !src.includes('line-clamp-2'), true)
eq('sagsnummer bliver', src.includes('{c.case_number}'), true)
eq('download bliver', src.includes('/api/partner/documents?token='), true)
eq('tom sagsliste bliver', src.includes('Ingen sager fundet'), true)
eq('tom dokumentliste bliver', src.includes('Ingen dokumenter tilgængelige'), true)

console.log(fail ? `\n${fail} fejl` : '\npartner-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
