import { z } from 'zod'
import { OFFER_STATUSES, OFFER_BILLING_MODES } from '@/types/offers.types'

// Helper to convert empty strings to null (for optional UUID fields from HTML forms)
const emptyStringToNull = (val: unknown) => (val === '' ? null : val)

// Create offer schema
export const createOfferSchema = z.object({
  title: z
    .string()
    .min(1, 'Titel er påkrævet')
    .max(200, 'Titel må højst være 200 tegn'),
  description: z
    .string()
    .max(5000, 'Beskrivelse må højst være 5000 tegn')
    .nullable()
    .optional(),
  scope: z
    .string()
    .max(10000, 'Opgavens omfang må højst være 10000 tegn')
    .nullable()
    .optional(),
  customer_id: z.preprocess(emptyStringToNull, z.string().uuid().nullable().optional()),
  lead_id: z.preprocess(emptyStringToNull, z.string().uuid().nullable().optional()),
  // Sprint 12A — sagspartner-roller (optional). Action-laget default-fylder
  // til customer_id hvis ikke sat. billing_mode defaultes til
  // 'same_as_customer' hvis ikke sat.
  orderer_customer_id: z.preprocess(emptyStringToNull, z.string().uuid().nullable().optional()),
  end_customer_id: z.preprocess(emptyStringToNull, z.string().uuid().nullable().optional()),
  payer_customer_id: z.preprocess(emptyStringToNull, z.string().uuid().nullable().optional()),
  billing_mode: z.preprocess(
    emptyStringToNull,
    z.enum(OFFER_BILLING_MODES).nullable().optional(),
  ),
  // DF-10 (dataflow-review 2026-10-17): afregningsform (00232) — sagen arver den ved accept; tom = vælges på sagen
  billing_model: z.preprocess(
    emptyStringToNull,
    z.enum(['fixed_price', 'time_and_materials']).nullable().optional(),
  ),
  discount_percentage: z
    .number()
    .min(0, 'Rabat skal være mindst 0%')
    .max(100, 'Rabat må højst være 100%')
    .default(0),
  tax_percentage: z
    .number()
    .min(0, 'Moms skal være mindst 0%')
    .max(100, 'Moms må højst være 100%')
    .default(25),
  valid_until: z.string().nullable().optional(),
  terms_and_conditions: z
    .string()
    .max(10000, 'Betingelser må højst være 10000 tegn')
    .nullable()
    .optional(),
  notes: z
    .string()
    .max(5000, 'Noter må højst være 5000 tegn')
    .nullable()
    .optional(),
})

export type CreateOfferInput = z.infer<typeof createOfferSchema>

// Update offer schema
export const updateOfferSchema = createOfferSchema.partial().extend({
  id: z.string().uuid('Ugyldigt tilbud ID'),
  status: z.enum(OFFER_STATUSES).optional(),
})

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>

// Create line item schema
export const createLineItemSchema = z.object({
  offer_id: z.string().uuid('Ugyldigt tilbud ID'),
  position: z.number().int().min(1),
  description: z
    .string()
    .min(1, 'Beskrivelse er påkrævet')
    .max(500, 'Beskrivelse må højst være 500 tegn'),
  // IV2-7 (inputvaliderings-review 2026-10-18): endelige tal med øvre grænse (før kunne Infinity/1e300 gemmes)
  quantity: z
    .number()
    .finite('Ugyldigt antal')
    .min(0.01, 'Antal skal være større end 0')
    .max(1_000_000, 'Antal må højst være 1.000.000'),
  unit: z.string().max(30, 'Enhed må højst være 30 tegn').default('stk'),
  unit_price: z
    .number()
    .finite('Ugyldig pris')
    .min(0, 'Pris skal være mindst 0')
    .max(100_000_000, 'Pris må højst være 100.000.000'),
  discount_percentage: z
    .number()
    .finite('Ugyldig rabat')
    .min(0, 'Rabat skal være mindst 0%')
    .max(100, 'Rabat må højst være 100%')
    .default(0),
})

export type CreateLineItemInput = z.infer<typeof createLineItemSchema>

// Update line item schema
export const updateLineItemSchema = createLineItemSchema
  .omit({ offer_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt linje ID'),
  })

export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>

// Offer filter schema
export const offerFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(OFFER_STATUSES).optional(),
  customer_id: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'offer_number', 'final_amount', 'valid_until']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type OfferFilterInput = z.infer<typeof offerFilterSchema>
