/**
 * Pilot-rollematrix (KUN staging): maaler hvad hver rigtig rolle kan LAESE direkte via PostgREST med sin egen JWT
 * (anon-key + login) - dvs. uden om appens server actions - og sammenligner med app-politikken i
 * src/lib/auth/permissions.ts. Et "RLS-hul" betyder at adgangen kun er haandhaevet i app-laget: en bruger med rollen
 * kan laese data direkte, som appen ikke viser dem.
 *
 * Personaer: pilot-<rolle>@harness.test (syntetiske, staging). Password saettes tilfaeldigt pr. koersel og printes aldrig.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export const PILOT_ROLES = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'] as const
export type PilotRole = (typeof PILOT_ROLES)[number]

/**
 * Kendte, dokumenterede rest-risici (migration 00160 header, R1-R3): roller der BEVIDST stadig kan laese direkte,
 * fordi en lukning kraever kodeaendring. Rapporteres separat - aldrig som "ok".
 */
export const KNOWN_RESIDUALS: Record<string, { roles: readonly PilotRole[]; id: string }> = {
  invoices: { roles: ['salg'], id: 'R1' },
  invoice_payments: { roles: ['salg'], id: 'R1' },
  time_logs: { roles: ['montør', 'salg'], id: 'R2' },
  supplier_credentials: { roles: ['serviceleder', 'montør', 'salg', 'bogholderi'], id: 'R3' },
}

/**
 * Probe-raekker: kun NOT NULL-kolonner uden default + CHECK/UNIQUE-gyldige vaerdier (verificeret mod schema:
 * incoming_invoices.source IN (email,upload,manual); integration_settings PK = key; accounting_integration_settings
 * UNIQUE(provider)). pk = primaernoeglen der bruges til oprydning.
 */
export const PROBE_ROWS: Array<{ table: string; pk: 'id' | 'key'; write: boolean; row: (tag: string) => Record<string, unknown> }> = [
  { table: 'invoices', pk: 'id', write: true, row: (t) => ({ invoice_number: `HARNESS-SEC-${t}` }) },
  { table: 'bank_transactions', pk: 'id', write: true, row: () => ({ date: '2026-01-01', amount: 1 }) },
  { table: 'incoming_invoices', pk: 'id', write: true, row: () => ({ source: 'manual' }) },
  { table: 'integration_settings', pk: 'key', write: true, row: (t) => ({ key: `harness-probe-${t}`, value: 'x' }) },
  { table: 'accounting_integration_settings', pk: 'id', write: false, row: (t) => ({ provider: `harness-probe-${t}` }) },
]

/** Tabel -> roller der ifoelge permissions.ts maa laese den (kilde-noegle i kommentaren). */
export const READ_POLICY: Array<{ table: string; allowed: readonly PilotRole[]; source: string }> = [
  { table: 'employee_compensation', allowed: ['admin'], source: 'employees.payroll.view' },
  { table: 'employee_compensation_history', allowed: ['admin'], source: 'employees.payroll.view' },
  { table: 'employees', allowed: ['admin', 'serviceleder'], source: 'employees.view' },
  { table: 'invoices', allowed: ['admin', 'serviceleder', 'bogholderi'], source: 'invoices.view.all (salg kun own_cases)' },
  { table: 'invoice_payments', allowed: ['admin', 'serviceleder', 'bogholderi'], source: 'invoices.view.all' },
  { table: 'bank_transactions', allowed: ['admin', 'bogholderi'], source: 'bank.view' },
  { table: 'incoming_invoices', allowed: ['admin', 'serviceleder', 'bogholderi'], source: 'incoming_invoices.view' },
  { table: 'supplier_credentials', allowed: ['admin'], source: 'settings.suppliers' },
  { table: 'accounting_integration_settings', allowed: ['admin', 'bogholderi'], source: 'settings.economic' },
  { table: 'integration_settings', allowed: ['admin'], source: 'settings.manage' },
  { table: 'audit_logs', allowed: ['admin'], source: 'settings.manage (audit er admin-side)' },
  { table: 'agent_runs', allowed: ['admin'], source: 'Agent Inbox (admin-only)' },
  { table: 'time_logs', allowed: ['admin', 'serviceleder', 'bogholderi'], source: 'time_logs.view.all (montør kun egne)' },
]

export interface RoleCell { role: PilotRole; visible: number | 'fejl'; allowed: boolean }
export interface MatrixRow { table: string; total: number; source: string; cells: RoleCell[]; gaps: PilotRole[]; residual: PilotRole[]; tooStrict: PilotRole[] }

type Sql = (sql: string) => Promise<any[]>

