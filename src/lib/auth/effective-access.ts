/**
 * PERM-1 fase 1: server-side indlæsning af en brugers effektive rettigheder (rolle + overrides) — ÉT sted, brugt af
 * action-helpers (server-actions) og page-guard (sider/direkte URL). Bevidst IKKE 'use server'.
 *
 * Fase 1: overrides lagres endnu ikke (tabellen kommer med 00238) → ingen overrides → effektiv = rolle (uændret adfærd).
 * Fase 2 læser user_permission_overrides i loadPermissionOverrides — ingen kaldere skal ændres.
 */
import { cache } from 'react'
import { computeEffectivePermissions, NO_ACCESS_ROLE, type PermissionOverride } from './effective-permissions'
import type { Permission } from './permissions'

/** Request-cachet. Fase 1: altid tom (ingen lagring endnu). */
export const loadPermissionOverrides = cache(async (_userId: string): Promise<PermissionOverride[]> => [])

/** Effektivt sæt for en bruger med en allerede læst rolle (ingen_adgang → tomt, overrides læses ikke) */
export async function effectivePermissionsFor(userId: string, role: string): Promise<ReadonlySet<Permission>> {
  if (!role || role === NO_ACCESS_ROLE) return new Set()
  return computeEffectivePermissions(role, await loadPermissionOverrides(userId))
}
