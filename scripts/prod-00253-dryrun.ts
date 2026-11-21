/**
 * 00253 (sync_leases) — PRODUCTION DRY-RUN, ROLLBACK-ONLY (ÉN transaktion, ALTID ROLLBACK, COMMIT forbudt).
 *   npx tsx scripts/prod-00253-dryrun.ts
 * før-struktur → præcis krop → lease-adfærd (service_role/authenticated/anon) → rollback-SQL → struktur = før.
 * Data-fingeraftryk på mail-/henvendelses-tabeller viser at intet eksisterende ændres. Kun PASS/FAIL + koder ud.
 */
import { readFileSync } from 'fs'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'

const strip = (s: string) => s.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
const body = strip(readFileSync('supabase/migrations/00253_sync_leases.sql', 'utf8'))
const rollback = strip(readFileSync('docs/runbooks/sql/00253_rollback.sql', 'utf8'))
const FP = `SELECT ${['incoming_emails', 'graph_sync_state', 'conversations', 'conversation_items', 'conversation_actions', 'customers', 'customer_tasks', 'permission_catalog']
  .map((t) => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) FROM public.${t} x) AS ${t}`).join(', ')}`

runMain(() => withProdRollbackProbe('00253-dryrun', async ({ q, add }) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body + rollback)) throw new Error('transaktionskontrol i kroppen')
  const struct0 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const fp0 = (await q(FP))[0]
  add('UÆNDRET', 'før: 00253 ikke anvendt', !(await q(`SELECT to_regclass('public.sync_leases') t`))[0].t, `struktur ${struct0.slice(0, 8)}…`)
  try { await q(body) } catch (e) { add('NY', 'migrationskroppen kører rent', false, (e as { code?: string }).code ?? 'fejl'); return }
  add('NY', 'migrationskroppen kører rent på prod-skemaet', true, '')
  const as = async (role: string, sql: string) => {
    await q('SAVEPOINT p'); try { await q(`SET LOCAL ROLE ${role}`); const r = await q(sql); return { ok: true as const, v: r[0] ? Object.values(r[0])[0] : null } }
    catch (e) { return { ok: false as const, v: (e as { code?: string }).code } } finally { await q('ROLLBACK TO SAVEPOINT p'); await q('RESET ROLE') }
  }
  // service_role: én holder, anden optaget, frigivelse kun for holder (i samme transaktion — uden savepoint-rul tilbage)
  await q('SET LOCAL ROLE service_role')
  const h1 = (await q(`SELECT public.sync_lease_acquire('email-sync', 330) h`))[0].h as string | null
  const h2 = (await q(`SELECT public.sync_lease_acquire('email-sync', 330) h`))[0].h as string | null
  const wrong = (await q(`SELECT public.sync_lease_release('email-sync', gen_random_uuid()) r`))[0].r
  const right = h1 ? (await q(`SELECT public.sync_lease_release('email-sync', $1::uuid) r`, [h1]))[0].r : null
  await q('RESET ROLE')
  add('NY', 'service_role: første acquire = holder, anden = NULL (optaget); release kun for holderen', !!h1 && h2 === null && wrong === false && right === true, `${!!h1}/${h2}/${wrong}/${right}`)
  const a1 = await as('authenticated', `SELECT public.sync_lease_acquire('email-sync', 330)`)
  const a2 = await as('anon', `SELECT public.sync_lease_acquire('email-sync', 330)`)
  const a3 = await as('authenticated', `SELECT count(*) FROM public.sync_leases`)
  const a4 = await as('service_role', `SELECT count(*) FROM public.sync_leases`)
  add('NY', 'authenticated/anon kan ikke kalde funktionerne; ingen rolle læser tabellen direkte (42501)', !a1.ok && a1.v === '42501' && !a2.ok && a2.v === '42501' && !a3.ok && a3.v === '42501' && !a4.ok && a4.v === '42501', `${a1.v}/${a2.v}/${a3.v}/${a4.v}`)
  const fp1 = (await q(FP))[0]
  add('NY', 'intet eksisterende ændret (mails, sync-tilstand, henvendelser, kunder, opgaver, katalog)', Object.keys(fp0).every((k) => fp0[k] === fp1[k]), Object.keys(fp0).filter((k) => fp0[k] !== fp1[k]).join(',') || 'alle = før')
  await q(rollback)
  const left = (await q(`SELECT (to_regclass('public.sync_leases') IS NULL) t, (SELECT count(*)::int FROM pg_proc WHERE proname IN ('sync_lease_acquire','sync_lease_release')) f`))[0]
  const struct2 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  add('NY', 'rollback-SQL: tabel og funktioner væk; struktur-md5 af hele public = før', left.t === true && left.f === 0 && struct2 === struct0, `${struct2.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
  const fp2 = (await q(FP))[0]
  add('NY', 'rollback-SQL: data-fingeraftryk = før', Object.keys(fp0).every((k) => fp0[k] === fp2[k]), '')
}))
