'use client'

import { useState, useEffect } from 'react'
import type { UserRole } from '@/types/auth.types'

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
export function useUserRole(): { role: UserRole; loading: boolean } {
  // Always start with the most restrictive default so SSR and client
  // hydration produce identical HTML for the initial render.
  const [role, setRole] = useState<UserRole>('montør')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchRole() {
      try {
        const { getProfile } = await import('@/lib/actions/settings')
        const result = await getProfile()
        if (mounted && result.success && result.data) {
          setRole(result.data.role as UserRole)
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

  return { role, loading }
}
