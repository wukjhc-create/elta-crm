/**
 * Unified server action helpers
 * Reduces boilerplate across all server actions with consistent
 * auth, error handling, logging, and timing.
 *
 * ALL server action files should import requireAuth and formatError from here
 * instead of defining local copies.
 */

import { cache } from 'react'
import { getUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/auth.types'

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

/**
 * Sprint 7B-1A — Get authenticated client with role + permission helper.
 *
 * Læser profiles.role for current user. Returnerer en rolle UDEN rettigheder, hvis profile-row mangler, er
 * deaktiveret eller læsning fejler. Det betyder: aldrig auto-elevation hvis profile ikke findes.
 *
 * Pilot-modus: indtil migration 00108 er kørt, er TS PERMISSIONS-matrix
 * eneste autoritative kilde. Når migration kører, kan denne udvides til
 * at slå op i role_permissions-tabellen via DB-funktion.
 */
/** Rolle uden nogen rettigheder (findes ikke i permissions-matrixen) — bruges som fail-safe. */
const NO_ACCESS_ROLE = 'ingen_adgang' as UserRole

/**
 * Auth-review 2026-10-07: fail-safe = INGEN rettigheder (før 'montør', som har reelle læse-/skriverettigheder) — gælder
 * manglende profil, læsefejl og deaktiveret profil. Perf-review 2026-10-08 (#2): request-scoped cache (én profillæsning
 * pr. request i stedet for én pr. gate).
 */
const readRoleCached = cache(async (userId: string): Promise<UserRole> => {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', userId)
      .maybeSingle()
    if (data?.role && data.is_active !== false) return data.role as UserRole
  } catch {
    // ingen-adgang på læsefejl
  }
  return NO_ACCESS_ROLE
})

export async function getAuthenticatedClientWithRole(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  role: UserRole
  hasPermission: (perm: Permission) => boolean
  requirePermission: (perm: Permission) => void
}> {
  const userId = await requireAuth()
  const supabase = await createClient()

  const role = await readRoleCached(userId)

  const has = (perm: Permission) => hasPermission(role, perm)
  const req = (perm: Permission) => {
    if (!has(perm)) {
      throw new ActionError(
        `Manglende tilladelse: ${perm}`,
        'PERMISSION_DENIED',
        { required: perm, role }
      )
    }
  }

  return {
    supabase,
    userId,
    role,
    hasPermission: has,
    requirePermission: req,
  }
}

/**
 * P-009: rettighedstjek der ikke kaster — returnerer en fejltekst ('Ikke logget ind' / 'Manglende tilladelse: x')
 * eller null. Passer til alle action-returtyper (early return), og RBAC-auditten genkender den som gate.
 */
export async function permissionDenied(permission: Permission): Promise<string | null> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    return ctx.hasPermission(permission) ? null : `Manglende tilladelse: ${permission}`
  } catch {
    return 'Ikke logget ind'
  }
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
