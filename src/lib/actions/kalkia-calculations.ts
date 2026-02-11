'use server'

import { revalidatePath } from 'next/cache'
import {
  createKalkiaCalculationSchema,
  updateKalkiaCalculationSchema,
} from '@/lib/validations/kalkia'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import type {
  KalkiaNode,
  KalkiaVariant,
  KalkiaVariantMaterial,
  KalkiaBuildingProfile,
  KalkiaGlobalFactor,
  KalkiaRule,
  KalkiaCalculation,
  KalkiaCalculationWithRelations,
  KalkiaCalculationSummary,
  KalkiaCalculationRow,
  KalkiaCalculationFilters,
  KalkiaCalculationItemInput,
  CalculationResult,
} from '@/types/kalkia.types'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import { KalkiaCalculationEngine, createDefaultContext } from '@/lib/services/kalkia-engine'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { DEFAULT_TAX_RATE, CALC_DEFAULTS } from '@/lib/constants'

// =====================================================
// Kalkia Calculations CRUD
// =====================================================

export async function getKalkiaCalculations(
  filters?: KalkiaCalculationFilters
): Promise<ActionResult<PaginatedResponse<KalkiaCalculationSummary>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    let countQuery = supabase
      .from('v_kalkia_calculations_summary')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('v_kalkia_calculations_summary')
      .select('*')

    // Apply filters
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        const searchFilter = `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
        countQuery = countQuery.or(searchFilter)
        dataQuery = dataQuery.or(searchFilter)
      }
    }

    if (filters?.customer_id) {
      validateUUID(filters.customer_id, 'kunde ID')
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.is_template !== undefined) {
      countQuery = countQuery.eq('is_template', filters.is_template)
      dataQuery = dataQuery.eq('is_template', filters.is_template)
    }

    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Database error counting kalkia calculations:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching kalkia calculations:', dataResult.error)
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: (dataResult.data || []) as KalkiaCalculationSummary[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalkulationer') }
  }
}

export async function getKalkiaCalculation(
  id: string
): Promise<ActionResult<KalkiaCalculationWithRelations>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'kalkulation ID')

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .select(`
        *,
        customer:customers(id, company_name, customer_number),
        building_profile:kalkia_building_profiles(*),
        rows:kalkia_calculation_rows(
          *,
          node:kalkia_nodes(id, code, name, node_type),
          variant:kalkia_variants(id, code, name)
        ),
        created_by_profile:profiles!created_by(id, full_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kalkulationen blev ikke fundet' }
      }
      console.error('Database error fetching kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Sort rows by position
    if (data.rows) {
      data.rows.sort((a: KalkiaCalculationRow, b: KalkiaCalculationRow) => a.position - b.position)
    }

    return { success: true, data: data as KalkiaCalculationWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalkulation') }
  }
}

export async function createKalkiaCalculation(
  formData: FormData
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const rawData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      building_profile_id: formData.get('building_profile_id') as string || null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN,
      margin_percentage: formData.get('margin_percentage') ? Number(formData.get('margin_percentage')) : 0,
      discount_percentage: formData.get('discount_percentage') ? Number(formData.get('discount_percentage')) : 0,
      vat_percentage: formData.get('vat_percentage') ? Number(formData.get('vat_percentage')) : DEFAULT_TAX_RATE,
      overhead_percentage: formData.get('overhead_percentage') ? Number(formData.get('overhead_percentage')) : 12,
      risk_percentage: formData.get('risk_percentage') ? Number(formData.get('risk_percentage')) : 0,
      is_template: formData.get('is_template') === 'true',
    }

    const validated = createKalkiaCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .insert({
        ...validated.data,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: data as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kalkulation') }
  }
}

export async function updateKalkiaCalculation(
  formData: FormData
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kalkulation ID mangler' }
    }
    validateUUID(id, 'kalkulation ID')

    const rawData = {
      id,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      building_profile_id: formData.get('building_profile_id') as string || null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN,
      margin_percentage: formData.get('margin_percentage') ? Number(formData.get('margin_percentage')) : 0,
      discount_percentage: formData.get('discount_percentage') ? Number(formData.get('discount_percentage')) : 0,
      vat_percentage: formData.get('vat_percentage') ? Number(formData.get('vat_percentage')) : DEFAULT_TAX_RATE,
      overhead_percentage: formData.get('overhead_percentage') ? Number(formData.get('overhead_percentage')) : 12,
      risk_percentage: formData.get('risk_percentage') ? Number(formData.get('risk_percentage')) : 0,
      is_template: formData.get('is_template') === 'true',
      status: formData.get('status') as string || undefined,
    }

    const validated = updateKalkiaCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: calcId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_calculations')
      .update(updateData)
      .eq('id', calcId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kalkulationen blev ikke fundet' }
      }
      console.error('Database error updating kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    revalidatePath(`/dashboard/calculations/${calcId}`)
    return { success: true, data: data as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kalkulation') }
  }
}

