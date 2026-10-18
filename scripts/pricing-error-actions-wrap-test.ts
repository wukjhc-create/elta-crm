/**
 * Knapperne Prøv igen og Dashboard på prisfejlen ombrydes.
 * reset og linket er uændret.
 *   npx tsx scripts/pricing-error-actions-wrap-test.ts
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
const retryAt = view.indexOf('data-testid="pricing-error-retry"')
const retry = retryAt >= 0 ? view.slice(retryAt - 240, retryAt + 140) : ''
ok(retry.includes('break-words min-w-0'), 'prov igen ombrydes')
ok(retry.includes('Prøv igen'), 'prov igen bliver')
ok(retry.includes('onClick={reset}'), 'reset bliver')

const homeAt = view.indexOf('data-testid="pricing-error-home"')
const home = homeAt >= 0 ? view.slice(homeAt - 240, homeAt + 140) : ''
ok(home.includes('break-words min-w-0'), 'dashboard ombrydes')
ok(home.includes('Dashboard'), 'dashboard bliver')
ok(home.includes('href="/dashboard"'), 'linket bliver')
ok(view.includes('data-testid="pricing-error-digest"'), 'fejlkoden bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-error-actions-wrap-test')
