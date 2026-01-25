import type { UserRole } from '@/types/auth.types'

export const PERMISSIONS = {
  // Lead permissions
  'leads.view': ['admin', 'user', 'technician'],
  'leads.create': ['admin', 'user'],
  'leads.edit': ['admin', 'user'],
  'leads.delete': ['admin'],

  // Inbox permissions
  'inbox.view': ['admin', 'user', 'technician'],
  'inbox.send': ['admin', 'user', 'technician'],
  'inbox.delete': ['admin'],

  // Offer permissions
  'offers.view': ['admin', 'user'],
  'offers.create': ['admin', 'user'],
  'offers.edit': ['admin', 'user'],
  'offers.delete': ['admin'],
  'offers.approve': ['admin'],

  // Customer permissions
  'customers.view': ['admin', 'user', 'technician'],
  'customers.create': ['admin', 'user'],
  'customers.edit': ['admin', 'user'],
  'customers.delete': ['admin'],

  // Project permissions
  'projects.view': ['admin', 'user', 'technician'],
  'projects.create': ['admin', 'user'],
  'projects.edit': ['admin', 'user'],
  'projects.delete': ['admin'],

  // Task permissions
  'tasks.view': ['admin', 'user', 'technician'],
  'tasks.create': ['admin', 'user'],
  'tasks.edit': ['admin', 'user', 'technician'],
  'tasks.delete': ['admin', 'user'],

  // Time tracking permissions
  'time.log': ['admin', 'user', 'technician'],
  'time.view_own': ['admin', 'user', 'technician'],
  'time.view_all': ['admin', 'user'],
  'time.edit_own': ['admin', 'user', 'technician'],
  'time.edit_all': ['admin'],
  'time.delete': ['admin'],

  // Settings permissions
  'settings.manage': ['admin'],
  'settings.view': ['admin', 'user', 'technician'],

  // User management permissions
  'users.view': ['admin'],
  'users.create': ['admin'],
  'users.edit': ['admin'],
  'users.delete': ['admin'],
  'users.manage_roles': ['admin'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(userRole)
}

export function requirePermission(userRole: UserRole, permission: Permission): void {
  if (!hasPermission(userRole, permission)) {
    throw new Error(`Manglende tilladelse: ${permission}`)
  }
}

export function checkMultiplePermissions(
  userRole: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(userRole, permission))
}

export function getUserPermissions(userRole: UserRole): Permission[] {
  return Object.keys(PERMISSIONS).filter((permission) =>
    hasPermission(userRole, permission as Permission)
  ) as Permission[]
}
