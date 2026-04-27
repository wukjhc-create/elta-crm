'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GlobalSearch } from './global-search'
import { NotificationDropdown } from './notification-dropdown'
import { Menu, X } from 'lucide-react'
import { APP_NAME } from '@/lib/constants'

const mobileNavLinks = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Leads', href: '/dashboard/leads' },
  { name: 'Kunder', href: '/dashboard/customers' },
  { name: 'Tilbud', href: '/dashboard/offers' },
  { name: 'Projekter', href: '/dashboard/projects' },
  { name: 'Mail', href: '/dashboard/mail' },
  { name: 'Opgaver', href: '/dashboard/tasks' },
  { name: 'Kalender', href: '/dashboard/calendar' },
  { name: 'Indstillinger', href: '/dashboard/settings' },
]

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      <header className="h-14 sm:h-16 border-b bg-white px-3 sm:px-6 flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-3 flex-1">
          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="md:hidden p-2 -ml-2 hover:bg-gray-100 rounded-lg touch-manipulation"
            aria-label="Menu"
          >
            {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Mobile: App name */}
          <span className="md:hidden font-bold text-green-700 text-sm">{APP_NAME}</span>

          {/* Desktop: Global search */}
          <div className="hidden md:block flex-1 max-w-md">
            <GlobalSearch />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          <NotificationDropdown />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md transition-colors touch-manipulation"
              aria-label="Brugermenu"
              aria-expanded={isMenuOpen}
            >
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-medium text-sm">
                U
              </div>
              <svg className="w-4 h-4 text-gray-600 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border z-20">
                  <div className="py-1">
                    <button
                      onClick={() => { setIsMenuOpen(false); router.push('/dashboard/settings/profile') }}
                      className="w-full text-left px-4 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 touch-manipulation"
                    >
                      Din profil
                    </button>
                    <button
                      onClick={() => { setIsMenuOpen(false); router.push('/dashboard/settings') }}
                      className="w-full text-left px-4 py-3 sm:py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 touch-manipulation"
                    >
                      Indstillinger
                    </button>
                    <div className="border-t my-1" />
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full text-left px-4 py-3 sm:py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 touch-manipulation"
                    >
                      {isLoggingOut ? 'Logger ud...' : 'Log ud'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {isMobileNavOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setIsMobileNavOpen(false)} />
          <div className="fixed top-14 left-0 right-0 bottom-16 bg-white z-40 md:hidden overflow-y-auto">
            {/* Mobile search */}
            <div className="p-3 border-b">
              <GlobalSearch />
            </div>
            <nav className="p-2">
              {mobileNavLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileNavOpen(false)}
                    className={`block px-4 py-3.5 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                      isActive
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-700 active:bg-gray-100'
                    }`}
                  >
                    {link.name}
                  </Link>
                )
              })}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
