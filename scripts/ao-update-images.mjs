/**
 * Update AO products with image URLs from QuickSearch
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://guhsjwewajyonehivffc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aHNqd2V3YWp5b25laGl2ZmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTM2Nzg1NCwiZXhwIjoyMDg0OTQzODU0fQ.KO0wMpDusaGYJcFYPiz8PadDlJSLUTnUB1c4DliTTr0'
)

const AO_SUPPLIER_ID = 'd7ae5f5f-1af5-4f8d-823b-30707c16ddb1'

let cookies = {}
function parseCookies(headers) {
  for (const c of headers.getSetCookie?.() || []) {
    const [kv] = c.split(';')
    const eq = kv.indexOf('=')
    if (eq > 0) cookies[kv.substring(0, eq).trim()] = kv.substring(eq + 1).trim()
  }
}
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function aoFetch(path, options = {}) {
  const resp = await fetch(`https://ao.dk${path}`, {
    ...options,
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookieHeader(), ...options.headers },
    signal: AbortSignal.timeout(30000),
  })
  parseCookies(resp.headers)
  return resp.json()
}

async function main() {
  console.log('=== Opdaterer AO produkter med billeder ===')

  // Login
  const pageResp = await fetch('https://ao.dk/kunde/log-ind-side', { signal: AbortSignal.timeout(10000) })
  parseCookies(pageResp.headers)
  const login = await aoFetch('/api/bruger/ValiderBruger', {
    method: 'POST',
    body: JSON.stringify({ Brugernavn: 'JHLC', Password: 'Eltasolar2025', HuskLogin: true, LoginKanal: 'Web' }),
  })
  if (!login.Status) { console.error('Login fejlede'); process.exit(1) }
  console.log('Login OK')

  // Get all products without image
  const { data: products } = await sb.from('supplier_products')
    .select('id, supplier_sku')
    .eq('supplier_id', AO_SUPPLIER_ID)
    .is('image_url', null)
    .limit(2000)

  console.log(`${products.length} produkter mangler billede`)

  // Batch search - 50 at a time via QuickSearch by varenr
  let updated = 0
  const batchSize = 50

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const skus = batch.map(p => p.supplier_sku)

    // Search each SKU individually via EnkeltProdukt (has ImageUrlMedium)
    for (const product of batch) {
      try {
        const detail = await aoFetch(`/api/Soeg/EnkeltProdukt?varenr=${product.supplier_sku}`)
        if (detail && detail.ImageUrlMedium) {
          await sb.from('supplier_products')
            .update({ image_url: detail.ImageUrlMedium })
            .eq('id', product.id)
          updated++
        }
      } catch (err) {
        // skip
      }
    }
    console.log(`  ${Math.min(i + batchSize, products.length)}/${products.length} — ${updated} billeder opdateret`)
  }

  console.log('')
  console.log(`DONE: ${updated} produkter opdateret med billeder`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
