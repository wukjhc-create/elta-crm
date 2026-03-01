/**
 * Manual AO Sync Script
 * Runs importFromFtp('AO') using the Next.js runtime.
 * Usage: node --env-file=.env.local --experimental-strip-types scripts/manual-ao-sync.mjs
 */

// We need to use the Next.js dev server to run the actual sync,
// because the code uses path aliases (@/lib/...) and TypeScript.
// Instead, we'll call the importFromFtp logic directly using Supabase + FTP.

import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'crypto'

// Polyfill for Node
if (!globalThis.crypto) globalThis.crypto = webcrypto

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---- Decrypt credentials (matches src/lib/utils/encryption.ts) ----
async function decryptCredentials(encryptedData) {
  if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY not set')
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'base64')
  const cryptoKey = await webcrypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['decrypt'])

  const combined = Buffer.from(encryptedData, 'base64')
  const iv = combined.subarray(0, 12)
  const tag = combined.subarray(combined.length - 16)
  const ciphertext = combined.subarray(12, combined.length - 16)

  const encrypted = Buffer.concat([ciphertext, tag])
  const decrypted = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted)
  return JSON.parse(new TextDecoder().decode(decrypted))
}

async function main() {
  console.log('=== AO Manual Sync ===')
  console.log('Tidspunkt:', new Date().toISOString())

  // 1. Find AO supplier
  const { data: supplier, error: sErr } = await supabase
    .from('suppliers')
    .select('id, name, code')
    .eq('code', 'AO')
    .eq('is_active', true)
    .maybeSingle()

  if (sErr || !supplier) {
    console.error('AO leverandør ikke fundet:', sErr?.message || 'Ingen aktiv AO')
    process.exit(1)
  }
  console.log(`Leverandør: ${supplier.name} (${supplier.id})`)

  // 2. Check credentials
  const { data: cred, error: cErr } = await supabase
    .from('supplier_credentials')
    .select('id, credential_type, is_active, credentials_encrypted, api_endpoint')
    .eq('supplier_id', supplier.id)
    .eq('is_active', true)

  if (cErr || !cred || cred.length === 0) {
    console.error('Ingen aktive credentials fundet for AO:', cErr?.message || 'Tom')
    process.exit(1)
  }

  console.log(`Credentials fundet: ${cred.length} stk`)
  for (const c of cred) {
    console.log(`  - Type: ${c.credential_type}, Endpoint: ${c.api_endpoint || '(ingen)'}`)

    // Try to decrypt to verify ENCRYPTION_KEY works
    try {
      const decrypted = await decryptCredentials(c.credentials_encrypted)
      const keys = Object.keys(decrypted)
      console.log(`  - Dekrypteret OK, felter: ${keys.join(', ')}`)
    } catch (e) {
      console.error(`  - DEKRYPTERING FEJLEDE: ${e.message}`)
    }
  }

  // 3. Check existing products
  const { count: existingCount } = await supabase
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplier.id)

  console.log(`\nEksisterende AO-produkter i DB: ${existingCount || 0}`)

  // 4. Check if FTP credentials exist
  const ftpCred = cred.find(c => c.credential_type === 'ftp')
  const apiCred = cred.find(c => c.credential_type === 'api')

  if (ftpCred) {
    console.log('\n--- FTP Sync ---')
    console.log('FTP sync kræver netværksadgang til AO FTP-server.')
    console.log('Dette script kan ikke køre FTP direkte.')
    console.log('Brug: npm run dev → /dashboard/settings/suppliers/[id] → "Sync Nu"')
  }

  if (apiCred) {
    console.log('\n--- API Sync ---')
    console.log('API credentials fundet. Lad os teste en søgning...')

    try {
      const decrypted = await decryptCredentials(apiCred.credentials_encrypted)
      console.log(`API endpoint: ${apiCred.api_endpoint || 'standard AO'}`)
      console.log(`Brugernavn: ${decrypted.username || decrypted.client_id || '?'}`)
      console.log('API sync kræver kørende Next.js server for SupplierAPIClientFactory.')
    } catch (e) {
      console.error(`API credential dekryptering fejlede: ${e.message}`)
    }
  }

  // 5. Summary
  console.log('\n=== OPSUMMERING ===')
  console.log(`AO leverandør: ${supplier.name} (ID: ${supplier.id})`)
  console.log(`Produkter i DB: ${existingCount || 0}`)
  console.log(`FTP cred: ${ftpCred ? 'JA' : 'NEJ'}`)
  console.log(`API cred: ${apiCred ? 'JA' : 'NEJ'}`)
  console.log(`ENCRYPTION_KEY: ${ENCRYPTION_KEY ? 'SAT (' + ENCRYPTION_KEY.length + ' tegn)' : 'MANGLER'}`)

  if ((existingCount || 0) === 0) {
    console.log('\n⚠ Ingen produkter i DB! Sync er nødvendig.')
    console.log('  Start dev-server (npm run dev) og kør sync fra UI.')
    console.log('  Eller kald: curl http://localhost:3000/api/cron/supplier-sync -H "Authorization: Bearer $CRON_SECRET"')
  } else {
    console.log(`\n✓ ${existingCount} produkter allerede importeret.`)
  }
}

main().catch(e => {
  console.error('Fejl:', e)
  process.exit(1)
})
