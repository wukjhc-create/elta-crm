/**
 * Read-only verifikation af migration 00159 (offers.source_case_id). Faste SELECTs uden input — bruges identisk
 * mod staging (harness:verify-00159) og production (prod:verify-00159, read-only session), foer og efter.
 */

export type Runner = (sql: string) => Promise<any[]>

const Q = {
  column: `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'source_case_id'`,
  fk: `SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c WHERE c.conrelid = 'public.offers'::regclass AND c.contype = 'f' AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (source_case_id)%'`,
  indexes: `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'offers' AND indexname IN ('idx_offers_source_case_id', 'uq_offers_open_proposal_per_source_case') ORDER BY indexname`,
  counts: `SELECT count(*) AS offers, count(*) FILTER (WHERE is_proposal) AS proposals FROM public.offers`,
} as const
for (const [k, sql] of Object.entries(Q)) if (!/^SELECT\s/i.test(sql) || sql.includes(';')) throw new Error(`migration-checks: '${k}' er ikke en ren SELECT`)

const Q_APPLIED = {
  linked: `SELECT count(*) AS linked, count(*) FILTER (WHERE is_proposal) AS linked_proposals FROM public.offers WHERE source_case_id IS NOT NULL`,
  dupOpen: `SELECT count(*) AS n FROM (SELECT source_case_id FROM public.offers WHERE source_case_id IS NOT NULL AND is_proposal GROUP BY source_case_id HAVING count(*) > 1) d`,
  dangling: `SELECT count(*) AS n FROM public.offers o LEFT JOIN public.service_cases s ON s.id = o.source_case_id WHERE o.source_case_id IS NOT NULL AND s.id IS NULL`,
} as const

export interface Result00159 {
  applied: boolean
  column?: { data_type: string; is_nullable: string }
  fk?: string
  indexes: Record<string, string>
  offers: number
  proposals: number
  linked?: number
  linkedProposals?: number
  problems: string[]
}

export async function run00159Checks(run: Runner): Promise<Result00159> {
  const col = (await run(Q.column))[0]
  const fk = (await run(Q.fk))[0]
  const idx = Object.fromEntries((await run(Q.indexes)).map((r: any) => [r.indexname, r.indexdef]))
  const cnt = (await run(Q.counts))[0]
  const r: Result00159 = { applied: !!col, column: col, fk: fk?.def, indexes: idx, offers: Number(cnt.offers), proposals: Number(cnt.proposals), problems: [] }
  if (!col) return r
  if (col.data_type !== 'uuid' || col.is_nullable !== 'YES') r.problems.push(`kolonne forkert: ${col.data_type}/${col.is_nullable}`)
  if (!fk || !/REFERENCES service_cases\(id\) ON DELETE SET NULL/.test(fk.def)) r.problems.push(`FK mangler/forkert: ${fk?.def ?? '-'}`)
  const uq = idx.uq_offers_open_proposal_per_source_case ?? ''
  if (!/UNIQUE/.test(uq) || !/is_proposal/.test(uq)) r.problems.push('partial unique index mangler/forkert')
  if (!idx.idx_offers_source_case_id) r.problems.push('opslags-index mangler')
  const l = (await run(Q_APPLIED.linked))[0]
  r.linked = Number(l.linked); r.linkedProposals = Number(l.linked_proposals)
  if (Number((await run(Q_APPLIED.dupOpen))[0].n)) r.problems.push('flere aabne forslag pr. sag')
  if (Number((await run(Q_APPLIED.dangling))[0].n)) r.problems.push('source_case_id peger paa ikke-eksisterende sag')
  return r
}

export function format00159(target: string, r: Result00159): string {
  const lines = [`--- 00159 @ ${target} ---`, `tilbud: ${r.offers} (heraf forslag ${r.proposals})`]
  if (!r.applied) { lines.push('status: IKKE ANVENDT (kolonnen findes ikke)'); return lines.join('\n') }
  lines.push(`kolonne: ${r.column!.data_type} nullable=${r.column!.is_nullable}`, `FK: ${r.fk ?? 'MANGLER'}`)
  for (const [k, v] of Object.entries(r.indexes)) lines.push(`index ${k}: ${v.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /, '$1')}`)
  lines.push(`koblede tilbud: ${r.linked} (forslag ${r.linkedProposals})`)
  lines.push(r.problems.length ? `❌ ${r.problems.join('; ')}` : '✅ anvendt og konsistent')
  return lines.join('\n')
}
