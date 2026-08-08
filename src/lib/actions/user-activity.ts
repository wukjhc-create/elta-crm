'use server'

import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { getStorageSignedUrls, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import type { ActionResult } from '@/types/common.types'

export interface UserActivityEntry {
  id: string
  full_name: string | null
  email: string | null
  role: string
  avatar_url: string | null
  phone: string | null
  department: string | null
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
}

/**
 * Get all users with their last activity info (admin only).
 * Uses Supabase Auth admin API for last_sign_in_at.
 */
export async function getUserActivityList(): Promise<ActionResult<UserActivityEntry[]>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Check admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan se brugeraktivitet' }
    }

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, avatar_storage_path, phone, department, is_active, created_at')
      .order('full_name')

    if (profilesError) {
      return { success: false, error: formatError(profilesError, 'Kunne ikke hente brugere') }
    }

    // Get last sign-in from Supabase Auth admin
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 100 })

    const authMap = new Map<string, string | null>()
    if (authData?.users) {
      for (const u of authData.users) {
        authMap.set(u.id, u.last_sign_in_at || null)
      }
    }

    // Phase C: batch lazy-refresh avatar_url fra storage_path (source of truth).
    const profileRows = profiles || []
    const freshAvatars = await getStorageSignedUrls(
      'attachments',
      profileRows.map((p) => (p.avatar_storage_path as string | null) || ''),
      SIGNED_URL_TTL.SHORT,
    )

    const result: UserActivityEntry[] = profileRows.map((p, idx) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      avatar_url: p.avatar_storage_path ? (freshAvatars[idx] ?? p.avatar_url) : p.avatar_url,
      phone: p.phone,
      department: p.department,
      is_active: p.is_active ?? true,
      last_sign_in_at: authMap.get(p.id) || null,
      created_at: p.created_at,
    }))

    // Sort: most recently active first
    result.sort((a, b) => {
      const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
      const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
      return bTime - aTime
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente brugeraktivitet') }
  }
}
