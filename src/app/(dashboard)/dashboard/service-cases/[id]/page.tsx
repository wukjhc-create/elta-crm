import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceCase, getServiceCaseAttachments } from '@/lib/actions/service-cases'
import { getUser } from '@/lib/supabase/server'
import { ServiceCaseDetailClient } from './service-case-detail-client'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await getServiceCase(id)
  return {
    title: result.success && result.data
      ? `${result.data.case_number} — ${result.data.title}`
      : 'Serviceopgave',
  }
}

export default async function ServiceCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [caseResult, attachmentsResult, user] = await Promise.all([
    getServiceCase(id),
    getServiceCaseAttachments(id),
    getUser(),
  ])

  if (!caseResult.success || !caseResult.data || !user) {
    notFound()
  }

  return (
    <ServiceCaseDetailClient
      serviceCase={caseResult.data}
      attachments={attachmentsResult.success && attachmentsResult.data ? attachmentsResult.data : []}
      currentUserId={user.id}
    />
  )
}
