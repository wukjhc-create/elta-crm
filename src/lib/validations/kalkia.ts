import { z } from 'zod'
import {
  KALKIA_NODE_TYPES,
  KALKIA_RULE_TYPES,
  KALKIA_CALCULATION_STATUSES,
  KALKIA_FACTOR_CATEGORIES,
  KALKIA_VALUE_TYPES,
} from '@/types/kalkia.types'

// Helper function to convert empty string to null
const toNullIfEmpty = (val: unknown) => (val === '' ? null : val)

// =====================================================
// Kalkia Node Schemas
// =====================================================

export const createKalkiaNodeSchema = z.object({
  parent_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  code: z.string().min(1, 'Kode er paakreevet').max(50, 'Kode maa max vaere 50 tegn'),
  name: z.string().min(1, 'Navn er paakreevet').max(200, 'Navn maa max vaere 200 tegn'),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  node_type: z.enum(KALKIA_NODE_TYPES, {
    errorMap: () => ({ message: 'Ugyldig node type' }),
  }),
  base_time_seconds: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  category_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  default_cost_price: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).default(0)
  ),
  default_sale_price: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).default(0)
  ),
  difficulty_level: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().int().min(1).max(5).default(1)
  ),
  requires_certification: z.boolean().default(false),
  is_active: z.boolean().default(true),
  ai_tags: z.array(z.string()).default([]),
  notes: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  sort_order: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
})

export const updateKalkiaNodeSchema = createKalkiaNodeSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateKalkiaNodeSchema = z.infer<typeof createKalkiaNodeSchema>
export type UpdateKalkiaNodeSchema = z.infer<typeof updateKalkiaNodeSchema>

// =====================================================
// Kalkia Variant Schemas
// =====================================================

export const createKalkiaVariantSchema = z.object({
  node_id: z.string().uuid('Ugyldig node ID'),
  code: z.string().min(1, 'Kode er paakreevet').max(50, 'Kode maa max vaere 50 tegn'),
  name: z.string().min(1, 'Navn er paakreevet').max(200, 'Navn maa max vaere 200 tegn'),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  base_time_seconds: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  time_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(100).default(1)
  ),
  extra_time_seconds: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  price_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(100).default(1)
  ),
  cost_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(100).default(1)
  ),
  waste_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  is_default: z.boolean().default(false),
  sort_order: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
})

export const updateKalkiaVariantSchema = createKalkiaVariantSchema
  .omit({ node_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateKalkiaVariantSchema = z.infer<typeof createKalkiaVariantSchema>
export type UpdateKalkiaVariantSchema = z.infer<typeof updateKalkiaVariantSchema>

// =====================================================
// Kalkia Variant Material Schemas
// =====================================================

export const createKalkiaVariantMaterialSchema = z.object({
  variant_id: z.string().uuid('Ugyldig variant ID'),
  product_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  material_name: z.string().min(1, 'Materialenavn er paakreevet').max(200),
  quantity: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.0001).default(1)
  ),
  unit: z.string().max(20).default('stk'),
  cost_price: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0).nullable().optional()
  ),
  sale_price: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0).nullable().optional()
  ),
  is_optional: z.boolean().default(false),
  sort_order: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
})

export const updateKalkiaVariantMaterialSchema = createKalkiaVariantMaterialSchema
  .omit({ variant_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateKalkiaVariantMaterialSchema = z.infer<typeof createKalkiaVariantMaterialSchema>
export type UpdateKalkiaVariantMaterialSchema = z.infer<typeof updateKalkiaVariantMaterialSchema>

// =====================================================
// Kalkia Building Profile Schemas
// =====================================================

export const createKalkiaBuildingProfileSchema = z.object({
  code: z.string().min(1, 'Kode er paakreevet').max(50, 'Kode maa max vaere 50 tegn'),
  name: z.string().min(1, 'Navn er paakreevet').max(200, 'Navn maa max vaere 200 tegn'),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  time_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(10).default(1)
  ),
  difficulty_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(10).default(1)
  ),
  material_waste_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(10).default(1)
  ),
  overhead_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(10).default(1)
  ),
  typical_wall_type: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  typical_access: z.string().default('normal'),
  is_active: z.boolean().default(true),
  sort_order: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
})

export const updateKalkiaBuildingProfileSchema = createKalkiaBuildingProfileSchema
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateKalkiaBuildingProfileSchema = z.infer<typeof createKalkiaBuildingProfileSchema>
export type UpdateKalkiaBuildingProfileSchema = z.infer<typeof updateKalkiaBuildingProfileSchema>

// =====================================================
// Kalkia Global Factor Schemas
// =====================================================

export const createKalkiaGlobalFactorSchema = z.object({
  factor_key: z.string().min(1, 'Faktor-noegle er paakreevet').max(50),
  factor_name: z.string().min(1, 'Faktornavn er paakreevet').max(200),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  category: z.enum(KALKIA_FACTOR_CATEGORIES, {
    errorMap: () => ({ message: 'Ugyldig kategori' }),
  }),
  value_type: z.enum(KALKIA_VALUE_TYPES, {
    errorMap: () => ({ message: 'Ugyldig vaerditype' }),
  }),
  value: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number()
  ),
  min_value: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().nullable().optional()
  ),
  max_value: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().nullable().optional()
  ),
  applies_to: z.array(z.string()).default(['all']),
  is_active: z.boolean().default(true),
  sort_order: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
})

