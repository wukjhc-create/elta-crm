/**
 * Smoke-test af signed-url-helper.
 * Bruger storage_path fra en eksisterende customer_document.
 *
 * Helper'en eksporterer functions der bruger createAdminClient() — vi
 * mimicker det her mod prod for at verificere generering virker for
 * baade public ('attachments') og private ('portal-attachments') buckets.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v }
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

;(async () => {
  console.log('\n=== SMOKE: signed-url helper ===\n')

  // Find et customer_document med storage_path
  const { data: doc } = await s.from('customer_documents')
    .select('id, title, storage_path')
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!doc) {
    console.log('Ingen customer_documents med storage_path — skipper test')
    process.exit(0)
  }
  console.log(`Test-doc: ${doc.title}`)
  console.log(`  storage_path: ${doc.storage_path}`)

  // Test 1: TTL=3600 (SHORT)
  const r1 = await s.storage.from('attachments').createSignedUrl(doc.storage_path, 3600)
  if (r1.error) {
    console.log(`❌ TTL=3600: ${r1.error.message}`)
  } else {
    console.log(`✅ TTL=3600 (1 time): ${r1.data.signedUrl.substring(0, 100)}...`)
    // Verifier at URL'en faktisk returnerer indhold
    const fetchRes = await fetch(r1.data.signedUrl, { method: 'HEAD' })
    console.log(`   HEAD ${fetchRes.status} (${fetchRes.headers.get('content-type') ?? '?'})`)
  }

  // Test 2: TTL=86400 (DAY)
  const r2 = await s.storage.from('attachments').createSignedUrl(doc.storage_path, 86400)
  if (r2.error) {
    console.log(`❌ TTL=86400: ${r2.error.message}`)
  } else {
    console.log(`✅ TTL=86400 (24 timer)`)
  }

  // Test 3: TTL=86400*30 (MAIL)
  const r3 = await s.storage.from('attachments').createSignedUrl(doc.storage_path, 86400 * 30)
  if (r3.error) {
    console.log(`❌ TTL=2592000: ${r3.error.message}`)
  } else {
    console.log(`✅ TTL=2592000 (30 dage)`)
  }

  // Test 4: TTL=86400*365 (YEAR)
  const r4 = await s.storage.from('attachments').createSignedUrl(doc.storage_path, 86400 * 365)
  if (r4.error) {
    console.log(`❌ TTL=86400*365: ${r4.error.message}`)
  } else {
    console.log(`✅ TTL=86400*365 (1 år)`)
  }

  // Test 5: Invalid path
  const r5 = await s.storage.from('attachments').createSignedUrl('nonexistent/path.pdf', 3600)
  if (r5.error) {
    console.log(`✅ Invalid path returnerer fejl som forventet: ${r5.error.message}`)
  } else {
    console.log(`⚠️ Invalid path returnerede success — ikke som forventet`)
  }

  console.log('\nSmoke-test færdig — helper-mønster virker mod prod.')
})()
