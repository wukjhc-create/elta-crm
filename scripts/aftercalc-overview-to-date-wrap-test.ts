/**
 * Etiketten Til dato paa efterkalkulation kan krympe. Datoen og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-to-date-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const id = '>Til dato</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Til dato')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.to'), 'datoen er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 5, 'de andre etiketter beholder den bare klasse')
ok(view.includes('<span className="text-xs text-gray-500">Ansvarlig</span>'), 'ansvarlig-etiketten bliver')
ok(view.includes("value={filters.to ?? ''}"), 'til-filteret bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const fra = '>Fra dato</span>'
const fat = view.indexOf(fra)
const frow = fat >= 0 ? view.slice(fat - 59, fat + 10) : ''
ok(frow.startsWith('<span'), 'fra-datoens vindue bliver')
ok(frow.includes('break-words min-w-0'), 'fra-datoen kan stadig krympe')
ok(!frow.includes('Til dato'), 'fra-datoen er ikke til-dato')
ok(!frow.includes('\n'), 'fra-datoens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-to-date-wrap-test')
