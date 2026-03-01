/**
 * AO Product Sync Script — Full Import
 *
 * 1. Login til ao.dk med session cookie
 * 2. Søg produkter via /api/Soeg/QuickSearch
 * 3. Hent nettopriser via /api/Pris/HentPriserForKonto
 * 4. Importér til supplier_products i Supabase
 */
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

const SUPABASE_URL = 'https://guhsjwewajyonehivffc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aHNqd2V3YWp5b25laGl2ZmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTM2Nzg1NCwiZXhwIjoyMDg0OTQzODU0fQ.KO0wMpDusaGYJcFYPiz8PadDlJSLUTnUB1c4DliTTr0'
const ENCRYPTION_KEY = 'B9YHoaoOlbyJM+6ppdbd9XzsKE86YHwJ+r4Z/zSoD5U='
const AO_SUPPLIER_ID = 'd7ae5f5f-1af5-4f8d-823b-30707c16ddb1'
const AO_BASE = 'https://ao.dk'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---- Decrypt credentials ----
async function decryptCredentials(enc) {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(ENCRYPTION_KEY, 'base64'), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const combined = Buffer.from(enc, 'base64')
  const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.subarray(0, 12), tagLength: 128 }, key, combined.subarray(12))
  return JSON.parse(new TextDecoder().decode(dec))
}

// ---- Cookie jar (simple) ----
let cookies = {}
function parseCookies(headers) {
  const setCookie = headers.getSetCookie?.() || []
  for (const c of setCookie) {
    const [kv] = c.split(';')
    const [k, v] = kv.split('=')
    if (k && v) cookies[k.trim()] = v.trim()
  }
}
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

