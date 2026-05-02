export default function MaterialsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-7 bg-gray-200 rounded w-40" />
        <div className="h-9 bg-gray-200 rounded w-36" />
      </div>
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <div className="h-9 bg-gray-100 rounded w-full max-w-sm" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="p-4 border-b flex justify-between items-center">
            <div className="h-4 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
