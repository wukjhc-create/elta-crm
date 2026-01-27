'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type {
  Package,
  PackageSummary,
  PackageItem,
  PackageCategory,
} from '@/types/packages.types'
import {
  createPackageSchema,
  updatePackageSchema,
  createPackageItemSchema,
  updatePackageItemSchema,
  type CreatePackageInput,
  type UpdatePackageInput,
  type CreatePackageItemInput,
  type UpdatePackageItemInput,
} from '@/lib/validations/packages'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { ZodError } from 'zod'

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Ensures user is authenticated and returns user ID
 * @throws Error if not authenticated
 */
async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

/**
 * Formats error messages for user display
 */
function formatError(err: unknown, defaultMessage: string): string {
  if (err instanceof Error) {
    if (err.message === 'AUTH_REQUIRED') {
      return 'Du skal være logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  if (err instanceof ZodError) {
    const firstError = err.errors[0]
    return firstError?.message || 'Ugyldig input'
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

// =====================================================
// PACKAGE CATEGORIES
// =====================================================

export async function getPackageCategories(): Promise<ActionResult<PackageCategory[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('package_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('Database error fetching package categories:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kategorier') }
  }
}

// =====================================================
// PACKAGES
// =====================================================

export async function getPackages(filters?: {
  category_id?: string
  is_active?: boolean
  search?: string
}): Promise<ActionResult<PackageSummary[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Validate optional category_id
    if (filters?.category_id) {
      validateUUID(filters.category_id, 'kategori ID')
    }

    let query = supabase
      .from('v_packages_summary')
      .select('*')
      .order('name')

    if (filters?.category_id) {
      const { data: packages, error: pkgError } = await supabase
        .from('packages')
        .select('id')
        .eq('category_id', filters.category_id)

      if (pkgError) {
        console.error('Database error filtering by category:', pkgError)
        throw new Error('DATABASE_ERROR')
      }

      if (packages && packages.length > 0) {
        query = query.in('id', packages.map(p => p.id))
      } else {
        // No packages in this category
        return { success: true, data: [] }
      }
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,code.ilike.%${sanitized}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error fetching packages:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pakker') }
  }
}

export async function getPackage(id: string): Promise<ActionResult<Package>> {
  try {
    await requireAuth()
    validateUUID(id, 'pakke ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('packages')
      .select(`
        *,
        category:package_categories(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Pakken blev ikke fundet' }
      }
      console.error('Database error fetching package:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Pakken blev ikke fundet' }
    }

    return { success: true, data: data as Package }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pakke') }
  }
}

export async function getPackageWithItems(id: string): Promise<ActionResult<Package & { items: PackageItem[] }>> {
  try {
    await requireAuth()
    validateUUID(id, 'pakke ID')

    const supabase = await createClient()

    // Get package
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select(`
        *,
        category:package_categories(*)
      `)
      .eq('id', id)
      .single()

    if (pkgError) {
      if (pkgError.code === 'PGRST116') {
        return { success: false, error: 'Pakken blev ikke fundet' }
      }
      console.error('Database error fetching package:', pkgError)
      throw new Error('DATABASE_ERROR')
    }

    if (!pkg) {
      return { success: false, error: 'Pakken blev ikke fundet' }
    }

    // Get items with relations
    const { data: items, error: itemsError } = await supabase
      .from('package_items')
      .select(`
        *,
        component:calc_components(id, code, name, base_time_minutes),
        product:product_catalog(id, sku, name, cost_price, list_price)
      `)
      .eq('package_id', id)
      .order('sort_order')

    if (itemsError) {
      console.error('Database error fetching package items:', itemsError)
      throw new Error('DATABASE_ERROR')
    }

    return {
      success: true,
      data: {
        ...pkg,
        items: items || [],
      } as Package & { items: PackageItem[] }
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pakke med elementer') }
  }
}

export async function createPackage(input: CreatePackageInput): Promise<ActionResult<Package>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    // Validate input
    const validated = createPackageSchema.parse(input)

    // Validate optional category_id
    if (validated.category_id) {
      validateUUID(validated.category_id, 'kategori ID')
    }

    const { data, error } = await supabase
      .from('packages')
      .insert({
        ...validated,
        default_markup_percentage: validated.default_markup_percentage ?? 25,
        is_active: validated.is_active ?? true,
        is_template: validated.is_template ?? false,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En pakke med dette navn eller kode findes allerede' }
      }
      console.error('Database error creating package:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/packages')
    return { success: true, data: data as Package }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette pakke') }
  }
}

export async function updatePackage(input: UpdatePackageInput): Promise<ActionResult<Package>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Validate input (includes id validation)
    const { id, ...validated } = updatePackageSchema.parse(input)

    // Validate optional category_id
    if (validated.category_id) {
      validateUUID(validated.category_id, 'kategori ID')
    }

    const { data, error } = await supabase
      .from('packages')
      .update(validated)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Pakken blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'En pakke med dette navn eller kode findes allerede' }
      }
      console.error('Database error updating package:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/packages')
    revalidatePath(`/dashboard/packages/${id}`)
    return { success: true, data: data as Package }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere pakke') }
  }
}

export async function deletePackage(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    validateUUID(id, 'pakke ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Pakken kan ikke slettes da den bruges i kalkulationer eller tilbud' }
      }
      console.error('Database error deleting package:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/packages')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette pakke') }
  }
}

export async function copyPackage(
  sourceId: string,
  newName?: string,
  newCode?: string
): Promise<ActionResult<Package>> {
  try {
    await requireAuth()
    validateUUID(sourceId, 'kilde pakke ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('copy_package', {
        p_source_id: sourceId,
        p_new_name: newName || null,
        p_new_code: newCode || null,
      })

    if (error) {
      console.error('Database error copying package:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Kunne ikke kopiere pakken' }
    }

    // Fetch the new package
    const result = await getPackage(data as string)
    if (!result.success) {
      return { success: false, error: 'Pakken blev kopieret, men kunne ikke hentes' }
    }

    revalidatePath('/dashboard/packages')
    return result
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke kopiere pakke') }
  }
}

// =====================================================
// PACKAGE ITEMS
// =====================================================

export async function getPackageItems(packageId: string): Promise<ActionResult<PackageItem[]>> {
  try {
    await requireAuth()
    validateUUID(packageId, 'pakke ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('package_items')
      .select(`
        *,
        component:calc_components(id, code, name, base_time_minutes),
        product:product_catalog(id, sku, name, cost_price, list_price)
      `)
      .eq('package_id', packageId)
      .order('sort_order')

    if (error) {
      console.error('Database error fetching package items:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as PackageItem[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente pakke elementer') }
  }
}

export async function createPackageItem(input: CreatePackageItemInput): Promise<ActionResult<PackageItem>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Validate input (includes package_id validation)
    const validated = createPackageItemSchema.parse(input)

    // Validate optional foreign keys
    if (validated.component_id) {
      validateUUID(validated.component_id, 'komponent ID')
    }
    if (validated.product_id) {
      validateUUID(validated.product_id, 'produkt ID')
    }

    // Set defaults for optional fields
    const itemData = {
      ...validated,
      unit: validated.unit ?? 'stk',
      cost_price: validated.cost_price ?? 0,
      sale_price: validated.sale_price ?? 0,
      time_minutes: validated.time_minutes ?? 0,
      sort_order: validated.sort_order ?? 0,
      show_on_offer: validated.show_on_offer ?? true,
    }

    // Get next sort order if not provided
    if (!itemData.sort_order) {
      const { data: maxOrder } = await supabase
        .from('package_items')
        .select('sort_order')
        .eq('package_id', itemData.package_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      itemData.sort_order = (maxOrder?.sort_order || 0) + 1
    }

    const { data, error } = await supabase
      .from('package_items')
      .insert(itemData)
      .select(`
        *,
        component:calc_components(id, code, name, base_time_minutes),
        product:product_catalog(id, sku, name, cost_price, list_price)
      `)
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Ugyldig pakke, komponent eller produkt reference' }
      }
      console.error('Database error creating package item:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/packages/${validated.package_id}`)
    return { success: true, data: data as PackageItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke tilføje element') }
  }
}

export async function updatePackageItem(input: UpdatePackageItemInput): Promise<ActionResult<PackageItem>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Validate input (includes id validation)
    const { id, ...validated } = updatePackageItemSchema.parse(input)

    // Validate optional foreign keys
    if (validated.component_id) {
      validateUUID(validated.component_id, 'komponent ID')
    }
    if (validated.product_id) {
      validateUUID(validated.product_id, 'produkt ID')
    }

    const { data, error } = await supabase
      .from('package_items')
      .update(validated)
      .eq('id', id)
      .select(`
        *,
        component:calc_components(id, code, name, base_time_minutes),
        product:product_catalog(id, sku, name, cost_price, list_price)
      `)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Element blev ikke fundet' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Ugyldig komponent eller produkt reference' }
      }
      console.error('Database error updating package item:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/packages/${data.package_id}`)
    return { success: true, data: data as PackageItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere element') }
  }
}

export async function deletePackageItem(id: string): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    validateUUID(id, 'element ID')

    const supabase = await createClient()

    // Get package_id first for revalidation
    const { data: item, error: fetchError } = await supabase
      .from('package_items')
      .select('package_id')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return { success: false, error: 'Element blev ikke fundet' }
      }
      console.error('Database error fetching package item:', fetchError)
      throw new Error('DATABASE_ERROR')
    }

    const { error } = await supabase
      .from('package_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting package item:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (item) {
      revalidatePath(`/dashboard/packages/${item.package_id}`)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette element') }
  }
}

