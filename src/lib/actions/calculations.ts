'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createCalculationSchema,
  updateCalculationSchema,
  createCalculationRowSchema,
  updateCalculationRowSchema,
} from '@/lib/validations/calculations'
import type {
  Calculation,
  CalculationWithRelations,
  CalculationRow,
  CalculationRowWithRelations,
  CalculationFilters,
  EnhancedROIData,
} from '@/types/calculations.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'

// =====================================================
// Calculations
// =====================================================

export async function getCalculations(
  filters?: CalculationFilters
): Promise<ActionResult<PaginatedResponse<CalculationWithRelations>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('calculations')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('calculations').select(`
      *,
      customer:customers(id, company_name, customer_number),
      created_by_profile:profiles!created_by(id, full_name, email)
    `)

    // Apply filters
    if (filters?.search) {
      const searchFilter = `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.customer_id) {
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
    }

    if (filters?.calculation_type) {
      countQuery = countQuery.eq('calculation_type', filters.calculation_type)
      dataQuery = dataQuery.eq('calculation_type', filters.calculation_type)
    }

    if (filters?.is_template !== undefined) {
      countQuery = countQuery.eq('is_template', filters.is_template)
      dataQuery = dataQuery.eq('is_template', filters.is_template)
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
      console.error('Error counting calculations:', countResult.error)
      return { success: false, error: 'Kunne ikke hente kalkulationer' }
    }

    if (dataResult.error) {
      console.error('Error fetching calculations:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente kalkulationer' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as CalculationWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (error) {
    console.error('Error in getCalculations:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function getCalculation(
  id: string
): Promise<ActionResult<CalculationWithRelations>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculations')
      .select(`
        *,
        customer:customers(id, company_name, customer_number),
        created_by_profile:profiles!created_by(id, full_name, email),
        rows:calculation_rows(
          *,
          product:product_catalog(id, name, sku, category:product_categories(id, name, slug)),
          supplier_product:supplier_products(id, supplier_name, supplier_sku)
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching calculation:', error)
      return { success: false, error: 'Kunne ikke hente kalkulation' }
    }

    // Sort rows by position
    if (data.rows) {
      data.rows.sort(
        (a: CalculationRow, b: CalculationRow) => a.position - b.position
      )
    }

    return { success: true, data: data as CalculationWithRelations }
  } catch (error) {
    console.error('Error in getCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createCalculation(
  formData: FormData
): Promise<ActionResult<Calculation>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      calculation_type: formData.get('calculation_type') as string || 'custom',
      settings: formData.get('settings')
        ? JSON.parse(formData.get('settings') as string)
        : {},
      margin_percentage: formData.get('margin_percentage')
        ? Number(formData.get('margin_percentage'))
        : 0,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      is_template: formData.get('is_template') === 'true',
      // Enhanced calculation fields
      calculation_mode: formData.get('calculation_mode') as string || 'standard',
      default_hourly_rate: formData.get('default_hourly_rate')
        ? Number(formData.get('default_hourly_rate'))
        : 450,
      materials_markup_percentage: formData.get('materials_markup_percentage')
        ? Number(formData.get('materials_markup_percentage'))
        : 25,
      show_cost_breakdown: formData.get('show_cost_breakdown') === 'true',
      group_by_section: formData.get('group_by_section') !== 'false',
    }

    const validated = createCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculations')
      .insert({
        ...validated.data,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating calculation:', error)
      return { success: false, error: 'Kunne ikke oprette kalkulation' }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: data as Calculation }
  } catch (error) {
    console.error('Error in createCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateCalculation(
  formData: FormData
): Promise<ActionResult<Calculation>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kalkulation ID mangler' }
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      calculation_type: formData.get('calculation_type') as string || 'custom',
      settings: formData.get('settings')
        ? JSON.parse(formData.get('settings') as string)
        : {},
      margin_percentage: formData.get('margin_percentage')
        ? Number(formData.get('margin_percentage'))
        : 0,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      is_template: formData.get('is_template') === 'true',
      roi_data: formData.get('roi_data')
        ? JSON.parse(formData.get('roi_data') as string)
        : null,
      // Enhanced calculation fields
      calculation_mode: formData.get('calculation_mode') as string || 'standard',
      default_hourly_rate: formData.get('default_hourly_rate')
        ? Number(formData.get('default_hourly_rate'))
        : 450,
      materials_markup_percentage: formData.get('materials_markup_percentage')
        ? Number(formData.get('materials_markup_percentage'))
        : 25,
      show_cost_breakdown: formData.get('show_cost_breakdown') === 'true',
      group_by_section: formData.get('group_by_section') !== 'false',
    }

    const validated = updateCalculationSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: calculationId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('calculations')
      .update(updateData)
      .eq('id', calculationId)
      .select()
      .single()

    if (error) {
      console.error('Error updating calculation:', error)
      return { success: false, error: 'Kunne ikke opdatere kalkulation' }
    }

    revalidatePath('/dashboard/calculations')
    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: data as Calculation }
  } catch (error) {
    console.error('Error in updateCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteCalculation(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('calculations').delete().eq('id', id)

    if (error) {
      console.error('Error deleting calculation:', error)
      return { success: false, error: 'Kunne ikke slette kalkulation' }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Duplicate a calculation (useful for templates)
export async function duplicateCalculation(
  id: string,
  newName?: string
): Promise<ActionResult<Calculation>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Get the original calculation with rows
    const { data: original, error: fetchError } = await supabase
      .from('calculations')
      .select('*, rows:calculation_rows(*)')
      .eq('id', id)
      .single()

    if (fetchError || !original) {
      console.error('Error fetching calculation to duplicate:', fetchError)
      return { success: false, error: 'Kunne ikke finde kalkulation' }
    }

    // Create new calculation
    const { data: newCalc, error: createError } = await supabase
      .from('calculations')
      .insert({
        name: newName || `${original.name} (kopi)`,
        description: original.description,
        customer_id: original.customer_id,
        calculation_type: original.calculation_type,
        settings: original.settings,
        margin_percentage: original.margin_percentage,
        discount_percentage: original.discount_percentage,
        tax_percentage: original.tax_percentage,
        is_template: false, // Copies are not templates by default
        created_by: user.id,
        // Enhanced fields
        calculation_mode: original.calculation_mode || 'standard',
        default_hourly_rate: original.default_hourly_rate || 450,
        materials_markup_percentage: original.materials_markup_percentage || 25,
        show_cost_breakdown: original.show_cost_breakdown || false,
        group_by_section: original.group_by_section ?? true,
      })
      .select()
      .single()

    if (createError || !newCalc) {
      console.error('Error creating duplicate calculation:', createError)
      return { success: false, error: 'Kunne ikke duplikere kalkulation' }
    }

    // Copy all rows
    if (original.rows && original.rows.length > 0) {
      const newRows = original.rows.map((row: CalculationRow) => ({
        calculation_id: newCalc.id,
        row_type: row.row_type,
        product_id: row.product_id,
        supplier_product_id: row.supplier_product_id,
        section: row.section,
        position: row.position,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        cost_price: row.cost_price,
        sale_price: row.sale_price,
        discount_percentage: row.discount_percentage,
        show_on_offer: row.show_on_offer,
        // Enhanced fields
        cost_category: row.cost_category || 'variable',
        hours: row.hours,
        hourly_rate: row.hourly_rate,
      }))

      const { error: rowsError } = await supabase
        .from('calculation_rows')
        .insert(newRows)

      if (rowsError) {
        console.error('Error copying calculation rows:', rowsError)
        // Don't fail the whole operation, just warn
      }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: newCalc as Calculation }
  } catch (error) {
    console.error('Error in duplicateCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Helper for dropdowns
export async function getCalculationsForSelect(): Promise<
  ActionResult<{ id: string; name: string; final_amount: number }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculations')
      .select('id, name, final_amount')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching calculations for select:', error)
      return { success: false, error: 'Kunne ikke hente kalkulationer' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getCalculationsForSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Calculation Rows
// =====================================================

export async function getCalculationRows(
  calculationId: string
): Promise<ActionResult<CalculationRowWithRelations[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculation_rows')
      .select(`
        *,
        product:product_catalog(id, name, sku, category:product_categories(id, name, slug)),
        supplier_product:supplier_products(id, supplier_name, supplier_sku)
      `)
      .eq('calculation_id', calculationId)
      .order('position')

    if (error) {
      console.error('Error fetching calculation rows:', error)
      return { success: false, error: 'Kunne ikke hente kalkulationslinjer' }
    }

    return { success: true, data: data as CalculationRowWithRelations[] }
  } catch (error) {
    console.error('Error in getCalculationRows:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createCalculationRow(
  formData: FormData
): Promise<ActionResult<CalculationRow>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      calculation_id: formData.get('calculation_id') as string,
      row_type: formData.get('row_type') as string || 'manual',
      product_id: formData.get('product_id') as string || null,
      supplier_product_id: formData.get('supplier_product_id') as string || null,
      section: formData.get('section') as string || null,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      unit: formData.get('unit') as string || 'stk',
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      sale_price: Number(formData.get('sale_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      show_on_offer: formData.get('show_on_offer') !== 'false',
      // Enhanced fields
      cost_category: formData.get('cost_category') as string || 'variable',
      hours: formData.get('hours') ? Number(formData.get('hours')) : null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : null,
    }

    const validated = createCalculationRowSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Calculate total (trigger will also do this, but good for immediate response)
    // If hours and hourly_rate are set, use those instead
    let total: number
    if (validated.data.hours && validated.data.hourly_rate) {
      total =
        validated.data.hours *
        validated.data.hourly_rate *
        (1 - (validated.data.discount_percentage || 0) / 100)
    } else {
      total =
        validated.data.quantity *
        validated.data.sale_price *
        (1 - (validated.data.discount_percentage || 0) / 100)
    }

    const { data, error } = await supabase
      .from('calculation_rows')
      .insert({ ...validated.data, total })
      .select()
      .single()

    if (error) {
      console.error('Error creating calculation row:', error)
      return { success: false, error: 'Kunne ikke oprette linje' }
    }

    revalidatePath(`/dashboard/calculations/${validated.data.calculation_id}`)
    return { success: true, data: data as CalculationRow }
  } catch (error) {
    console.error('Error in createCalculationRow:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateCalculationRow(
  formData: FormData
): Promise<ActionResult<CalculationRow>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    const calculationId = formData.get('calculation_id') as string

    if (!id) {
      return { success: false, error: 'Linje ID mangler' }
    }

    const rawData = {
      id,
      row_type: formData.get('row_type') as string || 'manual',
      product_id: formData.get('product_id') as string || null,
      supplier_product_id: formData.get('supplier_product_id') as string || null,
      section: formData.get('section') as string || null,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      unit: formData.get('unit') as string || 'stk',
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      sale_price: Number(formData.get('sale_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      show_on_offer: formData.get('show_on_offer') !== 'false',
      // Enhanced fields
      cost_category: formData.get('cost_category') as string || 'variable',
      hours: formData.get('hours') ? Number(formData.get('hours')) : null,
      hourly_rate: formData.get('hourly_rate') ? Number(formData.get('hourly_rate')) : null,
    }

    const validated = updateCalculationRowSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: rowId, ...updateData } = validated.data

    // Calculate total (if hours and hourly_rate are set, use those)
    let total: number
    if (updateData.hours && updateData.hourly_rate) {
      total =
        updateData.hours *
        updateData.hourly_rate *
        (1 - (updateData.discount_percentage || 0) / 100)
    } else {
      total =
        (updateData.quantity || 1) *
        (updateData.sale_price || 0) *
        (1 - (updateData.discount_percentage || 0) / 100)
    }

    const { data, error } = await supabase
      .from('calculation_rows')
      .update({ ...updateData, total })
      .eq('id', rowId)
      .select()
      .single()

    if (error) {
      console.error('Error updating calculation row:', error)
      return { success: false, error: 'Kunne ikke opdatere linje' }
    }

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: data as CalculationRow }
  } catch (error) {
    console.error('Error in updateCalculationRow:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteCalculationRow(
  id: string,
  calculationId: string
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('calculation_rows').delete().eq('id', id)

    if (error) {
      console.error('Error deleting calculation row:', error)
      return { success: false, error: 'Kunne ikke slette linje' }
    }

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteCalculationRow:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Add product to calculation (helper function)
export async function addProductToCalculation(
  calculationId: string,
  productId: string,
  quantity: number = 1
): Promise<ActionResult<CalculationRow>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Produkt ikke fundet' }
    }

    // Get current max position
    const { data: rows } = await supabase
      .from('calculation_rows')
      .select('position')
      .eq('calculation_id', calculationId)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = rows && rows.length > 0 ? rows[0].position + 1 : 0

    // Calculate total
    const total = quantity * product.list_price

    // Create row
    const { data, error } = await supabase
      .from('calculation_rows')
      .insert({
        calculation_id: calculationId,
        row_type: 'product',
        product_id: productId,
        position: nextPosition,
        description: product.name,
        quantity,
        unit: product.unit || 'stk',
        cost_price: product.cost_price,
        sale_price: product.list_price,
        total,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding product to calculation:', error)
      return { success: false, error: 'Kunne ikke tilføje produkt' }
    }

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: data as CalculationRow }
  } catch (error) {
    console.error('Error in addProductToCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Reorder rows
export async function reorderCalculationRows(
  calculationId: string,
  rowIds: string[]
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Update each row's position
    const updates = rowIds.map((id, index) =>
      supabase
        .from('calculation_rows')
        .update({ position: index })
        .eq('id', id)
        .eq('calculation_id', calculationId)
    )

    await Promise.all(updates)

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in reorderCalculationRows:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// ROI Calculation Server Actions
// Note: Pure calculation utilities are in /lib/utils/calculations.ts
// =====================================================

// Update calculation ROI data
export async function updateCalculationROI(
  calculationId: string,
  roiData: EnhancedROIData
): Promise<ActionResult<Calculation>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculations')
      .update({ roi_data: roiData })
      .eq('id', calculationId)
      .select()
      .single()

    if (error) {
      console.error('Error updating calculation ROI:', error)
      return { success: false, error: 'Kunne ikke opdatere ROI data' }
    }

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: data as Calculation }
  } catch (error) {
    console.error('Error in updateCalculationROI:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Quick Calculation (from wizard)
// =====================================================

interface QuickCalculationRoom {
  roomTypeCode: string
  name: string
  components: {
    componentCode: string
    variantCode?: string
    quantity: number
  }[]
}

interface QuickCalculationInput {
  name: string
  calculationMode: 'standard' | 'solar' | 'electrician'
  projectType: string
  rooms: QuickCalculationRoom[]
  hourlyRate: number
  customerId?: string
}

export async function createQuickCalculation(
  input: QuickCalculationInput
): Promise<ActionResult<Calculation>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // 1. Get component details from database
    const componentCodes = input.rooms.flatMap(r => r.components.map(c => c.componentCode))
    const uniqueCodes = [...new Set(componentCodes)]

    const { data: componentsData, error: compError } = await supabase
      .from('calc_components')
      .select('code, name, base_time_minutes, default_cost_price, default_sale_price')
      .in('code', uniqueCodes)

    if (compError) {
      console.error('Error fetching components:', compError)
      return { success: false, error: 'Kunne ikke hente komponenter' }
    }

    const componentMap = new Map(
      (componentsData || []).map(c => [c.code, c])
    )

    // 2. Create the calculation
    const { data: calculation, error: calcError } = await supabase
      .from('calculations')
      .insert({
        name: input.name,
        calculation_type: 'electrical',
        calculation_mode: input.calculationMode,
        default_hourly_rate: input.hourlyRate,
        customer_id: input.customerId || null,
        tax_percentage: 25,
        created_by: user.id,
      })
      .select()
      .single()

    if (calcError || !calculation) {
      console.error('Error creating calculation:', calcError)
      return { success: false, error: 'Kunne ikke oprette kalkulation' }
    }

    // 3. Create calculation rows for each room and component
    const rows: {
      calculation_id: string
      row_type: string
      section: string
      position: number
      description: string
      quantity: number
      unit: string
      cost_price: number | null
      sale_price: number
      total: number
      cost_category: string
    }[] = []

    let position = 0

    for (const room of input.rooms) {
      // Add section header for room
      rows.push({
        calculation_id: calculation.id,
        row_type: 'section',
        section: room.name,
        position: position++,
        description: room.name,
        quantity: 1,
        unit: 'stk',
        cost_price: null,
        sale_price: 0,
        total: 0,
        cost_category: 'variable',
      })

      // Add material rows
      for (const comp of room.components) {
        const componentData = componentMap.get(comp.componentCode)
        if (!componentData) continue

        const salePrice = componentData.default_sale_price || 0
        const costPrice = componentData.default_cost_price || 0

        rows.push({
          calculation_id: calculation.id,
          row_type: 'manual',
          section: 'Materialer',
          position: position++,
          description: `${componentData.name}${comp.variantCode ? ` (${comp.variantCode})` : ''} - ${room.name}`,
          quantity: comp.quantity,
          unit: 'stk',
          cost_price: costPrice,
          sale_price: salePrice,
          total: salePrice * comp.quantity,
          cost_category: 'variable',
        })
      }

      // Add labor row for room (calculated from component times)
      const totalMinutes = room.components.reduce((sum, comp) => {
        const componentData = componentMap.get(comp.componentCode)
        return sum + (componentData?.base_time_minutes || 0) * comp.quantity
      }, 0)

      if (totalMinutes > 0) {
        const hours = totalMinutes / 60
        const laborCost = hours * input.hourlyRate

        rows.push({
          calculation_id: calculation.id,
          row_type: 'manual',
          section: 'Arbejdsløn',
          position: position++,
          description: `Arbejde - ${room.name} (${hours.toFixed(1)} timer)`,
          quantity: hours,
          unit: 'timer',
          cost_price: hours * 295, // Apprentice rate as cost
          sale_price: input.hourlyRate,
          total: laborCost,
          cost_category: 'variable',
        })
      }
    }

    // 4. Insert all rows
    if (rows.length > 0) {
      const { error: rowsError } = await supabase
        .from('calculation_rows')
        .insert(rows)

      if (rowsError) {
        console.error('Error inserting calculation rows:', rowsError)
        // Don't fail completely, but log the error
      }
    }

    revalidatePath('/dashboard/calculations')
    return { success: true, data: calculation as Calculation }
  } catch (error) {
    console.error('Error in createQuickCalculation:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
