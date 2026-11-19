/**
 * 00252 — PRODUCTION DRY-RUN, ROLLBACK-ONLY (prod-rollback-probe.ts: ÉN transaktion, ALTID ROLLBACK, COMMIT forbudt).
 *   npx tsx scripts/prod-00252-dryrun.ts
 * 1. før: struktur-md5, data-fingeraftryk, RLS/grants på customer_tasks, medarbejder-synlighed (admin/montør)
 * 2. den PRÆCISE migrationskrop (supabase/migrations/00252…sql uden BEGIN/COMMIT)
 * 3. efter: kolonne/standard, alle eksisterende false, værn + ACL, RLS/grants uændret, ingen indhold ændret
 * 4. fixtures I transaktionen på to eksisterende portalkunder (ingen nye kunder): portal-forespørgslen (ny kode),
 *    titel-angreb, assistent-aftale, direkte id, B's opgave; gammel kode på nyt skema (tilstand A); medarbejdere;
 *    rykker-udvælgelse (ny kode, intet sendes); tilbudsprojektion for alle portal-synlige tilbud
 * 5. fixtures slettes → filens rollback-SQL → struktur-md5 + data-fingeraftryk = før, intet 00252-objekt tilbage
 * 6. transaktionen rulles tilbage. Kun PASS/FAIL + antal/koder ud.
 */
import { readFileSync } from 'fs'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'
import { FP_00252, FP_00252_SQL, PORTAL_CUSTOMERS, TASK_SECURITY_SQL } from './prod-00252-shared'
import { PORTAL_TASK_COLUMNS, PORTAL_OFFER_COLUMNS, PORTAL_LINE_ITEM_COLUMNS, toPortalTask, findForbiddenPortalKeys } from '../src/lib/portal/projections'
import { isPortalVisibleBesigtigelse, isPortalConfirmableBesigtigelse, shouldRemindBesigtigelse, isBookedCustomerBesigtigelse, isPortalBesigtigelseRequest } from '../src/lib/tasks/besigtigelse-task'

const body = readFileSync('supabase/migrations/00252_customer_tasks_customer_visible.sql', 'utf8').replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
const rollback = readFileSync('docs/runbooks/sql/00252_rollback.sql', 'utf8').replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')

