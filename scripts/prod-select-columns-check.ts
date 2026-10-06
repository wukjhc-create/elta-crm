/**
 * Statisk tjek (read-only mod PRODUCTION-skemaet): finder `.from('tabel') … .select('kolonner')` i src/, hvor en
 * navngivet kolonne IKKE findes i prod-tabellen — sådanne forespørgsler fejler altid (eller filtrerer på intet).
 * Kun simple kolonnelister analyseres (indlejringer `x(...)`, `*` og aliaser `a:b` håndteres; dynamiske strenge springes over).
 * Printer kun fil:linje, tabel og ukendte kolonnenavne (skema-metadata — ingen data).
 *   npx tsx scripts/prod-select-columns-check.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { withProdReadOnly, maskDbError } from './prod-readonly'

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}

/** Topniveau-kolonner fra en select-streng (indlejringer fjernes, aliaser → kildekolonne). */
function topLevelColumns(sel: string): string[] {
  let depth = 0
  let cur = ''
  const parts: string[] = []
  for (const ch of sel) {
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth > 0) continue
    if (ch === ',') { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  return parts
    .map((p) => p.trim())
    .filter((p) => p && p !== '*' && !p.includes('!') && !p.startsWith('...'))
    // embeds er allerede fjernet; "alias:kolonne" → kolonne; "alias:relation" uden parentes kan ikke skelnes → tjekkes
    .map((p) => (p.includes(':') ? p.split(':')[1].trim() : p))
    .map((p) => p.replace(/::\w+$/, ''))
    .filter((p) => /^[a-z_][a-z0-9_]*$/.test(p))
}

const hits: Array<{ file: string; line: number; table: string; cols: string[]; embedsOnLine: boolean }> = []
for (const file of walk(join(process.cwd(), 'src'))) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\.from\('([a-z_0-9]+)'\)/)
    if (!m) continue
    const window = lines.slice(i, i + 4).join(' ')
    const s = window.match(/\.select\(\s*'([^'`]*)'/)
    if (!s) continue
    // embeds med relationsnavne uden parentes ("customer:customers") filtreres ved at kræve at navnet ikke er en tabel nedenfor
    hits.push({ file: file.slice(process.cwd().length + 1), line: i + 1, table: m[1], cols: topLevelColumns(s[1]), embedsOnLine: /\(/.test(s[1]) })
  }
}
const tables = Array.from(new Set(hits.map((h) => h.table)))

withProdReadOnly('prod-select-columns-check', async (run) => {
  const rows = await run(`SELECT json_object_agg(t, cols) j FROM (
      SELECT table_name t, json_agg(column_name) cols FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY(ARRAY[${tables.map((t) => `'${t}'`).join(',')}]) GROUP BY table_name) x`)
  const schema = (rows[0].j ?? {}) as Record<string, string[]>
  let problems = 0
  const missingTables = new Set<string>()
  for (const h of hits) {
    const cols = schema[h.table]
    if (!cols) { missingTables.add(h.table); continue }
    const unknown = h.cols.filter((c) => !cols.includes(c) && !(c in schema))
    if (unknown.length) {
      problems++
      console.log(`${h.file}:${h.line}  ${h.table}: ${unknown.join(', ')}`)
    }
  }
  if (missingTables.size) console.log(`\nTabeller/views der ikke findes i prod-skemaet (public): ${Array.from(missingTables).sort().join(', ')}`)
  console.log(`\n${hits.length} select-forespørgsler analyseret; ${problems} med ukendte kolonner`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
