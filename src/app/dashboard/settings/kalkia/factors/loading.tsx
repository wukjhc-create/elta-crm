export default function FactorsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-7 bg-gray-200 rounded w-48" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex gap-4">
          <div className="h-9 bg-gray-100 rounded flex-1" />
          <div className="h-9 bg-gray-200 rounded w-32" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 border-b flex justify-between items-center">
            <div className="h-4 bg-gray-200 rounded w-40" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
