/** Kundekobling siger naar soegningen fejler. Et aegte tomt match bliver. Koer: npx tsx scripts/customer-link-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/mail/customer-link-dialog.tsx', 'utf8')
eq('banner', src.includes('data-testid="customer-link-search-error"') && src.includes('Det tælles ikke som ingen kunder.'), true)
eq('samme soegning bliver', src.includes('resultsQuery.current === trimmed') && src.includes('De tidligere forslag bliver.'), true)
eq('andet soegeord ryddes', src.includes('setResults([])'), true)
eq('aegte traef bliver', src.includes('setResults((data || []) as CustomerRow[])'), true)
eq('tom liste kraever ingen fejl', src.includes('orderedResults.length === 0 && !loading ?') && src.includes('Ingen kunder fundet.'), true)
eq('match bliver', src.includes('Match på afsender'), true)
eq('fejl ombrydes', src.includes('break-words min-w-0">{error}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-link-search-test OK')
process.exitCode = fail ? 1 : 0
