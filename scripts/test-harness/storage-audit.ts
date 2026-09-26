/**
 * Storage-audit (READ-ONLY). Faste SELECT-forespoergsler — ingen dynamisk SQL,
 * ingen input. Bruges identisk mod production (via read-only pg-session i
 * scripts/prod-storage-audit.ts) og staging (harness:storage-audit), saa de to
 * kan sammenlignes 1:1.
 */

/** Private buckets som production skal have (migrationer 00035, 00113, 00133 + dashboard). */
export const EXPECTED_PRIVATE_BUCKETS = ['attachments', 'portal-attachments', 'service-case-files'] as const

/** Anon-policies fra 00035 som 00132 droppede i production. */
export const LEGACY_ANON_POLICIES = ['portal_customers_read_attachments', 'portal_customers_upload_attachments'] as const

/** Faste, parameterloese SELECT-forespoergsler. Maa ALDRIG indeholde andet end SELECT. */
export const STORAGE_AUDIT_QUERIES = {
  buckets: `SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id`,
  policies: `SELECT policyname, cmd, roles::text[] AS roles, permissive, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`,
  rls: `SELECT c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'storage' AND c.relname = 'objects'`,
  anonGrants: `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'storage' AND table_name = 'objects' AND grantee = 'anon' ORDER BY privilege_type`,
} as const

// Defense-in-depth: afvis alt der ikke er en enkelt SELECT (koeres ved modul-load).
for (const [k, sql] of Object.entries(STORAGE_AUDIT_QUERIES)) {
  if (!/^SELECT\s/i.test(sql) || sql.includes(';')) throw new Error(`storage-audit: query '${k}' er ikke en ren SELECT`)
}

export interface StoragePolicy { policyname: string; cmd: string; roles: string[]; permissive: string; qual: string | null; with_check: string | null }
export interface StorageBucket { id: string; public: boolean; file_size_limit: number | null; allowed_mime_types: string[] | null }
export interface StorageSnapshot {
  target: string
  at: string
  buckets: StorageBucket[]
  policies: StoragePolicy[]
  rlsEnabled: boolean
  anonGrants: string[]
}

export type Runner = (sql: string) => Promise<any[]>

/** pg returnerer text[] som array; Management API kan returnere '{a,b}'-streng. */
function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').filter(Boolean).map((s) => s.replace(/^"|"$/g, ''))
  return []
}

export async function collectSnapshot(target: string, run: Runner): Promise<StorageSnapshot> {
  const buckets = (await run(STORAGE_AUDIT_QUERIES.buckets)).map((b: any) => ({
    id: b.id, public: b.public === true || b.public === 't', file_size_limit: b.file_size_limit == null ? null : Number(b.file_size_limit),
    allowed_mime_types: b.allowed_mime_types == null ? null : toArr(b.allowed_mime_types),
  }))
  const policies = (await run(STORAGE_AUDIT_QUERIES.policies)).map((p: any) => ({
    policyname: p.policyname, cmd: p.cmd, roles: toArr(p.roles), permissive: p.permissive, qual: p.qual ?? null, with_check: p.with_check ?? null,
  }))
  const rls = (await run(STORAGE_AUDIT_QUERIES.rls))[0]
  const anonGrants = (await run(STORAGE_AUDIT_QUERIES.anonGrants)).map((g: any) => String(g.privilege_type))
  return { target, at: new Date().toISOString(), buckets, policies, rlsEnabled: rls?.rls_enabled === true || rls?.rls_enabled === 't', anonGrants }
}

export interface AuditFinding { severity: 'hole' | 'info'; message: string }

/** Evaluér et snapshot mod sikkerhedskravene. 'hole' = sikkerhedshul. */
export function evaluateSnapshot(s: StorageSnapshot): AuditFinding[] {
  const f: AuditFinding[] = []
  if (!s.rlsEnabled) f.push({ severity: 'hole', message: 'RLS er IKKE enabled paa storage.objects' })
  for (const name of LEGACY_ANON_POLICIES) {
    if (s.policies.some((p) => p.policyname === name)) f.push({ severity: 'hole', message: `gammel anon-policy fra 00035 findes: ${name}` })
  }
  for (const p of s.policies) {
    if (p.roles.includes('anon') || p.roles.includes('public')) {
      f.push({ severity: 'hole', message: `policy giver anon/public adgang: ${p.policyname} (${p.cmd}, roles=${p.roles.join(',')})` })
    }
  }
  for (const b of EXPECTED_PRIVATE_BUCKETS) {
    const bucket = s.buckets.find((x) => x.id === b)
    if (!bucket) f.push({ severity: 'hole', message: `forventet bucket mangler: ${b}` })
    else if (bucket.public) f.push({ severity: 'hole', message: `bucket er PUBLIC: ${b}` })
  }
  for (const b of s.buckets) {
    if (b.public && !(EXPECTED_PRIVATE_BUCKETS as readonly string[]).includes(b.id)) f.push({ severity: 'info', message: `anden public bucket: ${b.id}` })
  }
  if (s.anonGrants.length) {
    f.push({ severity: 'info', message: `anon table-grants paa storage.objects: ${s.anonGrants.join(',')} (ejet af supabase_storage_admin; RLS uden anon-policy blokerer — jf. 00132)` })
  }
  return f
}

/** Diff to snapshots (typisk prod vs staging) paa buckets + policies. */
export function diffSnapshots(a: StorageSnapshot, b: StorageSnapshot): string[] {
  const out: string[] = []
  const bk = (x: StorageBucket) => `${x.id} public=${x.public} limit=${x.file_size_limit} mimes=${(x.allowed_mime_types ?? []).slice().sort().join('|') || '-'}`
  const pk = (x: StoragePolicy) => `${x.policyname} ${x.cmd} roles=${x.roles.slice().sort().join(',')} ${x.permissive} qual=${x.qual ?? '-'} check=${x.with_check ?? '-'}`
  const setA = new Set(a.buckets.map(bk)), setB = new Set(b.buckets.map(bk))
  for (const x of setA) if (!setB.has(x)) out.push(`bucket kun i ${a.target}: ${x}`)
  for (const x of setB) if (!setA.has(x)) out.push(`bucket kun i ${b.target}: ${x}`)
  const pA = new Set(a.policies.map(pk)), pB = new Set(b.policies.map(pk))
  for (const x of pA) if (!pB.has(x)) out.push(`policy kun i ${a.target}: ${x}`)
  for (const x of pB) if (!pA.has(x)) out.push(`policy kun i ${b.target}: ${x}`)
  if (a.rlsEnabled !== b.rlsEnabled) out.push(`RLS: ${a.target}=${a.rlsEnabled} ${b.target}=${b.rlsEnabled}`)
  return out
}

export function formatSnapshot(s: StorageSnapshot): string {
  const lines = [`--- ${s.target} ---`, `RLS storage.objects: ${s.rlsEnabled ? 'enabled' : 'DISABLED'}`, 'buckets:']
  for (const b of s.buckets) lines.push(`  ${b.id.padEnd(22)} ${b.public ? 'PUBLIC ' : 'private'} limit=${b.file_size_limit ?? '-'} mimes=${b.allowed_mime_types?.length ?? 'alle'}`)
  lines.push('policies (storage.objects):')
  for (const p of s.policies) lines.push(`  ${p.policyname.padEnd(44)} ${p.cmd.padEnd(6)} roles=${p.roles.join(',')}`)
  lines.push(`anon grants: ${s.anonGrants.join(',') || 'ingen'}`)
  return lines.join('\n')
}
