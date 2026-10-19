import { z } from 'zod'
import { parseDanishDecimal } from '@/lib/utils/danish-number'
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

// TZ-1/TZ-2 (format-review 2026-10-18): fælles dansk parser — før blev "10.000" til 10 kr (Number("10.000")), og et
// ugyldigt beløb ryddede feltet lydløst (null). Tomt = null; ugyldigt = valideringsfejl.
const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return null
    const n = parseDanishDecimal(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'Ugyldigt tal (brug fx 10.000 eller 1.234,50)' })
      return z.NEVER
    }
    return n
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
  // "— Vælg type —" sender '' → null (før en valideringsfejl: formularen kunne ikke gemmes uden type, U202)
  type: z.enum(SERVICE_CASE_TYPES).nullable().optional().or(z.literal('').transform(() => null)),

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
  // X-14 (00232): afregningsform kan vælges ved oprettelse; tom = vælges senere (slutfaktura blokeret til valgt)
  billing_model: z.enum(['fixed_price', 'time_and_materials']).nullable().optional(),
})

export type CreateServiceCaseInput = z.infer<typeof createServiceCaseSchema>

/**
 * IV2-4 (inputvaliderings-review 2026-10-18): serverens skema for createServiceCase — formularens felter plus de
 * felter modalen/mail-flowet sender (adresse, koordinater, KSR/EAN, kilde-id'er). Før validerede serveren intet
 * (formularens zod-skema kørte kun i browseren). Ukendte nøgler fjernes; insert'et lister selv sine kolonner.
 */
const optionalCoord = (min: number, max: number) =>
  z.number().refine((n) => Number.isFinite(n) && n >= min && n <= max, 'Ugyldig koordinat').nullable().optional()

export const createServiceCaseServerSchema = createServiceCaseSchema.extend({
  address: optionalString(300, 'Adresse'),
  postal_code: optionalString(10, 'Postnummer'),
  city: optionalString(100, 'By'),
  floor_door: optionalString(50, 'Etage/dør'),
  latitude: optionalCoord(-90, 90),
  longitude: optionalCoord(-180, 180),
  contact_phone: optionalString(50, 'Telefon'),
  ksr_number: optionalString(50, 'KSR-nummer'),
  ean_number: optionalString(50, 'EAN-nummer'),
  source_email_id: optionalUuid,
  source_offer_id: optionalUuid,
})

/** Beløb/timer på en sag: endelige, ikke-negative og under et fornuftigt loft. null = ok, ellers dansk fejl. */
export function serviceCaseAmountsError(v: { planned_hours?: number | null; contract_sum?: number | null; revised_sum?: number | null; budget?: number | null }): string | null {
  const checks: Array<[number | null | undefined, string, number]> = [
    [v.planned_hours, 'Planlagte timer', 100_000], [v.contract_sum, 'Kontraktsum', 1_000_000_000],
    [v.revised_sum, 'Revideret sum', 1_000_000_000], [v.budget, 'Budget', 1_000_000_000],
  ]
  for (const [n, label, max] of checks) {
    if (n == null) continue
    if (!Number.isFinite(n) || n < 0 || n > max) return `${label} skal være mellem 0 og ${max.toLocaleString('da-DK')}`
  }
  return null
}

export const updateServiceCaseSchema = createServiceCaseSchema.partial().extend({
  id: z.string().uuid('Ugyldigt sag ID'),
})

export type UpdateServiceCaseInput = z.infer<typeof updateServiceCaseSchema>