// ---- AO API helpers ----
async function aoFetch(path, options = {}) {
  const resp = await fetch(`${AO_BASE}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookieHeader(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(30000),
  })
  parseCookies(resp.headers)
  return resp
}

async function aoLogin(username, password) {
  // First get session
  const pageResp = await fetch(`${AO_BASE}/kunde/log-ind-side`, { signal: AbortSignal.timeout(10000) })
  parseCookies(pageResp.headers)

  const resp = await aoFetch('/api/bruger/ValiderBruger', {
    method: 'POST',
    body: JSON.stringify({ Brugernavn: username, Password: password, HuskLogin: true, LoginKanal: 'Web' }),
  })
  const data = await resp.json()
  return data.Status === true
}

async function aoSearch(query, start = 1, stop = 50) {
  const resp = await aoFetch(`/api/Soeg/QuickSearch?q=${encodeURIComponent(query)}&a=&start=${start}&stop=${stop}`)
  return resp.json()
}

async function aoGetPrices(varenumre) {
  // Get account info
  const userResp = await aoFetch('/api/bruger/GetLoggedInUsernameAndPriceAccount')
  const { PriceAccount } = await userResp.json()

  // Batch prices (max 50 at a time)
  const allPrices = new Map()
  for (let i = 0; i < varenumre.length; i += 50) {
    const batch = varenumre.slice(i, i + 50)
    const resp = await aoFetch(`/api/Pris/HentPriserForKonto?kontonummer=${PriceAccount}`, {
      method: 'POST',
      body: JSON.stringify(batch),
    })
    const prices = await resp.json()
    if (Array.isArray(prices)) {
      for (const p of prices) {
        allPrices.set(p.Varenr, p)
      }
    }
  }
  return allPrices
}

// ---- MAIN ----
async function main() {
  const startTime = Date.now()
  console.log('=== AO FULL PRODUCT SYNC ===')
  console.log('')

  // 1. Get & decrypt credentials
  const { data: cred } = await sb.from('supplier_credentials')
    .select('credentials_encrypted').eq('supplier_id', AO_SUPPLIER_ID).eq('is_active', true).maybeSingle()
  if (!cred) { console.error('No AO credentials found'); process.exit(1) }

  const credentials = await decryptCredentials(cred.credentials_encrypted)
  console.log(`1. Credentials: ${credentials.username}`)

  // 2. Login
  const loggedIn = await aoLogin(credentials.username, credentials.password)
  if (!loggedIn) { console.error('Login failed!'); process.exit(1) }
  console.log('2. Login OK')

  // 3. Search for products (multiple categories)
  const searchTerms = [
    'kabel', 'ledning', 'stikdåse', 'kontakt', 'afbryder',
    'sikring', 'automatsikring', 'fejlstrøm', 'HPFI',
    'inverter', 'solcelle', 'solpanel',
    'dåse', 'samledåse', 'muffe', 'klæmme',
    'tavle', 'gruppetavle', 'skinne',
    'lampe', 'spot', 'LED', 'armatur',
    'stik', 'stikkontakt', 'CEE',
    'rør', 'flexrør', 'tomrør',
    'måler', 'energimåler',
  ]

  const productMap = new Map() // varenr -> product

  for (const term of searchTerms) {
    try {
      const result = await aoSearch(term, 1, 50)
      const products = result.Produkter || []
      let newCount = 0
      for (const p of products) {
        if (!productMap.has(p.Varenr)) {
          productMap.set(p.Varenr, p)
          newCount++
        }
      }
      if (newCount > 0) console.log(`   "${term}" → ${products.length} hits, ${newCount} nye`)
    } catch (err) {
      console.log(`   "${term}" → FEJL: ${err.message}`)
    }
  }

  console.log(`3. Søgning færdig: ${productMap.size} unikke produkter`)

  // 4. Fetch prices in batches
  const allVarenumre = Array.from(productMap.keys())
  console.log('4. Henter priser...')
  const prices = await aoGetPrices(allVarenumre)
  console.log(`   ${prices.size} priser hentet`)

  // 5. Import to Supabase
  console.log('5. Importerer til database...')
  let imported = 0, updated = 0, errors = 0

  for (const [varenr, product] of productMap) {
    const price = prices.get(varenr)
    const costPrice = price?.DinPris || 0
    const listPrice = price?.Listepris || null

    const record = {
      supplier_id: AO_SUPPLIER_ID,
      supplier_sku: varenr,
      supplier_name: product.Name,
      cost_price: costPrice,
      list_price: listPrice,
      unit: product.Maalingsenhed || 'STK',
      is_available: product.Livscyklus === 'A',
      ean: (product.EAN || '').split('|')[0] || null,
      category: product.Forretningsomraade || 'el',
      image_url: product.ImageUrlMedium || null,
      last_synced_at: new Date().toISOString(),
    }

    try {
      const { data: existing } = await sb.from('supplier_products')
        .select('id').eq('supplier_id', AO_SUPPLIER_ID).eq('supplier_sku', varenr).maybeSingle()

      if (existing) {
        await sb.from('supplier_products').update({
          supplier_name: record.supplier_name,
          cost_price: record.cost_price,
          list_price: record.list_price,
          unit: record.unit,
          is_available: record.is_available,
          ean: record.ean,
          category: record.category,
          image_url: record.image_url,
          last_synced_at: record.last_synced_at,
        }).eq('id', existing.id)
        updated++
      } else {
        const { error: insertErr } = await sb.from('supplier_products').insert(record)
        if (insertErr) { errors++; continue }
        imported++
      }
    } catch (err) {
      errors++
    }
  }

  // 6. Log sync
  const durationMs = Date.now() - startTime
  await sb.from('supplier_sync_logs').insert({
    supplier_id: AO_SUPPLIER_ID,
    job_type: 'full_import',
    status: errors === 0 ? 'completed' : 'partial',
    trigger_type: 'manual',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: durationMs,
    total_items: productMap.size,
    processed_items: imported + updated,
    updated_items: updated,
    price_changes_count: imported,
    error_message: errors > 0 ? `${errors} fejl` : null,
  })

  console.log('')
  console.log('=== RESULTAT ===')
  console.log(`Importeret: ${imported} nye produkter`)
  console.log(`Opdateret:  ${updated} eksisterende`)
  console.log(`Fejl:       ${errors}`)
  console.log(`Tid:        ${(durationMs / 1000).toFixed(1)}s`)

  const { count } = await sb.from('supplier_products')
    .select('id', { count: 'exact', head: true }).eq('supplier_id', AO_SUPPLIER_ID)
  console.log(`Total AO produkter i DB: ${count}`)
  console.log('')
  console.log('SUCCESS')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
