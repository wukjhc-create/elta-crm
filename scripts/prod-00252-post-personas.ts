/**
 * 00252 — PRODUCTION persona-tjek EFTER anvendelse, ROLLBACK-ONLY (én transaktion, altid ROLLBACK). Samme fixtures og
 * forespørgsler som prod-00252-dryrun.ts' persona-del, men mod det anvendte skema (ingen krop/rollback-blok).
 *   npx tsx scripts/prod-00252-post-personas.ts
 * Kun PASS/FAIL + antal/koder ud.
 */
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { PORTAL_CUSTOMERS } from './prod-00252-shared'
import { PORTAL_TASK_COLUMNS, toPortalTask, findForbiddenPortalKeys } from '../src/lib/portal/projections'
import { isPortalVisibleBesigtigelse, isPortalConfirmableBesigtigelse, shouldRemindBesigtigelse } from '../src/lib/tasks/besigtigelse-task'

runMain(() => withProdRollbackProbe('00252-post-personas', async ({ q, as, add }) => {
  const pick = async (role: string) => (await q(`SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = $1 AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1`, [role]))[0]?.id as string | undefined
  const admin = await pick('admin'); const montor = await pick('montør')
  const col = (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'`))[0].n
  add('UÆNDRET', '00252 er anvendt', col === 1, `${col}`)
  if (col !== 1) return
  const seen = async (uid?: string) => { if (!uid) return null; const r = await as({ uid }, `SELECT count(*)::int n FROM public.customer_tasks`); return r.ok ? (r.rows[0].n as number) : -1 }
  const montor0 = await seen(montor)
  const pc = (await q(`SELECT customer_id FROM ${PORTAL_CUSTOMERS} x ORDER BY customer_id LIMIT 2`)).map((r) => r.customer_id as string)
  const [A, B] = pc
  const realA = await q(`SELECT ${PORTAL_TASK_COLUMNS} FROM public.customer_tasks WHERE customer_id = ANY($1::uuid[]) AND customer_visible = true AND title ILIKE '%esigtigelse%'`, [pc])
  add('NY', 'rigtige data: ingen opgave er kundesynlig hos de to portalkunder (alle historiske er private)', realA.length === 0, `${realA.length}`)
  const due = new Date(Date.now() + 5 * 86400_000).toISOString(); const old = new Date(Date.now() - 5 * 86400_000).toISOString()
  const mk = async (cust: string, title: string, visible: boolean, autoRule: string | null = null) => (await q(
    `INSERT INTO public.customer_tasks (customer_id, title, description, status, priority, due_date, created_at, customer_visible, auto_rule) VALUES ($1, $2, 'Besigtigelse planlagt d. 1. januar kl. 10:00', 'pending', 'normal', $3, $4, $5, $6) RETURNING id`,
    [cust, title, due, old, visible, autoRule]))[0].id as string
  const tVis = await mk(A, 'Besigtigelse hos p252', true)
  const tTitle = await mk(A, 'Besigtigelse hos p252 (intern)', false)
  const tAssist = await mk(A, 'Besigtigelse hos p252 (assistent)', true, 'assistant_appointment')
  const tB = await mk(B, 'Besigtigelse hos p252 B', true)
  const rows = await q(`SELECT ${PORTAL_TASK_COLUMNS} FROM public.customer_tasks WHERE customer_id = $1 AND customer_visible = true AND title ILIKE '%esigtigelse%' ORDER BY due_date LIMIT 50`, [A])
  const shown = rows.filter((t) => isPortalVisibleBesigtigelse(t)).map((t) => toPortalTask(t))
  const ids = shown.map((s) => s.id)
  add('NY', 'portal: egen kundevendte booking vises (præcis 1)', ids.length === 1 && ids[0] === tVis, `${ids.length}`)
  add('NY', 'portal: customer_visible=false skjult; titel alene gør den ikke synlig', !ids.includes(tTitle), '')
  add('NY', 'portal: assistent-aftale skjult; B\'s opgave skjult for A', !ids.includes(tAssist) && !ids.includes(tB), '')
  add('NY', 'portal: kun projektionens 6 felter, ingen interne', shown.every((s) => Object.keys(s).length === 6) && findForbiddenPortalKeys(shown).length === 0, '')
  const look = async (id: string) => (await q(`SELECT id, customer_id, status, title, description, due_date, auto_rule, customer_visible FROM public.customer_tasks WHERE id = $1 AND customer_id = $2`, [id, A]))[0]
  add('NY', 'direkte id: B\'s opgave uden for A\'s scope; intern titel og assistent-aftale kan ikke bekræftes/ombookes; egen booking kan', !(await look(tB)) && !isPortalConfirmableBesigtigelse(await look(tTitle)) && !isPortalConfirmableBesigtigelse(await look(tAssist)) && isPortalConfirmableBesigtigelse(await look(tVis)), '')
  if (admin) {
    const a1 = await as({ uid: admin }, `UPDATE public.customer_tasks SET customer_visible = true WHERE id = $1 RETURNING id`, [tTitle])
    const a2 = await as({ uid: admin }, `UPDATE public.customer_tasks SET status = 'in_progress' WHERE id = $1 RETURNING id`, [tTitle])
    const a3 = await as({ uid: admin }, `SELECT count(*)::int n FROM public.customer_tasks`)
    const total = (await q(`SELECT count(*)::int n FROM public.customer_tasks`))[0].n
    add('NY', 'admin: ser alle opgaver; kan redigere status; kan IKKE sætte kundesynlighed (42501)', a3.ok && a3.rows[0].n === total && a2.ok && a2.rows.length === 1 && !a1.ok && a1.code === '42501', `${a1.ok ? 'ok' : a1.code}`)
  }
  add('NY', 'montør: ser uændret kun egne opgaver', (await seen(montor)) === montor0, `${montor0}`)
  const rem = await q(`SELECT t.id, t.customer_id, t.title, t.auto_rule, t.status, t.due_date, t.customer_visible, c.id AS cust_id FROM public.customer_tasks t LEFT JOIN public.customers c ON c.id = t.customer_id
    WHERE t.customer_visible = true AND t.title ILIKE '%esigtigelse%' AND t.status = 'pending' AND t.created_at < $1`, [new Date(Date.now() - 3 * 86400_000).toISOString()])
  const r = rem.filter((t) => shouldRemindBesigtigelse(t))
  const fx = [tVis, tTitle, tAssist, tB]
  add('NY', 'rykker: 0 rigtige kandidater; kun kundesynlige afventende fremtidige (fixtures A+B); modtager = opgavens kunde', r.filter((t) => !fx.includes(t.id)).length === 0 && r.some((t) => t.id === tVis) && r.some((t) => t.id === tB) && !r.some((t) => t.id === tTitle || t.id === tAssist) && r.every((t) => t.cust_id === t.customer_id), `${r.length}`)
}))
