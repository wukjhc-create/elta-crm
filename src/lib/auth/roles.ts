import type { UserRole } from '@/types/auth.types'

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  admin: {
    label: 'Administrator',
    description: 'Fuld adgang til alle funktioner og indstillinger',
  },
  user: {
    label: 'Bruger',
    description: 'Kan oprette og administrere leads, kunder, tilbud og projekter',
  },
  technician: {
    label: 'Tekniker',
    description: 'Kan se og arbejde på tildelte opgaver og projekter',
  },
}

export function getRoleLabel(role: UserRole): string {
  return ROLES[role]?.label || role
}

export function getRoleDescription(role: UserRole): string {
  return ROLES[role]?.description || ''
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function isUser(role: UserRole): boolean {
  return role === 'user'
}

export function isTechnician(role: UserRole): boolean {
  return role === 'technician'
}
