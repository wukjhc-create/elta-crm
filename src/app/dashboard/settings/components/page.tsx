import { getComponents, getComponentCategories } from '@/lib/actions/components'
import ComponentsClient from './components-client'

export const metadata = {
  title: 'Komponenter',
  description: 'Administrer el-komponenter til kalkulationer',
}

export const dynamic = 'force-dynamic'

export default async function ComponentsPage() {
  const [componentsResult, categoriesResult] = await Promise.all([
    getComponents(),
    getComponentCategories(),
  ])

  return (
    <ComponentsClient
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      loadError={componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
      categoriesError={categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'}
    />
  )
}
