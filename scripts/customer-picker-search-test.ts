/** Kundevaelgeren siger naar soegningen fejler. Et aegte tomt match bliver. Koer: npx tsx scripts/customer-picker-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/customer-picker.tsx', 'utf8')
eq('banner', src.includes('data-testid="customer-picker-search-error"') && src.includes('Det tælles ikke som ingen kunder.'), true)
eq('samme soegning bliver', src.includes('resultsQuery.current === term') && src.includes('De tidligere forslag bliver.'), true)
eq('andet soegning ryddes', src.includes('setResults([])'), true)
eq('aegte traef bliver', src.includes('setResults(r.data ?? [])'), true)
eq('tom liste kraever ingen fejl', src.includes('!searchError && results.length === 0') && src.includes('Ingen kunder fundet'), true)
eq('navn ombrydes', src.includes('flex-1 text-left break-words min-w-0'), true)
eq('fjern bliver', src.includes('aria-label="Fjern kunde"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-picker-search-test OK')
process.exitCode = fail ? 1 : 0
