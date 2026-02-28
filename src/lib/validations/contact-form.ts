import { z } from 'zod'

/**
 * Zod schema for website contact form submissions.
 * Matches the fields collected by the eltasolar.dk contact form.
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Navn skal være mindst 2 tegn')
    .max(200, 'Navn er for langt')
    .trim(),
  email: z
    .string()
    .email('Ugyldig e-mailadresse')
    .max(254, 'E-mail er for lang')
    .trim()
    .toLowerCase(),
  phone: z
    .string()
    .min(8, 'Telefonnummer skal være mindst 8 cifre')
    .max(20, 'Telefonnummer er for langt')
    .trim(),
  zip: z
    .string()
    .regex(/^\d{4}$/, 'Postnummer skal være 4 cifre')
    .trim(),
  address: z
    .string()
    .min(2, 'Adresse er for kort')
    .max(300, 'Adresse er for lang')
    .trim(),
  inquiry_type: z.enum([
    'El-installation',
    'Solceller',
    'Ladeløsninger',
    'Varmepumpe',
    'BESS og netbalancering',
    'Support på solcelleanlæg',
  ], { errorMap: () => ({ message: 'Ugyldig henvendelsestype' }) }),
  message: z
    .string()
    .max(5000, 'Besked er for lang')
    .trim()
    .optional()
    .default(''),
})

export type ContactFormInput = z.infer<typeof contactFormSchema>
