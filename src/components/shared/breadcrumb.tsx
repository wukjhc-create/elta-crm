import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Brødkrumme" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-500 mb-4">
      <Link
        href="/dashboard"
        className="hover:text-gray-900 transition-colors flex items-center"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>

      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0 max-w-full">
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900 transition-colors break-words">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium break-words">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
