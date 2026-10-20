/**
 * Forrige og næste måned er mindst 44 px. Aria-teksten er uændret.
 *   npx tsx scripts/calendar-month-nav-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const nav = view.slice(view.indexOf('Month Navigation'), view.indexOf('Weekday headers'))
ok(nav.includes('aria-label="Forrige måned"') && nav.includes('onClick={prevMonth}'), 'forrige måned er uændret')
ok(nav.includes('aria-label="Næste måned"') && nav.includes('onClick={nextMonth}'), 'næste måned er uændret')
ok(nav.split('min-h-[44px] min-w-[44px]').length === 3, 'begge knapper er høje og brede nok')
ok(nav.includes('{MONTH_NAMES[month]} {year}'), 'månedsteksten er uændret')
ok(view.includes('data-testid="calendar-go-today"'), 'I dag-knappen bliver')
ok(!nav.includes(' truncate') && !nav.includes('truncate '), 'månedsvalget klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-month-nav-test')
