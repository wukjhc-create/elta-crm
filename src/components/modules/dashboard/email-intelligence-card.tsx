import { getTodaysIntelligenceCounts } from '@/lib/actions/email-intelligence'

export async function EmailIntelligenceCard() {
  const counts = await getTodaysIntelligenceCounts()

  const items = [
    { label: 'Oprettede kunder', value: counts.customers_created, color: 'text-green-600' },
    { label: 'Matchede kunder', value: counts.customers_matched, color: 'text-blue-600' },
    { label: 'Sprunget over', value: counts.skipped, color: 'text-amber-600' },
    { label: 'Nyhedsbreve ignoreret', value: counts.newsletters_ignored, color: 'text-muted-foreground' },
  ]

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">E-mail intelligens (i dag)</h3>
        <span className="text-xs text-muted-foreground">Auto-AI</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{it.label}</span>
            <span className={`text-2xl font-bold ${it.color}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
