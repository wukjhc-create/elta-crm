import { notFound } from 'next/navigation'
import { getProject } from '@/lib/actions/projects'
import { ProjectDetailClient } from './project-detail-client'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params

  const result = await getProject(id)
  if (!result.success || !result.data) {
    if (!result.success && result.error && result.error !== 'Projektet blev ikke fundet') {
      return (
        <div className="p-6">
          <p className="text-sm text-red-700" data-testid="project-detail-load-error">
            {result.error}. Det tælles ikke som at projektet mangler.
          </p>
        </div>
      )
    }
    notFound()
  }

  return <ProjectDetailClient projectId={id} />
}
