/**
 * P-009 laese-side: hvilke roller LAESER en tabel via bruger-sessionen (app-kode, AST)? Grundlag for SELECT-policies.
 *   npx tsx scripts/rls/read-sites.ts tabel ...
 */
import { scanWriteSites, derivedRoles } from '../rls-write-sites'

const tables = process.argv.slice(2)
const sites = scanWriteSites(undefined, tables, { includeReads: true }).filter((s) => s.op === 'select')
for (const t of tables) {
  const d = derivedRoles(sites, t, 'select')
  const ts = sites.filter((s) => s.table === t && s.client !== 'admin')
  console.log(`\n=== ${t}: læse-roller ${d.roles ? d.roles.join(',') || '(ingen perms)' : 'kun service-role'} · ${ts.length} bruger-læsninger${d.unresolved.length ? ` · uafklarede: ${[...new Set(d.unresolved.map((u) => `${u.file.split('/').pop()}:${u.fn.split(' ⇐ ')[0]}`))].slice(0, 8).join(', ')}` : ''}`)
}
