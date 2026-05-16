import { z } from 'zod'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_PRIORITIES,
  SERVICE_CASE_SOURCES,
  SERVICE_CASE_TYPES,
} from '@/types/service-cases.types'

const BILLING_MODE_VALUES = [
  'same_as_customer',
  'orderer_pays',
  'end_customer_pays',
  'third_party_pays',
  'unknown',
] as const

const optionalString = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} må højst være ${max} tegn`)
    .nullable()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  })

const optionalUuid = z
  .string()
  .uuid('Ugyldigt ID')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))

const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

export const createServiceCaseSchema = z.object({
  // Required
  title: z
    .string()
    .min(1, 'Titel er påkrævet')
    .max(200, 'Titel må højst være 200 tegn'),

  // Display + classification
  project_name: optionalString(200, 'Projektnavn'),
  type: z.enum(SERVICE_CASE_TYPES).nullable().optional(),

  // Status / priority / source
  status: z.enum(SERVICE_CASE_STATUSES).default('new'),
  priority: z.enum(SERVICE_CASE_PRIORITIES).default('medium'),
  source: z.enum(SERVICE_CASE_SOURCES).default('manual'),

  // Customer + references
  customer_id: optionalUuid,
  reference: optionalString(100, 'Reference'),
  requisition: optionalString(100, 'Rekvirent'),

  // Description / notes
  description: optionalString(5000, 'Beskrivelse'),
  status_note: optionalString(2000, 'Bemærkninger'),

  // People
  assigned_to: optionalUuid,
  formand_id: optionalUuid,

  // Planning
  start_date: optionalDate,
  end_date: optionalDate,
  planned_hours: optionalNumber,

  // Economics
  contract_sum: optionalNumber,
  revised_sum: optionalNumber,
  budget: optionalNumber,

  // Sprint 9E Phase 4 — sagspartner-roller (alle valgfri)
  orderer_customer_id: optionalUuid,
  end_customer_id: optionalUuid,
  payer_customer_id: optionalUuid,
  purchased_from_customer_id: optionalUuid,
  purchase_source: optionalString(200, 'Købssted'),
  billing_mode: z.enum(BILLING_MODE_VALUES).nullable().optional(),
})

export type CreateServiceCaseInput = z.infer<typeof createServiceCaseSchema>

export const updateServiceCaseSchema = createServiceCaseSchema.partial().extend({
  id: z.string().uuid('Ugyldigt sag ID'),
})

export type UpdateServiceCaseInput = z.infer<typeof updateServiceCaseSchema>
