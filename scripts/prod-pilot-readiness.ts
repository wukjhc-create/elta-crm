/**
 * PRODUCTION read-only: pilot-parathed pr. aktiv medarbejder/profil (Henrik 2026-10-29). Kun etiketter, roller, ja/nej og
 * antal — ingen navne, mails eller id'er. Sætter ALDRIG satser eller andet (STRENGT READ-ONLY, se prod-readonly.ts).
 *   npx tsx scripts/prod-pilot-readiness.ts
 * Blokeringer: rolle der skal registrere tid uden aktiv medarbejderrække · dublet-rækker · manglende timepris/kostpris
 * (00230-triggeren afviser tidsregistreringen) · login ikke koblet/bekræftet/spærret · inaktiv profil med aktiv række.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { PERMISSION_TEMPLATES, templateOverrides } from '../src/lib/auth/permission-templates'

type Row = Record<string, unknown>

withProdReadOnly('prod-pilot-readiness', async (run, masked) => {
  const profiles = (await run(`SELECT p.id, p.role::text role, p.is_active,
      (u.id IS NOT NULL) has_login, (u.email_confirmed_at IS NOT NULL) confirmed, (u.last_sign_in_at IS NOT NULL) signed_in,
      (u.banned_until IS NOT NULL AND u.banned_until > now()) banned
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id ORDER BY p.role, p.created_at`)) as Row[]
  const employees = (await run(`SELECT e.id, e.profile_id, e.active, (e.hourly_rate IS NOT NULL) sale, (e.cost_rate IS NOT NULL) cost, e.role emp_role,
      (SELECT count(*)::int FROM public.employee_overtime_rates r WHERE r.employee_id = e.id AND coalesce(r.is_active, true)) rates,
      (SELECT count(*)::int FROM public.work_orders w WHERE w.assigned_employee_id = e.id AND w.status IN ('planned', 'in_progress')) open_wo,
      (SELECT count(*)::int FROM public.time_logs t WHERE t.employee_id = e.id) logs
    FROM public.employees e ORDER BY e.created_at`)) as Row[]
  const overrides = (await run(`SELECT profile_id, permission, effect, source FROM public.user_permission_overrides`)) as Row[]

  const tplName = (pid: string) => {
    const mine = overrides.filter((o) => o.profile_id === pid && o.source === 'template').map((o) => `${o.effect}:${o.permission}`).sort().join('|')
    if (!mine) return '—'
    for (const [k, t] of Object.entries(PERMISSION_TEMPLATES)) {
      if (templateOverrides(t).map((o) => `${o.effect}:${o.permission}`).sort().join('|') === mine) return k
    }
    return 'ukendt skabelon'
  }
  const TIME_ROLES = new Set(['montør'])
  const out: Array<Record<string, string | number>> = []
  let blockers = 0
  const seen = new Set<string>()
  profiles.filter((p) => p.is_active).forEach((p, i) => {
    const pid = String(p.id)
    const rows = employees.filter((e) => e.profile_id === pid && e.active)
    rows.forEach((e) => seen.add(String(e.id)))
    const e = rows[0]
    const ov = overrides.filter((o) => o.profile_id === pid && o.source !== 'template')
    const b: string[] = []
    if (!p.has_login) b.push('ingen login koblet')
    else if (!p.confirmed) b.push('login ikke bekræftet')
    if (p.banned) b.push('login spærret')
    if (rows.length > 1) b.push(`${rows.length} aktive medarbejderrækker (dublet)`)
    if (!e && TIME_ROLES.has(String(p.role))) b.push('ingen aktiv medarbejderrække — kan ikke se job eller registrere tid')
    if (e && !e.sale) b.push('mangler timepris (salg) — tidsregistrering afvises')
    if (e && !e.cost) b.push('mangler kostpris — tidsregistrering afvises')
    blockers += b.length
    out.push({
      medarbejder: `P${i + 1}`, rolle: String(p.role), skabelon: tplName(pid), overrides: `${ov.filter((o) => o.effect === 'grant').length}+/${ov.filter((o) => o.effect === 'revoke').length}-`,
      login: p.has_login ? (p.confirmed ? (p.signed_in ? 'ja (brugt)' : 'ja (aldrig logget ind)') : 'ubekræftet') : 'nej',
      medarbejderrække: rows.length ? (rows.length > 1 ? `${rows.length} (dublet)` : 'ja') : 'nej',
      timepris: e ? (e.sale ? 'ja' : 'MANGLER') : '—', kostpris: e ? (e.cost ? 'ja' : 'MANGLER') : '—',
      overarbejdssatser: e ? Number(e.rates) : '—', 'åbne AO': e ? Number(e.open_wo) : '—', timer: e ? Number(e.logs) : '—',
      blokering: b.join('; ') || 'ingen',
    })
  })
  // aktive medarbejderrækker uden (aktiv) login-profil
  const orphan = employees.filter((e) => e.active && !seen.has(String(e.id)))
  orphan.forEach((e, i) => {
    const prof = profiles.find((p) => p.id === e.profile_id)
    const b = [prof ? 'profilen er inaktiv' : 'ingen login-profil koblet', ...(e.sale ? [] : ['mangler timepris']), ...(e.cost ? [] : ['mangler kostpris'])]
    blockers += Number(e.open_wo) > 0 ? b.length : 0
    out.push({ medarbejder: `E${i + 1}`, rolle: `(medarbejder: ${String(e.emp_role ?? '—')})`, skabelon: '—', overrides: '—', login: prof ? 'inaktiv profil' : 'nej',
      medarbejderrække: 'ja', timepris: e.sale ? 'ja' : 'MANGLER', kostpris: e.cost ? 'ja' : 'MANGLER', overarbejdssatser: Number(e.rates),
      'åbne AO': Number(e.open_wo), timer: Number(e.logs), blokering: `${b.join('; ')}${Number(e.open_wo) > 0 ? ' (har åbne AO)' : ' (ingen åbne AO — info)'}` })
  })
  console.log(`--- pilot-parathed @ prod:${masked} — ${out.length} aktive profiler/medarbejdere ---`)
  console.table(out)
  console.log(blockers ? `❌ ${blockers} blokering(er) — kræver Henriks handling (intet ændres automatisk)` : '✅ ingen blokeringer')
  process.exitCode = blockers ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
