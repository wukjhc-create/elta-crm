import type { UserRole } from '@/types/auth.types'

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  admin: {
    label: 'Administrator',
    description: 'Fuld adgang til alle funktioner, indstillinger og brugerstyring',
  },
  serviceleder: {
    label: 'Serviceleder',
    description: 'Kan administrere leads, kunder, tilbud og projekter. Kan se økonomi.',
  },
  montør: {
    label: 'Montør',
    description: 'Kan se og arbejde på tildelte opgaver. Ingen adgang til økonomi.',
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

export function isServiceleder(role: UserRole): boolean {
  return role === 'serviceleder'
}

export function isMontør(role: UserRole): boolean {
  return role === 'montør'
}

/** Returns true for roles that can see financial data (prices, margins) */
export function canSeeFinancials(role: UserRole): boolean {
  return role === 'admin' || role === 'serviceleder'
}
