import { Metadata } from 'next'
import { getSolarCalculatorData } from '@/lib/actions/solar-products'
import { CalculatorPageClientV2 } from '@/components/modules/calculator/calculator-page-client-v2'
import { CalculatorPageClient } from '@/components/modules/calculator'

export const metadata: Metadata = {
  title: 'Solcelle Kalkulator',
  description: 'Beregn solcelleanlæg og besparelser',
}

export const dynamic = 'force-dynamic'

export default async function CalcPage() {
  // Try to load database-driven products and assumptions
  const result = await getSolarCalculatorData()

  // If database data is available, use V2 calculator
  if (result.success && result.data) {
    return (
      <CalculatorPageClientV2
        products={result.data.products}
        assumptions={result.data.assumptions}
      />
    )
  }

  // Fallback to legacy calculator if database is not set up
  console.warn('Solar products not found in database, falling back to legacy calculator')
  return <CalculatorPageClient />
}
