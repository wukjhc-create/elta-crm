/**
 * Relatel final review (2026-11-15) — rene tjek uden database og netværk (falsk Supabase-klient).
 *   npx tsx scripts/relatel-review-test.ts
 * DB-adfærden (idempotens i telephony_ingest_event, monoton fletning ved hændelser i vilkårlig rækkefølge, parallelle
 * sessioner, RLS/kolonne-grants, overrides) bevises af staging-proberne: cli.ts tel-00247-probe / tel-00247-app.
 */
import { parseRelatelWebhook, mapRelatelCallPayload, describePayloadShape } from '../src/lib/integrations/telephony/webhook'
import { handleRelatelWebhook, decideRelatelWebhook, webhookAuthMode, type WebhookAuthInput } from '../src/lib/integrations/telephony/webhook-gate'
import { signRelatelBody, parseSignatureHeader, verifyRelatelSignature } from '../src/lib/integrations/telephony/signature'

import { telephonyRetentionDecision, telephonyEventPurgeable } from '../src/lib/integrations/telephony/retention-policy'
import { readFileSync } from 'node:fs'

let loggedShape = ''
import { suggestCustomerForCall } from '../src/lib/integrations/telephony/suggest'
import { createRelatelProvider } from '../src/lib/integrations/telephony/provider'
import { relatelEnabled, relatelLiveCallEnabled, relatelSmsEnabled, telephonyPersistEnabled } from '../src/lib/integrations/telephony/flags'
import { existingOpenCallback, planCallbackInsert, CALLBACK_RULES } from '../src/lib/integrations/telephony/callback-plan'
import { disabledRelatelClient } from '../src/lib/integrations/relatel/contract'
import { listCallsCore, confirmCallCustomerCore, rejectCallMatchCore, setEmployeeLinkCore, projectCallMatch, type CallActionCtx } from '../src/lib/telephony/call-actions-core'

let fail = 0
const check = (name: string, ok: boolean) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }

// ---------------------------------------------------------------- falsk Supabase-klient (kædebar, thenable)
type Call = { m: string; args: unknown[] }
type Handler = (table: string, calls: Call[]) => { data: unknown; error: unknown }
function fakeClient(handler: Handler, rpc?: (name: string, params: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const log: Array<{ table: string; calls: Call[] }> = []
  const chain = (table: string) => {
    const calls: Call[] = []
    log.push({ table, calls })
    const p: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(handler(table, calls)).then(res, rej)
        return (...args: unknown[]) => { calls.push({ m: prop, args }); return p }
      },
    })
    return p
  }
  return { client: { from: chain, rpc: async (n: string, params: Record<string, unknown>) => (rpc ? rpc(n, params) : { data: null, error: { message: 'no rpc' } }) } as any, log }
}
const has = (calls: Call[], m: string) => calls.some((c) => c.m === m)

const SECRET = 'review-test-secret'
const ON = { RELATEL_ENABLED: 'true', RELATEL_WEBHOOK_SECRET: SECRET }
const PERSIST = { ...ON, TELEPHONY_PERSIST_ENABLED: 'true', RELATEL_WEBHOOK_ALLOW_STATIC_SECRET: 'true' }
const ev = (over: Record<string, unknown> = {}, call: Record<string, unknown> = {}) => ({
  provider: 'relatel', event_id: 'ev-1', event_type: 'call.ended', occurred_at: '2026-11-15T10:00:00Z',
  call: { uuid: 'call-1', direction: 'inbound', from: '12345678', to: '70000000', ...call }, ...over,
})

