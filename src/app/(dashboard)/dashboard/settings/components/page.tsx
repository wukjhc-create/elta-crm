import { getComponents, getComponentCategories } from '@/lib/actions/components'
import ComponentsClient from './components-client'

export const metadata = {
  title: 'Komponenter | ELTA CRM',
  description: 'Administrer el-komponenter til kalkulationer',
}

export default async function ComponentsPage() {
  const [componentsResult, categoriesResult] = await Promise.all([
    getComponents(),
    getComponentCategories(),
  ])

  return (
    <ComponentsClient
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
    />
  )
}
