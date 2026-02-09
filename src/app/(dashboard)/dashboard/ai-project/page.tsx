import { Metadata } from 'next'
import { AIProjectClient } from './ai-project-client'

export const metadata: Metadata = {
  title: 'AI Projektanalyse',
  description: 'Intelligent projektanalyse og tilbudsgenerering',
}

export default function AIProjectPage() {
  return <AIProjectClient />
}
