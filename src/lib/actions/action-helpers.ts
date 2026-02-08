/**
 * Unified server action helpers
 * Reduces boilerplate across all server actions with consistent
 * auth, error handling, logging, and timing.
 *
 * ALL server action files should import requireAuth and formatError from here
 * instead of defining local copies.
 */

import { getUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import logger from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

// =====================================================
// Auth Helpers
// =====================================================

/**
 * Require authenticated user. Throws if not logged in.
 * Compatible with formatError() error handling.
 */
export async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

/**
 * Get authenticated supabase client with user ID
 */
export async function getAuthenticatedClient() {
  const userId = await requireAuth()
  const supabase = await createClient()
  return { supabase, userId }
}

// =====================================================
// Error Handling
// =====================================================

/**
 * Structured action error with error code.
 * Use for domain-specific errors that need structured handling.
 */
export class ActionError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(message: string, code: string = 'ACTION_ERROR', details?: Record<string, unknown>) {
    super(message)
    this.name = 'ActionError'
    this.code = code
    this.details = details
  }
}

/**
 * Standard error message formatting for server actions.
 * Handles ActionError, AUTH_REQUIRED, and Ugyldig* messages.
 * Drop-in replacement for local formatError functions.
 */
export function formatError(err: unknown, defaultMessage: string): string {
  if (err instanceof ActionError) {
    return err.message
  }
  if (err instanceof Error) {
    if (err.message === 'AUTH_REQUIRED') {
      return 'Du skal være logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

/** @deprecated Use formatError instead */
export const formatActionError = formatError

/**
 * Map Supabase error codes to user-friendly Danish messages
 */
export function mapDatabaseError(error: { code: string; message?: string }, context?: string): string {
  switch (error.code) {
    case 'PGRST116':
      return context ? `${context} blev ikke fundet` : 'Ressourcen blev ikke fundet'
    case '23503':
      return 'Den tilknyttede reference findes ikke (FK violation)'
    case '23505':
      return 'En post med disse data eksisterer allerede (unique violation)'
    case '42501':
      return 'Du har ikke rettigheder til denne handling'
    case '23502':
      return 'Obligatoriske felter mangler'
    case '22P02':
      return 'Ugyldigt dataformat'
    default:
      return context ? `Databasefejl: ${context}` : 'Der opstod en databasefejl'
  }
}

// =====================================================
// Safe Action Wrapper
// =====================================================

/**
 * Wrap a server action with auth, error handling, and logging.
 * Reduces boilerplate in every server action.
 *
 * Usage:
 * ```ts
 * export const myAction = safeAction(
 *   'myAction',
 *   async (ctx, input: MyInput) => {
 *     const { data, error } = await ctx.supabase.from('table').select()
 *     if (error) throw new ActionError(mapDatabaseError(error))
 *     return data
 *   }
 * )
 * ```
 */
export function safeAction<TInput, TOutput>(
  actionName: string,
  handler: (
    ctx: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string },
    input: TInput
  ) => Promise<TOutput>,
  options?: {
    requireAuth?: boolean
    defaultErrorMessage?: string
    entityType?: string
  }
) {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    const start = Date.now()
    let userId: string | undefined

    try {
      // Auth check
      if (options?.requireAuth !== false) {
        userId = await requireAuth()
      }

      const supabase = await createClient()
      const result = await handler(
        { supabase, userId: userId || '' },
        input
      )

      // Log success
      logger.debug(`Action completed: ${actionName}`, {
        userId,
        action: actionName,
        entity: options?.entityType,
        duration: Date.now() - start,
      })

      return { success: true, data: result }
    } catch (err) {
      // Log error
      logger.actionError(actionName, userId, err, options?.entityType)

      return {
        success: false,
        error: formatError(
          err,
          options?.defaultErrorMessage || `Handling fejlede: ${actionName}`
        ),
      }
    }
  }
}

/**
 * Safe action that doesn't require auth (for public endpoints)
 */
export function publicAction<TInput, TOutput>(
  actionName: string,
  handler: (
    ctx: { supabase: Awaited<ReturnType<typeof createClient>> },
    input: TInput
  ) => Promise<TOutput>,
  options?: {
    defaultErrorMessage?: string
  }
) {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    const start = Date.now()

    try {
      const supabase = await createClient()
      const result = await handler({ supabase }, input)

      logger.debug(`Public action completed: ${actionName}`, {
        action: actionName,
        duration: Date.now() - start,
      })

      return { success: true, data: result }
    } catch (err) {
      logger.actionError(actionName, undefined, err)

      return {
        success: false,
        error: formatError(
          err,
          options?.defaultErrorMessage || `Handling fejlede: ${actionName}`
        ),
      }
    }
  }
}

// =====================================================
// Pagination Helper
// =====================================================

export function getPaginationRange(
  params: { page?: number; pageSize?: number },
  defaultPageSize = 20
) {
  const page = params.page || 1
  const pageSize = params.pageSize || defaultPageSize
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset, rangeEnd: offset + pageSize - 1 }
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// =====================================================
// Validation Helpers
// =====================================================

/**
 * Validate required string field
 */
export function requireField(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ActionError(`${fieldName} er påkrævet`, 'MISSING_FIELD', { field: fieldName })
  }
  return value.trim()
}

/**
 * Parse FormData into typed object
 */
export function parseFormData<T extends Record<string, unknown>>(
  formData: FormData,
  fields: Array<{
    key: string
    type: 'string' | 'number' | 'boolean'
    required?: boolean
    default?: unknown
  }>
): T {
  const result: Record<string, unknown> = {}

  for (const field of fields) {
    const rawValue = formData.get(field.key)

    if (rawValue === null || rawValue === '') {
      if (field.required) {
        throw new ActionError(`${field.key} er påkrævet`, 'MISSING_FIELD')
      }
      result[field.key] = field.default ?? null
      continue
    }

    switch (field.type) {
      case 'string':
        result[field.key] = String(rawValue)
        break
      case 'number':
        result[field.key] = Number(rawValue)
        break
      case 'boolean':
        result[field.key] = rawValue === 'true' || rawValue === '1'
        break
    }
  }

  return result as T
}
