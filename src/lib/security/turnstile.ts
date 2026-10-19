/**
 * API-3 (Henrik 2026-10-19): Cloudflare Turnstile som permanent beskyttelse af den offentlige kontaktformular (i stedet
 * for et delt timeloft eller lagring af hashede IP'er). BLOCKED_CONFIGURATION: aktiveres FØRST når både
 *   CONTACT_TURNSTILE_ENFORCE=true  og  TURNSTILE_SECRET_KEY  er sat (og hjemmesiden sender tokenet).
 * Uden konfiguration: ingen ændring (nuværende sikre adfærd). Bevidst IKKE 'use server'.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileEnforced(): boolean {
  return process.env.CONTACT_TURNSTILE_ENFORCE === 'true' && !!process.env.TURNSTILE_SECRET_KEY
}

/** true = gyldigt token (eller håndhævelse slået fra). Fejl/timeout = false (fail-closed når håndhævet). */
export async function verifyTurnstileToken(token: unknown, remoteIp?: string | null): Promise<boolean> {
  if (!turnstileEnforced()) return true
  const t = typeof token === 'string' ? token.trim() : ''
  if (!t || t.length > 2048) return false
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY as string, response: t })
  if (remoteIp) body.set('remoteip', remoteIp)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5_000)
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: ctrl.signal })
    if (!res.ok) return false
    const json = (await res.json()) as { success?: boolean }
    return json.success === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
