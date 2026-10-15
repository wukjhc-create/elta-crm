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
eq('soegning har et navn', filters.includes('aria-label="Søg i opgaver"'), true)
eq('status har et navn', filters.includes('aria-label="Status"'), true)
eq('prioritet har et navn', filters.includes('aria-label="Prioritet"'), true)
eq('ansvarlig har et navn', filters.includes('aria-label="Ansvarlig"'), true)
const dialog = src.slice(src.indexOf('id="task-dialog-title"'))
eq('titel har et navn', dialog.includes('aria-label="Titel"'), true)
eq('kunde har et navn', dialog.includes('aria-label="Kunde"'), true)
eq('forfald har et navn', dialog.includes('aria-label="Forfaldsdato"'), true)
eq('formular stables paa mobil', dialog.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('opret bliver', src.includes("isEditing ? 'Gem ændringer' : 'Opret opgave'"), true)
eq('panelet kan rulles', src.includes('w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto'), true)
eq('titel ombrydes', dialog.includes('text-lg font-semibold break-words min-w-0'), true)
eq('kunde-fejl ombrydes', dialog.includes('text-xs text-red-700 break-words') && dialog.includes('data-testid="task-customer-load-error"'), true)
eq('fod kan ombrydes', dialog.includes('flex flex-wrap items-center justify-end gap-3'), true)
eq('luk har et navn', dialog.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\ntasks-filter-mobile-test OK')
process.exitCode = fail ? 1 : 0