async function main() {
  // ---------------- webhook-port
  check('flag fra → 404 (intet modtaget)', decideRelatelWebhook({}, SECRET, JSON.stringify(ev())).status === 404)
  check('flag til uden hemmelighed → 503', decideRelatelWebhook({ RELATEL_ENABLED: 'true' }, SECRET, JSON.stringify(ev())).status === 503)
  check('forkert/manglende hemmelighed → 401', decideRelatelWebhook(ON, 'nej', JSON.stringify(ev())).status === 401 && decideRelatelWebhook(ON, null, JSON.stringify(ev())).status === 401)
  check('for stor krop → 413', decideRelatelWebhook(ON, SECRET, 'x'.repeat(100_001)).status === 413)
  check('ugyldig JSON → 400', decideRelatelWebhook(ON, SECRET, '{nope').status === 400)
  check('JSON-array/ikke-objekt → 400', decideRelatelWebhook(ON, SECRET, '[1]').status === 400)
  check('ukendt hændelsestype → 400 (aldrig stille accept)', decideRelatelWebhook(ON, SECRET, JSON.stringify(ev({ event_type: 'call.transferred' }))).status === 400)
  check('manglende tidspunkt → 400', decideRelatelWebhook(ON, SECRET, JSON.stringify(ev({ occurred_at: 'i går' }))).status === 400)
  check('ugyldig retning → 400', decideRelatelWebhook(ON, SECRET, JSON.stringify(ev({}, { direction: 'sideways' }))).status === 400)
  check('ingen numre → 400', decideRelatelWebhook(ON, SECRET, JSON.stringify(ev({}, { from: null, to: null }))).status === 400)

  // ---------------- idempotens / gentagelser / retning
  const a = parseRelatelWebhook(ev()), b = parseRelatelWebhook(ev())
  check('dublet-webhook: samme udbyder-hændelses-id → samme nøgle', a.ok && b.ok && a.event.idempotencyKey === b.event.idempotencyKey && a.event.idempotencyKey === 'relatel:ev-1')
  const started = parseRelatelWebhook(ev({ event_id: 'ev-0', event_type: 'call.started' }))
  const answered = parseRelatelWebhook(ev({ event_id: 'ev-2', event_type: 'call.answered' }))
  check('gentagne hændelser for samme opkald: forskellige nøgler, samme opkalds-id (uuid)', started.ok && answered.ok && a.ok
    && new Set([started.event.idempotencyKey, answered.event.idempotencyKey, a.event.idempotencyKey]).size === 3
    && started.event.externalId === 'call-1' && answered.event.externalId === 'call-1')
  check('idempotens bygger på udbyder-id, ikke tidspunkt', (() => { const x = parseRelatelWebhook(ev({ occurred_at: '2026-11-15T11:00:00Z' })); return x.ok && a.ok && x.event.idempotencyKey === a.event.idempotencyKey })())
  const missed = parseRelatelWebhook(ev({ event_type: 'call.missed', event_id: 'ev-m' }))
  check('ubesvaret: call.missed → answered=false', missed.ok && missed.event.answered === false && missed.event.direction === 'inbound')
  const ans = parseRelatelWebhook(ev({}, { answered_at: '2026-11-15T10:00:05Z' }))
  check('besvaret: answered_at → answered=true', ans.ok && ans.event.answered === true)
  const out = parseRelatelWebhook(ev({}, { direction: 'outbound', from: '70000000', to: '12345678' }))
  check('udgående bevares som outbound', out.ok && out.event.direction === 'outbound')
  const u1 = parseRelatelWebhook({ uuid: 'u-9', direction: 'inbound', from: '12345678', started_at: '2026-11-15T09:00:00Z' })
  const u2 = parseRelatelWebhook({ uuid: 'u-9', direction: 'outbound', to: '12345678', started_at: '2026-11-15T09:00:00Z' })
  check('uverificeret opkaldsform: indgående uden svar → call.missed; udgående uden svar → call.ended (ikke "ubesvaret")', u1.ok && u2.ok && u1.event.eventType === 'call.missed' && u2.event.eventType === 'call.ended')
  const vm = parseRelatelWebhook(ev({ event_type: 'voicemail.created', event_id: 'ev-v', voicemail: { id: 'vm-1', duration_seconds: 20, url: 'https://x.invalid/a.mp3', transcript: 'hemmelig' } }))
  check('telefonsvarer: kun metadata (id, varighed) — ingen URL/transskription i hændelsen', vm.ok && vm.event.hasVoicemail && vm.event.providerVoicemailId === 'vm-1'
    && !JSON.stringify(vm.event).includes('mp3') && !JSON.stringify(vm.event).includes('hemmelig'))

  // ---------------- lagring: dublet/konflikt/fejl → korrekt svar
  const rpcOutcome = (outcome: string) => fakeClient(() => ({ data: [], error: null }), () => ({ data: [{ outcome, call_id: '00000000-0000-0000-0000-000000000001' }], error: null })).client
  const dup = await handleRelatelWebhook(PERSIST, SECRET, JSON.stringify(ev()), { admin: () => rpcOutcome('duplicate') })
  check('dublet-webhook med lagring → 202 outcome=duplicate (ingen ny række)', dup.status === 202 && dup.body.outcome === 'duplicate')
  const conflict = await handleRelatelWebhook(PERSIST, SECRET, JSON.stringify(ev()), { admin: () => rpcOutcome('conflict') })
  check('samme hændelses-id med andet indhold → 409 (intet ændret)', conflict.status === 409)
  const dbErr = await handleRelatelWebhook(PERSIST, SECRET, JSON.stringify(ev()), { admin: () => fakeClient(() => ({ data: null, error: null }), () => ({ data: null, error: { code: '40001', message: 'x' } })).client })
  check('databasefejl → 500 (udbyder må gentage; aldrig "gemt")', dbErr.status === 500)
  const weird = await handleRelatelWebhook(PERSIST, SECRET, JSON.stringify(ev()), { admin: () => rpcOutcome('???') })
  check('uventet DB-svar → 500 (aldrig succes)', weird.status === 500)
  const sms = await handleRelatelWebhook(PERSIST, SECRET, JSON.stringify(ev({ event_type: 'sms.received' })), { admin: () => rpcOutcome('created') })
  check('SMS-hændelse gemmes ikke (ingen SMS-indtag aktiveret) — eksplicit persisted:false', sms.status === 202 && sms.body.persisted === false)

  // ---------------- kundeforslag: ukendt / ét / tvetydigt / læsefejl
  const suggestWith = async (customers: unknown[], contacts: unknown[], opts: { fail?: boolean; status?: string } = {}) => {
    const updates: Call[][] = []
    const { client } = fakeClient((table, calls) => {
      if (table === 'telephony_calls' && has(calls, 'update')) { updates.push(calls); return { data: null, error: null } }
      if (table === 'telephony_calls') return { data: { id: 'c1', external_number_normalized: '4512345678', match_status: opts.status ?? 'unmatched', customer_id: null }, error: null }
      if (opts.fail && table === 'customers') return { data: null, error: { message: 'boom' } }
      if (table === 'customers') return { data: customers, error: null }
      if (table === 'customer_contacts') return { data: contacts, error: null }
      return { data: [], error: null }
    })
    let outcome: string
    try { outcome = (await suggestCustomerForCall(client, 'c1')).outcome } catch { outcome = 'threw' }
    return { outcome, updates }
  }
  const none = await suggestWith([], [])
  check('ukendt nummer → no_match, intet skrevet (forbliver unmatched)', none.outcome === 'no_match' && none.updates.length === 0)
  const one = await suggestWith([{ id: 'k1', company_name: 'A', phone: '12345678', mobile: null }], [{ id: 'p1', customer_id: 'k1', name: 'x', phone: '+4512345678', mobile: null }])
  const oneUpdate = JSON.stringify(one.updates[0] ?? [])
  check('én kunde (kunde + kontakt på samme kunde) → suggested, kun forslag', one.outcome === 'suggested' && oneUpdate.includes('"suggested_customer_id":"k1"') && !oneUpdate.includes('"customer_id":"k1"'))
  const two = await suggestWith([{ id: 'k1', company_name: 'A', phone: '12345678', mobile: null }, { id: 'k2', company_name: 'B', phone: null, mobile: '12345678' }], [])
  check('flere kunder → ambiguous uden forslag', two.outcome === 'ambiguous' && JSON.stringify(two.updates[0]).includes('"suggested_customer_id":null'))
  const broken = await suggestWith([], [], { fail: true })
  check('læsefejl i opslag → fejl (aldrig "ingen match")', broken.outcome === 'threw' && broken.updates.length === 0)
  const human = await suggestWith([{ id: 'k1', company_name: 'A', phone: '12345678', mobile: null }], [], { status: 'rejected' })
  check('menneskelig beslutning (afvist) overskrives aldrig af forslag', human.outcome === 'skipped' && human.updates.length === 0)
  const suggestThrows = await handleRelatelWebhook({ ...PERSIST, TELEPHONY_MATCH_MODE: 'suggest' }, SECRET, JSON.stringify(ev()), {
    admin: () => fakeClient((t) => (t === 'telephony_calls' ? { data: null, error: { message: 'x' } } : { data: [], error: null }), () => ({ data: [{ outcome: 'created', call_id: 'c1' }], error: null })).client,
  })
  check('forslag fejler → opkald gemt, suggestion=error (ikke no_match)', suggestThrows.status === 202 && suggestThrows.body.suggestion === 'error')

  // ---------------- manuel kobling / rettigheder / revoke
  const UID = '11111111-1111-1111-1111-111111111111', CALL = '22222222-2222-2222-2222-222222222222', CUST = '33333333-3333-3333-3333-333333333333'
  const ctxWith = (perms: string[], tables: Handler, rpc?: (n: string, p: Record<string, unknown>) => { data: unknown; error: unknown }): CallActionCtx => {
    const user = fakeClient(tables).client, admin = fakeClient(tables, rpc).client
    return { supabase: user, admin, userId: UID, hasPermission: (p) => perms.includes(p) }
  }
  const visibleTables: Handler = (table, calls) => {
    if (table === 'telephony_calls' && has(calls, 'maybeSingle') && calls.some((c) => c.m === 'select' && String(c.args[0]).includes('service_case_id'))) return { data: { service_case_id: null }, error: null }
    if (table === 'telephony_calls') return { data: { id: CALL, customer_id: null, match_version: 0 }, error: null }
    if (table === 'customers') return { data: { id: CUST }, error: null }
    return { data: null, error: null }
  }
  let rpcParams: Record<string, unknown> | null = null
  const okRpc = (_n: string, p: Record<string, unknown>) => { rpcParams = p; return { data: [{ outcome: 'confirmed', match_version: 1 }], error: null } }
  const noPerm = await confirmCallCustomerCore(ctxWith([], visibleTables, okRpc), CALL, CUST, 0)
  check('manuel kobling uden calls.match afvises (revoke virker)', !noPerm.success && rpcParams === null)
  const okMatch = await confirmCallCustomerCore(ctxWith(['calls.match'], visibleTables, okRpc), CALL, CUST, 0)
  check('manuel kobling med calls.match → telephony_set_call_match (menneske, aktør, version)', okMatch.success && (rpcParams as any)?.p_action === 'confirm' && (rpcParams as any)?.p_actor === UID && (rpcParams as any)?.p_expected_version === 0)
  const stale = await confirmCallCustomerCore(ctxWith(['calls.match'], visibleTables, () => ({ data: [{ outcome: 'stale', match_version: 3 }], error: null })), CALL, CUST, 0)
  check('samtidig ændring → stale afvises', !stale.success)
  const badId = await confirmCallCustomerCore(ctxWith(['calls.match'], visibleTables, okRpc), 'x', CUST, 0)
  check('ugyldigt id afvises før databasen', !badId.success)
  const invisible = await confirmCallCustomerCore(ctxWith(['calls.match'], (t) => (t === 'telephony_calls' ? { data: null, error: null } : { data: { id: CUST }, error: null }), okRpc), CALL, CUST, 0)
  check('opkald brugeren ikke kan se (RLS) → "findes ikke"', !invisible.success)
  const hiddenCase: Handler = (table, calls) => {
    if (table === 'telephony_calls' && calls.some((c) => c.m === 'select' && String(c.args[0]) === 'service_case_id')) return { data: { service_case_id: '44444444-4444-4444-4444-444444444444' }, error: null }
    if (table === 'service_cases') return { data: null, error: null }
    return visibleTables(table, calls)
  }
  const refusedHidden = await rejectCallMatchCore(ctxWith(['calls.match'], hiddenCase, okRpc), CALL, 0)
  check('opkald koblet til en sag brugeren ikke kan se → ingen ændring', !refusedHidden.success)
  const listNo = await listCallsCore(ctxWith([], visibleTables), {})
  check('opkaldsliste uden calls.view/view_unmatched → ingen adgang', !listNo.available && listNo.calls.length === 0)
  const listErr = await listCallsCore(ctxWith(['calls.view'], () => ({ data: null, error: { code: '57014', message: 'timeout' } })), {})
  check('læsefejl i opkaldsliste → fejltekst (aldrig tom liste uden fejl)', listErr.available && !!listErr.error)
  check('forslag på kunde uden for scope fremstår som ukendt', JSON.stringify(projectCallMatch({ match_status: 'suggested', candidate_count: 1 }, false, false)) === JSON.stringify({ match_status: 'unmatched', candidate_count: 0 }))

  // ---------------- medarbejder-kobling
  const linkCtx = (opts: { existing?: unknown; profile?: unknown; insertError?: unknown; auditError?: unknown }, perms = ['users.manage_roles']) => ctxWith(perms, (table, calls) => {
    if (table === 'telephony_employee_links' && has(calls, 'maybeSingle')) return { data: opts.existing ?? null, error: null }
    if (table === 'telephony_employee_links' && (has(calls, 'insert') || has(calls, 'update'))) return { data: null, error: has(calls, 'insert') ? opts.insertError ?? null : null }
    if (table === 'profiles') return { data: opts.profile ?? null, error: null }
    if (table === 'audit_logs') return { data: null, error: opts.auditError ?? null }
    return { data: null, error: null }
  })
  const P = '55555555-5555-5555-5555-555555555555'
  check('kobling kræver users.manage_roles', !(await setEmployeeLinkCore(linkCtx({}, []), '1234', P)).success)
  check('kobling: udbyder-id skal være et id (navn med mellemrum afvises — aldrig navnematch)', !(await setEmployeeLinkCore(linkCtx({ profile: { id: P, is_active: true } }), 'Henrik C', P)).success)
  check('kobling til inaktiv bruger afvises', !(await setEmployeeLinkCore(linkCtx({ profile: { id: P, is_active: false } }), '1234', P)).success)
  const dupLink = await setEmployeeLinkCore(linkCtx({ profile: { id: P, is_active: true }, insertError: { code: '23505' } }), '1234', P)
  check('dublet-kobling (unik aktiv kobling) afvises', !dupLink.success && /findes allerede/.test(dupLink.error ?? ''))
  const created = await setEmployeeLinkCore(linkCtx({ profile: { id: P, is_active: true } }), '1234', P)
  check('ny kobling oprettes og auditeres', created.success && created.outcome === 'created')
  const auditFail = await setEmployeeLinkCore(linkCtx({ profile: { id: P, is_active: true }, auditError: { code: '42501' } }), '1234', P)
  check('audit-fejl ved kobling → meldes (ikke "gemt")', !auditFail.success && auditFail.auditFailed === true)
  const same = await setEmployeeLinkCore(linkCtx({ existing: { profile_id: P, is_active: true }, profile: { id: P, is_active: true } }), '1234', P)
  check('samme kobling igen → unchanged (ingen ny audit)', same.success && same.outcome === 'unchanged')

  // ---------------- tilbageringning: idempotens
  const open = [{ id: 't1', status: 'pending', auto_rule: 'assistant_callback' }]
  check('åben tilbageringning findes → genbruges (ingen ny opgave)', existingOpenCallback(open)?.id === 't1')
  check('afsluttet tilbageringning tæller ikke', existingOpenCallback([{ id: 't1', status: 'done', auto_rule: 'assistant_callback' }]) === null)
  check('gammel ubesvaret-opkald-opgave tæller som åben tilbageringning', existingOpenCallback([{ id: 't2', status: 'in_progress', auto_rule: 'assistant_missed_call' }])?.id === 't2')
  check('anden opgavetype tæller ikke', existingOpenCallback([{ id: 't3', status: 'pending', auto_rule: null }]) === null)
  check('kø-markeringer = køsidens regler', [...CALLBACK_RULES].sort().join() === ['assistant_callback', 'assistant_missed_call'].sort().join())
  const noCustomer = planCallbackInsert({ customerId: null, displayNumber: '+45 12 34 56 78', customerLabel: null, openCases: [], selectedCaseId: null, dueAtIso: '2026-11-15T10:00:00Z' })
  check('ukendt nummer → ingen tilbageringning før én kunde er valgt', !noCustomer.ok)
  const twoCases = planCallbackInsert({ customerId: 'k1', displayNumber: 'x', customerLabel: 'A', openCases: [{ id: 's1', customer_id: 'k1', case_number: '1', title: 'a' }, { id: 's2', customer_id: 'k1', case_number: '2', title: 'b' }], selectedCaseId: null, dueAtIso: '2026-11-15T10:00:00Z' })
  check('flere åbne sager → skal vælges (intet gæt)', !twoCases.ok)

  // ---------------- ingen ekstern skrivning / udbyderlæsning aldrig "tom succes"
  for (const env of [{}, { RELATEL_ENABLED: 'true' }, { RELATEL_ENABLED: 'true', RELATEL_LIVE_CALL_ENABLED: 'true', RELATEL_SMS_ENABLED: 'true' }]) {
    const p = createRelatelProvider(env)
    const [l, c, s] = await Promise.all([p.listCalls(), p.startCall('4512345678'), p.sendSms('4512345678', 'hej')])
    check(`udbyder (${Object.keys(env).length} flag): aldrig ringet/sendt, læsning = afvisning (ikke tom liste)`, !l.ok && !c.ok && !s.ok && !c.placed && !s.sent && p.mode !== ('active' as string))
  }
  let thrown = 0
  for (const op of ['listCalls', 'getContactByNumber', 'startCall', 'sendMessage'] as const) {
    try { await (disabledRelatelClient[op] as (a: never) => Promise<unknown>)({} as never) } catch { thrown++ }
  }
  check('kontrakt-klienten afviser alle operationer (intet netværk)', thrown === 4)
  check('alle flag fra som standard', !relatelEnabled({}) && !relatelLiveCallEnabled({}) && !relatelSmsEnabled({}) && !telephonyPersistEnabled({}))
  check('live-opkald/SMS kræver master-flaget', !relatelLiveCallEnabled({ RELATEL_LIVE_CALL_ENABLED: 'true' }) && !relatelSmsEnabled({ RELATEL_SMS_ENABLED: 'true' }))
  let adminTouched = 0
  const offPersist = await handleRelatelWebhook(ON, SECRET, JSON.stringify(ev()), { admin: () => { adminTouched++; throw new Error('må ikke kaldes') } })
  check('lagring fra: webhook rører ikke databasen', offPersist.status === 202 && offPersist.body.persisted === false && adminTouched === 0)

  // ---------------- Relatels officielle signatur (HMAC-SHA256 over `${t}.${rå krop}`)
  const KEY = 'whsec-test-key-not-real', OLD = 'whsec-old-key-not-real'
  const HM = { RELATEL_ENABLED: 'true', RELATEL_WEBHOOK_SIGNING_KEY: KEY }
  const NOW = 1_785_062_400
  const envBody = (over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) => JSON.stringify({ delivery_id: 'd-1', event_type: 'call.ended', occurred_at: '2026-11-15T10:00:00Z', payload, ...over })
  const signed = (raw: string, key = KEY, t = NOW, extra: Partial<WebhookAuthInput> = {}): WebhookAuthInput => ({ signature: `t=${t},v1=${signRelatelBody(key, t, raw)}`, timestamp: String(t), nowSeconds: NOW, ...extra })
  const rawT = envBody({ event_type: 'webhook.test' })
  check('signatur: korrekt HMAC → accepteret (webhook.test → 200, intet gemt)', (() => { const d = decideRelatelWebhook(HM, signed(rawT), rawT); return d.status === 200 && d.body.test === true && d.body.persisted === false })())
  check('signatur: forkert nøgle → 401', decideRelatelWebhook(HM, signed(rawT, 'forkert-nøgle'), rawT).status === 401)
  check('signatur: ændret krop → 401', decideRelatelWebhook(HM, signed(rawT), rawT.replace('d-1', 'd-2')).status === 401)
  check('signatur: forældet (> 5 min) → 401', decideRelatelWebhook(HM, { ...signed(rawT, KEY, NOW - 301) }, rawT).status === 401)
  check('signatur: fremtidig (> 5 min) → 401', decideRelatelWebhook(HM, { ...signed(rawT, KEY, NOW + 301) }, rawT).status === 401)
  check('signatur: manglende header → 401', decideRelatelWebhook(HM, { nowSeconds: NOW }, rawT).status === 401)
  check('signatur: misdannet header → 401', decideRelatelWebhook(HM, { signature: 'v1=abc', nowSeconds: NOW }, rawT).status === 401)
  check('signatur: Relatel-Timestamp ≠ signeret t → 401', decideRelatelWebhook(HM, signed(rawT, KEY, NOW, { timestamp: String(NOW - 1) }), rawT).status === 401)
  check('signatur: statisk header alene accepteres IKKE i HMAC-tilstand', decideRelatelWebhook({ ...HM, RELATEL_WEBHOOK_SECRET: SECRET }, { staticSecret: SECRET, nowSeconds: NOW }, rawT).status === 401)
  const rot = { ...HM, RELATEL_WEBHOOK_SIGNING_KEY_PREVIOUS: OLD }
  const twoSig = { signature: `t=${NOW},v1=${'0'.repeat(64)},v1=${signRelatelBody(OLD, NOW, rawT)}`, timestamp: String(NOW), nowSeconds: NOW }
  check('rotation: flere v1-segmenter, ét passer med forrige nøgle → accepteret', decideRelatelWebhook(rot, twoSig, rawT).status === 200)
  check('parseSignatureHeader: ukendt segment ignoreres, kun v1 tæller', parseSignatureHeader(`t=1,v0=x,v1=${'a'.repeat(64)}`)?.v1.length === 1)
  check('verify uden nøgle → no_key', verifyRelatelSignature({ rawBody: '', signatureHeader: 'x', keys: [], nowSeconds: 0 }).ok === false)
  check('ingen nøgle overhovedet → 503', decideRelatelWebhook({ RELATEL_ENABLED: 'true' }, { nowSeconds: NOW }, rawT).status === 503)
  check('godkendelsestilstand: hmac > static_legacy > none', webhookAuthMode(HM) === 'hmac' && webhookAuthMode(ON) === 'static_legacy' && webhookAuthMode({}) === 'none')
  check('statisk hemmelighed + lagring uden testflag → 503 (ikke produktionsklar)', decideRelatelWebhook({ ...ON, TELEPHONY_PERSIST_ENABLED: 'true' }, SECRET, JSON.stringify(ev())).status === 503)

  // ---------------- Relatels konvolut
  const callPayload = { call_uuid: 'cu-1', direction: 'incoming', from_number: '4512345678', to_number: '4570000000', started_at: '2026-11-15T09:59:00Z', answered_at: null, ended_at: '2026-11-15T10:00:00Z', status: 'missed', talk_duration: null }
  const rawMissed = envBody({}, callPayload)
  const dm = decideRelatelWebhook(HM, signed(rawMissed), rawMissed)
  check('call.ended (status missed) → forstået, idempotens = Relatel-Delivery-Id', dm.status === 202 && dm.body.idempotencyKey === 'relatel:delivery:d-1')
  const mm = mapRelatelCallPayload({ deliveryId: 'd-1', eventType: 'call.ended', occurredAt: '2026-11-15T10:00:00.000Z', payload: callPayload })
  check('kortlægning: incoming→inbound, ubesvaret→call.missed, call_uuid = opkalds-id', mm.ok && mm.event.direction === 'inbound' && mm.event.eventType === 'call.missed' && mm.event.externalId === 'cu-1' && mm.event.answered === false)
  const ma = mapRelatelCallPayload({ deliveryId: 'd-2', eventType: 'call.ended', occurredAt: '2026-11-15T10:00:00.000Z', payload: { ...callPayload, status: 'answered', answered_at: '2026-11-15T09:59:10Z', talk_duration: 50, answered_by: { id: 77 } } })
  check('kortlægning: besvaret → call.ended, varighed, besvarende medarbejder-id', ma.ok && ma.event.eventType === 'call.ended' && ma.event.durationSeconds === 50 && ma.event.providerEmployeeId === '77')
  const mo = mapRelatelCallPayload({ deliveryId: 'd-3', eventType: 'call.ended', occurredAt: '2026-11-15T10:00:00.000Z', payload: { ...callPayload, direction: 'outgoing', status: 'missed' } })
  check('kortlægning: udgående uden svar er ikke "ubesvaret indgående"', mo.ok && mo.event.direction === 'outbound' && mo.event.eventType === 'call.ended')
  const mv = mapRelatelCallPayload({ deliveryId: 'd-4', eventType: 'call.ended', occurredAt: '2026-11-15T10:00:00.000Z', payload: { ...callPayload, status: 'voicemail', voice_mail: { id: 9, duration: 31, sound: { url: 'https://x.invalid/v.mp3' } } } })
  check('kortlægning: telefonsvarer = metadata (id, varighed), ingen lyd-URL', mv.ok && mv.event.hasVoicemail && mv.event.providerVoicemailId === '9' && mv.event.voicemailDurationSeconds === 31 && !JSON.stringify(mv.event).includes('mp3'))
  const mc = mapRelatelCallPayload({ deliveryId: 'd-5', eventType: 'call.created', occurredAt: '2026-11-15T09:59:00.000Z', payload: callPayload })
  check('call.created → call.started', mc.ok && mc.event.eventType === 'call.started')
  const rawUnknown = envBody({}, { foo: 'bar', nested: { x: 1 } })
  const unkOff = await handleRelatelWebhook(HM, signed(rawUnknown), rawUnknown, { admin: () => { throw new Error('nej') }, log: (_m, meta) => { loggedShape = JSON.stringify(meta) } })
  check('ukendt opkalds-payload, lagring fra → 202 persisted:false (capture), intet gemt', unkOff.status === 202 && unkOff.body.persisted === false && unkOff.body.reason === 'payload_unverified')
  check('capture logger kun feltnavne/typer — aldrig værdier', loggedShape.includes('"foo":"string"') && !loggedShape.includes('bar'))
  const unkOn = decideRelatelWebhook({ ...HM, TELEPHONY_PERSIST_ENABLED: 'true' }, signed(rawUnknown), rawUnknown)
  check('ukendt opkalds-payload, lagring til → 422 (aldrig stille "gemt")', unkOn.status === 422)
  const rawSms = envBody({ event_type: 'incoming_message.created' }, { body: 'hej' })
  check('indgående SMS (dokumenteret) → 202 ignored, ikke gemt', (() => { const d = decideRelatelWebhook(HM, signed(rawSms), rawSms); return d.status === 202 && d.body.ignored === true && d.body.persisted === false })())
  const rawChat = envBody({ event_type: 'chat.new' })
  check('chat (dokumenteret) → 202 ignored, ikke gemt', decideRelatelWebhook(HM, signed(rawChat), rawChat).body.ignored === true)
  const rawUnk = envBody({ event_type: 'call.transferred' })
  check('ukendt Relatel-hændelsestype → 400', decideRelatelWebhook(HM, signed(rawUnk), rawUnk).status === 400)
  check('Relatel-Delivery-Id ≠ delivery_id → 400', decideRelatelWebhook(HM, signed(rawMissed, KEY, NOW, { deliveryId: 'andet' }), rawMissed).status === 400)
  const rawNoId = JSON.stringify({ delivery_id: '', event_type: 'call.ended', occurred_at: '2026-11-15T10:00:00Z', payload: {} })
  check('konvolut uden delivery_id → 400', decideRelatelWebhook(HM, signed(rawNoId), rawNoId).status === 400)
  const rawBadTime = envBody({ occurred_at: 'nu' })
  check('konvolut uden gyldigt occurred_at → 400', decideRelatelWebhook(HM, signed(rawBadTime), rawBadTime).status === 400)
  check('shape: dybde begrænset, ingen værdier', JSON.stringify(describePayloadShape({ a: { b: { c: 'hemmelig' } }, n: 5 })) === '{"a":{"b":"object"},"n":"number"}')
  const dupA = mapRelatelCallPayload({ deliveryId: 'same', eventType: 'call.ended', occurredAt: '2026-11-15T10:00:00.000Z', payload: callPayload })
  const dupB = mapRelatelCallPayload({ deliveryId: 'same', eventType: 'call.ended', occurredAt: '2026-11-15T10:05:00.000Z', payload: callPayload })
  check('genlevering (samme Delivery-Id, andet tidspunkt) → samme idempotensnøgle', dupA.ok && dupB.ok && dupA.event.idempotencyKey === dupB.event.idempotencyKey)

  // ---------------- observationstilstand (lagring FRA): kun skema-metadata for GODKENDTE leveringer
  {
    const obs: unknown[] = [], logs: Array<{ m: string; meta: Record<string, unknown> }> = []
    const deps = { admin: () => { throw new Error('admin må ikke kaldes i observation') }, log: (m: string, meta: Record<string, unknown>) => { logs.push({ m, meta }) }, observe: (o: unknown) => { obs.push(o) } }
    const t1 = await handleRelatelWebhook(HM, signed(rawT), rawT, deps as never)
    check('observation: webhook.test → 200, én observation (test_acknowledged, nøgle current)', t1.status === 200 && obs.length === 1 && (obs[0] as any).outcome === 'test_acknowledged' && (obs[0] as any).keySlot === 'current')
    obs.length = 0
    const realCall = envBody({ delivery_id: 'd-obs' }, { ...callPayload, from_number: '4598765432', answered_by: { id: 5, name: 'Hemmelig Medarbejder' } })
    const t2 = await handleRelatelWebhook(HM, signed(realCall), realCall, deps as never)
    const o2 = JSON.stringify(obs)
    check('observation: opkald forstået men IKKE gemt (202 persisted:false), databasen ikke rørt', t2.status === 202 && t2.body.persisted === false)
    check('observation: indeholder kun feltnavne/typer — ingen numre, navne, uuid eller delivery-id', obs.length === 1 && !/4598765432|Hemmelig|cu-1|d-obs/.test(o2) && o2.includes('"from_number":"string"'))
    obs.length = 0
    await handleRelatelWebhook(rot, twoSig, rawT, deps as never)
    check('observation: rotation viser nøgleplads previous', (obs[0] as any)?.keySlot === 'previous')
    obs.length = 0; logs.length = 0
    const bad = await handleRelatelWebhook(HM, signed(rawT, 'forkert'), rawT, deps as never)
    check('observation: afvist signatur → 401, INGEN observation (anonymt kald skriver ikke i databasen)', bad.status === 401 && obs.length === 0)
    check('observation: afvisningsgrund kun i konsol-log, uden nøgle/signatur', logs.some((l) => l.meta.reason === 'mismatch') && !JSON.stringify(logs).includes(KEY))
    obs.length = 0
    await handleRelatelWebhook({}, signed(rawT), rawT, deps as never)
    check('observation: flag fra → 404, ingen observation', obs.length === 0)
    let persistAdmin = 0
    await handleRelatelWebhook({ ...HM, TELEPHONY_PERSIST_ENABLED: 'true' }, signed(rawT), rawT, { ...deps, admin: () => { persistAdmin++; throw new Error('x') } } as never)
    check('observation kun når lagring er FRA (lagring til → ingen observationsskrivning)', obs.length === 0)
    const throwing = await handleRelatelWebhook(HM, signed(rawT), rawT, { ...deps, observe: () => { throw new Error('db nede') } } as never)
    check('observation der fejler vælter ikke svaret', throwing.status === 200)
    check('kun "forrige" nøgle uden aktuel → ingen nøgle (503, aldrig gammel nøgle alene)', decideRelatelWebhook({ RELATEL_ENABLED: 'true', RELATEL_WEBHOOK_SIGNING_KEY_PREVIOUS: OLD }, twoSig, rawT).status === 503)
    void persistAdmin
  }

  // ---------------- retention (forslag; ikke planlagt)
  const now = new Date('2026-11-15T12:00:00Z')
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
  check('retention: ubekræftet 89 dage → behold', telephonyRetentionDecision({ customerId: null, serviceCaseId: null, caseClosedAt: null, startedAt: ago(89), endedAt: ago(89) }, now).action === 'keep')
  check('retention: ubekræftet 91 dage → slet (= DB-reglen)', JSON.stringify(telephonyRetentionDecision({ customerId: null, serviceCaseId: null, caseClosedAt: null, startedAt: ago(91), endedAt: ago(91) }, now)) === '{"action":"delete","category":"unmatched"}')
  check('retention: bekræftet kunde 2 år → behold', telephonyRetentionDecision({ customerId: 'k', serviceCaseId: null, caseClosedAt: null, startedAt: ago(730), endedAt: ago(730) }, now).action === 'keep')
  check('retention: bekræftet kunde > 36 mdr → slet', telephonyRetentionDecision({ customerId: 'k', serviceCaseId: null, caseClosedAt: null, startedAt: ago(1100), endedAt: ago(1100) }, now).action === 'delete')
  check('retention: åben sag → altid behold', JSON.stringify(telephonyRetentionDecision({ customerId: 'k', serviceCaseId: 's', caseClosedAt: null, startedAt: ago(4000), endedAt: ago(4000) }, now)) === '{"action":"keep","reason":"case_open"}')
  check('retention: lukket sag < 36 mdr efter lukning → behold', telephonyRetentionDecision({ customerId: 'k', serviceCaseId: 's', caseClosedAt: ago(100), startedAt: ago(4000), endedAt: ago(4000) }, now).action === 'keep')
  check('retention: ukendt alder → review (aldrig slet i blinde)', telephonyRetentionDecision({ customerId: null, serviceCaseId: null, caseClosedAt: null, startedAt: null, endedAt: null }, now).action === 'review')
  check('retention: rå hændelser > 90 dage efter afslutning kan ryddes; igangværende aldrig', telephonyEventPurgeable(ago(91), now) && !telephonyEventPurgeable(ago(10), now) && !telephonyEventPurgeable(null, now))

  // ---------------- kildeværn (wiring der ikke kan køres uden Next/DB)
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  const tl = src('src/lib/actions/communication-timeline.ts')
  check('tidslinje: opkald kun med calls.view (skjult ellers — montør ser ikke firmaets opkald)', /read\('calls', !ctx\.hasPermission\('calls\.view'\)/.test(tl))
  check('tidslinje: kun kolonner fra authenticated-grantet (ingen numre/udbyder-id/forslag)', /telephony_calls'\)\.select\('id, direction, started_at, status, missed, has_voicemail, duration_seconds'\)/.test(tl))
  const tasks = src('src/lib/actions/customer-tasks.ts')
  check('tilbageringning: idempotens-tjek før insert i den kanoniske opgave-handling', /existingOpenCallback\(/.test(tasks) && tasks.indexOf('existingOpenCallback(') < tasks.indexOf("from('customer_tasks').insert"))
  check('tilbageringning: læsefejl opretter intet', /openCbErr\) return \{ success: false/.test(tasks))
  const page = src('src/app/dashboard/cti/calls/page.tsx')
  check('opkaldsliste: kræver calls.view eller calls.view_unmatched; match-knapper kun med calls.match', /!perms\.has\('calls\.view'\) && !perms\.has\('calls\.view_unmatched'\)/.test(page) && /canMatch && <CallMatchActions/.test(page))
  check('opkaldsliste: ingen ring-op/SMS-handling', !/startCall|sendSms|switch\/dial|tel:/.test(page) && !/startCall|sendSms|tel:/.test(src('src/app/dashboard/cti/calls/call-match-actions.tsx')))
  const route = src('src/app/api/integrations/relatel/webhook/route.ts')
  check('webhook-route sender Relatel-Signature/-Timestamp/-Delivery-Id videre', /relatel-signature/.test(route) && /relatel-timestamp/.test(route) && /relatel-delivery-id/.test(route))
  check('ingen kode kalder Relatels click-to-call eller SMS-endpoint', !/switch\/dial|\/messages['"`]|app\.relatel\.dk\/api/.test([route, src('src/lib/integrations/telephony/webhook-gate.ts'), src('src/lib/integrations/telephony/provider.ts')].join('\n')))

  console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle Relatel-review-tjek bestået')
  process.exitCode = fail ? 1 : 0
}
main()
