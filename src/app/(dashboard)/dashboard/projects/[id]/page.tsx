import { ProjectDetailClient } from './project-detail-client'

interface ProjectPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params

  return <ProjectDetailClient projectId={id} />
}
