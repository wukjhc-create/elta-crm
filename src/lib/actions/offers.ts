'use server'
import { pgQuote } from '@/lib/validations/postgrest-filter'

import { revalidatePath } from 'next/cache'
import {
  createOfferSchema,
  updateOfferSchema,
  createLineItemSchema,
  updateLineItemSchema,
} from '@/lib/validations/offers'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { CALC_DEFAULTS } from '@/lib/constants'
import { calculateSalePrice, calculateLineTotal, calculateMarginFromPrices, resolveMargin } from '@/lib/logic/pricing'
import { getOfferLowDbStatus } from '@/lib/offers/low-db-status'
import { lowDbAckMessage, type OfferLowDbStatus } from '@/lib/offers/low-db-warning'
import { OFFER_LINE_PUBLIC_COLUMNS } from '@/lib/offers/line-columns'
import { mergeOfferLineCost, fetchOfferLineCostById } from '@/lib/offers/line-cost'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCalculationSettings } from '@/lib/actions/calculation-settings'
import { logCreate, logUpdate, logDelete, logStatusChange, createAuditLog } from '@/lib/actions/audit'
import { insertCustomerWithRetry } from '@/lib/customers/customer-number'
import { insertOfferWithNumber } from '@/lib/services/offer-number'
import { recomputeOfferTotals } from '@/lib/services/offer-pricing'
import { offerEditLockReason, offerIdForLine } from '@/lib/offers/edit-lock'
import { emitOfferEvent } from '@/lib/services/webhook-dispatch'
import { createServiceCaseFromOffer } from '@/lib/actions/offer-to-case'
import { isValidOfferTransition, OFFER_STATUS_LABELS } from '@/types/offers.types'
import type {
  Offer,
  OfferWithRelations,
  OfferLineItem,
  OfferStatus,
} from '@/types/offers.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import {
  formatError,
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
} from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import type { Permission } from '@/lib/auth/permissions'
import { copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'
import { isOfferExpired } from '@/lib/offers/validity'

// Get all offers with optional filtering and pagination
export async function getOffers(filters?: {
  search?: string
  status?: OfferStatus
  customer_id?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /** Staging-model B: vis kun is_proposal=true. Default vises kun is_proposal=false. */
  proposalsOnly?: boolean
  /** Sprint Ø7.2 — konverteringsfilter (drevet af converted_case_id). */
  conversion?: 'all' | 'ready' | 'converted' | 'not_converted'
}): Promise<ActionResult<PaginatedResponse<OfferWithRelations>>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Validate customer_id if provided
    if (filters?.customer_id) {
      validateUUID(filters.customer_id, 'kunde ID')
    }

    // Build count query
    let countQuery = supabase
      .from('offers')
      .select('*', { count: 'exact', head: true })
      .eq('is_proposal', filters?.proposalsOnly === true)

    // Build data query
    let dataQuery = supabase
      .from('offers')
      .select(`
        *,
        customer:customers!offers_customer_id_fkey(id, customer_number, company_name, contact_person, email),
        lead:leads(id, company_name, contact_person, email),
        converted_case:service_cases!offers_converted_case_id_fkey(id, case_number)
      `)
      .eq('is_proposal', filters?.proposalsOnly === true)

    // Apply filters to both queries with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      // Udvid søgningen til også at matche kundenavn + kundenummer. PostgREST kan ikke
      // filtrere embedded relationer i .or(), så vi slår matchende kunde-id'er op først
      // og føjer dem til OR'en som customer_id.in.(...) (base-tabel-kolonne).
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .or(`company_name.ilike.${pgQuote(`%${sanitized}%`)},customer_number.ilike.${pgQuote(`%${sanitized}%`)}`)
        .limit(100)

      const orParts = [`title.ilike.${pgQuote(`%${sanitized}%`)}`, `offer_number.ilike.${pgQuote(`%${sanitized}%`)}`]
      if (matchingCustomers && matchingCustomers.length > 0) {
        const ids = matchingCustomers.map((c) => c.id).join(',')
        orParts.push(`customer_id.in.(${ids})`)
      }
      const searchFilter = orParts.join(',')
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.customer_id) {
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
    }

    // Sprint Ø7.2 — konverteringsfilter (samme logik som Ø7.1-badget; O(1),
    // ingen N+1 — bruger kun eksisterende kolonner converted_case_id/status).
    const conv = filters?.conversion
    if (conv === 'converted') {
      countQuery = countQuery.not('converted_case_id', 'is', null)
      dataQuery = dataQuery.not('converted_case_id', 'is', null)
    } else if (conv === 'not_converted') {
      countQuery = countQuery.is('converted_case_id', null)
      dataQuery = dataQuery.is('converted_case_id', null)
    } else if (conv === 'ready') {
      // Klar til sag = ikke konverteret + status sendt/set/accepteret.
      const READY = ['sent', 'viewed', 'accepted']
      countQuery = countQuery.is('converted_case_id', null).in('status', READY)
      dataQuery = dataQuery.is('converted_case_id', null).in('status', READY)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      logger.error('Database error counting offers', { error: countResult.error })
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      logger.error('Database error fetching offers', { error: dataResult.error })
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as OfferWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbud') }
  }
}

/** D43/D44: synlighed af kost/avance (navngivet: check:rls-matrix læser literal-strenge i skrivefunktioner som skrive-gates). */
const OFFER_COST_VISIBILITY_PERMISSION = 'offers.view.cost_prices' as const
/** Tilbud der må slettes (tilbuds-review 2026-10-09 #5) — øvrige arkiveres/afvises i stedet. */
const DELETABLE_OFFER_STATUSES: string[] = ['draft', 'rejected']

/**
 * D43 (privacy/RBAC): kost/leverandørkost/avance på en tilbudslinje kun for offers.view.cost_prices.
 * margin_percentage + unit_price afslører kostprisen (kost = salg / (1 + avance)) → også skjult. Bruges af alle
 * handlinger, der returnerer en linje (ellers får salg kosten tilbage efter at have tilføjet/rettet en linje).
 * 00192 (erstatter stripLineCost): linjen er hentet med OFFER_LINE_PUBLIC_COLUMNS (insert/update `.select(...)`) og
 * mangler kostfelterne — med offers.view.cost_prices hentes de via admin-klienten, ellers sættes de til null.
 */
async function withLineCost(li: OfferLineItem, hasPermission: (p: Permission) => boolean): Promise<OfferLineItem> {
  const [merged] = await mergeOfferLineCost([li], hasPermission(OFFER_COST_VISIBILITY_PERMISSION))
  return merged
}

// Get single offer by ID with all relations
export async function getOffer(id: string): Promise<ActionResult<OfferWithRelations>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }
    validateUUID(id, 'tilbud ID')

    // 00192: kun offentlige linjekolonner (salg når getOffer); kost flettes ind nedenfor bag offers.view.cost_prices
    const { data: raw, error } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(${OFFER_LINE_PUBLIC_COLUMNS}),
        customer:customers!offers_customer_id_fkey(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country),
        lead:leads(id, company_name, contact_person, email)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!raw) {
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }
    const data = raw as unknown as OfferWithRelations

    // Sort line items by position
    if (data.line_items) {
      data.line_items.sort((a: OfferLineItem, b: OfferLineItem) => a.position - b.position)
      // D43 (privacy/RBAC): kost/leverandørkost/avance kun for offers.view.cost_prices — før lå de i payloaden til
      // salg og blev kun skjult i UI'et. 00192: kost hentes nu separat via admin-klienten (null uden permission).
      data.line_items = await mergeOfferLineCost(data.line_items, hasPermission(OFFER_COST_VISIBILITY_PERMISSION))
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbud') }
  }
}

// Create new offer
export async function createOffer(formData: FormData): Promise<ActionResult<Offer>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.create')) {
      return { success: false, error: 'Manglende tilladelse: offers.create' }
    }

    const customerId = formData.get('customer_id') as string || null
    const leadId = formData.get('lead_id') as string || null

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }
    if (leadId) {
      validateUUID(leadId, 'lead ID')
    }

    const rawData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      scope: formData.get('scope') as string || null,
      customer_id: customerId,
      lead_id: leadId,
      // Sprint 12A — sagspartner-roller fra form. Action-laget default-
      // fylder til customer_id hvis tomme.
      orderer_customer_id: (formData.get('orderer_customer_id') as string) || null,
      end_customer_id: (formData.get('end_customer_id') as string) || null,
      payer_customer_id: (formData.get('payer_customer_id') as string) || null,
      billing_mode: (formData.get('billing_mode') as string) || null,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      valid_until: formData.get('valid_until') as string || null,
      terms_and_conditions: formData.get('terms_and_conditions') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = createOfferSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }
    // Strip null/undefined values to avoid PostgREST errors for new columns
    const insertData: Record<string, unknown> = {
      created_by: userId,
    }
    for (const [key, value] of Object.entries(validated.data)) {
      if (value !== null && value !== undefined) {
        insertData[key] = value
      }
    }

    // Sprint 12A — default-fyld parti-roller til customer_id hvis form
    // ikke har leveret dem. Saadan matcher nye offers backfill-mønstret
    // fra 00118 og mail-routing kan altid stole paa at parti-roller er
    // sat naar customer_id er sat.
    if (validated.data.customer_id) {
      if (!insertData.orderer_customer_id) insertData.orderer_customer_id = validated.data.customer_id
      if (!insertData.end_customer_id) insertData.end_customer_id = validated.data.customer_id
      if (!insertData.payer_customer_id) insertData.payer_customer_id = validated.data.customer_id
    }
    if (!insertData.billing_mode) insertData.billing_mode = 'same_as_customer'

    // Race-sikkert tilbudsnummer (retry ved samtidig oprettelse) — se services/offer-number.ts
    const { data, error } = await insertOfferWithNumber<Offer>(supabase, insertData, '*')

    if (error || !data) {
      if (error?.code === '23503') {
        return { success: false, error: 'Den valgte kunde eller lead findes ikke' }
      }
      logger.error('Database error creating offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      data.id,
      'created',
      `Tilbud "${data.title}" oprettet`,
      userId
    )

    // Audit log
    await logCreate('offer', data.id, data.title, {
      offer_number: data.offer_number,
      customer_id: data.customer_id,
    })

    revalidatePath('/offers')
    return { success: true, data: data as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud') }
  }
}

// =====================================================
// Quick Create: Customer + Offer in one action
// =====================================================

interface QuickCreateInput {
  // Customer fields (skipped if existingCustomerId provided)
  existingCustomerId?: string
  companyName?: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  postalCode?: string
  // Offer fields
  offerTitle: string
  productType?: string
  sourceEmailId?: string
}

