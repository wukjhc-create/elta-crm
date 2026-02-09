export default function CalculationDetailLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-7 bg-gray-200 rounded w-52" />
          <div className="h-4 bg-gray-200 rounded w-36" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-6 bg-gray-200 rounded w-28" />
          </div>
        ))}
      </div>

      {/* Calculation table skeleton */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex justify-between items-center">
          <div className="h-5 bg-gray-200 rounded w-36" />
          <div className="h-9 bg-gray-200 rounded w-28" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 border-b flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-56 flex-1" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-20" />
          </div>
        ))}
        <div className="p-4 flex justify-end gap-6">
          <div className="h-5 bg-gray-200 rounded w-24" />
          <div className="h-5 bg-gray-200 rounded w-28" />
        </div>
      </div>
    </div>
  )
}
