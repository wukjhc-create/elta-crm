/**
 * PERM-1: genererer seed-SQL for permission_catalog + role_permission_defaults FRA src/lib/auth/permissions.ts (eneste
 * kilde). Bruges af migration 00238 og af CI-tjekket (DB-seed = TS). Ingen DB-adgang.
 *   npx tsx scripts/permissions/build-defaults.ts            → udskriver SQL
 *   npx tsx scripts/permissions/build-defaults.ts --check F  → fejler hvis seed-blokken i F afviger fra TS
 */
import { readFileSync } from 'fs'
import { PERMISSIONS } from '../../src/lib/auth/permissions'

const BEGIN = '-- >>> GENERERET SEED (scripts/permissions/build-defaults.ts) — ret ikke manuelt'
const END = '-- <<< GENERERET SEED'

export function buildSeedSql(): string {
  const keys = Object.keys(PERMISSIONS).sort()
  const pairs: string[] = []
  for (const k of keys) for (const r of [...(PERMISSIONS as Record<string, readonly string[]>)[k]].sort()) pairs.push(`  ('${r}', '${k}')`)
  return [
    BEGIN,
    `INSERT INTO public.permission_catalog (permission) VALUES\n${keys.map((k) => `  ('${k}')`).join(',\n')}\nON CONFLICT DO NOTHING;`,
    `INSERT INTO public.role_permission_defaults (role, permission) VALUES\n${pairs.join(',\n')}\nON CONFLICT DO NOTHING;`,
    END,
  ].join('\n')
}

if (require.main === module) {
  const i = process.argv.indexOf('--check')
  if (i < 0) { console.log(buildSeedSql()); process.exit(0) }
  const file = process.argv[i + 1]
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const a = src.indexOf(BEGIN), b = src.indexOf(END)
  const block = a >= 0 && b > a ? src.slice(a, b + END.length) : ''
  if (block !== buildSeedSql()) { console.log(`❌ ${file}: seed-blokken afviger fra permissions.ts — kør build-defaults og indsæt`); process.exit(1) }
  console.log(`✅ ${file}: seed = permissions.ts (${Object.keys(PERMISSIONS).length} nøgler)`)
}
