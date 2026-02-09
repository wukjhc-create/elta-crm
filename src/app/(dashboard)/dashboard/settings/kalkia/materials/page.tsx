import { getMaterials } from '@/lib/actions/component-intelligence'
import { MaterialsCatalogClient } from './materials-catalog-client'

export const metadata = {
  title: 'Materialekatalog | Kalkia Indstillinger',
  description: 'Centraliseret materialehåndtering med prishistorik',
}

export const dynamic = 'force-dynamic'

export default async function MaterialsCatalogPage() {
  const result = await getMaterials({})

  return (
    <MaterialsCatalogClient
      initialMaterials={result.success && result.data ? result.data : []}
    />
  )
}
