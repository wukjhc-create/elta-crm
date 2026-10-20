/**
 * Unified server action helpers
 * Reduces boilerplate across all server actions with consistent
 * auth, error handling, logging, and timing.
 *
 * ALL server action files should import requireAuth and formatError from here
 * instead of defining local copies.
 */

import { permissionDeniedText } from '@/lib/auth/permission-text'
import { cache } from 'react'
import { getUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import { safeErrorSummary } from '@/lib/utils/logger'
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
  // AS-3 (sikkerheds-review 2026-10-18): en netop deaktiveret bruger har et gyldigt token til det udløber (~1 t) —
  // actions bag kun getAuthenticatedClient virkede stadig. Samme request-cachede profillæsning som rollegaterne.
  if ((await readRoleCached(user.id)) === NO_ACCESS_ROLE) {
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
        permissionDeniedText(perm), // R-12: dansk tekst (før "Manglende tilladelse: offers.edit")
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
    return ctx.hasPermission(permission) ? null : permissionDeniedText(permission)
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
const RAW_ERROR_RE = /duplicate key|violates|relation "|column "|PGRST|JWT|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|syntax error|permission denied|null value|invalid input|failed to|unexpected token|cannot read|undefined|is not a function|timeout|network|status code|\bat \w+ \(|https?:\/\//i
const DANISH_RE = /[æøåÆØÅ]|^(Du |Der |Kunne |Kan |Ingen |Mangler |Sagen |Kunden |Mailen |Tilbud|Faktura|Opgaven |Leadet |Vælg |Angiv |Kun )|\b(ikke|kunne|skal|findes|mangler|prøv|venligst|allerede)\b/i

/** LG-13: må teksten vises for brugeren? (dansk, kort og uden spor af en rå teknisk fejl) */
export function isUserSafeMessage(msg: string | null | undefined): boolean {
  const m = String(msg ?? '').trim()
  return m.length > 0 && m.length <= 300 && DANISH_RE.test(m) && !RAW_ERROR_RE.test(m)
}

/** PR4-12: en fejltekst fra en integration (Graph, PostgREST) vises kun hvis den er brugervenlig dansk — ellers fallback. */
export function userSafeOr(msg: string | null | undefined, fallback: string): string {
  return isUserSafeMessage(msg) ? String(msg).trim() : fallback
}

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
    // LG-13 (log-review 2026-10-19): vores egne danske fejltekster (fx "Sagen er lukket", "Microsoft Graph er ikke
    // konfigureret …") må vises; rå DB-/netværks-/engelske fejl aldrig
    if (isUserSafeMessage(err.message)) return err.message
  }
  // LG-4: aldrig det rå fejlobjekt (PostgREST `details` kan indeholde hele persondata-rækken)
  console.error(`${defaultMessage}: ${safeErrorSummary(err)}`)
  return defaultMessage
}

/**
 * Map Supabase error codes to user-friendly Danish messages
 */
export function mapDatabaseError(error: { code?: string | null; message?: string } | null | undefined, context?: string): string {
  if (!error) return context ? `${context} — prøv igen` : 'Der opstod en fejl — prøv igen'
  switch (error.code ?? '') {
    case '23514':
      return 'En værdi er uden for det tilladte (tjek felterne)'
    case 'PGRST116':
      return context ? `${context} blev ikke fundet` : 'Ressourcen blev ikke fundet'
    case '23503':
      return 'Den tilknyttede post findes ikke (længere)'
    case '23505':
      return 'Der findes allerede en post med disse oplysninger (fx samme e-mail eller nummer)'
    case '42501':
      return 'Du har ikke rettigheder til denne handling'
    case '23502':
      return 'Et påkrævet felt mangler'
    case '22P02':
      return 'Ugyldigt dataformat'
    default:
      return context ? `${context} — prøv igen` : 'Der opstod en fejl — prøv igen'
  }
}
