/**
 * P-009-fund (S2) — dynamisk bevis paa staging (probe-data, ryddes i finally). Harnessen har ingen Next-request, dvs.
 * INGEN session: praecis den situation en uautentificeret POST mod en server action er i.
 *   D1  deleteOutboundAttachmentAction uden login afvises, og kundedokumentet + filen bestaar (foer: slettet via service-role)
 *   D2  cleanupOutboundAttachments sletter IKKE et almindeligt kundedokument (kun outbound-attachments/-stier)
 *   D3  positiv kontrol: cleanupOutboundAttachments sletter en outbound-vedhaeftning (raekke + fil)
 *   D4  bank-actions uden login afvises; ingen bank_transactions oprettet
 *   D5  permission-matrix: bank.edit kun admin/bogholderi; inbox.view ikke salg/bogholderi (gates matcher modulerne)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthProof { id: string; ok: boolean; note: string }

export async function runActionAuthProofs(c: { admin: SupabaseClient; ownerUid: string }): Promise<AuthProof[]> {
  const out: AuthProof[] = []
  const stamp = Date.now()
  const { deleteOutboundAttachmentAction } = await import('../../src/lib/actions/outbound-attachments')
  const { cleanupOutboundAttachments } = await import('../../src/lib/services/outbound-attachments')
  const bank = await import('../../src/lib/actions/bank-payments')
  const { hasPermission } = await import('../../src/lib/auth/permissions')
  const docs: string[] = []
  const paths: string[] = []
  let customerId: string | null = null
  const upload = async (path: string) => {
    const { error } = await c.admin.storage.from('attachments').upload(path, Buffer.from(`HARNESS ${stamp}`), { contentType: 'text/plain', upsert: true })
    if (error) throw new Error(`upload ${error.message}`)
    paths.push(path)
  }
  const exists = async (path: string) => {
    const dir = path.split('/').slice(0, -1).join('/')
    const { data } = await c.admin.storage.from('attachments').list(dir, { search: path.split('/').pop() })
    return (data ?? []).length > 0
  }
  const doc = async (path: string, title: string) => {
    const { data, error } = await c.admin.from('customer_documents').insert([{ customer_id: customerId, title, document_type: 'other',
      file_url: '', storage_path: path, file_name: title, mime_type: 'text/plain', file_size: 10 }]).select('id')
    if (error || !data?.[0]) throw new Error(`doc ${error?.message}`)
    docs.push((data[0] as { id: string }).id)
    return (data[0] as { id: string }).id
  }
  try {
    const { data: cust, error: cErr } = await c.admin.from('customers').insert([{ customer_number: `HARNESS-AUTH-${stamp}`, company_name: '[HARNESS] auth-proof',
      contact_person: 'P', email: `auth-${stamp}@harness.test`, created_by: c.ownerUid, custom_fields: { harness: 'action-auth-proofs' } }]).select('id')
    if (cErr || !cust?.[0]) throw new Error(`customer ${cErr?.message}`)
    customerId = (cust[0] as { id: string }).id

    // D1 — uautentificeret sletning af et ALMINDELIGT kundedokument
    const normalPath = `customer-documents/${customerId}/harness-${stamp}.txt`
    await upload(normalPath)
    const normal = await doc(normalPath, 'HARNESS kontrakt')
    const r1 = await deleteOutboundAttachmentAction(normal)
    const stillRow = (await c.admin.from('customer_documents').select('id').eq('id', normal)).data?.length === 1
    out.push({ id: 'D1 slet uden login afvises', ok: !r1.success && stillRow && (await exists(normalPath)),
      note: `svar=${r1.success ? 'SUCCESS' : r1.error} · række=${stillRow ? 'bevaret' : 'SLETTET'} · fil=${(await exists(normalPath)) ? 'bevaret' : 'SLETTET'}` })

    // D2 — servicen roerer ikke ikke-outbound dokumenter
    await cleanupOutboundAttachments([normal])
    const stillRow2 = (await c.admin.from('customer_documents').select('id').eq('id', normal)).data?.length === 1
    out.push({ id: 'D2 service: kun outbound-stier', ok: stillRow2 && (await exists(normalPath)), note: `almindeligt dokument ${stillRow2 ? 'bevaret' : 'SLETTET'}` })

    // D3 — positiv kontrol
    const obPath = `outbound-attachments/${customerId}/${stamp}-harness.txt`
    await upload(obPath)
    const ob = await doc(obPath, 'HARNESS outbound')
    await cleanupOutboundAttachments([ob])
    const obRow = (await c.admin.from('customer_documents').select('id').eq('id', ob)).data?.length === 1
    out.push({ id: 'D3 positiv kontrol: outbound slettes', ok: !obRow && !(await exists(obPath)), note: `række=${obRow ? 'BESTÅR' : 'slettet'} · fil=${(await exists(obPath)) ? 'BESTÅR' : 'slettet'}` })

    // D4 — bank uden login
    const { count: before } = await c.admin.from('bank_transactions').select('id', { count: 'exact', head: true })
    const tries = await Promise.all([
      bank.importBankCsvAction('Dato;Tekst;Beløb\n01-09-2026;HARNESS;100,00').then(() => 'ACCEPTERET', (e) => String(e?.message ?? e).slice(0, 30)),
      bank.runAutoMatchAction().then(() => 'ACCEPTERET', (e) => String(e?.message ?? e).slice(0, 30)),
    ])
    const { count: after } = await c.admin.from('bank_transactions').select('id', { count: 'exact', head: true })
    out.push({ id: 'D4 bank-actions uden login afvises', ok: tries.every((t) => t !== 'ACCEPTERET') && before === after, note: `${tries.join(' · ')} · bank_transactions ${before}→${after}` })

    // D5 — permission-matrix
    const m = (r: string, p: string) => hasPermission(r as never, p as never)
    const okMatrix = m('admin', 'bank.edit') && m('bogholderi', 'bank.edit') && !m('montør', 'bank.edit') && !m('serviceleder', 'bank.edit') && !m('salg', 'bank.edit')
      && m('montør', 'inbox.view') && !m('salg', 'inbox.view') && !m('bogholderi', 'inbox.view')
    out.push({ id: 'D5 gate-roller', ok: okMatrix, note: 'bank.edit: admin+bogholderi · inbox.view: admin/serviceleder/montør' })
  } finally {
    if (docs.length) await c.admin.from('customer_documents').delete().in('id', docs)
    if (paths.length) await c.admin.storage.from('attachments').remove(paths)
    if (customerId) await c.admin.from('customers').delete().eq('id', customerId)
  }
  return out
}

export function formatActionAuthProofs(c: AuthProof[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'ACTION-AUTH (P-009-fund, S2):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} checks som forventet`].join('\n')
}
