/**
 * 00252 — PRODUCTION READ ONLY (prod-readonly.ts: én READ ONLY-transaktion, kun SELECT). Intet apply.
 *   npx tsx scripts/prod-00252-preflight.ts pre  [--save fil]
 *   npx tsx scripts/prod-00252-preflight.ts post [--pre fil]   (efter permanent anvendelse)
 * pre: kolonnen findes IKKE; tællinger (gammel titelregel, fremtidige, berørte kunder); RLS/grants-fingeraftryk;
 *      data-fingeraftryk; bevis for at NY kode + skema UDEN 00252 ikke er en understøttet tilstand (42703).
 * post: kolonne NOT NULL DEFAULT false, alle eksisterende false, værn installeret, RLS/grants uændret, data = pre.
 * Kun antal/md5 ud.
 */
import { readFileSync, writeFileSync } from 'fs'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'
import { FP_00252, FP_00252_SQL, OLD_RULE, PORTAL_CUSTOMERS, TASK_SECURITY_SQL } from './prod-00252-shared'
import { PORTAL_TASK_COLUMNS } from '../src/lib/portal/projections'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

withProdReadOnly(`prod-00252-preflight ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const struct = (await run(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const fp = (await run(FP_00252_SQL))[0]
  const sec = (await run(TASK_SECURITY_SQL))[0]
  const col = (await run(`SELECT is_nullable n, column_default d FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'`))[0] as { n: string; d: string } | undefined
  const obj = (await run(`SELECT (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='customer_tasks_visibility_guard') f,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname='trg_customer_tasks_visibility_guard') t`))[0]
  const c = (await run(`SELECT
    (SELECT count(*)::int FROM public.customer_tasks) tasks,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE}) old_rule_all,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.customer_id IN ${PORTAL_CUSTOMERS}) old_rule_portal,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.customer_id IN ${PORTAL_CUSTOMERS} AND t.due_date > now()) old_rule_portal_future,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.due_date > now()) old_rule_future_all,
    (SELECT count(DISTINCT t.customer_id)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.customer_id IN ${PORTAL_CUSTOMERS}) old_rule_customers,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.description ~* '^besigtigelse planlagt d\\. ') booking_format,
    (SELECT count(*)::int FROM public.customer_tasks t WHERE ${OLD_RULE} AND t.status = 'pending' AND t.due_date > now()) old_rule_remindable,
    (SELECT count(*)::int FROM public.portal_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now())) active_tokens`))[0]
  console.log(`INFO  struktur-md5 (public): ${struct}`)
  console.log(`INFO  customer_tasks-sikkerhed: ${JSON.stringify(sec)}`)
  for (const [t] of FP_00252) console.log(`INFO  fp ${t}: ${fp[t]}`)
  console.log(`INFO  tællinger: ${JSON.stringify(c)}`)

  if (mode === 'pre') {
    res.push(['customer_tasks.customer_visible findes IKKE (00252 ikke anvendt)', !col, col ? 'findes' : 'fraværende'])
    res.push(['ingen 00252-funktion/-trigger', obj.f === 0 && obj.t === 0, `${obj.f}/${obj.t}`])
    res.push(['ingen 00251-objekter kræves: 00252 refererer kun customer_tasks-kolonner (title/auto_rule osv. findes allerede)', (await run(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name IN ('title','auto_rule','customer_id','status','due_date')`))[0].n === 5, ''])
    res.push(['gammel titelregel: ingen FREMTIDIGE opgaver hos portalkunder (kun historiske forsvinder fra portalen)', c.old_rule_portal_future === 0, `${c.old_rule_portal_future} fremtidige af ${c.old_rule_portal}`])
    res.push(['gammel titelregel: ingen rykker-kandidater (afventende + fremtidig) — ingen kunde mister/får en rykker ved skiftet', c.old_rule_remindable === 0, `${c.old_rule_remindable}`])
    // NY kode + skema UDEN 00252 er ikke understøttet: portalens opgave-forespørgsel vælger kolonnen → 42703
    let newQuery = 'ok'
    try { await run(`SELECT ${PORTAL_TASK_COLUMNS} FROM public.customer_tasks WHERE customer_visible LIMIT 1`) } catch (e) { newQuery = (e as { code?: string }).code ?? 'fejl' }
    res.push(['NY kode + skema UDEN 00252: portalens opgave-forespørgsel fejler (42703) → ikke understøttet; MIGRATION før PUSH', newQuery === '42703', newQuery])
  } else {
    res.push(['kolonnen findes: NOT NULL DEFAULT false', !!col && col.n === 'NO' && /false/.test(col.d), JSON.stringify(col ?? null)])
    res.push(['værn-funktion og -trigger installeret', obj.f === 1 && obj.t === 1, `${obj.f}/${obj.t}`])
    const v = (await run(`SELECT (SELECT count(*)::int FROM public.customer_tasks WHERE customer_visible) vis, (SELECT tgenabled::text FROM pg_trigger WHERE tgname='trg_customer_tasks_visibility_guard') en,
      has_function_privilege('anon','public.customer_tasks_visibility_guard()','EXECUTE') a, has_function_privilege('authenticated','public.customer_tasks_visibility_guard()','EXECUTE') u`))[0]
    res.push(['ingen opgave er kundesynlig lige efter anvendelse (kun nye bookinger bliver det)', v.vis === 0, `${v.vis}`])
    res.push(['værnet er slået til og kan ikke kaldes af anon/authenticated', v.en === 'O' && v.a === false && v.u === false, JSON.stringify(v)])
    const preFile = argOf('--pre')
    if (preFile) {
      const before = JSON.parse(readFileSync(preFile, 'utf8')) as { fp: Record<string, string>; sec: Record<string, string> }
      const changed = FP_00252.map(([t]) => t).filter((t) => before.fp[t] !== fp[t])
      res.push(['data-fingeraftryk = pre (ingen eksisterende rækker ændret; normal drift skal vurderes)', changed.length === 0, changed.join(',') || 'alle = pre'])
      res.push(['RLS-politikker, tabel-grants, RLS-flag og øvrige triggere på customer_tasks = pre', ['pol', 'grants', 'rls', 'other_triggers'].every((k) => before.sec[k] === sec[k]), ''])
    }
  }
  const save = argOf('--save')
  if (save) { writeFileSync(save, JSON.stringify({ struct, fp, sec, counts: c }, null, 2)); console.log(`INFO  gemt: ${save}`) }
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
