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
    <nav aria-label="Brødkrumme" className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
      <Link
        href="/dashboard"
        className="hover:text-gray-900 transition-colors flex items-center"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>

      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
