import { Metadata } from 'next'
import { Suspense } from 'react'
import { ProjectsPageClient } from '@/components/modules/projects/projects-page-client'

export const metadata: Metadata = {
  title: 'Projekter',
  description: 'Administrer projekter, opgaver og tidsregistrering',
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Projekter</h1>
              <p className="text-muted-foreground">
                Administrer projekter, opgaver og tidsregistrering
              </p>
            </div>
          </div>
          <div className="bg-white border rounded-lg p-12 text-center text-muted-foreground">
            Indlæser projekter...
          </div>
        </div>
      }
    >
      <ProjectsPageClient />
    </Suspense>
  )
}
