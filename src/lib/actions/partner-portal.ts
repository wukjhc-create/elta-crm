'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import type {
  PartnerAccessToken,
  PartnerSession,
  CreatePartnerTokenData,
  PartnerServiceCase,
  PartnerDocument,
} from '@/types/partner-portal.types'
import { PARTNER_DOCUMENT_TYPES } from '@/types/partner-portal.types'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Partner Token Management (for employees)
//
// Spejler portal.ts' token-CRUD. Forskel: tabellen er partner_access_tokens
// og scope-kolonnen hedder partner_customer_id (partnerens egen kunde-række).
// =====================================================

// Create partner access token for a customer (the partner)
export async function createPartnerToken(
  data: CreatePartnerTokenData
): Promise<ActionResult<PartnerAccessToken>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Generate secure 64-char hex token (32 bytes) — identisk med kundeportalen
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const { data: tokenData, error } = await supabase
      .from('partner_access_tokens')
      .insert({
        partner_customer_id: data.partner_customer_id,
        email: data.email,
        token,
        expires_at: data.expires_at || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating partner token', { error })
      return { success: false, error: 'Kunne ikke oprette partner-adgang' }
    }

    revalidatePath('/customers')
    return { success: true, data: tokenData as PartnerAccessToken }
  } catch (error) {
    logger.error('Error in createPartnerToken', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get partner tokens for a customer
export async function getPartnerTokens(
  customerId: string
): Promise<ActionResult<PartnerAccessToken[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('partner_access_tokens')
      .select('*')
      .eq('partner_customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching partner tokens', { error })
      return { success: false, error: 'Kunne ikke hente partner-adgange' }
    }

    return { success: true, data: data as PartnerAccessToken[] }
  } catch (error) {
    logger.error('Error in getPartnerTokens', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Deactivate partner token (soft delete)
export async function deactivatePartnerToken(
  tokenId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('partner_access_tokens')
      .update({ is_active: false })
      .eq('id', tokenId)

    if (error) {
      logger.error('Error deactivating partner token', { error })
      return { success: false, error: 'Kunne ikke deaktivere adgang' }
    }

    revalidatePath('/customers')
    return { success: true }
  } catch (error) {
    logger.error('Error in deactivatePartnerToken', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Partner Access (for partners via token)
// =====================================================

// Validate partner token and get session.
//
// Spejler validatePortalToken (portal.ts): service-role admin-client, ingen
// anon-RLS. Defense-in-depth: token-format-tjek før DB, expires_at i SQL OG JS,
// is_active-tjek, best-effort last_accessed_at-update.
export async function validatePartnerToken(
  token: string
): Promise<ActionResult<PartnerSession>> {
  try {
    // Partner-tokens er 64-char lowercase hex (32 bytes). Afvis åbenlyst ugyldige
    // før DB-kald.
    if (!token || typeof token !== 'string' || !/^[a-f0-9]{32,128}$/i.test(token)) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: tokenData, error } = await supabase
      .from('partner_access_tokens')
      .select(`
        *,
        partner:customers(
          id,
          customer_number,
          company_name,
          contact_person,
          email
        )
      `)
      .eq('token', token)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle()

    if (error || !tokenData) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    // JS-niveau expiry-tjek (ekstra forsvar mod clock drift / SQL-edge cases)
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return { success: false, error: 'Adgangen er udløbet' }
    }

    // Update last accessed timestamp — best-effort, ingen retur-fejl hvis det fejler
    await supabase
      .from('partner_access_tokens')
      .update({ last_accessed_at: nowIso })
      .eq('id', tokenData.id)

    const session: PartnerSession = {
      token: tokenData.token,
      partner_customer_id: tokenData.partner_customer_id,
      partner: tokenData.partner,
      expires_at: tokenData.expires_at,
    }

    return { success: true, data: session }
  } catch (error) {
    logger.error('Error in validatePartnerToken', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Partner Data Access (cost-free, scoped på payer_customer_id)
// =====================================================

// Get all service cases where the partner is the payer.
//
// Sikkerhed:
//   - validatePartnerToken → service-role admin-client (ingen anon-RLS).
//   - Scope: payer_customer_id = session.partner_customer_id. En partner ser
//     ALDRIG andres sager.
//   - COST-FREE: eksplicit kunde-sikker kolonneliste — ALDRIG select('*').
//     Interne felter (budget, contract_sum, revised_sum, planned_hours,
//     formand_id, assigned_to, low_profit, ksr_number, ean_number, case_notes)
//     må aldrig nå partner-klientens RSC-payload.
//   - end_customer beriges med KUN navn (company_name) så partneren kan se
//     hvilken slutkunde sagen vedrører — intet økonomisk.
export async function getPartnerServiceCases(
  token: string
): Promise<ActionResult<PartnerServiceCase[]>> {
  try {
    const sessionResult = await validatePartnerToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }
    const partnerCustomerId = sessionResult.data.partner_customer_id

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select(
        'id, case_number, title, description, status, status_note, address, postal_code, city, start_date, end_date, project_name, type, reference, created_at, end_customer:customers!service_cases_end_customer_id_fkey(company_name)'
      )
      .eq('payer_customer_id', partnerCustomerId)
      .in('status', ['new', 'in_progress', 'pending'])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching partner service cases', { error })
      return { success: false, error: 'Kunne ikke hente sager' }
    }

    const cases: PartnerServiceCase[] = (data || []).map((row) => {
      const { end_customer, ...rest } = row as Record<string, unknown> & {
        end_customer?: { company_name?: string | null } | null
      }
      return {
        ...(rest as Omit<PartnerServiceCase, 'end_customer_name'>),
        end_customer_name: end_customer?.company_name ?? null,
      }
    })

    return { success: true, data: cases }
  } catch (error) {
    logger.error('Error in getPartnerServiceCases', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get kunde-vendte dokumenter for ALLE partnerens sager.
//
// VIGTIGT (nyt scoping vs kundeportalen): dokumenterne ligger på SLUTKUNDERNES
// customer_documents-rækker (anden customer_id end partneren) — derfor scopes
// på service_case_id ∈ partnerens sager (payer = partner), IKKE på customer_id.
//
// Sikkerhed:
//   - validatePartnerToken → service-role admin-client.
//   - Kun kunde-vendte typer (PARTNER_DOCUMENT_TYPES) — interne sagsfotos ude.
//   - Ingen brugbar URL i payloaden; download går via /api/partner/documents
//     der re-validerer ejerskab pr. forespørgsel.
//   - description saniteres (defense-in-depth, jf. getPortalDocuments).
export async function getPartnerDocuments(
  token: string
): Promise<ActionResult<PartnerDocument[]>> {
  try {
    const sessionResult = await validatePartnerToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }
    const partnerCustomerId = sessionResult.data.partner_customer_id

    const admin = createAdminClient()

    // 1) Partnerens sags-id'er (payer = partner)
    const { data: caseRows, error: caseError } = await admin
      .from('service_cases')
      .select('id')
      .eq('payer_customer_id', partnerCustomerId)

    if (caseError) {
      logger.error('Error fetching partner case ids', { error: caseError })
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    const caseIds = (caseRows || []).map((r) => r.id as string)
    if (caseIds.length === 0) {
      return { success: true, data: [] }
    }

    // 2) Kunde-vendte dokumenter koblet til de sager
    const { data, error } = await admin
      .from('customer_documents')
      .select('id, title, description, document_type, file_name, mime_type, service_case_id, created_at')
      .in('service_case_id', caseIds)
      .in('document_type', PARTNER_DOCUMENT_TYPES as unknown as string[])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching partner documents', { error })
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    const { getSafeDocumentDescription } = await import('@/lib/documents/display-description')
    const docs: PartnerDocument[] = (data || []).map((d) => ({
      id: d.id as string,
      title: d.title as string,
      description: getSafeDocumentDescription(d),
      document_type: d.document_type as string,
      file_name: d.file_name as string,
      mime_type: d.mime_type as string,
      service_case_id: (d.service_case_id as string | null) ?? null,
      created_at: d.created_at as string,
    }))

    return { success: true, data: docs }
  } catch (error) {
    logger.error('Error in getPartnerDocuments', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}
