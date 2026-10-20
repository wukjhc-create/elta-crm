/** Revisionsloggen siger naar den ikke kan hentes. En aekte tom log bliver. Koer: npx tsx scripts/audit-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/audit/audit-client.tsx', 'utf8')
const start = src.indexOf('const loadData = useCallback')
const fn = src.slice(start, src.indexOf('}, [filters])', start))
eq('funktionen findes', start > 0, true)
eq('success saetter listen', fn.includes('setEntries(result.data.data)'), true)
eq('success rydder fejl', fn.includes('setLoadError(null)'), true)
eq('fejl teksten', fn.includes("setLoadError(result.error || 'Kunne ikke hente audit logs')"), true)
eq('fejl viser ikke det forrige filter', fn.includes('setEntries([])'), true)
eq('antal er ikke 0', src.includes('Det tælles ikke som 0 poster.'), true)
eq('banner', src.includes('data-testid="audit-load-error"') && src.includes('Det tælles ikke som ingen poster.'), true)
eq('tom liste kraever ingen fejl', src.includes('loadError ? (') && src.includes('entries.length === 0'), true)
eq('aegte tom bliver', src.includes('Ingen poster fundet'), true)
eq('filtertekst bliver', src.includes('Prøv at justere dine filtre'), true)
eq('tom uden filter bliver', src.includes('Der er endnu ingen audit log poster'), true)
eq('forhaandsvisning bliver paa 40 tegn', src.includes('entry.action_description.slice(0, 40)'), true)

console.log(fail ? `\n${fail} fejl` : '\naudit-load-test OK')
process.exitCode = fail ? 1 : 0
