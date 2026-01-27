'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Package,
  PackageSummary,
  PackageItem,
  PackageCategory,
  PackageFinancialSummary,
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

interface ActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

// =====================================================
// PACKAGE CATEGORIES
// =====================================================

export async function getPackageCategories(): Promise<ActionResult<PackageCategory[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('package_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (err) {
    console.error('Error fetching package categories:', err)
    return { success: false, error: 'Kunne ikke hente kategorier' }
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
    const supabase = await createClient()

    let query = supabase
      .from('v_packages_summary')
      .select('*')
      .order('name')

    if (filters?.category_id) {
      // Need to filter by category differently since it's from join
      const { data: packages } = await supabase
        .from('packages')
        .select('id')
        .eq('category_id', filters.category_id)

      if (packages) {
        query = query.in('id', packages.map(p => p.id))
      }
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (err) {
    console.error('Error fetching packages:', err)
    return { success: false, error: 'Kunne ikke hente pakker' }
  }
}

export async function getPackage(id: string): Promise<ActionResult<Package>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('packages')
      .select(`
        *,
        category:package_categories(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) return { success: false, error: 'Pakke ikke fundet' }

    return { success: true, data: data as Package }
  } catch (err) {
    console.error('Error fetching package:', err)
    return { success: false, error: 'Kunne ikke hente pakke' }
  }
}

export async function getPackageWithItems(id: string): Promise<ActionResult<Package & { items: PackageItem[] }>> {
  try {
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

    if (pkgError) throw pkgError
    if (!pkg) return { success: false, error: 'Pakke ikke fundet' }

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

    if (itemsError) throw itemsError

    return {
      success: true,
      data: {
        ...pkg,
        items: items || [],
      } as Package & { items: PackageItem[] }
    }
  } catch (err) {
    console.error('Error fetching package with items:', err)
    return { success: false, error: 'Kunne ikke hente pakke' }
  }
}

export async function createPackage(input: CreatePackageInput): Promise<ActionResult<Package>> {
  try {
    const supabase = await createClient()

    // Validate input
    const validated = createPackageSchema.parse(input)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Ikke logget ind' }

    const { data, error } = await supabase
      .from('packages')
      .insert({
        ...validated,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/packages')
    return { success: true, data: data as Package }
  } catch (err) {
    console.error('Error creating package:', err)
    return { success: false, error: 'Kunne ikke oprette pakke' }
  }
}

export async function updatePackage(input: UpdatePackageInput): Promise<ActionResult<Package>> {
  try {
    const supabase = await createClient()

    // Validate input
    const { id, ...validated } = updatePackageSchema.parse(input)

    const { data, error } = await supabase
      .from('packages')
      .update(validated)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/packages')
    revalidatePath(`/dashboard/packages/${id}`)
    return { success: true, data: data as Package }
  } catch (err) {
    console.error('Error updating package:', err)
    return { success: false, error: 'Kunne ikke opdatere pakke' }
  }
}

export async function deletePackage(id: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/dashboard/packages')
    return { success: true }
  } catch (err) {
    console.error('Error deleting package:', err)
    return { success: false, error: 'Kunne ikke slette pakke' }
  }
}

export async function copyPackage(
  sourceId: string,
  newName?: string,
  newCode?: string
): Promise<ActionResult<Package>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('copy_package', {
        p_source_id: sourceId,
        p_new_name: newName || null,
        p_new_code: newCode || null,
      })

    if (error) throw error

    // Fetch the new package
    const result = await getPackage(data as string)
    if (!result.success) return result

    revalidatePath('/dashboard/packages')
    return result
  } catch (err) {
    console.error('Error copying package:', err)
    return { success: false, error: 'Kunne ikke kopiere pakke' }
  }
}

// =====================================================
// PACKAGE ITEMS
// =====================================================

export async function getPackageItems(packageId: string): Promise<ActionResult<PackageItem[]>> {
  try {
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

    if (error) throw error

    return { success: true, data: data as PackageItem[] }
  } catch (err) {
    console.error('Error fetching package items:', err)
    return { success: false, error: 'Kunne ikke hente pakke elementer' }
  }
}

export async function createPackageItem(input: CreatePackageItemInput): Promise<ActionResult<PackageItem>> {
  try {
    const supabase = await createClient()

    // Validate input
    const validated = createPackageItemSchema.parse(input)

    // Get next sort order if not provided
    if (!validated.sort_order) {
      const { data: maxOrder } = await supabase
        .from('package_items')
        .select('sort_order')
        .eq('package_id', validated.package_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      validated.sort_order = (maxOrder?.sort_order || 0) + 1
    }

    const { data, error } = await supabase
      .from('package_items')
      .insert(validated)
      .select(`
        *,
        component:calc_components(id, code, name, base_time_minutes),
        product:product_catalog(id, sku, name, cost_price, list_price)
      `)
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/packages/${validated.package_id}`)
    return { success: true, data: data as PackageItem }
  } catch (err) {
    console.error('Error creating package item:', err)
    return { success: false, error: 'Kunne ikke tilføje element' }
  }
}

export async function updatePackageItem(input: UpdatePackageItemInput): Promise<ActionResult<PackageItem>> {
  try {
    const supabase = await createClient()

    // Validate input
    const { id, ...validated } = updatePackageItemSchema.parse(input)

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

    if (error) throw error

    revalidatePath(`/dashboard/packages/${data.package_id}`)
    return { success: true, data: data as PackageItem }
  } catch (err) {
    console.error('Error updating package item:', err)
    return { success: false, error: 'Kunne ikke opdatere element' }
  }
}

