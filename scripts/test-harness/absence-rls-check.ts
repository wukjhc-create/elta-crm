/**
 * 00228 på staging: employee_absences — adgangsmatrix pr. rolle (Henrik 2026-10-15).
 *   A1  admin + serviceleder kan oprette/ændre/slette
 *   A2  bogholderi ser alle (type + periode) men kan ikke skrive
 *   A3  montør ser KUN egne; kan ikke skrive
 *   A4  salg ser intet
 *   A5  anon har ingen adgang
 *   A6  ingen fritekst-/note-kolonne (helbredsdetaljer kan ikke gemmes)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

export interface AbCheck { id: string; ok: boolean; note: string }

export async function runAbsenceRlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<AbCheck[]> {
  const out: AbCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const stamp = Date.now()
  const uidOf = async (cl: SupabaseClient) => (await cl.auth.getUser()).data.user?.id ?? null
  const montorUid = await uidOf(p.get('montør')!)
  const made: string[] = []
  const emps: string[] = []
  try {
    const mkEmp = async (name: string, profileId: string | null) => {
      const { data, error } = await c.admin.from('employees').insert([{ name: `[HARNESS] fravær ${name} ${stamp}`, email: `fr-${name}-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: profileId }]).select('id').single()
      if (error) throw new Error(`seed employee: ${error.message}`)
      emps.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    // montør-personaen kan allerede have en medarbejder — brug den, ellers opret
    let ownEmp = montorUid ? (((await c.admin.from('employees').select('id').eq('profile_id', montorUid).limit(1)).data ?? [])[0] as { id: string } | undefined)?.id ?? null : null
    if (!ownEmp) ownEmp = await mkEmp('egen', montorUid)
    const otherEmp = await mkEmp('anden', null)

    const ins = async (role: string, employee_id: string) => {
      const { data, error } = await p.get(role as never)!.from('employee_absences').insert([{ employee_id, kind: 'ferie', start_date: '2026-11-02', end_date: '2026-11-06' }]).select('id').single()
      if (data) made.push((data as { id: string }).id)
      return { ok: !error && !!data, err: error?.code ?? null, id: (data as { id: string } | null)?.id ?? null }
    }
    const a = await ins('admin', ownEmp)
    const s = await ins('serviceleder', otherEmp)
    const upd = s.id ? await p.get('serviceleder')!.from('employee_absences').update({ kind: 'kursus' }).eq('id', s.id).select('id') : { data: [] }
    out.push({ id: 'A1 admin + serviceleder skriver', ok: a.ok && s.ok && (upd.data ?? []).length === 1, note: `admin=${a.ok} serviceleder=${s.ok} ret=${(upd.data ?? []).length}` })

    const b = await ins('bogholderi', otherEmp)
    const bRead = (await p.get('bogholderi')!.from('employee_absences').select('id, kind, start_date, end_date').in('id', made)).data ?? []
    out.push({ id: 'A2 bogholderi læser alle, skriver ikke', ok: !b.ok && bRead.length === 2, note: `skriv=${b.ok}(${b.err}) læs=${bRead.length}` })

    const m = await ins('montør', ownEmp)
    const mRead = ((await p.get('montør')!.from('employee_absences').select('id, employee_id').in('id', made)).data ?? []) as Array<{ employee_id: string }>
    out.push({ id: 'A3 montør ser kun egne, skriver ikke', ok: !m.ok && mRead.length === 1 && mRead[0].employee_id === ownEmp, note: `skriv=${m.ok} læs=${mRead.length}` })

    const sRead = (await p.get('salg')!.from('employee_absences').select('id').in('id', made)).data ?? []
    const salgIns = await ins('salg', otherEmp)
    out.push({ id: 'A4 salg ser intet og skriver ikke', ok: sRead.length === 0 && !salgIns.ok, note: `læs=${sRead.length} skriv=${salgIns.ok}` })

    const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const an = await anon.from('employee_absences').select('id').limit(1)
    out.push({ id: 'A5 anon ingen adgang', ok: !!an.error || (an.data ?? []).length === 0, note: an.error?.code ?? `rækker=${(an.data ?? []).length}` })

    const cols = (await c.sql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_absences'`)).map((r: any) => r.column_name as string)
    out.push({ id: 'A6 ingen fritekst/note-kolonne', ok: !cols.some((x) => /note|reason|comment|text|diagnos/i.test(x)), note: cols.join(',') })

    const del = s.id ? await p.get('admin')!.from('employee_absences').delete().eq('id', s.id).select('id') : { data: [] }
    out.push({ id: 'A7 admin kan slette', ok: (del.data ?? []).length === 1, note: `slettet=${(del.data ?? []).length}` })
  } finally {
    if (made.length) await c.admin.from('employee_absences').delete().in('id', made)
    for (const e of emps) await c.admin.from('employees').delete().eq('id', e)
  }
  return out
}

export function formatAbsenceRlsCheck(checks: AbCheck[]): string {
  return ['employee_absences (00228) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
