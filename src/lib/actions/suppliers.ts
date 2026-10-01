'use server'

import { SUPPLIER_SETTINGS_PUBLIC_COLUMNS } from '@/lib/services/supplier-settings-columns'
import { revalidatePath } from 'next/cache'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import type {
  Supplier,
  CreateSupplierData,
  UpdateSupplierData,
  SupplierSettings,
  UpdateSupplierSettingsData,
  SupplierProduct,
  SupplierProductWithSupplier,
  UpdateSupplierProductData,
  PriceHistory,
  SupplierFilters,
  SupplierProductFilters,
  SupplierOptionForMaterial,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { normalizeVatNumber, isValidVatFormat } from '@/lib/invoice-control/vat'

/**
 * P3 #17 / P-005: skrivende leverandoer-/prisimport-actions var ugatede (enhver indlogget kunne overskrive
 * kostpriser via direkte server-action-kald). Kraever nu settings.suppliers (admin) — samme gate som credentials.
 * Laese-actions (produktsoegning i tilbud/kalkulation) er uaendrede.
 */
/**
 * CVR (00167): normaliseres med samme regel som DB-triggeren. Feltet sendes KUN naar det er relevant, saa
 * formularen virker baade foer og efter migrationen (expand/contract): tomt ved opret -> udelades; tomt ved
 * redigering af en leverandoer uden CVR -> udelades; tomt ved redigering med CVR -> NULL (ryddes).
 */
function prepareVat(raw: string | undefined, mode: 'create' | 'update'): { value: string | null | undefined } | { error: string } {
  if (raw === undefined) return { value: undefined }
  const v = normalizeVatNumber(raw)
  if (v === null) return { value: mode === 'create' ? undefined : null }
  if (!isValidVatFormat(v)) return { error: 'Ugyldigt CVR-nr. — brug 8 cifre (fx 12345678) eller landekode + nummer' }
  return { value: v }
}

function withVat<T extends { vat_number?: string }>(data: T, vat: string | null | undefined): Omit<T, 'vat_number'> & { vat_number?: string | null } {
  const rest: Omit<T, 'vat_number'> & { vat_number?: string } = { ...data }
  delete rest.vat_number
  return vat === undefined ? rest : { ...rest, vat_number: vat }
}

/**
 * N12: e-conomic-leverandørnr. -> external_supplier_id + external_provider='economic'. Sendes kun når formularen har
 * ændret det: tomt ved opret -> udelades; tomt ved redigering -> begge felter ryddes. Kun positive heltal (e-conomic).
 */
function withEconomicSupplier<T extends { economic_supplier_number?: string }>(data: T, mode: 'create' | 'update'):
  { error: string } | { row: Omit<T, 'economic_supplier_number'> & { external_supplier_id?: string | null; external_provider?: string | null } } {
  const { economic_supplier_number: raw, ...rest } = data
  if (raw === undefined) return { row: rest }
  const v = raw.trim()
  if (!v) return { row: mode === 'create' ? rest : { ...rest, external_supplier_id: null, external_provider: null } }
  if (!/^[1-9]\d{0,8}$/.test(v)) return { error: 'Ugyldigt e-conomic-leverandørnr. — kun tal (fx 1001)' }
  return { row: { ...rest, external_supplier_id: v, external_provider: 'economic' } }
}

async function requireSupplierWrite() {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission('settings.suppliers')
  return ctx
}
import { logger } from '@/lib/utils/logger'
// =====================================================
// Supplier CRUD
// =====================================================

export async function getSuppliers(
  filters?: SupplierFilters
): Promise<ActionResult<Supplier[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('suppliers')
      .select('*')

    // Apply filters
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,code.ilike.%${sanitized}%`)
      }
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    // Sorting
    const sortBy = filters?.sortBy || 'name'
    const sortOrder = filters?.sortOrder || 'asc'
    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).limit(200)

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching suppliers', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as Supplier[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandører') }
  }
}

export async function getSupplier(id: string): Promise<ActionResult<Supplier>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'leverandør ID')

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching supplier', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Leverandøren blev ikke fundet' }
    }

    return { success: true, data: data as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandør') }
  }
}

export async function createSupplier(
  data: CreateSupplierData
): Promise<ActionResult<Supplier>> {
  try {
    const { supabase, userId } = await requireSupplierWrite()
    const vat = prepareVat(data.vat_number, 'create')
    if ('error' in vat) return { success: false, error: vat.error }

    const eco = withEconomicSupplier(withVat(data, vat.value), 'create')
    if ('error' in eco) return { success: false, error: eco.error }

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({
        ...eco.row,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En leverandør med denne kode eksisterer allerede' }
      }
      logger.error('Database error creating supplier', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: supplier as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette leverandør') }
  }
}

export async function updateSupplier(
  id: string,
  data: Omit<UpdateSupplierData, 'id'>
): Promise<ActionResult<Supplier>> {
  try {
    const { supabase } = await requireSupplierWrite()
    validateUUID(id, 'leverandør ID')
    const vat = prepareVat(data.vat_number, 'update')
    if ('error' in vat) return { success: false, error: vat.error }

    const eco = withEconomicSupplier(withVat(data, vat.value), 'update')
    if ('error' in eco) return { success: false, error: eco.error }

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .update(eco.row)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Leverandøren blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'En leverandør med denne kode eksisterer allerede' }
      }
      logger.error('Database error updating supplier', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    revalidatePath(`/dashboard/settings/suppliers/${id}`)
    return { success: true, data: supplier as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere leverandør') }
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireSupplierWrite()
    validateUUID(id, 'leverandør ID')

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting supplier', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette leverandør') }
  }
}

// =====================================================
// Supplier Settings
// =====================================================

export async function getSupplierSettings(
  supplierId: string
): Promise<ActionResult<SupplierSettings | null>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    const { data, error } = await supabase
      .from('supplier_settings')
      .select(SUPPLIER_SETTINGS_PUBLIC_COLUMNS)
      .eq('supplier_id', supplierId)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching supplier settings', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as SupplierSettings | null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørindstillinger') }
  }
}

export async function updateSupplierSettings(
  supplierId: string,
  data: UpdateSupplierSettingsData
): Promise<ActionResult<SupplierSettings>> {
  try {
    const { supabase } = await requireSupplierWrite()
    validateUUID(supplierId, 'leverandør ID')

    // Check if settings exist
    const { data: existing } = await supabase
      .from('supplier_settings')
      .select('id')
      .eq('supplier_id', supplierId)
      .maybeSingle()

    let result
    if (existing) {
      // Update existing
      result = await supabase
        .from('supplier_settings')
        .update(data)
        .eq('supplier_id', supplierId)
        .select(SUPPLIER_SETTINGS_PUBLIC_COLUMNS)
        .single()
    } else {
      // Create new
      result = await supabase
        .from('supplier_settings')
        .insert({
          supplier_id: supplierId,
          ...data,
        })
        .select(SUPPLIER_SETTINGS_PUBLIC_COLUMNS)
        .single()
    }

    if (result.error) {
      logger.error('Database error updating supplier settings', { error: result.error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/settings/suppliers/${supplierId}`)
    return { success: true, data: result.data as SupplierSettings }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere leverandørindstillinger') }
  }
}

