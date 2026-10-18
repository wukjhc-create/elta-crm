/**
 * Efterkalk-oversigtens indledning ombrydes. Beløbsteksten er uændret.
 *   npx tsx scripts/aftercalc-overview-intro-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-overview-intro"')
const intro = start >= 0 ? view.slice(start - 50, start + 120) : ''
ok(intro.includes('data-testid="aftercalc-overview-intro"'), 'indledningen kan findes')
ok(intro.includes('break-words min-w-0" data-testid="aftercalc-overview-intro">Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'indledningen ombrydes')
ok(!intro.includes('truncate'), 'indledningen klippes ikke')
ok(view.includes('data-testid="aftercalc-view-count"'), 'sagstællingen er uændret')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-intro-wrap-test')
