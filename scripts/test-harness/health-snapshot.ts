/**
 * P1 #10 — Pilot Health-snapshot paa staging. Tester at alle 7 sektioner kan hentes, og at detektionen ikke er
 * vakuoes: en midlertidigt aktiveret agent SKAL give roedt, en probe-cron-raekke SKAL ses, og anon-proberne
 * SKAL vaere groenne paa staging (00162 anvendt). Alt midlertidigt ruller tilbage i finally.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SnapCheck {
  id: string
  ok: boolean
  note: string
}
type Sql = (sql: string) => Promise<any[]>

export async function runHealthSnapshot(c: {
  admin: SupabaseClient
  sql: Sql
}): Promise<SnapCheck[]> {
  const { collectPilotHealthSnapshot, ANON_READ_PROBES } =
    await import('../../src/lib/ops/pilot-health')
  const { runIncidentRegisterCheck } = await import('../incident-register-check')
  const { seedReadProbes } = await import('./role-matrix')
  const out: SnapCheck[] = []

  // Probe-raekker i ellers tomme flader (samme moenster som anon-surface/role-matrix), ryddes i finally.
  const stamp = Date.now()
  const undo: Array<() => PromiseLike<unknown>> = []
  const seed = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`snapshot-seed ${table}: ${error?.message}`)
    undo.unshift(() => c.admin.from(table).delete().eq('id', id))
    return id
  }
  const cleanupRoleProbes = await seedReadProbes(c.admin, c.sql)
  try {
    const supplier = await seed('suppliers', {
      name: `HARNESS-SEC snap ${stamp}`,
      code: `HSECS${stamp}`,
    })
    await seed('supplier_products', {
      supplier_id: supplier,
      supplier_sku: `HSEC-S-${stamp}`,
      supplier_name: 'HARNESS-SEC snapshot probe',
      cost_price: 1,
    })
    // Dummy-vaerdi (IKKE en hemmelighed); inaktiv + test-miljoe saa den ikke paavirker integrations-sektionen.
  await seed('supplier_credentials', { supplier_id: supplier, credential_type: 'api', environment: 'test', is_active: false, credentials_encrypted: 'HARNESS-PROBE-NOT-A-SECRET' })
  await seed('product_catalog', {
      name: `HARNESS-SEC snap ${stamp}`,
      list_price: 1,
      sku: `HSEC-S-${stamp}`,
    })

    const base = await collectPilotHealthSnapshot(c.admin)
    const sec = (k: string, s = base) => s.sections.find((x) => x.key === k)
    const failed = base.sections.filter((s) => s.error)
    out.push({
      id: 'H1 7 sektioner hentet',
      ok: base.sections.length === 7 && failed.length === 0,
      note: `${base.sections.map((s) => `${s.key}=${s.level}`).join(' ')}${failed.length ? ` · FEJL: ${failed.map((s) => `${s.key}: ${s.error}`).join('; ')}` : ''}`,
    })

    const security = sec('security')
    // Ikke-vakuoest: hver probet flade SKAL have raekker (set som admin), ellers beviser "0 raekker for anon" intet.
    const counts: Record<string, number> = {}
    for (const p of ANON_READ_PROBES)
      counts[p.table] = Number(
        (await c.sql(`SELECT count(*)::int n FROM (SELECT 1 FROM public.${p.table} LIMIT 1) x`))[0]
          .n
      )
    const empty = Object.entries(counts)
      .filter(([, n]) => n === 0)
      .map(([t]) => t)
    out.push({
      id: 'H2 anon-prober (staging, 00162)',
      ok:
        security?.level === 'green' &&
        security.items.length === ANON_READ_PROBES.length &&
        empty.length === 0,
      note: `${security?.items.map((i) => `${i.label.replace('Anon læser ', '')}=${i.level}`).join(' ') ?? 'mangler'}${empty.length ? ` · VAKUOEST (tom som admin): ${empty.join(', ')}` : ' · alle flader har data'}`,
    })

    const agents = sec('agents')
    out.push({
      id: 'H3 agenter disabled → groen',
      ok: ['Agenter aktiveret', 'Sikkerhedstilstand', 'AUTO_CREATE_CASES_ENABLED'].every(
        (l) => agents?.items.find((i) => i.label === l)?.level === 'green'
      ),
      note:
        agents?.items
          .slice(0, 3)
          .map((i) => `${i.label}: ${i.detail}`)
          .join(' · ') ?? 'mangler',
    })

    // Detektion: aktiver en agent midlertidigt + probe-cron-raekke
    const tag = `harness-probe-snap-${Date.now()}`
    await c.sql(`UPDATE agent_configs SET enabled = true WHERE agent_type = 'offer'`)
    await c.admin
      .from('system_health_log')
      .insert({
        service: 'cron',
        status: 'error',
        message: `${tag}: HTTP 500`,
        metadata: { cron: 'supplier-sync', probe: tag },
      })
    try {
      const s2 = await collectPilotHealthSnapshot(c.admin)
      const ag = sec('agents', s2)?.items.find((i) => i.label === 'Agenter aktiveret')
      out.push({
        id: 'H4 aktiveret agent detekteres',
        ok: ag?.level === 'red' && /offer/.test(ag.detail),
        note: `${ag?.level}: ${ag?.detail}`,
      })
      const cr = sec('crons', s2)?.items.find((i) => i.label === 'supplier-sync')
      out.push({
        id: 'H5 cron-fejl detekteres',
        ok: cr?.level === 'red' && /error/.test(cr.detail),
        note: `${cr?.level}: ${cr?.detail.slice(0, 90)}`,
      })
      out.push({
        id: 'H6 samlet status foelger vaerste',
        ok: s2.overall === 'red',
        note: `overall=${s2.overall}`,
      })
    } finally {
      await c.sql(`UPDATE agent_configs SET enabled = false WHERE agent_type = 'offer'`)
      await c.admin
        .from('system_health_log')
        .delete()
        .eq('service', 'cron')
        .eq('metadata->>probe', tag)
    }
    const inc = runIncidentRegisterCheck()
    out.push({
      id: 'H7 incident-register = log',
      ok: inc.length === 0,
      note: inc.length ? inc.join(' | ') : 'id, sev og status matcher INCIDENT_LOG.md',
    })
  } finally {
    for (const u of undo) await u()
    await cleanupRoleProbes()
  }
  return out
}

export function formatHealthSnapshot(c: SnapCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return [
    '',
    'PILOT HEALTH-SNAPSHOT:',
    ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(34)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} snapshot-checks som forventet`,
  ].join('\n')
}