// =====================================================
// Supplier Products
// =====================================================

export async function getSupplierProducts(
  filters?: SupplierProductFilters
): Promise<ActionResult<PaginatedResponse<SupplierProductWithSupplier>>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    let countQuery = supabase
      .from('v_supplier_products_with_supplier')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('v_supplier_products_with_supplier')
      .select('*')

    // Apply filters
    if (filters?.supplier_id) {
      validateUUID(filters.supplier_id, 'leverandør ID')
      countQuery = countQuery.eq('supplier_id', filters.supplier_id)
      dataQuery = dataQuery.eq('supplier_id', filters.supplier_id)
    }

    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        const searchFilter = `supplier_sku.ilike.%${sanitized}%,supplier_name.ilike.%${sanitized}%,manufacturer.ilike.%${sanitized}%,ean.ilike.%${sanitized}%`
        countQuery = countQuery.or(searchFilter)
        dataQuery = dataQuery.or(searchFilter)
      }
    }

    if (filters?.category) {
      countQuery = countQuery.eq('category', filters.category)
      dataQuery = dataQuery.eq('category', filters.category)
    }

    if (filters?.is_available !== undefined) {
      countQuery = countQuery.eq('is_available', filters.is_available)
      dataQuery = dataQuery.eq('is_available', filters.is_available)
    }

    if (filters?.has_product_link !== undefined) {
      if (filters.has_product_link) {
        countQuery = countQuery.not('product_id', 'is', null)
        dataQuery = dataQuery.not('product_id', 'is', null)
      } else {
        countQuery = countQuery.is('product_id', null)
        dataQuery = dataQuery.is('product_id', null)
      }
    }

    // Sorting
    const sortBy = filters?.sortBy || 'supplier_name'
    const sortOrder = filters?.sortOrder || 'asc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      logger.error('Database error counting supplier products', { error: countResult.error })
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      logger.error('Database error fetching supplier products', { error: dataResult.error })
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: (dataResult.data || []) as SupplierProductWithSupplier[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørprodukter') }
  }
}

