import { getAgentInbox } from '@/lib/actions/agent-inbox'
import { AgentInboxClient } from './agent-inbox-client'
import { isLiveSendEnabled } from '@/lib/agents/live-gates'
import { getUserRoleForPage } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  // Layout-guarden og siden renderes parallelt: uden dette tjek koerte getAgentInbox() alligevel for
  // ikke-admins og loggede en serverfejl ved hvert besoeg (fundet af harness:ui-e2e U5).
  if ((await getUserRoleForPage()) !== 'admin') return <NoAccess permission="admin" />
  const res = await getAgentInbox()

  if (!res.success) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-900">Agent Inbox</h1>
        <p className="mt-4 text-sm text-red-600">{res.error}</p>
      </div>
    )
  }

  return <AgentInboxClient items={res.data ?? []} liveSendEnabled={isLiveSendEnabled()} />
}
