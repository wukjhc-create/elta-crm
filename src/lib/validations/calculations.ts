import { z } from 'zod'
import { CALCULATION_TYPES, CALCULATION_ROW_TYPES, CALCULATION_MODES, COST_CATEGORIES } from '@/types/calculations.types'

// Helper function to convert empty string to null
const toNullIfEmpty = (val: unknown) => (val === '' ? null : val)

// =====================================================
// Solar Calculation Settings Schema
// =====================================================

export const solarCalculationSettingsSchema = z.object({
  systemSize: z.number().min(0).optional(),
  panelCount: z.number().int().min(0).optional(),
  panelWattage: z.number().min(0).optional(),
  inverterType: z.enum(['string', 'micro', 'hybrid']).optional(),
  batteryCapacity: z.number().min(0).optional(),
  roofType: z.enum(['flat', 'pitched', 'integrated']).optional(),
  annualProduction: z.number().min(0).optional(),
  electricityPrice: z.number().min(0).optional(),
  selfConsumptionRate: z.number().min(0).max(100).optional(),
})

export const solarROIDataSchema = z.object({
  paybackYears: z.number().min(0).optional(),
  annualSavings: z.number().min(0).optional(),
  totalSavings25Years: z.number().min(0).optional(),
  co2Reduction: z.number().min(0).optional(),
  investmentReturn: z.number().optional(),
})

// Enhanced ROI data schema (works for all project types)
export const enhancedROIDataSchema = z.object({
  investmentAmount: z.number().min(0),
  paybackYears: z.number().min(0),
  simpleROI: z.number(),

  // Solar-specific
  annualProduction: z.number().min(0).optional(),
  selfConsumptionRate: z.number().min(0).max(100).optional(),
  annualSavings: z.number().min(0).optional(),
  totalSavings25Years: z.number().min(0).optional(),
  co2Reduction: z.number().min(0).optional(),

  // General project
  estimatedAnnualBenefit: z.number().min(0).optional(),
  projectLifeYears: z.number().int().min(1).optional(),
})

// =====================================================
// Calculation Schemas
// =====================================================

export const createCalculationSchema = z.object({
  name: z.string().min(1, 'Navn er påkrævet'),
  description: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  customer_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  calculation_type: z.enum(CALCULATION_TYPES).default('custom'),
  settings: z.record(z.unknown()).default({}),
  margin_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  discount_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  tax_percentage: z.preprocess(
    (val) => (val === '' ? 25 : Number(val)),
    z.number().min(0).max(100).default(25)
  ),
  is_template: z.boolean().default(false),

  // Enhanced calculation fields
  calculation_mode: z.enum(CALCULATION_MODES).default('standard'),
  default_hourly_rate: z.preprocess(
    (val) => (val === '' ? 450 : Number(val)),
    z.number().min(0).default(450)
  ),
  materials_markup_percentage: z.preprocess(
    (val) => (val === '' ? 25 : Number(val)),
    z.number().min(0).max(100).default(25)
  ),
  show_cost_breakdown: z.boolean().default(false),
  group_by_section: z.boolean().default(true),
})

export const updateCalculationSchema = createCalculationSchema.partial().extend({
  id: z.string().uuid('Ugyldigt ID'),
  roi_data: z.union([solarROIDataSchema, enhancedROIDataSchema]).nullable().optional(),
})

export type CreateCalculationInput = z.infer<typeof createCalculationSchema>
export type UpdateCalculationInput = z.infer<typeof updateCalculationSchema>

// =====================================================
// Calculation Row Schemas
// =====================================================

export const createCalculationRowSchema = z.object({
  calculation_id: z.string().uuid('Ugyldig kalkulation ID'),
  row_type: z.enum(CALCULATION_ROW_TYPES).default('manual'),
  product_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  supplier_product_id: z.preprocess(toNullIfEmpty, z.string().uuid().nullable().optional()),
  section: z.preprocess(toNullIfEmpty, z.string().nullable().optional()),
  position: z.number().int().min(0),
  description: z.string().min(1, 'Beskrivelse er påkrævet'),
  quantity: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().min(0).default(1)
  ),
  unit: z.string().default('stk'),
  cost_price: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0).nullable().optional()
  ),
  sale_price: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0)
  ),
  discount_percentage: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().min(0).max(100).default(0)
  ),
  show_on_offer: z.boolean().default(true),

  // Enhanced calculation row fields
  cost_category: z.enum(COST_CATEGORIES).default('variable'),
  hours: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0).nullable().optional()
  ),
  hourly_rate: z.preprocess(
    (val) => (val === '' || val === null ? null : Number(val)),
    z.number().min(0).nullable().optional()
  ),
})

export const updateCalculationRowSchema = createCalculationRowSchema
  .omit({ calculation_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt ID'),
  })

export type CreateCalculationRowInput = z.infer<typeof createCalculationRowSchema>
export type UpdateCalculationRowInput = z.infer<typeof updateCalculationRowSchema>

// =====================================================
// Filter Schemas
// =====================================================

export const calculationFilterSchema = z.object({
  search: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  calculation_type: z.enum(CALCULATION_TYPES).optional(),
  is_template: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})
