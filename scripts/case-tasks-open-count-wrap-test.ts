/**
 * "X af Y udestår" på sagens opgaver ombrydes. Tællingen er uændret.
 *   npx tsx scripts/case-tasks-open-count-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const at = view.indexOf('data-testid="case-tasks-open-count"')
const row = at >= 0 ? view.slice(at - 70, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'tællingen ombrydes')
ok(row.includes('{openCount} af {tasks.length} udestår'), 'tællingen er uændret')
ok(view.includes("tasks.filter((t) => t.status !== 'done').length"), 'åbne opgaver tælles stadig')
ok(view.includes('data-testid="case-tasks-empty-title"'), 'den tomme overskrift bliver')
ok(view.includes('>Ingen opgaver endnu<'), 'den tomme tekst er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'tællingen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-tasks-open-count-wrap-test')
