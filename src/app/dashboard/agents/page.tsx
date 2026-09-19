import { getAgentInbox } from '@/lib/actions/agent-inbox'
import { AgentInboxClient } from './agent-inbox-client'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const res = await getAgentInbox()

  if (!res.success) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-900">Agent Inbox</h1>
        <p className="mt-4 text-sm text-red-600">{res.error}</p>
      </div>
    )
  }

  return <AgentInboxClient items={res.data ?? []} />
}