export async function deletePackageItem(id: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    // Get package_id first for revalidation
    const { data: item } = await supabase
      .from('package_items')
      .select('package_id')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('package_items')
      .delete()
      .eq('id', id)

    if (error) throw error

    if (item) {
      revalidatePath(`/dashboard/packages/${item.package_id}`)
    }
    return { success: true }
  } catch (err) {
    console.error('Error deleting package item:', err)
    return { success: false, error: 'Kunne ikke slette element' }
  }
}

export async function reorderPackageItems(
  packageId: string,
  itemIds: string[]
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    // Update each item's sort_order
    const updates = itemIds.map((id, index) =>
      supabase
        .from('package_items')
        .update({ sort_order: index + 1 })
        .eq('id', id)
        .eq('package_id', packageId)
    )

    await Promise.all(updates)

    revalidatePath(`/dashboard/packages/${packageId}`)
    return { success: true }
  } catch (err) {
    console.error('Error reordering package items:', err)
    return { success: false, error: 'Kunne ikke ændre rækkefølge' }
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
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('insert_package_into_calculation', {
        p_package_id: packageId,
        p_calculation_id: calculationId,
        p_starting_position: options?.startingPosition || 0,
        p_quantity_multiplier: options?.quantityMultiplier || 1,
      })

    if (error) throw error

    revalidatePath(`/dashboard/calculations/${calculationId}`)
    return { success: true, data: { insertedCount: data as number } }
  } catch (err) {
    console.error('Error inserting package into calculation:', err)
    return { success: false, error: 'Kunne ikke indsætte pakke i kalkulation' }
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
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('insert_package_into_offer', {
        p_package_id: packageId,
        p_offer_id: offerId,
        p_starting_position: options?.startingPosition || 0,
        p_quantity_multiplier: options?.quantityMultiplier || 1,
      })

    if (error) throw error

    revalidatePath(`/dashboard/offers/${offerId}`)
    return { success: true, data: { insertedCount: data as number } }
  } catch (err) {
    console.error('Error inserting package into offer:', err)
    return { success: false, error: 'Kunne ikke indsætte pakke i tilbud' }
  }
}

// =====================================================
// HELPERS
// =====================================================

export function calculateFinancialSummary(items: PackageItem[]): PackageFinancialSummary {
  let componentsCost = 0, componentsSale = 0
  let productsCost = 0, productsSale = 0
  let manualCost = 0, manualSale = 0
  let laborCost = 0, laborSale = 0
  let totalTimeMinutes = 0

  for (const item of items) {
    switch (item.item_type) {
      case 'component':
        componentsCost += item.total_cost
        componentsSale += item.total_sale
        break
      case 'product':
        productsCost += item.total_cost
        productsSale += item.total_sale
        break
      case 'time':
        laborCost += item.total_cost
        laborSale += item.total_sale
        break
      default:
        manualCost += item.total_cost
        manualSale += item.total_sale
    }
    totalTimeMinutes += item.total_time
  }

  const totalCost = componentsCost + productsCost + manualCost + laborCost
  const totalSale = componentsSale + productsSale + manualSale + laborSale
  const dbAmount = totalSale - totalCost
  const dbPercentage = totalSale > 0 ? (dbAmount / totalSale) * 100 : 0

  // Format time
  const hours = Math.floor(totalTimeMinutes / 60)
  const mins = totalTimeMinutes % 60
  const totalTimeFormatted = hours > 0
    ? `${hours}t ${mins}m`
    : `${mins}m`

  return {
    totalCost,
    totalSale,
    dbAmount,
    dbPercentage,
    totalTimeMinutes,
    totalTimeFormatted,
    componentsCost,
    componentsSale,
    productsCost,
    productsSale,
    manualCost,
    manualSale,
    laborCost,
    laborSale,
  }
}

// Get components for picker
export async function getComponentsForPicker(): Promise<ActionResult<{
  id: string
  code: string
  name: string
  base_time_minutes: number
  category_name: string
  variants: { code: string; name: string }[]
}[]>> {
  try {
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

    if (error) throw error

    // Get variants for each component
    const result = await Promise.all(
      (components || []).map(async (comp) => {
        const { data: variants } = await supabase
          .from('calc_component_variants')
          .select('code, name')
          .eq('component_id', comp.id)
          .order('sort_order')

        return {
          id: comp.id,
          code: comp.code,
          name: comp.name,
          base_time_minutes: comp.base_time_minutes,
          category_name: (comp.category as { name: string } | null)?.name || '',
          variants: variants || [],
        }
      })
    )

    return { success: true, data: result }
  } catch (err) {
    console.error('Error fetching components for picker:', err)
    return { success: false, error: 'Kunne ikke hente komponenter' }
  }
}

// Get products for picker
export async function getProductsForPicker(): Promise<ActionResult<{
  id: string
  sku: string | null
  name: string
  cost_price: number | null
  list_price: number
  category_name: string
}[]>> {
  try {
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

    if (error) throw error

    return {
      success: true,
      data: (data || []).map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        cost_price: p.cost_price,
        list_price: p.list_price,
        category_name: (p.category as { name: string } | null)?.name || '',
      }))
    }
  } catch (err) {
    console.error('Error fetching products for picker:', err)
    return { success: false, error: 'Kunne ikke hente produkter' }
  }
}
