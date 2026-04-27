'use client'

import { useState, useEffect } from 'react'
import type { UserRole } from '@/types/auth.types'

let cachedRole: UserRole | null = null

export function useUserRole(): { role: UserRole; loading: boolean } {
  const [role, setRole] = useState<UserRole>(cachedRole || 'montør')
  const [loading, setLoading] = useState(!cachedRole)

  useEffect(() => {
    if (cachedRole) {
      setRole(cachedRole)
      setLoading(false)
      return
    }

    let mounted = true
    async function fetchRole() {
      try {
        const { getProfile } = await import('@/lib/actions/settings')
        const result = await getProfile()
        if (mounted && result.success && result.data) {
          const r = result.data.role as UserRole
          cachedRole = r
          setRole(r)
        }
      } catch {
        // Default to montør (most restrictive)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchRole()
    return () => { mounted = false }
  }, [])

  return { role, loading }
}
