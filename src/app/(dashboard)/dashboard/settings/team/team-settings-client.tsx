'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { updateTeamMember, type Profile } from '@/lib/actions/settings'
import {
  User,
  Shield,
  ShieldCheck,
  Building2,
  MoreVertical,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'

interface TeamSettingsClientProps {
  members: Profile[]
  currentUserId: string
}

const ROLES = [
  { value: 'user', label: 'Bruger', icon: User },
  { value: 'manager', label: 'Manager', icon: Shield },
  { value: 'admin', label: 'Administrator', icon: ShieldCheck },
]

export function TeamSettingsClient({ members, currentUserId }: TeamSettingsClientProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const [editingMember, setEditingMember] = useState<string | null>(null)
  const [membersList, setMembersList] = useState(members)

  const currentUser = membersList.find(m => m.id === currentUserId)
  const isAdmin = currentUser?.role === 'admin'

  const handleRoleChange = (memberId: string, newRole: string) => {
    if (!isAdmin || memberId === currentUserId) return

    startTransition(async () => {
      const result = await updateTeamMember(memberId, { role: newRole })

      if (result.success && result.data) {
        setMembersList(prev =>
          prev.map(m => (m.id === memberId ? result.data! : m))
        )
        toast.success('Rolle opdateret')
      } else {
        toast.error(result.error || 'Kunne ikke opdatere rolle')
      }
    })
    setEditingMember(null)
  }

  const handleToggleActive = (memberId: string, currentActive: boolean) => {
    if (!isAdmin || memberId === currentUserId) return

    startTransition(async () => {
      const result = await updateTeamMember(memberId, { is_active: !currentActive })

      if (result.success && result.data) {
        setMembersList(prev =>
          prev.map(m => (m.id === memberId ? result.data! : m))
        )
        toast.success(currentActive ? 'Bruger deaktiveret' : 'Bruger aktiveret')
      } else {
        toast.error(result.error || 'Kunne ikke opdatere status')
      }
    })
  }

  const getRoleIcon = (role: string) => {
    const roleConfig = ROLES.find(r => r.value === role)
    if (!roleConfig) return User
    return roleConfig.icon
  }

  const getRoleLabel = (role: string) => {
    const roleConfig = ROLES.find(r => r.value === role)
    return roleConfig?.label || role
  }

  return (
    <div className="space-y-6">
      {/* Team stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{membersList.length}</div>
          <div className="text-sm text-gray-500">Teammedlemmer</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">
            {membersList.filter(m => m.is_active).length}
          </div>
          <div className="text-sm text-gray-500">Aktive</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">
            {membersList.filter(m => m.role === 'admin').length}
          </div>
          <div className="text-sm text-gray-500">Administratorer</div>
        </div>
      </div>

      {/* Team members list */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Teammedlemmer</h3>
          {!isAdmin && (
            <p className="text-sm text-gray-500 mt-1">
              Du skal være administrator for at ændre teammedlemmer
            </p>
          )}
        </div>

        <div className="divide-y">
          {membersList.map(member => {
            const RoleIcon = getRoleIcon(member.role)
            const isCurrentUser = member.id === currentUserId

            return (
              <div
                key={member.id}
                className={`p-4 flex items-center gap-4 ${
                  !member.is_active ? 'bg-gray-50 opacity-75' : ''
                }`}
              >
                {/* Avatar */}
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.full_name || 'Bruger'}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-blue-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {member.full_name || 'Ikke angivet'}
                    </span>
                    {isCurrentUser && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        Dig
                      </span>
                    )}
                    {!member.is_active && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{member.email}</div>
                  {member.department && (
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3" />
                      {member.department}
                    </div>
                  )}
                </div>

                {/* Role */}
                <div className="relative">
                  {editingMember === member.id && isAdmin && !isCurrentUser ? (
                    <div className="absolute right-0 top-0 z-10 bg-white border rounded-lg shadow-lg py-1 min-w-[160px]">
                      {ROLES.map(role => {
                        const Icon = role.icon
                        return (
                          <button
                            key={role.value}
                            onClick={() => handleRoleChange(member.id, role.value)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                            disabled={isPending}
                          >
                            <Icon className="w-4 h-4" />
                            {role.label}
                            {member.role === role.value && (
                              <CheckCircle className="w-4 h-4 ml-auto text-green-600" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  <button
                    onClick={() => setEditingMember(editingMember === member.id ? null : member.id)}
                    disabled={!isAdmin || isCurrentUser}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                      isAdmin && !isCurrentUser
                        ? 'hover:bg-gray-100 cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <RoleIcon className="w-4 h-4 text-gray-600" />
                    <span className="text-sm">{getRoleLabel(member.role)}</span>
                  </button>
                </div>

                {/* Actions */}
                {isAdmin && !isCurrentUser && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(member.id, member.is_active)}
                    disabled={isPending}
                    className={member.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : member.is_active ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Invite section - placeholder */}
      <div className="bg-white rounded-lg border p-6">
        <h4 className="font-semibold text-gray-900 mb-2">Inviter nyt teammedlem</h4>
        <p className="text-sm text-gray-500 mb-4">
          Invitation af nye teammedlemmer kræver Supabase Admin API og er under udvikling.
        </p>
        <Button disabled variant="outline">
          Kommer snart
        </Button>
      </div>
    </div>
  )
}
