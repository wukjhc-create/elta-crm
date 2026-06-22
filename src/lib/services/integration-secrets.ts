/**
 * Integration secret-at-rest.
 *
 * Eksterne integrations-credentials (api_key, api_secret og OAuth-secrets)
 * lagres AES-256-GCM-krypteret i de EKSISTERENDE kolonner paa `integrations`,
 * taggget med en sentinel-prefix. Moenstret er identisk med e-conomic
 * (src/lib/services/economic-client.ts): vi genbruger den samme
 * encrypt()/decrypt()-helper og opfinder ikke et nyt skema.
 *
 *  - Skrivning krypterer kun udfyldte felter (bevar-hvis-tom).
 *  - Laesning til UI maskerer secrets vaek (has_*-flags i stedet).
 *  - Brug (webhooks/eksport/test) dekrypterer kun in-memory.
 *  - Vaerdier UDEN prefix behandles som legacy plaintext (bagudkompatibelt),
 *    saa intet gaar tabt foer engangs-backfillet koeres.
 */

import { encrypt, decrypt } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'
import type { Integration } from '@/types/integrations.types'

const ENC_PREFIX = 'enc:v1:'

/** De felter paa `integrations` der indeholder hemmeligheder. */
export const INTEGRATION_SECRET_FIELDS = [
  'api_key',
  'api_secret',
  'oauth_client_secret',
  'oauth_access_token',
  'oauth_refresh_token',
] as const

export type IntegrationSecretField = (typeof INTEGRATION_SECRET_FIELDS)[number]

/** Krypter en hemmelighed til lagring (prefixet). */
export async function encryptSecret(plaintext: string): Promise<string> {
  return ENC_PREFIX + (await encrypt(plaintext))
}

/** Dekrypter en lagret hemmelighed hvis den baerer sentinel; ellers as-is. */
export async function maybeDecryptSecret(value: string | null): Promise<string | null> {
  if (!value) return value
  if (!value.startsWith(ENC_PREFIX)) return value // legacy plaintext
  try {
    return await decrypt(value.slice(ENC_PREFIX.length))
  } catch (e) {
    // Forkert/manglende ENCRYPTION_KEY eller korrupt ciphertext. Eksponér
    // aldrig den raa vaerdi; behandl som ikke-tilgaengelig.
    logger.error('integration: secret decrypt failed', { error: e })
    return null
  }
}

function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

/**
 * Krypter de udfyldte secret-felter i et create/update-input.
 *
 * - Felt med vaerdi → krypteres (medmindre det allerede er ciphertext).
 * - Felt tomt/whitespace → bevar eksisterende ciphertext (update) eller null
 *   (create). Dette er "bevar-hvis-tom", saa en uaendret edit-form ikke
 *   overskriver en gemt hemmelighed.
 * - Felter der ikke findes i input roeres ikke.
 */
export async function encryptIntegrationSecrets<T extends object>(
  input: T,
  existing?: Partial<Record<IntegrationSecretField, string | null>> | null
): Promise<T> {
  const out = { ...input } as Record<string, unknown>

  for (const field of INTEGRATION_SECRET_FIELDS) {
    if (!(field in out)) continue
    const raw = out[field]
    const value = typeof raw === 'string' ? raw.trim() : raw

    if (typeof value === 'string' && value.length > 0) {
      out[field] = isEncrypted(value) ? value : await encryptSecret(value)
    } else {
      // Tomt felt: behold eksisterende ciphertext, ellers null.
      out[field] = existing?.[field] ?? null
    }
  }

  return out as T
}

/**
 * Returnér en integration-raekke med secret-felterne dekrypteret in-memory.
 * Bruges lige foer der bygges auth-headers til et udgaaende HTTP-kald.
 */
export async function decryptIntegrationSecrets(row: Integration): Promise<Integration> {
  const out: Integration = { ...row }
  for (const field of INTEGRATION_SECRET_FIELDS) {
    out[field] = await maybeDecryptSecret(row[field])
  }
  return out
}

/**
 * Fjern secrets fra en integration-raekke foer den sendes til browseren og
 * tilfoej has_*-flags saa UI'et kan vise om feltet er konfigureret.
 */
export function maskIntegrationSecrets(row: Integration): Integration {
  const out: Integration = { ...row }
  for (const field of INTEGRATION_SECRET_FIELDS) {
    const present = !!row[field]
    out[field] = null
    out[`has_${field}` as keyof Integration] = present as never
  }
  return out
}
