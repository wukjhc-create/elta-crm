/**
 * IV2-3 (inputvaliderings-review 2026-10-18): tilbudslinjens image_url blev hentet direkte af PDF-renderen
 * (@react-pdf/renderer) — enhver URL: http, localhost/interne adresser (SSRF fra serveren, også via portalens
 * PDF-route), lokale filstier, og uden timeout (en langsom vært hang hele PDF-genereringen).
 *
 * Nu henter vi selv billederne før rendering: kun https til offentlige værter (samme vagt som webhooks, inkl.
 * DNS-tjek), ingen omdirigeringer, 5 s timeout, max 2 MB, kun PNG/JPEG (det react-pdf kan). Resultatet indlejres som
 * data-URI; alt andet bliver til "intet billede" — PDF'en fejler aldrig pga. et billede. Bevidst IKKE 'use server'.
 */
import { assertWebhookUrlAllowed } from '@/lib/integrations/webhook-url-guard'
import { logger } from '@/lib/utils/logger'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 5_000
const MAX_IMAGES = 60
const CONCURRENCY = 4
const DATA_URI_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/

function sniffImageType(buf: Uint8Array): 'png' | 'jpeg' | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  return null
}

/** Henter ét billede sikkert; null ved enhver afvisning/fejl. */
export async function fetchPdfImageAsDataUri(raw: string): Promise<string | null> {
  const src = String(raw ?? '').trim()
  if (!src) return null
  if (src.startsWith('data:')) return DATA_URI_RE.test(src) && src.length <= MAX_BYTES * 1.4 ? src : null
  try {
    await assertWebhookUrlAllowed(src)
  } catch {
    return null
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(src, { redirect: 'error', signal: ctrl.signal, headers: { Accept: 'image/png,image/jpeg' } })
    if (!res.ok || !res.body) return null
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_BYTES) return null
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); return null }
      chunks.push(value)
    }
    const buf = Buffer.concat(chunks)
    const kind = sniffImageType(buf)
    if (!kind) return null
    return `data:image/${kind};base64,${buf.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Erstatter image_url på hver linje med et indlejret billede (eller null). Muterer ikke input. Samme URL hentes kun
 * én gang; højst MAX_IMAGES forskellige billeder pr. PDF.
 */
export async function inlinePdfLineImages<T extends { image_url?: string | null }>(lines: T[] | null | undefined): Promise<T[]> {
  const list = Array.isArray(lines) ? lines : []
  const urls = [...new Set(list.map((l) => String(l?.image_url ?? '').trim()).filter(Boolean))]
  const resolved = new Map<string, string | null>()
  const queue = urls.slice(0, MAX_IMAGES)
  let blocked = urls.length - queue.length
  const worker = async () => {
    for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
      const v = await fetchPdfImageAsDataUri(u)
      if (!v) blocked++
      resolved.set(u, v)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  if (blocked) logger.warn('PDF: produktbilleder udeladt (afvist/utilgængelig)', { metadata: { count: blocked, total: urls.length } })
  return list.map((l) => {
    const u = String(l?.image_url ?? '').trim()
    return u ? { ...l, image_url: resolved.get(u) ?? null } : l
  })
}
