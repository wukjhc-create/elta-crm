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
    notFound()
  }

  // Get variant materials for each variant
  const variantMaterialsMap: Record<string, Awaited<ReturnType<typeof getVariantMaterials>>['data']> = {}
  for (const variant of result.data.variants) {
    const vmResult = await getVariantMaterials(variant.id)
    if (vmResult.success && vmResult.data) {
      variantMaterialsMap[variant.id] = vmResult.data
    }
  }

  return (
    <ComponentDetailClient
      component={result.data}
      variantMaterialsMap={variantMaterialsMap}
    />
  )
}
