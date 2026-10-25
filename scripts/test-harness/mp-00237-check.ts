/**
 * MP-00237 på staging — user_role() fail-closed. Rigtige sessioner (REST/RPC), ingen app-UI.
 *   A1  aktive roller (admin, serviceleder, salg, bogholderi, montør) får uændret rolle fra user_role()
 *   A2  aktive roller: en kendt læse-/skriveadgang virker som før (lead_activities pr. rolle, 00234/L3)
 *   A3  INAKTIV profil (session udstedt før deaktivering) → user_role() = 'ingen_adgang', skriv/læs afvist   [NY]
 *   A4  MANGLENDE profil (auth-bruger uden profiles-række) → 'ingen_adgang', skriv afvist                      [NY]
 *   A5  anon kan stadig ikke kalde user_role() og har ingen adgang
 *   A6  CASE-funktioner (can_view_case_finance) giver false for ingen_adgang
 * Midlertidige auth-brugere (b237-…@harness.test) og rækker slettes altid.
 *   npx tsx scripts/test-harness/cli.ts mp-00237-check
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface M237Check { id: string; ok: boolean; note: string; kind: 'NY' | 'UÆNDRET' }

export async function runMp00237Check(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M237Check[]> {
  const out: M237Check[] = []
  const add = (kind: M237Check['kind'], id: string, ok: boolean, note: string) => out.push({ id, ok, note, kind })
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const stamp = Date.now()
  const roleOf = async (cl: SupabaseClient) => { const { data, error } = await cl.rpc('user_role'); return error ? `fejl:${error.code}` : String(data) }

  // A1/A2 aktive roller
  const roles: Record<string, string> = {}
  for (const role of ['admin', 'serviceleder', 'salg', 'bogholderi', 'montør']) roles[role] = await roleOf(p.get(role as never)!)
  add('UÆNDRET', 'A1 aktive roller uændrede i user_role()', Object.entries(roles).every(([k, v]) => k === v), JSON.stringify(roles))

  const adminUid = (await p.get('admin' as never)!.auth.getUser()).data.user!.id
  const { data: ld, error: ldErr } = await c.admin.from('leads').insert([{ company_name: `[HARNESS] b237 ${stamp}`, contact_person: 'X', email: `b237-${stamp}@harness.test`, status: 'new', source: 'phone', created_by: adminUid }]).select('id').single()
  if (ldErr) throw new Error(`lead: ${ldErr.message}`)
  const leadId = (ld as { id: string }).id
  const tmpUsers: string[] = []
  try {
    await c.admin.from('lead_activities').insert([{ lead_id: leadId, activity_type: 'note', description: `seed ${stamp}`, performed_by: adminUid }])
    const reads: Record<string, number | string> = {}
    for (const role of ['admin', 'serviceleder', 'salg', 'bogholderi', 'montør']) {
      const { data, error } = await p.get(role as never)!.from('lead_activities').select('id').eq('lead_id', leadId)
      reads[role] = error ? `fejl:${error.code}` : (data ?? []).length
    }
    add('UÆNDRET', 'A2 aktive roller: lead_activities-læsning som 00234', reads.admin === 1 && reads.serviceleder === 1 && reads.salg === 1 && reads.bogholderi === 0 && reads['montør'] === 0, JSON.stringify(reads))

    // midlertidig bruger: login FØR deaktivering (simulerer et gyldigt token efter deaktivering)
    const mkUser = async (tag: string, role: string, withProfile: boolean) => {
      const email = `b237-${tag}-${stamp}@harness.test`, password = `B237!${randomBytes(12).toString('base64url')}`
      const { data, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
      tmpUsers.push(data.user.id)
      if (withProfile) {
        const { error: pErr } = await c.admin.from('profiles').upsert([{ id: data.user.id, role, is_active: true, full_name: `[HARNESS] b237 ${tag}` }], { onConflict: 'id' })
        if (pErr) throw new Error(`profil: ${pErr.message}`)
      } else {
        await c.admin.from('profiles').delete().eq('id', data.user.id) // evt. auto-oprettet profil fjernes
      }
      const cl = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error: sErr } = await cl.auth.signInWithPassword({ email, password })
      if (sErr) throw new Error(`login ${tag}: ${sErr.message}`)
      return { id: data.user.id, cl }
    }

    // A3 inaktiv admin
    const ina = await mkUser('inaktiv', 'admin', true)
    const before = await roleOf(ina.cl)
    await c.admin.from('profiles').update({ is_active: false }).eq('id', ina.id)
    const after = await roleOf(ina.cl)
    const rd = await ina.cl.from('lead_activities').select('id').eq('lead_id', leadId)
    const wr = await ina.cl.from('lead_activities').insert([{ lead_id: leadId, activity_type: 'note', description: `inaktiv ${stamp}`, performed_by: ina.id }]).select('id')
    add('NY', 'A3 inaktiv profil → ingen_adgang (læs + skriv afvist)', before === 'admin' && after === 'ingen_adgang' && (!!rd.error || (rd.data ?? []).length === 0) && (!!wr.error || (wr.data ?? []).length === 0),
      `før=${before} efter=${after} læs=${rd.error ? rd.error.code : (rd.data ?? []).length} skriv=${wr.error ? wr.error.code : (wr.data ?? []).length}`)

    // A4 manglende profil
    const nop = await mkUser('uden-profil', 'montør', false)
    const r4 = await roleOf(nop.cl)
    const w4 = await nop.cl.from('lead_activities').insert([{ lead_id: leadId, activity_type: 'note', description: `uden profil ${stamp}`, performed_by: nop.id }]).select('id')
    add('NY', 'A4 manglende profil → ingen_adgang (ikke montør), skriv afvist', r4 === 'ingen_adgang' && (!!w4.error || (w4.data ?? []).length === 0), `rolle=${r4} skriv=${w4.error ? w4.error.code : (w4.data ?? []).length}`)

    // A6 CASE-funktion for ingen_adgang
    const { data: anyCase } = await c.admin.from('service_cases').select('id').limit(1).maybeSingle()
    if (anyCase) {
      const { data: fin, error: finErr } = await nop.cl.rpc('can_view_case_finance', { p_case_id: (anyCase as { id: string }).id })
      add('UÆNDRET', 'A6 can_view_case_finance = false for ingen_adgang', !finErr ? fin === false : true, finErr ? `rpc ikke tilgængelig (${finErr.code}) — ingen adgang` : `værdi=${fin}`)
    }
  } finally {
    await c.admin.from('lead_activities').delete().eq('lead_id', leadId)
    await c.admin.from('leads').delete().eq('id', leadId)
    for (const id of tmpUsers) {
      await c.admin.from('profiles').delete().eq('id', id)
      await c.admin.auth.admin.deleteUser(id).catch(() => {})
    }
  }

  // A5 anon
  const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const ar = await anon.rpc('user_role')
  add('UÆNDRET', 'A5 anon kan ikke kalde user_role()', !!ar.error, ar.error ? ar.error.code ?? 'fejl' : `værdi=${ar.data}`)
  return out
}

export function formatMp00237Check(checks: M237Check[]): string {
  const ny = checks.filter((k) => k.kind === 'NY')
  return [
    'MP-00237 user_role() fail-closed — staging',
    ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  [${k.kind}] ${k.id} — ${k.note}`),
    `  [NY] bestået ${ny.filter((k) => k.ok).length}/${ny.length} · [UÆNDRET] bestået ${checks.filter((k) => k.kind === 'UÆNDRET' && k.ok).length}/${checks.length - ny.length}`,
  ].join('\n')
}
