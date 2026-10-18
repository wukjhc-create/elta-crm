/**
 * Filtreret datakvalitet i efterkalk-oversigten. Ingen DB.
 *   npx tsx scripts/aftercalc-quality-summary-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  selectOverviewPage,
  summarizeAftercalcQuality,
  type AftercalcOverviewItem,
  type AftercalcOverviewRow,
} from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

function row(
  n: string,
  variance: number | null,
  quality: 'ok' | 'warning',
  warnings: AftercalcOverviewRow['warning_codes'],
): AftercalcOverviewItem {
  return {
    actual_db: variance,
    row: {
      case_id: n,
      case_number: n,
      title: n,
      customer_name: null,
      assignee_name: null,
      status: 'closed',
      created_at: '2026-10-01T00:00:00Z',
      quoted_revenue: 100,
      actual_revenue: 100,
      quoted_db_pct: 10,
      actual_db_pct: variance,
      db_variance: variance,
      db_variance_pct_points: null,
      data_quality: quality,
      warning_codes: warnings,
      invoiced_state: 'fully_invoiced',
    },
  }
}

const empty = summarizeAftercalcQuality([])
ok(empty.cases === 0 && empty.missingCost === 0 && empty.dbUnknown === 0 && empty.warning === 0, 'tom liste er 0, ikke en fejl')

const direct = summarizeAftercalcQuality([
  row('A', -1, 'warning', ['missing_cost_price']).row,
  row('B', null, 'ok', []).row,
])
ok(direct.cases === 2 && direct.missingCost === 1 && direct.dbUnknown === 1 && direct.warning === 1, 'taeller koder, null-DB og advarsel hver for sig')

const items: AftercalcOverviewItem[] = [
  row('S1', -500, 'warning', ['missing_cost_price']),
  row('S2', 200, 'ok', []),
  row('S3', null, 'warning', ['open_work']),
  row('S4', null, 'warning', ['missing_frozen_labour_cost']),
  row('S5', 10, 'warning', ['offer_without_cost_basis']),
  row('S6', 1, 'ok', ['missing_cost_price']),
]
for (let i = 0; i < 25; i++) items.push(row(`P${String(i).padStart(2, '0')}`, 0, 'ok', []))

const all = selectOverviewPage(items, { sort: 'newest', page: 1 })
ok(all.rows.length === 25 && all.total === 31, 'side 1 viser 25 af 31')
ok(all.quality.cases === 31 && all.quality.missingCost === 4 && all.quality.dbUnknown === 2 && all.quality.warning === 4, 'kvalitet er hele filtret, ikke siden', JSON.stringify(all.quality))

const page2 = selectOverviewPage(items, { sort: 'newest', page: 2 })
ok(page2.rows.length === 6 && page2.quality.cases === 31 && page2.quality.missingCost === 4 && page2.quality.dbUnknown === 2, 'side 2 beholder det fulde filtrerede tal')

const onlyMissing = selectOverviewPage(items, { missingCostOnly: true })
ok(onlyMissing.total === 4 && onlyMissing.quality.cases === 4 && onlyMissing.quality.missingCost === 4 && onlyMissing.quality.dbUnknown === 1 && onlyMissing.quality.warning === 3, 'kun manglende kost taelles paa det filtrerede saet', JSON.stringify(onlyMissing.quality))

const negative = selectOverviewPage(items, { variance: 'negative' })
ok(negative.quality.cases === 1 && negative.quality.missingCost === 1 && negative.quality.dbUnknown === 0 && negative.rows[0].case_number === 'S1', 'negativ afvigelse udelader ukendt DB')

const agreed = summarizeAftercalcQuality(items.map((item) => item.row))
ok(agreed.cases === all.quality.cases && agreed.missingCost === all.quality.missingCost && agreed.dbUnknown === all.quality.dbUnknown && agreed.warning === all.quality.warning, 'selectOverviewPage og summarizeAftercalcQuality er enige')

const client = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
ok(client.includes('data-testid="aftercalc-quality-summary"'), 'oversigten har kvalitetslinjen')
ok(client.includes('{data.quality.missingCost} af {data.quality.cases} sager i filtret mangler kost. DB kan ikke beregnes for {data.quality.dbUnknown}.'), 'linjen bruger de filtrerede tal')
ok(client.includes("if (amount == null) return 'Kan ikke beregnes'"), 'varianceText er uændret')

const action = readFileSync(join('src', 'lib', 'actions', 'case-aftercalc.ts'), 'utf8')
ok(action.includes('quality: summarizeAftercalcQuality([])'), 'tom succes har kvalitet 0')

const overview = readFileSync(join('src', 'lib', 'cases', 'aftercalc-overview.ts'), 'utf8')
ok(overview.includes('const quality = summarizeAftercalcQuality(list.map((item) => item.row))'), 'kvalitet regnes før siden skæres')
const qualityAt = overview.indexOf('const quality = summarizeAftercalcQuality')
const sliceAt = overview.indexOf('list.slice(start, start + AFTERCALC_PAGE_SIZE)')
ok(qualityAt > 0 && sliceAt > qualityAt, 'kvalitet ligger før side-snittet')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-quality-summary-test')
