export default function ReportsLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-4 w-64 bg-gray-200 rounded mt-2" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-7 w-28 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6 h-80" />
        <div className="bg-white rounded-lg border p-6 h-80" />
      </div>

      {/* Table area */}
      <div className="bg-white rounded-lg border p-6 h-64" />
    </div>
  )
}
