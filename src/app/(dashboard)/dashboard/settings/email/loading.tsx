import { Loader2 } from 'lucide-react'

export default function EmailSettingsLoading() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-80 bg-muted animate-pulse rounded" />
      </div>

      <div className="space-y-6">
        {/* SMTP settings card skeleton */}
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Templates skeleton */}
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
