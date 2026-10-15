import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTeamMembers, getTeamInvitations } from '@/lib/actions/settings'
import { getUserActivityList } from '@/lib/actions/user-activity'
import { getUser } from '@/lib/supabase/server'
import { TeamSettingsClient } from './team-settings-client'
import { UserActivityPanel } from './user-activity-panel'

export const metadata: Metadata = {
  title: 'Brugerstyring | Indstillinger',
  description: 'Administrer brugere, roller og rettigheder',
}

export const dynamic = 'force-dynamic'

export default async function TeamSettingsPage() {
  const [result, invitationsResult, activityResult, user] = await Promise.all([
    getTeamMembers(),
    getTeamInvitations(),
    getUserActivityList(),
    getUser(),
  ])

  if (!result.success || !result.data || !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/settings"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Brugerstyring</h1>
            <p className="text-gray-600 mt-1">Administrer brugere, roller og rettigheder</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-12 text-center">
          <p className="text-red-500">{result.error || 'Kunne ikke hente teammedlemmer'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Brugerstyring</h1>
          <p className="text-gray-600 mt-1">Administrer brugere, roller og rettigheder</p>
        </div>
      </div>

      {!invitationsResult.success && (
        <p className="text-sm text-red-700" data-testid="team-invites-load-error">
          {invitationsResult.error ?? 'Kunne ikke hente invitationer'}. Det tælles ikke som ingen invitationer.
        </p>
      )}

      <TeamSettingsClient
        members={result.data}
        invitations={invitationsResult.success && invitationsResult.data ? invitationsResult.data : []}
        currentUserId={user.id}
      />

      {activityResult.success && activityResult.data && (
        <UserActivityPanel users={activityResult.data} />
      )}
      {!activityResult.success && (
        <p className="text-sm text-red-700" data-testid="team-activity-load-error">
          {activityResult.error ?? 'Kunne ikke hente aktivitet'}. Det tælles ikke som ingen aktivitet.
        </p>
      )}
    </div>
  )
}
