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
import { parseDanishDecimal } from '@/lib/utils/danish-number'
import { z } from 'zod'

// .nullable() er påkrævet: klientens zodResolver transformerer "" → null,
// hvorefter server-actionen re-parser det transformerede output. Uden
// .nullable() ville z.string().optional() afvise null ("Expected string,
// received null"). Transformerne håndterer allerede null (v && … → null).
const optionalString = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Datoen skal være i formatet YYYY-MM-DD'
  )

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null
    // TZ-1/TZ-2: fælles dansk parser ("1.250" = 1250, før 1,25); ugyldigt = fejl (før lydløst null)
    const n = parseDanishDecimal(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'Ugyldigt tal (brug fx 1.250 eller 312,50)' })
      return z.NEVER
    }
    return n
  })

const requiredPercent = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    // TZ-1/TZ-2: tomt/ugyldigt er en fejl — før blev det lydløst 0 %
    const n = parseDanishDecimal(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'Angiv procent som tal (0 hvis ingen)' })
      return z.NEVER
    }
    return n
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

/** 00229: normtimer pr. uge — undefined = uændret, '' = "Norm ikke sat" (null), ellers 0–60. Ingen 37-fallback. */
const weeklyHours = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined
    if (v === null || (typeof v === 'string' && v.trim() === '')) return null
    const n = parseDanishDecimal(v) ?? NaN // TZ-1/TZ-2: fælles parser
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      ctx.addIssue({ code: 'custom', message: 'Normtimer skal være mellem 0 og 60 (eller tomt)' })
      return z.NEVER
    }
    return Math.round(n * 10) / 10
  })

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
  employment_type: z
    .enum(['timelønnet', 'funktionær', 'lærling', 'ekstern'])
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length > 0 ? v : null)),
  active: z.boolean().default(true),
  employee_number: optionalString,
  phone: optionalString,
  address: optionalString,
  postal_code: optionalString,
  city: optionalString,
  hire_date: optionalDate,
  termination_date: optionalDate,
  notes: optionalString,
  weekly_hours: weeklyHours,
  profile_id: z
    .string()
    .uuid()
    .nullable()
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
