/**
 * Ledelsesoversigten siger hvor mange sager i filtret har advarsel.
 *   npx tsx scripts/aftercalc-warning-count-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selectOverviewPage, type AftercalcOverviewItem } from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

function item(n: string, quality: 'ok' | 'warning', warnings: AftercalcOverviewItem['row']['warning_codes']): AftercalcOverviewItem {
  return {
    actual_db: 1,
    row: {
      case_id: n, case_number: n, title: n, customer_name: null, assignee_name: null, status: 'closed',
      created_at: '2026-10-01T00:00:00Z', quoted_revenue: 1, actual_revenue: 1, quoted_db_pct: 1, actual_db_pct: 1,
      db_variance: 1, db_variance_pct_points: null, data_quality: quality, warning_codes: warnings, invoiced_state: 'fully_invoiced',
    },
  }
}

const page = selectOverviewPage([
  item('A', 'warning', ['open_work']),
  item('B', 'warning', ['missing_cost_price']),
  item('C', 'ok', []),
], { page: 1 })
ok(page.quality.warning === 2 && page.quality.missingCost === 1 && page.quality.cases === 3, 'advarsel er ikke det samme som manglende kost', JSON.stringify(page.quality))

const client = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
ok(client.includes('{data.quality.warning} har datakvalitet advarsel.'), 'oversigten viser advarselstallet')
ok(client.includes('DB kan ikke beregnes for {data.quality.dbUnknown}.'), 'den ukendte DB står der stadig')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-warning-count-test')
