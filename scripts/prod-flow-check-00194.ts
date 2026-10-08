/**
 * PRODUCTION flow-tjek for 00194 (godkendt 2026-10-07) — kører i ÉN transaktion der ALTID rulles tilbage (ROLLBACK,
 * aldrig COMMIT): intet efterlades i prod. Som PostgREST: SET LOCAL ROLE authenticated + JWT-claims for rigtige
 * prod-brugere (admin, montør). Printer kun roller, tjek og resultat (ingen id'er/data).
 *   npx tsx scripts/prod-flow-check-00194.ts
 *
 * Tjekker: portal-hændelse → advarsel (indsat som systemet, som createSystemAlertAdmin), synlighed pr. rolle,
 * brugere kan ikke oprette/slette/ændre titel, markér læst + afvis (admin), montør kan ikke markere, dubletsikringens
 * opslag (samme type/titel, ikke afvist) finder den åbne advarsel og ikke den afviste.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-flow-00194-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const users = (await client.query(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p WHERE p.is_active AND p.role IN ('admin', 'montør') GROUP BY p.role`)).rows as Array<{ role: string; id: string }>
    const admin = users.find((u) => u.role === 'admin')
    const montor = users.find((u) => u.role === 'montør')
    if (!admin || !montor) throw new Error('mangler aktiv admin/montør i prod')
    const title = `Fuldmagt underskrevet [FLOW-CHECK ${Date.now()}]`
    const ins = await client.query(`INSERT INTO public.system_alerts (alert_type, severity, title, message, entity_type) VALUES ('fuldmagt_signed', 'info', $1, 'flow-check (rulles tilbage)', 'customer') RETURNING id`, [title])
    const id = ins.rows[0].id as string
    res.push(['portal-hændelse → advarsel oprettet (systemet)', !!id, ''])

    const as = async (userId: string, sql: string, params: unknown[] = []) => {
      await client.query('SAVEPOINT p')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
        const r = await client.query(sql, params)
        await client.query('RESET ROLE')
        await client.query('RELEASE SAVEPOINT p')
        return { ok: true as const, rows: r.rows, count: r.rowCount ?? 0 }
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT p')
        await client.query('RESET ROLE')
        return { ok: false as const, code: (e as { code?: string }).code ?? '', rows: [], count: 0 }
      }
    }

    const aSee = await as(admin.id, `SELECT id FROM public.system_alerts WHERE id = $1 AND is_dismissed = false`, [id])
    res.push(['admin ser advarslen i klokkens forespørgsel', aSee.ok && aSee.rows.length === 1, aSee.ok ? `${aSee.rows.length}` : aSee.code])
    const mSee = await as(montor.id, `SELECT id FROM public.system_alerts WHERE id = $1`, [id])
    res.push(['montør ser den ikke', mSee.ok && mSee.rows.length === 0, mSee.ok ? `${mSee.rows.length}` : mSee.code])
    for (const [u, tag] of [[admin, 'admin'], [montor, 'montør']] as const) {
      const i = await as(u.id, `INSERT INTO public.system_alerts (alert_type, title, message) VALUES ('x', 'x', 'x')`)
      res.push([`${tag} kan ikke oprette`, !i.ok && i.code === '42501', i.ok ? 'OPRETTET' : i.code])
      const d = await as(u.id, `DELETE FROM public.system_alerts WHERE id = $1`, [id])
      res.push([`${tag} kan ikke slette`, !d.ok && d.code === '42501', d.ok ? `${d.count} slettet` : d.code])
      const t = await as(u.id, `UPDATE public.system_alerts SET title = 'ændret' WHERE id = $1`, [id])
      res.push([`${tag} kan ikke ændre titel`, !t.ok && t.code === '42501', t.ok ? `${t.count} ændret` : t.code])
    }
    const mRead = await as(montor.id, `UPDATE public.system_alerts SET is_read = true, read_at = now() WHERE id = $1`, [id])
    res.push(['montør kan ikke markere læst (0 rækker)', mRead.ok && mRead.count === 0, mRead.ok ? `${mRead.count}` : mRead.code])
    const aRead = await as(admin.id, `UPDATE public.system_alerts SET is_read = true, read_at = now() WHERE id = $1`, [id])
    res.push(['admin markerer læst', aRead.ok && aRead.count === 1, aRead.ok ? `${aRead.count}` : aRead.code])
    const dupOpen = await client.query(`SELECT count(*)::int n FROM public.system_alerts WHERE alert_type = 'fuldmagt_signed' AND title = $1 AND is_dismissed = false AND entity_id IS NULL`, [title])
    res.push(['dubletsikring: åben advarsel med samme type/titel findes (ny ville springes over)', dupOpen.rows[0].n === 1, String(dupOpen.rows[0].n)])
    const aDis = await as(admin.id, `UPDATE public.system_alerts SET is_dismissed = true, dismissed_at = now(), dismissed_by = $2 WHERE id = $1`, [id, admin.id])
    res.push(['admin afviser', aDis.ok && aDis.count === 1, aDis.ok ? `${aDis.count}` : aDis.code])
    const aAfter = await as(admin.id, `SELECT id FROM public.system_alerts WHERE id = $1 AND is_dismissed = false`, [id])
    res.push(['afvist advarsel forsvinder fra klokken', aAfter.ok && aAfter.rows.length === 0, aAfter.ok ? `${aAfter.rows.length}` : aAfter.code])
    const dupAfter = await client.query(`SELECT count(*)::int n FROM public.system_alerts WHERE alert_type = 'fuldmagt_signed' AND title = $1 AND is_dismissed = false`, [title])
    res.push(['dubletsikring: efter afvisning må en ny oprettes', dupAfter.rows[0].n === 0, String(dupAfter.rows[0].n)])
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    const left = await client.query(`SELECT count(*)::int n FROM public.system_alerts WHERE title LIKE '%[FLOW-CHECK %'`).catch(() => ({ rows: [{ n: -1 }] }))
    res.push(['ROLLBACK: intet efterladt i prod', left.rows[0].n === 0, String(left.rows[0].n)])
    await client.end()
  }
  for (const [k, v, n] of res) console.log(`${v ? 'OK ' : 'AFV'} ${k}${n ? `  (${n})` : ''}`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ 00194 flow-tjek ${res.length}/${res.length} (rullet tilbage)`)
  process.exitCode = bad ? 2 : 0
}

main().catch((e) => { console.error('[prod-flow-00194] FEJL (rullet tilbage):', maskDbError(e)); process.exit(1) })