export async function searchSupplierProducts(
  query: string,
  options?: { supplier_id?: string; limit?: number }
): Promise<ActionResult<SupplierProductWithSupplier[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const sanitized = sanitizeSearchTerm(query)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    let dbQuery = supabase
      .from('v_supplier_products_with_supplier')
      .select('*')
      .eq('is_available', true)
      .or(`supplier_sku.ilike.%${sanitized}%,supplier_name.ilike.%${sanitized}%,ean.ilike.%${sanitized}%`)

    if (options?.supplier_id) {
      validateUUID(options.supplier_id, 'leverandør ID')
      dbQuery = dbQuery.eq('supplier_id', options.supplier_id)
    }

    const limit = options?.limit || 20
    dbQuery = dbQuery.limit(limit)

    const { data, error } = await dbQuery

    if (error) {
      logger.error('Database error searching supplier products', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as SupplierProductWithSupplier[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgning fejlede') }
  }
}

export async function getSupplierProduct(
  id: string
): Promise<ActionResult<SupplierProductWithSupplier>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'produkt ID')

    const { data, error } = await supabase
      .from('v_supplier_products_with_supplier')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching supplier product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Produktet blev ikke fundet' }
    }

    return { success: true, data: data as SupplierProductWithSupplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkt') }
  }
}

export async function updateSupplierProduct(
  id: string,
  data: Omit<UpdateSupplierProductData, 'id'>
): Promise<ActionResult<SupplierProduct>> {
  try {
    const { supabase } = await requireSupplierWrite()
    validateUUID(id, 'produkt ID')

    const { data: product, error } = await supabase
      .from('supplier_products')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Produktet blev ikke fundet' }
      }
      logger.error('Database error updating supplier product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: product as SupplierProduct }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere produkt') }
  }
}

// =====================================================
// Price History
// =====================================================

export async function getPriceHistory(
  supplierProductId: string,
  options?: { limit?: number }
): Promise<ActionResult<PriceHistory[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierProductId, 'produkt ID')

    const limit = options?.limit || 50

    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('supplier_product_id', supplierProductId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('Database error fetching price history', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as PriceHistory[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prishistorik') }
  }
}

// =====================================================
// Supplier Options for Material Linking
// =====================================================

export async function getSupplierOptionsForMaterial(
  materialName: string
): Promise<ActionResult<SupplierOptionForMaterial[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const sanitized = sanitizeSearchTerm(materialName)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    const { data, error } = await supabase
      .from('v_supplier_products_with_supplier')
      .select(`
        id,
        supplier_id,
        supplier_name,
        supplier_code,
        supplier_sku,
        supplier_name,
        cost_price,
        list_price,
        is_preferred,
        is_available
      `)
      .eq('is_available', true)
      .eq('supplier_is_active', true)
      .or(`supplier_name.ilike.%${sanitized}%,supplier_sku.ilike.%${sanitized}%`)
      .order('is_preferred', { ascending: false })
      .order('cost_price', { ascending: true })
      .limit(20)

    if (error) {
      logger.error('Database error fetching supplier options', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    const options: SupplierOptionForMaterial[] = (data || []).map((row) => ({
      supplier_product_id: row.id,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      supplier_code: row.supplier_code,
      supplier_sku: row.supplier_sku,
      product_name: row.supplier_name,
      cost_price: row.cost_price || 0,
      list_price: row.list_price,
      is_preferred: row.is_preferred || false,
      is_available: row.is_available,
    }))

    return { success: true, data: options }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørmuligheder') }
  }
}

// =====================================================
// Get Categories for Filter
// =====================================================

export async function getSupplierProductCategories(
  supplierId?: string
): Promise<ActionResult<string[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('supplier_products')
      .select('category')
      .not('category', 'is', null)

    if (supplierId) {
      validateUUID(supplierId, 'leverandør ID')
      query = query.eq('supplier_id', supplierId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching categories', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Get unique categories
    const categories = [...new Set((data || []).map((row) => row.category).filter(Boolean))] as string[]
    categories.sort()

    return { success: true, data: categories }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kategorier') }
  }
}
