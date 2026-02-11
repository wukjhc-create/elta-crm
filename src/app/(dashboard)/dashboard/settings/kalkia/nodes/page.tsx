import { getKalkiaNodes } from '@/lib/actions/kalkia-nodes'
import { getComponentCategories } from '@/lib/actions/components'
import KalkiaNodesClient from './kalkia-nodes-client'

export const metadata = {
  title: 'Kalkia Noder',
  description: 'Administrer hierarkisk komponenttrae',
}

export const dynamic = 'force-dynamic'

export default async function KalkiaNodesPage() {
  const [nodesResult, categoriesResult] = await Promise.all([
    getKalkiaNodes(),
    getComponentCategories(),
  ])

  return (
    <KalkiaNodesClient
      nodes={nodesResult.success && nodesResult.data ? nodesResult.data : []}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
    />
  )
}