export const updateKalkiaGlobalFactorSchema = createKalkiaGlobalFactorSchema
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateKalkiaGlobalFactorSchema = z.infer<typeof createKalkiaGlobalFactorSchema>
export type UpdateKalkiaGlobalFactorSchema = z.infer<typeof updateKalkiaGlobalFactorSchema>

// =====================================================
// Kalkia Rule Schemas
// =====================================================

export const createKalkiaRuleSchema = z.object({
  node_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  variant_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  rule_name: z.string().min(1, 'Regelnavn er paakreevet').max(200),
  rule_type: z.enum(KALKIA_RULE_TYPES, {
    errorMap: () => ({ message: 'Ugyldig regeltype' }),
  }),
  condition: z.record(z.unknown()).default({}),
  time_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(100).default(1)
  ),
  extra_time_seconds: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  cost_multiplier: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.001).max(100).default(1)
  ),
  extra_cost: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).default(0)
  ),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  priority: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  is_active: z.boolean().default(true),
})

export const updateKalkiaRuleSchema = createKalkiaRuleSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
})

export type CreateKalkiaRuleSchema = z.infer<typeof createKalkiaRuleSchema>
export type UpdateKalkiaRuleSchema = z.infer<typeof updateKalkiaRuleSchema>

// =====================================================
// Kalkia Calculation Schemas
// =====================================================

export const createKalkiaCalculationSchema = z.object({
  name: z.string().min(1, 'Navn er paakreevet').max(200),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  customer_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  building_profile_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  hourly_rate: z.preprocess(
    (val) => (val === '' ? 495 : Number(val)),
    z.number().min(0).default(495)
  ),
  margin_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  discount_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  vat_percentage: z.preprocess(
    (val) => (val === '' ? 25 : Number(val)),
    z.number().min(0).max(100).default(25)
  ),
  overhead_percentage: z.preprocess(
    (val) => (val === '' ? 12 : Number(val)),
    z.number().min(0).max(100).default(12)
  ),
  risk_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  is_template: z.boolean().default(false),
})

export const updateKalkiaCalculationSchema = createKalkiaCalculationSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
  status: z.enum(KALKIA_CALCULATION_STATUSES).optional(),
})

export type CreateKalkiaCalculationSchema = z.infer<typeof createKalkiaCalculationSchema>
export type UpdateKalkiaCalculationSchema = z.infer<typeof updateKalkiaCalculationSchema>

// =====================================================
// Kalkia Calculation Row Schemas
// =====================================================

export const createKalkiaCalculationRowSchema = z.object({
  calculation_id: z.string().uuid('Ugyldig kalkulation ID'),
  node_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  variant_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  position: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0).default(0)
  ),
  section: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  description: z.string().min(1, 'Beskrivelse er paakreevet'),
  quantity: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0.0001).default(1)
  ),
  unit: z.string().max(20).default('stk'),
  conditions: z.record(z.unknown()).default({}),
  show_on_offer: z.boolean().default(true),
  is_optional: z.boolean().default(false),
})

export const updateKalkiaCalculationRowSchema = createKalkiaCalculationRowSchema
  .omit({ calculation_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateKalkiaCalculationRowSchema = z.infer<typeof createKalkiaCalculationRowSchema>
export type UpdateKalkiaCalculationRowSchema = z.infer<typeof updateKalkiaCalculationRowSchema>

// =====================================================
// Filter Schemas
// =====================================================

export const kalkiaNodeFilterSchema = z.object({
  search: z.string().optional(),
  node_type: z.enum(KALKIA_NODE_TYPES).optional(),
  category_id: z.string().uuid().optional(),
  parent_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  is_active: z.boolean().optional(),
  path_prefix: z.string().optional(),
  depth: z.number().int().min(0).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export const kalkiaCalculationFilterSchema = z.object({
  search: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  building_profile_id: z.string().uuid().optional(),
  status: z.enum(KALKIA_CALCULATION_STATUSES).optional(),
  is_template: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export type KalkiaNodeFilterSchema = z.infer<typeof kalkiaNodeFilterSchema>
export type KalkiaCalculationFilterSchema = z.infer<typeof kalkiaCalculationFilterSchema>

// =====================================================
// Calculation Item Schema (for engine input)
// =====================================================

export const kalkiaCalculationItemSchema = z.object({
  nodeId: z.string().uuid('Ugyldig node ID'),
  variantId: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  quantity: z.number().min(0.0001, 'Antal skal vaere stoerre end 0'),
  conditions: z.object({
    height: z.number().min(0).optional(),
    quantity: z.number().min(0).optional(),
    access: z.enum(['easy', 'normal', 'difficult']).optional(),
    distance: z.number().min(0).optional(),
    custom: z.record(z.unknown()).optional(),
  }).optional(),
  section: z.string().optional(),
})

export const kalkiaCalculationItemsSchema = z.array(kalkiaCalculationItemSchema)

export type KalkiaCalculationItemSchema = z.infer<typeof kalkiaCalculationItemSchema>
