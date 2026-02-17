/**
 * Test: FTP Sync Pipeline
 *
 * Tests the full FTP → parse → product flow using a mock AO CSV file.
 * Does NOT require an actual FTP server — tests the parsing and
 * orchestrator logic only.
 *
 * Usage: node scripts/test-ftp-sync.mjs
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// =====================================================
// Test Utilities
// =====================================================

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${message}`)
  }
}

function assertRange(value, min, max, message) {
  assert(value >= min && value <= max, `${message} (got ${value}, expected ${min}-${max})`)
}

// =====================================================
// Test 1: Mock CSV Parsing (AO format)
// =====================================================

console.log('\n=== Test 1: AO CSV Parsing ===')

const csvContent = readFileSync(join(__dirname, 'mock-ao-catalog.csv'), 'utf-8')
const lines = csvContent.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim())

assert(lines.length === 16, `CSV has 16 lines (header + 15 products): got ${lines.length}`)

// Parse header
const headers = lines[0].split(';')
assert(headers.includes('Varenummer'), 'Header has Varenummer column')
assert(headers.includes('Indkøbspris'), 'Header has Indkøbspris column')
assert(headers.includes('Vejl. udsalgspris'), 'Header has Vejl. udsalgspris column')
assert(headers.includes('Varegruppe'), 'Header has Varegruppe column')

// =====================================================
// Test 2: Danish Number Parsing
// =====================================================

console.log('\n=== Test 2: Danish Number Parsing ===')

function parseDanishNumber(value) {
  if (!value || value.trim() === '') return null
  let cleaned = value.trim()
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '')
    cleaned = cleaned.replace(',', '.')
  }
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

// Test cases from the mock CSV
assert(parseDanishNumber('45,50') === 45.50, 'Parse 45,50 → 45.50')
assert(parseDanishNumber('289,00') === 289.00, 'Parse 289,00 → 289.00')
assert(parseDanishNumber('1.245,00') === 1245.00, 'Parse 1.245,00 → 1245.00')
assert(parseDanishNumber('8.750,00') === 8750.00, 'Parse 8.750,00 → 8750.00')
assert(parseDanishNumber('16.500,00') === 16500.00, 'Parse 16.500,00 → 16500.00')
assert(parseDanishNumber('') === null, 'Parse empty → null')
assert(parseDanishNumber('0') === 0, 'Parse 0 → 0')

// =====================================================
// Test 3: AO SKU Normalization
// =====================================================

console.log('\n=== Test 3: AO SKU Normalization ===')

function normalizeAoSku(rawSku) {
  let sku = rawSku.trim()
  if (sku.startsWith('AO-')) {
    sku = sku.substring(3)
  }
  sku = sku.replace(/^0+(?=\d)/, '')
  return sku
}

assert(normalizeAoSku('AO-001234') === '1234', 'AO-001234 → 1234')
assert(normalizeAoSku('AO-001235') === '1235', 'AO-001235 → 1235')
assert(normalizeAoSku('123456') === '123456', '123456 → 123456 (no prefix)')
assert(normalizeAoSku('AO-0') === '0', 'AO-0 → 0 (keep single zero)')

// =====================================================
// Test 4: Category Mapping
// =====================================================

console.log('\n=== Test 4: AO Category Mapping ===')

const AO_CATEGORY_MAP = {
  'Stikdåser': 'Stikdåser',
  'Afbrydere': 'Afbrydere',
  'LED-belysning': 'LED Belysning',
  'Automatsikringer': 'Automatsikringer',
  'Fejlstrømsafbrydere': 'Sikkerhed',
  'Kabelrør': 'Kabelføring',
  'Installationskabler': 'Kabler',
  'Kontakter': 'Kontakter',
  'DIN-skinner': 'Tavler',
  'Kabelkanaler': 'Kabelføring',
  'Solcellepaneler': 'Solceller',
  'Invertere': 'Invertere',
  'Ladestandere': 'Elbil',
  'Overspaendingsbeskyttelse': 'Sikkerhed',
}

function mapCategory(raw) {
  return AO_CATEGORY_MAP[raw] || raw
}

assert(mapCategory('Stikdåser') === 'Stikdåser', 'Stikdåser → Stikdåser')
assert(mapCategory('LED-belysning') === 'LED Belysning', 'LED-belysning → LED Belysning')
assert(mapCategory('Fejlstrømsafbrydere') === 'Sikkerhed', 'Fejlstrømsafbrydere → Sikkerhed')
assert(mapCategory('Installationskabler') === 'Kabler', 'Installationskabler → Kabler')
assert(mapCategory('Ladestandere') === 'Elbil', 'Ladestandere → Elbil')
assert(mapCategory('Ukendt') === 'Ukendt', 'Unknown category passes through')

// =====================================================
// Test 5: Full Row Parsing
// =====================================================

console.log('\n=== Test 5: Full Row Parsing ===')

function parseCSVLine(line, delimiter = ';') {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseAoRow(line, headers) {
  const fields = parseCSVLine(line)
  const row = {}
  headers.forEach((h, i) => { row[h] = fields[i] || '' })
  return {
    sku: normalizeAoSku(row['Varenummer'] || ''),
    name: row['Beskrivelse'] || '',
    cost_price: parseDanishNumber(row['Indkøbspris']),
    list_price: parseDanishNumber(row['Vejl. udsalgspris']),
    unit: row['Enhed'] || 'stk',
    category: mapCategory(row['Varegruppe'] || ''),
    ean: row['EAN'] || null,
    manufacturer: row['Leverandør'] || null,
  }
}

const parsedHeaders = parseCSVLine(lines[0])

// Parse first data row (Schuko stikdåse)
const row1 = parseAoRow(lines[1], parsedHeaders)
assert(row1.sku === '1234', `Row 1 SKU: ${row1.sku}`)
assert(row1.name === 'Schuko stikdåse 230V hvid', `Row 1 name: ${row1.name}`)
assert(row1.cost_price === 45.50, `Row 1 cost: ${row1.cost_price}`)
assert(row1.list_price === 89.00, `Row 1 list: ${row1.list_price}`)
assert(row1.unit === 'stk', `Row 1 unit: ${row1.unit}`)
assert(row1.category === 'Stikdåser', `Row 1 category: ${row1.category}`)
assert(row1.ean === '5703302001234', `Row 1 EAN: ${row1.ean}`)
assert(row1.manufacturer === 'Schneider Electric', `Row 1 manufacturer: ${row1.manufacturer}`)

// Parse cable row (1.245,00 price)
const row7 = parseAoRow(lines[7], parsedHeaders)
assert(row7.sku === '1240', `Cable row SKU: ${row7.sku}`)
assert(row7.cost_price === 1245.00, `Cable row cost: ${row7.cost_price}`)
assert(row7.list_price === 2350.00, `Cable row list: ${row7.list_price}`)
assert(row7.category === 'Kabler', `Cable row category: ${row7.category}`)
assert(row7.unit === 'rl', `Cable row unit: ${row7.unit}`)

// Parse solar panel (highest-value item)
const row11 = parseAoRow(lines[11], parsedHeaders)
assert(row11.sku === '1244', `Solar row SKU: ${row11.sku}`)
assert(row11.cost_price === 1850.00, `Solar row cost: ${row11.cost_price}`)
assert(row11.category === 'Solceller', `Solar row category: ${row11.category}`)

// Parse inverter (8.750,00)
const row12 = parseAoRow(lines[12], parsedHeaders)
assert(row12.cost_price === 8750.00, `Inverter cost: ${row12.cost_price}`)
assert(row12.category === 'Invertere', `Inverter category: ${row12.category}`)

// =====================================================
// Test 6: All Rows Parse Successfully
// =====================================================

console.log('\n=== Test 6: Full Catalog Parsing ===')

const allRows = []
for (let i = 1; i < lines.length; i++) {
  allRows.push(parseAoRow(lines[i], parsedHeaders))
}

assert(allRows.length === 15, `Parsed ${allRows.length} product rows`)
assert(allRows.every(r => r.sku), 'All rows have SKU')
assert(allRows.every(r => r.name), 'All rows have name')
assert(allRows.every(r => r.cost_price !== null), 'All rows have cost price')
assert(allRows.every(r => r.list_price !== null), 'All rows have list price')
assert(allRows.every(r => r.ean), 'All rows have EAN')

// Verify price ranges
const costs = allRows.map(r => r.cost_price)
const minCost = Math.min(...costs)
const maxCost = Math.max(...costs)
assert(minCost === 12.50, `Min cost price: ${minCost}`)
assert(maxCost === 8750.00, `Max cost price: ${maxCost}`)

// Verify unique categories
const categories = [...new Set(allRows.map(r => r.category))]
assert(categories.length >= 10, `${categories.length} unique categories mapped`)

// =====================================================
// Test 7: FTP Credential Builder
// =====================================================

console.log('\n=== Test 7: FTP Credential Builder ===')

function buildFtpCredentials(decryptedCreds, supplierCode) {
  let host = decryptedCreds.api_endpoint || ''
  let port = 21
  if (host.includes(':')) {
    const parts = host.split(':')
    host = parts[0]
    const parsed = parseInt(parts[1], 10)
    if (!isNaN(parsed)) port = parsed
  }
  if (!host) throw new Error(`No FTP host configured for supplier ${supplierCode}`)
  if (!decryptedCreds.username || !decryptedCreds.password) {
    throw new Error(`Missing FTP username/password for supplier ${supplierCode}`)
  }
  return { host, port, username: decryptedCreds.username, password: decryptedCreds.password, secure: false, passive: true }
}

// Test with simple host
const creds1 = buildFtpCredentials({ username: 'user', password: 'pass', api_endpoint: 'ftp.ao.dk' }, 'AO')
assert(creds1.host === 'ftp.ao.dk', `FTP host: ${creds1.host}`)
assert(creds1.port === 21, `FTP port default: ${creds1.port}`)
assert(creds1.username === 'user', 'FTP username preserved')

// Test with host:port
const creds2 = buildFtpCredentials({ username: 'u', password: 'p', api_endpoint: 'ftp.lm.dk:2121' }, 'LM')
assert(creds2.host === 'ftp.lm.dk', `FTP host parsed: ${creds2.host}`)
assert(creds2.port === 2121, `FTP port parsed: ${creds2.port}`)

// Test error cases
let caught = false
try { buildFtpCredentials({ username: 'u', password: 'p' }, 'AO') } catch { caught = true }
assert(caught, 'Throws when no host configured')

caught = false
try { buildFtpCredentials({ api_endpoint: 'ftp.ao.dk' }, 'AO') } catch { caught = true }
assert(caught, 'Throws when no username/password')

// =====================================================
// Test 8: Price Change Detection
// =====================================================

console.log('\n=== Test 8: Price Change Detection ===')

function detectPriceChanges(newRows, existingProducts) {
  const changes = []
  for (const row of newRows) {
    const existing = existingProducts.get(row.sku)
    if (!existing) continue
    if (existing.cost_price !== null && row.cost_price !== null && existing.cost_price !== row.cost_price) {
      const pct = existing.cost_price > 0 ? ((row.cost_price - existing.cost_price) / existing.cost_price) * 100 : 0
      changes.push({
        sku: row.sku,
        old_price: existing.cost_price,
        new_price: row.cost_price,
        change_pct: Math.round(pct * 100) / 100,
      })
    }
  }
  return changes
}

// Simulate existing products with different prices
const existingMap = new Map([
  ['1234', { cost_price: 42.00, list_price: 85.00 }],  // Stikdåse was 42, now 45.50
  ['1237', { cost_price: 28.90, list_price: 56.00 }],  // Automatsikring unchanged
  ['1244', { cost_price: 1700.00, list_price: 3200.00 }], // Solar was 1700, now 1850
  ['1245', { cost_price: 9000.00, list_price: 17000.00 }], // Inverter was 9000, now 8750 (decrease)
])

const changes = detectPriceChanges(allRows, existingMap)
assert(changes.length === 3, `${changes.length} price changes detected`)

const stikChange = changes.find(c => c.sku === '1234')
assert(stikChange.old_price === 42.00, `Stikdåse old price: ${stikChange.old_price}`)
assert(stikChange.new_price === 45.50, `Stikdåse new price: ${stikChange.new_price}`)
assertRange(stikChange.change_pct, 8, 9, 'Stikdåse change ~8.33%')

const solarChange = changes.find(c => c.sku === '1244')
assertRange(solarChange.change_pct, 8, 9, 'Solar panel change ~8.82%')

const inverterChange = changes.find(c => c.sku === '1245')
assert(inverterChange.change_pct < 0, `Inverter price decreased: ${inverterChange.change_pct}%`)
assertRange(inverterChange.change_pct, -3, -2, 'Inverter change ~-2.78%')

// =====================================================
// Summary
// =====================================================

console.log('\n' + '='.repeat(50))
console.log(`FTP Sync Pipeline Tests: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}
