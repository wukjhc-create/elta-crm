/**
 * P-009 — RLS-skrivelås verificeret med RIGTIGE rolle-sessioner (pilot-personaer) mod staging, drevet af
 * scripts/rls/write-matrix.ts. Pr. tabel og rolle: INSERT/UPDATE/DELETE paa probe-raekker skal lykkes praecis naar
 * matrixen tillader det (positive + negative checks). Derudover:
 *   - ekstra betingelser: INSERT med fremmed created_by afvises; forslag-sletning (offers) kun paa is_proposal
 *   - anon: ingen skrivning
 *   - laesning uaendret: alle personaer kan stadig laese probe-raekken
 * Alle probe-raekker ryddes i finally (service-role).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import * as M from '../rls/write-matrix'

export interface RlsCheck { id: string; ok: boolean; note: string }

type Ctx = { stamp: number; customerId: string; offerId: string; ownerUid: string; n: () => number }
type Spec = { payload: (uid: string, c: Ctx) => Record<string, unknown>; update: Record<string, unknown> }

const SPECS: Record<string, Spec> = {
  customers: {
    payload: (uid, c) => { const k = c.n(); return { customer_number: `HARN-RLS-${c.stamp}-${k}`, company_name: '[HARNESS] rls', contact_person: 'R', email: `rls-${c.stamp}-${k}@harness.test`, created_by: uid, custom_fields: { harness: 'rls' } } },
    update: { notes: '[HARNESS] rls-update' },
  },
  customer_contacts: { payload: (_u, c) => ({ customer_id: c.customerId, name: '[HARNESS] rls' }), update: { notes: '[HARNESS] rls-update' } },
  offers: {
    payload: (uid, c) => ({ offer_number: `HARN-RLS-${c.stamp}-${c.n()}`, title: '[HARNESS] rls', created_by: uid, customer_id: c.customerId }),
    update: { notes: '[HARNESS] rls-update' },
  },
  offer_line_items: { payload: (_u, c) => ({ offer_id: c.offerId, position: 900 + c.n(), description: '[HARNESS] rls', unit_price: 1, total: 1 }), update: { notes: '[HARNESS] rls-update' } },
  portal_access_tokens: {
    payload: (uid, c) => ({ customer_id: c.customerId, token: randomBytes(24).toString('hex'), email: `rls-${c.stamp}@harness.test`, created_by: uid, expires_at: new Date(Date.now() + 3600e3).toISOString() }),
    update: { email: `rls-upd@harness.test` },
  },
  customer_documents: { payload: (_u, c) => ({ customer_id: c.customerId, title: '[HARNESS] rls', file_url: '', file_name: 'rls.txt', document_type: 'other' }), update: { description: '[HARNESS] rls-update' } },
  incoming_emails: { payload: (_u, c) => ({ sender_email: `rls-${c.stamp}-${c.n()}@harness.test`, subject: '[HARNESS] rls', graph_message_id: `harness-rls-${c.stamp}-${c.n()}` }), update: { is_read: true } },
}

export async function runRlsLockdown(c: { admin: SupabaseClient; anon: SupabaseClient; url: string; anonKey: string; ownerUid: string }, policies: M.TableWritePolicy[] = M.WAVE1): Promise<RlsCheck[]> {
  const out: RlsCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const personas = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const uids = new Map<string, string>()
  for (const [role, cl] of personas) uids.set(role, (await cl.auth.getUser()).data.user!.id)
  const stamp = Date.now()
  let counter = 0
  const created: Array<{ table: string; id: string }> = []
  const seed = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.push({ table, id })
    return id
  }
  const track = (table: string, data: unknown) => { const id = (Array.isArray(data) ? (data[0] as { id?: string })?.id : undefined); if (id) created.push({ table, id }); return !!id }
  try {
    const ctx: Ctx = { stamp, customerId: '', offerId: '', ownerUid: c.ownerUid, n: () => ++counter }
    ctx.customerId = await seed('customers', SPECS.customers.payload(c.ownerUid, ctx))
    ctx.offerId = await seed('offers', SPECS.offers.payload(c.ownerUid, ctx))

    for (const p of policies) {
      const spec = SPECS[p.table]
      if (!spec) { out.push({ id: `${p.table}`, ok: false, note: 'ingen test-spec' }); continue }
      const mismatches: string[] = []
      let checks = 0
      for (const [role, cl] of personas) {
        const uid = uids.get(role)!
        // INSERT
        const ins = await cl.from(p.table).insert([spec.payload(uid, ctx)]).select('id')
        const insOk = !ins.error && track(p.table, ins.data)
        checks++; if (insOk !== p.insert.includes(role as M.Role)) mismatches.push(`${role}:insert=${insOk ? 'ja' : 'nej'}`)
        // UPDATE
        const target = await seed(p.table, spec.payload(c.ownerUid, ctx))
        const upd = await cl.from(p.table).update(spec.update).eq('id', target).select('id')
        const updOk = !upd.error && (upd.data ?? []).length === 1
        checks++; if (updOk !== p.update.includes(role as M.Role)) mismatches.push(`${role}:update=${updOk ? 'ja' : 'nej'}`)
        // laesning uaendret
        const sel = await cl.from(p.table).select('id').eq('id', target)
        checks++; if (sel.error || (sel.data ?? []).length !== 1) mismatches.push(`${role}:select=nej`)
        // DELETE (almindelig raekke)
        const del = await cl.from(p.table).delete().eq('id', target).select('id')
        const delOk = !del.error && (del.data ?? []).length === 1
        checks++; if (delOk !== p.delete.includes(role as M.Role)) mismatches.push(`${role}:delete=${delOk ? 'ja' : 'nej'}`)
        // betinget sletning
        if (p.deleteConditional) {
          const cond = await seed(p.table, { ...spec.payload(c.ownerUid, ctx), is_proposal: true })
          const d2 = await cl.from(p.table).delete().eq('id', cond).select('id')
          const d2Ok = !d2.error && (d2.data ?? []).length === 1
          const exp = p.delete.includes(role as M.Role) || p.deleteConditional.roles.includes(role as M.Role)
          checks++; if (d2Ok !== exp) mismatches.push(`${role}:delete(${p.deleteConditional.desc})=${d2Ok ? 'ja' : 'nej'}`)
        }
        // ekstra insert-betingelse: fremmed created_by afvises
        if (p.insertExtraSql && p.insert.includes(role as M.Role)) {
          const other = [...uids.values()].find((u) => u !== uid)!
          const bad = await cl.from(p.table).insert([spec.payload(other, ctx)]).select('id')
          const badOk = !bad.error && track(p.table, bad.data)
          checks++; if (badOk) mismatches.push(`${role}:insert(fremmed created_by)=ja`)
        }
      }
      // anon
      const aIns = await c.anon.from(p.table).insert([spec.payload(c.ownerUid, ctx)]).select('id')
      const aTarget = await seed(p.table, spec.payload(c.ownerUid, ctx))
      const aUpd = await c.anon.from(p.table).update(spec.update).eq('id', aTarget).select('id')
      const aDel = await c.anon.from(p.table).delete().eq('id', aTarget).select('id')
      const anonWrote = (!aIns.error && track(p.table, aIns.data)) || (!aUpd.error && (aUpd.data ?? []).length > 0) || (!aDel.error && (aDel.data ?? []).length > 0)
      checks += 3; if (anonWrote) mismatches.push('anon:skrev')
      const note = `${checks} checks · I:${p.insert.length}/U:${p.update.length}/D:${p.delete.length}${p.deleteConditional ? '+betinget' : ''} roller`
      out.push({ id: p.table, ok: mismatches.length === 0 && personas.size === 5, note: mismatches.length ? `AFVIGER: ${mismatches.join(', ')}` : `${note} · ${personas.size} personaer + anon` })
    }
  } finally {
    const order = ['offer_line_items', 'customer_documents', 'portal_access_tokens', 'customer_contacts', 'incoming_emails', 'offers', 'customers']
    for (const t of order) {
      const ids = created.filter((x) => x.table === t).map((x) => x.id)
      if (ids.length) await c.admin.from(t).delete().in('id', ids)
    }
  }
  return out
}

export function formatRlsLockdown(c: RlsCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'P-009 RLS-SKRIVELÅS (rigtige rolle-sessioner):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(24)} ${x.note}`),
    bad ? `  ❌ ${bad} tabel(ler) afviger` : `  ✅ alle ${c.length} tabeller som matrixen`].join('\n')
}
