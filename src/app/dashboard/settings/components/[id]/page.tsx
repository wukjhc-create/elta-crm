import { getComponentWithDetails, getVariantMaterials } from '@/lib/actions/components'
import { notFound } from 'next/navigation'
import ComponentDetailClient from './component-detail-client'

export const metadata = {
  title: 'Rediger Komponent',
  description: 'Rediger komponent, varianter og materialer',
}

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ComponentDetailPage({ params }: Props) {
  const { id } = await params
  const result = await getComponentWithDetails(id)

  if (!result.success || !result.data) {
    if (!result.success && result.error && result.error !== 'Komponenten blev ikke fundet') {
      return (
        <div className="p-6">
          <p className="text-sm text-red-700" data-testid="component-detail-load-error">
            {result.error}. Det tælles ikke som at komponenten mangler.
          </p>
        </div>
      )
    }
    notFound()
  }

  // Get variant materials for each variant
  const variantMaterialsMap: Record<string, Awaited<ReturnType<typeof getVariantMaterials>>['data']> = {}
  const variantMaterialErrors: Record<string, string> = {}
  for (const variant of result.data.variants) {
    const vmResult = await getVariantMaterials(variant.id)
    if (vmResult.success) {
      variantMaterialsMap[variant.id] = vmResult.data ?? []
    } else {
      variantMaterialErrors[variant.id] = vmResult.error || 'Kunne ikke hente variant-materialer'
    }
  }

  return (
    <ComponentDetailClient
      component={result.data}
      variantMaterialsMap={variantMaterialsMap}
      variantMaterialErrors={variantMaterialErrors}
    />
  )
}
