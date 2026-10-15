/** AI-projektets bygningsinformation ombrydes. Vaerdierne bliver. Koer: npx tsx scripts/ai-building-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const start = src.indexOf('>Bygningsinformation</h4>')
const end = src.indexOf('>Elpunkter</h4>', start)
const block = src.slice(start, end)
const points = src.slice(end, src.indexOf('Kompleksitetsfaktorer', end))
eq('blokken findes', start > 0 && end > start, true)
eq('type ombrydes', block.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), true)
eq('stoerrelse ombrydes', block.includes('break-words">{result.interpretation.building_size_m2 || \'Ukendt\'} m²'), true)
eq('alder ombrydes', block.includes('font-medium min-w-0 break-words">{result.interpretation.building_age_years'), true)
eq('kompleksitet ombrydes', block.includes('break-words">{getComplexityLabel(result.interpretation.complexity_score)}'), true)
eq('stoerrelse bliver', block.includes("result.interpretation.building_size_m2 || 'Ukendt'"), true)
eq('alder bliver', block.includes('result.interpretation.building_age_years ? `~${result.interpretation.building_age_years} år` : \'Ukendt\''), true)
eq('punktnavn ombrydes', points.includes('break-words">{getPointTypeName(key)}'), true)
eq('punktantal bliver', points.includes('{value} stk'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nai-building-wrap-test OK')
process.exitCode = fail ? 1 : 0