export async function quickCreateCustomerAndOffer(
  input: QuickCreateInput
): Promise<ActionResult<{ customerId: string; offerId: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.create')) {
      return { success: false, error: 'Manglende tilladelse: offers.create' }
    }

    let customerId: string = input.existingCustomerId || ''

    // Step 1: Create customer if not already linked
    if (!customerId) {
      if (!input.companyName || !input.email) {
        return { success: false, error: 'Firmanavn og email er påkrævet' }
      }

      // Check if customer with this email already exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('email', input.email)
        .maybeSingle()

      if (existing) {
        customerId = existing.id
      } else {
        // Sprint 9E Phase 5d — faelles helper med retry mod 23505.
        const { data: newCustomer, error: custError } = await insertCustomerWithRetry<{
          id: string
          customer_number: string
        }>(
          supabase,
          (customerNumber) => ({
            company_name: input.companyName,
            contact_person: input.contactPerson || null,
            email: input.email,
            phone: input.phone || null,
            billing_address: input.address || null,
            billing_city: input.city || null,
            billing_postal_code: input.postalCode || null,
            billing_country: 'Danmark',
            customer_number: customerNumber,
            created_by: userId,
            is_active: true,
            tags: [],
          }),
          { selectClause: 'id, customer_number', label: 'quickCreateCustomerAndOffer' }
        )

        if (custError || !newCustomer) {
          logger.error('Error creating customer in quick flow', { error: custError })
          return { success: false, error: 'Kunne ikke oprette kunde' }
        }

        customerId = newCustomer.id

        await logCreate('customer', customerId, input.companyName, {
          customer_number: newCustomer.customer_number,
          source: 'quick_create_from_mail',
        })
      }
    }

    // Step 2: Create offer
    const insertData: Record<string, unknown> = {
      title: input.offerTitle,
      customer_id: customerId,
      // Sprint 12A — default-fyld parti-roller til customerId.
      // Quick-create antager altid same_as_customer (privatkunde-flow).
      orderer_customer_id: customerId,
      end_customer_id: customerId,
      payer_customer_id: customerId,
      billing_mode: 'same_as_customer',
      status: 'draft',
      tax_percentage: 25,
      discount_percentage: 0,
      created_by: userId,
    }
    if (input.productType) {
      insertData.description = `Produkttype: ${input.productType}`
    }

    const { data: offer, error: offerError } = await insertOfferWithNumber<Offer>(supabase, insertData, '*')

    if (offerError || !offer) {
      logger.error('Error creating offer in quick flow', { error: offerError })
      return { success: false, error: 'Kunde oprettet, men tilbud fejlede' }
    }

    // Log activity
    await logOfferActivity(
      offer.id,
      'created',
      `Tilbud "${offer.title}" oprettet via hurtig-flow`,
      userId
    )
    await logCreate('offer', offer.id, offer.title, {
      offer_number: offer.offer_number,
      customer_id: customerId,
      source: 'quick_create_from_mail',
    })

    // Link source email to customer if provided
    if (input.sourceEmailId && customerId) {
      await supabase
        .from('incoming_emails')
        .update({ customer_id: customerId, link_status: 'linked' })
        .eq('id', input.sourceEmailId)
    }

    revalidatePath('/offers')
    revalidatePath('/customers')
    revalidatePath('/dashboard/mail')

    return {
      success: true,
      data: { customerId, offerId: offer.id },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kunde og tilbud') }
  }
}

// Update offer
export async function updateOffer(formData: FormData): Promise<ActionResult<Offer>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Tilbud ID mangler' }
    }
    validateUUID(id, 'tilbud ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, id); if (lock) return { success: false, error: lock } }

    const customerId = formData.get('customer_id') as string || null
    const leadId = formData.get('lead_id') as string || null

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }
    if (leadId) {
      validateUUID(leadId, 'lead ID')
    }

    const rawData = {
      id,
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      scope: formData.get('scope') as string || null,
      customer_id: customerId,
      lead_id: leadId,
      // Sprint 12A — accept parti-roller fra form. Hvis tomme,
      // forblives null saa "strip null/undefined"-pattern nedenfor
      // udelukker dem fra UPDATE — eksisterende vaerdier i DB bevares.
      orderer_customer_id: (formData.get('orderer_customer_id') as string) || null,
      end_customer_id: (formData.get('end_customer_id') as string) || null,
      payer_customer_id: (formData.get('payer_customer_id') as string) || null,
      billing_mode: (formData.get('billing_mode') as string) || null,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      valid_until: formData.get('valid_until') as string || null,
      terms_and_conditions: formData.get('terms_and_conditions') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = updateOfferSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: offerId, ...rawUpdateData } = validated.data

    // Strip null/undefined to avoid PostgREST errors for columns that may not exist yet
    const updateData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rawUpdateData)) {
      if (value !== null && value !== undefined) {
        updateData[key] = value
      }
    }

    // Tilbuds-review 2026-10-09 (#1, S1): kundeskift på kladden flytter parti-roller med, der stod på den gamle kunde
    // (formularen sender dem ikke) — ellers gik tilbud, portal-link og senere sag/faktura til den tidligere kunde
    if (customerId) {
      const { data: cur } = await supabase
        .from('offers')
        .select('customer_id, orderer_customer_id, end_customer_id, payer_customer_id')
        .eq('id', offerId!)
        .maybeSingle()
      const prev = cur as { customer_id: string | null; orderer_customer_id: string | null; end_customer_id: string | null; payer_customer_id: string | null } | null
      if (prev && prev.customer_id !== customerId) {
        for (const k of ['orderer_customer_id', 'end_customer_id', 'payer_customer_id'] as const) {
          if (updateData[k] === undefined && (!prev[k] || prev[k] === prev.customer_id)) updateData[k] = customerId
        }
      }
    }

    const { data, error } = await supabase
      .from('offers')
      .update(updateData)
      .eq('id', offerId!)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbuddet blev ikke fundet' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte kunde eller lead findes ikke' }
      }
      logger.error('Database error updating offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Tilbuds-review 2026-10-07: update_offer_totals kører kun ved ændring af LINJER — ændret rabat-%/moms-% på selve
    // tilbuddet lod discount_amount/tax_amount/final_amount stå (PDF/portal/sag viste den gamle total). Samme formel
    // som triggeren (recomputeOfferTotals); returnér de opdaterede beløb.
    let result = data as Offer
    if ('discount_percentage' in updateData || 'tax_percentage' in updateData) {
      const totals = await recomputeOfferTotals(offerId!)
      if (!totals) {
        logger.error('updateOffer: recompute totals failed', { entityId: offerId })
        throw new Error('DATABASE_ERROR')
      }
      const { data: fresh } = await supabase.from('offers').select().eq('id', offerId!).single()
      if (fresh) result = fresh as Offer
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      'Tilbud opdateret',
      userId
    )

    // Audit log
    await logUpdate('offer', offerId, data.title, { updated: { old: false, new: true } })

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere tilbud') }
  }
}

// Update a single text field on an offer (scope, notes, terms_and_conditions, description)
const ALLOWED_TEXT_FIELDS = ['scope', 'notes', 'terms_and_conditions', 'description'] as const
type AllowedTextField = typeof ALLOWED_TEXT_FIELDS[number]

export async function updateOfferField(
  offerId: string,
  field: AllowedTextField,
  value: string | null
): Promise<ActionResult> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(offerId, 'tilbud ID')

    if (!ALLOWED_TEXT_FIELDS.includes(field)) {
      return { success: false, error: 'Ugyldigt felt' }
    }
    // Henrik 2026-10-07: kundevendt indhold kun i kladde; interne noter må altid redigeres
    if (field !== 'notes') { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }

    const { error } = await supabase
      .from('offers')
      .update({ [field]: value || null })
      .eq('id', offerId)

    if (error) {
      logger.error('Error updating offer field', { error, entityId: offerId })
      return { success: false, error: 'Kunne ikke gemme' }
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme') }
  }
}

// Delete offer
export async function deleteOffer(id: string): Promise<ActionResult> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.delete')) {
      return { success: false, error: 'Manglende tilladelse: offers.delete' }
    }
    validateUUID(id, 'tilbud ID')

    // Get offer before deleting for audit log
    const { data: offer } = await supabase
      .from('offers')
      .select('title, offer_number, status')
      .eq('id', id)
      .maybeSingle()
    if (!offer) return { success: false, error: 'Tilbuddet blev ikke fundet' }

    // Tilbuds-review 2026-10-09 (#5): kun kladder og afviste tilbud kan slettes — et sendt/accepteret tilbud har
    // kundens underskrift (offer_signatures slettes kaskade) og sporbarhed fra sag/faktura (source_offer_id/offer_id)
    if (!DELETABLE_OFFER_STATUSES.includes((offer as { status: string }).status)) {
      return { success: false, error: 'Kun kladder og afviste tilbud kan slettes' }
    }

    // compare-and-set: status kan være ændret (fx sendt) siden læsningen
    const { data: deleted, error } = await supabase.from('offers').delete().eq('id', id)
      .in('status', DELETABLE_OFFER_STATUSES).select('id')
    if (!error && (!deleted || deleted.length === 0)) {
      return { success: false, error: 'Tilbuddet er ændret i mellemtiden — opdatér siden' }
    }

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet kan ikke slettes da det har tilknyttede data' }
      }
      logger.error('Database error deleting offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logDelete('offer', id, offer?.title || 'Ukendt', {
      offer_number: offer?.offer_number,
    })

    revalidatePath('/offers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette tilbud') }
  }
}

// Update offer status
export async function updateOfferStatus(
  id: string,
  status: OfferStatus,
  options?: { acknowledgeLowDb?: boolean },
): Promise<ActionResult<Offer>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(id, 'tilbud ID')

    // Fetch current status for transition validation
    const { data: current, error: fetchError } = await supabase
      .from('offers')
      .select('status, valid_until, converted_case_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !current) {
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }

    if (!isValidOfferTransition(current.status as OfferStatus, status)) {
      return {
        success: false,
        error: `Kan ikke ændre status fra "${OFFER_STATUS_LABELS[current.status as OfferStatus]}" til "${OFFER_STATUS_LABELS[status]}"`,
      }
    }

    // Tilbuds-review 2026-10-09 (#2): et tilbud der allerede er blevet til en sag kan ikke sendes tilbage til kladde
    // (og omprisses) — sagen beholdt ellers den gamle kontraktsum, og en senere accept returnerede den gamle sag
    if (status === 'draft' && (current as { converted_case_id?: string | null }).converted_case_id) {
      return { success: false, error: 'Tilbuddet er allerede oprettet som sag — lav et nyt tilbud (kopiér) i stedet' }
    }
    // Tilbuds-review 2026-10-09 (#7): et udløbet tilbud kan ikke sendes (portalen afviser accept) — forlæng gyldigheden
    if (status === 'sent' && isOfferExpired((current as { valid_until?: string | null }).valid_until)) {
      return { success: false, error: 'Tilbuddets gyldighed er udløbet — ret "Gyldig til" før afsendelse' }
    }

    // N8a (Henrik 2026-10-02): lav DB er en ADVARSEL, ikke en blokering — 'sent' med DB under minimum kræver bekræftelse
    let lowDbSent: OfferLowDbStatus | null = null
    if (status === 'sent') {
      const lowDb = await getOfferLowDbStatus(id)
      if (lowDb?.low) {
        if (!options?.acknowledgeLowDb) return { success: false, error: lowDbAckMessage(lowDb, hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) }
        lowDbSent = lowDb
      }
    }

    const updateData: Record<string, unknown> = { status }

    // Set timestamp based on status
    const now = new Date().toISOString()
    switch (status) {
      case 'sent':
        updateData.sent_at = now
        break
      case 'viewed':
        updateData.viewed_at = now
        break
      case 'accepted':
        updateData.accepted_at = now
        break
      case 'rejected':
        updateData.rejected_at = now
        break
      case 'draft':
        // Tilbuds-review 2026-10-09 (#7): afvist → kladde nulstiller afvisningen (portal-tidslinje/rapporter talte den)
        if (current.status === 'rejected') {
          updateData.rejected_at = null
          updateData.rejection_reason = null
        }
        break
    }

    const { data, error } = await supabase
      .from('offers')
      .update(updateData)
      .eq('id', id)
      // tilbuds-review 2026-10-07: kun hvis status er uændret siden læsningen — to samtidige klik (eller en portal-accept
      // imens) gav dobbelt lead-vundet/webhook/sag-oprettelse eller overskrev kundens svar
      .eq('status', current.status)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbuddets status er netop ændret — genindlæs siden' }
      }
      logger.error('Database error updating offer status', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      id,
      'status_change',
      `Status ændret til "${OFFER_STATUS_LABELS[status]}"`,
      userId,
      { newStatus: status }
    )

    // Audit log - especially important for accepted/rejected
    const auditAction = status === 'accepted' ? 'accept' : status === 'rejected' ? 'reject' : 'status_change'
    await createAuditLog({
      entity_type: 'offer',
      entity_id: id,
      entity_name: data.title,
      action: auditAction,
      action_description: `Tilbud ${OFFER_STATUS_LABELS[status].toLowerCase()}`,
      changes: { status: { old: 'previous', new: status } },
      metadata: {
        offer_number: data.offer_number,
        final_amount: data.final_amount,
        ...(lowDbSent ? { low_db_acknowledged: true, db_percentage: lowDbSent.dbPercentage, db_threshold: lowDbSent.threshold } : {}),
      },
    })

    // Trigger webhooks for status changes
    const webhookEventMap: Partial<Record<OfferStatus, 'offer.sent' | 'offer.viewed' | 'offer.accepted' | 'offer.rejected' | 'offer.expired'>> = {
      sent: 'offer.sent',
      viewed: 'offer.viewed',
      accepted: 'offer.accepted',
      rejected: 'offer.rejected',
      expired: 'offer.expired',
    }
    const webhookEvent = webhookEventMap[status]
    if (webhookEvent) await emitOfferEvent(supabase, id, webhookEvent)

    // Sprint 3D — auto-create service_case when transitioning to accepted.
    // Gated on transition (current → accepted, not already-accepted) so a
    // re-save does not retry. Idempotent at app + DB level. Non-critical:
    // failure does NOT roll back the status change.
    if (status === 'accepted' && current.status !== 'accepted') {
      // Salgspipeline: tilknyttede leads → vundet (service-role efter offers-gaten; kaster aldrig)
      {
        const { markLeadsWonForAcceptedOffer } = await import('@/lib/services/lead-won')
        await markLeadsWonForAcceptedOffer(createAdminClient(), id, userId)
      }
      try {
        const sagResult = await createServiceCaseFromOffer(id)
        if (!sagResult.success) {
          logger.error('Auto-create service_case failed', {
            error: sagResult.error,
            entity: 'offer',
            entityId: id,
          })
        }
      } catch (sagError) {
        logger.error('Service_case creation failed (non-critical)', {
          error: sagError,
          entity: 'offer',
          entityId: id,
        })
      }
    }

    // 00203 (staging): afsendelse via statusskift → snapshot + afløsning af forrige revision (no-op uden flag)
    if (status === 'sent') {
      const { recordOfferSent } = await import('@/lib/offers/revisions')
      await recordOfferSent(id, userId)
      const { markLeadProposalForSentOffer } = await import('@/lib/services/lead-won')
      await markLeadProposalForSentOffer(createAdminClient(), id, userId)
    }
    revalidatePath('/offers')
    revalidatePath(`/offers/${id}`)
    return { success: true, data: data as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere status') }
  }
}

