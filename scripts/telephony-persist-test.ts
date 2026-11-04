/**
 * 00247 — rene tjek af telefoni-lagringens kode (ingen database, intet netværk):
 * flag (standard fra), webhook-svar uden lagring, parser (medarbejder-/telefonsvarer-metadata, ugyldige numre) og
 * parametre til telephony_ingest_event (ingen kunde/sag, SHA-256, ingen rå payload).
 *   npx tsx scripts/telephony-persist-test.ts
 */
import { telephonyMatchMode, telephonyPersistEnabled } from '../src/lib/integrations/telephony/flags'
import { decideRelatelWebhook, handleRelatelWebhook } from '../src/lib/integrations/telephony/webhook-gate'
import { parseRelatelWebhook } from '../src/lib/integrations/telephony/webhook'
import { ingestParams, isMissingTelephonySchema, payloadSha256, providerEventId } from '../src/lib/integrations/telephony/persist'
import { projectCallMatch } from '../src/lib/telephony/call-actions-core'

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, forventet ${JSON.stringify(want)}`}`)
}

const SECRET = 'test-secret-value'
const base = { RELATEL_ENABLED: 'true', RELATEL_WEBHOOK_SECRET: SECRET }
eq('lagring er fra uden flag', telephonyPersistEnabled({}), false)
eq('lagring kræver også master-flaget', telephonyPersistEnabled({ TELEPHONY_PERSIST_ENABLED: 'true' }), false)
eq('lagring kun med præcis true', [telephonyPersistEnabled({ ...base, TELEPHONY_PERSIST_ENABLED: 'yes' }), telephonyPersistEnabled({ ...base, TELEPHONY_PERSIST_ENABLED: 'true' })], [false, true])
eq('forslag er fra som standard; kun præcis suggest', [telephonyMatchMode({}), telephonyMatchMode({ TELEPHONY_MATCH_MODE: 'link' }), telephonyMatchMode({ TELEPHONY_MATCH_MODE: 'suggest' })], ['off', 'off', 'suggest'])

const body = {
  provider: 'relatel', event_id: 'ev-1', event_type: 'call.ended', occurred_at: '2026-11-03T10:00:00Z',
  call: { uuid: 'call-1', direction: 'inbound', from: '+45 12 34 56 78', to: '70000000', duration_seconds: 42, answered: true, employee_id: 1234 },
  voicemail: { duration_seconds: 17, id: 'vm-9', url: 'https://example.invalid/lyd.mp3', transcript: 'hemmeligt' },
}
const raw = JSON.stringify(body)
const parsed = parseRelatelWebhook(body)
eq('parser: medarbejder-id (tal → tekst) og telefonsvarer-metadata', parsed.ok ? [parsed.event.providerEmployeeId, parsed.event.voicemailDurationSeconds, parsed.event.providerVoicemailId, parsed.event.from, parsed.event.to] : parsed, ['1234', 17, 'vm-9', '4512345678', '4570000000'])
eq('parser: ikke-normaliserbart nummer afvises', parseRelatelWebhook({ ...body, call: { ...body.call, from: 'ring mig' } }).ok, false)

const params = parsed.ok ? ingestParams(parsed.event, raw) : null
eq('ingest-parametre: ingen kunde/sag, ingen lyd-URL/transskription/rå payload', params ? Object.keys(params).filter((k) => /customer|case|url|transcript|payload$|body/.test(k)) : 'null', [])
eq('ingest-parametre: hændelses-id uden præfiks, opkalds-id, SHA-256 af kroppen', params ? [params.p_provider_event_id, params.p_provider_call_id, params.p_payload_sha256] : null, ['ev-1', 'call-1', payloadSha256(raw)])
eq('SHA-256 er 64 hex-tegn', /^[0-9a-f]{64}$/.test(payloadSha256(raw)), true)
eq('alt for langt hændelses-id kan ikke gemmes', parsed.ok ? ingestParams({ ...parsed.event, idempotencyKey: `relatel:${'x'.repeat(161)}` }, raw) : 'x', null)
eq('providerEventId fjerner kun udbyder-præfikset', parsed.ok ? providerEventId({ ...parsed.event, idempotencyKey: 'relatel:call:u:call.ended' }) : null, 'call:u:call.ended')
eq('manglende skema genkendes (PGRST202/PGRST205/42P01/42883)', ['PGRST202', 'PGRST205', '42P01', '42883', '23505'].map((code) => isMissingTelephonySchema({ code })), [true, true, true, true, false])

const hiddenMatch = { match_status: 'unmatched', candidate_count: 0 }
eq('match: forslag på kunde uden for scope fremstår som ukendt', projectCallMatch({ match_status: 'suggested', candidate_count: 1 }, false, false), hiddenMatch)
eq('match: forslag vises når brugeren kan se kunden', projectCallMatch({ match_status: 'suggested', candidate_count: 1 }, true, false), { match_status: 'suggested', candidate_count: 1 })
eq('match: tvetydig kræver customers.view.all', [projectCallMatch({ match_status: 'ambiguous', candidate_count: 3 }, false, false), projectCallMatch({ match_status: 'ambiguous', candidate_count: 3 }, false, true)], [hiddenMatch, { match_status: 'ambiguous', candidate_count: 3 }])
eq('match: afvist bevarer status, men ikke antal kandidater uden scope', projectCallMatch({ match_status: 'rejected', candidate_count: 2 }, false, false), { match_status: 'rejected', candidate_count: 0 })

async function main() {
  let adminCalls = 0
  const deps = { admin: () => { adminCalls++; throw new Error('admin må ikke kaldes') } }
  const off = await handleRelatelWebhook({ ...base }, SECRET, raw, deps as never)
  eq('lagring fra: 202 persisted:false (som før), ingen databaseklient', [off.status, off.body.persisted, adminCalls], [202, false, 0])
  eq('decideRelatelWebhook uændret (synkron, persisted:false)', [decideRelatelWebhook(base, SECRET, raw).status, decideRelatelWebhook(base, SECRET, raw).body.persisted], [202, false])
  const unauth = await handleRelatelWebhook({ ...base, TELEPHONY_PERSIST_ENABLED: 'true' }, 'forkert', raw, deps as never)
  eq('forkert hemmelighed med lagring til: 401, ingen databaseklient', [unauth.status, adminCalls], [401, 0])
  const fake = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.telephony_ingest_event' } }) }
  const missing = await handleRelatelWebhook({ ...base, TELEPHONY_PERSIST_ENABLED: 'true' }, SECRET, raw, { admin: () => fake as never })
  eq('lagring til uden tabeller (prod før 00247): 202 persisted:false — aldrig 500-løkke', [missing.status, missing.body.persisted], [202, false])
  console.log(failed ? `❌ ${failed} fejl` : '✅ alle telefoni-lagringstjek bestået')
  process.exitCode = failed ? 1 : 0
}
main()
