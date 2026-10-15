/** Materialekataloget siger naar listen ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/materials-catalog-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/materials/page.tsx', 'utf8')
eq('siden sender fejl', page.includes("result.success ? null : result.error || 'Kunne ikke hente materialer'"), true)
eq('aegte liste bliver', page.includes('result.success && result.data ? result.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/materials/materials-catalog-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="materials-catalog-load-error"') && view.includes('Det tælles ikke som ingen materialer.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('filteredMaterials.length === 0 && !showCreateForm'), true)
eq('aegte tom bliver', view.includes('Ingen materialer i kataloget'), true)
eq('soegning bliver', view.includes('Ingen materialer matcher søgningen'), true)
eq('soegningshjaelp bliver', view.includes('Prøv en anden søgning'), true)
eq('prishistorik bliver', view.includes('Ingen prisændringer registreret'), true)
eq('pris bliver', view.includes('formatCurrency'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-catalog-load-test OK')
process.exitCode = fail ? 1 : 0
