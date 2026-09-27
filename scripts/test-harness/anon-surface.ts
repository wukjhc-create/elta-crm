/**
 * Regressionsvaern for anon-eksponering (incident P-004, migration 00162) — KUN staging.
 *
 * Dynamisk med PROBE-RAEKKER (saa "0 raekker" aldrig er en falsk PASS pga. tom tabel):
 *   - v_supplier_products_with_supplier (indkoebspriser), v_packages_summary (kost/salg/DB)
 *   - product_catalog, package_categories, product_categories, project_templates
 *   - anon INSERT i integration_logs (uden RETURNING; verificeres via admin)
 *   - anon RPC-kald af SECURITY DEFINER-helpers
 * Oevrige flader (resterende views, email_events/sms_events-skriv) daekkes statisk af db-audit (V1/T3).
 * Indloggede brugere skal stadig kunne laese de seedede raekker (ingen regression).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AnonCheck { id: string; ok: boolean; note: string }

const RPCS: Array<{ fn: string; args: Record<string, unknown> }> = [
  { fn: 'user_role', args: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { fn: 'user_permissions', args: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { fn: 'log_audit_event', args: { p_user_id: null, p_user_email: 'anon-probe', p_user_name: 'anon', p_entity_type: 'harness_anon_probe', p_entity_id: null, p_entity_name: null, p_action: 'probe', p_action_description: 'anon probe', p_changes: null, p_metadata: null, p_ip_address: null, p_user_agent: null } },
]

export async function runAnonSurfaceProbes(anon: SupabaseClient, authed: SupabaseClient, admin: SupabaseClient): Promise<AnonCheck[]> {
  const out: AnonCheck[] = []
  const stamp = Date.now()
  const cleanup: Array<() => PromiseLike<unknown>> = []
  const seed = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`anon-probe seed ${table}: ${error?.message}`)
    cleanup.unshift(() => admin.from(table).delete().eq('id', id))
    return id
  }
  try {
    const supplier = await seed('suppliers', { name: `HARNESS-SEC anon ${stamp}`, code: `HSECA${stamp}` })
    const sp = await seed('supplier_products', { supplier_id: supplier, supplier_sku: `HSEC-${stamp}`, supplier_name: 'HARNESS-SEC anon probe', cost_price: 1 })
    const pkg = await seed('packages', { name: `HARNESS-SEC anon pakke ${stamp}` })
    const probes: Array<{ table: string; id: string }> = [
      { table: 'v_supplier_products_with_supplier', id: sp },
      { table: 'v_packages_summary', id: pkg },
      { table: 'product_catalog', id: await seed('product_catalog', { name: `HARNESS-SEC anon ${stamp}`, list_price: 1, sku: `HSEC-${stamp}` }) },
      { table: 'package_categories', id: await seed('package_categories', { name: 'HARNESS-SEC anon', slug: `hsec-anon-${stamp}` }) },
      { table: 'product_categories', id: await seed('product_categories', { name: 'HARNESS-SEC anon', slug: `hsec-anon-${stamp}` }) },
      { table: 'project_templates', id: await seed('project_templates', { name: `HARNESS-SEC anon ${stamp}`, code: `HSEC-${stamp}` }) },
    ]
    for (const p of probes) {
      const a = await anon.from(p.table).select('id').eq('id', p.id)
      const u = await authed.from(p.table).select('id').eq('id', p.id)
      const anonSees = !a.error && (a.data ?? []).length > 0
      const authSees = !u.error && (u.data ?? []).length === 1
      out.push({ id: `anon laes ${p.table} (probe-raekke)`, ok: !anonSees && authSees, note: `anon=${a.error ? 'afvist' : anonSees ? 'SER RAEKKEN' : '0'} · indlogget=${authSees ? 'ser raekken' : u.error ? `FEJL ${u.error.message.slice(0, 40)}` : 'ser IKKE raekken'}` })
    }
    // Skriv uden RETURNING (insert+select ville kraeve SELECT-ret og give misvisende RLS-fejl)
    const marker = `harness_anon_probe_${stamp}`
    const w = await anon.from('integration_logs').insert([{ log_type: marker }])
    const { data: landed } = await admin.from('integration_logs').select('id').eq('log_type', marker)
    for (const r of landed ?? []) await admin.from('integration_logs').delete().eq('id', (r as { id: string }).id)
    out.push({ id: 'anon skriv integration_logs', ok: (landed ?? []).length === 0, note: (landed ?? []).length ? 'INDSAT (slettet igen)' : `afvist (${(w.error?.message ?? '').slice(0, 40)})` })
    for (const r of RPCS) {
      const { error } = await anon.rpc(r.fn, r.args)
      out.push({ id: `anon rpc ${r.fn}`, ok: !!error, note: error ? `afvist (${error.message.slice(0, 40)})` : 'KALDT' })
    }
  } finally {
    for (const c of cleanup) await c()
    await admin.from('audit_logs').delete().eq('entity_type', 'harness_anon_probe')
  }
  return out
}

export function formatAnonChecks(c: AnonCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'ANON-FLADE (offentlig anon-noegle, ingen login; oevrige flader statisk i db-audit):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(52)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} anon-checks som forventet`].join('\n')
}