async function ensurePersona(admin: SupabaseClient, role: PilotRole): Promise<{ email: string; password: string; id: string }> {
  const email = `pilot-${role.replace('ø', 'oe')}@harness.test`
  const password = `Pilot!${randomBytes(12).toString('base64url')}`
  let id: string | undefined
  for (let page = 1; page <= 20 && !id; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = (data?.users ?? []) as Array<{ id: string; email?: string }>
    id = users.find((u) => u.email === email)?.id
    if (users.length < 200) break
  }
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) throw new Error(`updateUser(${email}): ${error.message}`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`)
    id = data.user.id
  }
  const { error: pErr } = await admin.from('profiles').upsert([{ id, role, is_active: true, full_name: `Pilot ${role}` }], { onConflict: 'id' })
  if (pErr) throw new Error(`profil(${email}): ${pErr.message}`)
  return { email, password, id }
}

export interface WriteProbeResult { table: string; role: PilotRole; inserted: boolean; note: string }

/** Ikke-admin roller forsoeger at INDSAETTE i foelsomme tabeller. Lykkes det, slettes raekken straks (admin) og det er et hul. */
export async function runWriteProbes(clients: Map<PilotRole, SupabaseClient>, admin: SupabaseClient): Promise<WriteProbeResult[]> {
  const out: WriteProbeResult[] = []
  for (const role of ['montør', 'salg'] as const) {
    for (const p of PROBE_ROWS.filter((x) => x.write)) {
      const tag = `${role.replace('ø', 'oe')}-${Date.now()}`
      const { data, error } = await clients.get(role)!.from(p.table).insert([p.row(tag)]).select(p.pk)
      const key = (data?.[0] as Record<string, string> | undefined)?.[p.pk]
      if (key) await admin.from(p.table).delete().eq(p.pk, key)
      out.push({ table: p.table, role, inserted: !!key, note: key ? 'INDSAT (slettet igen)' : (error?.message ?? 'afvist').slice(0, 50) })
    }
  }
  return out
}

/**
 * Positive/negative UPDATE-probes paa en probe-raekke i incoming_invoices (app-sti incoming-invoices.ts:676 bruger
 * den autentificerede klient bag incoming_invoices.edit = admin, bogholderi). Tilladte roller SKAL kunne rette.
 */
export async function runUpdateProbes(clients: Map<PilotRole, SupabaseClient>, admin: SupabaseClient): Promise<Array<{ role: PilotRole; expected: boolean; updated: boolean }>> {
  const { data, error } = await admin.from('incoming_invoices').insert([{ source: 'manual' }]).select('id')
  const id = (data?.[0] as { id?: string } | undefined)?.id
  if (error || !id) throw new Error(`update-probe seed: ${error?.message}`)
  const out: Array<{ role: PilotRole; expected: boolean; updated: boolean }> = []
  try {
    for (const role of PILOT_ROLES) {
      const { data: upd } = await clients.get(role)!.from('incoming_invoices').update({ notes: `probe ${role}` }).eq('id', id).select('id')
      out.push({ role, expected: role === 'admin' || role === 'bogholderi', updated: (upd ?? []).length === 1 })
    }
  } finally {
    await admin.from('incoming_invoices').delete().eq('id', id)
  }
  return out
}

/** Indsaet én probe-raekke (admin) i tomme probe-tabeller, saa laese-maalingen ikke er vakuoes. Returnerer oprydning. */
export async function seedReadProbes(admin: SupabaseClient, sql: Sql): Promise<() => Promise<void>> {
  const created: Array<{ table: string; pk: string; key: string }> = []
  for (const p of PROBE_ROWS) {
    const n = Number((await sql(`SELECT count(*) AS n FROM public.${p.table}`))[0].n)
    if (n > 0) continue
    const { data, error } = await admin.from(p.table).insert([p.row(`seed-${Date.now()}`)]).select(p.pk)
    const key = (data?.[0] as Record<string, string> | undefined)?.[p.pk]
    if (error || !key) throw new Error(`probe-seed ${p.table}: ${error?.message}`)
    created.push({ table: p.table, pk: p.pk, key })
  }
  return async () => { for (const c of created) await admin.from(c.table).delete().eq(c.pk, c.key) }
}

export async function loginPersonas(opts: { url: string; anonKey: string; admin: SupabaseClient }): Promise<Map<PilotRole, SupabaseClient>> {
  const clients = new Map<PilotRole, SupabaseClient>()
  for (const role of PILOT_ROLES) {
    const p = await ensurePersona(opts.admin, role)
    const client = createClient(opts.url, opts.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client.auth.signInWithPassword({ email: p.email, password: p.password })
    if (error) throw new Error(`login som ${role} fejlede: ${error.message}`)
    clients.set(role, client)
  }
  return clients
}

export async function runRoleMatrix(opts: { url: string; anonKey: string; admin: SupabaseClient; sql: Sql; clients?: Map<PilotRole, SupabaseClient> }): Promise<MatrixRow[]> {
  const clients = opts.clients ?? (await loginPersonas(opts))
  const rows: MatrixRow[] = []
  for (const pol of READ_POLICY) {
    if (!/^[a-z_]+$/.test(pol.table)) throw new Error('ugyldigt tabelnavn')
    const total = Number((await opts.sql(`SELECT count(*) AS n FROM public.${pol.table}`))[0].n)
    const cells: RoleCell[] = []
    for (const role of PILOT_ROLES) {
      const { count, error } = await clients.get(role)!.from(pol.table).select('*', { count: 'exact', head: true })
      cells.push({ role, visible: error ? 'fejl' : (count ?? 0), allowed: pol.allowed.includes(role) })
    }
    const vis = (c: RoleCell) => (typeof c.visible === 'number' ? c.visible : 0)
    rows.push({
      table: pol.table, total, source: pol.source, cells,
      gaps: cells.filter((c) => !c.allowed && vis(c) > 0 && !(KNOWN_RESIDUALS[pol.table]?.roles ?? []).includes(c.role)).map((c) => c.role),
      residual: cells.filter((c) => !c.allowed && vis(c) > 0 && (KNOWN_RESIDUALS[pol.table]?.roles ?? []).includes(c.role)).map((c) => c.role),
      tooStrict: total > 0 ? cells.filter((c) => c.allowed && vis(c) === 0).map((c) => c.role) : [],
    })
  }
  if (!opts.clients) for (const c of clients.values()) await c.auth.signOut()
  return rows
}

/**
 * Statisk RLS-analyse (data-uafhaengig): for hver tabel i READ_POLICY - er SELECT grantet til authenticated, er RLS
 * slaaet til, og hvilke SELECT-policies gaelder for authenticated? 'aaben' = enhver indlogget kan laese alt.
 */
export interface PolicyVerdict {
  table: string; grant: boolean; rls: boolean; verdict: 'lukket' | 'aaben' | 'betinget'; policies: string[]
  /** Roller app-politikken udelukker, men som kan laese (hvis 'aaben'), minus kendte rest-risici. */
  disallowed: PilotRole[]
  /** Kendte rest-risici (R1-R3) - rapporteres separat. */
  residual: PilotRole[]
  residualId?: string
}

export async function analysePolicies(sql: Sql): Promise<PolicyVerdict[]> {
  const out: PolicyVerdict[] = []
  for (const pol of READ_POLICY) {
    if (!/^[a-z_]+$/.test(pol.table)) throw new Error('ugyldigt tabelnavn')
    const meta = (await sql(`SELECT c.relrowsecurity AS rls, has_table_privilege('authenticated', 'public.${pol.table}', 'SELECT') AS grant
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${pol.table}'`))[0]
    const pols = await sql(`SELECT policyname, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = '${pol.table}'
      AND cmd IN ('SELECT', 'ALL') AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])`)
    const grant = meta?.grant === true || meta?.grant === 't'
    const rls = meta?.rls === true || meta?.rls === 't'
    const open = grant && (!rls || pols.some((p: any) => String(p.qual ?? '').trim() === 'true'))
    const verdict: PolicyVerdict['verdict'] = !grant || (rls && pols.length === 0) ? 'lukket' : open ? 'aaben' : 'betinget'
    out.push({
      table: pol.table, grant, rls, verdict,
      policies: pols.map((p: any) => `${p.policyname}: ${String(p.qual ?? '').replace(/\s+/g, ' ').slice(0, 90)}`),
      ...(() => {
        const excluded = PILOT_ROLES.filter((r) => !pol.allowed.includes(r))
        const res = KNOWN_RESIDUALS[pol.table]
        const residual = open ? excluded.filter((r) => res?.roles.includes(r)) : []
        return { disallowed: open ? excluded.filter((r) => !res?.roles.includes(r)) : [], residual, residualId: residual.length ? res?.id : undefined }
      })(),
    })
  }
  return out
}

