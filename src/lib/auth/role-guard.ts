/**
 * Værn ved rolle-/aktiv-ændringer (auth-review 2026-10-05). Bevidst IKKE 'use server'.
 *
 * - Kun kendte roller kan skrives (før blev en vilkårlig tekst gemt i profiles.role).
 * - Den sidste aktive admin kan ikke miste admin-rollen eller deaktiveres (ellers kan ingen administrere systemet).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/auth.types'

export const VALID_ROLES: readonly UserRole[] = ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role)
}

/** Fejltekst hvis ændringen fjerner den sidste aktive admin, ellers null. `admin` skal være service-role-klienten. */
export async function lastAdminBlock(
  admin: SupabaseClient,
  profileId: string,
  change: { role?: string; isActive?: boolean }
): Promise<string | null> {
  const losesAdmin = (change.role !== undefined && change.role !== 'admin') || change.isActive === false
  if (!losesAdmin) return null
  const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', profileId).maybeSingle()
  if (!me || me.role !== 'admin' || me.is_active === false) return null
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
    .eq('role', 'admin').eq('is_active', true).neq('id', profileId)
  return (count ?? 0) === 0 ? 'Den sidste aktive administrator kan ikke miste admin-rollen eller deaktiveres' : null
}
