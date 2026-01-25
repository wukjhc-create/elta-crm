import { z } from 'zod'

// Create customer schema
export const createCustomerSchema = z.object({
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
  phone: z
    .string()
    .max(50, 'Telefonnummer må højst være 50 tegn')
    .nullable()
    .optional(),
  mobile: z
    .string()
    .max(50, 'Mobilnummer må højst være 50 tegn')
    .nullable()
    .optional(),
  website: z
    .string()
    .max(200, 'Website må højst være 200 tegn')
    .nullable()
    .optional(),
  vat_number: z
    .string()
    .max(50, 'CVR-nummer må højst være 50 tegn')
    .nullable()
    .optional(),
  billing_address: z
    .string()
    .max(500, 'Adresse må højst være 500 tegn')
    .nullable()
    .optional(),
  billing_city: z
    .string()
    .max(100, 'By må højst være 100 tegn')
    .nullable()
    .optional(),
  billing_postal_code: z
    .string()
    .max(20, 'Postnummer må højst være 20 tegn')
    .nullable()
    .optional(),
  billing_country: z
    .string()
    .max(100, 'Land må højst være 100 tegn')
    .nullable()
    .optional(),
  shipping_address: z
    .string()
    .max(500, 'Adresse må højst være 500 tegn')
    .nullable()
    .optional(),
  shipping_city: z
    .string()
    .max(100, 'By må højst være 100 tegn')
    .nullable()
    .optional(),
  shipping_postal_code: z
    .string()
    .max(20, 'Postnummer må højst være 20 tegn')
    .nullable()
    .optional(),
  shipping_country: z
    .string()
    .max(100, 'Land må højst være 100 tegn')
    .nullable()
    .optional(),
  notes: z
    .string()
    .max(5000, 'Noter må højst være 5000 tegn')
    .nullable()
    .optional(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

// Update customer schema
export const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: z.string().uuid('Ugyldigt kunde ID'),
})

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>

// Create customer contact schema
export const createCustomerContactSchema = z.object({
  customer_id: z.string().uuid('Ugyldigt kunde ID'),
  name: z
    .string()
    .min(1, 'Navn er påkrævet')
    .max(200, 'Navn må højst være 200 tegn'),
  title: z
    .string()
    .max(100, 'Titel må højst være 100 tegn')
    .nullable()
    .optional(),
  email: z
    .string()
    .email('Indtast en gyldig e-mail adresse')
    .nullable()
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .max(50, 'Telefonnummer må højst være 50 tegn')
    .nullable()
    .optional(),
  mobile: z
    .string()
    .max(50, 'Mobilnummer må højst være 50 tegn')
    .nullable()
    .optional(),
  is_primary: z.boolean().default(false),
  notes: z
    .string()
    .max(1000, 'Noter må højst være 1000 tegn')
    .nullable()
    .optional(),
})

export type CreateCustomerContactInput = z.infer<typeof createCustomerContactSchema>

// Update customer contact schema
export const updateCustomerContactSchema = createCustomerContactSchema
  .omit({ customer_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt kontakt ID'),
  })

export type UpdateCustomerContactInput = z.infer<typeof updateCustomerContactSchema>

// Customer filter schema
export const customerFilterSchema = z.object({
  search: z.string().optional(),
  is_active: z.boolean().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'company_name', 'customer_number']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CustomerFilterInput = z.infer<typeof customerFilterSchema>
