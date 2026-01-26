'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createSupplierSchema,
  updateSupplierSchema,
  createProductCategorySchema,
  updateProductCategorySchema,
  createProductSchema,
  updateProductSchema,
  createSupplierProductSchema,
  updateSupplierProductSchema,
} from '@/lib/validations/products'
import type {
  Supplier,
  ProductCategory,
  ProductCategoryWithChildren,
  Product,
  ProductWithCategory,
  SupplierProduct,
  SupplierProductWithRelations,
  ProductFilters,
  SupplierFilters,
  SupplierProductFilters,
} from '@/types/products.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'

// =====================================================
// Product Categories
// =====================================================

export async function getProductCategories(): Promise<ActionResult<ProductCategory[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .order('sort_order')
      .order('name')

    if (error) {
      console.error('Error fetching product categories:', error)
      return { success: false, error: 'Kunne ikke hente kategorier' }
    }

    return { success: true, data: data as ProductCategory[] }
  } catch (error) {
    console.error('Error in getProductCategories:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function getProductCategoriesHierarchy(): Promise<ActionResult<ProductCategoryWithChildren[]>> {
  try {
    const result = await getProductCategories()
    if (!result.success || !result.data) {
      return result as ActionResult<ProductCategoryWithChildren[]>
    }

    // Build hierarchy
    const categoryMap = new Map<string, ProductCategoryWithChildren>()
    const rootCategories: ProductCategoryWithChildren[] = []

    // First pass: create all category objects
    result.data.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] })
    })

    // Second pass: build hierarchy
    result.data.forEach((cat) => {
      const category = categoryMap.get(cat.id)!
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id)!.children!.push(category)
      } else {
        rootCategories.push(category)
      }
    })

    return { success: true, data: rootCategories }
  } catch (error) {
    console.error('Error in getProductCategoriesHierarchy:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createProductCategory(
  formData: FormData
): Promise<ActionResult<ProductCategory>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      parent_id: formData.get('parent_id') as string || null,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
      is_active: formData.get('is_active') === 'true',
    }

    const validated = createProductCategorySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_categories')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      console.error('Error creating product category:', error)
      if (error.code === '23505') {
        return { success: false, error: 'En kategori med dette slug findes allerede' }
      }
      return { success: false, error: 'Kunne ikke oprette kategori' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as ProductCategory }
  } catch (error) {
    console.error('Error in createProductCategory:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateProductCategory(
  formData: FormData
): Promise<ActionResult<ProductCategory>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kategori ID mangler' }
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      parent_id: formData.get('parent_id') as string || null,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
      is_active: formData.get('is_active') === 'true',
    }

    const validated = updateProductCategorySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: categoryId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('product_categories')
      .update(updateData)
      .eq('id', categoryId)
      .select()
      .single()

    if (error) {
      console.error('Error updating product category:', error)
      return { success: false, error: 'Kunne ikke opdatere kategori' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as ProductCategory }
  } catch (error) {
    console.error('Error in updateProductCategory:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteProductCategory(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('product_categories').delete().eq('id', id)

    if (error) {
      console.error('Error deleting product category:', error)
      return { success: false, error: 'Kunne ikke slette kategori' }
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteProductCategory:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Products
// =====================================================

export async function getProducts(
  filters?: ProductFilters
): Promise<ActionResult<PaginatedResponse<ProductWithCategory>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('product_catalog')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('product_catalog').select(`
      *,
      category:product_categories(id, name, slug)
    `)

    // Apply filters
    if (filters?.search) {
      const searchFilter = `name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.category_id) {
      countQuery = countQuery.eq('category_id', filters.category_id)
      dataQuery = dataQuery.eq('category_id', filters.category_id)
    }

    if (filters?.is_active !== undefined) {
      countQuery = countQuery.eq('is_active', filters.is_active)
      dataQuery = dataQuery.eq('is_active', filters.is_active)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'name'
    const sortOrder = filters?.sortOrder || 'asc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Error counting products:', countResult.error)
      return { success: false, error: 'Kunne ikke hente produkter' }
    }

    if (dataResult.error) {
      console.error('Error fetching products:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente produkter' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as ProductWithCategory[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (error) {
    console.error('Error in getProducts:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function getProduct(id: string): Promise<ActionResult<ProductWithCategory>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_catalog')
      .select(`
        *,
        category:product_categories(id, name, slug)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching product:', error)
      return { success: false, error: 'Kunne ikke hente produkt' }
    }

    return { success: true, data: data as ProductWithCategory }
  } catch (error) {
    console.error('Error in getProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createProduct(formData: FormData): Promise<ActionResult<Product>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      sku: formData.get('sku') as string || null,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      category_id: formData.get('category_id') as string || null,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      list_price: Number(formData.get('list_price')),
      unit: formData.get('unit') as string || 'stk',
      specifications: formData.get('specifications')
        ? JSON.parse(formData.get('specifications') as string)
        : {},
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = createProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_catalog')
      .insert({
        ...validated.data,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating product:', error)
      if (error.code === '23505') {
        return { success: false, error: 'Et produkt med dette SKU findes allerede' }
      }
      return { success: false, error: 'Kunne ikke oprette produkt' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Product }
  } catch (error) {
    console.error('Error in createProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateProduct(formData: FormData): Promise<ActionResult<Product>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Produkt ID mangler' }
    }

    const rawData = {
      id,
      sku: formData.get('sku') as string || null,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      category_id: formData.get('category_id') as string || null,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      list_price: Number(formData.get('list_price')),
      unit: formData.get('unit') as string || 'stk',
      specifications: formData.get('specifications')
        ? JSON.parse(formData.get('specifications') as string)
        : {},
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = updateProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: productId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('product_catalog')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single()

    if (error) {
      console.error('Error updating product:', error)
      return { success: false, error: 'Kunne ikke opdatere produkt' }
    }

    revalidatePath('/dashboard/products')
    revalidatePath(`/dashboard/products/${productId}`)
    return { success: true, data: data as Product }
  } catch (error) {
    console.error('Error in updateProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('product_catalog').delete().eq('id', id)

    if (error) {
      console.error('Error deleting product:', error)
      return { success: false, error: 'Kunne ikke slette produkt' }
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Helper function for dropdowns
export async function getProductsForSelect(): Promise<
  ActionResult<{ id: string; name: string; sku: string | null; list_price: number }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_catalog')
      .select('id, name, sku, list_price')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching products for select:', error)
      return { success: false, error: 'Kunne ikke hente produkter' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getProductsForSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Suppliers
// =====================================================

export async function getSuppliers(
  filters?: SupplierFilters
): Promise<ActionResult<PaginatedResponse<Supplier>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('suppliers')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('suppliers').select('*')

    // Apply filters
    if (filters?.search) {
      const searchFilter = `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.is_active !== undefined) {
      countQuery = countQuery.eq('is_active', filters.is_active)
      dataQuery = dataQuery.eq('is_active', filters.is_active)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'name'
    const sortOrder = filters?.sortOrder || 'asc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Error counting suppliers:', countResult.error)
      return { success: false, error: 'Kunne ikke hente leverandører' }
    }

    if (dataResult.error) {
      console.error('Error fetching suppliers:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente leverandører' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as Supplier[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (error) {
    console.error('Error in getSuppliers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function getSupplier(id: string): Promise<ActionResult<Supplier>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching supplier:', error)
      return { success: false, error: 'Kunne ikke hente leverandør' }
    }

    return { success: true, data: data as Supplier }
  } catch (error) {
    console.error('Error in getSupplier:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createSupplier(formData: FormData): Promise<ActionResult<Supplier>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      name: formData.get('name') as string,
      code: formData.get('code') as string || null,
      contact_name: formData.get('contact_name') as string || null,
      contact_email: formData.get('contact_email') as string || null,
      contact_phone: formData.get('contact_phone') as string || null,
      website: formData.get('website') as string || null,
      notes: formData.get('notes') as string || null,
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = createSupplierSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        ...validated.data,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      if (error.code === '23505') {
        return { success: false, error: 'En leverandør med denne kode findes allerede' }
      }
      return { success: false, error: 'Kunne ikke oprette leverandør' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Supplier }
  } catch (error) {
    console.error('Error in createSupplier:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateSupplier(formData: FormData): Promise<ActionResult<Supplier>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Leverandør ID mangler' }
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      code: formData.get('code') as string || null,
      contact_name: formData.get('contact_name') as string || null,
      contact_email: formData.get('contact_email') as string || null,
      contact_phone: formData.get('contact_phone') as string || null,
      website: formData.get('website') as string || null,
      notes: formData.get('notes') as string || null,
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = updateSupplierSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: supplierId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier:', error)
      return { success: false, error: 'Kunne ikke opdatere leverandør' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Supplier }
  } catch (error) {
    console.error('Error in updateSupplier:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('suppliers').delete().eq('id', id)

    if (error) {
      console.error('Error deleting supplier:', error)
      return { success: false, error: 'Kunne ikke slette leverandør' }
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteSupplier:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Helper function for dropdowns
export async function getSuppliersForSelect(): Promise<
  ActionResult<{ id: string; name: string; code: string | null }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching suppliers for select:', error)
      return { success: false, error: 'Kunne ikke hente leverandører' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getSuppliersForSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Supplier Products
// =====================================================

export async function getSupplierProducts(
  filters?: SupplierProductFilters
): Promise<ActionResult<PaginatedResponse<SupplierProductWithRelations>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('supplier_products')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('supplier_products').select(`
      *,
      supplier:suppliers(id, name, code),
      product:product_catalog(id, name, sku)
    `)

    // Apply filters
    if (filters?.supplier_id) {
      countQuery = countQuery.eq('supplier_id', filters.supplier_id)
      dataQuery = dataQuery.eq('supplier_id', filters.supplier_id)
    }

    if (filters?.is_available !== undefined) {
      countQuery = countQuery.eq('is_available', filters.is_available)
      dataQuery = dataQuery.eq('is_available', filters.is_available)
    }

    if (filters?.search) {
      const searchFilter = `supplier_name.ilike.%${filters.search}%,supplier_sku.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'supplier_name'
    const sortOrder = filters?.sortOrder || 'asc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Error counting supplier products:', countResult.error)
      return { success: false, error: 'Kunne ikke hente leverandørprodukter' }
    }

    if (dataResult.error) {
      console.error('Error fetching supplier products:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente leverandørprodukter' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as SupplierProductWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (error) {
    console.error('Error in getSupplierProducts:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createSupplierProduct(
  formData: FormData
): Promise<ActionResult<SupplierProduct>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      supplier_id: formData.get('supplier_id') as string,
      product_id: formData.get('product_id') as string || null,
      supplier_sku: formData.get('supplier_sku') as string,
      supplier_name: formData.get('supplier_name') as string,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      is_available: formData.get('is_available') !== 'false',
      lead_time_days: formData.get('lead_time_days')
        ? Number(formData.get('lead_time_days'))
        : null,
    }

    const validated = createSupplierProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('supplier_products')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier product:', error)
      if (error.code === '23505') {
        return { success: false, error: 'Dette produkt findes allerede hos leverandøren' }
      }
      return { success: false, error: 'Kunne ikke oprette leverandørprodukt' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as SupplierProduct }
  } catch (error) {
    console.error('Error in createSupplierProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateSupplierProduct(
  formData: FormData
): Promise<ActionResult<SupplierProduct>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Leverandørprodukt ID mangler' }
    }

    const rawData = {
      id,
      supplier_id: formData.get('supplier_id') as string,
      product_id: formData.get('product_id') as string || null,
      supplier_sku: formData.get('supplier_sku') as string,
      supplier_name: formData.get('supplier_name') as string,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      is_available: formData.get('is_available') !== 'false',
      lead_time_days: formData.get('lead_time_days')
        ? Number(formData.get('lead_time_days'))
        : null,
    }

    const validated = updateSupplierProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: supplierProductId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('supplier_products')
      .update(updateData)
      .eq('id', supplierProductId)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier product:', error)
      return { success: false, error: 'Kunne ikke opdatere leverandørprodukt' }
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as SupplierProduct }
  } catch (error) {
    console.error('Error in updateSupplierProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteSupplierProduct(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('supplier_products').delete().eq('id', id)

    if (error) {
      console.error('Error deleting supplier product:', error)
      return { success: false, error: 'Kunne ikke slette leverandørprodukt' }
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteSupplierProduct:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
