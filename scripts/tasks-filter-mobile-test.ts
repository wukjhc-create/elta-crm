/** Opgavefiltre og noegletal ombrydes. Et filter uden traef kan ryddes. Koer: npx tsx scripts/tasks-filter-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')
const filters = src.slice(src.indexOf('{/* Filters */}'), src.indexOf('{/* Task list */}'))

eq('filtre ombrydes', filters.includes('flex flex-wrap items-center gap-2 w-full sm:w-auto'), true)
eq('valg fylder bredden paa mobil', filters.includes('w-full sm:w-auto px-3 py-2'), true)
eq('noegletal er to kolonner', src.includes('grid grid-cols-2 sm:grid-cols-4'), true)
eq('filter uden traef kan ryddes', src.includes('Ingen opgaver matcher filteret') && src.includes('data-testid="tasks-clear-filters"'), true)
eq('tom liste uden filter er den samme', src.includes('Ingen opgaver fundet') && src.includes('Klik "Ny opgave" for at oprette en'), true)

console.log(fail ? `\n${fail} fejl` : '\ntasks-filter-mobile-test OK')
process.exitCode = fail ? 1 : 0
