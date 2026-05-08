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
  salg: {
    label: 'Salg',
    description: 'Kan håndtere leads, kunder og tilbud. Kan se egne sager. Ingen kostpriser eller løn.',
  },
  bogholderi: {
    label: 'Bogholderi',
    description: 'Kan håndtere fakturaer, kreditnotaer og økonomi. Ingen adgang til medarbejderløn.',
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

export function isSalg(role: UserRole): boolean {
  return role === 'salg'
}

export function isBogholderi(role: UserRole): boolean {
  return role === 'bogholderi'
}

/** Returns true for roles that can see financial data (prices, margins) */
export function canSeeFinancials(role: UserRole): boolean {
  return role === 'admin' || role === 'serviceleder' || role === 'bogholderi'
}
