/** Komponentlisten siger naar den eller kategorierne ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/components-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/components/page.tsx', 'utf8')
eq('siden sender listefejl', page.includes("componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'"), true)
eq('siden sender kategorifejl', page.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)
eq('aegte liste bliver', page.includes('componentsResult.success && componentsResult.data ? componentsResult.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/components/components-client.tsx', 'utf8')
eq('listebanner', view.includes('data-testid="components-load-error"') && view.includes('Det tælles ikke som ingen komponenter.'), true)
eq('antal er ikke 0', view.includes('Det tælles ikke som 0 komponenter.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('Object.keys(groupedComponents).length === 0'), true)
eq('aegte tom bliver', view.includes('Ingen komponenter fundet'), true)
eq('soegning bliver', view.includes('Prøv en anden søgning eller kategori.'), true)
eq('kategoribanner', view.includes('data-testid="component-categories-load-error"') && view.includes('Det tælles ikke som ingen kategorier.'), true)
eq('alle kategorier bliver', view.includes('Alle kategorier'), true)
eq('kost bliver', view.includes('formatCurrency(comp.default_cost_price || 0)'), true)
eq('salg bliver', view.includes('formatCurrency(comp.default_sale_price || 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncomponents-load-test OK')
process.exitCode = fail ? 1 : 0
