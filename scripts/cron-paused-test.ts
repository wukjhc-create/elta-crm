/**
 * Unit-tests for cron-nødstoppet (CRON_PAUSED) og status-mapping i src/lib/services/cron-run.ts. Ingen DB.
 *   npx tsx scripts/cron-paused-test.ts
 */
import { isCronPaused, bodyStatus, withCronRun } from '../src/lib/services/cron-run'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
ok(!isCronPaused('invoice-reminders', undefined), 'ikke sat → kører')
ok(!isCronPaused('invoice-reminders', ''), 'tom → kører')
ok(isCronPaused('invoice-reminders', 'invoice-reminders'), 'navngivet → pauset')
ok(isCronPaused('offer-reminders', 'invoice-reminders, offer-reminders'), 'liste med mellemrum → pauset')
ok(!isCronPaused('email-sync', 'invoice-reminders,offer-reminders'), 'ikke på listen → kører')
ok(isCronPaused('email-sync', '*'), '* → alle pauset')
ok(isCronPaused('Invoice-Reminders', 'invoice-reminders'), 'versaler ligegyldige')
ok(!isCronPaused('invoice', 'invoice-reminders'), 'ingen delvis match')

// Cron-review 2026-10-09 (#3): 200-svar med fejl i body logges ikke som ok
ok(bodyStatus('{"ok":true,"status":"failed"}') === 'error', "status 'failed' → error")
ok(bodyStatus('{"success":false}') === 'error', 'success:false → error')
ok(bodyStatus('{"success":true,"errors":["x"]}') === 'warning', 'errors[] → warning')
ok(bodyStatus('{"success":true,"errors":[]}') === 'ok', 'tom errors → ok')
ok(bodyStatus('ikke json') === 'ok', 'ikke-JSON → ok')

// Cron-review 2026-10-09 (#6): pauset cron uden CRON_SECRET → 401 (ingen log-række, handleren kører ikke)
async function pauseAuth() {
  process.env.CRON_PAUSED = 'demo-cron'
  process.env.CRON_SECRET = 'test-secret-only-in-process'
  let handlerRan = false
  const wrapped = withCronRun('demo-cron', async () => { handlerRan = true; return new Response('{}') })
  const r = await wrapped(new Request('http://localhost/api/cron/demo-cron'))
  ok(r.status === 401 && !handlerRan, 'pauset + uden secret → 401')
}

pauseAuth().then(() => {
  console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle cron-paused-tests bestået')
  process.exitCode = bad ? 1 : 0
})
