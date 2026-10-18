/**
 * Knapperne Annuller og Opret på kundens opgaveformular ombrydes. Ordene er uændret.
 *   npx tsx scripts/customer-task-form-buttons-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const cancelAt = view.indexOf('data-testid="customer-task-cancel"')
const cancel = cancelAt >= 0 ? view.slice(cancelAt - 200, cancelAt + 120) : ''
ok(cancel.includes('break-words min-w-0'), 'annuller ombrydes')
ok(cancel.includes('Annuller'), 'annuller er uændret')
ok(cancel.includes('onClick={onClose}'), 'annuller lukker stadig')
ok(!cancel.includes(' truncate') && !cancel.includes('truncate '), 'annuller klippes ikke')

const saveAt = view.indexOf('data-testid="customer-task-save"')
const save = saveAt >= 0 ? view.slice(saveAt - 360, saveAt + 160) : ''
ok(save.includes('break-words min-w-0'), 'gem ombrydes')
ok(save.includes("{isSaving ? 'Gemmer...' : task ? 'Opdater' : 'Opret'}"), 'ordene er uændret')
ok(save.includes('type="submit"'), 'gem sender stadig')
ok(!save.includes(' truncate') && !save.includes('truncate '), 'gem klippes ikke')
ok(view.includes("due_date: dueDate ? new Date(dueDate).toISOString() : null"), 'forfald sender stadig iso')
ok(view.includes('data-testid="customer-task-label-title"'), 'titel-etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-form-buttons-wrap-test')
