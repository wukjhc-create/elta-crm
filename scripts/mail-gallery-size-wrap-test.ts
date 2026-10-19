/**
 * Filstørrelsen i mailgalleriets billedtekst kan krympe. Filnavnet og download bliver.
 *   npx tsx scripts/mail-gallery-size-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const id = 'data-testid="mail-gallery-size"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 60) : ''
const cell = 'className="text-[10px] text-white/70 break-words min-w-0" data-testid="mail-gallery-size"'
ok(row.includes('<p'), 'det er billedtekstens størrelse')
ok(row.includes('text-[10px] text-white/70 break-words min-w-0'), 'størrelsen kan krympe')
ok(row.includes('formatFileSize(att.size)'), 'størrelsen bliver i rækken')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('att.filename'), 'filnavnet er et andet sted')
ok(!row.includes('href={att.url}'), 'download er et andet sted')
ok(!row.includes('Download'), 'download-ikonet er et andet sted')
ok(view.split(id).length === 2, 'billedtekstens størrelse findes en gang')
ok(view.split(cell).length === 2, 'størrelsens klasse findes en gang')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={att.url}'), 'download bliver')
ok(view.includes('aria-label="Download"'), 'download-navnet bliver')
ok(view.includes('text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}'), 'listestørrelsen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-gallery-size-wrap-test')
