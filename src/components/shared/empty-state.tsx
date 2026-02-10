import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  filtered?: boolean
  onClearFilters?: () => void
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  filtered,
  onClearFilters,
}: EmptyStateProps) {
  return (
    <div className="bg-white rounded-lg border p-12 text-center">
      <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 mb-4">{description}</p>

      <div className="flex items-center justify-center gap-3">
        {filtered && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Ryd filtre
          </button>
        )}
        {actionLabel && onAction && !filtered && (
          <button
            onClick={onAction}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
