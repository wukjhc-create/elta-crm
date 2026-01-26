import { z } from 'zod'

// Helper function to convert empty string to null
const toNullIfEmpty = (val: unknown) => (val === '' ? null : val)

// =====================================================
// Supplier Schemas
// =====================================================

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Navn er påkrævet'),
  code: z.preprocess(
    toNullIfEmpty,
    z.string().max(20, 'Kode må maks være 20 tegn').nullable().optional()
  ),
  contact_name: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  contact_email: z.preprocess(
    toNullIfEmpty,
    z.string().email('Ugyldig email').nullable().optional()
  ),
  contact_phone: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  website: z.preprocess(
    toNullIfEmpty,
    z.string().url('Ugyldig URL').nullable().optional()
  ),
  notes: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  is_active: z.boolean().default(true),
})

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

// =====================================================
// Product Category Schemas
// =====================================================

export const createProductCategorySchema = z.object({
  name: z.string().min(1, 'Navn er påkrævet'),
  slug: z
    .string()
    .min(1, 'Slug er påkrævet')
    .regex(/^[a-z0-9-]+$/, 'Slug må kun indeholde små bogstaver, tal og bindestreger'),
  parent_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
})

export const updateProductCategorySchema = createProductCategorySchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>
export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>

// =====================================================
// Product Schemas
// =====================================================

export const productSpecificationsSchema = z
  .object({
    wattage: z.number().optional(),
    efficiency: z.number().min(0).max(1).optional(),
    dimensions: z.string().optional(),
    weight: z.number().optional(),
    warranty_years: z.number().int().optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()]))
  .default({})

export const createProductSchema = z.object({
  sku: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  name: z.string().min(1, 'Produktnavn er påkrævet'),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  category_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  cost_price: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0, 'Kostpris må ikke være negativ').nullable().optional()
  ),
  list_price: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0, 'Listepris må ikke være negativ')
  ),
  unit: z.string().default('stk'),
  specifications: productSpecificationsSchema.optional(),
  is_active: z.boolean().default(true),
})

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>

// =====================================================
// Supplier Product Schemas
// =====================================================

export const createSupplierProductSchema = z.object({
  supplier_id: z.string().uuid('Ugyldig leverandør ID'),
  product_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  supplier_sku: z.string().min(1, 'Leverandør SKU er påkrævet'),
  supplier_name: z.string().min(1, 'Produktnavn hos leverandør er påkrævet'),
  cost_price: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0, 'Kostpris må ikke være negativ').nullable().optional()
  ),
  is_available: z.boolean().default(true),
  lead_time_days: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().int().min(0).nullable().optional()
  ),
})

export const updateSupplierProductSchema = createSupplierProductSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>

// =====================================================
// Filter Schemas
// =====================================================

export const productFilterSchema = z.object({
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const supplierFilterSchema = z.object({
  search: z.string().optional(),
  is_active: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const supplierProductFilterSchema = z.object({
  supplier_id: z.string().uuid().optional(),
  is_available: z.boolean().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})
