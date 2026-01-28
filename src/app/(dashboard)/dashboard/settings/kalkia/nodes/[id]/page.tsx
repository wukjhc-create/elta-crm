import { notFound } from 'next/navigation'
import { getKalkiaNode } from '@/lib/actions/kalkia'
import { getComponentCategories } from '@/lib/actions/components'
import KalkiaNodeDetailClient from './kalkia-node-detail-client'

export const metadata = {
  title: 'Node Detaljer | ELTA CRM',
  description: 'Se og rediger Kalkia node',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function KalkiaNodeDetailPage({ params }: PageProps) {
  const { id } = await params

  const [nodeResult, categoriesResult] = await Promise.all([
    getKalkiaNode(id),
    getComponentCategories(),
  ])

  if (!nodeResult.success || !nodeResult.data) {
    notFound()
  }

  return (
    <KalkiaNodeDetailClient
      node={nodeResult.data}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
    />
  )
}
