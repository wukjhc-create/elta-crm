/**
 * Fragt- og gebyrmærket på linjen ombrydes. Ordene Fragt og Gebyr er uændret.
 *   npx tsx scripts/invoice-control-charge-mark-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chargeLabelText } from '../src/lib/invoice-control/charge-label'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-charge-mark"')
const row = at >= 0 ? view.slice(at - 220, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'mærket kan ombrydes')
ok(row.includes('>{text}</span>'), 'teksten kommer fra chargeLabelText')
ok(view.includes('const text = chargeLabelText(chargeLabel(description))'), 'mærket bruger den shippede tekst')
ok(view.includes('if (!text) return null'), 'uden mærke vises intet')
ok(chargeLabelText('fragt') === 'Fragt', 'Fragt er uændret')
ok(chargeLabelText('gebyr') === 'Gebyr', 'Gebyr er uændret')
ok(chargeLabelText(null) === null, 'uden slags bliver null')
ok((view.match(/<ChargeMark description=\{l\.description\} \/>/g) ?? []).length === 2, 'begge linjer markerer')
ok(view.includes('data-testid="invoice-control-charges"'), 'fragtnoten bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'mærket klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-charge-mark-wrap-test')
