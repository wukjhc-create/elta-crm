import { z } from 'zod'
import { LEAD_STATUSES, LEAD_SOURCES } from '@/types/leads.types'

// Helper to transform empty string to null
const emptyStringToNull = z.string().transform(val => val === '' ? null : val)

// Create lead schema
export const createLeadSchema = z.object({
  company_name: z
    .string()
    .min(1, 'Firmanavn er påkrævet')
    .max(200, 'Firmanavn må højst være 200 tegn'),
  contact_person: z
    .string()
    .min(1, 'Kontaktperson er påkrævet')
    .max(200, 'Kontaktperson må højst være 200 tegn'),
  email: z
    .string()
    .min(1, 'E-mail er påkrævet')
    .email('Indtast en gyldig e-mail adresse'),
  phone: emptyStringToNull.nullable().optional(),
  status: z.enum(LEAD_STATUSES).default('new'),
  source: z.enum(LEAD_SOURCES).default('other'),
  value: z.number().min(0, 'Værdi skal være positiv').nullable().optional(),
  probability: z
    .number()
    .min(0, 'Sandsynlighed skal være mellem 0 og 100')
    .max(100, 'Sandsynlighed skal være mellem 0 og 100')
    .nullable()
    .optional(),
  expected_close_date: emptyStringToNull.nullable().optional(),
  notes: emptyStringToNull.nullable().optional(),
  assigned_to: emptyStringToNull.nullable().optional(),
  tags: z.array(z.string()).default([]),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>

// Update lead schema
export const updateLeadSchema = createLeadSchema.partial().extend({
  id: z.string().uuid('Ugyldigt lead ID'),
})

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>

// Lead filter schema
export const leadFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assigned_to: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'company_name', 'value', 'expected_close_date']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type LeadFilterInput = z.infer<typeof leadFilterSchema>
