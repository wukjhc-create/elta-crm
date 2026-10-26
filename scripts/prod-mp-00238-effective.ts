/**
 * PRODUCTION effektiv kontrol + pilot for 00238 — ROLLBACK-ONLY (se prod-rollback-probe.ts). Rigtige profiler; ingen
 * brugere oprettes; ALT rulles tilbage (Henrik 2026-10-26: "OPTION 2 — rollback-only pilot").
 *   Effektiv: nul overrides = kodens rolle-rettigheder (alle 112 nøgler) · inaktiv/manglende = intet · service_role kan
 *             skrive overrides · almindelige brugere (montør/admin) kan ikke · audit-stien virker
 *   Pilot (én montør, sammenhængende i transaktionen): baseline → grant customers.create → verificér → fjern → standard
 *             igen → revoke materials.view → verificér nægtet → nulstil → præcis baseline → audit-rækker skrevet → ROLLBACK
 *   npx tsx scripts/prod-mp-00238-effective.ts
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { PERMISSIONS, hasPermission, type Permission } from '../src/lib/auth/permissions'
import type { UserRole } from '../src/types/auth.types'

const KEYS = Object.keys(PERMISSIONS) as Permission[]

runMain(() => withProdRollbackProbe('mp-00238-effective', async ({ q, as, add, notTestable, why }) => {
  const effSql = `SELECT permission FROM public.permission_catalog WHERE public.user_has_permission(permission) ORDER BY 1`
  const setOf = (r: { ok: boolean; rows?: any[] }) => new Set((r.ok ? (r as { rows: Array<{ permission: string }> }).rows : []).map((x) => x.permission))
  const actives = (await q(`SELECT DISTINCT ON (role) id uid, role::text role FROM profiles WHERE is_active ORDER BY role, created_at`)) as Array<{ uid: string; role: string }>

  // ---- nul overrides = kodens rolle-rettigheder
  for (const role of ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']) {
    const p = actives.find((x) => x.role === role)
    if (!p) { notTestable(`${role}: ingen aktiv profil i prod`, 'dækket af staging mp-00238-check (5 roller × 112 nøgler)'); continue }
    const r = await as({ uid: p.uid }, effSql)
    const got = setOf(r)
    const want = new Set(KEYS.filter((k) => hasPermission(role as UserRole, k)))
    const diff = KEYS.filter((k) => got.has(k) !== want.has(k))
    add('UÆNDRET', `${role}: nul overrides = rolle (${KEYS.length} nøgler)`, r.ok && diff.length === 0, r.ok ? `effektive=${got.size} afvigelser=${diff.length}` : why(r))
  }
  const montor = actives.find((x) => x.role === 'montør')
  if (!montor) throw new Error('ingen aktiv montør i prod')
  const admin = actives.find((x) => x.role === 'admin')!

  // ---- fail-closed
  const ina = await as({ uid: montor.uid }, effSql, [], [`UPDATE profiles SET is_active = false WHERE id = '${montor.uid}'`])
  add('UÆNDRET', 'inaktiv profil: ingen rettigheder', ina.ok && setOf(ina).size === 0, ina.ok ? `effektive=${setOf(ina).size}` : why(ina))
  const ghost = await as({ uid: randomUUID() }, effSql)
  add('UÆNDRET', 'manglende profil: ingen rettigheder', ghost.ok && setOf(ghost).size === 0, ghost.ok ? `effektive=${setOf(ghost).size}` : why(ghost))

  // ---- skriveadgang til overrides
  const insOv = `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ($1, 'customers.create', 'grant', 'manual', 'rollback-prøve') RETURNING profile_id`
  const svc = await (async () => {
    await q('SAVEPOINT svc')
    try { await q('SET LOCAL ROLE service_role'); return { ok: true as const, rows: await q(insOv, [montor.uid]) } }
    catch (e) { return { ok: false as const, code: (e as { code?: string }).code ?? 'fejl' } }
    finally { await q('ROLLBACK TO SAVEPOINT svc'); await q('RESET ROLE') }
  })()
  add('NY', 'service_role kan skrive overrides (server-action-stien)', svc.ok && svc.rows.length === 1, svc.ok ? `rækker=${svc.rows.length}` : svc.code)
  const own = await as({ uid: montor.uid }, insOv, [montor.uid])
  add('NY', 'montør kan ikke skrive sine egne overrides direkte', !own.ok || own.rows.length === 0, why(own))
  const adm = await as({ uid: admin.uid }, insOv, [montor.uid])
  add('NY', 'admin kan ikke skrive overrides direkte via REST (kun server-action)', !adm.ok || adm.rows.length === 0, why(adm))

  // ---- pilot: sammenhængende i ÉN savepoint (rulles tilbage — og hele transaktionen rulles tilbage til sidst)
  const asUser = async (uid: string, sql: string) => {
    await q('SET LOCAL ROLE authenticated')
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    try { return new Set(((await q(sql)) as Array<{ permission: string }>).map((x) => x.permission)) } finally { await q('RESET ROLE') }
  }
  const asService = async (sql: string, params: unknown[] = []) => {
    await q('SET LOCAL ROLE service_role')
    try { return await q(sql, params) } finally { await q('RESET ROLE') }
  }
  const audit = (action: string, desc: string) => asService(`INSERT INTO public.audit_logs (user_id, entity_type, entity_id, entity_name, action, action_description, changes, metadata)
    VALUES ($1, 'user', $2, 'rollback-pilot', $3, $4, '{}'::jsonb, '{"rollback_pilot": true}'::jsonb) RETURNING id`, [admin.uid, montor.uid, action, desc])
  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
  await q('SAVEPOINT pilot')
  try {
    const baseline = await asUser(montor.uid, effSql)
    add('UÆNDRET', 'pilot 1: baseline = montør-rolle', same(baseline, new Set(KEYS.filter((k) => hasPermission('montør', k)))), `effektive=${baseline.size}`)
    await asService(`INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason, created_by) VALUES ($1, 'customers.create', 'grant', 'manual', 'rollback-pilot', $2)`, [montor.uid, admin.uid])
    await audit('permission_override_set', 'Tildelt: customers.create (rollback-pilot)')
    const s2 = await asUser(montor.uid, effSql)
    add('NY', 'pilot 2–3: grant customers.create virker (kun den ene nøgle tilføjet)', s2.has('customers.create') && s2.size === baseline.size + 1, `effektive=${s2.size}`)
    await asService(`DELETE FROM public.user_permission_overrides WHERE profile_id = $1 AND permission = 'customers.create'`, [montor.uid])
    await audit('permission_override_removed', 'Afvigelse fjernet: customers.create (rollback-pilot)')
    const s4 = await asUser(montor.uid, effSql)
    add('NY', 'pilot 4–5: fjernet grant → præcis baseline igen', same(s4, baseline), `effektive=${s4.size}`)
    await asService(`INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason, created_by) VALUES ($1, 'materials.view', 'revoke', 'manual', 'rollback-pilot', $2)`, [montor.uid, admin.uid])
    await audit('permission_override_set', 'Frataget: materials.view (rollback-pilot)')
    const s6 = await asUser(montor.uid, effSql)
    add('NY', 'pilot 6–7: revoke materials.view → effektivt nægtet', !s6.has('materials.view') && s6.size === baseline.size - 1, `effektive=${s6.size}`)
    const removed = await asService(`DELETE FROM public.user_permission_overrides WHERE profile_id = $1 AND source = 'manual' RETURNING permission`, [montor.uid])
    await audit('permission_overrides_reset', 'Nulstillet til rollens standard (rollback-pilot)')
    const s8 = await asUser(montor.uid, effSql)
    add('NY', 'pilot 8–9: nulstil → præcis den oprindelige rettighedsmængde', removed.length === 1 && same(s8, baseline), `fjernet=${removed.length} effektive=${s8.size}`)
    const auditRows = (await q(`SELECT count(*)::int n FROM public.audit_logs WHERE entity_id = $1 AND metadata->>'rollback_pilot' = 'true'`, [montor.uid]))[0].n
    add('NY', 'pilot 10: audit-historik skrevet i transaktionen (4 rækker)', auditRows === 4, `rækker=${auditRows}`)
  } finally {
    await q('ROLLBACK TO SAVEPOINT pilot')
  }
}))
