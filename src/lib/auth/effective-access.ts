/**
 * PERM-1: server-side indlæsning af en brugers effektive rettigheder (rolle + overrides) — ÉT sted, brugt af
 * action-helpers (server-actions) og page-guard (sider/direkte URL). Bevidst IKKE 'use server'.
 *
 * Fase 2: overrides læses fra user_permission_overrides (00238) med brugerens egen session (RLS: egne rækker).
 *  - tabellen findes ikke endnu (prod før 00238) → ingen overrides → effektiv = rolle (koden kan udrulles før migrationen)
 *  - anden læsefejl → INGEN rettigheder for requesten (fail-closed, som en fejlet rolle-læsning) — en ignoreret REVOKE
 *    må aldrig ligne adgang
 * SIKKERHED: en REVOKE håndhæves af server-actions/sider/scope — ikke af RLS ved direkte REST før fase 4.
 */
import { cache } from 'react'
import { computeEffectivePermissions, NO_ACCESS_ROLE, type PermissionOverride } from './effective-permissions'
import { PERMISSIONS, type Permission } from './permissions'
import { logger } from '@/lib/utils/logger'

/** PostgREST/Postgres-koder for "tabellen findes ikke" (00238 endnu ikke kørt i miljøet) */
export function overridesTableMissing(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** Request-cachet. Kaster ved læsefejl (undtagen manglende tabel). */
export const loadPermissionOverrides = cache(async (userId: string): Promise<PermissionOverride[]> => {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('user_permission_overrides').select('permission, effect').eq('profile_id', userId)
  if (error) {
    if (overridesTableMissing(error)) return []
    throw new Error(`overrides kunne ikke læses: ${error.code ?? 'ukendt'}`)
  }
  return ((data ?? []) as Array<{ permission: string; effect: string }>)
    .filter((o) => o.permission in PERMISSIONS && (o.effect === 'grant' || o.effect === 'revoke'))
    .map((o) => ({ permission: o.permission as Permission, effect: o.effect as 'grant' | 'revoke' }))
})

/** Effektivt sæt for en bruger med en allerede læst rolle (ingen_adgang → tomt, overrides læses ikke) */
export async function effectivePermissionsFor(userId: string, role: string): Promise<ReadonlySet<Permission>> {
  if (!role || role === NO_ACCESS_ROLE) return new Set()
  try {
    return computeEffectivePermissions(role, await loadPermissionOverrides(userId))
  } catch (e) {
    logger.error('effectivePermissionsFor: overrides kunne ikke læses — ingen rettigheder for requesten', { error: e, entityId: userId })
    return new Set()
  }
}
