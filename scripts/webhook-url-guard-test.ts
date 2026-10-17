/**
 * SEC2-2 (security-review 2026-10-17): webhook-URL-værn. Ren logik (DNS-delen testes med IP-adresser, intet opslag).
 *   npx tsx scripts/webhook-url-guard-test.ts
 */
import { webhookUrlBlockReason, isPrivateAddress, assertWebhookUrlAllowed } from '../src/lib/integrations/webhook-url-guard'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

ok(webhookUrlBlockReason('https://api.example.com/hook') === null, 'https offentlig vært → ok')
ok(webhookUrlBlockReason('http://api.example.com/hook') !== null, 'http → afvist')
ok(webhookUrlBlockReason('https://localhost/hook') !== null, 'localhost → afvist')
ok(webhookUrlBlockReason('https://app.localhost/hook') !== null, '*.localhost → afvist')
ok(webhookUrlBlockReason('https://printer.local/x') !== null, '*.local → afvist')
ok(webhookUrlBlockReason('https://127.0.0.1/x') !== null, '127.0.0.1 → afvist')
ok(webhookUrlBlockReason('https://10.1.2.3/x') !== null, '10/8 → afvist')
ok(webhookUrlBlockReason('https://172.20.0.5/x') !== null, '172.16/12 → afvist')
ok(webhookUrlBlockReason('https://192.168.1.10/x') !== null, '192.168/16 → afvist')
ok(webhookUrlBlockReason('https://169.254.169.254/latest/meta-data') !== null, 'metadata 169.254 → afvist')
ok(webhookUrlBlockReason('https://[::1]/x') !== null, '::1 → afvist')
ok(webhookUrlBlockReason('https://[fd00::1]/x') !== null, 'fd00::/8 → afvist')
ok(webhookUrlBlockReason('https://user:pw@api.example.com/x') !== null, 'brugernavn i URL → afvist')
ok(webhookUrlBlockReason('ikke en url') !== null, 'ugyldig → afvist')
ok(webhookUrlBlockReason('https://8.8.8.8/x') === null, 'offentlig IP → ok')
ok(!isPrivateAddress('172.32.0.1'), '172.32 er offentlig')
ok(isPrivateAddress('::ffff:10.0.0.1'), 'IPv4-mappet privat → privat')

async function dns() {
  let threw = false
  try { await assertWebhookUrlAllowed('https://127.0.0.1/x') } catch { threw = true }
  ok(threw, 'assertWebhookUrlAllowed: privat IP → kaster')
  threw = false
  try { await assertWebhookUrlAllowed('https://8.8.8.8/x') } catch { threw = true }
  ok(!threw, 'assertWebhookUrlAllowed: offentlig IP → ok (intet DNS-opslag)')
}
dns().then(() => {
  console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
  process.exitCode = bad ? 1 : 0
})