export async function reorderPackageItems(
  packageId: string,
  itemIds: string[]
): Promise<ActionResult<void>> {
  try {
    await requireAuth()
    validateUUID(packageId, 'pakke ID')

    // Validate all item IDs
    itemIds.forEach((id, index) => {
      validateUUID(id, `element ID [${index}]`)
    })

    const supabase = await createClient()

    // Update each item's sort_order sequentially to avoid race conditions
    for (let index = 0; index < itemIds.length; index++) {
      const { error } = await supabase
        .from('package_items')
        .update({ sort_order: index + 1 })
        .eq('id', itemIds[index])
        .eq('package_id', packageId)

      if (error) {
        console.error('Database error reordering package item:', error)
        throw new Error('DATABASE_ERROR')
      }
    }

    revalidatePath(`/dashboard/packages/${packageId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre rækkefølge') }
  }
}

// =====================================================
// INTEGRATION FUNCTIONS
// =====================================================

export async function insertPackageIntoCalculation(
  packageId: string,
  calculationId: string,
  options?: {
    startingPosition?: number
    quantityMultiplier?: number
  }
): Promise<ActionResult<{ insertedCount: number }>> {
  try {
    await requireAuth()
    validateUUID(packageId, 'pakke ID')
    validateUUID(calculationId, 'kalkulation ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('insert_package_into_calculation', {
        p_package_id: packageId,
        p_calculation_id: calculationId,
        p_starting_position: options?.startingPosition || 0,
        p_quantity_multiplier: options?.quantityMultiplier || 1,
      })

    if (error) {
      console.error('Database error inserting package into calculation:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: { insertedCount: data as number } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke indsætte pakke i kalkulation') }
  }
}

export async function insertPackageIntoOffer(
  packageId: string,
  offerId: string,
  options?: {
    startingPosition?: number
    quantityMultiplier?: number
  }
): Promise<ActionResult<{ insertedCount: number }>> {
  try {
    await requireAuth()
    validateUUID(packageId, 'pakke ID')
    validateUUID(offerId, 'tilbud ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('insert_package_into_offer', {
        p_package_id: packageId,
        p_offer_id: offerId,
        p_starting_position: options?.startingPosition || 0,
        p_quantity_multiplier: options?.quantityMultiplier || 1,
      })

    if (error) {
      console.error('Database error inserting package into offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/dashboard/offers/${offerId}`)
    return { success: true, data: { insertedCount: data as number } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke indsætte pakke i tilbud') }
  }
}

// =====================================================
// PICKER FUNCTIONS
// =====================================================

export async function getComponentsForPicker(): Promise<ActionResult<{
  id: string
  code: string
  name: string
  base_time_minutes: number
  category_name: string
  variants: { code: string; name: string }[]
}[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: components, error } = await supabase
      .from('calc_components')
      .select(`
        id,
        code,
        name,
        base_time_minutes,
        category:calc_component_categories(name)
      `)
      .eq('is_active', true)
      .order('code')

    if (error) {
      console.error('Database error fetching components for picker:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (!components || components.length === 0) {
      return { success: true, data: [] }
    }

    // Get variants for each component
    const result = await Promise.all(
      components.map(async (comp) => {
        const { data: variants, error: varError } = await supabase
          .from('calc_component_variants')
          .select('code, name')
          .eq('component_id', comp.id)
          .order('sort_order')

        if (varError) {
          console.error('Database error fetching variants:', varError)
        }

        // Handle category which could be an array or object
        const category = comp.category as unknown as { name: string } | { name: string }[] | null
        const categoryName = Array.isArray(category)
          ? category[0]?.name || ''
          : category?.name || ''

        return {
          id: comp.id,
          code: comp.code,
          name: comp.name,
          base_time_minutes: comp.base_time_minutes,
          category_name: categoryName,
          variants: variants || [],
        }
      })
    )

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente komponenter') }
  }
}

export async function getProductsForPicker(): Promise<ActionResult<{
  id: string
  sku: string | null
  name: string
  cost_price: number | null
  list_price: number
  category_name: string
}[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_catalog')
      .select(`
        id,
        sku,
        name,
        cost_price,
        list_price,
        category:product_categories(name)
      `)
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Database error fetching products for picker:', error)
      throw new Error('DATABASE_ERROR')
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] }
    }

    return {
      success: true,
      data: data.map(p => {
        // Handle category which could be an array or object
        const category = p.category as unknown as { name: string } | { name: string }[] | null
        const categoryName = Array.isArray(category)
          ? category[0]?.name || ''
          : category?.name || ''

        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          cost_price: p.cost_price,
          list_price: p.list_price,
          category_name: categoryName,
        }
      })
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkter') }
  }
}
