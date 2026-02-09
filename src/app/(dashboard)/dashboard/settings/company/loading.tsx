export default function CompanySettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-muted animate-pulse rounded-full" />
        <div className="space-y-2">
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Form skeleton */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
          </div>
        ))}
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
      </div>
    </div>
  )
}
