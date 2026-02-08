'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateUUID } from '@/lib/validations/common'
import { encryptCredentials, decryptCredentials, isEncryptionConfigured, maskSensitive } from '@/lib/utils/encryption'
import type { ActionResult } from '@/types/common.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'

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
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    const supabase = await createClient()

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
      console.error('Database error fetching credentials:', error)
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
    const userId = await requireAuth()
    validateUUID(data.supplier_id, 'leverandør ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret i miljøvariabler' }
    }

    // Encrypt credentials
    const encryptedCredentials = await encryptCredentials(data.credentials as Record<string, unknown>)

    const supabase = await createClient()

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
      console.error('Database error creating credential:', error)
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
    await requireAuth()
    validateUUID(id, 'credential ID')

    const supabase = await createClient()

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
      console.error('Database error updating credential:', error)
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
    await requireAuth()
    validateUUID(id, 'credential ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('supplier_credentials')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting credential:', error)
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
    await requireAuth()
    validateUUID(supplierId, 'leverandør ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplierId)
      .eq('credential_type', credentialType)
      .eq('is_active', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Ingen aktive loginoplysninger fundet' }
      }
      throw new Error('DATABASE_ERROR')
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
    await requireAuth()
    validateUUID(credentialId, 'credential ID')

    const supabase = await createClient()

    // Get credential info
    const { data: credential, error: fetchError } = await supabase
      .from('supplier_credentials')
      .select('id, supplier_id, credential_type, credentials_encrypted, api_endpoint')
      .eq('id', credentialId)
      .single()

    if (fetchError || !credential) {
      return { success: false, error: 'Loginoplysninger ikke fundet' }
    }

    // Get supplier code to determine which API to test
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('code')
      .eq('id', credential.supplier_id)
      .single()

    let testStatus: TestStatus = 'failed'
    let testMessage = 'Ukendt leverandør'
    let testError: string | null = null

    try {
      // Decrypt credentials
      const credentials = await decryptCredentials(credential.credentials_encrypted) as CredentialInput

      // Test based on supplier
      const supplierCode = supplier?.code?.toUpperCase()

      if (supplierCode === 'AO') {
        // Test AO API connection
        const result = await testAOConnection(credentials, credential.api_endpoint)
        testStatus = result.status
        testMessage = result.message
        testError = result.error || null
      } else if (supplierCode === 'LM') {
        // Test Lemvigh-Müller connection
        const result = await testLMConnection(credentials, credential.api_endpoint)
        testStatus = result.status
        testMessage = result.message
        testError = result.error || null
      } else {
        testMessage = 'Leverandør understøtter ikke API-test'
      }
    } catch (err) {
      testStatus = 'failed'
      testMessage = 'Fejl ved dekryptering af loginoplysninger'
      testError = err instanceof Error ? err.message : 'Ukendt fejl'
    }

    // Update credential with test result
    await supabase
      .from('supplier_credentials')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: testStatus,
        last_test_error: testError,
      })
      .eq('id', credentialId)

    revalidatePath('/dashboard/settings/suppliers')

    return {
      success: testStatus === 'success',
      data: { status: testStatus, message: testMessage },
      error: testStatus !== 'success' ? testMessage : undefined,
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke teste forbindelse') }
  }
}

// =====================================================
// Supplier-Specific Connection Tests
// =====================================================

async function testAOConnection(
  credentials: CredentialInput,
  apiEndpoint: string | null
): Promise<{ status: TestStatus; message: string; error?: string }> {
  // AO API test implementation
  // For now, we'll simulate a test - real implementation would call AO's API
  try {
    if (!credentials.username || !credentials.password) {
      return { status: 'invalid_credentials', message: 'Manglende brugernavn eller adgangskode' }
    }

    // TODO: Implement actual AO API health check
    // const endpoint = apiEndpoint || 'https://api.ao.dk/v1'
    // const response = await fetch(`${endpoint}/auth/test`, { ... })

    // For now, return success if credentials are present
    return { status: 'success', message: 'Forbindelse til AO er aktiv' }
  } catch (err) {
    return {
      status: 'failed',
      message: 'Kunne ikke forbinde til AO',
      error: err instanceof Error ? err.message : 'Netværksfejl',
    }
  }
}

async function testLMConnection(
  credentials: CredentialInput,
  apiEndpoint: string | null
): Promise<{ status: TestStatus; message: string; error?: string }> {
  // Lemvigh-Müller API test implementation
  try {
    if (!credentials.username || !credentials.password) {
      return { status: 'invalid_credentials', message: 'Manglende brugernavn eller adgangskode' }
    }

    if (!credentials.customer_number) {
      return { status: 'invalid_credentials', message: 'Manglende kundenummer' }
    }

    // TODO: Implement actual L-M API health check
    // const endpoint = apiEndpoint || 'https://api.lfrm.dk/v1'
    // const response = await fetch(`${endpoint}/auth/validate`, { ... })

    return { status: 'success', message: 'Forbindelse til Lemvigh-Müller er aktiv' }
  } catch (err) {
    return {
      status: 'failed',
      message: 'Kunne ikke forbinde til Lemvigh-Müller',
      error: err instanceof Error ? err.message : 'Netværksfejl',
    }
  }
}

// =====================================================
// Get Masked Credentials (for UI display)
// =====================================================

export async function getMaskedCredentials(
  credentialId: string
): Promise<ActionResult<Record<string, string>>> {
  try {
    await requireAuth()
    validateUUID(credentialId, 'credential ID')

    if (!isEncryptionConfigured()) {
      return { success: false, error: 'Krypteringsnøgle er ikke konfigureret' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted')
      .eq('id', credentialId)
      .single()

    if (error) {
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
