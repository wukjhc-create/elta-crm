import { z } from 'zod'

/**
 * UUID validation schema with Danish error message
 */
export const uuidSchema = z.string().uuid('Ugyldigt ID format')

/**
 * Validates a UUID string
 * @returns true if valid, false otherwise
 */
export function isValidUUID(value: string): boolean {
  return uuidSchema.safeParse(value).success
}

/**
 * Validates a UUID and throws a descriptive error if invalid
 * @param value - The value to validate
 * @param fieldName - The name of the field for error messages
 * @throws Error if validation fails
 */
export function validateUUID(value: string, fieldName: string = 'ID'): void {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    throw new Error(`Ugyldig ${fieldName}: ${value}`)
  }
}

/**
 * Optional UUID schema - allows null/undefined
 */
export const optionalUuidSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().uuid().nullable().optional()
)

/**
 * Search term schema with sanitization
 */
export const searchTermSchema = z
  .string()
  .max(100, 'Søgeord er for langt')
  .transform((val) => val.trim())
  .optional()

/**
 * Sanitize search input to prevent SQL injection in LIKE queries
 */
export function sanitizeSearchTerm(term: string): string {
  // Escape special characters used in LIKE patterns
  return term.replace(/[%_\\]/g, '\\$&').trim()
}

/**
 * Pagination validation
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

export type PaginationInput = z.infer<typeof paginationSchema>
