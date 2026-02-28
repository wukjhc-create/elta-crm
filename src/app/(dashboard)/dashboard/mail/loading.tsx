export default function MailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mail</h1>
          <p className="text-gray-500">Indgående emails med auto-linking</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg p-3 bg-gray-100 animate-pulse h-16" />
        ))}
      </div>
      <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
        Indlæser emails...
      </div>
    </div>
  )
}
