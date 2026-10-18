/**
 * Den tomme sagsliste "Ingen opgaver endnu" ombrydes. Sætningerne er uændret.
 *   npx tsx scripts/case-tasks-empty-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const titleAt = view.indexOf('data-testid="case-tasks-empty-title"')
const title = titleAt >= 0 ? view.slice(titleAt - 80, titleAt + 70) : ''
ok(title.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(title.includes('>Ingen opgaver endnu<'), 'overskriften er uændret')
const hintAt = view.indexOf('data-testid="case-tasks-empty-hint"')
const hint = hintAt >= 0 ? view.slice(hintAt - 90, hintAt + 140) : ''
ok(hint.includes('break-words min-w-0'), 'forklaringen ombrydes')
ok(hint.includes('Når en sag oprettes fra et tilbud, får den automatisk en opstartstjekliste her.'), 'forklaringen er uændret')
ok(view.includes('error && tasks.length === 0'), 'fejlen skjuler stadig den tomme tekst')
ok(view.includes('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.'), 'fejlteksten er uændret')
ok(!title.includes(' truncate') && !title.includes('truncate ') && !hint.includes(' truncate') && !hint.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-tasks-empty-wrap-test')
