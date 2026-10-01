/**
 * P-009 læse-side, detalje: pr. bruger-session-læsning af en tabel — fil:linje, funktion og de gates (perms) der
 * fører dertil, samt hvilke roller der kan nå den. Grundlag for række-scopede SELECT-policies (G10).
 *   npx tsx scripts/rls/read-sites-detail.ts tabel [rolle]
 */
import { scanWriteSites } from '../rls-write-sites'
import { PERMISSIONS } from '../../src/lib/auth/permissions'

const [table, onlyRole] = process.argv.slice(2)
const sites = scanWriteSites(undefined, [table], { includeReads: true }).filter((s) => s.op === 'select' && s.client !== 'admin')
const rolesFor = (perms: string[]) => {
  const byRole: Record<string, string[]> = {}
  for (const [p, rs] of Object.entries(PERMISSIONS as Record<string, readonly string[]>)) for (const r of rs) (byRole[r] ??= []).push(p)
  if (!perms.length) return ['(ingen gate)']
  return Object.entries(byRole).filter(([, ps]) => perms.some((p) => ps.includes(p))).map(([r]) => r)
}
const rows = sites.map((s) => ({ where: `${s.file.split('/src/').pop()}:${s.line}`, fn: s.fn.split(' ⇐ ')[0], perms: s.perms, roles: rolesFor(s.perms) }))
const filtered = onlyRole ? rows.filter((r) => r.roles.includes(onlyRole) || r.roles[0] === '(ingen gate)') : rows
for (const r of filtered) console.log(`${r.roles.join(',').padEnd(40)} ${r.fn.padEnd(40)} [${r.perms.join('|')}] ${r.where}`)
console.log(`\n${filtered.length} af ${rows.length} læsninger${onlyRole ? ` når ${onlyRole} (eller er ugatede)` : ''}`)
