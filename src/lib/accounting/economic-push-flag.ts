/**
 * Henrik 2026-10-15 (PR-2): kill-switch for e-conomic. Standard = SLÅET FRA. Kun `ECONOMIC_PUSH_ENABLED=true` (præcis)
 * tillader at systemet skriver til e-conomic (kunder, fakturakladder/bogføring, betalinger, leverandørfakturaer).
 * Læse-kald (forbindelsestest, opslag) er tilladt. Aktivering kræver særskilt godkendelse fra Henrik.
 * Bevidst IKKE 'use server' — ren funktion, bruges af economic-client og UI-status.
 */
export const ECONOMIC_PUSH_ENV = 'ECONOMIC_PUSH_ENABLED'

export function economicPushEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env[ECONOMIC_PUSH_ENV] ?? '').trim().toLowerCase() === 'true'
}

/** Skrivende HTTP-metoder blokeres når flaget er fra — GET er altid tilladt */
export function economicRequestAllowed(method: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const m = (method ?? 'GET').toUpperCase()
  return m === 'GET' || economicPushEnabled(env)
}

export const ECONOMIC_PUSH_DISABLED_CODE = 'ECONOMIC_PUSH_DISABLED'
export const ECONOMIC_PUSH_DISABLED_TEXT = 'e-conomic-integrationen er sat på pause — intet sendes til e-conomic (ECONOMIC_PUSH_ENABLED er ikke slået til).'
