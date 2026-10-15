/**
 * PRODUCTION-tjek for 00223 (calculation_settings — indkøbsavancer kun for kost-roller, godkendt 2026-10-15).
 * Kun antal — ingen værdier ud. Alt i én ROLLBACK-transaktion.   npx tsx scripts/prod-check-00223.ts [pre|post]
 * Pr. rolle (rigtig aktiv profil, SET LOCAL ROLE authenticated + jwt-claims): antal synlige rækker i alt og antal
 * avance-rækker (margin_materials/products/subcontractor). post: salg/montør ser 0 avance-rækker men alle øvrige;
 * admin/serviceleder/bogholderi ser alle. Service-role-stien (server-beregning) ser alle.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'
const MARGIN_KEYS = `('margin_materials','margin_products','margin_subcontractor')`

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-check-00223', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const pol = (await client.query(`SELECT string_agg(policyname || '=' || coalesce(qual,''), ' | ' ORDER BY policyname) p, count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename='calculation_settings' AND cmd='SELECT'`)).rows[0] as { p: string; n: number }
    const tot = (await client.query(`SELECT count(*)::int total, count(*) FILTER (WHERE setting_key IN ${MARGIN_KEYS})::int margin,
      md5(string_agg(setting_key || '=' || setting_value::text, ',' ORDER BY setting_key)) h FROM calculation_settings`)).rows[0] as { total: number; margin: number; h: string }
    console.log(`SELECT-politikker (${pol.n}): ${pol.p.replace(/\s+/g, ' ').slice(0, 300)}`)
    console.log(`service-role: rækker=${tot.total} avance-rækker=${tot.margin} checksum=${tot.h}`)
    const roles = ['admin', 'serviceleder', 'bogholderi', 'salg', 'montør'] as const
    const seen: Record<string, { total: number; margin: number } | null> = {}
    for (const role of roles) {
      const p = (await client.query(`SELECT id FROM profiles WHERE role = $1 AND is_active ORDER BY created_at LIMIT 1`, [role])).rows[0] as { id: string } | undefined
      if (!p) { seen[role] = null; continue }
      await client.query('SAVEPOINT p')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p.id, role: 'authenticated' })])
        const r = (await client.query(`SELECT count(*)::int total, count(*) FILTER (WHERE setting_key IN ${MARGIN_KEYS})::int margin FROM calculation_settings`)).rows[0] as { total: number; margin: number }
        seen[role] = r
        await client.query('RESET ROLE'); await client.query('RELEASE SAVEPOINT p')
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT p'); seen[role] = null
        console.log(`${role}: fejl ${(e as { code?: string }).code ?? ''}`)
      }
    }
    for (const role of roles) console.log(`${role}: ${seen[role] ? `rækker=${seen[role]!.total} avance-rækker=${seen[role]!.margin}` : 'ingen aktiv profil'}`)
    if (mode === 'post') {
      res.push(['én afgrænset SELECT-politik', pol.n === 1 && !/^.*=true$/.test(pol.p), pol.p.slice(0, 80)])
      for (const role of ['salg', 'montør'] as const) {
        const s = seen[role]
        if (s) res.push([`${role}: ingen avance-rækker, men alle øvrige`, s.margin === 0 && s.total === tot.total - tot.margin, `${s.total}/${tot.total - tot.margin}`])
      }
      for (const role of ['admin', 'serviceleder', 'bogholderi'] as const) {
        const s = seen[role]
        if (s) res.push([`${role}: ser alle rækker inkl. avance`, s.total === tot.total && s.margin === tot.margin, `${s.total}/${tot.total}`])
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}${note ? `  (${note})` : ''}`)
  const bad = res.filter(([, v]) => !v).length
  console.log(mode === 'pre' ? 'pre-tjek logget' : bad ? `❌ ${bad} afvigelse(r)` : '✅ 00223 post-tjek ok')
  process.exitCode = bad ? 1 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
