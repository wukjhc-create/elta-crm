/** Revisionsloggens filtre kan krympe. Soegning og forhaandsvisning bliver. Koer: npx tsx scripts/audit-filter-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/audit/audit-client.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0'), true)
eq('dato kan krympe', src.includes('type="date"') && src.includes('w-full min-w-0 max-w-full rounded-md border border-gray-300 px-3 py-2 text-sm'), true)
eq('fra bliver', src.includes('Fra dato') && src.includes('filters.from_date'), true)
eq('til bliver', src.includes('Til dato') && src.includes('filters.to_date'), true)
eq('fejl bliver', src.includes('data-testid="audit-load-error"') && src.includes('Det tælles ikke som ingen poster.'), true)
eq('forhaandsvisning bliver', src.includes('entry.action_description.slice(0, 40)'), true)

console.log(fail ? `\n${fail} fejl` : '\naudit-filter-mobile-test OK')
process.exitCode = fail ? 1 : 0
