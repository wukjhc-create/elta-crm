/**
 * Fejlkoden på prissætning ombrydes. {error.digest} er uændret.
 *   npx tsx scripts/pricing-error-digest-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'error.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-error-digest"')
const row = at >= 0 ? view.slice(at - 160, at + 100) : ''
ok(row.includes('break-words min-w-0'), 'koden ombrydes')
ok(row.includes('Fejlkode: {error.digest}'), 'teksten er uændret')
ok(view.includes('{error.digest && ('), 'vises kun med kode')
ok(view.includes('onClick={reset}'), 'reset bliver')
ok(view.includes('data-testid="pricing-error-body"'), 'fejlteksten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-error-digest-wrap-test')
