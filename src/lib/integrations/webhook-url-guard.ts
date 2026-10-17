/**
 * SEC2-2 (security-review 2026-10-17): udgående webhooks sender dekrypterede API-nøgler i headers. Før blev enhver
 * URL kaldt (http, localhost, interne adresser) → nøgle-tyveri ved omdirigering og SSRF mod interne tjenester.
 * Kun https til offentlige værter; DNS-opslaget tjekkes også (ingen privat/loopback-adresse bag et offentligt navn).
 * Bevidst IKKE 'use server'.
 */
import { isIP } from 'node:net'

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map((x) => Number(x))
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

function ipv6Private(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (s === '::' || s === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (mapped) return ipv4Private(mapped[1])
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s)
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip.replace(/^\[|\]$/g, ''))
  if (v === 4) return ipv4Private(ip)
  if (v === 6) return ipv6Private(ip)
  return false
}

/** Syntaktisk tjek (ingen DNS) — bruges ved oprettelse/redigering. null = ok, ellers dansk årsag. */
export function webhookUrlBlockReason(raw: string): string | null {
  let u: URL
  try {
    u = new URL(String(raw ?? '').trim())
  } catch {
    return 'Ugyldig URL'
  }
  if (u.protocol !== 'https:') return 'Webhook-URL skal bruge https'
  if (u.username || u.password) return 'Webhook-URL må ikke indeholde brugernavn/adgangskode'
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'Webhook-URL skal pege på en offentlig adresse'
  }
  if (isIP(host) && isPrivateAddress(host)) return 'Webhook-URL skal pege på en offentlig adresse'
  return null
}

/** Fuldt tjek før afsendelse: syntaks + DNS-opslag (alle adresser skal være offentlige). */
export async function assertWebhookUrlAllowed(raw: string): Promise<void> {
  const reason = webhookUrlBlockReason(raw)
  if (reason) throw new Error(reason)
  const host = new URL(String(raw).trim()).hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return
  const { lookup } = await import('node:dns/promises')
  const addrs = await lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Webhook-URL skal pege på en offentlig adresse')
  }
}
