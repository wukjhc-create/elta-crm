import type { Metadata } from 'next'
import ReportsClient from './reports-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rapporter | ELTA Drift',
  description: 'Omsætning, projekt-rentabilitet og team-produktivitet',
}

export default function ReportsPage() {
  return <ReportsClient />
}
