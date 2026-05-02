export default function SupplierProductsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 bg-gray-200 rounded" />
        <div className="h-7 bg-gray-200 rounded w-48" />
      </div>

      {/* Search + filters */}
      <div className="flex gap-4">
        <div className="h-10 bg-gray-100 rounded flex-1 max-w-sm" />
        <div className="h-10 bg-gray-200 rounded w-32" />
      </div>

      {/* Products table */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-28" />
          <div className="h-4 bg-gray-200 rounded w-20" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="p-4 border-b flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-48 flex-1" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
