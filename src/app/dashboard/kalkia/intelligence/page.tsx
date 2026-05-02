import { Metadata } from 'next'
import { IntelligenceDemoClient } from './intelligence-demo-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI Intelligence Demo | Kalkia',
  description: 'Demonstration af AI-assisterede projekt- og tilbudsfunktioner',
}

export default function IntelligenceDemoPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">AI Intelligence Demo</h1>
        <p className="text-muted-foreground">
          Test de nye AI-assisterede funktioner til projektanalyse, risikovurdering og prisforklaring
        </p>
      </div>
      <IntelligenceDemoClient />
    </div>
  )
}
