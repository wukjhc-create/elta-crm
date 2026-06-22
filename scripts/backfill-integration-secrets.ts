/**
 * Engangs-backfill: krypter eksisterende klartekst integrations-credentials.
 *
 * Tabellen `integrations` lagrede tidligere api_key/api_secret og OAuth-secrets
 * i klartekst. Skrive-/brugs-stien krypterer nu med AES-256-GCM (enc:v1:-prefix)
 * og laeser legacy plaintext bagudkompatibelt. Dette script konverterer de
 * resterende klartekst-vaerdier i prod til ciphertext.
 *
 *  - Idempotent: felter der allerede baerer enc:v1: springes over.
 *  - Roerer kun de 5 secret-felter; andre kolonner forbliver uroerte.
 *  - Default dry-run; brug --apply for at skrive.
 *
 *    npx tsx scripts/backfill-integration-secrets.ts            (dry-run)
 *    npx tsx scripts/backfill-integration-secrets.ts --apply    (apply)
 *
 * Kraever i .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ENCRYPTION_KEY (samme noegle som appen bruger).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '../src/lib/utils/encryption'

// Minimal .env.local loader (samme moenster som oevrige scripts).
function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const ENC_PREFIX = 'enc:v1:'
const SECRET_FIELDS = [
  'api_key',
  'api_secret',
  'oauth_client_secret',
  'oauth_access_token',
  'oauth_refresh_token',
] as const

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`\n=== Integration secrets backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('Mangler ENCRYPTION_KEY — kan ikke kryptere')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rows, error } = await supabase
    .from('integrations')
    .select(['id', ...SECRET_FIELDS].join(','))

  if (error) {
    console.error('FAIL henter integrations:', error.message)
    process.exit(1)
  }

  const list = (rows ?? []) as unknown as Array<Record<string, string | null>>
  console.log(`integrations total = ${list.length}\n`)

  let rowsToUpdate = 0
  let fieldsToEncrypt = 0

  for (const row of list) {
    const update: Record<string, string> = {}
    for (const field of SECRET_FIELDS) {
      const value = row[field]
      if (typeof value === 'string' && value.length > 0 && !value.startsWith(ENC_PREFIX)) {
        update[field] = ENC_PREFIX + (await encrypt(value))
        fieldsToEncrypt++
      }
    }

    const changed = Object.keys(update)
    if (changed.length === 0) continue
    rowsToUpdate++
    console.log(`  ${row.id}: ${changed.join(', ')}`)

    if (apply) {
      const { error: upErr } = await supabase.from('integrations').update(update).eq('id', row.id)
      if (upErr) {
        console.error(`  FAIL update ${row.id}:`, upErr.message)
        process.exit(1)
      }
    }
  }

  console.log(
    `\n${apply ? '✅ Krypterede' : 'Ville kryptere'} ${fieldsToEncrypt} felt(er) i ${rowsToUpdate} raekke(r).`
  )
  if (!apply && rowsToUpdate > 0) {
    console.log('Dry-run: kør med --apply for at udføre.\n')
  } else if (rowsToUpdate === 0) {
    console.log('Intet at backfille — alle secrets er allerede krypteret. ✅\n')
  } else {
    console.log('')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
