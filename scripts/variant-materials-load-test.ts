/** Variant-materialer siger naar listen ikke kan hentes. Et aegte tomt svar bliver. Koer: npx tsx scripts/variant-materials-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/components/[id]/page.tsx', 'utf8')
eq('fejl gemmes', page.includes("vmResult.error || 'Kunne ikke hente variant-materialer'"), true)
eq('aegte liste bliver', page.includes('variantMaterialsMap[variant.id] = vmResult.data ?? []'), true)
eq('komponent ukendt bliver', page.includes("result.error !== 'Komponenten blev ikke fundet'") && page.includes('notFound()'), true)

const view = fs.readFileSync('src/app/dashboard/settings/components/[id]/component-detail-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="variant-materials-load-error"') && view.includes('Det tælles ikke som ingen materialer.'), true)
eq('tom ekstra bliver', view.includes('Ingen ekstra materialer. Tilføj et, hvis varianten skal bruge noget ud over basis.'), true)
eq('tom basis bliver', view.includes('Ingen materialer endnu. Tilføj et basismateriale, hvis komponenten altid bruger det.'), true)
eq('pris bliver', view.includes('formatCurrency(material.cost_price ?? 0)') && view.includes('formatCurrency(material.sale_price ?? 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\nvariant-materials-load-test OK')
process.exitCode = fail ? 1 : 0
