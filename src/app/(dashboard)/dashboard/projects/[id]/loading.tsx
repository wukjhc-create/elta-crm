export default function ProjectDetailLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-7 bg-gray-200 rounded w-56" />
            <div className="h-4 bg-gray-200 rounded w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 bg-gray-200 rounded w-28" />
          <div className="h-9 bg-gray-200 rounded w-24" />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-6 bg-gray-200 rounded w-28" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded w-24" />
        ))}
      </div>

      {/* Tasks list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="h-5 w-5 bg-gray-200 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-gray-200 rounded w-64" />
              <div className="h-3 bg-gray-200 rounded w-32" />
            </div>
            <div className="h-6 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
