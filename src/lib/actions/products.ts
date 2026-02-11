'use server'

import { revalidatePath } from 'next/cache'
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
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
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
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
function safeJsonParse<T>(value: string | null, defaultValue: T): T {
  if (!value) return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

// =====================================================
// Product Categories
// =====================================================

export async function getProductCategories(): Promise<ActionResult<ProductCategory[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .order('sort_order')
      .order('name')

    if (error) {
      console.error('Database error fetching product categories:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as ProductCategory[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kategorier') }
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
      const category = categoryMap.get(cat.id)
      if (!category) return
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id)
        if (parent?.children) {
          parent.children.push(category)
        } else {
          rootCategories.push(category)
        }
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
    const { supabase } = await getAuthenticatedClient()

    const parentId = formData.get('parent_id') as string || null
    if (parentId) {
      validateUUID(parentId, 'parent kategori ID')
    }

    const rawData = {
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      parent_id: parentId,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
      is_active: formData.get('is_active') === 'true',
    }

    const validated = createProductCategorySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { data, error } = await supabase
      .from('product_categories')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En kategori med dette slug findes allerede' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte parent-kategori findes ikke' }
      }
      console.error('Database error creating product category:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as ProductCategory }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kategori') }
  }
}

export async function updateProductCategory(
  formData: FormData
): Promise<ActionResult<ProductCategory>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kategori ID mangler' }
    }
    validateUUID(id, 'kategori ID')

    const parentId = formData.get('parent_id') as string || null
    if (parentId) {
      validateUUID(parentId, 'parent kategori ID')
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      parent_id: parentId,
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
      is_active: formData.get('is_active') === 'true',
    }

    const validated = updateProductCategorySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }
    const { id: categoryId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('product_categories')
      .update(updateData)
      .eq('id', categoryId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kategorien blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'En kategori med dette slug findes allerede' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte parent-kategori findes ikke' }
      }
      console.error('Database error updating product category:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as ProductCategory }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kategori') }
  }
}

export async function deleteProductCategory(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'kategori ID')

    const { error } = await supabase.from('product_categories').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Kategorien kan ikke slettes da den har tilknyttede produkter eller underkategorier' }
      }
      console.error('Database error deleting product category:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kategori') }
  }
}

// =====================================================
// Products
// =====================================================

export async function getProducts(
  filters?: ProductFilters
): Promise<ActionResult<PaginatedResponse<ProductWithCategory>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Validate category_id if provided
    if (filters?.category_id) {
      validateUUID(filters.category_id, 'kategori ID')
    }

    // Build count query
    let countQuery = supabase
      .from('product_catalog')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('product_catalog').select(`
      *,
      category:product_categories(id, name, slug)
    `)

    // Apply filters with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `name.ilike.%${sanitized}%,sku.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
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
      console.error('Database error counting products:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching products:', dataResult.error)
      throw new Error('DATABASE_ERROR')
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
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkter') }
  }
}

