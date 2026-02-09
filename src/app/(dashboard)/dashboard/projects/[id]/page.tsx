import { ProjectDetailClient } from './project-detail-client'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params

  return <ProjectDetailClient projectId={id} />
}
