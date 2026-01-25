import Link from 'next/link'
import { cn } from '@/lib/utils'

interface LeadsPipelineProps {
  data: {
    new: number
    contacted: number
    qualified: number
    proposal: number
    negotiation: number
    won: number
    lost: number
  }
  conversionRate: number
}

const STAGES = [
  { key: 'new', label: 'Ny', color: 'bg-gray-500' },
  { key: 'contacted', label: 'Kontaktet', color: 'bg-blue-500' },
  { key: 'qualified', label: 'Kvalificeret', color: 'bg-cyan-500' },
  { key: 'proposal', label: 'Tilbud', color: 'bg-purple-500' },
  { key: 'negotiation', label: 'Forhandling', color: 'bg-orange-500' },
  { key: 'won', label: 'Vundet', color: 'bg-green-500' },
  { key: 'lost', label: 'Tabt', color: 'bg-red-500' },
] as const

export function LeadsPipeline({ data, conversionRate }: LeadsPipelineProps) {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0)
  const maxValue = Math.max(...Object.values(data), 1)

  // Calculate active leads (excluding won/lost)
  const activeLeads = data.new + data.contacted + data.qualified + data.proposal + data.negotiation

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-muted-foreground">Aktive leads: </span>
          <span className="font-medium">{activeLeads}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Konverteringsrate: </span>
          <span className={cn(
            'font-medium',
            conversionRate >= 30 ? 'text-green-600' : conversionRate >= 15 ? 'text-yellow-600' : 'text-red-600'
          )}>
            {conversionRate}%
          </span>
        </div>
      </div>

      {/* Pipeline bars */}
      <div className="space-y-3">
        {STAGES.map((stage) => {
          const value = data[stage.key as keyof typeof data]
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0
          const barWidth = (value / maxValue) * 100

          return (
            <Link
              key={stage.key}
              href={`/dashboard/leads?status=${stage.key}`}
              className="block group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {stage.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {value} ({percentage}%)
                </span>
              </div>
              <div className="h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500 group-hover:opacity-80',
                    stage.color
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </Link>
          )
        })}
      </div>

      {/* View all link */}
      <div className="pt-2 text-center">
        <Link
          href="/dashboard/leads"
          className="text-sm text-primary hover:underline"
        >
          Se alle leads →
        </Link>
      </div>
    </div>
  )
}
