/**
 * A-4: hvilke e-conomic-udfald er USIKRE (kravet bliver, ingen automatisk genpostering)?
 *   npx tsx scripts/economic-uncertain-test.ts
 */
import { exportOutcomeUncertain } from '../src/lib/services/economic-client'
import { ECONOMIC_PUSH_DISABLED_CODE } from '../src/lib/accounting/economic-push-flag'

let bad = 0
const t = (label: string, res: { ok: boolean; status: number; error?: string }, want: boolean) => {
  const got = exportOutcomeUncertain(res)
  if (got !== want) bad++
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${label} → ${got ? 'usikker' : 'sikker'}`)
}
t('succes', { ok: true, status: 201 }, false)
t('netværksfejl/timeout (status 0)', { ok: false, status: 0, error: 'fetch failed' }, true)
t('kill-switch (status 0 + kode) er sikkert — intet sendt', { ok: false, status: 0, error: ECONOMIC_PUSH_DISABLED_CODE }, false)
t('408 request timeout', { ok: false, status: 408 }, true)
t('500 serverfejl', { ok: false, status: 500 }, true)
t('503 utilgængelig', { ok: false, status: 503 }, true)
t('502 bad gateway', { ok: false, status: 502 }, true)
t('400 valideringsfejl er sikkert — afvist', { ok: false, status: 400 }, false)
t('401 auth er sikkert', { ok: false, status: 401 }, false)
t('422 er sikkert', { ok: false, status: 422 }, false)
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle A-4-tests bestået')
process.exitCode = bad ? 1 : 0