export async function deleteKalkiaCalculation(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'kalkulation ID')

    const { error } = await supabase
      .from('kalkia_calculations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting kalkia calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/calculations')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kalkulation') }
  }
}

// =====================================================
// PackageBuilder Integration
// =====================================================

interface PackageBuilderCalculationItem {
  id: string
  componentId: string
  componentName: string
  componentCode: string | null
  variantId: string | null
  variantName?: string
  quantity: number
  baseTimeMinutes: number
  variantTimeMultiplier: number
  variantExtraMinutes: number
  complexityFactor: number
  calculatedTimeMinutes: number
  costPrice: number
  salePrice: number
  materials?: {
    name: string
    quantity: number
    unit: string
    costPrice: number
    salePrice: number
    supplierProductId?: string | null
    supplierName?: string | null
  }[]
}

interface PackageBuilderSaveInput {
  name: string
  description: string
  items: PackageBuilderCalculationItem[]
  result: CalculationResult | null
  buildingProfileId: string | null
  settings: {
    hourlyRate: number
    marginPercentage: number
    discountPercentage: number
    laborType?: string
    timeAdjustment?: string
  }
  customerId?: string | null
  isTemplate?: boolean
}

/**
 * Save a complete calculation from the PackageBuilder component.
 * Creates a kalkia_calculation record with all line items and the final result.
 */
export async function savePackageBuilderCalculation(
  input: PackageBuilderSaveInput
): Promise<ActionResult<KalkiaCalculation>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Build factors snapshot from settings
    const factorsSnapshot = {
      laborType: input.settings.laborType || 'electrician',
      timeAdjustment: input.settings.timeAdjustment || 'normal',
      ...(input.result?.factorsUsed || {}),
    }

    // Build building profile snapshot if selected
    let buildingProfileSnapshot = {}
    if (input.buildingProfileId) {
      validateUUID(input.buildingProfileId, 'bygningsprofil ID')
      const { data: profileData } = await supabase
        .from('kalkia_building_profiles')
        .select('*')
        .eq('id', input.buildingProfileId)
        .single()
      if (profileData) {
        buildingProfileSnapshot = profileData
      }
    }

    // Insert the calculation
    const { data: calculation, error: calcError } = await supabase
      .from('kalkia_calculations')
      .insert({
        name: input.name,
        description: input.description || null,
        customer_id: input.customerId || null,
        building_profile_id: input.buildingProfileId || null,

        // Time tracking
        total_direct_time_seconds: input.result?.totalDirectTimeSeconds || 0,
        total_indirect_time_seconds: input.result?.totalIndirectTimeSeconds || 0,
        total_personal_time_seconds: input.result?.totalPersonalTimeSeconds || 0,
        total_labor_time_seconds: input.result?.totalLaborTimeSeconds || 0,

        // Cost breakdown
        hourly_rate: input.settings.hourlyRate,
        total_material_cost: input.result?.totalMaterialCost || 0,
        total_material_waste: input.result?.totalMaterialWaste || 0,
        total_labor_cost: input.result?.totalLaborCost || 0,
        total_other_costs: input.result?.totalOtherCosts || 0,
        cost_price: input.result?.costPrice || 0,

        // Pricing
        overhead_percentage: 12,
        overhead_amount: input.result?.overheadAmount || 0,
        risk_percentage: 2,
        risk_amount: input.result?.riskAmount || 0,
        sales_basis: input.result?.salesBasis || 0,
        margin_percentage: input.settings.marginPercentage,
        margin_amount: input.result?.marginAmount || 0,
        sale_price_excl_vat: input.result?.salePriceExclVat || 0,
        discount_percentage: input.settings.discountPercentage,
        discount_amount: input.result?.discountAmount || 0,
        net_price: input.result?.netPrice || 0,
        vat_percentage: DEFAULT_TAX_RATE,
        vat_amount: input.result?.vatAmount || 0,
        final_amount: input.result?.finalAmount || 0,

        // Key metrics
        db_amount: input.result?.dbAmount || 0,
        db_percentage: input.result?.dbPercentage || 0,
        db_per_hour: input.result?.dbPerHour || 0,
        coverage_ratio: input.result?.coverageRatio || 0,

        // Snapshots
        factors_snapshot: factorsSnapshot,
        building_profile_snapshot: buildingProfileSnapshot,

        // Status
        status: 'draft',
        is_template: input.isTemplate || false,
        created_by: userId,
      })
      .select()
      .single()

    if (calcError) {
      console.error('Database error creating calculation:', calcError)
      throw new Error('DATABASE_ERROR')
    }

    // Insert calculation rows for each item
    if (input.items.length > 0) {
      const rows = input.items.map((item, index) => ({
        calculation_id: calculation.id,
        node_id: null, // We're using calc_components, not kalkia_nodes
        variant_id: item.variantId,
        position: index + 1,
        section: null,
        description: item.componentName + (item.variantName ? ` (${item.variantName})` : ''),
        quantity: item.quantity,
        unit: 'stk',
        base_time_seconds: item.baseTimeMinutes * 60,
        adjusted_time_seconds: item.calculatedTimeMinutes * 60,
        material_cost: item.materials?.reduce((sum, m) => sum + (m.costPrice * m.quantity * item.quantity), 0) || 0,
        material_waste: 0,
        labor_cost: (item.calculatedTimeMinutes / 60) * input.settings.hourlyRate * item.quantity,
        total_cost: item.costPrice * item.quantity,
        sale_price: item.salePrice,
        total_sale: item.salePrice * item.quantity,
        rules_applied: [],
        conditions: {
          componentId: item.componentId,
          componentCode: item.componentCode,
          variantTimeMultiplier: item.variantTimeMultiplier,
          variantExtraMinutes: item.variantExtraMinutes,
          complexityFactor: item.complexityFactor,
        },
        show_on_offer: true,
        is_optional: false,
      }))

      const { error: rowsError } = await supabase
        .from('kalkia_calculation_rows')
        .insert(rows)

      if (rowsError) {
        console.error('Database error creating calculation rows:', rowsError)
        // Don't fail the whole operation, just log
      }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: calculation as KalkiaCalculation }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme kalkulation') }
  }
}

