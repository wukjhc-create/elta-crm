/**
 * Den tomme kundeliste "Ingen opgaver endnu" ombrydes. Sætningerne er uændret.
 *   npx tsx scripts/customer-tasks-empty-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const start = view.indexOf('data-testid="customer-tasks-empty"')
const end = view.indexOf('activeTasks.map', start)
const empty = start >= 0 && end > start ? view.slice(start, end) : ''
const titleAt = empty.indexOf('data-testid="customer-tasks-empty-title"')
const title = titleAt >= 0 ? empty.slice(titleAt - 70, titleAt + 80) : ''
ok(title.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(title.includes('>Ingen opgaver endnu<'), 'overskriften er uændret')
const hintAt = empty.indexOf('data-testid="customer-tasks-empty-hint"')
const hint = hintAt >= 0 ? empty.slice(hintAt - 70, hintAt + 120) : ''
ok(hint.includes('break-words min-w-0'), 'forklaringen ombrydes')
ok(hint.includes('>Opret en opgave, hvis der skal følges op på kunden.<'), 'forklaringen er uændret')
ok(empty.includes('setShowForm(true)') && empty.includes('setEditingTask(null)'), 'knappen åbner den samme form')
ok(view.includes('Ingen åbne opgaver. Udførte ligger nedenfor.'), 'kun udførte siges stadig')
ok(!title.includes(' truncate') && !title.includes('truncate ') && !hint.includes(' truncate') && !hint.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-tasks-empty-wrap-test')
