/**
 * Sprint 7D — server-side page-level permission guard.
 *
 * Brugesi page.tsx-filer (server components) til at gate hele sider.
 * Komplementerer server-action gates fra CP3-7C: hvis bruger uden
 * permission tilgaar /dashboard/<modul> via direct URL, render
 * NoAccess komponenten i stedet for tom liste.
 *
 * Default-rolle ved manglende/deaktiveret profile = ingen rettigheder (fail-safe — laaser
 * ude i stedet for at give privilege escalation).
 */

import { cache } from 'react'
import { getUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/auth.types'

/** Auth-review 2026-10-07: fail-safe uden rettigheder (før 'montør') — manglende bruger/profil eller deaktiveret profil */
const NO_ACCESS_ROLE = 'ingen_adgang' as UserRole

/** Perf-review 2026-10-08 (#2): request-scoped cache — pageHasPermission kaldes mange gange pr. side */
export const getUserRoleForPage = cache(getUserRoleForPageUncached)

async function getUserRoleForPageUncached(): Promise<UserRole> {
  const user = await getUser()
  if (!user) return NO_ACCESS_ROLE
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (!data?.role || data.is_active === false) return NO_ACCESS_ROLE
  return data.role as UserRole
}

export async function pageHasPermission(perm: Permission): Promise<boolean> {
  const role = await getUserRoleForPage()
  return hasPermission(role, perm)
}

/**
 * Returnér rolle + permission helper i én call. Bruges naar pagen
 * skal gates flere permissions paa samme tid (fx employees-list +
 * payroll-strip).
 */
export async function getPageRoleContext(): Promise<{
  role: UserRole
  has: (perm: Permission) => boolean
}> {
  const role = await getUserRoleForPage()
  return {
    role,
    has: (perm: Permission) => hasPermission(role, perm),
  }
}
