/**
 * Leverandør-credentials — SERVER-ONLY hemmeligheds-adgang (restrisiko R3).
 *
 * De krypterede kolonner (credentials_encrypted, access_token_encrypted, refresh_token_encrypted) kan ikke læses af
 * authenticated/anon (kolonne-grants, migration 00161). Al læsning af hemmeligheder sker her via service-role, og det
 * dekrypterede resultat returneres KUN til server-kode (API-klienter, forbindelsestest) — aldrig til browseren.
 *
 * Denne fil er bevidst IKKE en 'use server'-fil: dens funktioner kan ikke kaldes som server actions.
 * Kalderen er ansvarlig for permission-gaten (fx settings.suppliers) før den kalder herind.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredentials, isEncryptionConfigured } from '@/lib/utils/encryption'
import type { ActionResult } from '@/types/common.types'

/** Ikke-hemmelige kolonner som authenticated må læse (kolonne-grant i 00161). */
export const SUPPLIER_CREDENTIAL_PUBLIC_COLUMNS =
  'id, supplier_id, credential_type, api_endpoint, is_active, last_test_at, last_test_status, last_test_error, environment, notes, created_by, created_at, updated_at'

export type SecretCredentialType = 'api' | 'ftp' | 'web'

export interface DecryptedCredentialInput {
  username?: string
  password?: string
  api_key?: string
  client_id?: string
  client_secret?: string
  customer_number?: string
  price_list_code?: string
  host?: string
}

/** Aktive credentials for en leverandør/type, dekrypteret. Kun til server-kode. */
export async function loadDecryptedSupplierCredentials(
  supplierId: string,
  credentialType: SecretCredentialType = 'api',
): Promise<ActionResult<DecryptedCredentialInput & { api_endpoint?: string }>> {
  if (!isEncryptionConfigured()) return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
  const { data, error } = await createAdminClient()
    .from('supplier_credentials')
    .select('credentials_encrypted, api_endpoint')
    .eq('supplier_id', supplierId)
    .eq('credential_type', credentialType)
    .eq('is_active', true)
    .maybeSingle()
  if (error) return { success: false, error: 'Kunne ikke hente loginoplysninger' }
  if (!data) return { success: false, error: 'Ingen aktive loginoplysninger fundet' }
  const credentials = (await decryptCredentials(data.credentials_encrypted)) as DecryptedCredentialInput
  return { success: true, data: { ...credentials, api_endpoint: data.api_endpoint ?? undefined } }
}

/** Én credential-række inkl. den krypterede blob (til forbindelsestest/maskering). Kun til server-kode. */
export async function loadCredentialSecretById(
  credentialId: string,
): Promise<{ id: string; supplier_id: string; credential_type: SecretCredentialType; api_endpoint: string | null; credentials_encrypted: string } | null> {
  const { data } = await createAdminClient()
    .from('supplier_credentials')
    .select('id, supplier_id, credential_type, api_endpoint, credentials_encrypted')
    .eq('id', credentialId)
    .maybeSingle()
  return (data as never) ?? null
}
