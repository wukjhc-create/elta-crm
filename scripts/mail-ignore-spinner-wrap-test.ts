/**
 * Ignorer-spinneren i mail-detaljen kan krympe. Teksten Ignorer bliver.
 * De andre spinner-ikoner bliver.
 *   npx tsx scripts/mail-ignore-spinner-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const id = 'data-testid="mail-ignore-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-4 h-4 animate-spin" />'
const cell = '<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="mail-ignore-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Ignor'), 'teksten er et andet sted')
ok(!row.includes('pendingAction'), 'betingelsen er et andet sted')
ok(!row.includes('archive'), 'arkiv er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'ingen bar w-4-spinner bliver')
ok(view.includes('Ignorér'), 'teksten bliver')
ok(view.includes("pendingAction === 'ignore'"), 'ignorer-betingelsen bliver')
ok(view.includes("pendingAction === 'archive'"), 'arkiv-betingelsen bliver')
ok(view.includes("pendingAction === 'restore'"), 'relevant-betingelsen bliver')
const ignoreAt = view.indexOf("pendingAction === 'ignore'")
const archiveAt = view.indexOf("pendingAction === 'archive'")
const restoreAt = view.indexOf("pendingAction === 'restore'")
const ignoreSlice = ignoreAt >= 0 ? view.slice(ignoreAt, ignoreAt + 220) : ''
const archiveSlice = archiveAt >= 0 ? view.slice(archiveAt, archiveAt + 220) : ''
const restoreSlice = restoreAt >= 0 ? view.slice(restoreAt, restoreAt + 220) : ''
ok(ignoreSlice.includes(id), 'spinneren er ved ignorer')
ok(!ignoreSlice.includes(bare), 'ignorer-spinneren er ikke bar')
ok(archiveSlice.includes('data-testid="mail-archive-spinner"'), 'arkiv-spinneren bliver')
ok(archiveSlice.includes(bare) === false, 'arkiv-spinneren er ikke bar')
ok(!archiveSlice.includes(id), 'ignorer-spinneren er et andet sted')
ok(!restoreSlice.includes(bare), 'relevant-spinneren er ikke bar')
ok(restoreSlice.includes('data-testid="mail-restore-spinner"'), 'relevant-spinneren kan krympe')
ok(!restoreSlice.includes(id), 'ignorer-spinneren er ikke ved relevant')
ok(view.includes('data-testid="mail-ignore-icon"'), 'ignorer-ikonet bliver')
ok(view.includes('data-testid="mail-ignore-button"'), 'ignorer-knappen bliver')
ok(view.split('data-testid="mail-ignore-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-ignore-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-archive-spinner"').length === 2, 'arkiv-id kolliderer ikke')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-ignore-spinner-wrap-test')
