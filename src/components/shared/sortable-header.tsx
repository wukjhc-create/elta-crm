'use client'

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface SortableHeaderProps {
  label: string
  column: string
  currentSort?: string
  currentOrder?: 'asc' | 'desc'
  onSort: (column: string) => void
  className?: string
}

export function SortableHeader({
  label,
  column,
  currentSort,
  currentOrder,
  onSort,
  className = '',
}: SortableHeaderProps) {
  const isActive = currentSort === column

  return (
    <th
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className="flex-shrink-0">
          {isActive ? (
            currentOrder === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5 text-primary" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-primary" />
            )
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
          )}
        </span>
      </div>
    </th>
  )
}
