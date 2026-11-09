/**
 * Employee Setup Integrity — ren logik, falske klienter og statiske værn (ingen DB).
 *   npx tsx scripts/employee-setup-integrity-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activeLinkConflict, assignableEmployeeError, classifyEmployeeLink, countActiveEmployeesForProfile, EMPLOYEE_SETUP_TEXT,
  knownRate, loadEmployeeSetup, montorRoleChangeError, roleRequiresEmployee, EmployeeSetupReadError,
} from '../src/lib/employees/setup-integrity'
import { timePricingBlock } from '../src/lib/employees/invoice-rate-guard'

let passed = 0
let failed = 0
function t(label: string, ok: boolean, note = '') {
  if (ok) { passed++; return }
  failed++
  console.log(`FAIL  ${label}${note ? ` — ${note}` : ''}`)
}
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

// ---------- falsk Supabase-klient (kun det modulet bruger) ----------
type Row = Record<string, unknown>
function fakeClient(tables: Record<string, Row[]>, opts: { failOn?: string } = {}) {
  const calls: string[] = []
  const client = {
    calls,
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      let head = false
      let single = false
      const q: Record<string, unknown> = {
        select(_cols: string, o?: { count?: string; head?: boolean }) { head = !!o?.head; return q },
        eq(c: string, v: unknown) { rows = rows.filter((r) => r[c] === v); calls.push(`eq:${c}`); return q },
        neq(c: string, v: unknown) { rows = rows.filter((r) => r[c] !== v); return q },
        order(c: string) { calls.push(`order:${c}`); rows.sort((a, b) => String(a[c]).localeCompare(String(b[c]))); return q },
        maybeSingle() { single = true; return q },
        then(res: (v: unknown) => void) {
          if (opts.failOn === table) return res({ data: null, error: { message: 'boom' }, count: null })
          if (head) return res({ data: null, error: null, count: rows.length })
          return res({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length })
        },
      }
      return q
    },
  }
  return client as unknown as Parameters<typeof loadEmployeeSetup>[0] & { calls: string[] }
}

const P = 'profile-1'
const emp = (id: string, active: boolean, extra: Row = {}): Row => ({ id, profile_id: P, active, created_at: `2026-01-0${id.slice(-1)}`, hourly_rate: 495, cost_rate: 300, ...extra })

async function main() {
  // ---------- 1. klassifikation ----------
  {
    const s = classifyEmployeeLink([{ id: 'e1', active: true }])
    t('montør med gyldig medarbejder: linked + id', s.state === 'linked' && s.employeeId === 'e1')
    const m = classifyEmployeeLink([])
    t('montør uden medarbejderrække: missing, intet id', m.state === 'missing' && m.employeeId === null)
    const i = classifyEmployeeLink([{ id: 'e1', active: false }])
    t('kun inaktiv medarbejder: inactive_only, intet id', i.state === 'inactive_only' && i.employeeId === null)
    const a = classifyEmployeeLink([{ id: 'e1', active: true }, { id: 'e2', active: true }])
    t('dublet/tvetydig: ambiguous, INGEN vælges (ikke ældste)', a.state === 'ambiguous' && a.employeeId === null && a.activeEmployeeIds.length === 2)
    const mixed = classifyEmployeeLink([{ id: 'e1', active: false }, { id: 'e2', active: true }])
    t('inaktiv historik + én aktiv: linked til den aktive', mixed.state === 'linked' && mixed.employeeId === 'e2')
    const nullActive = classifyEmployeeLink([{ id: 'e1', active: null }])
    t('active = null tæller ikke som aktiv', nullActive.state === 'inactive_only')
  }

  // ---------- 2. satser: ukendt er ukendt, aldrig 0 ----------
  {
    t('knownRate(null/""/undefined/NaN) = null', [null, '', undefined, 'NaN', 'abc'].every((v) => knownRate(v) === null))
    t('knownRate(0) = 0 (kendt)', knownRate(0) === 0 && knownRate('0') === 0)
    const noRates = classifyEmployeeLink([{ id: 'e1', active: true, hourly_rate: null, cost_rate: null }], { ratesRead: true })
    t('admin/serviceleder uden time-/kostpris: mangler = true, ikke 0', noRates.missingSaleRate === true && noRates.missingCostRate === true && noRates.zeroSaleRate === false)
    const zero = classifyEmployeeLink([{ id: 'e1', active: true, hourly_rate: 0, cost_rate: '0' }], { ratesRead: true })
    t('sats 0 er kendt (ikke "mangler"), men markeres', zero.missingSaleRate === false && zero.zeroSaleRate === true && zero.zeroCostRate === true)
    const unread = classifyEmployeeLink([{ id: 'e1', active: true }])
    t('satser ikke læst: null (ikke vurderet), aldrig false/0', unread.missingSaleRate === null && unread.missingCostRate === null)
  }

  // ---------- 3. rolleskift ----------
  {
    t('kun montør kræver medarbejder (opsætningsregel)', roleRequiresEmployee('montør') && !roleRequiresEmployee('admin') && !roleRequiresEmployee('serviceleder') && !roleRequiresEmployee(null))
    t('rolleskift TIL montør uden medarbejder afvises', !!montorRoleChangeError(classifyEmployeeLink([])))
    t('rolleskift TIL montør med kun inaktiv afvises', !!montorRoleChangeError(classifyEmployeeLink([{ id: 'e1', active: false }])))
    t('rolleskift TIL montør med dubletter afvises', !!montorRoleChangeError(classifyEmployeeLink([{ id: 'e1', active: true }, { id: 'e2', active: true }])))
    t('rolleskift TIL montør med én aktiv tilladt', montorRoleChangeError(classifyEmployeeLink([{ id: 'e1', active: true }])) === null)
    t('fra medarbejderkort: kortet skal være den aktive række', !!montorRoleChangeError(classifyEmployeeLink([{ id: 'e1', active: true }, { id: 'e2', active: false }]), 'e2')
      && montorRoleChangeError(classifyEmployeeLink([{ id: 'e1', active: true }]), 'e1') === null)
    t('fejltekster siger at rollen IKKE er ændret', [classifyEmployeeLink([]), classifyEmployeeLink([{ id: 'e1', active: false }])].every((s) => /rollen er ikke ændret/.test(montorRoleChangeError(s) ?? '')))
  }

  // ---------- 4. loader / tællere (falske klienter) ----------
  {
    const c = fakeClient({ employees: [emp('e2', true), emp('e1', false)] })
    const s = await loadEmployeeSetup(c, P)
    t('loader: kun profile_id-kobling, ældste først', s.state === 'linked' && s.employeeId === 'e2' && c.calls.includes('eq:profile_id') && c.calls.includes('order:created_at') && !c.calls.some((x) => /email|name/.test(x)))
    let threw = false
    try { await loadEmployeeSetup(fakeClient({}, { failOn: 'employees' }), P) } catch (e) { threw = e instanceof EmployeeSetupReadError }
    t('loader: læsefejl kastes (aldrig "missing")', threw)
    const withRates = await loadEmployeeSetup(fakeClient({ employees: [emp('e1', true, { hourly_rate: null })] }), P, { includeRates: true })
    t('loader med satser: manglende timepris = ukendt', withRates.missingSaleRate === true && withRates.missingCostRate === false)
    t('tæller aktive rækker uden den aktuelle', (await countActiveEmployeesForProfile(fakeClient({ employees: [emp('e1', true), emp('e2', true), emp('e3', false)] }), P, 'e1')) === 1)
    let cThrew = false
    try { await countActiveEmployeesForProfile(fakeClient({}, { failOn: 'employees' }), P) } catch { cThrew = true }
    t('tæller: læsefejl kastes (aldrig 0 = "ingen konflikt")', cThrew)
    t('kobling: anden aktiv række → konflikt', !!(await activeLinkConflict(fakeClient({ employees: [emp('e1', true)] }), P, 'e2')))
    t('kobling: kun inaktiv historik → ingen konflikt', (await activeLinkConflict(fakeClient({ employees: [emp('e1', false)] }), P, 'e2')) === null)
  }

  // ---------- 5. planlægning ----------
  {
    const today = '2026-11-09'
    const ok = fakeClient({ employees: [emp('e1', true)] })
    t('planlægning: aktiv med timepris og entydigt login → ok', (await assignableEmployeeError(ok, 'e1', today)) === null)
    t('planlægning: inaktiv medarbejder afvises', /inaktiv/.test((await assignableEmployeeError(fakeClient({ employees: [emp('e1', false)] }), 'e1', today)) ?? ''))
    t('planlægning: fratrådt afvises', /inaktiv/.test((await assignableEmployeeError(fakeClient({ employees: [emp('e1', true, { termination_date: '2026-11-01' })] }), 'e1', today)) ?? ''))
    t('planlægning: manglende timepris afvises klart (bliver ikke 0)', /mangler timepris/.test((await assignableEmployeeError(fakeClient({ employees: [emp('e1', true, { hourly_rate: null })] }), 'e1', today)) ?? ''))
    t('planlægning: manglende kostpris afvises IKKE her (00230/fast firmasats afgør)', (await assignableEmployeeError(fakeClient({ employees: [emp('e1', true, { cost_rate: null })] }), 'e1', today)) === null)
    t('planlægning: login med flere aktive medarbejdere afvises', /flere aktive/.test((await assignableEmployeeError(fakeClient({ employees: [emp('e1', true), emp('e2', true)] }), 'e1', today)) ?? ''))
    t('planlægning: læsefejl er ikke "findes ikke"', /Det tælles ikke/.test((await assignableEmployeeError(fakeClient({}, { failOn: 'employees' }), 'e1', today)) ?? ''))
  }

  // ---------- 6. autopilot-faktura: ingen standardsats, ingen ompris ----------
  {
    const rate = new Map<string, unknown>([['e1', 495], ['e2', null], ['e3', 600]])
    t('faktura: frossen pris = nuværende → tilladt', timePricingBlock([{ employee_id: 'e1', sale_amount: 990, sale_rate_snapshot: 495 }], rate) === null)
    t('faktura: medarbejder uden timepris → afvist (ingen 495/standard)', /uden timepris/.test(timePricingBlock([{ employee_id: 'e2', sale_amount: 990, sale_rate_snapshot: 495 }], rate) ?? ''))
    t('faktura: time uden frossen salgspris → afvist', /ingen frossen/.test(timePricingBlock([{ employee_id: 'e1', sale_amount: null, sale_rate_snapshot: 495 }], rate) ?? ''))
    t('faktura: ændret sats → afvist (ingen ompris)', /anden timepris/.test(timePricingBlock([{ employee_id: 'e3', sale_amount: 990, sale_rate_snapshot: 495 }], rate) ?? ''))
    t('faktura: fejltekst uden beløb', !/\d{3}/.test(timePricingBlock([{ employee_id: 'e3', sale_amount: 990, sale_rate_snapshot: 495 }], rate)?.replace(/^\d+ /, '') ?? ''))
  }

  // ---------- 7. tekster ----------
  t('brugertekster: én pr. ufuldstændig tilstand, nævner kontoret', (['missing', 'inactive_only', 'ambiguous'] as const).every((k) => /kontoret/.test(EMPLOYEE_SETUP_TEXT[k])))

  // ---------- 8. statiske værn på de ændrede stier ----------
  const settings = src('src/lib/actions/settings.ts')
  const invite = settings.slice(settings.indexOf('export async function inviteTeamMember'))
  t('team-invitation: montør afvises (henvises til medarbejderkortet)', /if \(roleRequiresEmployee\(role\)\) \{\s*return \{ success: false, error: 'Montører inviteres fra medarbejderkortet/.test(invite))
  t('team-invitation: uden users.edit afvises FØR oprettelse', invite.indexOf("if (!hasPermission('users.edit'))") > 0 && invite.indexOf("if (!hasPermission('users.edit'))") < invite.indexOf('createInviteLink'))
  t('team-invitation: rolle kunne ikke sættes → login spærres', /setProfileLoginActive\(newId, false\)/.test(invite))
  const upd = settings.slice(settings.indexOf('export async function updateTeamMember'), settings.indexOf('// Team Invitations'))
  t('rolleskift (team): TIL montør via montorRoleChangeError før skrivning', upd.indexOf('montorRoleChangeError(employeeSetup)') > 0 && upd.indexOf('montorRoleChangeError(employeeSetup)') < upd.indexOf(".from('profiles')\n      .update("))
  t('deaktivering (team): alle aktive rækker, ingen maybeSingle på profile_id', !/from\('employees'\)\.select\([^)]*\)\.eq\('profile_id', memberId\)\.maybeSingle\(\)/.test(upd) && /\.in\('id', ids\)\.eq\('active', true\)/.test(upd))
  t('rolleskift VÆK fra montør: rører aldrig employees/time_logs (kun tælling)', !/from\('(employees|time_logs|work_orders)'\)\.(update|delete)\([^)]*\)[^\n]*role/.test(upd) && !/from\('time_logs'\)\.(update|delete)/.test(upd))
  const login = src('src/lib/actions/employee-login.ts')
  t('kobl eksisterende login: activeLinkConflict, ikke maybeSingle-tjek', /activeLinkConflict\(admin, profileId, employeeId\)/.test(login) && !/\.eq\('profile_id', profileId\)\s*\.neq\('id', employeeId\)\s*\.maybeSingle\(\)/.test(login))
  t('rolleskift (medarbejderkort): TIL montør kræver netop denne aktive række', /montorRoleChangeError\(await loadEmployeeSetup\(admin, emp\.profile_id as string\), employeeId\)/.test(login))
  t('montør-login på inaktiv medarbejder afvises', /roleRequiresEmployee\(role\) && \(emp as \{ active\?: boolean \| null \}\)\.active !== true/.test(login))
  const emps = src('src/lib/actions/employees.ts')
  t('genaktivering/oprettelse: profileLinkConflict (3 steder)', (emps.match(/profileLinkConflict\(/g) ?? []).length >= 4)
  t('kalender: ingen limit(1) uden rækkefølge på egen række', !/eq\('profile_id', userId\)\.eq\('active', true\)\.limit\(1\)/.test(emps))
  const route = src('src/app/api/calendar/my-jobs/route.ts')
  t('telefonkalender: loadEmployeeSetup, ingen vilkårlig række', /loadEmployeeSetup\(ctx\.supabase, ctx\.userId\)/.test(route) && !/\.limit\(1\)/.test(route))
  const tl = src('src/lib/actions/time-logs.ts')
  t('tidsregistrering: klar opsætningsfejl ved oprettelse og rettelse', (tl.match(/ownEmployeeSetupError\(supabase, userId\)/g) ?? []).length === 2)
  const wo = src('src/lib/actions/work-orders.ts')
  t('planlægning: assignableEmployeeError ved oprettelse og omplanlægning', (wo.match(/assignableEmployeeError\(createAdminClient\(\)/g) ?? []).length === 2)
  t('planlægningsagent: samme regel', /assignableEmployeeError\(admin, p\.assigned_employee_id, today\)/.test(src('src/lib/agents/planning-agent.ts')))
  t('autopilot-faktura: prisværn før RPC', (() => { const s = src('src/lib/services/invoices.ts'); return s.indexOf('workOrderTimePricingBlock(supabase, workOrderId)') > 0 && s.indexOf('workOrderTimePricingBlock(supabase, workOrderId)') < s.indexOf("rpc('create_invoice_from_work_order'") })())
  const econ = src('src/lib/services/employee-economics.ts')
  const impact = econ.slice(econ.indexOf('export async function calculateEmployeeProjectImpact'), econ.indexOf('function round2'))
  t('projektpåvirkning: frosset sale_amount, ingen live-sats || 0', /sale_amount/.test(impact) && !/hourly_rate\) \|\| 0/.test(impact) && !/Number\(l\.cost_amount\) \|\| 0/.test(impact))
  t('pilot-tjekliste: klassifikation (kun-inaktiv tæller ikke som koblet)', /classifyEmployeeLink\(byProfile\.get\(id\) \?\? \[\]\)\.state/.test(src('src/lib/actions/pilot-setup.ts')))
  t('Mine job: opsætningsbesked i stedet for "Ingen planlagte job"', /data-testid="my-jobs-setup-incomplete"/.test(src('src/app/dashboard/tasks/my-jobs-card.tsx')))
  t('team-UI: montør kan ikke sendes fra Team', /inviteRole === 'montør'\}>/.test(src('src/app/dashboard/settings/team/team-settings-client.tsx')))
  // Ingen gæt på e-mail/navn i de nye moduler
  const mod = src('src/lib/employees/setup-integrity.ts') + src('src/lib/employees/invoice-rate-guard.ts') + src('src/lib/actions/employee-setup.ts')
  t('ingen e-mail-/navnematch i integritetsmodulerne', !/ilike|\.eq\('email'|\.eq\('name'|full_name/.test(mod))

  console.log(failed ? `employee-setup-integrity-test FEJL: ${failed} af ${passed + failed}` : `employee-setup-integrity-test ok (${passed} bestået)`)
  process.exitCode = failed ? 1 : 0
}
main()
