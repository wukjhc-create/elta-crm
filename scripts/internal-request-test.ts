/**
 * Unit-tests for Q10 interne kald (src/lib/security/internal-request.ts). Ingen DB/netværk.
 *   npx tsx scripts/internal-request-test.ts
 */
import { isInternalRequest, isSafeImageSource, internalRequestHeaders } from '../src/lib/security/internal-request'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const req = (auth?: string) => new Request('http://x/api', { method: 'POST', headers: auth ? { authorization: auth } : {} })

delete process.env.CRON_SECRET
ok(!isInternalRequest(req('Bearer ')), 'uden CRON_SECRET afvises alt (fail-closed) — også tom bearer')
ok(!isInternalRequest(req()), 'uden header og uden secret afvises')
process.env.CRON_SECRET = 'test-secret-123'
ok(isInternalRequest(new Request('http://x', { headers: internalRequestHeaders() })), 'egne headers accepteres')
ok(!isInternalRequest(req('Bearer test-secret-124')), 'forkert secret afvises')
ok(!isInternalRequest(req('Bearer test-secret-1234')), 'anden længde afvises')
ok(!isInternalRequest(req()), 'manglende header afvises')

ok(isSafeImageSource('data:image/png;base64,iVBORw0KGgo=') && isSafeImageSource('data:image/jpeg;base64,/9j/4AAQ'), 'png/jpeg data-URL OK')
ok(isSafeImageSource(undefined) && isSafeImageSource(null) && isSafeImageSource(''), 'tom/manglende OK')
ok(!isSafeImageSource('http://169.254.169.254/latest/meta-data'), 'http-URL afvises')
ok(!isSafeImageSource('https://evil.example/x.png'), 'https-URL afvises')
ok(!isSafeImageSource('/etc/passwd') && !isSafeImageSource('C:\Windows\win.ini'), 'filstier afvises')
ok(!isSafeImageSource('data:image/svg+xml;base64,PHN2Zz4='), 'svg afvises')
ok(!isSafeImageSource('data:image/png;base64,abc"><x') && !isSafeImageSource({ src: 'x' }), 'ugyldige tegn/typer afvises')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle interne-kald-tests bestået')
process.exitCode = bad ? 1 : 0
