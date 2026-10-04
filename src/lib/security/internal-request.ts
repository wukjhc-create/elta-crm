/**
 * Server-til-server-kald til egne API-ruter (fx PDF-rendering fra server actions).
 *
 * Sikkerhedsreview Q10: /api/fuldmagt/pdf og /api/besigtigelse/pdf var åbne for alle — enhver kunne lave en Elta-
 * fuldmagt/-rapport med vilkårligt indhold, og billedfelterne gik direkte i react-pdf's <Image src> (kan hente URL'er →
 * blind SSRF). Ruterne kræver nu CRON_SECRET (fail-closed, timing-safe) og accepterer kun billeder som data-URL.
 * Bevidst IKKE 'use server'.
 */
import { timingSafeEqual } from 'crypto'

/** Headers et internt kald skal sende. */
export function internalRequestHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` }
}

/** Fail-closed: uden CRON_SECRET afvises alt. */
export function isInternalRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}

const DATA_IMAGE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]*$/

/** Kun indlejrede PNG/JPEG-billeder — aldrig URL'er eller filstier (react-pdf henter dem). Tomt/manglende er OK. */
export function isSafeImageSource(src: unknown): boolean {
  return src === undefined || src === null || src === '' || (typeof src === 'string' && DATA_IMAGE.test(src))
}
