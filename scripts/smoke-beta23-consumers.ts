/**
 * Smoke-test af β.2.3: consumers genererer fresh signed URLs ved fetch.
 * Vi simulerer hver consumer-flow med rigtige rows og verificerer at
 * den returnerede URL faktisk virker.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v }
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function generateSigned(bucket: string, path: string, ttl: number) {
  const r = await admin.storage.from(bucket).createSignedUrl(path, ttl)
  return r.error ? null : r.data.signedUrl
}

async function testHead(label: string, url: string | null) {
  if (!url) { console.log(`❌ ${label}: ingen URL`); return }
  const r = await fetch(url, { method: 'HEAD' })
  console.log(`${r.ok ? '✅' : '❌'} ${label}: HEAD ${r.status} (${r.headers.get('content-type') ?? '?'})`)
}

;(async () => {
  console.log('\n=== SMOKE β.2.3: Consumer-flow ===\n')

  // 1. customer-documents.ts getCustomerDocuments — batch signed URLs
  console.log('▸ getCustomerDocuments-flow:')
  const { data: cd } = await admin.from('customer_documents').select('id, storage_path').not('storage_path', 'is', null).limit(3)
  for (const d of cd ?? []) {
    const url = await generateSigned('attachments', d.storage_path, 3600)
    await testHead(`  doc ${(d.storage_path as string).split('/').pop()}`, url)
  }

  // 2. portal.ts getPortalDocuments — same flow
  console.log('\n▸ getPortalDocuments-flow:')
  const { data: pd } = await admin.from('customer_documents').select('storage_path').not('storage_path', 'is', null).order('created_at', { ascending: false }).limit(2)
  for (const d of pd ?? []) {
    const url = await generateSigned('attachments', d.storage_path, 3600)
    await testHead(`  portal doc`, url)
  }

  // 3. quote-actions.ts shareQuoteToPortal — generates fresh URL from quote.pdf_storage_path
  console.log('\n▸ shareQuoteToPortal-flow:')
  const { data: sq } = await admin.from('sent_quotes').select('pdf_storage_path').not('pdf_storage_path', 'is', null).limit(2)
  for (const q of sq ?? []) {
    const url = await generateSigned('attachments', q.pdf_storage_path, 86400 * 365)
    await testHead(`  quote ${(q.pdf_storage_path as string).split('/').pop()}`, url)
  }

  // 4. fuldmagt.ts getPortalFuldmagter — batch refresh
  console.log('\n▸ getPortalFuldmagter-flow:')
  const { data: fm } = await admin.from('customer_documents')
    .select('storage_path, description')
    .not('storage_path', 'is', null)
    .eq('document_type', 'contract')
    .limit(3)
  let fmCount = 0
  for (const f of fm ?? []) {
    try {
      const desc = JSON.parse((f.description as string) || '{}')
      if (desc.type !== 'fuldmagt') continue
      const url = await generateSigned('attachments', f.storage_path, 3600)
      await testHead(`  fuldmagt`, url)
      fmCount++
    } catch {}
  }
  if (fmCount === 0) console.log('  (ingen fuldmagter fundet)')

  // 5. customer-flow.ts: kun boolean-check via storage_path
  console.log('\n▸ computeRapportStep boolean-check:')
  const { data: rapports } = await admin.from('customer_documents')
    .select('id, file_url, storage_path')
    .ilike('title', '%Besigtigelse%')
    .limit(2)
  for (const r of rapports ?? []) {
    const ready = !!(r.storage_path || r.file_url)
    console.log(`  rapport ${r.id.substring(0, 8)}: storage_path=${r.storage_path ? 'YES' : 'NO'}, ready=${ready}`)
  }

  console.log('\nSmoke-test færdig.')
})()
