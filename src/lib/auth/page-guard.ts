/**
 * Sprint 7D — server-side page-level permission guard.
 *
 * Brugesi page.tsx-filer (server components) til at gate hele sider.
 * Komplementerer server-action gates fra CP3-7C: hvis bruger uden
 * permission tilgaar /dashboard/<modul> via direct URL, render
 * NoAccess komponenten i stedet for tom liste.
 *
 * Default-rolle ved manglende profile = 'montør' (fail-safe — laaser
 * ude i stedet for at give privilege escalation).
 */

import { getUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/auth.types'

export async function getUserRoleForPage(): Promise<UserRole> {
  const user = await getUser()
  if (!user) return 'montør'
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.role as UserRole) ?? 'montør'
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
