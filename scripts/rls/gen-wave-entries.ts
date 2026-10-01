/**
 * Hjaelper: genererer TableWritePolicy-entries (TS-tekst) for en ny runde ud fra AST-afledte roller + prods aabne
 * policy-navne (JSON fra scripts/prod-open-write-policies-json.ts). Output gennemgaas manuelt foer det indsaettes.
 *   npx tsx scripts/rls/gen-wave-entries.ts <policies.json> tabel ...
 */
import { readFileSync } from 'fs'
import { scanWriteSites, derivedRoles, anonCronTables } from '../rls-write-sites'

const [jsonFile, ...tables] = process.argv.slice(2)
const pol = JSON.parse(readFileSync(jsonFile, 'utf8')) as Record<string, { drop: string[]; hasAll: boolean }>
const sites = scanWriteSites(undefined, tables)
const anon = anonCronTables()
const order = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']
const fmt = (r: string[] | null) => `[${(r ?? []).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((x) => `'${x}'`).join(', ')}]`
for (const t of tables) {
  const r = (op: string) => derivedRoles(sites, t, op)
  const ins = r('insert'), upd = r('update'), del = r('delete')
  const un = [...ins.unresolved, ...upd.unresolved, ...del.unresolved].length
  console.log(`  { table: '${t}', insert: ${fmt(ins.roles)}, update: ${fmt(upd.roles)}, delete: ${fmt(del.roles)},${anon.has(t) ? ' keepAnonGrants: P003,' : ''}
    dropPolicies: ${JSON.stringify(pol[t]?.drop ?? [])}, recreateOpenSelect: ${pol[t]?.hasAll ? 'true' : 'false'},
    why: 'AST-afledt${un ? ` (${un} uafklarede stier vurderet manuelt)` : ''}' },`)
}
