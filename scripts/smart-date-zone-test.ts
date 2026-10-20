/** SmartDate viser den københavnske dato før mount. Relativ tid bliver. Kør: npx tsx scripts/smart-date-zone-test.ts */
import fs from 'fs'
import { formatDateDK, formatDateTimeDK } from '../src/lib/utils/format'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

eq('foerste visning er naeste dag', formatDateDK('2026-10-14T22:30:00Z'), '15. okt. 2026')
eq('titel har dansk klokkeslaet', formatDateTimeDK('2026-10-14T22:30:00Z'), '15. okt. 2026 00:30')
eq('ren dato bliver', formatDateDK('2026-10-15'), '15. okt. 2026')

const src = fs.readFileSync('src/components/shared/smart-date.tsx', 'utf8')
eq('foerste visning bruger hjaelperen', src.includes('formatDateDK(d)'), true)
eq('titel bruger hjaelperen', src.includes('formatDateTimeDK(d)'), true)
eq('relativ tid bliver efter mount', src.includes('mounted ? formatSmartDate(d)'), true)
eq('date-fns format er vaek', src.includes("from 'date-fns/locale'"), false)

console.log(fail ? `\n${fail} fejl` : '\nsmart-date-zone-test OK')
process.exitCode = fail ? 1 : 0