/**
 * Clone a calculation as a template.
 */
export async function cloneCalculationAsTemplate(
  input: Omit<PackageBuilderSaveInput, 'result' | 'buildingProfileId' | 'customerId'>
): Promise<ActionResult<KalkiaCalculation>> {
  return savePackageBuilderCalculation({
    ...input,
    buildingProfileId: null,
    customerId: null,
    result: null, // Will be recalculated
    isTemplate: true,
  })
}

// =====================================================
// Calculation Engine Integration
// =====================================================

export async function calculateFromNodes(
  items: KalkiaCalculationItemInput[],
  buildingProfileId: string | null,
  hourlyRate: number = CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN,
  marginPercentage: number = 0,
  discountPercentage: number = 0,
  vatPercentage: number = DEFAULT_TAX_RATE,
  riskPercentage: number = 0
): Promise<ActionResult<{ items: unknown[]; result: CalculationResult }>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Parallelize all initial data loading
    const nodeIds = items.map((item) => item.nodeId)

    const [profileResult, factorsResult, nodesResult] = await Promise.all([
      buildingProfileId
        ? (validateUUID(buildingProfileId, 'bygningsprofil ID'),
          supabase.from('kalkia_building_profiles').select('*').eq('id', buildingProfileId).single())
        : Promise.resolve({ data: null }),
      supabase.from('kalkia_global_factors').select('*').eq('is_active', true),
      supabase.from('kalkia_nodes').select(`
        *,
        variants:kalkia_variants(
          *,
          materials:kalkia_variant_materials(*)
        ),
        rules:kalkia_rules(*)
      `).in('id', nodeIds),
    ])

    const buildingProfile = profileResult.data as KalkiaBuildingProfile | null
    const globalFactors = (factorsResult.data || []) as KalkiaGlobalFactor[]
    const nodesData = nodesResult.data

    // Create engine
    const context = createDefaultContext(hourlyRate, buildingProfile, globalFactors)
    const engine = new KalkiaCalculationEngine(context)

    const nodeMap = new Map((nodesData || []).map((n) => [n.id, n]))

    // Calculate each item
    const calculatedItems: unknown[] = []

    for (const input of items) {
      const nodeData = nodeMap.get(input.nodeId)
      if (!nodeData) continue

      const variant = input.variantId
        ? nodeData.variants?.find((v: KalkiaVariant) => v.id === input.variantId)
        : nodeData.variants?.find((v: KalkiaVariant) => v.is_default) || nodeData.variants?.[0]

      if (!variant) continue

      const materials = variant.materials || []
      const rules = nodeData.rules || []

      const calculatedItem = engine.calculateItem(
        nodeData as KalkiaNode,
        variant,
        materials as KalkiaVariantMaterial[],
        rules as KalkiaRule[],
        input
      )

      calculatedItems.push(calculatedItem)
    }

    // Calculate final pricing
    const result = engine.calculateFinalPricing(
      calculatedItems as never[],
      marginPercentage,
      discountPercentage,
      vatPercentage,
      riskPercentage
    )

    return { success: true, data: { items: calculatedItems, result } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne') }
  }
}

// =====================================================
// Create Offer from Calculation
// =====================================================

