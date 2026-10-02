/**
 * P-009 laese-side A1 (00175) med rigtige rolle-sessioner paa staging (probe-data, ryddes i finally):
 *   L1  portal-token: INGEN persona kan laese token-kolonnen via REST; alle kan laese status-kolonnerne
 *   L2  partner-token: samme
 *   L3  offers.send-rolle kan stadig OPRETTE portal-adgang (INSERT ... RETURNING public kolonner) — RETURNING token afvises
 *   L4  beskeder: modtager og afsender ser beskeden; tredjepart (inkl. admin) ser den ikke
 *   L5  anon: ingen laesning af tokens/beskeder
 *   L7  document_confirmations.token + offer_signatures.signature_data (00177) ikke laesbare
 *   L8  company_settings-/e-conomic-hemmeligheder (00179) — privilegie-tjek uafhaengigt af raekker
 *   L6  integrationshemmeligheder (00176): ingen persona kan laese api_key m.fl.; offentlige kolonner laesbare
 *   L9  mail (00180, G9/G10): montør ser KUN mails på egne sager/job; admin/serviceleder/salg ser alle (bogholderi: L12)
 *   L10 medarbejdere (00180, G5): planlæggere (admin, serviceleder) ser alle; montør/salg kun egen række
 *   L12 mail (00186, D28): bogholderi ser kun mails koblet til en kunde eller kilde til en leverandørfaktura
 *   L13 timegodkendelse (00185, N2): montør kan ikke sætte/ændre godkendelse via REST; insert tvinges pending; rettelse
 *       af godkendt registrering kræver ny godkendelse; service-role (server-action efter gate) kan godkende
 *   L11 audit-identitet (00182, D2): log_audit_event med en ANDENS p_user_id fra en bruger-session skrives som kalderen selv
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface ReadCheck { id: string; ok: boolean; note: string }

export async function runRlsRead(c: { admin: SupabaseClient; anon: SupabaseClient; url: string; anonKey: string; ownerUid: string }): Promise<ReadCheck[]> {
  const out: ReadCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const { PORTAL_TOKEN_PUBLIC_COLUMNS, PARTNER_TOKEN_PUBLIC_COLUMNS } = await import('../../src/lib/portal/token-reader')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const uids = new Map<string, string>()
  for (const [r, cl] of personas) uids.set(r, (await cl.auth.getUser()).data.user!.id)
  const stamp = Date.now()
  const created: Array<{ t: string; id: string }> = []
  const seed = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(t).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${t}: ${error?.message}`)
    created.unshift({ t, id }); return id
  }
  try {
    const cust = await seed('customers', { customer_number: `HARN-RLS-R-${stamp}`, company_name: '[HARNESS] rls-read', contact_person: 'R', email: `rlsr-${stamp}@harness.test`, created_by: c.ownerUid, custom_fields: { harness: 'rls-read' } })
    const pt = await seed('portal_access_tokens', { customer_id: cust, token: randomBytes(24).toString('hex'), email: `rlsr-${stamp}@harness.test`, created_by: c.ownerUid, is_active: false })
    const pa = await seed('partner_access_tokens', { partner_customer_id: cust, token: randomBytes(24).toString('hex'), email: `rlsr-${stamp}@harness.test`, created_by: c.ownerUid, is_active: false })

    for (const [label, table, id, pub] of [['L1 portal-token', 'portal_access_tokens', pt, PORTAL_TOKEN_PUBLIC_COLUMNS], ['L2 partner-token', 'partner_access_tokens', pa, PARTNER_TOKEN_PUBLIC_COLUMNS]] as const) {
      const leaks: string[] = []; const blind: string[] = []
      for (const [r, cl] of personas) {
        const sec = await cl.from(table).select('token').eq('id', id)
        if (!sec.error && (sec.data ?? []).length) leaks.push(r)
        const star = await cl.from(table).select('*').eq('id', id)
        if (!star.error && (star.data ?? []).length) leaks.push(`${r}(*)`)
        const p = await cl.from(table).select(pub).eq('id', id)
        if (p.error || (p.data ?? []).length !== 1) blind.push(r)
      }
      out.push({ id: label, ok: leaks.length === 0 && blind.length === 0 && personas.size === 5,
        note: `token læst af: ${leaks.join(',') || 'ingen'} · status læsbar: ${5 - blind.length}/5${blind.length ? ` (blind: ${blind.join(',')})` : ''}` })
    }

    // L3 — offers.send-rolle (salg) opretter adgang
    const salg = personas.get('salg')!
    const tok = randomBytes(24).toString('hex')
    const ins = await salg.from('portal_access_tokens').insert([{ customer_id: cust, token: tok, email: `rlsr-ins-${stamp}@harness.test`, created_by: uids.get('salg'), is_active: false }]).select(PORTAL_TOKEN_PUBLIC_COLUMNS)
    const insId = (ins.data?.[0] as { id?: string } | undefined)?.id
    if (insId) created.unshift({ t: 'portal_access_tokens', id: insId })
    const ret = await salg.from('portal_access_tokens').insert([{ customer_id: cust, token: randomBytes(24).toString('hex'), email: `rlsr-ret-${stamp}@harness.test`, created_by: uids.get('salg'), is_active: false }]).select('token')
    const retId = (ret.data?.[0] as { id?: string } | undefined)?.id
    if (retId) created.unshift({ t: 'portal_access_tokens', id: retId })
    out.push({ id: 'L3 opret portal-adgang (salg)', ok: !ins.error && !!insId && !!ret.error,
      note: `RETURNING offentlige=${ins.error ? `FEJL ${ins.error.message.slice(0, 40)}` : 'ok'} · RETURNING token=${ret.error ? 'afvist' : 'TILLADT'}` })

    // L4 — beskeder
    const from = uids.get('serviceleder')!, to = uids.get('montør')!
    const msg = await seed('messages', { subject: '[HARNESS] rls-read', body: 'x', from_user_id: from, to_user_id: to })
    const sees: string[] = []
    for (const [r, cl] of personas) { const q = await cl.from('messages').select('id').eq('id', msg); if (!q.error && (q.data ?? []).length) sees.push(r) }
    out.push({ id: 'L4 beskeder kun egne', ok: sees.sort().join(',') === ['montør', 'serviceleder'].sort().join(','), note: `ser beskeden: ${sees.join(',') || 'ingen'} (forventet afsender+modtager)` })

    // L6 — integrationshemmeligheder (00176)
    const integ = await seed('integrations', { name: `[HARNESS] rls-read ${stamp}`, is_active: false, api_key: 'HARNESS-NOT-A-SECRET' })
    const iLeaks: string[] = []; const iBlind: string[] = []
    for (const [r, cl] of personas) {
      const sec = await cl.from('integrations').select('api_key').eq('id', integ)
      if (!sec.error && (sec.data ?? []).length) iLeaks.push(r)
      const star = await cl.from('integrations').select('*').eq('id', integ)
      if (!star.error && (star.data ?? []).length) iLeaks.push(`${r}(*)`)
      const pub = await cl.from('integrations').select('id, name, is_active').eq('id', integ)
      if (pub.error || (pub.data ?? []).length !== 1) iBlind.push(r)
    }
    out.push({ id: 'L6 integrationshemmeligheder', ok: iLeaks.length === 0 && iBlind.length === 0, note: `hemmelighed læst af: ${iLeaks.join(',') || 'ingen'} · offentlige kolonner: ${5 - iBlind.length}/5` })

    // L7 — bekraeftelses-token + underskrift (00177)
    const doc = await seed('customer_documents', { customer_id: cust, title: '[HARNESS] rls-read', file_url: '', file_name: 'r.txt', document_type: 'other' })
    const conf = await seed('document_confirmations', { customer_document_id: doc, recipient_type: 'manual', recipient_email: `rlsr-${stamp}@harness.test`, recipient_role: 'manual', expires_at: new Date(Date.now() + 3600e3).toISOString() })
    const offer = await seed('offers', { offer_number: `HARN-RLS-R-${stamp}`, title: '[HARNESS] rls-read', created_by: c.ownerUid, customer_id: cust })
    const sig = await seed('offer_signatures', { offer_id: offer, signer_name: '[HARNESS]', signer_email: `rlsr-${stamp}@harness.test`, signature_data: 'data:HARNESS' })
    const l7: string[] = []; let confStatus = 0
    for (const [r, cl] of personas) {
      const t = await cl.from('document_confirmations').select('token').eq('id', conf)
      if (!t.error && (t.data ?? []).length) l7.push(`${r}:token`)
      const st = await cl.from('document_confirmations').select('id, status').eq('id', conf)
      if (!st.error && (st.data ?? []).length === 1) confStatus++
      const sg = await cl.from('offer_signatures').select('signature_data').eq('id', sig)
      if (!sg.error && (sg.data ?? []).length) l7.push(`${r}:underskrift`)
    }
    out.push({ id: 'L7 bekræftelses-token/underskrift', ok: l7.length === 0 && confStatus >= 3,
      note: `lækket: ${l7.join(',') || 'intet'} · bekræftelses-status læsbar for ${confStatus}/5 (RLS-roller)` })

    // L8 — virksomheds-/e-conomic-hemmeligheder (00179): kolonne-privilegier (staging kan have 0 raekker)
    const { COMPANY_SETTINGS_PUBLIC_COLUMNS } = await import('../../src/lib/settings/company-columns')
    const l8: string[] = []; let pubOk = 0
    for (const [r, cl] of personas) {
      for (const [t, col] of [['company_settings', 'smtp_password'], ['company_settings', 'sms_gateway_secret'], ['accounting_integration_settings', 'api_token']] as const) {
        const q = await cl.from(t).select(col).limit(1)
        if (!q.error) l8.push(`${r}:${t}.${col}`)
      }
      const p = await cl.from('company_settings').select(COMPANY_SETTINGS_PUBLIC_COLUMNS).limit(1)
      if (!p.error) pubOk++
    }
    const an = await c.anon.from('accounting_integration_settings').select('api_token').limit(1)
    if (!an.error) l8.push('anon:accounting.api_token')
    out.push({ id: 'L8 virksomheds-/e-conomic-hemmeligheder', ok: l8.length === 0 && pubOk === 5, note: `læsbare hemmeligheder: ${l8.join(',') || 'ingen'} · offentlige virksomhedskolonner: ${pubOk}/5` })

    // L5 — anon
    const a1 = await c.anon.from('portal_access_tokens').select('id').eq('id', pt)
    const a2 = await c.anon.from('partner_access_tokens').select('id').eq('id', pa)
    const a3 = await c.anon.from('messages').select('id').eq('id', msg)
    const anonSaw = [a1, a2, a3].some((q) => !q.error && (q.data ?? []).length > 0)
    // L9/L10 — 00180. Seed: montør-personaens medarbejder + egen sag (arbejdsordre tildelt ham) + fremmed sag; mails
    // på egen sag, fremmed sag og uden sag; en ekstra medarbejder uden login.
    {
      const montorUid = uids.get('montør')!
      const empM = await seed('employees', { name: '[HARNESS] rls-read montør', email: `rlsr-m-${stamp}@harness.test`, role: 'montør', active: true, profile_id: montorUid })
      const empX = await seed('employees', { name: '[HARNESS] rls-read anden', email: `rlsr-x-${stamp}@harness.test`, role: 'montør', active: true })
      const caseOwn = await seed('service_cases', { title: '[HARNESS] rls-read egen', customer_id: cust, status: 'new', priority: 'medium', source: 'manual', created_by: c.ownerUid })
      const caseOther = await seed('service_cases', { title: '[HARNESS] rls-read fremmed', customer_id: cust, status: 'new', priority: 'medium', source: 'manual', created_by: c.ownerUid })
      const woOwn = await seed('work_orders', { case_id: caseOwn, title: '[HARNESS] rls-read job', status: 'planned', assigned_employee_id: empM })
      const mOwn = await seed('incoming_emails', { sender_email: `a-${stamp}@harness.test`, subject: '[HARNESS] L9 egen', service_case_id: caseOwn, received_at: new Date().toISOString() })
      const mOther = await seed('incoming_emails', { sender_email: `b-${stamp}@harness.test`, subject: '[HARNESS] L9 fremmed', service_case_id: caseOther, received_at: new Date().toISOString() })
      const mNone = await seed('incoming_emails', { sender_email: `c-${stamp}@harness.test`, subject: '[HARNESS] L9 uden sag', received_at: new Date().toISOString() })
      const ids = [mOwn, mOther, mNone]
      const seen: Record<string, string> = {}
      for (const [r, cl] of personas) {
        const { data, error } = await cl.from('incoming_emails').select('id').in('id', ids)
        const got = new Set(((data ?? []) as Array<{ id: string }>).map((x) => x.id))
        seen[r] = error ? `fejl:${error.message.slice(0, 40)}` : ids.map((id) => (got.has(id) ? '1' : '0')).join('')
      }
      // bogholderi: 00186 (D28) — ingen af disse er kunde-/fakturamails → 000 (se L12)
      const expectMail: Record<string, string> = { admin: '111', serviceleder: '111', salg: '111', bogholderi: '000', 'montør': '100' }
      const badMail = Object.entries(expectMail).filter(([r, e]) => seen[r] !== e)
      out.push({ id: 'L9 mail: montør kun egne sager', ok: badMail.length === 0 && Object.keys(expectMail).every((r) => r in seen),
        note: `egen/fremmed/uden-sag pr. rolle: ${Object.entries(seen).map(([r, v]) => `${r}=${v}`).join(' ')}${badMail.length ? ` · AFVIGER: ${badMail.map(([r]) => r).join(',')}` : ''}` })

      const empSeen: Record<string, string> = {}
      for (const [r, cl] of personas) {
        const { data, error } = await cl.from('employees').select('id').in('id', [empM, empX])
        const got = new Set(((data ?? []) as Array<{ id: string }>).map((x) => x.id))
        empSeen[r] = error ? `fejl:${error.message.slice(0, 40)}` : `${got.has(empM) ? 1 : 0}${got.has(empX) ? 1 : 0}`
      }
      const expectEmp: Record<string, string> = { admin: '11', serviceleder: '11', 'montør': '10', salg: '00', bogholderi: '00' }
      const badEmp = Object.entries(expectEmp).filter(([r, e]) => empSeen[r] !== e)
      // L13 — 00185 (N2): godkendelse af timer kan ikke ændres fra en bruger-session (montør godkender ikke sig selv)
      {
        const mc = personas.get('montør')!
        const r: Record<string, boolean> = {}
        const t0 = new Date(Date.now() - 3 * 3600_000).toISOString(), t1 = new Date(Date.now() - 2 * 3600_000).toISOString()
        const ins = await mc.from('time_logs').insert([{ employee_id: empM, work_order_id: woOwn, start_time: t0, end_time: t1, approval_status: 'approved' }]).select('id, approval_status')
        const tl = (ins.data?.[0] as { id?: string; approval_status?: string } | undefined)
        if (tl?.id) created.unshift({ t: 'time_logs', id: tl.id })
        r.insert_tvinges_pending = !ins.error && tl?.approval_status === 'pending'
        const self = await mc.from('time_logs').update({ approval_status: 'approved' }).eq('id', tl?.id ?? '').select('id')
        r.selvgodkendelse_afvist = !!self.error && /godkendelsesflowet/.test(self.error.message)
        const svc = await c.admin.from('time_logs').update({ approval_status: 'approved', approved_by: c.ownerUid, approved_at: new Date().toISOString() }).eq('id', tl?.id ?? '').select('approval_status')
        r.service_role_godkender = !svc.error && (svc.data?.[0] as { approval_status?: string } | undefined)?.approval_status === 'approved'
        const edit = await mc.from('time_logs').update({ end_time: new Date(Date.now() - 1.5 * 3600_000).toISOString() }).eq('id', tl?.id ?? '').select('approval_status, approved_by')
        const e0 = edit.data?.[0] as { approval_status?: string; approved_by?: string | null } | undefined
        r.rettelse_kraever_ny_godkendelse = !edit.error && e0?.approval_status === 'pending' && e0?.approved_by === null
        out.push({ id: 'L13 timegodkendelse beskyttet', ok: Object.values(r).every(Boolean), note: Object.entries(r).map(([k, v]) => `${k}=${v ? 'ja' : 'nej'}`).join(' ') + (ins.error ? ` · insert: ${ins.error.message.slice(0, 80)}` : '') })
      }

      out.push({ id: 'L10 medarbejdere: planlæggere ser alle', ok: badEmp.length === 0 && Object.keys(expectEmp).every((r) => r in empSeen),
        note: `egen-montør/anden pr. rolle: ${Object.entries(empSeen).map(([r, v]) => `${r}=${v}`).join(' ')}${badEmp.length ? ` · AFVIGER: ${badEmp.map(([r]) => r).join(',')}` : ''}` })
    }

    // L12 — 00186 (D28): bogholderi ser kun mails koblet til en kunde eller kilde til en leverandørfaktura
    {
      const mCust = await seed('incoming_emails', { sender_email: `k-${stamp}@harness.test`, subject: '[HARNESS] L12 kunde', customer_id: cust, received_at: new Date().toISOString() })
      const mInv = await seed('incoming_emails', { sender_email: `f-${stamp}@harness.test`, subject: '[HARNESS] L12 faktura', received_at: new Date().toISOString() })
      await seed('incoming_invoices', { source: 'email', source_email_id: mInv })
      const mLoose = await seed('incoming_emails', { sender_email: `l-${stamp}@harness.test`, subject: '[HARNESS] L12 løs', received_at: new Date().toISOString() })
      const ids = [mCust, mInv, mLoose]
      const seen: Record<string, string> = {}
      for (const [r, cl] of personas) {
        const { data, error } = await cl.from('incoming_emails').select('id').in('id', ids)
        const got = new Set(((data ?? []) as Array<{ id: string }>).map((x) => x.id))
        seen[r] = error ? `fejl:${error.message.slice(0, 40)}` : ids.map((id) => (got.has(id) ? '1' : '0')).join('')
      }
      const expect: Record<string, string> = { admin: '111', serviceleder: '111', salg: '111', bogholderi: '110', 'montør': '000' }
      const bad = Object.entries(expect).filter(([r, e]) => seen[r] !== e)
      out.push({ id: 'L12 mail: bogholderi kun kunde-/fakturamails', ok: bad.length === 0 && Object.keys(expect).every((r) => r in seen),
        note: `kunde/faktura/løs pr. rolle: ${Object.entries(seen).map(([r, v]) => `${r}=${v}`).join(' ')}${bad.length ? ` · AFVIGER: ${bad.map(([r]) => r).join(',')}` : ''}` })
    }

    // L11 — D2: forsøg at forfalske audit-identitet via direkte RPC (salg udgiver sig for admin)
    {
      const salgCl = personas.get('salg')!
      const adminUid = uids.get('admin')!
      const salgUid = uids.get('salg')!
      const marker = `harness-l11-${stamp}`
      const { data: logId, error } = await salgCl.rpc('log_audit_event', {
        p_user_id: adminUid, p_user_email: 'forfalsket@harness.test', p_user_name: 'Forfalsket', p_entity_type: 'harness',
        p_entity_id: null, p_entity_name: marker, p_action: 'harness_l11', p_action_description: 'L11 probe',
      })
      const row = logId ? ((await c.admin.from('audit_logs').select('user_id, user_email').eq('id', logId as string).maybeSingle()).data as { user_id?: string; user_email?: string } | null) : null
      if (logId) await c.admin.from('audit_logs').delete().eq('id', logId as string)
      const ok = !error && row?.user_id === salgUid && row?.user_email !== 'forfalsket@harness.test'
      out.push({ id: 'L11 audit-identitet kan ikke forfalskes', ok,
        note: error ? `rpc-fejl: ${error.message.slice(0, 80)}` : `skrevet som: ${row?.user_id === salgUid ? 'kalderen selv (korrekt)' : row?.user_id === adminUid ? 'ADMIN (forfalsket!)' : 'ukendt'}` })
    }

    out.push({ id: 'L5 anon læser intet', ok: !anonSaw, note: anonSaw ? 'LÆSTE' : 'afvist/tom' })
  } finally {
    for (const x of created) await c.admin.from(x.t).delete().eq('id', x.id)
  }
  return out
}

export function formatRlsRead(c: ReadCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'P-009 LÆSE-SIDE A1 (tokens, beskeder):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(30)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} checks som forventet`].join('\n')
}