export function formatPolicies(v: PolicyVerdict[]): string {
  const lines = ['', 'STATISK RLS-ANALYSE (authenticated, SELECT):']
  for (const p of v) {
    const risk = p.disallowed.length ? `⚠ AABEN for alle indloggede - app-politik udelukker: ${p.disallowed.join(', ')}`
      : p.residual.length ? `kendt rest-risiko ${p.residualId}: aaben for ${p.residual.join(', ')}`
        : p.verdict === 'aaben' ? 'aaben (alle roller maa)' : p.verdict
    lines.push(`  ${p.table.padEnd(32)} grant=${p.grant ? 'ja' : 'nej'} rls=${p.rls ? 'ja' : 'NEJ'}  ${risk}`)
    if (p.verdict === 'betinget') for (const x of p.policies) lines.push(`      · ${x}`)
  }
  return lines.join('\n')
}

export function formatMatrix(rows: MatrixRow[]): string {
  const head = `${'tabel'.padEnd(32)} ${'rækker'.padStart(6)}  ${PILOT_ROLES.map((r) => r.padEnd(12)).join('')}`
  const lines = [head, '-'.repeat(head.length)]
  for (const r of rows) {
    const cells = r.cells.map((c) => {
      const v = c.visible === 'fejl' ? 'afvist' : String(c.visible)
      const mark = !c.allowed && typeof c.visible === 'number' && c.visible > 0 ? '⚠' : c.allowed ? '✓' : '·'
      return `${mark}${v}`.padEnd(12)
    }).join('')
    lines.push(`${r.table.padEnd(32)} ${String(r.total).padStart(6)}  ${cells}`)
  }
  lines.push('', '✓ = rollen maa laese (app-politik) · · = maa ikke og kan ikke · ⚠ = maa IKKE, men kan laese direkte (RLS-hul, kun app-laget beskytter)')
  return lines.join('\n')
}