// ==================== Line Items ====================

// Get line items for offer
export async function getOfferLineItems(
  offerId: string
): Promise<ActionResult<OfferLineItem[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }
    validateUUID(offerId, 'tilbud ID')

    // 00192: kun offentlige linjekolonner; kost flettes ind bag offers.view.cost_prices (før fik salg kosten her)
    const { data, error } = await supabase
      .from('offer_line_items')
      .select(OFFER_LINE_PUBLIC_COLUMNS)
      .eq('offer_id', offerId)
      .order('position')

    if (error) {
      logger.error('Database error fetching line items', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    const lines = (data || []) as unknown as OfferLineItem[]
    return { success: true, data: await mergeOfferLineCost(lines, hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente linjer') }
  }
}

// Create line item
export async function createLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }

    const offerId = formData.get('offer_id') as string
    if (!offerId) {
      return { success: false, error: 'Tilbud ID er påkrævet' }
    }
    validateUUID(offerId, 'tilbud ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }

    const rawData = {
      offer_id: offerId,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string || 'stk',
      unit_price: Number(formData.get('unit_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
    }

    const validated = createLineItemSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    // Calculate total (will also be done by trigger, but good to have client-side)
    const total = calculateLineTotal(validated.data.quantity, validated.data.unit_price, validated.data.discount_percentage || 0)

    // Extract supplier tracking fields if present.
    // cost_price er NOT NULL DEFAULT 0 i offer_line_items — manuelle linjer
    // uden leverandoer-data skal default til 0 (ikke NULL) for at undgaa 23502.
    // Tilbuds-review 2026-10-09 (#8): som updateLineItem (D43) — uden kost-ret (salg) ignoreres kost-/avancefelter fra
    // klienten (før kunne salg sætte cost_price=0 på vilkårlige linjer → kunstigt høj DB uden lav-DB-kvittering)
    const mayTouchCost = hasPermission(OFFER_COST_VISIBILITY_PERMISSION)
    const costPrice = mayTouchCost && formData.get('cost_price') ? Number(formData.get('cost_price')) : 0
    const supplierMargin = mayTouchCost && formData.get('supplier_margin_applied') ? Number(formData.get('supplier_margin_applied')) : null
    const supplierCostAtCreation = mayTouchCost && formData.get('supplier_cost_price_at_creation') ? Number(formData.get('supplier_cost_price_at_creation')) : null
    const supplierNameAtCreation = formData.get('supplier_name_at_creation') as string || null
    const imageUrl = formData.get('image_url') as string || null

    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({
        ...validated.data,
        total,
        // S1 (tilbuds-review 2026-10-07): sale_price = enhedsprisen (faktura-funktionen prissætter med sale_price; før 0)
        sale_price: validated.data.unit_price,
        cost_price: costPrice,
        supplier_margin_applied: supplierMargin,
        supplier_cost_price_at_creation: supplierCostAtCreation,
        supplier_name_at_creation: supplierNameAtCreation,
        image_url: imageUrl,
      })
      .select(OFFER_LINE_PUBLIC_COLUMNS) // 00192: ikke kostkolonner i return=representation
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      logger.error('Database error creating line item', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${validated.data.offer_id}`)
    return { success: true, data: await withLineCost(data as unknown as OfferLineItem, hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette linje') }
  }
}

// Update line item
export async function updateLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }

    const id = formData.get('id') as string
    const offerId = formData.get('offer_id') as string

    if (!id) {
      return { success: false, error: 'Linje ID mangler' }
    }
    validateUUID(id, 'linje ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (linjens EGET tilbud, ikke klientens offer_id)
    { const lineOffer = await offerIdForLine(supabase, id); const lock = lineOffer ? await offerEditLockReason(supabase, lineOffer) : 'Linjen blev ikke fundet'; if (lock) return { success: false, error: lock } }

    if (offerId) {
      validateUUID(offerId, 'tilbud ID')
    }

    const rawData = {
      id,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string || 'stk',
      unit_price: Number(formData.get('unit_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
    }

    const validated = updateLineItemSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: lineItemId, ...updateData } = validated.data

    // Calculate total
    const total = calculateLineTotal(updateData.quantity || 1, updateData.unit_price || 0, updateData.discount_percentage || 0)

    // Extract cost/margin tracking fields.
    // cost_price er NOT NULL DEFAULT 0 — undlad at sende feltet hvis det ikke
    // er i payloaden, saa eksisterende vaerdi bevares (i stedet for at saette
    // det til 0 paa update af ikke-leverandoer-linjer).
    // D43: uden offers.view.cost_prices (salg) har klienten aldrig set kost/avance → rør dem ikke (ellers ville en
    // redigering nulstille de skjulte værdier)
    const mayTouchCost = hasPermission(OFFER_COST_VISIBILITY_PERMISSION)
    const costPriceRaw = mayTouchCost ? formData.get('cost_price') : null
    const costPrice = costPriceRaw ? Number(costPriceRaw) : undefined
    const supplierMargin = formData.get('supplier_margin_applied') ? Number(formData.get('supplier_margin_applied')) : null
    const supplierCostAtCreation = formData.get('supplier_cost_price_at_creation') ? Number(formData.get('supplier_cost_price_at_creation')) : null
    const imageUrl = formData.get('image_url') as string || undefined

    const { data, error } = await supabase
      .from('offer_line_items')
      .update({
        ...updateData,
        total,
        // S1: sale_price følger enhedsprisen (ellers fakturerede faktura-funktionen den gamle pris)
        ...(updateData.unit_price !== undefined ? { sale_price: updateData.unit_price } : {}),
        ...(costPrice !== undefined ? { cost_price: costPrice } : {}),
        ...(mayTouchCost ? { supplier_margin_applied: supplierMargin } : {}),
        ...(mayTouchCost ? { supplier_cost_price_at_creation: supplierCostAtCreation } : {}),
        ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
      })
      .eq('id', lineItemId)
      .select(OFFER_LINE_PUBLIC_COLUMNS) // 00192: ikke kostkolonner i return=representation
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Linjen blev ikke fundet' }
      }
      logger.error('Database error updating line item', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: await withLineCost(data as unknown as OfferLineItem, hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere linje') }
  }
}

// Delete line item
export async function deleteLineItem(
  id: string,
  offerId: string
): Promise<ActionResult> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(id, 'linje ID')
    validateUUID(offerId, 'tilbud ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (linjens EGET tilbud)
    { const lineOffer = await offerIdForLine(supabase, id); const lock = lineOffer ? await offerEditLockReason(supabase, lineOffer) : 'Linjen blev ikke fundet'; if (lock) return { success: false, error: lock } }

    const { error } = await supabase
      .from('offer_line_items')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting line item', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette linje') }
  }
}

// ==================== Helpers ====================

// Get customers for dropdown
export async function getCustomersForSelect(): Promise<
  ActionResult<{ id: string; company_name: string; customer_number: string }[]>
> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')

    if (error) {
      logger.error('Database error fetching customers', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunder') }
  }
}

// Get leads for dropdown
export async function getLeadsForSelect(): Promise<
  ActionResult<{ id: string; company_name: string }[]>
> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('leads.view')) {
      return { success: false, error: 'Manglende tilladelse: leads.view' }
    }

    const { data, error } = await supabase
      .from('leads')
      .select('id, company_name')
      .not('status', 'in', '("won","lost")')
      .order('company_name')

    if (error) {
      logger.error('Database error fetching leads', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leads') }
  }
}

// ==================== Product & Calculation Integration ====================

// Add product to offer
export async function addProductToOffer(
  offerId: string,
  productId: string,
  quantity: number = 1,
  position?: number
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(offerId, 'tilbud ID')
    validateUUID(productId, 'produkt ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }

    // Get product details — 00201: kostprisen (til linjens kost) læses med admin-klienten bag offers.edit-gaten ovenfor;
    // den returneres ikke til salg (linjen svarer med OFFER_LINE_PUBLIC_COLUMNS)
    const { data: product, error: productError } = await createAdminClient()
      .from('product_catalog')
      .select('*')
      .eq('id', productId)
      .maybeSingle()

    if (productError) {
      logger.error('Database error fetching product', { error: productError })
      throw new Error('DATABASE_ERROR')
    }

    if (!product) {
      return { success: false, error: 'Produktet blev ikke fundet' }
    }

    // Get current max position if not specified
    let nextPosition = position
    if (nextPosition === undefined) {
      const { data: items } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)

      nextPosition = items && items.length > 0 ? items[0].position + 1 : 0
    }

    // Calculate total
    const total = quantity * product.list_price

    // Create line item
    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({
        offer_id: offerId,
        line_type: 'product',
        product_id: productId,
        position: nextPosition,
        description: product.name,
        quantity,
        unit: product.unit || 'stk',
        unit_price: product.list_price,
        sale_price: product.list_price, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
        cost_price: product.cost_price,
        discount_percentage: 0,
        total,
      })
      .select(OFFER_LINE_PUBLIC_COLUMNS) // 00192: ikke kostkolonner i return=representation
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      logger.error('Database error adding product to offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Produkt "${product.name}" tilføjet`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: await withLineCost(data as unknown as OfferLineItem, hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke tilføje produkt til tilbud') }
  }
}

/**
 * Kalkulations-review 2026-10-09 (#6): "Konverter til tilbud" på kalkulationssiden (model-A `calculations`) kaldte
 * convertCalculationToOffer, der læser `kalkia_calculations` → fejlede altid. Opretter en kladde til kalkulationens
 * kunde og importerer linjerne med importCalculationToOffer (rabat/avance-linjer, kost, sale_price); fejler importen,
 * slettes kladden igen.
 */
export async function createOfferFromCalculationRecord(
  calculationId: string
): Promise<ActionResult<{ offer_id: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.create')) return { success: false, error: 'Manglende tilladelse: offers.create' }
    if (!hasPermission('tools.calculations')) return { success: false, error: 'Manglende tilladelse: tools.calculations' }
    validateUUID(calculationId, 'kalkulation ID')

    const { data: calc } = await supabase
      .from('calculations')
      .select('id, name, description, customer_id, tax_percentage')
      .eq('id', calculationId)
      .maybeSingle()
    if (!calc) return { success: false, error: 'Kalkulation ikke fundet' }
    const c = calc as { id: string; name: string; description: string | null; customer_id: string | null; tax_percentage: number | null }
    if (!c.customer_id) return { success: false, error: 'Kalkulationen har ingen kunde — vælg en kunde på kalkulationen først' }

    const { data: offer, error } = await insertOfferWithNumber<{ id: string; offer_number: string }>(supabase, {
      title: c.name,
      description: c.description,
      customer_id: c.customer_id,
      orderer_customer_id: c.customer_id,
      end_customer_id: c.customer_id,
      payer_customer_id: c.customer_id,
      billing_mode: 'same_as_customer',
      status: 'draft',
      tax_percentage: c.tax_percentage ?? 25,
      discount_percentage: 0,
      created_by: userId,
    })
    if (error || !offer) {
      logger.error('createOfferFromCalculationRecord: offer insert failed', { error })
      return { success: false, error: 'Kunne ikke oprette tilbud' }
    }

    const imported = await importCalculationToOffer(offer.id, calculationId)
    if (!imported.success) {
      await supabase.from('offers').delete().eq('id', offer.id).eq('status', 'draft')
      return { success: false, error: imported.error || 'Kunne ikke importere kalkulationen' }
    }

    await logOfferActivity(offer.id, 'created', `Tilbud oprettet fra kalkulation "${c.name}"`, userId)
    revalidatePath('/dashboard/offers')
    return { success: true, data: { offer_id: offer.id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud fra kalkulation') }
  }
}


// Import all rows from a calculation to an offer
export async function importCalculationToOffer(
  offerId: string,
  calculationId: string,
  options?: {
    startingPosition?: number
    groupBySection?: boolean
    includeHiddenRows?: boolean
    includeCostPrices?: boolean
  }
): Promise<ActionResult<{ importedCount: number }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    // D48: kalkulationer er kun for tools.calculations (ikke salg)
    if (!hasPermission('tools.calculations')) {
      return { success: false, error: 'Manglende tilladelse: tools.calculations' }
    }
    validateUUID(offerId, 'tilbud ID')
    validateUUID(calculationId, 'kalkulation ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }

    // Get calculation with rows
    // 00200/00201: calculations/calculation_rows er rolle-scopet → admin-klient bag gaten (offers.edit + tools.calculations)
    const { data: calculation, error: calcError } = await createAdminClient()
      .from('calculations')
      .select('*, rows:calculation_rows(*)')
      .eq('id', calculationId)
      .maybeSingle()

    if (calcError) {
      logger.error('Database error fetching calculation', { error: calcError })
      throw new Error('DATABASE_ERROR')
    }

    if (!calculation) {
      return { success: false, error: 'Kalkulationen blev ikke fundet' }
    }

    // Extract options with defaults
    const startingPosition = options?.startingPosition
    const groupBySection = options?.groupBySection ?? calculation.group_by_section ?? false
    const includeHiddenRows = options?.includeHiddenRows ?? false
    // Kalkule-review 2026-10-08 (#2): kun tools.calculations (admin/serviceleder) kan importere — kost følger med som
    // standard (før null → DB/avance ~100 % på importerede linjer)
    const includeCostPrices = options?.includeCostPrices ?? true

    // Filter rows that should be shown on offer (unless includeHiddenRows is true)
    let rowsToImport = calculation.rows || []
    if (!includeHiddenRows) {
      rowsToImport = rowsToImport.filter(
        (row: { show_on_offer: boolean }) => row.show_on_offer
      )
    }

    if (rowsToImport.length === 0) {
      return { success: false, error: 'Ingen linjer at importere' }
    }

    // Sort rows by section if grouping is enabled
    if (groupBySection) {
      rowsToImport = [...rowsToImport].sort((a: { section: string | null }, b: { section: string | null }) => {
        if (!a.section && !b.section) return 0
        if (!a.section) return 1
        if (!b.section) return -1
        return a.section.localeCompare(b.section)
      })
    }

    // Get current max position if not specified
    let nextPosition = startingPosition
    if (nextPosition === undefined) {
      const { data: items } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)

      nextPosition = items && items.length > 0 ? items[0].position + 1 : 0
    }

    // Create line items from calculation rows
    // If grouping by section, add section headers
    const lineItems: Array<{
      offer_id: string
      line_type: string
      product_id: string | null
      calculation_id: string
      section: string | null
      position: number
      description: string
      quantity: number
      unit: string
      unit_price: number
      sale_price: number
      cost_price: number | null
      discount_percentage: number
      total: number
    }> = []

    let currentSection: string | null = null
    let positionCounter = nextPosition ?? 0

    for (const row of rowsToImport) {
      // Add section header if section changed and grouping is enabled
      if (groupBySection && row.section && row.section !== currentSection) {
        currentSection = row.section
        // Note: Section headers could be added here if the offer_line_items table supports them
        // For now, we just track the section in each row
      }

      lineItems.push({
        offer_id: offerId,
        line_type: row.product_id ? 'product' : 'calculation',
        product_id: row.product_id,
        calculation_id: calculationId,
        section: row.section,
        position: positionCounter++,
        description: row.description,
        quantity: row.hours || row.quantity, // Use hours if labor row
        unit: row.hours ? 'timer' : row.unit,
        unit_price: row.hourly_rate || row.sale_price, // Use hourly_rate if labor row
        sale_price: row.hourly_rate || row.sale_price, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
        cost_price: includeCostPrices ? row.cost_price : null,
        discount_percentage: row.discount_percentage,
        total: row.total,
      })
    }

    // Kalkule-review 2026-10-08 (#2): kalkulationens Avance % og Rabat % (update_calculation_totals: avance på subtotal,
    // rabat efter avance) blev tabt — tilbuddet blev subtotalen uden avance. Nu som eksplicitte linjer på de importerede rækker.
    {
      const importedSubtotal = Math.round(lineItems.reduce((sum, l) => sum + Number(l.total || 0), 0) * 100) / 100
      const marginPct = Number((calculation as { margin_percentage?: number | null }).margin_percentage ?? 0)
      const discountPct = Number((calculation as { discount_percentage?: number | null }).discount_percentage ?? 0)
      const marginAmt = Math.round(importedSubtotal * marginPct) / 100
      const discountAmt = Math.round((importedSubtotal + marginAmt) * discountPct) / 100
      const extra = (description: string, amount: number) => lineItems.push({
        offer_id: offerId, line_type: 'calculation', product_id: null, calculation_id: calculationId, section: null,
        position: positionCounter++, description, quantity: 1, unit: 'stk', unit_price: amount, sale_price: amount,
        cost_price: includeCostPrices ? 0 : null, discount_percentage: 0, total: amount,
      })
      if (marginAmt >= 0.01) extra(`Avance ${marginPct.toLocaleString('da-DK')} % iht. kalkulation`, marginAmt)
      if (discountAmt >= 0.01) extra(`Rabat ${discountPct.toLocaleString('da-DK')} % iht. kalkulation`, -discountAmt)
    }

    const { error: insertError } = await supabase
      .from('offer_line_items')
      .insert(lineItems)

    if (insertError) {
      if (insertError.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      logger.error('Database error importing calculation to offer', { error: insertError })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Kalkulation "${calculation.name}" importeret (${lineItems.length} linjer)`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: { importedCount: lineItems.length } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke importere kalkulation') }
  }
}

// =====================================================
// Supplier Product Integration
// =====================================================

/**
 * Create a line item from a supplier product.
 * Automatically applies margin rules and tracks supplier information.
 */
export async function createLineItemFromSupplierProduct(
  offerId: string,
  supplierProductId: string,
  quantity: number,
  options?: {
    customMarginPercentage?: number
    customDiscount?: number
    customDescription?: string
    position?: number
  }
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(offerId, 'tilbud ID')
    validateUUID(supplierProductId, 'leverandør produkt ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }

    // Get offer to check customer for custom pricing
    const { data: offer } = await supabase
      .from('offers')
      .select('customer_id')
      .eq('id', offerId)
      .maybeSingle()

    // Get supplier product with supplier info
    // 00192: kostkolonner — admin-klient: serverintern prisberegning bag offers.edit (salg tilføjer
    // leverandørvarer); kost/avance returneres ikke til salg (linjen strippes via withLineCost)
    const { data: supplierProduct, error: spError } = await createAdminClient()
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        supplier_name,
        cost_price,
        list_price,
        margin_percentage,
        unit,
        image_url,
        suppliers!inner (
          name,
          code
        )
      `)
      .eq('id', supplierProductId)
      .maybeSingle()

    if (spError || !supplierProduct) {
      return { success: false, error: 'Leverandør produkt ikke fundet' }
    }

    if (!supplierProduct.cost_price) {
      return { success: false, error: 'Produktet har ingen kostpris' }
    }

    // Get effective margin from rules engine (DB function with full hierarchy)
    // RBAC-review 2026-10-07: egen avance kun for kost-roller — salg kunne ellers sende ~0 % og læse den eksakte
    // kostpris som linjens salgspris (ingen UI sender feltet)
    const customMargin = hasPermission(OFFER_COST_VISIBILITY_PERMISSION) ? options?.customMarginPercentage : undefined
    let marginPercentage: number
    let effectiveCostPrice: number

    // Kalkulations-review 2026-10-09 (#1): fælles prisberegning (oprettelse = opdatering) — kundens leverandørrabat
    // gælder ALTID kostprisen (før blev den droppet, så snart en avanceregel fandtes for leverandøren)
    const pricing = await supplierLinePricing({
      supplierId: supplierProduct.supplier_id,
      supplierProductId,
      customerId: offer?.customer_id || null,
      costPrice: supplierProduct.cost_price,
      productMargin: supplierProduct.margin_percentage,
      customMargin,
    })
    marginPercentage = pricing.marginPercentage
    effectiveCostPrice = pricing.effectiveCost
    const unitPrice = pricing.unitPrice

    // Get next position if not provided
    let position = options?.position
    if (position === undefined) {
      const { data: maxPos } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      position = (maxPos?.position || 0) + 1
    }

    // Calculate total
    const discount = options?.customDiscount ?? 0
    const total = calculateLineTotal(quantity, unitPrice, discount)

    // Get supplier name
    const supplierInfo = Array.isArray(supplierProduct.suppliers)
      ? supplierProduct.suppliers[0]
      : supplierProduct.suppliers

    // Insert line item with supplier tracking
    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({
        offer_id: offerId,
        position,
        description: options?.customDescription || supplierProduct.supplier_name,
        quantity,
        unit: supplierProduct.unit || 'stk',
        unit_price: Math.round(unitPrice * 100) / 100,
        sale_price: Math.round(unitPrice * 100) / 100, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
        discount_percentage: discount,
        total,
        supplier_product_id: supplierProductId,
        // samme betydning som ved opdatering: cost_price = Eltas faktiske indkøbspris (efter kunde-/leverandørrabat)
        cost_price: Math.round(effectiveCostPrice * 100) / 100,
        supplier_cost_price_at_creation: supplierProduct.cost_price,
        supplier_margin_applied: marginPercentage,
        supplier_name_at_creation: supplierInfo?.name || null,
        image_url: supplierProduct.image_url || null,
      })
      .select(OFFER_LINE_PUBLIC_COLUMNS) // 00192: ikke kostkolonner i return=representation
      .single()

    if (error) {
      logger.error('Database error creating line item from supplier product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Tilføjet fra leverandør: ${supplierProduct.supplier_name} (${supplierProduct.supplier_sku})`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: await withLineCost(data as unknown as OfferLineItem, hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette linje fra leverandør produkt') }
  }
}

/**
 * Search supplier products and add to offer.
 * Returns matching products that can be added as line items.
 */
export async function searchSupplierProductsForOffer(
  query: string,
  options?: {
    supplierId?: string
    customerId?: string
    limit?: number
  }
): Promise<ActionResult<Array<{
  id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  margin_percentage: number
  estimated_sale_price: number
  unit: string
  is_available: boolean
  image_url: string | null
  /** N57: hvornår leverandørprisen sidst blev opdateret (forældede prislister, fx AO) */
  price_updated_at: string | null
  is_cheapest?: boolean
  alternatives?: Array<{
    supplier_code: string
    supplier_name: string
    cost_price: number
    supplier_sku: string
    id: string
  }>
}>>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }

    // Hent global produkt-avance fra indstillinger (auto-markup)
    const calcResult = await getCalculationSettings()
    const defaultProductMargin = calcResult.success && calcResult.data
      ? calcResult.data.margins.products
      : CALC_DEFAULTS.MARGINS.PRODUCTS

    // Search across ALL suppliers — increased limit for cross-supplier comparison
    const searchLimit = (options?.limit || 20) * 2
    // 00192: kostkolonner — admin-klient: kost bruges serverinternt til salgspris/sortering/"billigst" (bag
    // offers.view); kost/avance fjernes fra svaret for roller uden offers.view.cost_prices (D44 nedenfor).
    // RLS på supplier_products er USING (true) → samme rækker som bruger-klienten.
    let dbQuery = createAdminClient()
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        supplier_name,
        cost_price,
        list_price,
        margin_percentage,
        unit,
        is_available,
        image_url,
        ean,
        updated_at,
        suppliers!inner (
          name,
          code,
          is_active
        )
      `)
      .eq('suppliers.is_active', true)
      .or(`supplier_sku.ilike.${pgQuote(`%${sanitizeSearchTerm(query)}%`)},supplier_name.ilike.${pgQuote(`%${sanitizeSearchTerm(query)}%`)},ean.ilike.${pgQuote(`%${sanitizeSearchTerm(query)}%`)}`)
      .order('cost_price', { ascending: true })
      .limit(searchLimit)

    if (options?.supplierId) {
      validateUUID(options.supplierId, 'leverandør ID')
      dbQuery = dbQuery.eq('supplier_id', options.supplierId)
    }

    const { data, error } = await dbQuery

    if (error) {
      logger.error('Database error searching supplier products', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Get customer-specific pricing if customer provided
    let customerPricingMap = new Map<string, { discount: number; margin: number | null }>()
    if (options?.customerId) {
      validateUUID(options.customerId, 'kunde ID')

      const { data: customerPricing } = await createAdminClient() // 00201: kundeaftaler (rabat/avance) kun server-side bag gaten
        .from('customer_supplier_prices')
        .select('supplier_id, discount_percentage, custom_margin_percentage')
        .eq('customer_id', options.customerId)
        .eq('is_active', true)

      if (customerPricing) {
        customerPricingMap = new Map(
          customerPricing.map((cp) => [
            cp.supplier_id,
            { discount: cp.discount_percentage || 0, margin: cp.custom_margin_percentage }
          ])
        )
      }
    }

    // Transform results
    type SearchResult = {
      id: string
      supplier_id: string
      supplier_name: string
      supplier_code: string
      supplier_sku: string
      product_name: string
      cost_price: number
      list_price: number | null
      margin_percentage: number
      estimated_sale_price: number
      unit: string
      is_available: boolean
      image_url: string | null
      price_updated_at: string | null
      _ean?: string
      is_cheapest?: boolean
      alternatives?: Array<{
        supplier_code: string
        supplier_name: string
        cost_price: number
        supplier_sku: string
        id: string
      }>
    }
    const results: SearchResult[] = (data || []).map((sp) => {
      const supplier = Array.isArray(sp.suppliers) ? sp.suppliers[0] : sp.suppliers
      const customerPricing = customerPricingMap.get(sp.supplier_id)

      let effectiveCost = sp.cost_price || 0
      let margin = sp.margin_percentage || defaultProductMargin

      if (customerPricing) {
        effectiveCost = (sp.cost_price || 0) * (1 - customerPricing.discount / 100)
        if (customerPricing.margin !== null) {
          margin = customerPricing.margin
        }
      }

      return {
        id: sp.id,
        supplier_id: sp.supplier_id,
        supplier_name: supplier?.name || '',
        supplier_code: supplier?.code || '',
        supplier_sku: sp.supplier_sku,
        product_name: sp.supplier_name,
        cost_price: sp.cost_price || 0,
        list_price: sp.list_price,
        margin_percentage: margin,
        estimated_sale_price: calculateSalePrice(effectiveCost, margin),
        unit: sp.unit || 'stk',
        is_available: sp.is_available,
        image_url: sp.image_url || null,
        price_updated_at: (sp as { updated_at?: string | null }).updated_at ?? null,
        _ean: sp.ean || undefined,
      }
    })

    // If local results are sparse, also search live APIs and auto-import
    if (results.length < 3 && query.length >= 2) {
      try {
        const { SupplierAPIClientFactory } = await import('@/lib/services/supplier-api-client')

        // Find active suppliers with API credentials
        const { data: suppliers } = await supabase
          .from('suppliers')
          .select(`
            id, name, code,
            supplier_credentials!inner ( id, credential_type, is_active )
          `)
          .eq('is_active', true)
          .eq('supplier_credentials.is_active', true)
          .eq('supplier_credentials.credential_type', 'api')

        if (suppliers && suppliers.length > 0) {
          const existingSkus = new Set(results.map((r) => `${r.supplier_id}:${r.supplier_sku}`))
          const liveSearches = suppliers.map(async (supplier) => {
            try {
              const client = await SupplierAPIClientFactory.getClient(supplier.id, supplier.code)
              if (!client) return []
              const result = await client.searchProducts({ query: sanitizeSearchTerm(query), limit: 10 })
              return result.products
                .filter((p) => !existingSkus.has(`${supplier.id}:${p.sku}`))
                .map((p) => ({ ...p, _supplierId: supplier.id, _supplierName: supplier.name, _supplierCode: supplier.code }))
            } catch {
              return []
            }
          })

          const liveResults = (await Promise.allSettled(liveSearches))
            .flatMap((r) => r.status === 'fulfilled' ? r.value : [])

          // Auto-import live results into supplier_products so they get a DB id.
          // P-009: priserne kommer fra leverandoer-API'et (ikke brugeren) -> skrives som service-role; RLS laaser
          // supplier_products til admin. Laesning sker stadig med brugerens klient.
          const sys = createAdminClient()
          for (const lp of liveResults.slice(0, 15)) {
            const { data: existing } = await supabase
              .from('supplier_products')
              .select('id')
              .eq('supplier_id', lp._supplierId)
              .eq('supplier_sku', lp.sku)
              .maybeSingle()

            let productId: string
            if (existing) {
              productId = existing.id
              // Leverandør-review 2026-10-08 (#5): 0 = ingen prisaftale hos grossisten — overskriv aldrig en kendt kost med 0
              await sys.from('supplier_products').update({
                ...(Number(lp.costPrice) > 0 ? { cost_price: lp.costPrice } : {}),
                list_price: lp.listPrice,
                is_available: lp.isAvailable,
                lead_time_days: lp.leadTimeDays,
                last_synced_at: new Date().toISOString(),
              }).eq('id', existing.id)
            } else {
              // Kalkulations-review 2026-10-09 (#5): uden pris (0 = ingen prisaftale) oprettes varen ikke — en 0-kost-vare
              // kunne ellers vinde som "billigst" og give tilbudslinjer til 0 kr
              if (!(Number(lp.costPrice) > 0)) continue
              const { data: inserted } = await sys.from('supplier_products').insert({
                supplier_id: lp._supplierId,
                supplier_sku: lp.sku,
                supplier_name: lp.name,
                cost_price: lp.costPrice,
                list_price: lp.listPrice,
                unit: lp.unit || 'stk',
                is_available: lp.isAvailable,
                lead_time_days: lp.leadTimeDays,
                last_synced_at: new Date().toISOString(),
              }).select('id').single()
              if (!inserted) continue
              productId = inserted.id
            }

            const margin = defaultProductMargin
            const effectiveCost = lp.costPrice
            results.push({
              id: productId,
              supplier_id: lp._supplierId,
              supplier_name: lp._supplierName,
              supplier_code: lp._supplierCode,
              supplier_sku: lp.sku,
              product_name: lp.name,
              cost_price: lp.costPrice,
              list_price: lp.listPrice,
              margin_percentage: margin,
              estimated_sale_price: calculateSalePrice(effectiveCost, margin),
              unit: lp.unit || 'stk',
              is_available: lp.isAvailable,
              image_url: null,
              price_updated_at: new Date().toISOString(), // netop hentet live
              _ean: undefined,
            })
          }
        }
      } catch (liveErr) {
        logger.error('Live API search fallback failed', { error: liveErr })
      }
    }

    // Cross-supplier comparison: group by EAN, mark cheapest, add alternatives
    const eanGroups = new Map<string, typeof results>()
    const noEan: typeof results = []

    for (const r of results) {
      // Fetch EAN from raw data if not on result
      const eanKey = (r as Record<string, unknown>)._ean as string | undefined
      if (eanKey && eanKey.length > 5) {
        const group = eanGroups.get(eanKey) || []
        group.push(r)
        eanGroups.set(eanKey, group)
      } else {
        noEan.push(r)
      }
    }

    // Also try to group by normalized product name for products without EAN
    // (skip this for now — EAN is the reliable cross-supplier match)

    // Mark cheapest in each EAN group and attach alternatives
    for (const [, group] of eanGroups) {
      if (group.length <= 1) continue
      // Sort group by cost_price ascending
      group.sort((a, b) => (a.cost_price || Infinity) - (b.cost_price || Infinity))
      const cheapest = group[0]
      for (const item of group) {
        item.is_cheapest = item === cheapest
        item.alternatives = group
          .filter(alt => alt !== item)
          .map(alt => ({
            supplier_code: alt.supplier_code,
            supplier_name: alt.supplier_name,
            cost_price: alt.cost_price,
            supplier_sku: alt.supplier_sku,
            id: alt.id,
          }))
      }
    }

    // Also mark cheapest among all results when no EAN grouping
    // Simple: mark cheapest cost_price per product_name similarity
    if (results.length > 0) {
      // For ungrouped results, mark the overall cheapest
      const minCost = Math.min(...results.filter(r => r.cost_price > 0).map(r => r.cost_price))
      for (const r of results) {
        if (r.is_cheapest === undefined) {
          r.is_cheapest = r.cost_price === minCost && r.cost_price > 0
        }
      }
    }

    // Sort: cheapest cost_price first
    results.sort((a, b) => (a.cost_price || Infinity) - (b.cost_price || Infinity))

    // D44 (privacy/RBAC): netto-/kostpris og avance kun for offers.view.cost_prices — salg ser salgspris (rækkefølge
    // og "billigst"-markering bevares)
    if (!hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) {
      return { success: true, data: results.map((r) => ({
        ...r, cost_price: 0, margin_percentage: 0,
        alternatives: r.alternatives?.map((x) => ({ ...x, cost_price: 0 })),
      })) }
    }
    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgning fejlede') }
  }
}

/**
 * Live API search across all active suppliers with credentials.
 * Calls AO/LM APIs in parallel and merges results.
 * Falls back to local DB search on API failure.
 */
export async function searchSupplierProductsLive(
  query: string,
  options?: {
    supplierId?: string
    limit?: number
  }
): Promise<ActionResult<Array<{
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  margin_percentage: number
  estimated_sale_price: number
  unit: string
  is_available: boolean
  stock_quantity: number | null
  delivery_days: number | null
  image_url: string | null
  source: 'live' | 'cache'
}>>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }
    const sanitized = sanitizeSearchTerm(query)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    // Get global product margin for pricing
    const calcResult = await getCalculationSettings()
    const defaultMargin = calcResult.success && calcResult.data
      ? calcResult.data.margins.products
      : CALC_DEFAULTS.MARGINS.PRODUCTS

    // Find active suppliers with API credentials
    let supplierQuery = supabase
      .from('suppliers')
      .select(`
        id,
        name,
        code,
        supplier_credentials!inner (
          id,
          credential_type,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('supplier_credentials.is_active', true)
      .eq('supplier_credentials.credential_type', 'api')

    if (options?.supplierId) {
      validateUUID(options.supplierId, 'leverandør ID')
      supplierQuery = supplierQuery.eq('id', options.supplierId)
    }

    const { data: suppliers } = await supplierQuery

    if (!suppliers || suppliers.length === 0) {
      // No suppliers with API credentials — fallback to local DB
      const fallback = await searchSupplierProductsForOffer(query, { limit: options?.limit })
      if (!fallback.success || !fallback.data) return { success: true, data: [] }
      return {
        success: true,
        data: fallback.data.map((p) => ({
          supplier_id: p.supplier_id,
          supplier_name: p.supplier_name,
          supplier_code: p.supplier_code,
          supplier_sku: p.supplier_sku,
          product_name: p.product_name,
          cost_price: p.cost_price,
          list_price: p.list_price,
          margin_percentage: p.margin_percentage,
          estimated_sale_price: p.estimated_sale_price,
          unit: p.unit,
          is_available: p.is_available,
          stock_quantity: null,
          delivery_days: null,
          image_url: p.image_url,
          source: 'cache' as const,
        })),
      }
    }

    const limit = options?.limit || 10
    const { SupplierAPIClientFactory } = await import('@/lib/services/supplier-api-client')

    // Search all suppliers in parallel
    const searchPromises = suppliers.map(async (supplier) => {
      try {
        const client = await SupplierAPIClientFactory.getClient(supplier.id, supplier.code)
        if (!client) return []

        const result = await client.searchProducts({
          query: sanitized,
          limit,
        })

        return result.products.map((p) => ({
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          supplier_code: supplier.code,
          supplier_sku: p.sku,
          product_name: p.name,
          cost_price: p.costPrice,
          list_price: p.listPrice,
          margin_percentage: defaultMargin,
          estimated_sale_price: calculateSalePrice(p.costPrice, defaultMargin),
          unit: p.unit,
          is_available: p.isAvailable,
          stock_quantity: p.stockQuantity,
          delivery_days: p.leadTimeDays,
          image_url: p.imageUrl || null,
          source: 'live' as const,
        }))
      } catch (err) {
        logger.error(`Live search failed for ${supplier.name}`, { error: err })
        return []
      }
    })

    const results = await Promise.allSettled(searchPromises)
    const allProducts = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    )

    // If no live results, fallback to local DB
    if (allProducts.length === 0) {
      const fallback = await searchSupplierProductsForOffer(query, { limit: options?.limit })
      if (!fallback.success || !fallback.data) return { success: true, data: [] }
      return {
        success: true,
        data: fallback.data.map((p) => ({
          supplier_id: p.supplier_id,
          supplier_name: p.supplier_name,
          supplier_code: p.supplier_code,
          supplier_sku: p.supplier_sku,
          product_name: p.product_name,
          cost_price: p.cost_price,
          list_price: p.list_price,
          margin_percentage: p.margin_percentage,
          estimated_sale_price: p.estimated_sale_price,
          unit: p.unit,
          is_available: p.is_available,
          stock_quantity: null,
          delivery_days: null,
          image_url: p.image_url,
          source: 'cache' as const,
        })),
      }
    }

    const live = allProducts.slice(0, limit * 2)
    // D44 (privacy/RBAC): live-API-priser er netto — kost/avance kun for offers.view.cost_prices (fallback-grenene
    // stripper allerede via searchSupplierProductsForOffer)
    if (!hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) {
      return { success: true, data: live.map((p) => ({ ...p, cost_price: 0, margin_percentage: 0 })) }
    }
    return { success: true, data: live }
  } catch (err) {
    return { success: false, error: formatError(err, 'Live søgning fejlede') }
  }
}

/**
 * Update line item with fresh supplier price.
 * Recalculates the unit price based on current supplier cost and margin.
 */
export interface OfferSupplierPriceChange {
  lineId: string
  description: string
  oldCost: number
  newCost: number
  deltaPct: number
}

/**
 * N47: tilbudslinjer hvor leverandørens aktuelle nettopris afviger fra prisen da linjen blev lavet (±0,5 %). Kun
 * kostpris-roller (nettopriser). Bruges til at advare før et kladde-tilbud sendes med forældede priser.
 */
export async function getOfferSupplierPriceChanges(offerId: string): Promise<ActionResult<OfferSupplierPriceChange[]>> {
  try {
    const { hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }
    validateUUID(offerId, 'tilbud ID')
    // 00192: kostkolonner — admin-klient bag offers.view.cost_prices
    const admin = createAdminClient()
    const { data: lines, error } = await admin.from('offer_line_items')
      .select('id, description, supplier_product_id, supplier_cost_price_at_creation').eq('offer_id', offerId).not('supplier_product_id', 'is', null)
    if (error) return { success: false, error: 'Kunne ikke hente tilbudslinjer' }
    const rows = (lines ?? []) as Array<{ id: string; description: string; supplier_product_id: string; supplier_cost_price_at_creation: number | string | null }>
    if (!rows.length) return { success: true, data: [] }
    const { data: sps } = await admin.from('supplier_products').select('id, cost_price').in('id', Array.from(new Set(rows.map((r) => r.supplier_product_id))))
    const current = new Map(((sps ?? []) as Array<{ id: string; cost_price: number | string | null }>).map((p) => [p.id, Number(p.cost_price ?? 0)]))
    const out: OfferSupplierPriceChange[] = []
    for (const r of rows) {
      const oldCost = Number(r.supplier_cost_price_at_creation ?? 0)
      const newCost = current.get(r.supplier_product_id) ?? 0
      if (!(oldCost > 0) || !(newCost > 0)) continue
      const deltaPct = Math.round(((newCost - oldCost) / oldCost) * 1000) / 10
      if (Math.abs(deltaPct) >= 0.5) out.push({ lineId: r.id, description: r.description, oldCost, newCost, deltaPct })
    }
    return { success: true, data: out }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prisændringer') }
  }
}

export async function refreshLineItemPrice(
  lineItemId: string
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    // 00192: prisopdateringen kræver leverandørkost + anvendt avance (kostkolonner). Kun kostpris-roller — UI'et
    // (N47 offer-supplier-price-changes) vises allerede kun bag offers.view.cost_prices.
    if (!hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) {
      return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }
    }
    validateUUID(lineItemId, 'linje ID')

    // Henrik 2026-10-07: kun kladder kan redigeres
    { const lineOffer = await offerIdForLine(supabase, lineItemId); const lock = lineOffer ? await offerEditLockReason(supabase, lineOffer) : 'Linjen blev ikke fundet'; if (lock) return { success: false, error: lock } }

    // Get line item with supplier product link (00192: supplier_margin_applied hentes separat via admin-klient)
    const { data: lineItem, error: liError } = await supabase
      .from('offer_line_items')
      .select(`
        id,
        offer_id,
        quantity,
        discount_percentage,
        supplier_product_id,
        offers!inner (
          customer_id,
          status
        )
      `)
      .eq('id', lineItemId)
      .maybeSingle()

    if (liError || !lineItem) {
      return { success: false, error: 'Linje ikke fundet' }
    }

    // N47: kun kladder — et sendt tilbud er et løfte til kunden; prisen ændres ikke bag kundens ryg
    const offerStatus = (Array.isArray(lineItem.offers) ? lineItem.offers[0] : lineItem.offers)?.status
    if (offerStatus && offerStatus !== 'draft') {
      return { success: false, error: 'Kun kladder kan opdateres med ny leverandørpris' }
    }

    if (!lineItem.supplier_product_id) {
      return { success: false, error: 'Linjen er ikke knyttet til et leverandør produkt' }
    }

    // Get current supplier product price
    // 00192: kostkolonner — admin-klient bag offers.view.cost_prices
    const { data: supplierProduct, error: spError } = await createAdminClient()
      .from('supplier_products')
      .select('cost_price, supplier_id, margin_percentage')
      .eq('id', lineItem.supplier_product_id)
      .maybeSingle()
    const lineCost = (await fetchOfferLineCostById([lineItem.id])).get(lineItem.id)

    if (spError || !supplierProduct?.cost_price) {
      return { success: false, error: 'Kunne ikke hente leverandør pris' }
    }

    // Kalkulations-review 2026-10-09 (#2): samme prisberegning som ved oprettelse (avanceregler med fast tillæg/
    // afrunding, kunderabat, 0 % respekteres) — før gav en opdatering med uændret kost en anden pris
    const offerInfo = Array.isArray(lineItem.offers) ? lineItem.offers[0] : lineItem.offers
    void lineCost
    const pricing = await supplierLinePricing({
      supplierId: supplierProduct.supplier_id,
      supplierProductId: lineItem.supplier_product_id,
      customerId: offerInfo?.customer_id || null,
      costPrice: supplierProduct.cost_price,
      productMargin: (supplierProduct as { margin_percentage?: number | null }).margin_percentage ?? null,
    })
    const effectiveCostPrice = pricing.effectiveCost
    const marginPercentage = pricing.marginPercentage
    const newUnitPrice = pricing.unitPrice
    const discount = lineItem.discount_percentage || 0
    const total = calculateLineTotal(lineItem.quantity, newUnitPrice, discount)

    // Update line item
    const { data, error } = await supabase
      .from('offer_line_items')
      .update({
        unit_price: newUnitPrice,
        sale_price: newUnitPrice, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
        total,
        // N47: kost opdateres begge steder — cost_price er det DB-beregningen bruger først
        cost_price: Math.round(effectiveCostPrice * 100) / 100,
        supplier_cost_price_at_creation: supplierProduct.cost_price,
        supplier_margin_applied: marginPercentage,
      })
      .eq('id', lineItemId)
      .select(OFFER_LINE_PUBLIC_COLUMNS) // 00192: ikke kostkolonner i return=representation
      .single()

    if (error) {
      logger.error('Database error updating line item price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      lineItem.offer_id,
      'updated',
      `Pris opdateret fra leverandør`,
      userId
    )

    revalidatePath(`/offers/${lineItem.offer_id}`)
    return { success: true, data: await withLineCost(data as unknown as OfferLineItem, hasPermission) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere pris') }
  }
}

// =====================================================
// Optimize Offer Prices (cross-supplier)
// =====================================================

export interface OptimizationResult {
  lines_checked: number
  lines_optimized: number
  old_total_cost: number
  new_total_cost: number
  savings: number
  changes: Array<{
    line_id: string
    description: string
    old_supplier: string
    new_supplier: string
    old_cost: number
    new_cost: number
    saving: number
  }>
}

/**
 * Optimize all line items on an offer by finding the cheapest supplier
 * for each product (matching by EAN or name) across AO + Lemvigh-Müller.
 */
export async function optimizeOfferPrices(
  offerId: string
): Promise<ActionResult<OptimizationResult>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    // D48: resultatet er gammel/ny nettokost og besparelse pr. linje → kun kostpris-roller
    if (!hasPermission(OFFER_COST_VISIBILITY_PERMISSION)) {
      return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }
    }
    validateUUID(offerId, 'tilbuds ID')

    // Henrik 2026-10-07: kun kladder kan redigeres (lib/offers/edit-lock.ts)
    { const lock = await offerEditLockReason(supabase, offerId); if (lock) return { success: false, error: lock } }
    // 00192: kostkolonner — admin-klient bag offers.view.cost_prices (kun læsninger; skrivninger med bruger-klienten)
    const admin = createAdminClient()

    // Get offer with line items
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id')
      .eq('id', offerId)
      .maybeSingle()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status !== 'draft') {
      return { success: false, error: 'Kan kun optimere tilbud i kladde-status' }
    }

    // Get all line items with supplier links
    const { data: lineItems, error: liError } = await admin
      .from('offer_line_items')
      .select(`
        id,
        description,
        quantity,
        unit_price,
        discount_percentage,
        cost_price,
        supplier_product_id,
        supplier_cost_price_at_creation,
        supplier_margin_applied,
        supplier_name_at_creation
      `)
      .eq('offer_id', offerId)
      .order('position')

    if (liError || !lineItems) {
      return { success: false, error: 'Kunne ikke hente tilbudslinjer' }
    }

    // Get supplier products linked to line items
    const supplierProductIds = lineItems
      .filter(li => li.supplier_product_id)
      .map(li => li.supplier_product_id!)

    if (supplierProductIds.length === 0) {
      return {
        success: true,
        data: {
          lines_checked: lineItems.length,
          lines_optimized: 0,
          old_total_cost: 0,
          new_total_cost: 0,
          savings: 0,
          changes: [],
        },
      }
    }

    // Fetch current supplier products with EAN + supplier info
    const { data: supplierProducts } = await admin
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        supplier_name,
        cost_price,
        ean,
        suppliers ( name, code )
      `)
      .in('id', supplierProductIds)

    const spMap = new Map((supplierProducts || []).map(sp => [sp.id, sp]))

    // Get customer-specific pricing
    let customerPricingMap = new Map<string, { discount: number; margin: number | null }>()
    if (offer.customer_id) {
      const { data: customerPricing } = await createAdminClient() // 00201: kundeaftaler (rabat/avance) kun server-side bag gaten
        .from('customer_supplier_prices')
        .select('supplier_id, discount_percentage, custom_margin_percentage')
        .eq('customer_id', offer.customer_id)
        .eq('is_active', true)

      if (customerPricing) {
        customerPricingMap = new Map(
          customerPricing.map(cp => [
            cp.supplier_id,
            { discount: cp.discount_percentage || 0, margin: cp.custom_margin_percentage }
          ])
        )
      }
    }

    const changes: OptimizationResult['changes'] = []
    let oldTotalCost = 0
    let newTotalCost = 0

    for (const li of lineItems) {
      if (!li.supplier_product_id) continue

      const currentSP = spMap.get(li.supplier_product_id)
      if (!currentSP || !currentSP.cost_price) continue

      const currentSupplier = Array.isArray(currentSP.suppliers) ? currentSP.suppliers[0] : currentSP.suppliers
      const currentCost = currentSP.cost_price
      oldTotalCost += currentCost * li.quantity

      // Try to find cheaper alternatives by EAN or product name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cheaperProduct: any = null

      if (currentSP.ean && currentSP.ean.length > 5) {
        // Search by EAN across all suppliers
        const { data: alternatives } = await admin
          .from('supplier_products')
          .select(`
            id,
            supplier_id,
            supplier_sku,
            supplier_name,
            cost_price,
            ean,
            suppliers ( name, code )
          `)
          .eq('ean', currentSP.ean)
          .eq('is_available', true)
          .gt('cost_price', 0)
          .neq('id', currentSP.id)
          .order('cost_price', { ascending: true })
          .limit(1)

        if (alternatives && alternatives.length > 0 && alternatives[0].cost_price < currentCost) {
          cheaperProduct = alternatives[0]
        }
      }

      // Also search by similar name if no EAN match
      if (!cheaperProduct && currentSP.supplier_name) {
        const searchName = currentSP.supplier_name.substring(0, 30).replace(/[%_]/g, '')
        if (searchName.length >= 5) {
          const { data: nameAlts } = await admin
            .from('supplier_products')
            .select(`
              id,
              supplier_id,
              supplier_sku,
              supplier_name,
              cost_price,
              ean,
              suppliers ( name, code )
            `)
            .ilike('supplier_name', `%${searchName}%`)
            .eq('is_available', true)
            .gt('cost_price', 0)
            .neq('supplier_id', currentSP.supplier_id)
            .order('cost_price', { ascending: true })
            .limit(1)

          if (nameAlts && nameAlts.length > 0 && nameAlts[0].cost_price < currentCost) {
            cheaperProduct = nameAlts[0]
          }
        }
      }

      if (cheaperProduct) {
        const newSupplier = Array.isArray(cheaperProduct.suppliers) ? cheaperProduct.suppliers[0] : cheaperProduct.suppliers
        const newCost = cheaperProduct.cost_price!

        // Apply customer-specific pricing
        const customerPrice = customerPricingMap.get(cheaperProduct.supplier_id)
        let effectiveCost = newCost
        let margin = li.supplier_margin_applied || CALC_DEFAULTS.MARGINS.PRODUCTS
        if (customerPrice) {
          effectiveCost = newCost * (1 - customerPrice.discount / 100)
          if (customerPrice.margin !== null) margin = customerPrice.margin
        }

        const newUnitPrice = calculateSalePrice(effectiveCost, margin)
        const discount = li.discount_percentage || 0
        const total = calculateLineTotal(li.quantity, newUnitPrice, discount)

        // Update line item to use cheaper supplier
        await supabase
          .from('offer_line_items')
          .update({
            unit_price: newUnitPrice,
            sale_price: newUnitPrice, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
            total,
            cost_price: newCost,
            supplier_product_id: cheaperProduct.id,
            supplier_cost_price_at_creation: newCost,
            supplier_margin_applied: margin,
            supplier_name_at_creation: newSupplier?.name || null,
          })
          .eq('id', li.id)

        const saving = (currentCost - newCost) * li.quantity

        changes.push({
          line_id: li.id,
          description: li.description,
          old_supplier: currentSupplier?.code || currentSupplier?.name || '?',
          new_supplier: newSupplier?.code || newSupplier?.name || '?',
          old_cost: currentCost,
          new_cost: newCost,
          saving,
        })

        newTotalCost += newCost * li.quantity
      } else {
        // Also update to latest price from current supplier
        if (currentCost !== li.supplier_cost_price_at_creation) {
          const customerPrice = customerPricingMap.get(currentSP.supplier_id)
          let effectiveCost = currentCost
          let margin = li.supplier_margin_applied || CALC_DEFAULTS.MARGINS.PRODUCTS
          if (customerPrice) {
            effectiveCost = currentCost * (1 - customerPrice.discount / 100)
            if (customerPrice.margin !== null) margin = customerPrice.margin
          }

          const newUnitPrice = calculateSalePrice(effectiveCost, margin)
          const discount = li.discount_percentage || 0
          const total = calculateLineTotal(li.quantity, newUnitPrice, discount)

          await supabase
            .from('offer_line_items')
            .update({
              unit_price: newUnitPrice,
              sale_price: newUnitPrice, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
              total,
              cost_price: currentCost,
              supplier_cost_price_at_creation: currentCost,
            })
            .eq('id', li.id)
        }
        newTotalCost += currentCost * li.quantity
      }
    }

    // Recalculate offer totals
    const { data: updatedLines } = await supabase
      .from('offer_line_items')
      .select('total')
      .eq('offer_id', offerId)

    if (updatedLines) {
      const newTotal = updatedLines.reduce((sum, li) => sum + (li.total || 0), 0)
      await supabase
        .from('offers')
        .update({ total_amount: newTotal })
        .eq('id', offerId)
    }

    // Log activity
    if (changes.length > 0) {
      const totalSaved = changes.reduce((sum, c) => sum + c.saving, 0)
      await logOfferActivity(
        offerId,
        'updated',
        `Prisoptimering: ${changes.length} linjer skiftet til billigste leverandør. Samlet besparelse: ${totalSaved.toFixed(2)} kr`,
        userId
      )
    }

    const savings = oldTotalCost - newTotalCost

    revalidatePath(`/offers/${offerId}`)

    return {
      success: true,
      data: {
        lines_checked: lineItems.filter(li => li.supplier_product_id).length,
        lines_optimized: changes.length,
        old_total_cost: oldTotalCost,
        new_total_cost: newTotalCost,
        savings,
        changes,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Prisoptimering fejlede') }
  }
}

// =====================================================
// Sprint Ø7.3 — Dashboardwidget: tilbud klar til sag (cost-free)
// =====================================================

export interface OfferConversionSummary {
  ok: boolean
  message?: string
  /** Tilbud klar til sag: status sent/viewed/accepted, uden converted_case_id. */
  ready_count: number
  /** Tilbud konverteret de seneste 30 dage. */
  converted_30d: number
  /** Seneste tilbud klar til sag (kun salgs-/visningsdata — ingen kost). */
  latest_ready: {
    id: string
    offer_number: string | null
    customer_name: string | null
    amount: number | null
    created_at: string | null
  } | null
}

const CONVERSION_READY_STATUSES = ['sent', 'viewed', 'accepted']

/**
 * Cost-free sammenfatning til dashboard-widgeten. Tællere matcher PRÆCIST
 * Ø7.1/Ø7.2 badge/filter-logikken (converted_case_id + status). Read-only,
 * ingen audit. final_amount = salgssum (må vises) — ALDRIG intern kost.
 */
export async function getOfferConversionSummaryAction(): Promise<OfferConversionSummary> {
  const empty: OfferConversionSummary = {
    ok: false, ready_count: 0, converted_30d: 0, latest_ready: null,
  }
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('offers.view')) {
    return { ...empty, message: 'Manglende tilladelse: offers.view' }
  }

  // ready_count — head count, ingen rækker hentet (O(1), ingen N+1).
  let readyCount = 0
  try {
    const { count } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('is_proposal', false)
      .is('converted_case_id', null)
      .in('status', CONVERSION_READY_STATUSES)
    readyCount = count ?? 0
  } catch (e) {
    logger.error('getOfferConversionSummaryAction: ready count failed', { error: e })
  }

  // converted_30d — head count på converted_at.
  let converted30d = 0
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString()
    const { count } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('is_proposal', false)
      .not('converted_case_id', 'is', null)
      .gte('converted_at', since)
    converted30d = count ?? 0
  } catch (e) {
    logger.error('getOfferConversionSummaryAction: converted_30d count failed', { error: e })
  }

  // latest_ready — ét opslag med kunde-embed (cost-free kolonner).
  let latestReady: OfferConversionSummary['latest_ready'] = null
  try {
    const { data } = await supabase
      .from('offers')
      .select('id, offer_number, final_amount, created_at, customer:customers!offers_customer_id_fkey(company_name, contact_person)')
      .eq('is_proposal', false)
      .is('converted_case_id', null)
      .in('status', CONVERSION_READY_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      const cust = (data as { customer?: { company_name?: string | null; contact_person?: string | null } | { company_name?: string | null; contact_person?: string | null }[] | null }).customer
      const c = Array.isArray(cust) ? cust[0] : cust
      latestReady = {
        id: data.id as string,
        offer_number: (data.offer_number as string | null) ?? null,
        customer_name: (c?.company_name as string | null) || (c?.contact_person as string | null) || null,
        amount: (data.final_amount as number | null) ?? null,
        created_at: (data.created_at as string | null) ?? null,
      }
    }
  } catch (e) {
    logger.error('getOfferConversionSummaryAction: latest_ready failed', { error: e })
  }

  return { ok: true, ready_count: readyCount, converted_30d: converted30d, latest_ready: latestReady }
}

// =====================================================
// Kopiér tilbud — ny kladde med samme kunde og linjer
// =====================================================

/** Header-felter der følger med en kopi. Status, nummer, tidsstempler, signatur-/afvisnings-
 *  data, sags-kobling og påmindelser følger IKKE med — kopien er en ny, ren kladde. */
const DUPLICATE_HEADER_FIELDS = [
  'description', 'scope', 'customer_id', 'lead_id', 'discount_percentage', 'tax_percentage', 'currency',
  'terms_and_conditions', 'notes', 'orderer_customer_id', 'end_customer_id', 'payer_customer_id', 'billing_mode',
] as const

/** Linjefelter der kopieres (inkl. kostpris/leverandørspor; total beregnes af trigger). */
const DUPLICATE_LINE_FIELDS = [
  'position', 'description', 'quantity', 'unit', 'unit_price', 'discount_percentage', 'total', 'line_type',
  'product_id', 'calculation_id', 'section', 'cost_price', 'notes', 'supplier_product_id',
  'supplier_cost_price_at_creation', 'supplier_margin_applied', 'supplier_name_at_creation', 'image_url',
  'material_id', 'margin_percentage', 'sale_price',
] as const

export async function duplicateOfferAction(offerId: string): Promise<ActionResult<{ id: string; offer_number: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.create') || !hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.create' }
    }
    validateUUID(offerId, 'tilbud ID')

    const { data: src, error: srcErr } = await supabase
      .from('offers')
      .select(['id', 'title', 'offer_number', ...DUPLICATE_HEADER_FIELDS].join(', '))
      .eq('id', offerId)
      .maybeSingle()
    if (srcErr || !src) return { success: false, error: 'Tilbud ikke fundet' }
    const source = src as unknown as Record<string, unknown> & { title: string; offer_number: string }

    // 00192: kostkolonner — admin-klient bag offers.create+offers.view: kosten kopieres 1:1 til kopien (skrivning),
    // værdierne returneres aldrig til brugeren. Kildetilbuddet er læst med bruger-klienten ovenfor.
    const { data: lines, error: linesErr } = await createAdminClient()
      .from('offer_line_items')
      .select(DUPLICATE_LINE_FIELDS.join(', '))
      .eq('offer_id', offerId)
      .order('position', { ascending: true })
    if (linesErr) return { success: false, error: 'Kunne ikke læse tilbudslinjer' }

    // Gyldighed fra firmaets standard (ikke den gamle dato, der typisk er udløbet)
    const { data: cs } = await supabase.from('company_settings').select('default_offer_validity_days').maybeSingle()
    const days = Number((cs as { default_offer_validity_days?: number | null } | null)?.default_offer_validity_days ?? 30) || 30
    // dansk kalenderdato (før UTC → en dag for tidligt ved kopi mellem kl. 00 og 02)
    const validUntil = copenhagenDatePlusDays(days)

    const insertData: Record<string, unknown> = {
      title: `${source.title} (kopi)`.slice(0, 200),
      status: 'draft',
      valid_until: validUntil,
      created_by: userId,
    }
    for (const f of DUPLICATE_HEADER_FIELDS) {
      if (source[f] !== null && source[f] !== undefined) insertData[f] = source[f]
    }

    const { data: created, error: insErr } = await insertOfferWithNumber<Offer>(supabase, insertData, '*')
    if (insErr || !created) {
      logger.error('duplicateOffer: insert failed', { error: insErr, entityId: offerId })
      return { success: false, error: 'Kunne ikke oprette kopien' }
    }

    const lineRows = ((lines ?? []) as unknown as Array<Record<string, unknown>>).map((l) => ({ ...l, offer_id: created.id }))
    if (lineRows.length > 0) {
      const { error: lineErr } = await supabase.from('offer_line_items').insert(lineRows)
      if (lineErr) {
        // Ingen halv kopi: ryd den nye kladde op igen
        await supabase.from('offers').delete().eq('id', created.id)
        logger.error('duplicateOffer: line insert failed', { error: lineErr, entityId: offerId })
        return { success: false, error: 'Kunne ikke kopiere tilbudslinjerne' }
      }
    }

    await logOfferActivity(created.id, 'created', `Kopieret fra ${source.offer_number}`, userId)
    await logCreate('offer', created.id, created.title, { offer_number: created.offer_number, duplicated_from: offerId })
    revalidatePath('/dashboard/offers')
    return { success: true, data: { id: created.id, offer_number: created.offer_number } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke kopiere tilbud') }
  }
}

// =====================================================
// Standardværdier til tilbudsformularen (gyldighed, moms, betingelser)
// =====================================================

/**
 * Formularen fik firmaindstillingerne via getCompanySettings (kræver settings.view) → for salg var
 * de null, så sælgers tilbud fik INGEN gyldighedsdato og ingen standardbetingelser. Her kun de tre
 * offentlige felter formularen bruger, via service-role efter offers.create-gaten.
 */
export async function getOfferFormDefaultsAction(): Promise<{
  default_offer_validity_days: number | null
  default_tax_percentage: number | null
  default_terms_and_conditions: string | null
} | null> {
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('offers.create')) return null
  const { data } = await createAdminClient()
    .from('company_settings')
    .select('default_offer_validity_days, default_tax_percentage, default_terms_and_conditions')
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const d = data as { default_offer_validity_days: number | null; default_tax_percentage: number | null; default_terms_and_conditions: string | null }
  return {
    default_offer_validity_days: d.default_offer_validity_days ?? null,
    default_tax_percentage: d.default_tax_percentage ?? null,
    default_terms_and_conditions: d.default_terms_and_conditions ?? null,
  }
}

// =====================================================
// 00203 — Tilbudsrevisioner (STAGING; feature-flag OFFER_REVISIONS_ENABLED)
// =====================================================

/** Ny revision af et sendt tilbud (sendt version forbliver uændret). */
export async function createOfferRevisionAction(offerId: string): Promise<ActionResult<{ id: string; offer_number: string }>> {
  try {
    const { userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.create') || !hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(offerId, 'tilbud ID')
    const { createOfferRevision } = await import('@/lib/offers/revisions')
    const res = await createOfferRevision(offerId, userId)
    if (!res.ok) return { success: false, error: res.error }
    await logCreate('offer', res.id, res.offer_number, { revision_of: offerId })
    revalidatePath('/dashboard/offers')
    revalidatePath(`/dashboard/offers/${offerId}`)
    return { success: true, data: { id: res.id, offer_number: res.offer_number } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette revision') }
  }
}

/** Revisionshistorik (kæde + hvornår hver revision blev sendt). */
export async function getOfferRevisionHistoryAction(offerId: string): Promise<ActionResult<Array<{ id: string; offer_number: string; revision_number: number; status: string; superseded_at: string | null; snapshot_sent_at: string | null }>>> {
  try {
    const { hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) return { success: false, error: 'Manglende tilladelse: offers.view' }
    validateUUID(offerId, 'tilbud ID')
    const { getRevisionHistory } = await import('@/lib/offers/revisions')
    return { success: true, data: await getRevisionHistory(offerId) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente revisioner') }
  }
}

/**
 * Kalkulations-review 2026-10-09 (#1/#2): ÉN prisberegning for leverandørlinjer (oprettelse og opdatering).
 *   kost (effektiv) = leverandørens kostpris × (1 − kundens leverandørrabat)
 *   avance = egen avance (kost-roller) → avanceregel (inkl. fast tillæg/afrunding) → kundens aftale-avance → produktets
 *   avance → standard. Kost/aftaler læses med admin-klienten bag kaldernes gate (00192/00201).
 */
async function supplierLinePricing(input: {
  supplierId: string
  supplierProductId: string
  customerId: string | null
  costPrice: number
  productMargin: number | null | undefined
  customMargin?: number
}): Promise<{ unitPrice: number; marginPercentage: number; effectiveCost: number }> {
  const admin = createAdminClient()
  const [{ data: marginData }, customerRes] = await Promise.all([
    admin.rpc('get_effective_margin', {
      p_supplier_id: input.supplierId,
      p_supplier_product_id: input.supplierProductId,
      p_category: null,
      p_sub_category: null,
      p_customer_id: input.customerId,
    }),
    input.customerId
      ? admin.from('customer_supplier_prices').select('discount_percentage, custom_margin_percentage')
          .eq('customer_id', input.customerId).eq('supplier_id', input.supplierId).eq('is_active', true).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const agreement = customerRes.data as { discount_percentage: number | null; custom_margin_percentage: number | null } | null
  const discountPct = Number(agreement?.discount_percentage ?? 0)
  const effectiveCost = discountPct > 0 ? input.costPrice * (1 - discountPct / 100) : input.costPrice

  const rule = (marginData as Array<{ margin_percentage: number; fixed_markup: number | null; round_to: number | null }> | null)?.[0]
  let marginPercentage: number
  let fixedMarkup = 0
  let roundTo: number | undefined
  if (input.customMargin !== undefined && input.customMargin !== null) {
    marginPercentage = input.customMargin
  } else if (rule) {
    marginPercentage = Number(rule.margin_percentage)
    fixedMarkup = Number(rule.fixed_markup ?? 0)
    roundTo = rule.round_to ?? undefined
  } else if (agreement?.custom_margin_percentage !== null && agreement?.custom_margin_percentage !== undefined) {
    marginPercentage = Number(agreement.custom_margin_percentage)
  } else {
    marginPercentage = input.productMargin ?? CALC_DEFAULTS.MARGINS.PRODUCTS
  }
  const unitPrice = Math.round(calculateSalePrice(effectiveCost, marginPercentage, { fixedMarkup, roundTo }) * 100) / 100
  return { unitPrice, marginPercentage, effectiveCost }
}
