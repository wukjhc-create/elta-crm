/** Kalkia-noder siger naar listen eller kategorierne ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/kalkia-nodes-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/page.tsx', 'utf8')
eq('siden sender listefejl', page.includes("nodesResult.success ? null : nodesResult.error || 'Kunne ikke hente noder'"), true)
eq('siden sender kategorifejl', page.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)
eq('aegte liste bliver', page.includes('nodesResult.success && nodesResult.data ? nodesResult.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/kalkia-nodes-client.tsx', 'utf8')
eq('listebanner', view.includes('data-testid="kalkia-nodes-load-error"') && view.includes('Det tælles ikke som ingen noder.'), true)
eq('antal er ikke 0', view.includes('Det tælles ikke som 0 noder.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('filteredNodes.length === 0'), true)
eq('aegte tom bliver', view.includes('Ingen noder fundet'), true)
eq('soegning bliver', view.includes('Prov en anden sogning'), true)
eq('kategoribanner', view.includes('data-testid="kalkia-categories-load-error"') && view.includes('Det tælles ikke som ingen kategorier.'), true)
eq('alle kategorier bliver', view.includes('Alle kategorier'), true)
eq('salg bliver', view.includes('formatCurrency(node.default_sale_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-nodes-load-test OK')
process.exitCode = fail ? 1 : 0
