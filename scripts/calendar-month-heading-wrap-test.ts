/**
 * Månedens navn i kalenderen ombrydes. MONTH_NAMES og året er uændret.
 *   npx tsx scripts/calendar-month-heading-wrap-test.ts
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
const at = nav.indexOf('data-testid="calendar-month-heading"')
const row = at >= 0 ? nav.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'måneden ombrydes')
ok(row.includes('{MONTH_NAMES[month]} {year}'), 'navn og år er uændret')
ok(nav.includes('aria-label="Forrige måned"') && nav.includes('aria-label="Næste måned"'), 'pilene er uændret')
ok(nav.split('min-h-[44px] min-w-[44px]').length === 3, 'pilene er stadig høje nok')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'måneden klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-month-heading-wrap-test')
