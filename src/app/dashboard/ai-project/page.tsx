import { Metadata } from 'next'
import { AIProjectClient } from './ai-project-client'
import { isEltaComponentsEnabled } from '@/lib/ai/elta-components'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AI Projektanalyse',
  description: 'Intelligent projektanalyse og tilbudsgenerering',
}

export default function AIProjectPage() {
  // S2: ladestander-vælgeren vises kun når ELTA-komponenterne er slået til (flaget er FRA i prod)
  return <AIProjectClient eltaComponents={isEltaComponentsEnabled()} />
}
