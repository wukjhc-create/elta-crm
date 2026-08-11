/**
 * Smoke-test af β.2.2: producers genererer signed URLs i stedet for
 * public. Vi simulerer hver producers signed-URL-generering med en
 * eksisterende storage_path og verificerer at HEAD-request returnerer
 * 200 + content-type.
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

const TTL_YEAR = 86400 * 365

async function test(label: string, bucket: string, path: string) {
  const r = await admin.storage.from(bucket).createSignedUrl(path, TTL_YEAR)
  if (r.error) {
    console.log(`❌ ${label}: ${r.error.message}`)
    return
  }
  const fetchRes = await fetch(r.data.signedUrl, { method: 'HEAD' })
  console.log(`${fetchRes.ok ? '✅' : '❌'} ${label}: HEAD ${fetchRes.status} (${fetchRes.headers.get('content-type') ?? '?'})`)
}

;(async () => {
  console.log('\n=== SMOKE β.2.2: Producer signed-URL generering ===\n')

  // 1. customer_documents — eksisterende fil
  const { data: doc } = await admin.from('customer_documents').select('storage_path').not('storage_path', 'is', null).limit(1).maybeSingle()
  if (doc?.storage_path) await test('customer_documents.attachments', 'attachments', doc.storage_path)

  // 2. service_case_attachments — eksisterende fil
  const { data: sca } = await admin.from('service_case_attachments').select('storage_path').not('storage_path', 'is', null).limit(1).maybeSingle()
  if (sca?.storage_path) {
    await test('service_case_attachments.service-case-files', 'service-case-files', sca.storage_path)
  } else {
    console.log('⚠️ service_case_attachments tom — kan ikke teste service-case-files producer')
  }

  // 3. sent_quotes — eksisterende fil
  const { data: sq } = await admin.from('sent_quotes').select('pdf_storage_path').not('pdf_storage_path', 'is', null).limit(1).maybeSingle()
  if (sq?.pdf_storage_path) await test('sent_quotes.attachments', 'attachments', sq.pdf_storage_path)

  // 4. files-tabel (uploadFile)
  const { data: f } = await admin.from('files').select('path').not('path', 'is', null).limit(1).maybeSingle()
  if (f?.path) await test('files.attachments', 'attachments', f.path)
  else console.log('⚠️ files-tabel tom — kan ikke teste files.ts producer')

  // 5. incoming_emails.attachment_urls — eksisterende JSONB
  const { data: ie } = await admin.from('incoming_emails').select('attachment_urls').not('attachment_urls', 'is', null).limit(1).maybeSingle()
  if (ie?.attachment_urls) {
    const arr = ie.attachment_urls as Array<{ storagePath?: string }>
    if (Array.isArray(arr) && arr[0]?.storagePath) {
      await test('incoming_emails.attachment_urls', 'attachments', arr[0].storagePath)
    }
  }

  console.log('\nSmoke-test færdig.')
})()
