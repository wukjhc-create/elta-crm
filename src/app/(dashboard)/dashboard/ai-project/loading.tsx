export default function AIProjectLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-64" />
      <div className="h-4 bg-gray-200 rounded w-96" />

      {/* Input area skeleton */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="h-5 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-100 rounded" />
        <div className="h-10 bg-gray-200 rounded w-40" />
      </div>

      {/* Results skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-8 bg-gray-200 rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
