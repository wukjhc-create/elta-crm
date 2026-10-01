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
