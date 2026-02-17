'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import { encryptCredentials, decryptCredentials, isEncryptionConfigured, maskSensitive } from '@/lib/utils/encryption'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

export type CredentialType = 'api' | 'ftp' | 'web'
export type CredentialEnvironment = 'production' | 'sandbox' | 'test'
export type TestStatus = 'success' | 'failed' | 'timeout' | 'invalid_credentials'

export interface SupplierCredential {
  id: string
  supplier_id: string
  credential_type: CredentialType
  api_endpoint: string | null
  is_active: boolean
  last_test_at: string | null
  last_test_status: TestStatus | null
  last_test_error: string | null
  environment: CredentialEnvironment
  notes: string | null
  created_at: string
  updated_at: string
  // Credentials are never returned - only masked versions
  has_credentials: boolean
}

export interface CredentialInput {
  username?: string
  password?: string
  api_key?: string
  client_id?: string
  client_secret?: string
  customer_number?: string
  price_list_code?: string
}

export interface CreateCredentialData {
  supplier_id: string
  credential_type: CredentialType
  api_endpoint?: string
  credentials: CredentialInput
  environment?: CredentialEnvironment
  notes?: string
}
// =====================================================
// Credential CRUD
// =====================================================

export async function getSupplierCredentials(
  supplierId: string
): Promise<ActionResult<SupplierCredential[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_credentials')
      .select(`
        id,
        supplier_id,
        credential_type,
        api_endpoint,
        is_active,
        last_test_at,
        last_test_status,
        last_test_error,
        environment,
        notes,
        created_at,
        updated_at,
        credentials_encrypted
      `)
      .eq('supplier_id', supplierId)
      .order('credential_type')

    if (error) {
      logger.error('Database error fetching credentials', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Map to safe output (never expose encrypted credentials)
    const credentials: SupplierCredential[] = (data || []).map((row) => ({
      id: row.id,
      supplier_id: row.supplier_id,
      credential_type: row.credential_type,
      api_endpoint: row.api_endpoint,
      is_active: row.is_active,
      last_test_at: row.last_test_at,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
      environment: row.environment,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_credentials: !!row.credentials_encrypted,
    }))

    return { success: true, data: credentials }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente loginoplysninger') }
  }
}

export async function createSupplierCredential(
  data: CreateCredentialData
): Promise<ActionResult<SupplierCredential>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(data.supplier_id, 'leverandør ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret i miljøvariabler' }
    }

    // Encrypt credentials
    const encryptedCredentials = await encryptCredentials(data.credentials as Record<string, unknown>)

    const { data: result, error } = await supabase
      .from('supplier_credentials')
      .insert({
        supplier_id: data.supplier_id,
        credential_type: data.credential_type,
        api_endpoint: data.api_endpoint || null,
        credentials_encrypted: encryptedCredentials,
        environment: data.environment || 'production',
        notes: data.notes || null,
        is_active: true,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Loginoplysninger for denne type eksisterer allerede' }
      }
      logger.error('Database error creating credential', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/suppliers/${data.supplier_id}`)

    return {
      success: true,
      data: {
        id: result.id,
        supplier_id: result.supplier_id,
        credential_type: result.credential_type,
        api_endpoint: result.api_endpoint,
        is_active: result.is_active,
        last_test_at: result.last_test_at,
        last_test_status: result.last_test_status,
        last_test_error: result.last_test_error,
        environment: result.environment,
        notes: result.notes,
        created_at: result.created_at,
        updated_at: result.updated_at,
        has_credentials: true,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme loginoplysninger') }
  }
}

export async function updateSupplierCredential(
  id: string,
  data: {
    api_endpoint?: string
    credentials?: CredentialInput
    environment?: CredentialEnvironment
    notes?: string
    is_active?: boolean
  }
): Promise<ActionResult<SupplierCredential>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'credential ID')

    const updateData: Record<string, unknown> = {}

    if (data.api_endpoint !== undefined) {
      updateData.api_endpoint = data.api_endpoint || null
    }
    if (data.environment !== undefined) {
      updateData.environment = data.environment
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes || null
    }
    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active
    }

    // If credentials provided, encrypt them
    if (data.credentials) {
      if (!isEncryptionConfigured()) {
        return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
      }
      updateData.credentials_encrypted = await encryptCredentials(data.credentials as Record<string, unknown>)
    }

    const { data: result, error } = await supabase
      .from('supplier_credentials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Loginoplysninger ikke fundet' }
      }
      logger.error('Database error updating credential', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')

    return {
      success: true,
      data: {
        id: result.id,
        supplier_id: result.supplier_id,
        credential_type: result.credential_type,
        api_endpoint: result.api_endpoint,
        is_active: result.is_active,
        last_test_at: result.last_test_at,
        last_test_status: result.last_test_status,
        last_test_error: result.last_test_error,
        environment: result.environment,
        notes: result.notes,
        created_at: result.created_at,
        updated_at: result.updated_at,
        has_credentials: !!result.credentials_encrypted,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere loginoplysninger') }
  }
}

export async function deleteSupplierCredential(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'credential ID')

    const { error } = await supabase
      .from('supplier_credentials')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting credential', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette loginoplysninger') }
  }
}

// =====================================================
// Internal: Get Decrypted Credentials (for API calls)
// =====================================================

export async function getDecryptedCredentials(
  supplierId: string,
  credentialType: CredentialType = 'api'
): Promise<ActionResult<CredentialInput & { api_endpoint?: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
    }

    const { data, error } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplierId)
      .eq('credential_type', credentialType)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Ingen aktive loginoplysninger fundet' }
    }

    const credentials = await decryptCredentials(data.credentials_encrypted) as CredentialInput

    return {
      success: true,
      data: {
        ...credentials,
        api_endpoint: data.api_endpoint,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente loginoplysninger') }
  }
}

// =====================================================
// Test Connection
// =====================================================

export async function testSupplierConnection(
  credentialId: string
): Promise<ActionResult<{ status: TestStatus; message: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(credentialId, 'credential ID')

    // Get credential info
    const { data: credential, error: fetchError } = await supabase
      .from('supplier_credentials')
      .select('id, supplier_id, credential_type, credentials_encrypted, api_endpoint')
      .eq('id', credentialId)
      .maybeSingle()

    if (fetchError || !credential) {
      return { success: false, error: 'Loginoplysninger ikke fundet' }
    }

    // Get supplier code to determine which API to test
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('code')
      .eq('id', credential.supplier_id)
      .maybeSingle()

    const supplierCode = supplier?.code?.toUpperCase()

    // Branch by credential type
    if (credential.credential_type === 'ftp') {
      // ===== FTP Connection Test =====
      const decrypted = await decryptCredentials(credential.credentials_encrypted) as CredentialInput
      const { buildFtpCredentials, testFtpConnection } = await import('@/lib/services/supplier-ftp-sync')

      try {
        const ftpCreds = buildFtpCredentials(
          { username: decrypted.username, password: decrypted.password, api_endpoint: credential.api_endpoint || undefined },
          supplierCode || 'UNKNOWN'
        )
        const ftpResult = await testFtpConnection(ftpCreds)
        const ftpStatus: TestStatus = ftpResult.success ? 'success' : 'failed'

        await supabase
          .from('supplier_credentials')
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: ftpStatus,
            last_test_error: ftpResult.error || null,
          })
          .eq('id', credentialId)

        revalidatePath('/dashboard/settings/suppliers')
        return {
          success: ftpResult.success,
          data: { status: ftpStatus, message: ftpResult.success ? 'FTP forbindelse OK' : (ftpResult.error || 'FTP fejl') },
          error: !ftpResult.success ? ftpResult.error : undefined,
        }
      } catch (ftpErr) {
        const errMsg = ftpErr instanceof Error ? ftpErr.message : 'Ukendt FTP fejl'
        await supabase
          .from('supplier_credentials')
          .update({ last_test_at: new Date().toISOString(), last_test_status: 'failed', last_test_error: errMsg })
          .eq('id', credentialId)

        return { success: false, data: { status: 'failed', message: errMsg }, error: errMsg }
      }
    }

    // ===== API Connection Test =====
    if (!supplierCode || !['AO', 'LM'].includes(supplierCode)) {
      await supabase
        .from('supplier_credentials')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: 'failed',
          last_test_error: 'Leverandør understøtter ikke API-test',
        })
        .eq('id', credentialId)

      return {
        success: false,
        data: { status: 'failed', message: 'Leverandør understøtter ikke API-test' },
        error: 'Leverandør understøtter ikke API-test',
      }
    }

    const { SupplierAPIClientFactory } = await import('@/lib/services/supplier-api-client')
    SupplierAPIClientFactory.clearCache()
    const client = await SupplierAPIClientFactory.getClient(credential.supplier_id, supplierCode)

    if (!client) {
      await supabase
        .from('supplier_credentials')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: 'failed',
          last_test_error: 'Kunne ikke oprette API-klient',
        })
        .eq('id', credentialId)

      return {
        success: false,
        data: { status: 'failed', message: 'Kunne ikke oprette API-klient' },
        error: 'Kunne ikke oprette API-klient',
      }
    }

    const result = await client.testConnection()
    const testStatus: TestStatus = result.success ? 'success' : 'failed'

    await supabase
      .from('supplier_credentials')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: testStatus,
        last_test_error: result.error || null,
      })
      .eq('id', credentialId)

    revalidatePath('/dashboard/settings/suppliers')

    return {
      success: result.success,
      data: { status: testStatus, message: result.message },
      error: !result.success ? result.message : undefined,
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke teste forbindelse') }
  }
}

// =====================================================
// Get Masked Credentials (for UI display)
// =====================================================

export async function getMaskedCredentials(
  credentialId: string
): Promise<ActionResult<Record<string, string>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(credentialId, 'credential ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
    }

    const { data, error } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted')
      .eq('id', credentialId)
      .maybeSingle()

    if (error) {
      return { success: false, error: 'Loginoplysninger ikke fundet' }
    }

    if (!data) {
      return { success: false, error: 'Loginoplysninger ikke fundet' }
    }

    const credentials = await decryptCredentials(data.credentials_encrypted) as Record<string, string>

    // Mask all values
    const masked: Record<string, string> = {}
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string') {
        masked[key] = maskSensitive(value)
      }
    }

    return { success: true, data: masked }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente loginoplysninger') }
  }
}
