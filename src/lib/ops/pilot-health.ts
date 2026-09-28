/**
 * Pilot Health (P1 #10) — samlet, READ-ONLY driftsbillede til admin. Bevidst IKKE 'use server'.
 *
 * Syv sektioner: system, crons, brugere, agenter/sikkerhedsflag, incidents, integrationer, DB-/sikkerhed.
 * Alle DB-kald er SELECT (admin-klient efter admin-tjek i siden). Sikkerhedssektionen laver LIVE anon-prober:
 * den offentlige anon-noegle uden session forsoeger at LAESE én raekke fra fortrolige flader — kun SELECT,
 * aldrig RPC'er eller skrivning (et vellykket kald til fx log_audit_event ville selv vaere en forfalskning).
 * Hver sektion fejler isoleret (status 'unknown' + fejltekst) — siden vaelter aldrig pga. én kilde.
 */
import { createClient } from '@supabase/supabase-js'
import { CRON_REGISTRY } from '@/lib/services/cron-registry'
import { INCIDENT_REGISTER } from '@/lib/ops/incident-register'

export type HealthLevel = 'green' | 'yellow' | 'red' | 'unknown'

export interface HealthItem { label: string; level: HealthLevel; detail: string }
export interface HealthSection { key: string; title: string; level: HealthLevel; items: HealthItem[]; error?: string }
export interface PilotHealthSnapshot { generatedAt: string; overall: HealthLevel; sections: HealthSection[] }

type Admin = any

const HOUR = 3_600_000
export const STUCK_EXECUTING_MINUTES = 15
const worst = (levels: HealthLevel[]): HealthLevel =>
  levels.includes('red') ? 'red' : levels.includes('unknown') ? 'unknown' : levels.includes('yellow') ? 'yellow' : 'green'