interface CalculationItemForOffer {
  id: string
  componentId: string
  componentName: string
  componentCode: string | null
  variantId: string | null
  variantName?: string
  quantity: number
  baseTimeMinutes: number
  variantTimeMultiplier: number
  variantExtraMinutes: number
  complexityFactor: number
  calculatedTimeMinutes: number
  costPrice: number
  salePrice: number
  materials?: {
    name: string
    quantity: number
    unit: string
    costPrice: number
    salePrice: number
    supplierProductId?: string | null
    supplierName?: string | null
  }[]
}

interface CreateOfferFromCalculationInput {
  title: string
  description: string | null
  customerId: string
  validUntil: string | null
  termsAndConditions: string | null
  items: CalculationItemForOffer[]
  result: CalculationResult | null
  settings: {
    hourlyRate: number
    marginPercentage: number
    discountPercentage: number
  }
}

/**
 * Create an offer directly from a calculation with all line items.
 */
export async function createOfferFromCalculation(
  input: CreateOfferFromCalculationInput
): Promise<ActionResult<{ id: string; offer_number: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Validate customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, company_name')
      .eq('id', input.customerId)
      .single()

    if (customerError || !customer) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    // Generate offer number
    const currentYear = new Date().getFullYear()
    const prefix = `TILBUD-${currentYear}-`

    const { data: lastOffer } = await supabase
      .from('offers')
      .select('offer_number')
      .ilike('offer_number', `${prefix}%`)
      .order('offer_number', { ascending: false })
      .limit(1)

    let nextNumber = 1
    if (lastOffer && lastOffer.length > 0) {
      const lastNum = parseInt(lastOffer[0].offer_number.replace(prefix, ''), 10)
      if (!isNaN(lastNum)) {
        nextNumber = lastNum + 1
      }
    }
    const offerNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`

    // Calculate totals from items
    const totalAmount = input.result?.salePriceExclVat ||
      input.items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0)

    const discountPercentage = input.settings.discountPercentage || 0
    const discountAmount = totalAmount * (discountPercentage / 100)
    const taxPercentage = DEFAULT_TAX_RATE
    const taxAmount = (totalAmount - discountAmount) * (taxPercentage / 100)
    const finalAmount = totalAmount - discountAmount + taxAmount

    // Create the offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        offer_number: offerNumber,
        title: input.title,
        description: input.description,
        customer_id: input.customerId,
        status: 'draft',
        total_amount: totalAmount,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        tax_percentage: taxPercentage,
        tax_amount: taxAmount,
        final_amount: finalAmount,
        currency: 'DKK',
        valid_until: input.validUntil,
        terms_and_conditions: input.termsAndConditions,
        created_by: userId,
      })
      .select('id, offer_number')
      .single()

    if (offerError || !offer) {
      console.error('Error creating offer:', offerError)
      return { success: false, error: 'Kunne ikke oprette tilbud' }
    }

    // Create line items from calculation items
    const lineItems = input.items.map((item, index) => {
      const totalTimeMinutes = item.calculatedTimeMinutes * item.quantity
      const laborCost = (totalTimeMinutes / 60) * input.settings.hourlyRate
      const materialCost = item.materials?.reduce(
        (sum, m) => sum + m.costPrice * m.quantity * item.quantity,
        0
      ) || 0
      const itemCostPrice = laborCost + materialCost
      const itemSalePrice = item.salePrice * item.quantity

      // Find primary supplier product from materials (first linked one)
      const linkedMaterial = item.materials?.find(m => m.supplierProductId)

      return {
        offer_id: offer.id,
        position: index,
        description: item.variantName
          ? `${item.componentName} (${item.variantName})`
          : item.componentName,
        quantity: item.quantity,
        unit: 'stk',
        unit_price: item.salePrice,
        cost_price: itemCostPrice / item.quantity,
        discount_percentage: 0,
        total: itemSalePrice,
        line_type: 'calculation' as const,
        // Carry supplier tracking if materials have supplier links
        supplier_product_id: linkedMaterial?.supplierProductId || null,
        supplier_cost_price_at_creation: linkedMaterial ? linkedMaterial.costPrice : null,
        supplier_margin_applied: linkedMaterial ? input.settings.marginPercentage : null,
        supplier_name_at_creation: linkedMaterial?.supplierName || null,
      }
    })

    const { error: lineItemsError } = await supabase
      .from('offer_line_items')
      .insert(lineItems)

    if (lineItemsError) {
      console.error('Error creating line items:', lineItemsError)
      // Don't fail the whole operation, the offer was created
    }

    // Log activity
    await supabase.from('offer_activities').insert({
      offer_id: offer.id,
      activity_type: 'created',
      description: `Tilbud oprettet fra kalkulation med ${input.items.length} komponenter`,
      performed_by: userId,
    })

    revalidatePath('/dashboard/offers')
    revalidatePath(`/dashboard/offers/${offer.id}`)

    return { success: true, data: offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud fra kalkulation') }
  }
}
