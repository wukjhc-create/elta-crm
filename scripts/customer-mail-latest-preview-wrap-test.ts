/**
 * Seneste mail-forhåndsvisning på kundetidslinjen ombrydes. Teksten er uændret.
 *   npx tsx scripts/customer-mail-latest-preview-wrap-test.ts
 */
import { readFileSync } from 'node:fs'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
const at = view.indexOf('data-testid="customer-mail-latest-preview"')
const row = at >= 0 ? view.slice(at - 160, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'forhåndsvisningen ombrydes')
ok(row.includes('>{latestMsg.body_preview}'), 'teksten er uændret')
ok(!row.includes('line-clamp-1'), 'den klippes ikke til en linje')
ok(view.includes('break-words min-w-0" data-testid="customer-mail-list-preview">{email.body_preview}'), 'listeforhåndsvisningen ombrydes')
ok(view.split('text-sm mt-1 line-clamp-2').length === 3, 'emnet bliver på to linjer')
ok(view.includes("timeZone: 'Europe/Copenhagen'"), 'tiden bliver københavnsk')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-mail-latest-preview-wrap-test')
