import { Metadata } from 'next'
import { RoomCalculatorClient } from './room-calculator-client'

export const metadata: Metadata = {
  title: 'Rum-kalkulator',
  description: 'Professionel rum-baseret el-kalkulation med automatisk tids- og materialeberegning',
}

export default function RoomCalculatorPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Rum-kalkulator</h1>
        <p className="text-muted-foreground">
          Byg et komplet projekt rum for rum med automatisk tids-, materiale- og prisberegning
        </p>
      </div>
      <RoomCalculatorClient />
    </div>
  )
}
