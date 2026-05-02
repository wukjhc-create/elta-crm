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
    notFound()
  }

  return <ProjectDetailClient projectId={id} />
}
