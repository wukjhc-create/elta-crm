export default function SmsSettingsLoading() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-44 bg-muted animate-pulse rounded" />
        <div className="h-4 w-80 bg-muted animate-pulse rounded" />
      </div>

      <div className="space-y-6">
        {/* API settings card */}
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="h-6 w-36 bg-muted animate-pulse rounded" />
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
