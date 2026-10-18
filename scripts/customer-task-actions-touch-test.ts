/**
 * Knapperne Rediger og Slet på kundens opgave kan rammes med 44 px. aria-label er uændret.
 *   npx tsx scripts/customer-task-actions-touch-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const editAt = view.indexOf('data-testid="customer-task-edit"')
const edit = editAt >= 0 ? view.slice(editAt - 220, editAt + 40) : ''
ok(edit.includes('min-h-[44px] min-w-[44px]'), 'rediger kan rammes')
ok(edit.includes('aria-label="Rediger opgave"'), 'rediger-navnet er uændret')
ok(edit.includes('onClick={onEdit}'), 'rediger aabner stadig')

const delAt = view.indexOf('data-testid="customer-task-delete"')
const del = delAt >= 0 ? view.slice(delAt - 220, delAt + 40) : ''
ok(del.includes('min-h-[44px] min-w-[44px]'), 'slet kan rammes')
ok(del.includes('aria-label="Slet opgave"'), 'slet-navnet er uændret')
ok(del.includes('onClick={onDelete}'), 'slet kalder stadig')
ok(view.includes('Marker som udført'), 'udfoert-navnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-actions-touch-test')
