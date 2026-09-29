/**
 * 00166 — RLS paa leverandoerfaktura-linjer og audit-log, verificeret med rigtige rolle-sessioner (pilot-personaer).
 * Probe-faktura/-linjer/-audit oprettes af admin (service-role) og ryddes i finally.
 *
 *   R1  policy-saet: ingen `USING (true)` tilbage og ingen ii_* paa hovedtabellen (00160 gaelder)
 *   R2  laes linje:     admin/serviceleder/bogholderi ja · montoer/salg nej
 *   R3  ret linje:      admin/bogholderi ja · de andre nej
 *   R4  slet linje:     kun admin
 *   R5  audit:          ingen kan rette eller slette; laeseroller kan indsaette
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RlsCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const ROLES = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'] as const

export async function runInvoiceRls(c: { admin: SupabaseClient; sql: Sql; url: string; anonKey: string }): Promise<RlsCheck[]> {
  const out: RlsCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })

  const pol = (await c.sql(`SELECT tablename, policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('incoming_invoices','incoming_invoice_lines','incoming_invoice_audit_log') ORDER BY 1,2`)) as Array<{ tablename: string; policyname: string; cmd: string; q: string; w: string }>
  const open = pol.filter((p) => p.q.trim() === 'true' || p.w.trim() === 'true')
  const stray = pol.filter((p) => /^ii_/.test(p.policyname))
  out.push({ id: 'R1 policy-sæt', ok: open.length === 0 && stray.length === 0 && pol.some((p) => p.policyname === 'incoming_invoices_select_by_role'),
    note: `${pol.length} policies · åbne=${open.map((p) => `${p.tablename}.${p.policyname}`).join(',') || '0'} · ii_*=${stray.length}` })

  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  try {
    const inv = await ins('incoming_invoices', { source: 'manual', status: 'received', parse_status: 'pending', notes: '[HARNESS] rls' })
    const line = await ins('incoming_invoice_lines', { incoming_invoice_id: inv, line_number: 1, description: '[HARNESS] rls', quantity: 1, unit_price: 1, total_price: 1 })
    const audit = await ins('incoming_invoice_audit_log', { incoming_invoice_id: inv, action: 'ingested', message: '[HARNESS] rls' })

    const read: string[] = []; const upd: string[] = []; const auditTamper: string[] = []; const auditIns: string[] = []
    for (const role of ROLES) {
      const cl = personas.get(role)!
      if (((await cl.from('incoming_invoice_lines').select('id').eq('id', line)).data ?? []).length === 1) read.push(role)
      if (((await cl.from('incoming_invoice_lines').update({ description: `[HARNESS] rls ${role}` }).eq('id', line).select('id')).data ?? []).length === 1) upd.push(role)
      const au = await cl.from('incoming_invoice_audit_log').update({ message: 'tampered' }).eq('id', audit).select('id')
      const ad = await cl.from('incoming_invoice_audit_log').delete().eq('id', audit).select('id')
      if (((au.data ?? []).length + (ad.data ?? []).length) > 0) auditTamper.push(role)
      const ai = await cl.from('incoming_invoice_audit_log').insert({ incoming_invoice_id: inv, action: 'ingested', message: `[HARNESS] rls ${role}` })
      if (!ai.error) auditIns.push(role)
    }
    const eq = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()
    out.push({ id: 'R2 læs linje', ok: eq(read, ['admin', 'serviceleder', 'bogholderi']), note: `kan læse: ${read.join(', ') || '-'}` })
    out.push({ id: 'R3 ret linje', ok: eq(upd, ['admin', 'bogholderi']), note: `kan rette: ${upd.join(', ') || '-'}` })

    const del: string[] = []
    for (const role of ROLES) {
      const l = await ins('incoming_invoice_lines', { incoming_invoice_id: inv, line_number: 9, description: `[HARNESS] del ${role}`, quantity: 1, unit_price: 1, total_price: 1 })
      if (((await personas.get(role)!.from('incoming_invoice_lines').delete().eq('id', l).select('id')).data ?? []).length === 1) del.push(role)
    }
    out.push({ id: 'R4 slet linje', ok: eq(del, ['admin']), note: `kan slette: ${del.join(', ') || '-'}` })
    const auditStill = ((await c.admin.from('incoming_invoice_audit_log').select('message').eq('id', audit).maybeSingle()).data as { message?: string } | null)?.message
    out.push({ id: 'R5 audit append-only', ok: auditTamper.length === 0 && auditStill === '[HARNESS] rls' && eq(auditIns, ['admin', 'serviceleder', 'bogholderi']),
      note: `rettet/slettet af: ${auditTamper.join(', ') || 'ingen'} · uændret=${auditStill === '[HARNESS] rls'} · kan indsætte: ${auditIns.join(', ')}` })
  } finally {
    const inv = created.find((x) => x.table === 'incoming_invoices')?.id
    if (inv) {
      await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', inv)
      await c.admin.from('incoming_invoice_lines').delete().eq('incoming_invoice_id', inv)
      await c.admin.from('incoming_invoices').delete().eq('id', inv)
    }
  }
  return out
}

export function formatInvoiceRls(c: RlsCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'LEVERANDØRFAKTURA-RLS (00166, rigtige rolle-sessioner):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(24)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} RLS-checks som forventet`].join('\n')
}
