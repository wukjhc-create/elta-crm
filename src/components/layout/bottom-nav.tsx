'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Users, Inbox, ScanLine, ClipboardCheck, Wrench, FileText, Target } from 'lucide-react'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { useUserRole } from '@/lib/hooks/use-user-role'

// Kandidater i prioriteret rækkefølge; hver rolle får de første 4 den har adgang til (som sidemenuen).
// Før fik salg/bogholderi "Indbakke"/"Scan Mail" (inbox.view) → "Du har ikke adgang".
const defaultNavItems: Array<{ name: string; href: string; icon: typeof Calendar; permission: Permission }> = [
  { name: 'Kalender', href: '/dashboard/calendar', icon: Calendar, permission: 'calendar.view.own' },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users, permission: 'customers.view' },
  { name: 'Indbakke', href: '/dashboard/mail', icon: Inbox, permission: 'inbox.view' },
  { name: 'Scan Mail', href: '/dashboard/mail?filter=ao_matches', icon: ScanLine, permission: 'inbox.view' },
  { name: 'Tilbud', href: '/dashboard/offers', icon: FileText, permission: 'offers.view' },
  // M-15: salg manglede Leads (fik kun 3 punkter)
  { name: 'Leads', href: '/dashboard/leads', icon: Target, permission: 'leads.create' },
  { name: 'Sager', href: '/dashboard/orders', icon: Wrench, permission: 'cases.view.assigned' },
]

// Sprint 7E — montor faar Kalender tilbage. Scope-filter sikrer
// kun egne work_orders vises i feed.
const montørNavItems = [
  { name: 'Opgaver', href: '/dashboard/tasks', icon: ClipboardCheck },
  { name: 'Kalender', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Sager', href: '/dashboard/orders', icon: Wrench },
]

export function BottomNav() {
  const pathname = usePathname()
  const { role } = useUserRole()

  const navItems = role === 'montør' ? montørNavItems : defaultNavItems.filter((i) => hasPermission(role, i.permission)).slice(0, 4)

  // M-3 (mobil-review 2026-10-14): z-40 — modaler (z-50) skal dække navigationen (før skjult Send-knap og tab af input)
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${Math.max(navItems.length, 1)}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href.split('?')[0] + '/')

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors active:scale-95',
                isActive
                  ? 'text-green-600'
                  : 'text-gray-500'
              )}
            >
              <Icon className={cn('w-6 h-6', isActive ? 'text-green-600' : 'text-gray-400')} strokeWidth={isActive ? 2.5 : 1.5} />
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
