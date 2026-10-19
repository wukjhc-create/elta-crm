/**
 * Arkiv-spinneren i mail-detaljen kan krympe. Teksten Arkiver bliver.
 * De andre spinner-ikoner bliver.
 *   npx tsx scripts/mail-archive-spinner-wrap-test.ts
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
const id = 'data-testid="mail-archive-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-4 h-4 animate-spin" />'
const cell = '<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="mail-archive-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Arkiv'), 'teksten er et andet sted')
ok(!row.includes('pendingAction'), 'betingelsen er et andet sted')
ok(!row.includes('ignore'), 'ignorer er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 3, 'de andre spinner-ikoner bliver')
ok(view.includes('Arkivér'), 'teksten bliver')
ok(view.includes("pendingAction === 'archive'"), 'arkiv-betingelsen bliver')
ok(view.includes("pendingAction === 'ignore'"), 'ignorer-betingelsen bliver')
const archiveAt = view.indexOf("pendingAction === 'archive'")
const ignoreAt = view.indexOf("pendingAction === 'ignore'")
const archiveSlice = archiveAt >= 0 ? view.slice(archiveAt, archiveAt + 220) : ''
const ignoreSlice = ignoreAt >= 0 ? view.slice(ignoreAt, ignoreAt + 220) : ''
ok(archiveSlice.includes(id), 'spinneren er ved arkiv')
ok(!archiveSlice.includes(bare), 'arkiv-spinneren er ikke bar')
ok(!ignoreSlice.includes(bare), 'ignorer-spinneren er ikke bar')
ok(ignoreSlice.includes('data-testid="mail-ignore-spinner"'), 'ignorer-spinneren kan krympe')
ok(!ignoreSlice.includes(id), 'arkiv-spinneren er et andet sted')
ok(view.includes('data-testid="mail-archive-icon"'), 'arkiv-ikonet bliver')
ok(view.includes('data-testid="mail-archive-button"'), 'arkiv-knappen bliver')
ok(view.split('data-testid="mail-archive-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-archive-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-archive-spinner-wrap-test')
