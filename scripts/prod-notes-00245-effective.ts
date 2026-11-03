/**
 * PRODUCTION effektiv kontrol af 00245 (customer_notes) — ROLLBACK-ONLY (prod-rollback-probe.ts). Rigtige profiler; alle
 * prøvenoter/overrides/inaktiveringer oprettes INDE i transaktionen og rulles tilbage — intet committes, intet består.
 *   Pr. rolle (nul overrides): synlige noter i scope/fremmed · opret i scope/fremmed · opret i andens navn · source≠manual ·
 *   slet egen/andens/fremmed · ret andens · flyt til anden kunde / skift forfatter (kolonne-grant)
 *   Per-medarbejder: montør+edit, montør+view.all, montør+edit+manage, salg−edit, salg+manage, serviceleder−manage
 *   Inaktiv profil, manglende profil, anon, service_role
 *   npx tsx scripts/prod-notes-00245-effective.ts
 * Kun PASS/FAIL + antal/fejlkoder ud — ingen id'er, navne eller indhold.
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain, type ProbeRes } from './prod-rollback-probe'

type Cell = { see: string; insIn: string; insFor: string; delOwn: string; delOther: string; delFor: string; updOther: string }

runMain(() => withProdRollbackProbe('notes-00245-effective', async ({ q, as, add, notTestable, why }) => {
  const actives = (await q(`SELECT DISTINCT ON (role) id uid, role::text role FROM profiles WHERE is_active ORDER BY role, created_at`)) as Array<{ uid: string; role: string }>
  const uidOf = (role: string) => actives.find((x) => x.role === role)?.uid
  const montor = uidOf('montør'), salg = uidOf('salg'), svc = uidOf('serviceleder'), adm = uidOf('admin')
  if (!adm) throw new Error('ingen aktiv admin-profil i prod — afbryder')

  // Montørens scope bestemmer "i scope"/"fremmed"; uden montør bruges vilkårlige kunder (alle andre roller har view.all)
  let inScope: string | undefined, foreign: string | undefined
  if (montor) {
    const r = await as({ uid: montor }, `SELECT unnest(public.my_customer_scope_ids()) id`)
    const scope = new Set(r.ok ? r.rows.map((x) => x.id as string) : [])
    inScope = [...scope][0]
    foreign = ((await q(`SELECT id FROM customers ORDER BY id`)) as Array<{ id: string }>).find((c) => !scope.has(c.id))?.id
  }
  if (!inScope || !foreign) {
    const two = (await q(`SELECT id FROM customers ORDER BY id LIMIT 2`)) as Array<{ id: string }>
    inScope ??= two[0]?.id; foreign ??= two.find((c) => c.id !== inScope)?.id
    notTestable('montør i-scope/fremmed', 'ingen montør med kunde i scope i prod — scope-delen er dækket af staging (45/45)')
  }
  if (!inScope || !foreign) throw new Error('mindst to kunder kræves')

  const nA = randomUUID(), nH = randomUUID()
  // en andens note (ejer = admin) på i-scope- og fremmed kunde; seed som postgres i prøvens savepoint
  const seed = [`INSERT INTO public.customer_notes (id, customer_id, content, source, created_by) VALUES
    ('${nA}', '${inScope}', '[PROBE 245]', 'manual', '${adm}'), ('${nH}', '${foreign}', '[PROBE 245]', 'manual', '${adm}')`]
  const ownSeed = (uid: string, id: string, cust: string) => `INSERT INTO public.customer_notes (id, customer_id, content, source, created_by) VALUES ('${id}', '${cust}', '[PROBE 245]', 'manual', (SELECT id FROM public.profiles WHERE id = '${uid}'))`
  const ov = (uid: string, rows: Array<[string, 'grant' | 'revoke']>) =>
    `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map(([k, e]) => `('${uid}', '${k}', '${e}', 'manual', 'rollback-prøve 00245')`).join(',')}`
  const res = (r: ProbeRes) => (r.ok ? String(r.rows.length) : r.code)
  const ins = (uid: string, cust: string, extra = '') =>
    `INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES ('${cust}', '[PROBE 245]', 'manual', '${uid}')${extra} RETURNING 1`

  const cell = async (uid: string, setup: string[] = [], selfUid = uid): Promise<Cell> => {
    const s = [...seed, ...setup]
    const see = await as({ uid }, `SELECT id FROM public.customer_notes WHERE id IN ('${nA}', '${nH}')`, [], s)
    const seeTxt = see.ok ? see.rows.map((x) => (x.id === nA ? 'scope' : 'fremmed')).sort().join('+') || 'intet' : see.code
    const o = randomUUID()
    return {
      see: seeTxt,
      insIn: res(await as({ uid }, ins(selfUid, inScope!), [], s)),
      insFor: res(await as({ uid }, ins(selfUid, foreign!), [], s)),
      delOwn: res(await as({ uid }, `DELETE FROM public.customer_notes WHERE id = '${o}' RETURNING 1`, [], [...s, ownSeed(selfUid, o, inScope!)])),
      delOther: res(await as({ uid }, `DELETE FROM public.customer_notes WHERE id = '${nA}' RETURNING 1`, [], s)),
      delFor: res(await as({ uid }, `DELETE FROM public.customer_notes WHERE id = '${nH}' RETURNING 1`, [], s)),
      updOther: res(await as({ uid }, `UPDATE public.customer_notes SET content = '[PROBE 245 ret]' WHERE id = '${nA}' RETURNING 1`, [], s)),
    }
  }
  const D = '42501'
  const expect = (id: string, got: Cell, want: Cell) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    add('NY', id, ok, ok ? Object.values(got).join(' ') : `fik ${JSON.stringify(got)} ønsket ${JSON.stringify(want)}`)
  }
  const full: Cell = { see: 'fremmed+scope', insIn: '1', insFor: '1', delOwn: '1', delOther: '1', delFor: '1', updOther: '1' }
  const editOnly: Cell = { ...full, delOther: '0', delFor: '0', updOther: '0' }
  const readAll: Cell = { see: 'fremmed+scope', insIn: D, insFor: D, delOwn: '0', delOther: '0', delFor: '0', updOther: '0' }
  const none: Cell = { see: 'intet', insIn: D, insFor: D, delOwn: '0', delOther: '0', delFor: '0', updOther: '0' }

  // ---- roller uden overrides
  for (const [role, want] of [['admin', full], ['serviceleder', full], ['salg', editOnly], ['bogholderi', readAll]] as Array<[string, Cell]>) {
    const u = uidOf(role)
    if (!u) { if (!montor) notTestable(`${role}: standard`, 'ingen aktiv profil i prod — dækket af staging'); continue }
    expect(`${role}: standard (ser alt; ${want === readAll ? 'ingen skrivning' : want === full ? 'opret + moderér' : 'opret + kun egne'})`, await cell(u), want)
  }
  if (montor) {
    const mScope: Cell = { see: 'scope', insIn: D, insFor: D, delOwn: '0', delOther: '0', delFor: '0', updOther: '0' }
    expect('montør: standard (kun scope, ingen skrivning)', await cell(montor), mScope)
    expect('montør + grant customers.edit (opret i scope, ikke fremmed; kun egne)', await cell(montor, [ov(montor, [['customers.edit', 'grant']])]),
      { see: 'scope', insIn: '1', insFor: D, delOwn: '1', delOther: '0', delFor: '0', updOther: '0' })
    expect('montør + grant customers.view.all (ser alt, skriver intet)', await cell(montor, [ov(montor, [['customers.view.all', 'grant']])]), readAll)
    expect('montør + grant edit + notes.manage (moderér i scope, aldrig fremmed)', await cell(montor, [ov(montor, [['customers.edit', 'grant'], ['customers.notes.manage', 'grant']])]),
      { see: 'scope', insIn: '1', insFor: D, delOwn: '1', delOther: '1', delFor: '0', updOther: '1' })
    expect('inaktiv profil (montør + edit-grant, is_active=false)', await cell(montor, [ov(montor, [['customers.edit', 'grant']]), `UPDATE public.profiles SET is_active = false WHERE id = '${montor}'`]), none)
  } else notTestable('montør-varianter', 'ingen aktiv montør i prod — dækket af staging')
  // roller uden egen aktiv prod-profil: montør-profilen får rollen midlertidigt (inde i prøvens savepoint → rulles tilbage)
  const asRole = (role: string) => `UPDATE public.profiles SET role = '${role}' WHERE id = '${montor}'`
  if (montor) {
    for (const [role, want] of [['serviceleder', full], ['salg', editOnly], ['bogholderi', readAll]] as Array<[string, Cell]>) {
      if (uidOf(role)) continue
      expect(`${role} (rolle sat midlertidigt på montør-profil): standard`, await cell(montor, [asRole(role)]), want)
    }
    if (!salg) {
      expect('salg − customers.edit (ser alt, skriver intet)', await cell(montor, [asRole('salg'), ov(montor, [['customers.edit', 'revoke']])]), readAll)
      expect('salg + customers.notes.manage (moderér)', await cell(montor, [asRole('salg'), ov(montor, [['customers.notes.manage', 'grant']])]), full)
    }
    if (!svc) expect('serviceleder − customers.notes.manage (kun egne)', await cell(montor, [asRole('serviceleder'), ov(montor, [['customers.notes.manage', 'revoke']])]), editOnly)
  }
  if (salg) {
    expect('salg − customers.edit (ser alt, skriver intet)', await cell(salg, [ov(salg, [['customers.edit', 'revoke']])]), readAll)
    expect('salg + customers.notes.manage (moderér)', await cell(salg, [ov(salg, [['customers.notes.manage', 'grant']])]), full)
  }
  if (svc) expect('serviceleder − customers.notes.manage (kun egne)', await cell(svc, [ov(svc, [['customers.notes.manage', 'revoke']])]), editOnly)
  const ghost = randomUUID()
  expect('manglende profil (ukendt uid)', await cell(ghost, [], ghost), none)
  if (!montor) {
    const inactive = (await q(`SELECT id FROM profiles WHERE role::text <> 'admin' ORDER BY created_at LIMIT 1`)) as Array<{ id: string }>
    if (inactive[0]) expect('inaktiv profil (is_active=false)', await cell(inactive[0].id, [`UPDATE public.profiles SET is_active = false WHERE id = '${inactive[0].id}'`]), none)
  }

  // ---- beskyttede felter og forfalskning (admin har alle rettigheder → afvisningen skyldes regel/grant, ikke manglende ret)
  const s = seed
  add('NY', 'admin: opret i en andens navn (created_by ≠ mig) afvist', (await as({ uid: adm }, ins(svc ?? randomUUID(), inScope), [], s)).ok === false, why(await as({ uid: adm }, ins(svc ?? randomUUID(), inScope), [], s)))
  const sys = await as({ uid: adm }, `INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES ('${inScope}', '[PROBE 245]', 'system', '${adm}') RETURNING 1`, [], s)
  add('NY', 'admin: source = system afvist (kun manual for brugere)', !sys.ok && sys.code === D, why(sys))
  const mv = await as({ uid: adm }, `UPDATE public.customer_notes SET customer_id = '${foreign}' WHERE id = '${nA}' RETURNING 1`, [], s)
  add('NY', 'admin: flyt note til anden kunde afvist (kun content kan opdateres)', !mv.ok && mv.code === D, why(mv))
  const au = await as({ uid: adm }, `UPDATE public.customer_notes SET created_by = '${adm}' WHERE id = '${nH}' RETURNING 1`, [], s)
  add('NY', 'admin: skift forfatter afvist', !au.ok && au.code === D, why(au))
  const su = await as({ uid: adm }, `UPDATE public.customer_notes SET source = 'assistant' WHERE id = '${nA}' RETURNING 1`, [], s)
  add('NY', 'admin: skift source afvist', !su.ok && su.code === D, why(su))

  // ---- anon
  for (const [id, sql] of [
    ['SELECT', `SELECT 1 FROM public.customer_notes`],
    ['INSERT', `INSERT INTO public.customer_notes (customer_id, content) VALUES ('${inScope}', '[PROBE 245]')`],
    ['UPDATE', `UPDATE public.customer_notes SET content = 'x' WHERE id = '${nA}'`],
    ['DELETE', `DELETE FROM public.customer_notes WHERE id = '${nA}'`],
  ]) {
    const r = await as('anon', sql, [], s)
    add('NY', `anon ${id} afvist (42501)`, !r.ok && r.code === D, why(r))
  }

  // ---- service_role (kontrollerede server-stier): læs, opret source=assistant, ret, slet
  await q('SAVEPOINT svc')
  try {
    for (const x of s) await q(x)
    await q('SET LOCAL ROLE service_role')
    const read = (await q(`SELECT count(*)::int n FROM public.customer_notes WHERE id IN ('${nA}', '${nH}')`))[0].n
    const ins2 = (await q(`INSERT INTO public.customer_notes (customer_id, content, source) VALUES ('${foreign}', '[PROBE 245]', 'assistant') RETURNING 1`)).length
    const upd = (await q(`UPDATE public.customer_notes SET content = '[PROBE 245 ret]' WHERE id = '${nA}' RETURNING 1`)).length
    const del = (await q(`DELETE FROM public.customer_notes WHERE id = '${nH}' RETURNING 1`)).length
    add('NY', 'service_role: læs 2 · opret source=assistant · ret · slet', read === 2 && ins2 === 1 && upd === 1 && del === 1, `læs=${read} opret=${ins2} ret=${upd} slet=${del}`)
  } catch (e) {
    add('NY', 'service_role: læs/opret/ret/slet', false, (e as { code?: string }).code ?? 'fejl')
  } finally {
    await q('ROLLBACK TO SAVEPOINT svc')
    await q('RESET ROLE')
  }

  // ---- case_notes.source: eksisterende rækker = manual; prøvens egne rækker efterlader intet
  const cn = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE source = 'manual')::int m FROM public.case_notes`))[0]
  add('NY', 'case_notes: alle eksisterende rækker source = manual', cn.n === cn.m, `${cn.m}/${cn.n}`)
  const left = (await q(`SELECT count(*)::int n FROM public.customer_notes WHERE content LIKE '[PROBE 245%'`))[0].n
  add('NY', 'ingen prøvenoter tilbage i transaktionen', left === 0, `${left}`)
}))
