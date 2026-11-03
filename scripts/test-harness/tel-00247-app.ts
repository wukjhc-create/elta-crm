/**
 * 00247 app-laget på STAGING (kræver at 00247 er anvendt): webhook → lagring → forslag, kontrollerede handlinger med
 * rigtige persona-klienter, medarbejder-kobling og 90-dages oprydning. Skriver testrækker (prefix p247a-) og fixture-
 * kunder/sager på staging og sletter dem igen i `finally`. Ingen prod, intet netværk til Relatel, ingen live-flag:
 * flagene sættes kun i det env-objekt testen giver handleren; webhook-hemmeligheden er en tilfældig testværdi.
 *   npx tsx scripts/test-harness/cli.ts tel-00247-app
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import { setup240, type M240Check } from './mp-00240-scope-check'
import { handleRelatelWebhook } from '../../src/lib/integrations/telephony/webhook-gate'
import { handleTelephonyRetention } from '../../src/lib/integrations/telephony/retention'
import { lookupCaller } from '../../src/lib/integrations/relatel/lookup'
import {
  confirmCallCustomerCore, linkCallCaseCore, listCallsCore, rejectCallMatchCore, setEmployeeLinkCore, type CallActionCtx,
} from '../../src/lib/telephony/call-actions-core'
import type { Permission } from '../../src/lib/auth/permissions'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>
const KEYS: Permission[] = ['calls.view', 'calls.view_unmatched', 'calls.match', 'users.manage_roles']

export async function runTel00247App(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const j = (x: unknown) => JSON.stringify(x)
  const eq = (id: string, got: unknown, want: unknown) => add(id, j(got) === j(want), j(got) === j(want) ? '' : `fik ${j(got)}, forventet ${j(want)}`)
  const stamp = randomUUID().slice(0, 8)
  const pre = `p247a-${stamp}`
  const startedAt = new Date().toISOString()
  let tWebhook = startedAt
  const sql1 = async (q: string) => { const r = await c.rawSql(q); if (!r.ok) throw new Error(r.text.slice(0, 200)); return JSON.parse(r.text)[0] }
  const SIDE = () => `SELECT (SELECT count(*)::int FROM public.customer_tasks) tasks,
    (SELECT count(*)::int FROM public.customer_tasks WHERE reminder_at IS NOT NULL) reminders,
    (SELECT count(*)::int FROM public.audit_logs WHERE entity_type NOT IN ('telephony_call', 'telephony_employee_link') AND created_at >= '${tWebhook}') audit_other`
  const tableCounts = async () => {
    const tables = await c.rawSql(`SELECT coalesce(json_agg(table_name ORDER BY table_name), '[]') t FROM (SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'created_at'
      AND table_name ILIKE ANY (ARRAY['%sms%', '%telegram%', '%outbox%', '%webhook%', '%sent_email%', '%email_log%', 'email_messages', 'emails', 'email_events', 'sent_quotes', 'portal_messages', 'messages'])) x`)
    const names = (JSON.parse(tables.text)[0].t as string[])
    const res: Record<string, number> = {}
    for (const t of names) res[t] = (await sql1(`SELECT count(*)::int n FROM public."${t.replace(/"/g, '')}" WHERE created_at >= '${tWebhook}'`)).n
    return res
  }

  const { fx, cleanup } = await setup240(c)
  const customers: string[] = [], cases: string[] = []
  const emp = `${pre}-emp`, emp2 = `${pre}-emp2`
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const persona = async (cl: SupabaseClient): Promise<CallActionCtx> => {
      const uid = (await cl.auth.getUser()).data.user!.id
      const set = new Set<Permission>()
      for (const k of KEYS) if ((await cl.rpc('user_has_permission', { p_permission: k })).data === true) set.add(k)
      return { supabase: cl, admin: c.admin, userId: uid, hasPermission: (k) => set.has(k) }
    }
    const adminCl = p.get('admin' as never)! as SupabaseClient
    const A = await persona(adminCl)
    const SL = await persona(p.get('serviceleder' as never)! as SupabaseClient)
    const BO = await persona(p.get('bogholderi' as never)! as SupabaseClient)
    const S = await persona(fx.s.cl)
    eq('effektive rettigheder: admin alle; serviceleder uden users.manage_roles; salg view+match; bogholderi ingen',
      [KEYS.filter((k) => A.hasPermission(k)), KEYS.filter((k) => SL.hasPermission(k)), KEYS.filter((k) => S.hasPermission(k)), KEYS.filter((k) => BO.hasPermission(k))],
      [KEYS, ['calls.view', 'calls.view_unmatched', 'calls.match'], ['calls.view', 'calls.match'], []])

    // ---- fixtures: unikke svenske numre (kontrolleret ukendte på staging før brug)
    const rnd = () => `4670${String(1_000_000 + Math.floor(Math.random() * 8_999_999))}`
    const num = { one: rnd(), amb: rnd(), contacts: rnd(), zero: rnd(), old: rnd(), unknownEmp: rnd() }
    for (const n of Object.values(num)) if ((await lookupCaller(c.admin, n)).matches.length) throw new Error('testnummer findes allerede på staging')
    const spaced = (n: string) => `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 7)} ${n.slice(7)}`
    const adminUid = A.userId
    const mkCust = async (extra: Record<string, unknown>) => {
      const { data, error } = await c.admin.from('customers').insert({ customer_number: `HARN-247A-${stamp}-${customers.length + 1}`, company_name: `[HARNESS] 247a ${customers.length + 1}`, contact_person: 'R', email: `p247a-${stamp}-${customers.length + 1}@harness.test`, created_by: adminUid, custom_fields: { harness: '247a' }, ...extra }).select('id').single()
      if (error) throw new Error(`customer: ${error.message}`)
      customers.push(data.id); return data.id as string
    }
    const K1 = await mkCust({ phone: spaced(num.one) })
    const K2a = await mkCust({ mobile: `00${num.amb}` }), K2b = await mkCust({ phone: `+${num.amb}` })
    const K3 = await mkCust({})
    const { error: ccErr } = await c.admin.from('customer_contacts').insert([{ customer_id: K3, name: '[HARNESS] 247a kontakt 1', phone: spaced(num.contacts) }, { customer_id: K3, name: '[HARNESS] 247a kontakt 2', mobile: `+${num.contacts}` }])
    if (ccErr) throw new Error(`contacts: ${ccErr.message}`)
    const mkCase = async (customerId: string) => {
      const { data, error } = await c.admin.from('service_cases').insert({ title: '[HARNESS] 247a', customer_id: customerId, created_by: adminUid }).select('id').single()
      if (error) throw new Error(`case: ${error.message}`)
      cases.push(data.id); return data.id as string
    }
    const caseK1 = await mkCase(K1), caseK3 = await mkCase(K3)

    // ---- webhook (sideeffekter måles fra her — fixtures ovenfor er bevidste skrivninger)
    tWebhook = new Date().toISOString()
    const side0 = await sql1(SIDE())
    const secret = randomBytes(24).toString('base64url')
    const ENV_OFF: Record<string, string> = {}
    const ENV_NOPERSIST = { RELATEL_ENABLED: 'true', RELATEL_WEBHOOK_SECRET: secret }
    const ENV = { ...ENV_NOPERSIST, TELEPHONY_PERSIST_ENABLED: 'true', TELEPHONY_MATCH_MODE: 'suggest' }
    const now = Date.now()
    const ev = (id: string, call: string, type: string, offsetS: number, from: string, extra: Record<string, unknown> = {}) => ({
      provider: 'relatel', event_id: `${pre}-${id}`, event_type: type, occurred_at: new Date(now - 3600_000 + offsetS * 1000).toISOString(),
      call: { uuid: `${pre}-${call}`, direction: 'inbound', from: `+${from}`, to: '+4570000000', ...extra },
    })
    const post = async (env: Record<string, string>, body: unknown) => handleRelatelWebhook(env, secret, JSON.stringify(body), { admin: () => c.admin })
    const callRow = async (call: string) => (await c.admin.from('telephony_calls').select('*').eq('provider_call_id', `${pre}-${call}`).maybeSingle()).data as Record<string, any> | null
    const nCalls = async (call: string) => (await c.admin.from('telephony_calls').select('id', { count: 'exact', head: true }).eq('provider_call_id', `${pre}-${call}`)).count

    eq('W1 flag fra → 404 (som i dag)', (await post(ENV_OFF, ev('off', 'off', 'call.started', 0, num.one))).status, 404)
    const np = await post(ENV_NOPERSIST, ev('np', 'np', 'call.started', 0, num.one))
    eq('W1 RELATEL_ENABLED uden TELEPHONY_PERSIST_ENABLED → 202 persisted:false, intet gemt', [np.status, np.body.persisted, await nCalls('np')], [202, false, 0])
    eq('W1 forkert hemmelighed → 401', (await handleRelatelWebhook(ENV, 'forkert', JSON.stringify(ev('x', 'x', 'call.started', 0, num.one)), { admin: () => c.admin })).status, 401)

    // medarbejder-kobling via den kontrollerede sti
    eq('E1 serviceleder (uden users.manage_roles) kan ikke koble medarbejdere', (await setEmployeeLinkCore(SL, emp, fx.m.uid)).success, false)
    eq('E1 admin kobler Relatel-id → montør (created); samme igen → unchanged', [(await setEmployeeLinkCore(A, emp, fx.m.uid)).outcome, (await setEmployeeLinkCore(A, emp, fx.m.uid)).outcome], ['created', 'unchanged'])
    eq('E1 ugyldigt id / ukendt profil afvises', [(await setEmployeeLinkCore(A, 'a b', fx.m.uid)).success, (await setEmployeeLinkCore(A, emp2, randomUUID())).success], [false, false])

    const s1 = await post(ENV, ev('c1-s', 'c1', 'call.started', 0, num.one))
    const s1b = await post(ENV, ev('c1-s', 'c1', 'call.started', 0, num.one))
    eq('W2 første hændelse → 202 created + forslag; identisk gentagelse → duplicate', [s1.status, s1.body.outcome, s1.body.suggestion, s1b.status, s1b.body.outcome], [202, 'created', 'suggested', 202, 'duplicate'])
    const a1 = await post(ENV, ev('c1-a', 'c1', 'call.answered', 4, num.one, { employee_id: emp }))
    const e1 = await post(ENV, ev('c1-e', 'c1', 'call.ended', 94, num.one, { duration_seconds: 90, answered: true, employee_id: emp }))
    const r1 = await callRow('c1')
    eq('W2 answered + ended → én række: ended, 90 s, medarbejder → montør-profil, 3 hændelser', [a1.body.outcome, e1.body.outcome, r1?.status, r1?.duration_seconds, r1?.employee_profile_id, (await c.admin.from('telephony_events').select('id', { count: 'exact', head: true }).eq('call_id', r1?.id)).count], ['created', 'created', 'ended', 90, fx.m.uid, 3])
    eq('M1 præcis ét match → KUN forslag (suggested, K1), aldrig bekræftet', [r1?.match_status, r1?.suggested_customer_id, r1?.candidate_count, r1?.customer_id, r1?.service_case_id], ['suggested', K1, 1, null, null])
    const conflict = await post(ENV, ev('c1-s', 'c1-other', 'call.started', 0, num.one))
    eq('W3 genbrugt hændelses-id med andet opkald → 409, intet nyt opkald', [conflict.status, await nCalls('c1-other')], [409, 0])
    const sms = await post(ENV, { provider: 'relatel', event_id: `${pre}-sms`, event_type: 'sms.received', occurred_at: new Date().toISOString(), call: { uuid: `${pre}-sms`, from: `+${num.one}`, to: '+4570000000' } })
    eq('W4 SMS → 202 persisted:false, intet gemt', [sms.status, sms.body.persisted, await nCalls('sms')], [202, false, 0])
    const bad = await post(ENV, { ...ev('bad', 'bad', 'call.started', 0, num.one), call: { uuid: `${pre}-bad`, direction: 'inbound', from: 'ring mig', to: '+4570000000' } })
    eq('M8 ugyldigt/ikke-normaliserbart nummer → 400, intet gemt', [bad.status, await nCalls('bad')], [400, 0])

    const z = await post(ENV, ev('z-m', 'z', 'call.missed', 0, num.zero, { answered: false }))
    const rz = await callRow('z')
    eq('M2 nul match → unmatched, 0 kandidater, ingen kunde', [z.body.suggestion, rz?.match_status, rz?.candidate_count, rz?.suggested_customer_id, rz?.status, rz?.missed], ['no_match', 'unmatched', 0, null, 'missed', true])
    const am = await post(ENV, ev('am-m', 'am', 'call.missed', 0, num.amb, { answered: false }))
    const ram = await callRow('am')
    eq('M3 flere kunder (også forskellige formater: 00…, +…) → ambiguous, 2 kandidater, ingen kunde valgt', [am.body.suggestion, ram?.match_status, ram?.candidate_count, ram?.suggested_customer_id, ram?.customer_id], ['ambiguous', 'ambiguous', 2, null, null])
    await post(ENV, ev('ct-m', 'ct', 'call.missed', 0, num.contacts, { answered: false }))
    const rct = await callRow('ct')
    eq('M4 samme nummer på flere kontakter hos SAMME kunde → én kandidat (forslag K3)', [rct?.match_status, rct?.candidate_count, rct?.suggested_customer_id], ['suggested', 1, K3])
    const ue = await post(ENV, ev('ue-a', 'ue', 'call.answered', 0, num.unknownEmp, { employee_id: `${pre}-ukendt` }))
    const rue = await callRow('ue')
    eq('E2 ukendt medarbejder-id → ingen profil valgt', [ue.body.outcome, rue?.provider_employee_id, rue?.employee_profile_id], ['created', `${pre}-ukendt`, null])

    // ---- handlinger med persona-klienter
    const S_list = await listCallsCore(S, {})
    eq('P1 salg (uden calls.view_unmatched) ser ingen ubekræftede opkald', S_list.calls.filter((x) => x.customer === null).length, 0)
    eq('P1 bogholderi (ingen calls.*) får ingen liste', (await listCallsCore(BO, {})).available, false)
    eq('P2 salg kan ikke bekræfte et ubekræftet opkald (ser det ikke)', await confirmCallCustomerCore(S, r1!.id, K1, 0), { success: false, error: 'Opkaldet findes ikke.' })
    eq('P2 bogholderi har ikke calls.match', (await confirmCallCustomerCore(BO, r1!.id, K1, 0)).success, false)
    // forslag giver ikke adgang: montør med calls.view_unmatched ser opkaldet, men ikke K1 (ikke i montørens scope)
    await c.admin.from('user_permission_overrides').insert([
      { profile_id: fx.m.uid, permission: 'calls.view_unmatched', effect: 'grant', source: 'manual', reason: 'tel247app' },
      { profile_id: fx.m.uid, permission: 'calls.match', effect: 'grant', source: 'manual', reason: 'tel247app' },
    ])
    const M = await persona(fx.m.cl)
    const mList = await listCallsCore(M, {})
    const mC1 = mList.calls.find((x) => x.id === r1!.id)
    eq('P3 montør + calls.view_unmatched ser det ubekræftede opkald, men forslaget skjules (kunden er uden for scope)', [!!mC1, mC1?.match_status, mC1?.suggestion], [true, 'suggested', null])
    const aC1 = (await listCallsCore(A, {})).calls.find((x) => x.id === r1!.id)
    eq('P3 admin ser forslaget med kundenavn; ingen udbyder-id’er i listen', [aC1?.suggestion?.id, Object.keys(aC1 ?? {}).some((k) => /provider/.test(k))], [K1, false])
    eq('P3 montør kan ikke bekræfte til en kunde uden for scope', await confirmCallCustomerCore(M, r1!.id, K1, 0), { success: false, error: 'Kunden findes ikke.' })

    const cf = await confirmCallCustomerCore(A, r1!.id, K1, 0)
    eq('M5 admin bekræfter forslaget → confirmed v1; gammel version → stale', [cf, (await confirmCallCustomerCore(A, r1!.id, K3, 0)).success], [{ success: true, outcome: 'confirmed', version: 1 }, false])
    const later = await post(ENV, ev('c1-v', 'c1', 'voicemail.created', 120, num.one, { duration_seconds: 90 }))
    eq('M5 senere hændelse på et bekræftet opkald ændrer ikke bekræftelsen', [later.body.outcome, later.body.suggestion, (await callRow('c1'))?.customer_id, (await callRow('c1'))?.match_status], ['created', 'skipped', K1, 'confirmed'])
    await post(ENV, ev('c2-s', 'c2', 'call.started', 0, num.one))
    const r2 = await callRow('c2')
    eq('M5 nyt opkald fra et tidligere BEKRÆFTET nummer → stadig kun forslag', [r2?.match_status, r2?.suggested_customer_id, r2?.customer_id], ['suggested', K1, null])

    // sag: separat handling; skal kunne ses af brugeren og høre til kunden
    eq('C1 sag fra en anden kunde → afvist', await linkCallCaseCore(A, r1!.id, caseK3, 1), { success: false, error: 'Sagen hører ikke til opkaldets kunde.' })
    eq('C1 salg ser opkaldet (bekræftet, view.all), men ikke admins sag → afvist', await linkCallCaseCore(S, r1!.id, caseK1, 1), { success: false, error: 'Sagen findes ikke.' })
    eq('C1 sag på ubekræftet opkald → afvist', (await linkCallCaseCore(A, r2!.id, caseK1, 0)).success, false)
    const lk = await linkCallCaseCore(A, r1!.id, caseK1, 1)
    eq('C2 admin kobler sagen → case_linked v2; fjern → case_unlinked v3', [lk, await linkCallCaseCore(A, r1!.id, null, 2)], [{ success: true, outcome: 'case_linked', version: 2 }, { success: true, outcome: 'case_unlinked', version: 3 }])
    await linkCallCaseCore(A, r1!.id, caseK1, 3)
    const corr = await confirmCallCustomerCore(A, r1!.id, K3, 4)
    const rc = await callRow('c1')
    eq('M6 rettet match → corrected v5; den gamle sag fjernes', [corr, rc?.customer_id, rc?.service_case_id], [{ success: true, outcome: 'corrected', version: 5 }, K3, null])
    const rej = await rejectCallMatchCore(A, r1!.id, 5)
    await post(ENV, ev('c1-e2', 'c1', 'call.ended', 150, num.one, { duration_seconds: 140 }))
    const rr = await callRow('c1')
    eq('M7 fjern forkert match → rejected v6; ny hændelse foreslår ikke igen', [rej, rr?.match_status, rr?.customer_id, rr?.suggested_customer_id, rr?.duration_seconds], [{ success: true, outcome: 'rejected', version: 6 }, 'rejected', null, null, 140])
    const audit = (await c.admin.from('audit_logs').select('action, user_id').eq('entity_type', 'telephony_call').eq('entity_id', r1!.id)).data as Array<{ action: string; user_id: string }>
    eq('M7 audit: confirmed, case_linked ×2, case_unlinked, corrected, rejected — alle af admin', [audit.map((x) => x.action).sort(), audit.every((x) => x.user_id === A.userId)],
      [['call_case_linked', 'call_case_linked', 'call_case_unlinked', 'call_match_confirmed', 'call_match_corrected', 'call_match_rejected'], true])

    // medarbejder: ændret kobling, deaktiveret profil, deaktiveret kobling
    eq('E3 ændret kobling (montør → salg) → changed', (await setEmployeeLinkCore(A, emp, fx.s.uid)).outcome, 'changed')
    await post(ENV, ev('e3-a', 'e3', 'call.answered', 0, num.zero, { employee_id: emp }))
    eq('E3 nye opkald får den nye profil; gamle beholder deres', [(await callRow('e3'))?.employee_profile_id, (await callRow('c1'))?.employee_profile_id], [fx.s.uid, fx.m.uid])
    await c.admin.from('profiles').update({ is_active: false }).eq('id', fx.s.uid)
    await post(ENV, ev('e4-a', 'e4', 'call.answered', 0, num.zero, { employee_id: emp }))
    await c.admin.from('profiles').update({ is_active: true }).eq('id', fx.s.uid)
    eq('E4 deaktiveret profil → ingen profil', (await callRow('e4'))?.employee_profile_id, null)
    eq('E5 deaktiver kobling → deactivated', (await setEmployeeLinkCore(A, emp, null)).outcome, 'deactivated')
    await post(ENV, ev('e5-a', 'e5', 'call.answered', 0, num.zero, { employee_id: emp }))
    eq('E5 inaktiv kobling → ingen profil', (await callRow('e5'))?.employee_profile_id, null)
    const dupId = await c.admin.from('telephony_employee_links').insert({ provider: 'relatel', provider_employee_id: emp, profile_id: fx.m.uid })
    eq('E6 samme Relatel-id to gange afvises af databasen (23505)', dupId.error?.code, '23505')

    // ---- retention (ruten kaldes direkte; ikke planlagt i vercel.json)
    const cronSecret = randomBytes(24).toString('base64url')
    const retReq = (tok: string) => new Request('http://localhost/api/cron/telephony-retention', { headers: { authorization: `Bearer ${tok}` } })
    eq('R1 forkert cron-token → 401', (await handleTelephonyRetention(retReq('forkert'), { CRON_SECRET: cronSecret })).status, 401)
    const old = new Date(Date.now() - 91 * 86400_000).toISOString()
    await post(ENV, { ...ev('o1-m', 'o1', 'call.missed', 0, num.old, { answered: false }), occurred_at: old })
    await post(ENV, { ...ev('o2-m', 'o2', 'call.missed', 0, num.old, { answered: false }), occurred_at: old })
    const ro2 = await callRow('o2')
    await confirmCallCustomerCore(A, ro2!.id, K1, 0)
    const before = (await c.admin.from('telephony_calls').select('id', { count: 'exact', head: true }).is('customer_id', null).lt('started_at', new Date(Date.now() - 90 * 86400_000).toISOString())).count
    const ret = await handleTelephonyRetention(retReq(cronSecret), { CRON_SECRET: cronSecret })
    const retBody = await ret.json() as { success: boolean; deleted: number }
    eq('R2 oprydning sletter kun ubekræftede > 90 dage (gammel ubekræftet væk; gammel bekræftet + nye ubekræftede bevares)',
      [before, ret.status, retBody.deleted, await nCalls('o1'), await nCalls('o2'), await nCalls('z'), await nCalls('am')], [1, 200, 1, 0, 1, 1, 1])

    // ---- ingen sideeffekter
    const side1 = await sql1(SIDE())
    eq('S1 ingen opgaver/tilbageringninger/påmindelser oprettet; ingen anden audit end telefoni', [side1.tasks - side0.tasks, side1.reminders - side0.reminders, side1.audit_other], [0, 0, 0])
    const fresh = Object.entries(await tableCounts()).filter(([, n]) => n > 0)
    eq('S2 ingen rækker i SMS-/Telegram-/udbakke-/webhook-/mail-/portal-/besked-tabeller siden testens start', fresh, [])
    return out
  } finally {
    const ids = ((await c.admin.from('telephony_calls').select('id').like('provider_call_id', `${pre}-%`)).data ?? []).map((r: { id: string }) => r.id)
    if (ids.length) await c.admin.from('audit_logs').delete().eq('entity_type', 'telephony_call').in('entity_id', ids)
    await c.admin.from('audit_logs').delete().eq('entity_type', 'telephony_employee_link').gte('created_at', startedAt)
    await c.admin.from('telephony_calls').delete().like('provider_call_id', `${pre}-%`)
    await c.admin.from('telephony_employee_links').delete().like('provider_employee_id', `${pre}-%`)
    await c.admin.from('user_permission_overrides').delete().eq('reason', 'tel247app')
    if (cases.length) await c.admin.from('service_cases').delete().in('id', cases)
    if (customers.length) await c.admin.from('customers').delete().in('id', customers)
    const left = await cleanup()
    const tel = await sql1(`SELECT (SELECT count(*)::int FROM public.telephony_calls) calls, (SELECT count(*)::int FROM public.telephony_events) events, (SELECT count(*)::int FROM public.telephony_employee_links) links,
      (SELECT count(*)::int FROM public.customers WHERE customer_number LIKE 'HARN-247A-${stamp}-%') customers`)
    add('oprydning: 0 telefoni-rækker, 0 fixture-kunder, 0 testkunder', left === 0 && tel.calls === 0 && tel.events === 0 && tel.links === 0 && tel.customers === 0, j({ left, ...tel }))
  }
}
