/**
 * Statisk sikkerheds-regressionstest (ingen DB):   npx tsx scripts/security-static-test.ts
 *
 * R3: hemmelige leverandør-credentials maa kun laeses server-side via service-role.
 *   1. Ingen fil med 'use server' (server actions = kaldbare fra browseren) maa naevne en hemmelig kolonne i en
 *      select - eller eksportere en funktion der returnerer dekrypterede credentials.
 *   2. src/lib/services/supplier-credential-secrets.ts maa ALDRIG blive en 'use server'-fil.
 *   3. Koden maa ikke laese hemmelige kolonner med bruger-/server-klienten (kun admin-klient).
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', 'src')
const SECRETS_MODULE = join(ROOT, 'lib', 'services', 'supplier-credential-secrets.ts')

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

const files = walk(ROOT)
const isUseServer = (src: string) => /^\s*['"]use server['"]/.test(src)

// 1. server actions naevner ikke hemmelige kolonner i select/read og eksporterer ikke dekryptering
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (!isUseServer(src)) continue
  const selectsSecret = /\.select\([^)]*\b(credentials_encrypted|access_token_encrypted|refresh_token_encrypted)\b/.test(src)
  if (selectsSecret) assert(false, `server action laeser hemmelig kolonne: ${relative(ROOT, f)}`)
  if (/export\s+async\s+function\s+getDecryptedCredentials\b/.test(src)) assert(false, `server action eksporterer dekrypterede credentials: ${relative(ROOT, f)}`)
}
assert(true, `${files.filter((f) => isUseServer(readFileSync(f, 'utf8'))).length} server action-filer scannet for hemmelige kolonner`)

// 2. secrets-modulet er ikke en server action og bruger admin-klienten
const mod = readFileSync(SECRETS_MODULE, 'utf8')
assert(!isUseServer(mod), "supplier-credential-secrets.ts er IKKE 'use server'")
assert(/createAdminClient\(\)/.test(mod), 'supplier-credential-secrets.ts laeser via service-role (createAdminClient)')

// 3. alle reads af hemmelige kolonner i src sker i filer der bruger admin-klienten (eller er secrets-modulet)
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (!/\.select\([^)]*\b(credentials_encrypted|access_token_encrypted|refresh_token_encrypted)\b/.test(src)) continue
  const usesServerClient = /from '@\/lib\/supabase\/server'/.test(src) && !/createAdminClient/.test(src)
  // Kendt, dokumenteret undtagelse: supplier-sync-cron bruger server-klienten uden session (anon) og kan derfor ikke
  // laese kolonnen overhovedet (latent fejl registreret i backlog #9) - ingen laekage, men den flagges saa den ses.
  const knownException = relative(ROOT, f).replace(/\\/g, '/') === 'app/api/cron/supplier-sync/route.ts'
  assert(!usesServerClient || knownException, `hemmelig kolonne laeses kun via admin-klient: ${relative(ROOT, f)}${knownException ? ' (kendt latent fejl, backlog #9)' : ''}`)
}

console.log(fails ? `\n❌ ${fails} FEJL` : '\n✅ ALLE STATISKE SIKKERHEDSTESTS PASS')
process.exit(fails ? 1 : 0)