runMain(() => withProdRollbackProbe('00252-dryrun', async ({ q, as, add }) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body) || /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(rollback)) throw new Error('transaktionskontrol i kroppen')
  const pick = async (role: string) => (await q(`SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = $1 AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1`, [role]))[0]?.id as string | undefined
  const admin = await pick('admin'); const montor = await pick('montør'); const sl = await pick('serviceleder')
  const struct0 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const fp0 = (await q(FP_00252_SQL))[0]
  const sec0 = (await q(TASK_SECURITY_SQL))[0]
  const total0 = (await q(`SELECT count(*)::int n FROM public.customer_tasks`))[0].n as number
  const seen = async (uid?: string) => { if (!uid) return null; const r = await as({ uid }, `SELECT count(*)::int n FROM public.customer_tasks`); return r.ok ? (r.rows[0].n as number) : -1 }
  const adminSeen0 = await seen(admin); const montorSeen0 = await seen(montor)
  add('UÆNDRET', 'før: 00252 ikke anvendt; admin ser alle opgaver', !(await q(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'`)).length && adminSeen0 === total0, `struktur ${struct0.slice(0, 8)}… · opgaver ${total0}`)

  // ── 2. migrationskroppen ──
  try { await q(body) } catch (e) { add('NY', 'migrationskroppen kører rent', false, (e as { code?: string }).code ?? 'fejl'); return }
  add('NY', 'migrationskroppen kører rent på prod-skemaet (uden 00251)', true, '')

  // ── 3. efter krop ──
  const col = (await q(`SELECT is_nullable n, column_default d FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'`))[0]
  add('NY', 'kolonnen tilføjet: NOT NULL DEFAULT false', !!col && col.n === 'NO' && /false/.test(col.d), JSON.stringify(col ?? null))
  const vis = (await q(`SELECT count(*) FILTER (WHERE customer_visible)::int v, count(*)::int n FROM public.customer_tasks`))[0]
  add('NY', 'alle eksisterende opgaver customer_visible=false; antal uændret', vis.v === 0 && vis.n === total0, `${vis.v} synlige af ${vis.n}`)
  const g = (await q(`SELECT (SELECT tgenabled::text FROM pg_trigger WHERE tgname='trg_customer_tasks_visibility_guard') en,
    (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_customer_tasks_visibility_guard') def,
    has_function_privilege('anon','public.customer_tasks_visibility_guard()','EXECUTE') a, has_function_privilege('authenticated','public.customer_tasks_visibility_guard()','EXECUTE') u,
    (SELECT prosecdef FROM pg_proc WHERE proname='customer_tasks_visibility_guard') secdef, (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname='customer_tasks_visibility_guard') cfg`))[0]
  add('NY', 'værn: BEFORE INSERT OR UPDATE pr. række, slået til, ikke SECURITY DEFINER, fast search_path, ingen EXECUTE til anon/authenticated', g.en === 'O' && /BEFORE INSERT OR UPDATE/.test(g.def) && /FOR EACH ROW/.test(g.def) && g.secdef === false && /search_path=public/.test(String(g.cfg)) && g.a === false && g.u === false, `${g.en} sd=${g.secdef} a=${g.a} u=${g.u}`)
  const sec1 = (await q(TASK_SECURITY_SQL))[0]
  add('NY', 'RLS-politikker, tabel-grants, RLS-flag og øvrige triggere på customer_tasks uændret', ['pol', 'grants', 'rls', 'other_triggers'].every((k) => sec0[k] === sec1[k]), ['pol', 'grants', 'rls', 'other_triggers'].filter((k) => sec0[k] !== sec1[k]).join(',') || 'alle =')
  const fp1 = (await q(FP_00252_SQL))[0]
  const ch1 = FP_00252.map(([t]) => t).filter((t) => fp0[t] !== fp1[t])
  add('NY', 'intet eksisterende indhold ændret (opgaver, kunder, sager, tilbud, linjer, dokumenter, beskeder, tokens, fakturaer, rettigheder, henvendelser)', ch1.length === 0, ch1.join(',') || 'alle = før')

  // ── 4. fixtures på to eksisterende portalkunder ──
  const pc = (await q(`SELECT customer_id FROM ${PORTAL_CUSTOMERS} x ORDER BY customer_id LIMIT 2`)).map((r) => r.customer_id as string)
  if (pc.length < 2) { add('NY', 'to portalkunder til personatest', false, `${pc.length}`); return }
  const [A, B] = pc
  const due = new Date(Date.now() + 5 * 86400_000).toISOString(); const old = new Date(Date.now() - 5 * 86400_000).toISOString()
  const mk = async (cust: string, title: string, visible: boolean, autoRule: string | null = null) => (await q(
    `INSERT INTO public.customer_tasks (customer_id, title, description, status, priority, due_date, created_at, customer_visible, auto_rule) VALUES ($1, $2, 'Besigtigelse planlagt d. 1. januar kl. 10:00', 'pending', 'normal', $3, $4, $5, $6) RETURNING id`,
    [cust, title, due, old, visible, autoRule]))[0].id as string
  const tVis = await mk(A, 'Besigtigelse hos p252', true)
  const tTitle = await mk(A, 'Besigtigelse hos p252 (intern)', false)
  const tAssist = await mk(A, 'Besigtigelse hos p252 (assistent)', true, 'assistant_appointment')
  const tB = await mk(B, 'Besigtigelse hos p252 B', true)
  const fx = [tVis, tTitle, tAssist, tB]
  // NY kode — getPortalBesigtigelser (præcis forespørgsel + klassifikation + projektion)
  const portalRows = await q(`SELECT ${PORTAL_TASK_COLUMNS} FROM public.customer_tasks WHERE customer_id = $1 AND customer_visible = true AND title ILIKE '%esigtigelse%' ORDER BY due_date LIMIT 50`, [A])
  const shown = portalRows.filter((t) => isPortalVisibleBesigtigelse(t)).map((t) => toPortalTask(t))
  const ids = shown.map((s) => s.id)
  add('NY', 'portal (kunde A): kun egen kundevendte besigtigelse vises; eksisterende historiske opgaver vises ikke længere', ids.length === 1 && ids[0] === tVis, `${ids.length} vist`)
  add('NY', 'portal: titlen "Besigtigelse hos …" uden customer_visible gør den IKKE synlig', !ids.includes(tTitle))
  add('NY', 'portal: assistent-aftale vises ikke (heller ikke med flaget)', !ids.includes(tAssist))
  add('NY', 'portal: B\'s kundevendte opgave vises aldrig for A', !ids.includes(tB))
  add('NY', 'portal: svaret har kun projektionens 6 felter og ingen interne felter', shown.every((s) => Object.keys(s).sort().join(',') === 'created_at,description,due_date,id,status,title') && findForbiddenPortalKeys(shown).length === 0, '')
  // direkte id (bekræft/ombook-opslaget i ny kode: id + customer_id fra token, derefter isPortalConfirmableBesigtigelse)
  const look = async (id: string) => (await q(`SELECT id, customer_id, status, title, description, due_date, auto_rule, customer_visible FROM public.customer_tasks WHERE id = $1 AND customer_id = $2`, [id, A]))[0]
  const lB = await look(tB); const lT = await look(tTitle); const lAs = await look(tAssist); const lV = await look(tVis)
  add('NY', 'direkte id: B\'s opgave findes ikke i A\'s scope (afvist)', !lB)
  add('NY', 'direkte id: intern "Besigtigelse hos"-opgave kan ikke bekræftes/ombookes', !!lT && !isPortalConfirmableBesigtigelse(lT))
  add('NY', 'direkte id: assistent-aftale kan ikke bekræftes/ombookes (auto_rule nu med i opslaget)', !!lAs && !isPortalConfirmableBesigtigelse(lAs))
  add('NY', 'direkte id: egen kundevendte booking kan bekræftes', !!lV && isPortalConfirmableBesigtigelse(lV))

  // TILSTAND A: gammel kode (4487efd2) på nyt skema
  const oldRows = await q(`SELECT id, customer_id, title, description, due_date, status, created_at, auto_rule FROM public.customer_tasks WHERE customer_id = $1 AND title ILIKE '%esigtigelse%' ORDER BY due_date LIMIT 50`, [A])
  const oldShown = oldRows.filter((t) => isBookedCustomerBesigtigelse(t) || isPortalBesigtigelseRequest(t))
  add('NY', 'tilstand A (gammel kode, nyt skema): gammel portal-forespørgsel virker uændret (titelregel som i dag)', oldShown.some((t) => t.id === tVis) && oldShown.some((t) => t.id === tTitle), `${oldShown.length} rækker`)
  const oldPortalBook = await as({ uid: admin ?? '' }, `SELECT 1`) // sanity
  void oldPortalBook
  let oldSvcInsert = 'ok'
  try { await q(`SAVEPOINT s1`); await q(`INSERT INTO public.customer_tasks (customer_id, title, description, status, priority, due_date, created_by) VALUES ($1, 'PORTAL: Besigtigelse anmodet — p252', 'x', 'pending', 'high', $2, NULL)`, [A, due]); await q(`ROLLBACK TO SAVEPOINT s1`) } catch (e) { oldSvcInsert = (e as { code?: string }).code ?? 'fejl'; await q(`ROLLBACK TO SAVEPOINT s1`) }
  add('NY', 'tilstand A: gammel portalBookBesigtigelse-insert (service_role, uden flag) virker', oldSvcInsert === 'ok', oldSvcInsert)
  if (admin) {
    const ins = await as({ uid: admin }, `INSERT INTO public.customer_tasks (customer_id, title, description, status, priority, due_date, assigned_to, created_by) VALUES ($1, 'Besigtigelse hos p252 gammel', 'x', 'pending', 'high', $2, $3, $3) RETURNING id`, [A, due, admin])
    add('NY', 'tilstand A: gammel bookBesigtigelse-insert (authenticated, uden flag) virker', ins.ok && ins.rows.length === 1, ins.ok ? 'ok' : ins.code)
    const upd = await as({ uid: admin }, `UPDATE public.customer_tasks SET description = description || ' x', status = 'in_progress' WHERE id = $1 RETURNING id`, [tTitle])
    add('NY', 'tilstand A + B: almindelig opgaveredigering (beskrivelse/status) virker for admin', upd.ok && upd.rows.length === 1, upd.ok ? 'ok' : upd.code)
    const atk1 = await as({ uid: admin }, `UPDATE public.customer_tasks SET customer_visible = true WHERE id = $1 RETURNING id`, [tTitle])
    const atk2 = await as({ uid: admin }, `INSERT INTO public.customer_tasks (customer_id, title, status, priority, created_by, customer_visible) VALUES ($1, 'p252 x', 'pending', 'normal', $2, true) RETURNING id`, [A, admin])
    add('NY', 'admin kan IKKE gøre en opgave kundesynlig direkte (UPDATE/INSERT → 42501)', !atk1.ok && atk1.code === '42501' && !atk2.ok && atk2.code === '42501', `${atk1.ok ? 'ok' : atk1.code}/${atk2.ok ? 'ok' : atk2.code}`)
  }
  // medarbejdere: synlighed uændret (admin alle; montør kun egne — fixtures er ikke montørens)
  const totalNow = (await q(`SELECT count(*)::int n FROM public.customer_tasks`))[0].n as number
  const adminSeen1 = await seen(admin); const montorSeen1 = await seen(montor)
  add('NY', 'admin ser fortsat ALLE opgaver (inkl. interne og nye)', adminSeen1 === totalNow, `${adminSeen1}/${totalNow}`)
  add('NY', 'montør ser uændret de samme opgaver som før (kun egne)', montorSeen1 === montorSeen0, `${montorSeen0} → ${montorSeen1}`)
  if (!sl) add('UÆNDRET', 'serviceleder: ingen aktiv profil i prod — dækket af staging (effective-permissions, task-scope)', true, 'NOT_TESTABLE_PROD')

  // rykker-udvælgelse (ny kode — offer-reminders route): customer_visible + titel + pending + oprettet før cutoff, så shouldRemind
  const cutoff = new Date(Date.now() - 3 * 86400_000).toISOString()
  const rem = await q(`SELECT t.id, t.customer_id, t.title, t.description, t.created_at, t.due_date, t.status, t.auto_rule, t.customer_visible, c.id AS cust_id
    FROM public.customer_tasks t LEFT JOIN public.customers c ON c.id = t.customer_id
    WHERE t.customer_visible = true AND t.title ILIKE '%esigtigelse%' AND t.status = 'pending' AND t.created_at < $1`, [cutoff])
  const remindable = rem.filter((t) => shouldRemindBesigtigelse(t))
  const real = remindable.filter((t) => !fx.includes(t.id))
  add('NY', 'rykker: ingen RIGTIGE opgaver udvælges (alle eksisterende er private) — intet ville blive sendt', real.length === 0, `${real.length}`)
  add('NY', 'rykker: kun kundevendte, afventende, fremtidige bookinger (fixtures: A + B ja; intern titel og assistent nej)', remindable.some((t) => t.id === tVis) && remindable.some((t) => t.id === tB) && !remindable.some((t) => t.id === tTitle || t.id === tAssist), `${remindable.length}`)
  add('NY', 'rykker: modtageren er opgavens egen kunde (join på customer_id)', remindable.every((t) => t.cust_id === t.customer_id), '')

  // tilbudsprojektion (ny kode) for ALLE portal-synlige tilbud
  const offers = await q(`SELECT ${PORTAL_OFFER_COLUMNS} FROM public.offers WHERE status IN ('sent','viewed','accepted','rejected')`)
  const lines = offers.length ? await q(`SELECT ${PORTAL_LINE_ITEM_COLUMNS} FROM public.offer_line_items WHERE offer_id = ANY($1::uuid[])`, [offers.map((o) => o.id)]) : []
  const dto = offers.map(({ created_by: _c, ...o }) => ({ ...o, line_items: lines.filter((l) => l.offer_id === o.id) }))
  const forb = findForbiddenPortalKeys(dto)
  add('NY', `tilbudsprojektion: ${offers.length} portal-tilbud / ${lines.length} linjer uden kost/margin/avance/noter/medarbejderfelter`, forb.length === 0, forb.slice(0, 3).join(','))
  const raw = offers.length ? await q(`SELECT id, unit_price, total, quantity, discount_percentage FROM public.offer_line_items WHERE offer_id = ANY($1::uuid[])`, [offers.map((o) => o.id)]) : []
  const same = raw.every((r) => { const l = lines.find((x) => x.id === r.id); return l && String(l.unit_price) === String(r.unit_price) && String(l.total) === String(r.total) && String(l.quantity) === String(r.quantity) && String(l.discount_percentage) === String(r.discount_percentage) })
  add('NY', 'tilbudsprojektion: kundens salgspris, antal, rabat og linjetotal = databasens; totaler/moms med', same && offers.every((o) => 'final_amount' in o && 'tax_amount' in o && 'total_amount' in o && 'discount_amount' in o), '')

  // ── 5. oprydning + rollback-SQL ──
  await q(`DELETE FROM public.customer_tasks WHERE id = ANY($1::uuid[])`, [fx])
  const fp2 = (await q(FP_00252_SQL))[0]
  add('NY', 'efter oprydning: data-fingeraftryk = før', FP_00252.every(([t]) => fp2[t] === fp0[t]), FP_00252.map(([t]) => t).filter((t) => fp2[t] !== fp0[t]).join(',') || 'alle = før')
  await q(rollback)
  const left = (await q(`SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible') c,
    (SELECT count(*)::int FROM pg_proc WHERE proname='customer_tasks_visibility_guard') f, (SELECT count(*)::int FROM pg_trigger WHERE tgname='trg_customer_tasks_visibility_guard') t`))[0]
  add('NY', 'rollback-SQL: customer_visible, værn-funktion og -trigger væk', left.c === 0 && left.f === 0 && left.t === 0, JSON.stringify(left))
  const struct3 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  add('NY', 'rollback-SQL: struktur-md5 af hele public = før (præcis før-tilstand)', struct3 === struct0, `${struct3.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
  const fp3 = (await q(FP_00252_SQL))[0]
  add('NY', 'rollback-SQL: data-fingeraftryk = før', FP_00252.every(([t]) => fp3[t] === fp0[t]), FP_00252.map(([t]) => t).filter((t) => fp3[t] !== fp0[t]).join(',') || 'alle = før')
  const sec3 = (await q(TASK_SECURITY_SQL))[0]
  add('NY', 'rollback-SQL: RLS/grants/triggere på customer_tasks = før', ['pol', 'grants', 'rls', 'other_triggers'].every((k) => sec0[k] === sec3[k]), '')
}))
