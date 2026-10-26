import type { ReactNode } from 'react'
import { getUserRoleForPage, pageHasPermission } from '@/lib/auth/page-guard'
import type { Permission } from '@/lib/auth/permissions'
import { NoAccess } from '@/components/auth/no-access'

/**
 * P1 #8 — server-side modul-guard til layout.tsx.
 *
 * Et menupunkt skjules for roller uden adgang (sidebar.tsx), men en direkte URL viste før siden alligevel —
 * med tomme lister (RLS) eller en rå fejl. Guarden giver i stedet "Du har ikke adgang" for HELE modulet,
 * inkl. undersider. Den er UX, ikke sikkerhed: server actions og RLS håndhæver adgangen uafhængigt.
 * Permission skal matche menupunktet (tjekkes af scripts/ui-guard-audit.ts).
 */
export async function ModuleGuard(
  props: { children: ReactNode } & ({ permission: Permission; adminOnly?: never } | { adminOnly: true; permission?: never }),
) {
  // PERM-1: modul-adgang følger de effektive rettigheder (rolle + overrides); adminOnly er fortsat rollen
  const allowed = props.adminOnly ? (await getUserRoleForPage()) === 'admin' : await pageHasPermission(props.permission)
  if (!allowed) {
    return <NoAccess permission={props.adminOnly ? 'admin' : props.permission} />
  }
  return <>{props.children}</>
}
