export default function NodesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-7 bg-gray-200 rounded w-36" />
        <div className="h-9 bg-gray-200 rounded w-28" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="flex gap-2">
              <div className="h-6 bg-gray-100 rounded w-16" />
              <div className="h-6 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
