/**
 * PERM-1 fase 1 (Henrik 2026-10-25): effektive rettigheder = basisrolle + eksplicitte GRANT − eksplicitte REVOKE.
 * Ren logik (ingen DB, ingen 'use server') — bruges af server-kernen (action-helpers, page-guard, scope) og senere af
 * admin-UI'ets "hvorfor er rettigheden effektiv?".
 *
 * KOMPATIBILITET: uden overrides er resultatet PRÆCIS rollens rettigheder i PERMISSIONS (bevist af
 * scripts/effective-permissions-test.ts for alle roller × alle nøgler). 'ingen_adgang' (manglende/inaktiv profil) giver
 * altid et tomt sæt — overrides kan aldrig give en deaktiveret bruger adgang.
 *
 * SIKKERHED (fase 1): en REVOKE håndhæves af server-actions/sider der går gennem kernen — IKKE af RLS ved direkte REST,
 * før tabellens policies er konverteret (fase 4). Må ikke markedsføres som fuld sikring før da.
 */
import { PERMISSIONS, type Permission } from './permissions'

export type PermissionEffect = 'grant' | 'revoke'
export interface PermissionOverride { permission: Permission; effect: PermissionEffect }
export type PermissionSource = 'role' | 'grant' | 'revoke' | 'none'

export const NO_ACCESS_ROLE = 'ingen_adgang'
const ALL_KEYS = Object.keys(PERMISSIONS) as Permission[]

/** Rollens standardrettigheder (uden overrides) — identisk med hasPermission(role, …) for hver nøgle */
export function rolePermissions(role: string): ReadonlySet<Permission> {
  if (!role || role === NO_ACCESS_ROLE) return new Set()
  return new Set(ALL_KEYS.filter((k) => (PERMISSIONS[k] as readonly string[]).includes(role)))
}

/** Effektivt sæt: rolle ∪ grants − revokes (revoke vinder over grant for samme nøgle). Ukendte nøgler ignoreres. */
export function computeEffectivePermissions(role: string, overrides: readonly PermissionOverride[] = []): ReadonlySet<Permission> {
  if (!role || role === NO_ACCESS_ROLE) return new Set()
  const out = new Set(rolePermissions(role))
  for (const o of overrides) if (o.effect === 'grant' && o.permission in PERMISSIONS) out.add(o.permission)
  for (const o of overrides) if (o.effect === 'revoke') out.delete(o.permission)
  return out
}

/** Hvorfor er (eller er ikke) nøglen effektiv? — til admin-UI'et */
export function explainPermission(role: string, overrides: readonly PermissionOverride[], permission: Permission): PermissionSource {
  if (!role || role === NO_ACCESS_ROLE) return 'none'
  if (overrides.some((o) => o.permission === permission && o.effect === 'revoke')) return 'revoke'
  if (rolePermissions(role).has(permission)) return 'role'
  if (overrides.some((o) => o.permission === permission && o.effect === 'grant')) return 'grant'
  return 'none'
}
