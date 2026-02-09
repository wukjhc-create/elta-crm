export default function SupplierDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-7 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-200 rounded w-32" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-200 rounded w-24 flex-shrink-0" />
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 bg-gray-200 rounded w-28" />
            <div className="h-10 bg-gray-100 rounded" />
          </div>
        ))}
        <div className="h-10 bg-gray-200 rounded w-32 mt-4" />
      </div>
    </div>
  )
}
