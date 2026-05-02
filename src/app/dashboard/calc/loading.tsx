export default function CalcLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-64" />
      <div className="h-4 bg-gray-200 rounded w-80" />

      {/* Calculator form skeleton */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-10 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="h-10 bg-gray-200 rounded w-40 mt-4" />
      </div>

      {/* Results skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="h-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
