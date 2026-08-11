/**
 * Audit: tæl rows i prod der har public-URL-felter sat.
 * Brugerne af getPublicUrl gemmer disse i DB; efter privatisering vil
 * disse værdier være "døde" og skal håndteres via lazy signed-URL.
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
  console.log('\n=== AUDIT: rows med public-URL felter ===\n')

  const checks: Array<{ table: string; column: string; like: string }> = [
    { table: 'customer_documents', column: 'file_url', like: '%/object/public/attachments/%' },
    { table: 'sent_quotes', column: 'pdf_public_url', like: '%/object/public/attachments/%' },
    { table: 'incoming_invoices', column: 'file_url', like: '%/object/public/attachments/%' },
    { table: 'company_settings', column: 'company_logo_url', like: '%/object/public/attachments/%' },
    { table: 'profiles', column: 'avatar_url', like: '%/object/public/attachments/%' },
  ]
  for (const c of checks) {
    const all = await s.from(c.table).select(c.column, { count: 'exact', head: true }).not(c.column, 'is', null)
    const pub = await s.from(c.table).select(c.column, { count: 'exact', head: true }).like(c.column, c.like)
    console.log(`▸ ${c.table}.${c.column}`)
    console.log(`    total med værdi: ${all.count ?? '?'}`)
    console.log(`    matcher public-attachments-URL: ${pub.count ?? '?'}`)
  }

  // Tjek service-case-files-URL'er
  const svcMatch = await s.from('customer_documents').select('file_url', { count: 'exact', head: true }).like('file_url', '%/object/public/service-case-files/%')
  console.log(`\n▸ customer_documents.file_url med service-case-files-prefix: ${svcMatch.count ?? '?'}`)

  // Tjek storage_path-kolonne for rows der har path men ikke file_url
  const noUrlButPath = await s.from('customer_documents').select('id', { count: 'exact', head: true }).is('file_url', null).not('storage_path', 'is', null)
  console.log(`\n▸ customer_documents uden file_url men med storage_path: ${noUrlButPath.count ?? '?'}`)

  // Sample af eksisterende file_url-værdier
  const sample = await s.from('customer_documents').select('id, file_url, storage_path, created_at').not('file_url', 'is', null).order('created_at', { ascending: false }).limit(3)
  console.log('\n▸ Sample customer_documents:')
  for (const r of sample.data ?? []) {
    console.log(`    id=${r.id}`)
    console.log(`      file_url:     ${(r.file_url || '').substring(0, 120)}`)
    console.log(`      storage_path: ${r.storage_path}`)
  }
})()
