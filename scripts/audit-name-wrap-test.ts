/** Revisionsloggen ombryder navne. Udvidet beskrivelse og 40-tegns forhåndsvisning bliver. Kør: npx tsx scripts/audit-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/audit/audit-client.tsx', 'utf8')

eq('objektnavn viser to linjer', src.includes('line-clamp-2 break-words">{entry.entity_name}'), true)
eq('bruger viser to linjer', src.includes('text-sm text-gray-700 line-clamp-2 break-words'), true)
eq('forhaandsvisning bliver paa 40 tegn', src.includes('entry.action_description.slice(0, 40)'), true)
eq('udvidet beskrivelse ombrydes', src.includes('text-sm text-gray-700 break-words">{entry.action_description}'), true)
eq('tidspunkt bliver', src.includes('formatRelativeTime(entry.created_at)'), true)

console.log(fail ? `\n${fail} fejl` : '\naudit-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
