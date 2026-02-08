import { Metadata } from 'next'
import { ProfitSimulatorClient } from './profit-simulator-client'

export const metadata: Metadata = {
  title: 'Profit Simulator | ELTA CRM',
  description: 'Simuler profitabilitet med forskellige marginer og rabatter',
}

export default function ProfitSimulatorPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profit Simulator</h1>
        <p className="text-muted-foreground">
          Beregn og sammenlign profit-scenarier med forskellige marginer, rabatter og timesatser
        </p>
      </div>
      <ProfitSimulatorClient />
    </div>
  )
}
