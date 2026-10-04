import type { Metadata } from 'next'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { TimeApprovalClient } from './time-approval-client'

export const metadata: Metadata = {
  title: 'Godkend timer',
  description: 'Godkendelse af montørernes registrerede timer',
}

export const dynamic = 'force-dynamic'

export default async function TimeApprovalPage() {
  const ctx = await getPageRoleContext()
  if (!ctx.has('time_logs.approve')) {
    return <NoAccess permission="time_logs.approve" />
  }
  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <TimeApprovalClient />
    </div>
  )
}
