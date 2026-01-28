import { Loader2 } from 'lucide-react'

export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        <div className="h-10 w-28 bg-muted animate-pulse rounded" />
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-56 bg-muted animate-pulse rounded" />
                <div className="h-3 w-40 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-6 w-24 bg-muted animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
