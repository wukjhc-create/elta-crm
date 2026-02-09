export default function SecurityLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-muted animate-pulse rounded-full" />
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-56 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Password section */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
          </div>
        ))}
        <div className="h-10 w-40 bg-muted animate-pulse rounded" />
      </div>

      {/* Sessions section */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="h-6 w-28 bg-muted animate-pulse rounded" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    </div>
  )
}
