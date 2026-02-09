export default function SupplierImportLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 bg-gray-200 rounded" />
        <div className="h-7 bg-gray-200 rounded w-52" />
      </div>

      {/* Import config */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="h-5 bg-gray-200 rounded w-36" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-10 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Import history */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <div className="h-5 bg-gray-200 rounded w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 border-b flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