const ago = (iso: string | null | undefined): string => {
  if (!iso) return 'aldrig'
  const h = (Date.now() - new Date(iso).getTime()) / HOUR
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min siden` : h < 48 ? `${Math.round(h)} t siden` : `${Math.round(h / 24)} d siden`
}

async function section(key: string, title: string, fn: () => Promise<HealthItem[]>): Promise<HealthSection> {
  try {
    const items = await fn()
    return { key, title, level: worst(items.map((i) => i.level)), items }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { key, title, level: 'unknown', items: [], error: msg.slice(0, 200) }
  }
}

// ---------- 1. System ----------
async function systemItems(admin: Admin): Promise<HealthItem[]> {
  const since = new Date(Date.now() - 24 * HOUR).toISOString()
  const { data, error } = await admin.from('system_health_log').select('service, status, message, created_at')
    .gte('created_at', since).neq('status', 'ok').neq('service', 'cron').order('created_at', { ascending: false }).limit(1000)
  if (error) throw new Error(`system_health_log: ${error.message}`)
  const by = new Map<string, { errors: number; warnings: number; last: string }>()
  for (const r of (data ?? []) as Array<{ service: string; status: string; message: string }>) {
    const e = by.get(r.service) ?? { errors: 0, warnings: 0, last: r.message }
    if (r.status === 'error') e.errors++
    else e.warnings++
    by.set(r.service, e)
  }
  // (cron-koersler vises i egen sektion)
  if (by.size === 0) return [{ label: 'Fejl/advarsler 24 t', level: 'green', detail: 'ingen' }]
  return [...by.entries()].sort((a, b) => b[1].errors - a[1].errors).map(([service, e]) => ({
    label: service,
    level: e.errors > 0 ? 'red' : 'yellow',
    detail: `${e.errors} fejl · ${e.warnings} advarsler (24 t) — seneste: ${(e.last ?? '').slice(0, 120)}`,
  }))
}

// ---------- 2. Crons ----------
function expectedGapHours(schedule: string): number {
  const dow = schedule.split(' ')[4]
  return dow && dow !== '*' ? 8 * 24 : 26
}
async function cronItems(admin: Admin): Promise<HealthItem[]> {
  const since = new Date(Date.now() - 9 * 24 * HOUR).toISOString()
  const { data, error } = await admin.from('system_health_log').select('status, message, metadata, created_at')
    .eq('service', 'cron').gte('created_at', since).order('created_at', { ascending: false }).limit(2000)
  if (error) throw new Error(`cron-log: ${error.message}`)
  const last = new Map<string, { status: string; at: string; message: string }>()
  for (const r of (data ?? []) as Array<{ status: string; message: string; metadata: { cron?: string } | null; created_at: string }>) {
    const name = r.metadata?.cron
    if (name && !last.has(name)) last.set(name, { status: r.status, at: r.created_at, message: r.message })
  }
  return CRON_REGISTRY.map((c) => {
    const run = last.get(c.name)
    const stale = run ? (Date.now() - new Date(run.at).getTime()) / HOUR > expectedGapHours(c.schedule) : false
    const level: HealthLevel = !run ? 'unknown' : run.status === 'error' ? 'red' : run.status === 'warning' || stale || c.knownIssue ? 'yellow' : 'green'
    const mail = c.external === 'customer_mail' ? ' · ⚠ sender kundemail' : ''
    const runTxt = run ? `seneste ${run.status} ${ago(run.at)}${stale ? ' (FORSINKET)' : ''}` : 'ingen kørsel registreret endnu'
    return { label: c.name, level, detail: `${runTxt}${mail}${c.knownIssue ? ` · kendt: ${c.knownIssue}` : ''}` }
  })
}

// ---------- 3. Brugere ----------
async function userItems(admin: Admin): Promise<HealthItem[]> {
  const { data: profiles, error } = await admin.from('profiles').select('id, role, is_active, email')
  if (error) throw new Error(`profiles: ${error.message}`)
  const signIns = new Map<string, string | null>()
  for (let page = 1; page <= 10; page++) {
    const { data: u, error: uErr } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (uErr) throw new Error(`auth: ${uErr.message}`)
    for (const user of u.users as Array<{ id: string; last_sign_in_at?: string | null }>) signIns.set(user.id, user.last_sign_in_at ?? null)
    if (u.users.length < 200) break
  }
  const real = ((profiles ?? []) as Array<{ id: string; role: string | null; is_active: boolean | null; email: string | null }>)
    .filter((p) => !(p.email ?? '').endsWith('@harness.test'))
  const byRole = new Map<string, { total: number; active: number; seen7d: number }>()
  for (const p of real) {
    const r = byRole.get(p.role ?? '(ingen)') ?? { total: 0, active: 0, seen7d: 0 }
    r.total++
    if (p.is_active !== false) r.active++
    const s = signIns.get(p.id)
    if (s && Date.now() - new Date(s).getTime() < 7 * 24 * HOUR) r.seen7d++
    byRole.set(p.role ?? '(ingen)', r)
  }
  const items: HealthItem[] = [...byRole.entries()].sort().map(([role, r]) => ({
    label: role, level: 'green', detail: `${r.total} brugere · ${r.active} aktive · ${r.seen7d} logget ind seneste 7 d`,
  }))
  const admins = byRole.get('admin')?.active ?? 0
  items.push({ label: 'Admin-dækning', level: admins >= 1 ? 'green' : 'red', detail: `${admins} aktive admins` })
  return items
}

// ---------- 4. Agenter + sikkerhedsflag ----------
async function agentItems(admin: Admin, stuckMinutes: number): Promise<HealthItem[]> {
  const { data: cfg, error } = await admin.from('agent_configs').select('agent_type, enabled, safety_mode')
  if (error) throw new Error(`agent_configs: ${error.message}`)
  const rows = (cfg ?? []) as Array<{ agent_type: string; enabled: boolean; safety_mode: string }>
  const enabled = rows.filter((r) => r.enabled).map((r) => r.agent_type)
  const notSuggest = rows.filter((r) => r.safety_mode !== 'suggest').map((r) => r.agent_type)
  const autoCreate = process.env.AUTO_CREATE_CASES_ENABLED === 'true'
  const since7 = new Date(Date.now() - 7 * 24 * HOUR).toISOString()
  const stuckBefore = new Date(Date.now() - stuckMinutes * 60_000).toISOString()
  const [awaiting, failed, verify, stuck] = await Promise.all([
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).in('status', ['awaiting_approval', 'approved']),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since7),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'needs_verification'),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'executing').lt('updated_at', stuckBefore),
  ])
  return [
    { label: 'Agenter aktiveret', level: enabled.length ? 'red' : 'green', detail: enabled.length ? `AKTIVE: ${enabled.join(', ')} (pilot-kontrakt: alle disabled)` : `0 af ${rows.length} (alle disabled)` },
    { label: 'Sikkerhedstilstand', level: notSuggest.length ? 'red' : 'green', detail: notSuggest.length ? `ikke 'suggest': ${notSuggest.join(', ')}` : `alle ${rows.length} i 'suggest'` },
    { label: 'AUTO_CREATE_CASES_ENABLED', level: autoCreate ? 'red' : 'green', detail: autoCreate ? 'TIL (pilot-kontrakt: OFF)' : 'OFF' },
    { label: 'Forslag afventer review', level: 'green', detail: `${awaiting.count ?? 0}` },
    { label: 'Fejlede handlinger 7 d', level: (failed.count ?? 0) > 0 ? 'yellow' : 'green', detail: `${failed.count ?? 0}` },
    { label: 'Afventer verifikation', level: (verify.count ?? 0) > 0 ? 'yellow' : 'green', detail: `${verify.count ?? 0}` },
    // P2 #12: en action der haenger i 'executing' (proces-crash midt i udfoerelse) genoptages ALDRIG automatisk
    // (bevidst: ingen auto-retry) — den skal ses og vurderes af et menneske.
    { label: `Hængende udførelser (>${stuckMinutes} min)`, level: (stuck.count ?? 0) > 0 ? 'red' : 'green',
      detail: (stuck.count ?? 0) > 0 ? `${stuck.count} action(s) står i 'executing' — kontrollér om effekten skete, før noget gentages` : '0' },
  ]
}

// ---------- 5. Incidents ----------
async function incidentItems(): Promise<HealthItem[]> {
  const open = INCIDENT_REGISTER.filter((i) => !i.closed)
  if (!open.length) return [{ label: 'Åbne incidents', level: 'green', detail: 'ingen' }]
  return open.map((i) => ({
    label: `${i.id} (${i.severity})`,
    level: i.severity === 'S1' || i.severity === 'S2' ? 'red' : 'yellow',
    detail: `${i.area}: ${i.title}${i.pending ? ` — mangler: ${i.pending}` : ''}`,
  }))
}

// ---------- 6. Integrationer ----------
async function integrationItems(admin: Admin): Promise<HealthItem[]> {
  const [graph, econ, bank, lemu, creds] = await Promise.all([
    admin.from('graph_sync_state').select('mailbox, last_sync_at, last_sync_status'),
    admin.from('accounting_integration_settings').select('provider, active, last_sync_at'),
    admin.from('bank_transactions').select('created_at').order('created_at', { ascending: false }).limit(1),
    admin.from('supplier_sync_logs').select('job_type, status, created_at').order('created_at', { ascending: false }).limit(1),
    admin.from('supplier_credentials').select('id, is_active, last_test_status'),
  ])
  const items: HealthItem[] = []
  for (const m of (graph.data ?? []) as Array<{ mailbox: string; last_sync_at: string | null; last_sync_status: string | null }>) {
    const h = m.last_sync_at ? (Date.now() - new Date(m.last_sync_at).getTime()) / HOUR : Infinity
    items.push({ label: `Mail: ${m.mailbox}`, level: m.last_sync_status !== 'success' ? 'red' : h > 26 ? 'yellow' : 'green', detail: `${m.last_sync_status ?? '?'} ${ago(m.last_sync_at)}` })
  }
  if (!(graph.data ?? []).length) items.push({ label: 'Mail (Graph)', level: 'yellow', detail: 'ingen postkasser synkroniseret' })
  const econRows = (econ.data ?? []) as Array<{ provider: string; active: boolean }>
  items.push({ label: 'Regnskab (e-conomic)', level: econRows.some((r) => r.active) ? 'green' : 'yellow', detail: econRows.length ? econRows.map((r) => `${r.provider} ${r.active ? 'aktiv' : 'inaktiv'}`).join(', ') : 'ikke konfigureret' })
  const lastBank = (bank.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null
  items.push({ label: 'Bankimport', level: lastBank && Date.now() - new Date(lastBank).getTime() < 7 * 24 * HOUR ? 'green' : 'yellow', detail: `seneste postering importeret ${ago(lastBank)}` })
  const l = lemu.data?.[0] as { job_type?: string; status?: string; created_at?: string } | undefined
  items.push({ label: 'Leverandørsync (seneste)', level: !l ? 'yellow' : l.status === 'failed' ? 'red' : 'green', detail: l ? `${l.job_type} ${l.status} ${ago(l.created_at)}` : 'ingen sync-log' })
  const c = (creds.data ?? []) as Array<{ is_active: boolean; last_test_status: string | null }>
  items.push({ label: 'Leverandør-credentials', level: c.some((x) => x.is_active && x.last_test_status === 'failed') ? 'yellow' : 'green', detail: `${c.filter((x) => x.is_active).length} aktive · ${c.filter((x) => x.last_test_status === 'failed').length} med fejlet test (værdier vises aldrig)` })
  return items
}

// ---------- 7. DB-/sikkerhed (live anon-prober, kun SELECT) ----------
export const ANON_READ_PROBES = [
  { table: 'v_supplier_products_with_supplier', incident: 'P-004' },
  { table: 'product_catalog', incident: 'P-004' },
  { table: 'invoices', incident: 'P-000' },
  { table: 'supplier_credentials', incident: 'P-001' },
  { table: 'audit_logs', incident: 'P-002' },
  { table: 'customers', incident: '' },
] as const

async function securityItems(): Promise<HealthItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('anon-konfiguration mangler')
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const items: HealthItem[] = []
  for (const p of ANON_READ_PROBES) {
    const { data, error } = await anon.from(p.table).select('*').limit(1)
    const rows = (data ?? []).length
    items.push({
      label: `Anon læser ${p.table}`,
      level: rows > 0 ? 'red' : 'green',
      detail: rows > 0 ? `ÅBEN — offentlig nøgle kan læse data${p.incident ? ` (${p.incident})` : ''}` : error ? `afvist (${(error.code ?? error.message).toString().slice(0, 40)})` : '0 rækker (RLS)',
    })
  }
  return items
}

/** `stuckMinutes` kan kun saenkes af tests (updated_at saettes af trigger og kan ikke tilbagedateres). */
export async function collectPilotHealthSnapshot(admin: Admin, opts: { stuckMinutes?: number } = {}): Promise<PilotHealthSnapshot> {
  const stuckMinutes = opts.stuckMinutes ?? STUCK_EXECUTING_MINUTES
  const sections = await Promise.all([
    section('system', 'System', () => systemItems(admin)),
    section('crons', 'Crons', () => cronItems(admin)),
    section('users', 'Brugere', () => userItems(admin)),
    section('agents', 'Agenter & sikkerhedsflag', () => agentItems(admin, stuckMinutes)),
    section('incidents', 'Incidents', () => incidentItems()),
    section('integrations', 'Integrationer', () => integrationItems(admin)),
    section('security', 'DB-/sikkerhed (live anon-prober)', () => securityItems()),
  ])
  return { generatedAt: new Date().toISOString(), overall: worst(sections.map((s) => s.level)), sections }
}
