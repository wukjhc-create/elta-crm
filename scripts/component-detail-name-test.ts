/** Komponentens varianter og materialer siger hvad de rammer. Tid og pris bliver. Koer: npx tsx scripts/component-detail-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/components/[id]/component-detail-client.tsx', 'utf8')

eq('variant kan redigeres med navn', src.includes('aria-label={`Rediger variant ${variant.name}`}'), true)
eq('variant kan slettes med navn', src.includes('aria-label={`Slet variant ${variant.name}`}') && src.includes('handleDeleteVariant(variant)'), true)
eq('variant ombrydes', src.includes('flex flex-wrap items-start justify-between gap-2 p-4') && src.includes('font-medium break-words">{variant.name}'), true)
eq('ekstra materiale siger navn', src.includes('aria-label={`Fjern materiale ${vm.material_name}`}'), true)
eq('basis siger navn', src.includes('aria-label={`Rediger materiale ${material.material_name}`}') && src.includes('aria-label={`Slet materiale ${material.material_name}`}'), true)
eq('tom basis siger naeste skridt', src.includes('Ingen materialer endnu. Tilføj et basismateriale, hvis komponenten altid bruger det.'), true)
eq('tom ekstra siger naeste skridt', src.includes('Ingen ekstra materialer. Tilføj et, hvis varianten skal bruge noget ud over basis.'), true)
eq('tiden beregnes stadig', src.includes('component.base_time_minutes * variant.time_multiplier + variant.extra_minutes'), true)
eq('pris bliver', src.includes('formatCurrency(material.cost_price ?? 0)') && src.includes('formatCurrency(material.sale_price ?? 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncomponent-detail-name-test OK')
process.exitCode = fail ? 1 : 0
