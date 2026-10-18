/**
 * Prishistorik-rækken ombrydes. Datoformat og beløb er uændret.
 *   npx tsx scripts/materials-history-row-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="materials-history-row"')
const end = view.indexOf('history.change_reason', start)
const row = start >= 0 && end > start ? view.slice(start - 180, end + 160) : ''
ok(row.includes('data-testid="materials-history-row"'), 'rækken kan findes')
ok(row.includes('flex flex-wrap') && row.includes('min-w-0'), 'rækken ombrydes')
ok(!row.includes('flex items-center justify-between p-2 bg-gray-50 rounded text-sm"'), 'rækken er ikke én fast linje')
ok(row.includes('storedHistoryDate(history.effective_from)'), 'datoen er uændret')
ok(row.includes("formatCurrency(history.cost_price, 'DKK', 2)"), 'kostbeløbet er uændret')
ok(row.includes("formatCurrency(history.sale_price, 'DKK', 2)"), 'salgsbeløbet er uændret')
ok(!row.includes('truncate'), 'rækken klippes ikke')
ok(view.includes('Ingen prisændringer registreret'), 'tom liste er uændret')

const helper = readFileSync(join('src', 'lib', 'materials', 'latest-stored-history-date.ts'), 'utf8')
ok(helper.includes("timeZone: 'Europe/Copenhagen'"), 'datoformatet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-history-row-wrap-test')
