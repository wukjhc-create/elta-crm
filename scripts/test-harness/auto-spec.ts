/**
 * P-009: metadata-drevne probe-raekker til RLS-tests af tabeller uden haandskrevet spec (fx runde 4 med 44 tomme
 * katalogtabeller). Ud fra information_schema/pg_catalog paa STAGING:
 *   - paakraevede kolonner (NOT NULL uden default) faar en gyldig vaerdi efter type
 *   - CHECK (col = ANY (ARRAY[...])) -> foerste tilladte vaerdi
 *   - fremmednoegler -> foraeldre-raekke oprettes rekursivt (profiles -> den givne bruger)
 *   - tekst er altid unik (stamp + taeller) -> unikke indeks rammes ikke
 * Opdaterings-kolonne: foerste nullable tekst-kolonne der hverken er FK eller unik (ellers en tal-kolonne).
 */
import { randomUUID } from 'crypto'

type Sql = (q: string) => Promise<any[]>
interface Col { name: string; type: string; udt: string; nullable: boolean; hasDefault: boolean; fk: string | null }
interface Meta { cols: Col[]; checks: Map<string, string>; unique: Set<string>; enums: Map<string, string> }

export class AutoSpecs {
  private meta = new Map<string, Meta>()
  private n = 0
  constructor(private sql: Sql, private stamp: number, private seed: (table: string, row: Record<string, unknown>) => Promise<string>) {}

  async load(table: string): Promise<Meta> {
    if (this.meta.has(table)) return this.meta.get(table)!
    if (!/^[a-z_0-9]+$/.test(table)) throw new Error('ugyldigt tabelnavn')
    const cols = (await this.sql(`SELECT c.column_name name, c.data_type type, c.udt_name udt, c.is_nullable = 'YES' nullable, c.column_default IS NOT NULL has_default,
        (SELECT cl.relname FROM pg_constraint pc JOIN pg_class cl ON cl.oid = pc.confrelid
          JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = pc.conkey[1]
          WHERE pc.conrelid = 'public.${table}'::regclass AND pc.contype = 'f' AND array_length(pc.conkey, 1) = 1 AND a.attname = c.column_name LIMIT 1) fk
      FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = '${table}' ORDER BY c.ordinal_position`)) as any[]
    const checkDefs = (await this.sql(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'public.${table}'::regclass AND contype = 'c'`)) as any[]
    const checks = new Map<string, string>()
    for (const { d } of checkDefs) {
      const m = /\(\(?(\w+)\)? = ANY \(\(?ARRAY\[(.+?)\]/.exec(d)
      const v = m && /'([^']*)'/.exec(m[2])
      if (m && v) checks.set(m[1], v[1])
    }
    const uq = (await this.sql(`SELECT a.attname n FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'public.${table}'::regclass AND i.indisunique AND NOT i.indisprimary`)) as any[]
    // enum-kolonner (USER-DEFINED): foerste tilladte label
    const enums = new Map<string, string>()
    for (const c of cols.filter((x) => x.type === 'USER-DEFINED')) {
      const e = (await this.sql(`SELECT e.enumlabel l FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = '${String(c.udt).replace(/[^a-z_0-9]/g, '')}' ORDER BY e.enumsortorder LIMIT 1`)) as any[]
      if (e[0]) enums.set(c.name, e[0].l)
    }
    const meta: Meta = { cols: cols.map((c) => ({ name: c.name, type: c.type, udt: c.udt, nullable: c.nullable === true || c.nullable === 't', hasDefault: c.has_default === true || c.has_default === 't', fk: c.fk })), checks, unique: new Set(uq.map((u) => u.n)), enums }
    this.meta.set(table, meta)
    return meta
  }

  private value(col: Col, checks: Map<string, string>): unknown {
    if (checks.has(col.name)) return checks.get(col.name)
    const k = ++this.n
    switch (col.udt) {
      case 'text': case 'varchar': case 'bpchar': case 'citext': return `harn_rls_${this.stamp}_${k}`
      case 'int2': case 'int4': case 'int8': case 'numeric': case 'float4': case 'float8': return 1
      case 'bool': return false
      case 'uuid': return randomUUID()
      case 'date': return '2026-01-01'
      case 'timestamptz': case 'timestamp': return new Date().toISOString()
      case 'jsonb': case 'json': return {}
      default: return col.type === 'ARRAY' ? [] : `harn_rls_${this.stamp}_${k}`
    }
  }

  /** Gyldig probe-raekke; FK-foraeldre oprettes (via seed) — profiles peger paa `uid`. */
  async payload(table: string, uid: string, depth = 0): Promise<Record<string, unknown>> {
    if (depth > 4) throw new Error(`auto-spec: for dyb FK-kaede ved ${table}`)
    const m = await this.load(table)
    const row: Record<string, unknown> = {}
    for (const col of m.cols) {
      if (col.name === 'id') continue
      const required = !col.nullable && !col.hasDefault
      if (col.fk === 'profiles' && (required || /^(created_by|user_id)$/.test(col.name))) { row[col.name] = uid; continue }
      if (!required) continue
      if (col.fk) { row[col.name] = await this.seed(col.fk, await this.payload(col.fk, uid, depth + 1)); continue }
      row[col.name] = m.enums.has(col.name) ? m.enums.get(col.name) : this.value(col, m.checks)
    }
    return row
  }

  /** Harmloes opdatering: nullable tekst (ikke FK/unik/CHECK) -> ellers tal -> ellers timestamp. */
  async update(table: string): Promise<Record<string, unknown>> {
    const m = await this.load(table)
    const free = (c: Col) => c.name !== 'id' && !c.fk && !m.unique.has(c.name) && !m.checks.has(c.name) && !m.enums.has(c.name)
    const txt = m.cols.find((c) => free(c) && c.nullable && ['text', 'varchar'].includes(c.udt))
    if (txt) return { [txt.name]: '[HARNESS] rls-update' }
    const num = m.cols.find((c) => free(c) && ['int4', 'numeric', 'int8', 'float8'].includes(c.udt))
    if (num) return { [num.name]: 2 }
    const ts = m.cols.find((c) => free(c) && c.name === 'updated_at')
    if (ts) return { updated_at: new Date().toISOString() }
    throw new Error(`auto-spec: ingen opdaterbar kolonne i ${table}`)
  }
}
