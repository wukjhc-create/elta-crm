/**
 * Fase 3A final review §3 — web-chattens misbrugsværn (server-side; klientens egen begrænsning stoles der aldrig på).
 * Bevidst IKKE 'use server'. Holdbart på tværs af serverless-instanser: tællerne ligger i databasen (00250
 * web_chat_rate_limits via web_chat_rate_check, kun service_role). Nøglen er HMAC-SHA256(RECEPTION_WEBCHAT_RATE_SECRET, IP)
 * — IP'en gemmes og logges aldrig, og nøglen kan ikke vendes til en IP uden hemmeligheden.
 *
 * Grænser (pr. nøgle med mindre andet står):
 *   start ny chat     højst 3/min, 10/time  · globalt 300/time
 *   send besked       højst 8/min, 60/time  · globalt 3000/time
 *   pr. session       højst WEBCHAT_MAX_MESSAGES beskeder, levetid WEBCHAT_SESSION_LIFETIME_MIN minutter
 *   samme tekst igen  inden for WEBCHAT_REPEAT_WINDOW_MIN minutter (ny klient-id) → behandles som gentagelse (intet nyt indtag/svar)
 *   beskedlængde      højst WEBCHAT_MESSAGE_MAX tegn; anmodning højst 8 KB
 * Fejl i værnet ⇒ afvis (fail closed). Svaret er det samme uanset om afsenderen er kunde (intet kunde-orakel).
 */
import { createHmac } from 'crypto'

export const WEBCHAT_LIMITS = {
  start: { burst: 3, hour: 10, globalHour: 300 },
  message: { burst: 8, hour: 60, globalHour: 3000 },
} as const
export type RateScope = keyof typeof WEBCHAT_LIMITS

export const WEBCHAT_SESSION_LIFETIME_MIN = 120
export const WEBCHAT_REPEAT_WINDOW_MIN = 10

/** Første IP i x-forwarded-for (Vercel), ellers x-real-ip. Ukendt ⇒ én fælles, streng spand. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = (headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  const ip = xff || (headers.get('x-real-ip') ?? '').trim()
  return ip && ip.length <= 64 ? ip : 'unknown'
}

/** HMAC af IP'en med serverhemmeligheden (64 hex). null hvis værnet ikke er konfigureret. */
export function abuseKey(ip: string, env: Record<string, string | undefined> = process.env): string | null {
  const secret = (env.RECEPTION_WEBCHAT_RATE_SECRET ?? '').trim()
  if (secret.length < 32) return null
  return createHmac('sha256', secret).update(`webchat-ip:${ip}`, 'utf8').digest('hex')
}

/** Normaliseret tekst til gentagelses-tjek (mellemrum/store bogstaver ignoreres) */
export const normalizeChatText = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()
