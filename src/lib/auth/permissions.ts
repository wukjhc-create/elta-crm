import type { UserRole } from '@/types/auth.types'

/**
 * Permission matrix — TS-side source of truth.
 *
 * Sprint 7B-1A foundation: rolle/permission tabeller foreslået i SQL
 * (00108_rbac_foundation.sql) MEN endnu ikke godkendt/kørt af Henrik.
 * Indtil migration er kørt, er denne fil eneste kilde.
 *
 * Eksisterende permission keys (sidebar/ui-gates) er BEVARET 1:1.
 * Nye keys er tilføjet for Sprint 7 pilot. Salg + bogholderi er føjet
 * til relevante eksisterende keys per Henrik's pilot-beslutninger.
 */
export const PERMISSIONS = {
  // ===== EKSISTERENDE — BEVARES 1:1 (sidebar+UI bruger disse) =====

  // Lead permissions
  'leads.view': ['admin', 'serviceleder', 'montør', 'salg'],
  'leads.create': ['admin', 'serviceleder', 'salg'],
  'leads.edit': ['admin', 'serviceleder', 'salg'],
  'leads.delete': ['admin'],

  // Inbox / mail permissions
  'inbox.view': ['admin', 'serviceleder', 'montør'],
  'inbox.send': ['admin', 'serviceleder'],
  'inbox.delete': ['admin'],

  // Offer permissions
  'offers.view': ['admin', 'serviceleder', 'salg'],
  'offers.create': ['admin', 'serviceleder', 'salg'],
  'offers.edit': ['admin', 'serviceleder', 'salg'],
  'offers.send': ['admin', 'serviceleder', 'salg'],
  'offers.delete': ['admin'],
  'offers.approve': ['admin'],

  // Customer permissions
  'customers.view': ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi'],
  'customers.create': ['admin', 'serviceleder', 'salg'],
  'customers.edit': ['admin', 'serviceleder', 'salg'],
  'customers.delete': ['admin'],

  // Project permissions
  'projects.view': ['admin', 'serviceleder', 'montør'],
  'projects.create': ['admin', 'serviceleder'],
  'projects.edit': ['admin', 'serviceleder'],
  'projects.delete': ['admin'],

  // Service case permissions
  'service.view': ['admin', 'serviceleder', 'montør', 'bogholderi'],
  'service.create': ['admin', 'serviceleder', 'salg'],
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
  'time.view_all': ['admin', 'serviceleder', 'bogholderi'],
  'time.edit_own': ['admin', 'serviceleder', 'montør'],
  'time.edit_all': ['admin'],
  'time.delete': ['admin'],

  // Financial / economy permissions (cost prices, margins, revenue)
  'economy.view': ['admin', 'serviceleder', 'bogholderi'],
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
  'tools.calculations': ['admin', 'serviceleder', 'salg'],
  'tools.ai_project': ['admin', 'serviceleder'],
  'tools.products': ['admin', 'serviceleder', 'salg'],
  'tools.pricing': ['admin', 'serviceleder'],
  'tools.packages': ['admin', 'serviceleder'],
  'tools.solar_calc': ['admin', 'serviceleder', 'salg'],
  'tools.reports': ['admin', 'serviceleder', 'bogholderi'],

  // Calendar
  'calendar.view': ['admin', 'serviceleder', 'montør'],

  // ===== NYE Sprint 7 PILOT KEYS =====

  // Invoices — kritisk modul for pilot
  'invoices.view.all':           ['admin', 'serviceleder', 'bogholderi'],
  'invoices.view.own_cases':     ['admin', 'serviceleder', 'bogholderi', 'salg'],
  'invoices.create':             ['admin', 'serviceleder', 'bogholderi'],
  'invoices.send':               ['admin', 'serviceleder', 'bogholderi'],
  'invoices.mark_paid':          ['admin', 'bogholderi'],
  'invoices.credit':             ['admin', 'bogholderi'],
  'invoices.delete_draft':       ['admin', 'bogholderi'],

  // Payroll — KUN admin (bogholderi har IKKE adgang per Henrik's regel)
  'employees.payroll.view':      ['admin'],
  'employees.payroll.edit':      ['admin'],

  // Cost prices — synlig for økonomi-roller
  'economy.cost_prices':         ['admin', 'serviceleder', 'bogholderi'],

  // Settings detail — suppliers/economic kan administreres af relevante roller
  'settings.suppliers':          ['admin'],
  'settings.economic':           ['admin', 'bogholderi'],

  // Reports
  'reports.view':                ['admin', 'serviceleder', 'bogholderi'],
  'reports.export':              ['admin', 'bogholderi'],

  // Materials cost prices — kun roller der ser kostpriser
  'materials.view.cost_prices':  ['admin', 'serviceleder', 'bogholderi'],

  // Products cost prices
  'products.view.cost_prices':   ['admin', 'serviceleder', 'bogholderi'],

  // Offers cost prices
  'offers.view.cost_prices':     ['admin', 'serviceleder', 'bogholderi'],

  // Bank payments (incoming invoice matching, betalinger)
  'bank.view':                   ['admin', 'bogholderi'],
  'bank.edit':                   ['admin', 'bogholderi'],

  // Incoming invoices (faktura fra leverandører)
  'incoming_invoices.view':      ['admin', 'serviceleder', 'bogholderi'],
  'incoming_invoices.edit':      ['admin', 'bogholderi'],
  'incoming_invoices.approve':   ['admin', 'bogholderi'],

  // Supplier credentials (kan se/sætte API-keys)
  'suppliers.credentials':       ['admin'],
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
