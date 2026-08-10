/**
 * End-to-end data-lag-verifikation af roof_drawings-modulet.
 * Kører nøjagtigt den sti server-actionsene bruger:
 *   1. generér tag-PNG → upload til service-case-files (createRoofDrawing)
 *   2. insert roof_drawings-række (createRoofDrawing)
 *   3. signed URL + fetch (visning i UI)
 *   4. sæt målestok + placér paneler → update (saveRoofDrawing)
 *   5. læs tilbage + kør sags-kortets query (listRoofDrawings by customer)
 *
 * Lader rækken blive stående, så tagfladen kan ses i UI'et på sagen.
 */
import fs from 'fs'
import zlib from 'zlib'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const CUSTOMER_ID = 'eb0a981d-e0aa-45af-acbb-278cf15c858f' // Henrik Christensen
const CASE_NUMBER = 'SVC-01228'

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ---- Minimal PNG-encoder (RGB, color type 2) ----
const CRC_TABLE = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function makePng(w, h) {
  // baggrund lysegrå, centreret "tag"-rektangel i sandfarve
  const raw = Buffer.alloc(h * (1 + w * 3))
  const rx0 = Math.floor(w * 0.15), rx1 = Math.floor(w * 0.85)
  const ry0 = Math.floor(h * 0.2), ry1 = Math.floor(h * 0.8)
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 3)
    raw[rowStart] = 0 // filter byte
    for (let x = 0; x < w; x++) {
      const p = rowStart + 1 + x * 3
      const onRoof = x >= rx0 && x < rx1 && y >= ry0 && y < ry1
      if (onRoof) { raw[p] = 168; raw[p + 1] = 132; raw[p + 2] = 96 }
      else { raw[p] = 222; raw[p + 1] = 226; raw[p + 2] = 230 }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const IMG_W = 800, IMG_H = 600
let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗ FEJL'} ${msg}`); if (!cond) failures++ }

// 1) Upload billede (mirror createRoofDrawing)
const png = makePng(IMG_W, IMG_H)
const storagePath = `roof-drawings/${CUSTOMER_ID}/verify-${Date.now()}.png`
const up = await admin.storage.from('service-case-files').upload(storagePath, png, {
  contentType: 'image/png', upsert: true,
})
ok(!up.error, `upload til service-case-files (${png.length} bytes)` + (up.error ? ` — ${up.error.message}` : ''))

// 2) Hent panel-mål fra solar_products (samme kilde som UI'et)
const { data: panel } = await admin
  .from('solar_products').select('code, specifications')
  .eq('product_type', 'panel').eq('code', 'PANEL-STD').single()
const panelWidthMm = panel?.specifications?.width_mm
const panelHeightMm = panel?.specifications?.height_mm
ok(panelWidthMm === 1722 && panelHeightMm === 1134, `panel-mål fra DB: ${panelWidthMm}×${panelHeightMm} mm`)

// 3) Insert tagflade (mirror createRoofDrawing)
const { data: created, error: insErr } = await admin.from('roof_drawings').insert({
  customer_id: CUSTOMER_ID,
  service_case_id: null, // besigtigelse er kunde-scoped i v1
  title: 'Verifikation — sydtag',
  image_storage_path: storagePath,
  image_width: IMG_W,
  image_height: IMG_H,
  panel_product_code: 'PANEL-STD',
  panel_count: 0,
  drawing_data: { referenceLine: null, mmPerPx: null, panelWidthMm, panelHeightMm, panels: [] },
}).select('*').single()
ok(!insErr && created?.id, 'insert roof_drawings-række' + (insErr ? ` — ${insErr.message}` : ''))

// 4) Signed URL + fetch (visning)
const signed = await admin.storage.from('service-case-files').createSignedUrl(storagePath, 3600)
ok(!!signed.data?.signedUrl, 'signed URL genereret')
const imgRes = await fetch(signed.data.signedUrl)
ok(imgRes.status === 200, `fetch billede via signed URL → HTTP ${imgRes.status}`)

// 5) Sæt målestok + placér paneler (mirror editor + saveRoofDrawing)
// Referencelinje: 400 px langs taget = 5,0 m → mmPerPx = 5000/400 = 12,5
const refLine = { x1: 120, y1: 120, x2: 520, y2: 120, realLengthMeters: 5 }
const mmPerPx = (refLine.realLengthMeters * 1000) / Math.hypot(refLine.x2 - refLine.x1, refLine.y2 - refLine.y1)
const pw = panelWidthMm / mmPerPx
const ph = panelHeightMm / mmPerPx
ok(Math.abs(mmPerPx - 12.5) < 0.001, `mmPerPx = ${mmPerPx.toFixed(2)} (forventet 12,50)`)
ok(Math.abs(pw - 137.76) < 0.5 && Math.abs(ph - 90.72) < 0.5,
  `panel-px = ${pw.toFixed(1)}×${ph.toFixed(1)} (1722/1134 mm ÷ 12,5)`)

// 3×2 grid af paneler på taget
const panels = []
const startX = 130, startY = 160, gap = 6
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
  panels.push({ id: `p_${r}_${c}`, x: startX + c * (pw + gap), y: startY + r * (ph + gap), rotation: 0 })
}
const allFit = panels.every((p) => p.x >= 0 && p.y >= 0 && p.x + pw <= IMG_W && p.y + ph <= IMG_H)
ok(allFit, `alle ${panels.length} paneler ligger inden for billedet`)

const { data: saved, error: saveErr } = await admin.from('roof_drawings').update({
  panel_count: panels.length,
  drawing_data: { referenceLine: refLine, mmPerPx, panelWidthMm, panelHeightMm, panels },
}).eq('id', created.id).select('*').single()
ok(!saveErr && saved?.panel_count === 6, `saveRoofDrawing → panel_count = ${saved?.panel_count}`)
ok(saved?.drawing_data?.mmPerPx === mmPerPx && saved?.drawing_data?.panels?.length === 6,
  'drawing_data (målestok + 6 paneler) persisteret i JSONB')

// 6) Sags-kortets query: listRoofDrawings by customer
const { data: list } = await admin.from('roof_drawings').select('*')
  .eq('customer_id', CUSTOMER_ID).order('created_at', { ascending: true })
const total = (list || []).reduce((s, d) => s + (d.panel_count || 0), 0)
ok((list || []).some((d) => d.id === created.id), 'tagfladen findes i kunde-query (sags-kortet)')
console.log(`\nKundens tagtegninger: ${list.length} stk, ${total} paneler i alt`)

console.log(`\n${failures === 0 ? '✅ ALLE TJEK BESTÅET' : `❌ ${failures} TJEK FEJLEDE`}`)
console.log(`Åbn i UI: /dashboard/orders/a26e3c7e-66d5-44c8-a334-a669fabb4fae  (${CASE_NUMBER}, fanen Dokumenter)`)
console.log(`Tegnings-id: ${created?.id}`)
process.exit(failures === 0 ? 0 : 1)
