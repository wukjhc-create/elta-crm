/** Global søgning viser to linjer af titel og underlinje. Navigation bliver. Koer: npx tsx scripts/global-search-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/layout/global-search.tsx', 'utf8')

eq('titel ombrydes', src.includes('font-medium text-sm break-words line-clamp-2" title={result.title}'), true)
eq('underlinje ombrydes', src.includes('text-xs text-gray-500 break-words line-clamp-2" title={result.subtitle}'), true)
eq('titel klippes ikke paa en linje', src.includes('font-medium text-sm truncate'), false)
eq('navigation bliver', src.includes('navigateToResult(result)'), true)
eq('tom soegning bliver', src.includes('Ingen resultater for'), true)
eq('ryd har et navn', src.includes('aria-label="Ryd søgning"'), true)

console.log(fail ? `\n${fail} fejl` : '\nglobal-search-wrap-test OK')
process.exitCode = fail ? 1 : 0
