/**
 * Settings-related type definitions
 */

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  phone: string | null
  department: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UpdateProfileInput {
  full_name?: string
  phone?: string
  department?: string
  avatar_url?: string
}

export interface TeamInvitation {
  id: string
  email: string
  role: string
  invited_by: string
  invited_by_name: string | null
  created_at: string
  status: 'pending' | 'accepted' | 'expired'
}

export interface NotificationPreferences {
  [key: string]: { email: boolean; push: boolean }
}
