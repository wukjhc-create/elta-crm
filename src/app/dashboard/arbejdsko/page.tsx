import type { Metadata } from 'next'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { coordinatorEnabled } from '@/lib/coordinator/feature-flag'
import { WorkQueueClient } from './work-queue-client'

export const metadata: Metadata = { title: 'Arbejdskø' }
export const dynamic = 'force-dynamic'

/**
 * C7 — samlet arbejdskø (flag COORDINATOR_ENABLED). Én række pr. henvendelse (mail + Stage A-henvendelse), forslag med
 * begrundelse, godkend/ændr/afvis og afslut ét sted. Data hentes i klienten via listWorkQueueAction (RLS-scope).
 */
export default async function WorkQueuePage() {
  if (!coordinatorEnabled()) return <NoAccess message="Arbejdskøen er ikke slået til i dette miljø." />
  const perms = await getPageRoleContext()
  if (!perms.has('inbox.view')) return <NoAccess permission="inbox.view" />
  return <WorkQueueClient canAssign={perms.has('conversations.manage')} />
}
