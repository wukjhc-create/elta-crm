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
