/**
 * Stage A — mail-sync hvert 5. minut: kørsels-lease (00253) + cron-ændring. Rene/statiske tests (ingen DB).
 *   npx tsx scripts/sync-lease-test.ts
 * Dynamisk (staging): cli.ts sync-lease-00253-probe · sync-lease-00253-rollback-proof · sync-lease-concurrency-staging
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { withSyncLease, acquireSyncLease, EMAIL_SYNC_LEASE, type LeaseRpc } from '../src/lib/services/sync-lease'

let fails = 0
const ok = (c: boolean, n: string, note = '') => { if (c) console.log(`PASS  ${n}`); else { fails++; console.log(`FAIL  ${n}${note ? ` (${note})` : ''}`) } }

async function main() {
  const calls: string[] = []
  const rpc = (acquire: { data: unknown; error: { code?: string } | null }): LeaseRpc => async (fn) => { calls.push(fn); return fn === 'sync_lease_acquire' ? acquire : { data: true, error: null } }
  let ran = 0
  const task = async () => { ran++; return 'ran' }
  const skip = (o: 'busy' | 'error') => `skip:${o}`

  calls.length = 0; ran = 0
  let r = await withSyncLease(rpc({ data: '11111111-1111-1111-1111-111111111111', error: null }), EMAIL_SYNC_LEASE, task, skip)
  ok(r.outcome === 'acquired' && r.value === 'ran' && ran === 1 && calls.join(',') === 'sync_lease_acquire,sync_lease_release', 'lease taget → sync kører og leasen frigives bagefter', calls.join(','))
  calls.length = 0; ran = 0
  r = await withSyncLease(rpc({ data: null, error: null }), EMAIL_SYNC_LEASE, task, skip)
  ok(r.outcome === 'busy' && r.value === 'skip:busy' && ran === 0 && !calls.includes('sync_lease_release'), 'optaget → sync springes over (intet hentes/behandles), ingen frigivelse af andres lease')
  calls.length = 0; ran = 0
  let warned = false
  r = await withSyncLease(rpc({ data: null, error: { code: 'PGRST202' } }), EMAIL_SYNC_LEASE, task, skip, () => { warned = true })
  ok(r.outcome === 'unavailable' && r.value === 'ran' && warned, '00253 mangler (PGRST202) → kører uden lås som før + advarsel (kode før migration er sikker)')
  r = await withSyncLease(rpc({ data: null, error: { code: '42883' } }), EMAIL_SYNC_LEASE, task, skip)
  ok(r.outcome === 'unavailable', '00253 mangler (42883) → kører uden lås')
  calls.length = 0; ran = 0
  r = await withSyncLease(rpc({ data: null, error: { code: '57014' } }), EMAIL_SYNC_LEASE, task, skip)
  ok(r.outcome === 'error' && r.value === 'skip:error' && ran === 0, 'anden låsefejl → springes over (fail closed; næste kørsel prøver igen)')
  calls.length = 0
  const thrown = await withSyncLease(rpc({ data: '22222222-2222-2222-2222-222222222222', error: null }), EMAIL_SYNC_LEASE, async () => { throw new Error('crash') }, skip).catch(() => 'threw')
  ok(thrown === 'threw' && calls.includes('sync_lease_release'), 'sync der kaster → leasen frigives alligevel (finally)')
  const ex = await acquireSyncLease(async () => { throw new Error('net') }, 'email-sync', 330)
  ok(ex.outcome === 'error', 'netværksfejl ved låsning → error (springes over)')
  ok(EMAIL_SYNC_LEASE.name === 'email-sync' && EMAIL_SYNC_LEASE.ttlSeconds > 300 && EMAIL_SYNC_LEASE.ttlSeconds < 600, 'TTL > maxDuration (300 s) og < 2 intervaller', String(EMAIL_SYNC_LEASE.ttlSeconds))

  // cron: KUN email-sync ændret, til hvert 5. minut
  const now = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
  const before = JSON.parse(execSync('git show 59e3374ca6b592dbe1166dfc9f019cc6011fc736:vercel.json', { encoding: 'utf8' })) as typeof now
  const changed = now.crons.filter((c) => before.crons.find((b) => b.path === c.path)?.schedule !== c.schedule).map((c) => c.path)
  ok(now.crons.find((c) => c.path === '/api/cron/email-sync')?.schedule === '*/5 * * * *', 'email-sync cron = "*/5 * * * *"')
  ok(changed.join(',') === '/api/cron/email-sync' && now.crons.length === before.crons.length, 'ingen andre crons ændret/tilføjet/fjernet', changed.join(','))
  ok(!/reception/i.test(readFileSync('vercel.json', 'utf8')), 'stadig intet reception-/retention-cron')
  const route = readFileSync('src/app/api/cron/email-sync/route.ts', 'utf8')
  ok(route.includes('"*\\/5 * * * *"') && !/configurable in vercel\.json/.test(route) && /export const maxDuration = 300/.test(route), 'rutens kommentar angiver den faktiske 5-minutters plan; maxDuration 300 s')
  const orch = readFileSync('src/lib/services/email-sync-orchestrator.ts', 'utf8')
  const fn = orch.slice(orch.indexOf('export async function runEmailSync('), orch.indexOf('async function runEmailSyncUnlocked('))
  ok(/withSyncLease\(/.test(fn) && /EMAIL_SYNC_LEASE/.test(fn) && /runEmailSyncUnlocked\(\)/.test(fn), 'runEmailSync (cron OG manuel "Hent nye") kører kun via kørsels-leasen')
  ok(/already_running/.test(fn), "overspringelse markeres skippedReason 'already_running' (success, ingen fejl)")
  const mig = readFileSync('supabase/migrations/00253_sync_leases.sql', 'utf8')
  ok(/REVOKE ALL ON TABLE public\.sync_leases FROM PUBLIC, anon, authenticated, service_role/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.sync_lease_acquire\(text, integer\) TO service_role/.test(mig) && /WHERE public\.sync_leases\.expires_at < now\(\)/.test(mig), '00253: ingen tabel-adgang, kun service_role-funktioner, atomisk overtagelse kun af udløbet lease')
  // idempotens der allerede gælder uden lease (forsvar i dybden)
  ok(/graph_message_id TEXT UNIQUE/.test(readFileSync('supabase/migrations/00049_incoming_emails.sql', 'utf8')), 'samme Graph-besked kan ikke indsættes to gange (incoming_emails.graph_message_id UNIQUE)')
  ok(/EMAIL_INTAKE_SWEEP_LIMIT = 25/.test(readFileSync('src/lib/reception/channel-intake.ts', 'utf8')), 'afstemnings-sweep højst 25 pr. kørsel')

  if (fails) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
  console.log('\n✅ sync-lease-test: alle bestået')
}
main()
