import { Metadata } from 'next'
import { RoomCalculatorClient } from './room-calculator-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rum-kalkulator',
  description: 'Professionel rum-baseret el-kalkulation med automatisk tids- og materialeberegning',
}

export default function RoomCalculatorPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Rum-kalkulator</h1>
          <span className="text-xs font-medium uppercase tracking-wide bg-gray-100 text-gray-600 rounded px-2 py-0.5">
            Beregner / preview
          </span>
        </div>
        <p className="text-muted-foreground">
          Byg et komplet projekt rum for rum med automatisk tids-, materiale- og prisberegning
        </p>
      </div>
      {/* Tydelig markering: denne side persisterer intet (al state er lokal). Banner
          forhindrer at den forveksles med en gemt/gembar kalkulation (Model A). */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div>
          <span className="font-semibold">Beregner / preview — denne side gemmer ikke noget.</span>{' '}
          Tal og rum forsvinder når du forlader siden. Brug &quot;Konvertér til tilbud&quot; for at føre resultatet videre.
        </div>
      </div>
      <RoomCalculatorClient />
    </div>
  )
}
