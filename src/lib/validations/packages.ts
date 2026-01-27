import { z } from 'zod'

// Package item types
export const packageItemTypes = ['component', 'product', 'manual', 'time'] as const

// Create package schema
export const createPackageSchema = z.object({
  name: z.string().min(1, 'Navn er påkrævet').max(255),
  code: z.string().max(50).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  default_markup_percentage: z.coerce.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  is_template: z.boolean().optional(),
})

export type CreatePackageInput = z.infer<typeof createPackageSchema>

// Update package schema
export const updatePackageSchema = createPackageSchema.partial().extend({
  id: z.string().uuid(),
})

export type UpdatePackageInput = z.infer<typeof updatePackageSchema>

// Create package item schema
export const createPackageItemSchema = z.object({
  package_id: z.string().uuid(),
  item_type: z.enum(packageItemTypes),
  component_id: z.string().uuid().optional().nullable(),
  component_variant_code: z.string().max(50).optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'Beskrivelse er påkrævet').max(500),
  quantity: z.coerce.number().min(0.01, 'Antal skal være mindst 0.01'),
  unit: z.string().max(20).optional(),
  cost_price: z.coerce.number().min(0).optional(),
  sale_price: z.coerce.number().min(0).optional(),
  time_minutes: z.coerce.number().min(0).optional(),
  sort_order: z.coerce.number().int().optional(),
  show_on_offer: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
})

export type CreatePackageItemInput = z.infer<typeof createPackageItemSchema>

// Update package item schema
export const updatePackageItemSchema = createPackageItemSchema
  .omit({ package_id: true })
  .partial()
  .extend({
    id: z.string().uuid(),
  })

export type UpdatePackageItemInput = z.infer<typeof updatePackageItemSchema>

// Reorder items schema
export const reorderPackageItemsSchema = z.object({
  package_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()),
})

export type ReorderPackageItemsInput = z.infer<typeof reorderPackageItemsSchema>

// Insert package into calculation/offer schema
export const insertPackageSchema = z.object({
  package_id: z.string().uuid(),
  target_id: z.string().uuid(), // calculation_id or offer_id
  starting_position: z.number().int().min(0).default(0),
  quantity_multiplier: z.number().min(0.01).default(1),
})

export type InsertPackageInput = z.infer<typeof insertPackageSchema>
