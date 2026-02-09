export default function LeadDetailLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 bg-gray-200 rounded w-56" />
          <div className="h-4 bg-gray-200 rounded w-36" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 bg-gray-200 rounded w-24" />
          <div className="h-9 bg-gray-200 rounded w-32" />
        </div>
      </div>

      {/* Status + info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-4 bg-gray-200 rounded w-36" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="space-y-1 flex-1">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