export async function getProduct(id: string): Promise<ActionResult<ProductWithCategory>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'produkt ID')

    const { data, error } = await supabase
      .from('product_catalog')
      .select(`
        *,
        category:product_categories(id, name, slug)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Produktet blev ikke fundet' }
      }
      console.error('Database error fetching product:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ProductWithCategory }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkt') }
  }
}

export async function createProduct(formData: FormData): Promise<ActionResult<Product>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const categoryId = formData.get('category_id') as string || null
    if (categoryId) {
      validateUUID(categoryId, 'kategori ID')
    }

    const rawData = {
      sku: formData.get('sku') as string || null,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      category_id: categoryId,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      list_price: Number(formData.get('list_price')),
      unit: formData.get('unit') as string || 'stk',
      specifications: safeJsonParse(formData.get('specifications') as string | null, {}),
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = createProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { data, error } = await supabase
      .from('product_catalog')
      .insert({
        ...validated.data,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Et produkt med dette SKU findes allerede' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte kategori findes ikke' }
      }
      console.error('Database error creating product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Product }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette produkt') }
  }
}

export async function updateProduct(formData: FormData): Promise<ActionResult<Product>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Produkt ID mangler' }
    }
    validateUUID(id, 'produkt ID')

    const categoryId = formData.get('category_id') as string || null
    if (categoryId) {
      validateUUID(categoryId, 'kategori ID')
    }

    const rawData = {
      id,
      sku: formData.get('sku') as string || null,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      category_id: categoryId,
      cost_price: formData.get('cost_price') ? Number(formData.get('cost_price')) : null,
      list_price: Number(formData.get('list_price')),
      unit: formData.get('unit') as string || 'stk',
      specifications: safeJsonParse(formData.get('specifications') as string | null, {}),
      is_active: formData.get('is_active') !== 'false',
    }

    const validated = updateProductSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }
    const { id: productId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('product_catalog')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Produktet blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'Et produkt med dette SKU findes allerede' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte kategori findes ikke' }
      }
      console.error('Database error updating product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    revalidatePath(`/dashboard/products/${productId}`)
    return { success: true, data: data as Product }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere produkt') }
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'produkt ID')

    const { error } = await supabase.from('product_catalog').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Produktet kan ikke slettes da det er tilknyttet andre data' }
      }
      console.error('Database error deleting product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette produkt') }
  }
}

// Helper function for dropdowns
export async function getProductsForSelect(): Promise<
  ActionResult<{ id: string; name: string; sku: string | null; list_price: number }[]>
> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('product_catalog')
      .select('id, name, sku, list_price')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Database error fetching products for select:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente produkter') }
  }
}

// =====================================================
// Suppliers
// =====================================================

export async function getSuppliers(
  filters?: SupplierFilters
): Promise<ActionResult<PaginatedResponse<Supplier>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('suppliers')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase.from('suppliers').select('*')

    // Apply filters with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `name.ilike.%${sanitized}%,code.ilike.%${sanitized}%`
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
      console.error('Database error counting suppliers:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching suppliers:', dataResult.error)
      throw new Error('DATABASE_ERROR')
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
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Leverandøren blev ikke fundet' }
      }
      console.error('Database error fetching supplier:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandør') }
  }
}

export async function createSupplier(formData: FormData): Promise<ActionResult<Supplier>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

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

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        ...validated.data,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En leverandør med denne kode findes allerede' }
      }
      console.error('Database error creating supplier:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette leverandør') }
  }
}

export async function updateSupplier(formData: FormData): Promise<ActionResult<Supplier>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Leverandør ID mangler' }
    }
    validateUUID(id, 'leverandør ID')

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
    const { id: supplierId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Leverandøren blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'En leverandør med denne kode findes allerede' }
      }
      console.error('Database error updating supplier:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as Supplier }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere leverandør') }
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'leverandør ID')

    const { error } = await supabase.from('suppliers').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Leverandøren kan ikke slettes da den har tilknyttede produkter' }
      }
      console.error('Database error deleting supplier:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette leverandør') }
  }
}

// Helper function for dropdowns
export async function getSuppliersForSelect(): Promise<
  ActionResult<{ id: string; name: string; code: string | null }[]>
> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Database error fetching suppliers for select:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandører') }
  }
}

// =====================================================
// Supplier Products
// =====================================================

export async function getSupplierProducts(
  filters?: SupplierProductFilters
): Promise<ActionResult<PaginatedResponse<SupplierProductWithRelations>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Validate supplier_id if provided
    if (filters?.supplier_id) {
      validateUUID(filters.supplier_id, 'leverandør ID')
    }

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

    // Apply search with sanitization
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `supplier_name.ilike.%${sanitized}%,supplier_sku.ilike.%${sanitized}%`
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
      console.error('Database error counting supplier products:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching supplier products:', dataResult.error)
      throw new Error('DATABASE_ERROR')
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
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørprodukter') }
  }
}

export async function createSupplierProduct(
  formData: FormData
): Promise<ActionResult<SupplierProduct>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const supplierId = formData.get('supplier_id') as string
    if (!supplierId) {
      return { success: false, error: 'Leverandør ID er påkrævet' }
    }
    validateUUID(supplierId, 'leverandør ID')

    const productId = formData.get('product_id') as string || null
    if (productId) {
      validateUUID(productId, 'produkt ID')
    }

    const rawData = {
      supplier_id: supplierId,
      product_id: productId,
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

    const { data, error } = await supabase
      .from('supplier_products')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Dette produkt findes allerede hos leverandøren' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Leverandøren eller produktet findes ikke' }
      }
      console.error('Database error creating supplier product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as SupplierProduct }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette leverandørprodukt') }
  }
}

export async function updateSupplierProduct(
  formData: FormData
): Promise<ActionResult<SupplierProduct>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Leverandørprodukt ID mangler' }
    }
    validateUUID(id, 'leverandørprodukt ID')

    const supplierId = formData.get('supplier_id') as string
    if (!supplierId) {
      return { success: false, error: 'Leverandør ID er påkrævet' }
    }
    validateUUID(supplierId, 'leverandør ID')

    const productId = formData.get('product_id') as string || null
    if (productId) {
      validateUUID(productId, 'produkt ID')
    }

    const rawData = {
      id,
      supplier_id: supplierId,
      product_id: productId,
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
    const { id: supplierProductId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('supplier_products')
      .update(updateData)
      .eq('id', supplierProductId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Leverandørproduktet blev ikke fundet' }
      }
      if (error.code === '23505') {
        return { success: false, error: 'Dette produkt findes allerede hos leverandøren' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Leverandøren eller produktet findes ikke' }
      }
      console.error('Database error updating supplier product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true, data: data as SupplierProduct }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere leverandørprodukt') }
  }
}

export async function deleteSupplierProduct(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'leverandørprodukt ID')

    const { error } = await supabase.from('supplier_products').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Leverandørproduktet kan ikke slettes da det er tilknyttet andre data' }
      }
      console.error('Database error deleting supplier product:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/products')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette leverandørprodukt') }
  }
}
