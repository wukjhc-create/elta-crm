'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserRole } from '@/types/auth.types'
import { hasPermission, type Permission } from '@/lib/auth/permissions'

/**
 * useUserRole — fetches current user's role on the client.
 *
 * Sprint 7E fix (2026-05-09):
 * Module-scope `cachedRole` was removed. It caused hydration mismatch:
 *   - SSR (Vercel warm lambda): cachedRole persisted across requests
 *     from the previous user, so server-rendered HTML used the OLD
 *     user's role.
 *   - Client hydration (fresh JS heap): cachedRole=null, initial state
 *     defaulted to 'montør'.
 * Result: HTML had admin-sidebar, client tried to render montør-sidebar
 * → React threw a client-side hydration exception ("Application error").
 *
 * Tradeoff: every mount briefly shows the most-restrictive 'montør'
 * default until getProfile resolves. That is harmless (sidebar may
 * flash with fewer items for an instant) and is identical for SSR and
 * client → no hydration mismatch.
 *
 * If we ever want to eliminate the flash, the right fix is to pass
 * the role from a server component via context, NOT module-scope cache.
 */
/**
 * PERM-1 fase 3: `can(perm)` bruger brugerens EFFEKTIVE rettigheder (rolle + overrides) fra serveren. Indtil de er hentet,
 * bruges rollens standard (identisk uden overrides) — UI'et er aldrig mere åbent end serveren tillader, da hver action/side
 * håndhæver selv.
 */
/**
 * Pilot-ydelse 2026-10-29 (U232): 36 komponenter bruger hooket, og hver mount hentede profil + rettigheder selv —
 * målt 5–8 dobbeltkald af getProfile og getMyEffectivePermissionsAction pr. sidevisning. Samtidige mounts deler nu ÉN
 * forespørgsel, genbrugt i højst 5 s. Kun i browseren (useEffect kører aldrig på serveren), så intet deles mellem brugere
 * i SSR; det korte vindue gør, at et brugerskift i samme fane aldrig får en gammel profil.
 */
type RoleFetch = { profile: Awaited<ReturnType<typeof import('@/lib/actions/settings').getProfile>> | null; effective: string[] | null }
let shared: { at: number; promise: Promise<RoleFetch> } | null = null
const SHARE_MS = 5_000
function fetchRoleShared(): Promise<RoleFetch> {
  if (shared && Date.now() - shared.at < SHARE_MS) return shared.promise
  const promise = (async (): Promise<RoleFetch> => {
    const { getProfile } = await import('@/lib/actions/settings')
    const { getMyEffectivePermissionsAction } = await import('@/lib/actions/my-permissions')
    const [profile, effective] = await Promise.all([getProfile().catch(() => null), getMyEffectivePermissionsAction().catch(() => null)])
    return { profile, effective: effective ? [...effective] : null }
  })()
  shared = { at: Date.now(), promise }
  // en fejlet forespørgsel må ikke genbruges
  promise.then((r) => { if (!r.profile && shared?.promise === promise) shared = null }, () => { if (shared?.promise === promise) shared = null })
  return promise
}

export function useUserRole(): { role: UserRole; loading: boolean; fullName: string | null; email: string | null; can: (perm: Permission) => boolean } {
  // Always start with the most restrictive default so SSR and client
  // hydration produce identical HTML for the initial render.
  const [role, setRole] = useState<UserRole>('montør')
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [perms, setPerms] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchRole() {
      try {
        const { profile: result, effective } = await fetchRoleShared()
        if (mounted && effective) setPerms(new Set(effective))
        if (mounted && result?.success && result.data) {
          setRole(result.data.role as UserRole)
          setFullName((result.data as { full_name?: string | null }).full_name ?? null)
          setEmail((result.data as { email?: string | null }).email ?? null)
        }
      } catch {
        // Default 'montør' is already set; keep it.
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchRole()
    return () => {
      mounted = false
    }
  }, [])

  const can = useCallback((perm: Permission) => (perms ? perms.has(perm) : hasPermission(role, perm)), [perms, role])
  return { role, loading, fullName, email, can }
}
