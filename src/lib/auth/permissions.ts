import type { UserRole } from '@/types/auth.types'

export const PERMISSIONS = {
  // Lead permissions
  'leads.view': ['admin', 'serviceleder', 'montør'],
  'leads.create': ['admin', 'serviceleder'],
  'leads.edit': ['admin', 'serviceleder'],
  'leads.delete': ['admin'],

  // Inbox / mail permissions
  'inbox.view': ['admin', 'serviceleder', 'montør'],
  'inbox.send': ['admin', 'serviceleder'],
  'inbox.delete': ['admin'],

  // Offer permissions
  'offers.view': ['admin', 'serviceleder'],
  'offers.create': ['admin', 'serviceleder'],
  'offers.edit': ['admin', 'serviceleder'],
  'offers.delete': ['admin'],
  'offers.approve': ['admin'],

  // Customer permissions
  'customers.view': ['admin', 'serviceleder', 'montør'],
  'customers.create': ['admin', 'serviceleder'],
  'customers.edit': ['admin', 'serviceleder'],
  'customers.delete': ['admin'],

  // Project permissions
  'projects.view': ['admin', 'serviceleder', 'montør'],
  'projects.create': ['admin', 'serviceleder'],
  'projects.edit': ['admin', 'serviceleder'],
  'projects.delete': ['admin'],

  // Service case permissions
  'service.view': ['admin', 'serviceleder', 'montør'],
  'service.create': ['admin', 'serviceleder'],
  'service.edit': ['admin', 'serviceleder', 'montør'],
  'service.delete': ['admin'],
  'service.close': ['admin', 'serviceleder'],

  // Task permissions
  'tasks.view': ['admin', 'serviceleder', 'montør'],
  'tasks.create': ['admin', 'serviceleder'],
  'tasks.edit': ['admin', 'serviceleder', 'montør'],
  'tasks.delete': ['admin', 'serviceleder'],

  // Time tracking permissions
  'time.log': ['admin', 'serviceleder', 'montør'],
  'time.view_own': ['admin', 'serviceleder', 'montør'],
  'time.view_all': ['admin', 'serviceleder'],
  'time.edit_own': ['admin', 'serviceleder', 'montør'],
  'time.edit_all': ['admin'],
  'time.delete': ['admin'],

  // Financial / economy permissions (cost prices, margins, revenue)
  'economy.view': ['admin', 'serviceleder'],
  'economy.edit': ['admin'],

  // Settings permissions
  'settings.manage': ['admin'],
  'settings.view': ['admin', 'serviceleder'],

  // User management permissions
  'users.view': ['admin'],
  'users.create': ['admin'],
  'users.edit': ['admin'],
  'users.delete': ['admin'],
  'users.manage_roles': ['admin'],

  // Employees module (HR-style records, separate from auth profiles)
  'employees.view': ['admin', 'serviceleder'],
  'employees.edit': ['admin'],

  // Tools / advanced features
  'tools.calculations': ['admin', 'serviceleder'],
  'tools.ai_project': ['admin', 'serviceleder'],
  'tools.products': ['admin', 'serviceleder'],
  'tools.pricing': ['admin', 'serviceleder'],
  'tools.packages': ['admin', 'serviceleder'],
  'tools.solar_calc': ['admin', 'serviceleder'],
  'tools.reports': ['admin', 'serviceleder'],

  // Calendar
  'calendar.view': ['admin', 'serviceleder', 'montør'],
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
