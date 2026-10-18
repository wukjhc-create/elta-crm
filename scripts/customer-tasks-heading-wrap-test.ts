/**
 * Overskriften "Opgaver" og knappen "Ny opgave" på kundekortet ombrydes. Ordene er uændret.
 *   npx tsx scripts/customer-tasks-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')

const headingAt = view.indexOf('data-testid="customer-tasks-heading"')
const heading = headingAt >= 0 ? view.slice(headingAt - 80, headingAt + 55) : ''
ok(heading.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(heading.includes('>Opgaver<'), 'overskriften er uændret')

const checkButton = (id: string) => {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 240, at + 140) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes('Ny opgave'), `${id} siger Ny opgave`)
  ok(row.includes('setShowForm(true)') && row.includes('setEditingTask(null)'), `${id} åbner den samme form`)
  ok(!row.includes(' truncate') && !row.includes('truncate '), `${id} klippes ikke`)
}

checkButton('customer-tasks-new')
checkButton('customer-tasks-empty-new')
ok(view.includes("{task ? 'Rediger opgave' : 'Ny opgave'}"), 'dialogen er uændret')
ok(!heading.includes(' truncate') && !heading.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-tasks-heading-wrap-test')
