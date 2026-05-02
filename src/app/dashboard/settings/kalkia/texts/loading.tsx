export default function TextsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-7 bg-gray-200 rounded w-40" />
        <div className="h-9 bg-gray-200 rounded w-28" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 bg-gray-200 rounded w-40" />
              <div className="h-6 bg-gray-100 rounded w-20" />
            </div>
            <div className="h-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
