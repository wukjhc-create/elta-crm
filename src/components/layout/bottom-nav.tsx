'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Users, Inbox, ScanLine, ClipboardCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserRole } from '@/lib/hooks/use-user-role'

const defaultNavItems = [
  { name: 'Kalender', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Kunder', href: '/dashboard/customers', icon: Users },
  { name: 'Indbakke', href: '/dashboard/mail', icon: Inbox },
  { name: 'Scan Mail', href: '/dashboard/mail?filter=ao_matches', icon: ScanLine },
]

const montørNavItems = [
  { name: 'Opgaver', href: '/dashboard/tasks', icon: ClipboardCheck },
  { name: 'Kalender', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Service', href: '/dashboard/service-cases', icon: Wrench },
  { name: 'Indbakke', href: '/dashboard/mail', icon: Inbox },
]

export function BottomNav() {
  const pathname = usePathname()
  const { role } = useUserRole()

  const navItems = role === 'montør' ? montørNavItems : defaultNavItems

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="grid grid-cols-4 h-16">
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
