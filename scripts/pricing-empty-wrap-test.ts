/**
 * Den tomme tekst på prissiden ombrydes. Sætningerne i EmptyState-kaldene er uændret.
 *   npx tsx scripts/pricing-empty-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-empty-text"')
const row = at >= 0 ? view.slice(at - 80, at + 50) : ''
ok(row.includes('break-words min-w-0'), 'den tomme tekst ombrydes')
ok(row.includes('>{message}<'), 'teksten kommer stadig fra message')
ok(view.includes('Ingen prisadvarsler i den valgte periode'), 'tom advarsel bliver')
ok(view.includes('Ingen tilbud er påvirket af nylige prisændringer'), 'tomt tilbud bliver')
ok(view.includes('Ingen leverandørstatistik tilgængelig'), 'tom statistik bliver')
ok(view.includes('Vælg en leverandør for at se pristendenser'), 'vælg leverandør bliver')
ok(view.includes('Ingen pristendenser fundet for denne leverandør'), 'tomme tendenser bliver')
ok(view.includes('>Indlæser data...<'), 'indlæserteksten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-empty-wrap-test')
