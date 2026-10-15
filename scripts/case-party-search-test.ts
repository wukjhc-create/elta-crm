/** Sagspartnere siger naar soegningen fejler. Et aegte tomt match bliver. Koer: npx tsx scripts/case-party-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/edit-service-case-parties-dialog.tsx', 'utf8')
eq('banner', src.includes('data-testid="case-party-search-error"') && src.includes('Det tælles ikke som ingen kunder.'), true)
eq('samme soegning bliver', src.includes('resultsQuery.current === term') && src.includes('De tidligere forslag bliver.'), true)
eq('andet soegning ryddes', src.includes('setResults([])'), true)
eq('aegte traef bliver', src.includes('setResults(res.results)'), true)
eq('tom liste kraever ingen fejl', src.includes('!searchError && results.length === 0') && src.includes('Ingen resultater'), true)
eq('navn', src.includes('aria-label="Søg kunde til sagen"') && src.includes('placeholder="Soeg firmanavn, kundenr, email…"'), true)
eq('soegning bliver', src.includes('searchCustomersForSite(term)'), true)
eq('fritekst bliver', src.includes('placeholder={`Fx "Direkte", "Bilka"`}'), true)
eq('fire steder', src.split('searchError={searchError}').length - 1, 4)

console.log(fail ? `\n${fail} fejl` : '\ncase-party-search-test OK')
process.exitCode = fail ? 1 : 0
