/**
 * 00234 på staging: lead_activities — læseadgang = leads.view (Henrik 2026-10-21, MP-2a).
 *   L1  admin, serviceleder og salg læser aktiviteterne
 *   L2  bogholderi og montør læser intet
 *   L3  inserts opfører sig som FØR 00234 (INSERT-politikken er uændret: admin/serviceleder/salg/montør må, bogholderi ikke)
 *   L4  anon har ingen adgang
 *   L5  præcis én SELECT-politik (lead_activities_select_role) og INSERT-politikken uændret
 * Inserts sker uden .select() — montør må stadig indsætte, men kan ikke længere læse rækken tilbage.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

export interface LaCheck { id: string; ok: boolean; note: string }

export async function runLeadActivitiesRlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<LaCheck[]> {
  const out: LaCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const stamp = Date.now()
  const uidOf = async (role: string) => (await p.get(role as never)!.auth.getUser()).data.user?.id ?? null
  const adminUid = await uidOf('admin')
  let leadId: string | null = null
  try {
    const ld = await c.admin.from('leads').insert([{ company_name: `[HARNESS] la-rls ${stamp}`, contact_person: 'RLS', email: `la-${stamp}@harness.test`,
      status: 'new', source: 'phone', created_by: adminUid }]).select('id').single()
    if (ld.error || !ld.data) throw new Error(`seed lead: ${ld.error?.message}`)
    leadId = (ld.data as { id: string }).id
    const seed = await c.admin.from('lead_activities').insert([{ lead_id: leadId, activity_type: 'note', description: `seed ${stamp}`, performed_by: adminUid }]).select('id').single()
    if (seed.error || !seed.data) throw new Error(`seed aktivitet: ${seed.error?.message}`)

    const reads: Record<string, number | string> = {}
    for (const role of ['admin', 'serviceleder', 'salg', 'bogholderi', 'montør']) {
      const { data, error } = await p.get(role as never)!.from('lead_activities').select('id').eq('lead_id', leadId)
      reads[role] = error ? `fejl:${error.code}` : (data ?? []).length
    }
    out.push({ id: 'L1 admin/serviceleder/salg læser', ok: reads.admin === 1 && reads.serviceleder === 1 && reads.salg === 1, note: JSON.stringify(reads) })
    out.push({ id: 'L2 bogholderi/montør læser intet', ok: reads.bogholderi === 0 && reads['montør'] === 0, note: `bogholderi=${reads.bogholderi} montør=${reads['montør']}` })

    const ins: Record<string, boolean> = {}
    for (const role of ['admin', 'serviceleder', 'salg', 'montør', 'bogholderi']) {
      const uid = await uidOf(role)
      const { error } = await p.get(role as never)!.from('lead_activities').insert([{ lead_id: leadId, activity_type: 'note', description: `${role} ${stamp}`, performed_by: uid }])
      ins[role] = !error
    }
    const expected = { admin: true, serviceleder: true, salg: true, 'montør': true, bogholderi: false }
    out.push({ id: 'L3 inserts som før 00234', ok: Object.entries(expected).every(([r, v]) => ins[r] === v), note: JSON.stringify(ins) })

    const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const an = await anon.from('lead_activities').select('id').eq('lead_id', leadId)
    out.push({ id: 'L4 anon ingen adgang', ok: !!an.error || (an.data ?? []).length === 0, note: an.error?.code ?? `rækker=${(an.data ?? []).length}` })

    const pol = await c.sql(`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='lead_activities' ORDER BY cmd, policyname`)
    const sel = pol.filter((x: any) => x.cmd === 'SELECT')
    const insP = pol.filter((x: any) => x.cmd === 'INSERT')
    out.push({ id: 'L5 politikker', ok: sel.length === 1 && sel[0].policyname === 'lead_activities_select_role' && insP.length === 1 && insP[0].policyname === 'lead_activities_insert_role' && /montør/.test(String(insP[0].with_check)),
      note: pol.map((x: any) => `${x.cmd}:${x.policyname}`).join(', ') })
  } finally {
    if (leadId) {
      await c.admin.from('lead_activities').delete().eq('lead_id', leadId)
      await c.admin.from('leads').delete().eq('id', leadId)
    }
  }
  return out
}

export function formatLeadActivitiesRlsCheck(checks: LaCheck[]): string {
  return ['lead_activities (00234) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
