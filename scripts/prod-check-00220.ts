/**
 * PRODUCTION-tjek for 00220 (notifikationsindstillinger, godkendt 2026-10-14). Kun antal/ja-nej — ingen værdier ud.
 * Sender ALDRIG mail (ingen afsender kaldes).   npx tsx scripts/prod-check-00220.ts [pre|post]
 * post: kolonnen findes med standard {} (alt FRA), ingen profil har noget slået til, authenticated har kun
 *       kolonne-UPDATE på notification_preferences (+ de 4 eksisterende), og i en ROLLBACK-transaktion kan en rigtig bruger
 *       gemme egne indstillinger men ikke andres.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-check-00220', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const hasCol = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='notification_preferences'`)).rows[0].n === 1
    const upd = (await client.query(`SELECT string_agg(column_name, ',' ORDER BY column_name) cols FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE')`)).rows[0].cols as string
    console.log(`kolonne=${hasCol ? 'findes' : 'mangler'} · authenticated UPDATE-kolonner=${upd}`)
    if (mode === 'pre') {
      res.push(['kolonnen findes endnu ikke', !hasCol, ''])
    } else {
      res.push(['kolonnen findes', hasCol, ''])
      res.push(['authenticated kan kun opdatere de 4 eksisterende + notification_preferences', upd === 'department,full_name,notification_preferences,phone,updated_at', upd])
      const on = (await client.query(`SELECT count(*)::int total,
          count(*) FILTER (WHERE notification_preferences <> '{}'::jsonb)::int non_default FROM profiles`)).rows[0] as { total: number; non_default: number }
      res.push(['alle hændelser FRA som standard (ingen profil har noget slået til)', on.non_default === 0, `${on.non_default}/${on.total} afvigende`])
      const users = (await client.query(`SELECT id FROM profiles WHERE is_active ORDER BY created_at LIMIT 2`)).rows as Array<{ id: string }>
      if (users.length === 2) {
        const as = async (pid: string, sql: string, params: unknown[]) => {
          await client.query('SAVEPOINT p')
          try {
            await client.query('SET LOCAL ROLE authenticated')
            await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: pid, role: 'authenticated' })])
            const r = await client.query(sql, params)
            await client.query('RESET ROLE'); await client.query('RELEASE SAVEPOINT p')
            return { ok: true, count: r.rowCount ?? 0, code: '' }
          } catch (e) { await client.query('ROLLBACK TO SAVEPOINT p'); return { ok: false, count: 0, code: (e as { code?: string }).code ?? 'fejl' } }
        }
        const own = await as(users[0].id, `UPDATE profiles SET notification_preferences = '{"offer_signed":{"email":true,"push":false}}' WHERE id = $1`, [users[0].id])
        res.push(['bruger kan gemme egne indstillinger', own.ok && own.count === 1, own.ok ? `rækker=${own.count}` : own.code])
        const other = await as(users[0].id, `UPDATE profiles SET notification_preferences = '{"new_lead":{"email":true}}' WHERE id = $1`, [users[1].id])
        res.push(['bruger kan ikke ændre andres indstillinger', !other.ok || other.count === 0, other.ok ? `rækker=${other.count}` : other.code])
        const role = await as(users[0].id, `UPDATE profiles SET role = 'admin' WHERE id = $1`, [users[0].id])
        res.push(['rolle kan stadig ikke ændres af brugeren selv', !role.ok || role.count === 0, role.ok ? `rækker=${role.count}` : role.code])
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}${note ? `  (${note})` : ''}`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) (${mode}) — alt rullet tilbage` : `✅ ${res.length} tjek som forventet (${mode}) — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
