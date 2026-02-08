import { Metadata } from 'next'
import { PricingDashboardClient } from './pricing-client'

export const metadata: Metadata = {
  title: 'Prisovervågning | ELTA CRM',
  description: 'Overvåg prisændringer, påvirkede tilbud og leverandørtendenser',
}

export default function PricingDashboardPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Prisovervågning</h1>
        <p className="text-muted-foreground">
          Spor prisændringer, identificer påvirkede tilbud og overvåg leverandørtendenser
        </p>
      </div>
      <PricingDashboardClient />
    </div>
  )
}
