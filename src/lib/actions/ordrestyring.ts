'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export interface OrdrestyringResult {
  os_case_id: string
  os_case_number: string
  os_url: string
}

/**
 * Send an offer to Ordrestyring — creates customer + case with all line items.
 */
export async function sendOfferToOrdrestyring(
  offerId: string
): Promise<ActionResult<OrdrestyringResult>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // 1. Get offer with customer and line items
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        customer:customers!left(
          id, company_name, contact_person, email, phone,
          billing_address, billing_postal_code, billing_city,
          vat_number
        ),
        line_items:offer_line_items(
          id, position, description, quantity, unit, unit_price,
          discount_percentage, total, cost_price, notes, line_type, section
        )
      `)
      .eq('id', offerId)
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (!offer.customer) {
      return { success: false, error: 'Tilbuddet har ingen tilknyttet kunde' }
    }

    const { createOrdrestyringCase } = await import('@/lib/services/ordrestyring')
    const customer = offer.customer as any
    const lineItems = ((offer.line_items || []) as any[])
      .filter((li: any) => li.description?.trim() && (li.quantity || 0) > 0)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))

    if (lineItems.length === 0) {
      return { success: false, error: 'Tilbuddet har ingen gyldige linjer (beskrivelse + antal > 0)' }
    }

    // 2. Build and send to Ordrestyring
    const osResult = await createOrdrestyringCase({
      title: offer.title || `Tilbud ${offer.offer_number}`,
      description: offer.notes || offer.scope || undefined,
      reference: offer.offer_number,
      priority: 'normal',
      ksr_number: undefined,
      ean_number: undefined,
      customer: {
        name: customer.company_name || 'Ukendt',
        address: customer.billing_address || '',
        postal_code: customer.billing_postal_code || '',
        city: customer.billing_city || '',
        email: customer.email || '',
        phone: customer.phone || '',
        contact_person: customer.contact_person || '',
      },
      line_items: lineItems.map((li: any) => ({
        description: (li.description || '').trim(),
        quantity: li.quantity || 1,
        unit: li.unit || 'stk',
        unit_price: li.unit_price || 0,
        total: li.total || 0,
      })),
    })

    const osCaseNumber = osResult.case_number || osResult.id
    const osUrl = `https://app.ordrestyring.dk/cases/${osResult.id || osCaseNumber}`

    // 3. Store OS reference on the offer
    await supabase
      .from('offers')
      .update({
        os_case_id: osCaseNumber,
        os_synced_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    logger.info('Offer sent to Ordrestyring', {
      entity: 'offer',
      entityId: offerId,
      metadata: { osCaseNumber, offerNumber: offer.offer_number },
    })

    revalidatePath(`/dashboard/offers/${offerId}`)

    return {
      success: true,
      data: {
        os_case_id: osResult.id,
        os_case_number: osCaseNumber,
        os_url: osUrl,
      },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send offer to Ordrestyring', {
      entity: 'offer',
      entityId: offerId,
      metadata: { error: errorMsg },
    })
    // Pass through the actual API error so the user can see what went wrong
    return { success: false, error: errorMsg }
  }
}

export interface RawAttempt {
  url: string
  method: string
  status: number | null
  ok: boolean
  headers: Record<string, string>
  bodySnippet: string
  error?: string
  latencyMs: number
}

export interface OrdrestyringConnectionTest {
  ok: boolean
  endpoint: string
  method?: string
  endpointsTried?: string[]
  httpStatus?: number
  graphqlType?: string
  latencyMs?: number
  error?: string
  configPresent: boolean
  rawAttempts?: RawAttempt[]
}

/**
 * Test the Ordrestyring GraphQL connection — called from Settings UI.
 */
export async function testOrdrestyringConnectionAction(): Promise<ActionResult<OrdrestyringConnectionTest>> {
  try {
    // Check env vars first
    const apiKey = process.env.ORDRESTYRING_API_KEY
    const companyCode = process.env.ORDRESTYRING_COMPANY_CODE
    const configPresent = Boolean(apiKey && companyCode)

    if (!configPresent) {
      return {
        success: true,
        data: {
          ok: false,
          endpoint: 'https://api.ordrestyring.dk/chip-api',
          configPresent: false,
          error: 'Mangler ORDRESTYRING_API_KEY og/eller ORDRESTYRING_COMPANY_CODE i miljøvariable',
        },
      }
    }

    const { testOrdrestyringConnection } = await import('@/lib/services/ordrestyring')
    const result = await testOrdrestyringConnection()

    return {
      success: true,
      data: {
        ...result,
        configPresent: true,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      success: true,
      data: {
        ok: false,
        endpoint: 'https://api.ordrestyring.dk/v1/graphql',
        configPresent: false,
        error: msg,
      },
    }
  }
}

/**
 * Get Ordrestyring reference for an offer (if previously sent).
 */
export async function getOfferOrdrestyringRef(
  offerId: string
): Promise<ActionResult<{ os_case_number: string; os_url: string; synced_at: string } | null>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('offers')
      .select('os_case_id, os_synced_at')
      .eq('id', offerId)
      .single()

    if (error) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (!data?.os_case_id) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        os_case_number: data.os_case_id,
        os_url: `https://app.ordrestyring.dk/cases/${data.os_case_id}`,
        synced_at: data.os_synced_at,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Fejl') }
  }
}
