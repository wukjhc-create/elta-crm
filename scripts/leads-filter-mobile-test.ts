/** Lead-filtre ombrydes og har navne. Koer: npx tsx scripts/leads-filter-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/leads-page-client.tsx', 'utf8')
const filterStart = src.indexOf('{/* Filters */}')
const filters = src.slice(filterStart, src.indexOf("viewMode === 'table'", filterStart))

eq('overskriften ombrydes', src.includes('flex flex-wrap items-center justify-between gap-3'), true)
eq('soegning ombrydes', filters.includes('flex-1 flex flex-wrap gap-2'), true)
eq('aktive filtre ombrydes', filters.includes('flex flex-wrap items-center gap-2 mt-3 pt-3 border-t'), true)
eq('soegning har et navn', filters.includes('aria-label="Søg leads"'), true)
eq('status har et navn', filters.includes('aria-label="Status"'), true)
eq('kilde har et navn', filters.includes('aria-label="Kilde"'), true)
eq('status kan ryddes med navn', filters.includes('aria-label="Ryd status"'), true)
eq('kilde kan ryddes med navn', filters.includes('aria-label="Ryd kilde"'), true)
eq('ryd alle bliver', filters.includes('Ryd alle'), true)
eq('kun mine bliver', filters.includes('Kun mine'), true)

console.log(fail ? `\n${fail} fejl` : '\nleads-filter-mobile-test OK')
process.exitCode = fail ? 1 : 0
