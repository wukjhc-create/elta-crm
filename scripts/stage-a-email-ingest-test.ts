/**
 * Stage A (automatisk mail → Henvendelser) — rene/statiske tests uden DB. Preflight 2026-11-19.
 *   npx tsx scripts/stage-a-email-ingest-test.ts
 * Den dynamiske del (rigtig kode mod staging: udfald, tråde, dubletter, samtidighed, genforsøg, no-send) er
 * `cli.ts stage-a-staging`; prod-simulatoren er `scripts/prod-stage-a-simulate.ts` (rollback-only).
 */
import { readFileSync } from 'fs'
import { emailDiscoveryEligibility, selectMissedEmailIds, ingestEmailSource, EMAIL_INGEST_DISCOVERY_DAYS, EMAIL_INTAKE_SWEEP_LIMIT } from '../src/lib/reception/channel-intake'
import { emailIngestEnabled, emailIngestSince, backfillEnabled } from '../src/lib/reception/flags'

let fails = 0
const ok = (cond: boolean, name: string, note = '') => { if (cond) console.log(`PASS  ${name}`); else { fails++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const H = 3_600_000, D = 86_400_000
const NOW = Date.parse('2026-11-25T12:00:00Z')
const ACT = '2026-11-20T09:00:00Z' // aktivering
const ON = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: ACT }
const at = (ms: number) => new Date(ms).toISOString()

async function main() {
  // ── Flag-semantik: BEGGE kræves, ugyldigt SINCE = fail closed ──
  ok(!emailIngestEnabled({}) && !emailIngestEnabled({ RECEPTION_EMAIL_INGEST_ENABLED: 'false' }) && emailIngestEnabled({ RECEPTION_EMAIL_INGEST_ENABLED: 'true' }), 'RECEPTION_EMAIL_INGEST_ENABLED: kun "true" slår til')
  ok(emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: ACT })?.toISOString() === '2026-11-20T09:00:00.000Z', 'SINCE med Z accepteres')
  ok(emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: '2026-11-20T10:00:00+01:00' })?.toISOString() === '2026-11-20T09:00:00.000Z', 'SINCE med +01:00 accepteres og betyder samme øjeblik')
  ok(emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: '2026-11-20T10:00:00.123Z' }) !== null, 'SINCE med millisekunder accepteres')
  for (const bad of ['', 'i går', '2026-11-20', '2026-11-20T10:00', '2026-11-20T10:00:00', '2026-11-20 10:00:00Z', 'now', '1763629200000'])
    ok(emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: bad }) === null, `SINCE "${bad}" (uden tidszone/ugyldig) → null (fail closed)`)
  ok(emailDiscoveryEligibility(at(NOW), { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }, NOW).ok === false, 'aktiveret UDEN SINCE → ikke berettiget (since_not_configured)')
  ok((emailDiscoveryEligibility(at(NOW), { ...ON, RECEPTION_EMAIL_INGEST_SINCE: '2026-11-20T10:00' }, NOW) as { reason?: string }).reason === 'since_not_configured', 'aktiveret med SINCE uden tidszone → since_not_configured (fail closed)')

  // ── Scenarier A–F (opdagelses-regel: created_at, ikke modtaget-tid) ──
  const elig = (disc: number) => emailDiscoveryEligibility(at(disc), ON, NOW)
  ok(elig(NOW - 2 * H).ok, 'A: mail opdaget efter aktivering → berettiget')
  // B/C/D: modtaget før aktivering (Microsoft-udfald), opdaget efter → stadig berettiget (modtaget-tid indgår ikke)
  for (const [label, outage] of [['B: 49 t', 49 * H], ['C: 3 døgn', 3 * D], ['D: 7 døgn', 7 * D]] as const) {
    ok(elig(NOW - 1 * H).ok && emailDiscoveryEligibility(at(NOW - 1 * H), ON, NOW).ok, `${label} Microsoft-udfald: mail modtaget for ${outage / H} t siden men OPDAGET nu → berettiget`)
  }
  ok((elig(Date.parse(ACT) - 60_000) as { reason?: string }).reason === 'discovered_before_activation', 'E: mail opdaget før aktivering (historik) → ikke automatisk')
  ok((elig(Date.parse(ACT) - 20 * D) as { reason?: string }).reason === 'discovered_before_activation', 'F: ventende genforsøg af gammel række (opdaget for 20 dage siden) → ikke importeret')
  ok((emailDiscoveryEligibility(at(NOW - 15 * D), { ...ON, RECEPTION_EMAIL_INGEST_SINCE: at(NOW - 60 * D) }, NOW) as { reason?: string }).reason === 'discovery_window', `selv med gammelt SINCE: opdaget > ${EMAIL_INGEST_DISCOVERY_DAYS} dage siden → afgrænset (discovery_window)`)
  ok((emailDiscoveryEligibility(null, ON, NOW) as { reason?: string }).reason === 'no_discovery_time', 'manglende opdaget-tid → ikke berettiget')
  ok(emailDiscoveryEligibility(ACT, ON, NOW).ok, 'grænse: opdaget præcis ved aktiveringen → berettiget')
  ok(!backfillEnabled({}) && backfillEnabled({ RECEPTION_BACKFILL_ENABLED: 'true' }), 'G: backfill kun med RECEPTION_BACKFILL_ENABLED (standard FRA)')

  // ── Indtagsfunktionen med falsk kapabilitet (ingen DB): udfald, egne postkasser, læsefejl, ingen falsk succes ──
  const mkCap = (row: Record<string, unknown> | 'read_error' | 'not_found', ingest: () => Promise<unknown> = async () => ({ outcome: 'created', conversationId: 'c1', itemId: 'i1', actions: [] })) => {
    const calls: unknown[] = []
    return { calls, cap: {
      readPort: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), limit: async () => ({ data: [], error: null }) }), ilike: () => ({ limit: async () => ({ data: [], error: null }) }), or: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }) }) },
      ingest: async (p: unknown) => { calls.push(p); return ingest() },
      readSource: async () => (row === 'read_error' ? { ok: false, error: 'read_error' } : row === 'not_found' ? { ok: false, error: 'not_found' } : { ok: true, row }),
      readSourceBody: async () => ({ ok: true, row: { body_text: '', body_html: '' } }),
    } as never }
  }
  const mail = (o: Record<string, unknown> = {}) => ({ id: 'm1', subject: 'Batteri offline', sender_email: 'kunde@example.dk', sender_name: 'K', body_preview: 'Mit batteri er offline', received_at: at(NOW - 50 * H), created_at: at(NOW - 1 * H), customer_id: null, linked_by: null, link_status: 'unidentified', conversation_id: 'T1', attachment_urls: [], ...o })
  const off = mkCap(mail())
  ok((await ingestEmailSource('m1', { env: {}, capability: off.cap, now: () => NOW })).outcome === 'disabled' && off.calls.length === 0, 'flag FRA → disabled, intet læst/indtaget')
  const own = mkCap(mail({ sender_email: 'kontakt@eltasolar.dk' }))
  ok((await ingestEmailSource('m1', { env: ON, capability: own.cap, now: () => NOW })).reason === 'own_mailbox' && own.calls.length === 0, 'ELTAs egen postkasse (sendt/intern) → skipped')
  const re = mkCap('read_error')
  ok((await ingestEmailSource('m1', { env: ON, capability: re.cap, now: () => NOW })).outcome === 'read_error' && re.calls.length === 0, 'læsefejl → read_error (aldrig "ukoblet"), intet indtaget')
  const outage = mkCap(mail({ received_at: at(NOW - 7 * D), created_at: at(NOW - 2 * H) }))
  const ro = await ingestEmailSource('m1', { env: ON, capability: outage.cap, now: () => NOW })
  ok(ro.outcome !== 'skipped' && outage.calls.length === 1, 'D (integration): modtaget for 7 døgn siden, opdaget nu → indtaget', JSON.stringify(ro))
  const hist = mkCap(mail({ created_at: at(Date.parse(ACT) - D) }))
  ok((await ingestEmailSource('m1', { env: ON, capability: hist.cap, now: () => NOW })).reason === 'discovered_before_activation' && hist.calls.length === 0, 'E (integration): historisk række → skipped, intet indtaget')
  const failing = mkCap(mail(), async () => { throw new Error('timeout') })
  const rf = await ingestEmailSource('m1', { env: ON, capability: failing.cap, now: () => NOW })
  ok(rf.outcome === 'error', 'DB-timeout i reception_ingest → udfald error (ingen falsk succes)', JSON.stringify(rf))
  const dup = mkCap(mail(), async () => ({ outcome: 'duplicate', conversationId: 'c1' }))
  ok((await ingestEmailSource('m1', { env: ON, capability: dup.cap, now: () => NOW })).outcome === 'duplicate', 'samme mail igen → duplicate')

  // ── Afstemning (genforsøg af fejlede indtag) — ren udvælgelse ──
  const cand = [{ id: 'a', sender_email: 'x@k.dk' }, { id: 'b', sender_email: 'kontakt@eltasolar.dk' }, { id: 'c', sender_email: 'y@k.dk' }]
  ok(JSON.stringify(selectMissedEmailIds(cand, new Set(['a']))) === '["c"]', 'afstemning: kun mails UDEN item, aldrig ELTAs egne')
  ok(selectMissedEmailIds(Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, sender_email: 'k@k.dk' })), new Set()).length === EMAIL_INTAKE_SWEEP_LIMIT, `afstemning: højst ${EMAIL_INTAKE_SWEEP_LIMIT} pr. kørsel`)

  // ── Statisk: kun indgående, ingen afsendelse, backfill gated, intet cron for reception ──
  const src = (p: string) => readFileSync(p, 'utf8')
  const SEND = /microsoft-graph|email-service|sendEmail|sms|relatel|nila|sendPortalMessage|sendEmployeeMessage|webhook-dispatch|telephony\/(send|call)/i
  for (const f of ['channel-intake', 'adapters', 'background-actor', 'engine', 'flags', 'identity-match', 'signals', 'action-policy', 'emergency-policy', 'disclosure', 'contract']) {
    const p = `src/lib/reception/${f}.ts`
    let t = ''; try { t = src(p) } catch { continue }
    const imports = (t.match(/from '[^']+'|import\('[^']+'\)/g) ?? []).join(' ')
    ok(!SEND.test(imports), `ingen afsender-import i indtagsvejen: ${f}.ts`, imports.match(SEND)?.[0] ?? '')
  }
  const ba = src('src/lib/reception/background-actor.ts')
  ok(!/executeApprovedActions/.test(ba), 'baggrundsindtaget udfører aldrig handlinger (ingen executeApprovedActions — kun forslag)')
  const orch = src('src/lib/services/email-sync-orchestrator.ts')
  const sentFn = orch.slice(orch.indexOf('async function insertSentEmail'), orch.indexOf('\n}\n', orch.indexOf('async function insertSentEmail')))
  ok(!/ingestEmailSource|linkAndAnalyze/.test(sentFn), 'sendte mails (udgående) indtages aldrig som henvendelse')
  ok((orch.match(/ingestEmailSource\(/g) ?? []).length === 1 && /sweepMissedEmailIntake\(supabase\)/.test(orch) && /ingestMissedEmailSources\(/.test(orch), 'mail-sync: ét indtagskald (efter kobling/analyse) + afstemningen (indtag via channel-intake)')
  ok(/logger\.info\('Henvendelse intake'[\s\S]{0,300}entityId: email\.id[\s\S]{0,200}outcome: r\.outcome/.test(orch) && !/Henvendelse intake'[\s\S]{0,400}(subject|sender|body)/.test(orch), 'observerbarhed: id + udfald + henvendelses-id, aldrig emne/afsender/brødtekst')
  const henv = src('src/lib/actions/henvendelser.ts')
  ok(/backfillEnabled\(\)/.test(henv), 'backfill-handlingen ("Hent nye") kræver RECEPTION_BACKFILL_ENABLED')
  ok(!/reception/i.test(src('vercel.json')), 'ingen reception-/retention-cron i vercel.json (Stage A kører kun i mail-sync)')
  const flags = src('src/lib/reception/flags.ts')
  ok(/EXTERNAL_SENDS_ENABLED = false as const/.test(flags), 'EXTERNAL_SENDS_ENABLED er en fast false-konstant')

  if (fails) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
  console.log('\n✅ stage-a-email-ingest-test: alle bestået')
}
main().catch((e) => { console.error(e); process.exit(1) })
