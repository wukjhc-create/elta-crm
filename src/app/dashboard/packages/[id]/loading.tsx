export default function PackageDetailLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-7 bg-gray-200 rounded w-52" />
            <div className="h-4 bg-gray-200 rounded w-28" />
          </div>
        </div>
        <div className="h-9 bg-gray-200 rounded w-28" />
      </div>

      {/* Package info + items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="h-5 bg-gray-200 rounded w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-9 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 bg-white rounded-lg border p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-9 bg-gray-200 rounded w-28" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded">
              <div className="h-4 bg-gray-200 rounded w-48 flex-1" />
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
