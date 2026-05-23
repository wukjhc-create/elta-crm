/**
 * Sprint 10B Trin 1B — Read-only DATA snapshot.
 *
 * Forudsaetning: Trin 1A har bekraeftet at alle felter findes i prod.
 * Vi henter nu data-distribution for at vurdere migration-risici.
 *
 * INGEN ALTER / CREATE / UPDATE / DELETE / DROP / INSERT.
 * INGEN secrets printes.
 */

import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const token = env.SUPABASE_ACCESS_TOKEN

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN missing in .env.local')
  process.exit(1)
}

async function q(sql) {
  const norm = sql.toLowerCase().replace(/\s+/g, ' ')
  const banned = ['alter ', 'create ', 'update ', 'delete ', 'drop ', 'insert ', 'truncate ', 'grant ', 'revoke ', 'reindex ']
  for (const b of banned) {
    if (norm.includes(b)) {
      throw new Error(`Blocked non-readonly statement: ${b.trim()}`)
    }
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  return { status: r.status, text: await r.text() }
}

function section(title) {
  console.log(`\n\n========================================`)
  console.log(`== ${title}`)
  console.log(`========================================`)
}

// A. customer_contacts.role distribution
section('A: customer_contacts.role distribution')
console.log(
  (await q(`SELECT COALESCE(role, '(NULL)') AS role_value, COUNT(*) AS count FROM customer_contacts GROUP BY role ORDER BY count DESC;`)).text
)

// B. customer_contacts hvor role er NULL
section('B: customer_contacts with NULL role')
console.log(
  (await q(`SELECT COUNT(*) AS null_role_count FROM customer_contacts WHERE role IS NULL;`)).text
)

// C. customer_contacts rows med role udenfor prod CHECK-listen
section('C: customer_contacts with role NOT in (billing,ordering,site,technical,resident,property_manager,other)')
console.log(
  (await q(`SELECT role, COUNT(*) AS count FROM customer_contacts WHERE role IS NOT NULL AND role NOT IN ('billing','ordering','site','technical','resident','property_manager','other') GROUP BY role ORDER BY count DESC;`)).text
)

// D. customer_documents.document_type distribution
section('D: customer_documents.document_type distribution')
console.log(
  (await q(`SELECT document_type, COUNT(*) AS count FROM customer_documents GROUP BY document_type ORDER BY count DESC;`)).text
)

// E. customer_documents rows med document_type udenfor prod CHECK-listen
section('E: customer_documents with document_type NOT in (quote,invoice,contract,other)')
console.log(
  (await q(`SELECT document_type, COUNT(*) AS count FROM customer_documents WHERE document_type NOT IN ('quote','invoice','contract','other') GROUP BY document_type ORDER BY count DESC;`)).text
)

// F. customer_documents service_case_id fill rate
section('F: customer_documents service_case_id fill rate')
console.log(
  (await q(`SELECT COUNT(*) AS total_rows, COUNT(service_case_id) AS with_service_case, COUNT(*) - COUNT(service_case_id) AS without_service_case FROM customer_documents;`)).text
)

// G. customer_documents rows hvor service_case_id ikke matcher eksisterende sag
section('G: customer_documents with orphan service_case_id (should be 0 if FK enforced)')
console.log(
  (await q(`SELECT COUNT(*) AS orphan_count FROM customer_documents cd LEFT JOIN service_cases sc ON cd.service_case_id = sc.id WHERE cd.service_case_id IS NOT NULL AND sc.id IS NULL;`)).text
)

// H. service_cases site/party usage
section('H: service_cases party/site usage')
console.log(
  (await q(`SELECT COUNT(*) AS total_rows, COUNT(orderer_customer_id) AS with_orderer, COUNT(end_customer_id) AS with_end_customer, COUNT(payer_customer_id) AS with_payer, COUNT(purchased_from_customer_id) AS with_purchased_from, COUNT(site_customer_id) AS with_site_customer, COUNT(site_contact_id) AS with_site_contact FROM service_cases;`)).text
)

section('H2: service_cases billing_mode distribution')
console.log(
  (await q(`SELECT COALESCE(billing_mode, '(NULL)') AS billing_mode, COUNT(*) AS count FROM service_cases GROUP BY billing_mode ORDER BY count DESC;`)).text
)

// I. customer_documents that look like besigtigelse but stored as 'other' or non-besigtigelse type
section('I: customer_documents that look like besigtigelse (title/file_name/storage_path match)')
console.log(
  (await q(`SELECT document_type, COUNT(*) AS count FROM customer_documents WHERE (LOWER(title) LIKE '%besigtigelse%' OR LOWER(file_name) LIKE '%besigtigelse%' OR LOWER(storage_path) LIKE '%besigtigelse%' OR LOWER(title) LIKE '%inspection%' OR LOWER(file_name) LIKE '%inspection%') GROUP BY document_type ORDER BY count DESC;`)).text
)

section('I2: customer_documents that look like besigtigelse — sample rows (first 10, no secrets)')
console.log(
  (await q(`SELECT id, document_type, LEFT(title, 80) AS title_preview, LEFT(file_name, 80) AS file_name_preview, service_case_id IS NOT NULL AS has_service_case, created_at FROM customer_documents WHERE (LOWER(title) LIKE '%besigtigelse%' OR LOWER(file_name) LIKE '%besigtigelse%' OR LOWER(storage_path) LIKE '%besigtigelse%') ORDER BY created_at DESC LIMIT 10;`)).text
)
