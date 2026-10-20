/** Tilbuds-parter og leveringskunde siger naar soegningen fejler. Et aegte tomt match bliver. Koer: npx tsx scripts/party-search-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const parties = fs.readFileSync('src/components/modules/offers/edit-offer-parties-dialog.tsx', 'utf8')
const site = fs.readFileSync('src/components/modules/orders/edit-site-info-dialog.tsx', 'utf8')

eq('parter banner', parties.includes('data-testid="offer-party-search-error"') && parties.includes('Det tælles ikke som ingen kunder.'), true)
eq('parter samme soegning bliver', parties.includes('resultsQuery.current === term') && parties.includes('De tidligere forslag bliver.'), true)
eq('parter andet soegning ryddes', parties.includes('setResults([])'), true)
eq('parter aegte traef bliver', parties.includes('setResults(res.results)'), true)
eq('parter tom liste kraever ingen fejl', parties.includes('!searchError && results.length === 0') && parties.includes('Ingen resultater'), true)
eq('parter navn bliver', parties.includes('aria-label="Søg kunde til tilbuddet"'), true)

eq('levering banner', site.includes('data-testid="site-customer-search-error"') && site.includes('Det tælles ikke som ingen kunder.'), true)
eq('levering samme soegning bliver', site.includes('customerResultsQuery.current === term') && site.includes('De tidligere forslag bliver.'), true)
eq('levering andet soegning ryddes', site.includes('setCustomerResults([])'), true)
eq('levering aegte traef bliver', site.includes('setCustomerResults(res.results)'), true)
eq('levering tom liste kraever ingen fejl', site.includes('!customerSearchError && customerResults.length === 0') && site.includes('Ingen resultater'), true)
eq('levering navn bliver', site.includes('aria-label="Søg leveringskunde"'), true)
eq('soegning bliver searchCustomersForSite', parties.includes('searchCustomersForSite(term)') && site.includes('searchCustomersForSite(term)'), true)

console.log(fail ? `\n${fail} fejl` : '\nparty-search-load-test OK')
process.exitCode = fail ? 1 : 0
