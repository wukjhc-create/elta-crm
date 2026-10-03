import { Metadata } from 'next'
import { calculateSolarQuote, getSolarCalculatorData } from '@/lib/actions/solar-products'
import { getDefaultInputV2 } from '@/lib/utils/solar-calculator'
import { CalculatorPageClientV2 } from '@/components/modules/calculator/calculator-page-client-v2'
import { CalculatorPageClient } from '@/components/modules/calculator'
import { pageHasPermission } from '@/lib/auth/page-guard'

export const metadata: Metadata = {
  title: 'Solcelle Kalkulator',
  description: 'Beregn solcelleanlæg og besparelser',
}

export const dynamic = 'force-dynamic'

export default async function CalcPage() {
  // Try to load database-driven products and assumptions
  const result = await getSolarCalculatorData()
  // D51: interne kosttal (komponentkost, arbejdsløn, avance) kun for kostpris-roller
  const showInternal = await pageHasPermission('offers.view.cost_prices')

  // V2 kræver mindst ét aktivt produkt af hver type — tomt katalog → standardberegneren (ellers tom V2 + konsolfejl)
  const p = result.success ? result.data?.products : undefined
  const catalogReady = !!p && p.panels.length > 0 && p.inverters.length > 0 && p.mountings.length > 0 && p.batteries.length > 0
  if (result.success && result.data && catalogReady) {
    // D48/D51: uden kostadgang beregnes startresultatet server-side (klienten får ingen kostpriser)
    const serverInitial = showInternal ? null : await calculateSolarQuote(getDefaultInputV2(result.data.products))
    return (
      <CalculatorPageClientV2
        products={result.data.products}
        assumptions={result.data.assumptions}
        showInternal={showInternal}
        serverInitialResults={serverInitial?.success ? serverInitial.data ?? null : null}
      />
    )
  }

  // Fallback to legacy calculator if database is not set up
  return <CalculatorPageClient showInternal={showInternal} />
}
