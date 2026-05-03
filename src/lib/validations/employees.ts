/**
 * Zod validation schemas for the employee module.
 *
 * Two distinct schemas:
 *  - EmployeeIdentitySchema: HR/personal fields. Editing identity does
 *    NOT require knowing or re-validating compensation values.
 *  - EmployeeCompensationSchema: pay rates + percentages. Edited
 *    independently and snapshotted into employee_compensation_history
 *    on every change.
 */
import { z } from 'zod'

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Datoen skal være i formatet YYYY-MM-DD'
  )

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  })

const requiredPercent = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  })
  .pipe(z.number().min(0, 'Procent kan ikke være negativ').max(100, 'Procent kan ikke overstige 100'))

export const EMPLOYEE_ROLES = [
  'elektriker',
  'montør',
  'lærling',
  'projektleder',
  'kontor',
  'admin',
  // legacy values still allowed for backwards compat on existing rows
  'electrician',
  'installer',
] as const

export const EmployeeIdentitySchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, 'Fornavn er påkrævet')
    .max(80),
  last_name: z
    .string()
    .trim()
    .min(1, 'Efternavn er påkrævet')
    .max(80),
  email: z
    .string()
    .trim()
    .min(3, 'E-mail er påkrævet')
    .email('Ugyldig e-mail-adresse'),
  role: z.enum(EMPLOYEE_ROLES, { message: 'Ugyldig rolle' }),
  active: z.boolean().default(true),
  employee_number: optionalString,
  phone: optionalString,
  address: optionalString,
  postal_code: optionalString,
  city: optionalString,
  hire_date: optionalDate,
  termination_date: optionalDate,
  notes: optionalString,
  profile_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length > 0 ? v : null)),
})

export type EmployeeIdentityInput = z.infer<typeof EmployeeIdentitySchema>

export const EmployeeCompensationSchema = z.object({
  hourly_wage: optionalNumber,
  internal_cost_rate: optionalNumber,
  sales_rate: optionalNumber,
  pension_pct: requiredPercent,
  free_choice_pct: requiredPercent,
  vacation_pct: requiredPercent,
  sh_pct: requiredPercent,
  social_costs: optionalNumber.transform((v) => v ?? 0),
  overhead_pct: requiredPercent,
  overtime_rate: optionalNumber,
  mileage_rate: optionalNumber,
  notes: optionalString,
  change_reason: optionalString,
})

export type EmployeeCompensationInput = z.infer<typeof EmployeeCompensationSchema>
