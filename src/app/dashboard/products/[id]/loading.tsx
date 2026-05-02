export default function ProductDetailLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-7 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>
      </div>

      {/* Product info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-9 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-9 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
